import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { Scene } from "@babylonjs/core/scene";
import { loadSceneAsset } from "./scene-assets.js";

// 원본의 고정 빈 부지와 솟아오르는 애니메이션 대신 현재 공사 상태와 크기를 따른다.
export const HOME_BUILD_SCALE = 0.9;
export const TOWN_BUILD_SCALE = 1.15;
type Stage = 1 | 2 | 3;
export function createBuildStageVisual(
  scene: Scene,
  parent: TransformNode,
  name: string,
  scale: number,
  fallback: (show: boolean) => void,
  /** 부모가 땅보다 떠 있을 때(시설 공사 터 판은 0.05m 위) 모델을 땅에 붙이는 값 */
  offsetY = 0,
) {
  let disposed = false;
  let current: Stage = 1;
  let initialized = false;
  const parts = new Map<Stage, TransformNode>();
  const materials: StandardMaterial[] = [];
  // 눈 먼지는 단계가 실제로 바뀔 때 처음 만든다(화면 없는 단위 검사 환경에는 캔버스가 없다).
  let dust: ParticleSystem | null = null;
  let dot: DynamicTexture | null = null;
  const ensureDust = () => {
    if (dust) return dust;
    try {
      dot = new DynamicTexture(`${name}:dust-dot`, 32, scene, false);
      const context = dot.getContext() as CanvasRenderingContext2D;
      const gradient = context.createRadialGradient(16, 16, 1, 16, 16, 16);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 32, 32);
      dot.hasAlpha = true;
      dot.update();
      dust = new ParticleSystem(`${name}:dust`, 160, scene);
      dust.particleTexture = dot;
      dust.emitter = Vector3.Zero();
      dust.minEmitBox = new Vector3(-2, 0, -1.5);
      dust.maxEmitBox = new Vector3(2, 1.2, 1.5);
      dust.emitRate = 0;
      dust.minSize = 0.9;
      dust.maxSize = 2.2;
      dust.minEmitPower = 0.6;
      dust.maxEmitPower = 2.2;
      dust.minLifeTime = 0.7;
      dust.maxLifeTime = 1.5;
      dust.gravity = new Vector3(0, 0.6, 0);
      dust.direction1 = new Vector3(-1.4, 0.3, -1.4);
      dust.direction2 = new Vector3(1.4, 1.2, 1.4);
      dust.color1 = new Color4(0.86, 0.9, 1, 0.75);
      dust.color2 = new Color4(0.78, 0.83, 0.95, 0.6);
      dust.colorDead = new Color4(0.86, 0.9, 1, 0);
      dust.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      dust.start();
      return dust;
    } catch {
      return null;
    }
  };
  const show = () => {
    for (const [stage, node] of parts) node.setEnabled(stage === current);
    fallback(!parts.has(current));
  };
  for (const stage of [1, 2, 3] as const) {
    void loadSceneAsset(scene, `/models/sites/SITE3_BUILD${stage}.glb`)
      .then((asset) => {
        if (disposed) return;
        const node = new TransformNode(`${name}:build-stage-${stage}`, scene);
        node.parent = parent;
        node.scaling.setAll(scale);
        node.position.y = offsetY;
        const material = new StandardMaterial(
          `${name}:build-stage-material-${stage}`,
          scene,
        );
        materials.push(material);
        const texture = new Texture(
          `/models/sites/SITE3_BUILD${stage}.jpg`,
          scene,
          false,
          false,
          undefined,
          undefined,
          () => {
            if (disposed) return;
            console.warn(`공사 단계 ${stage} 텍스처를 불러오지 못했습니다.`);
            parts.delete(stage);
            node.dispose();
            show();
          },
        );
        texture.anisotropicFilteringLevel = 4;
        material.diffuseTexture = texture;
        material.specularColor = Color3.Black();
        material.backFaceCulling = false;
        const inst = asset.instantiateModelsToScene(
          (n) => `${name}:build-stage-${stage}:${n}`,
          false,
          { doNotInstantiate: true },
        );
        for (const root of inst.rootNodes) root.parent = node;
        for (const mesh of node.getChildMeshes()) {
          mesh.isPickable = false;
          mesh.material = material;
        }
        parts.set(stage, node);
        show();
      })
      .catch((error) => {
        if (!disposed)
          console.warn(`공사 단계 ${stage} 모델을 불러오지 못했습니다.`, error);
      });
  }
  return {
    update(stage: Stage) {
      if (initialized && current !== stage) {
        parent.computeWorldMatrix(true);
        const puff = ensureDust();
        if (puff) {
          puff.emitter = parent.getAbsolutePosition().clone();
          puff.manualEmitCount = 46;
        }
      }
      current = stage;
      initialized = true;
      show();
    },
    dispose() {
      disposed = true;
      dust?.dispose();
      dot?.dispose();
      for (const node of parts.values()) node.dispose();
      for (const m of materials) m.dispose(true, true);
    },
  };
}
