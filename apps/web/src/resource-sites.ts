// 자원 터 모델을 장면에 세움 (자리와 설명은 scout-sites.ts의 RESOURCE_SITES)
// 모델은 부품으로 깎고 재질을 그림 한 장으로 구운 입체 (tools/blender/site3d.py): <이름>.glb + <이름>.jpg
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Node } from "@babylonjs/core/node";
import type { Scene } from "@babylonjs/core/scene";
import { loadSceneAsset } from "./scene-assets.js";
import { RESOURCE_SITES } from "./scout-sites.js";
import { elevation } from "./world.js";

/** 블렌더 1 = 게임 1.5 — 1.1로는 적송 한 그루 폭이라 숲에 묻혔음 */
export const SITE_SCALE = 1.5;

export function createResourceSites(
  scene: Scene,
  root: TransformNode | null,
  onFail: () => void,
) {
  /** 누를 수 있는 터: 터 뿌리 노드 → 터 이름 */
  const owners = new Map<Node, string>();
  for (const site of RESOURCE_SITES)
    void loadSceneAsset(scene, `/models/sites/${site.file}.glb`)
      .then((asset) => {
        const node = new TransformNode(`site-${site.id}`, scene);
        node.parent = root;
        node.position.set(site.x, elevation(site.x, site.z), site.z);
        node.rotation.y = Math.PI; // 모델의 앞(트인 쪽)이 기본 시점의 카메라를 봄
        node.scaling.setAll(SITE_SCALE);
        owners.set(node, site.id);
        const inst = asset.instantiateModelsToScene(
          (n) => `site-${site.id}:${n}`,
          false,
        );
        for (const top of inst.rootNodes) top.parent = node;
        // 그림은 GLB에 넣지 않고 따로 읽음 — GLB 속 그림은 밝기 표현이 달라(sRGB 버퍼) 이 재질에서 어둡게 나옴
        const baked = new StandardMaterial(`site-${site.id}`, scene);
        const picture = new Texture(
          `/models/sites/${site.file}.jpg`,
          scene,
          false,
          false, // glTF의 그림 좌표는 위아래가 뒤집혀 있지 않음
        );
        picture.anisotropicFilteringLevel = 8;
        baked.diffuseTexture = picture;
        baked.specularColor = Color3.Black();
        baked.backFaceCulling = false; // 풀잎·짚 술은 한 겹짜리 면
        const base = elevation(site.x, site.z);
        const p = new Vector3();
        for (const mesh of node.getChildMeshes()) {
          mesh.isPickable = true;
          mesh.material = baked;
          // 눈밭이 비탈에 묻히거나 뜨지 않게, 꼭짓점마다 그 자리 땅 높이를 따라가게 함
          const at = mesh.getVerticesData(VertexBuffer.PositionKind);
          if (!at) continue;
          const toWorld = mesh.computeWorldMatrix(true);
          for (let i = 0; i < at.length; i += 3) {
            Vector3.TransformCoordinatesFromFloatsToRef(
              at[i] ?? 0,
              at[i + 1] ?? 0,
              at[i + 2] ?? 0,
              toWorld,
              p,
            );
            at[i + 1] =
              (at[i + 1] ?? 0) + (elevation(p.x, p.z) - base) / SITE_SCALE;
          }
          mesh.setVerticesData(VertexBuffer.PositionKind, at);
          mesh.refreshBoundingInfo({});
        }
      })
      .catch(onFail);
  return {
    /** 누른 조각이 어느 터인지 (터가 아니면 null) */
    idForMesh(mesh: Node | null): string | null {
      for (let n = mesh; n; n = n.parent) {
        const id = owners.get(n);
        if (id) return id;
      }
      return null;
    },
  };
}
