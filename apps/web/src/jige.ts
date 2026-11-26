import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { loadSceneAsset } from "./scene-assets.js";

type JigeKind = "wood" | "plant" | "fish";
// 박찬님 원본은 공룡 모델 좌표 (0, 1.25, -0.34), 배율 1.1이다.
// 현재 부모는 지면에서 0.5m 올라온 월드 크기 주민 메시이므로 어깨 아래로 축소한다.
const JIGE_Y = 0.6;
const JIGE_Z = -0.18;
const JIGE_SCALE = 0.5;

export function wearJige(scene: Scene, kind: JigeKind, parent: TransformNode) {
  const rig = new TransformNode(`jige-${kind}`, scene);
  rig.parent = parent;
  rig.position.set(0, JIGE_Y, JIGE_Z);
  rig.scaling.setAll(JIGE_SCALE);
  let loadNode: TransformNode | undefined;
  let loaded = false;
  let disposed = false;
  let instance:
    | ReturnType<
        Awaited<ReturnType<typeof loadSceneAsset>>["instantiateModelsToScene"]
      >
    | undefined;
  void loadSceneAsset(scene, `/models/props/JIGE_${kind}.glb`)
    .then((asset) => {
      if (disposed) return;
      instance = asset.instantiateModelsToScene(
        (name) => `${rig.name}:${name}`,
        false,
      );
      for (const root of instance.rootNodes) root.parent = rig;
      for (const mesh of rig.getChildMeshes(false)) mesh.isPickable = false;
      loadNode = rig
        .getDescendants(false)
        .find((node) => node.name.endsWith("LOAD")) as
        | TransformNode
        | undefined;
      loadNode?.setEnabled(loaded);
    })
    .catch((error: unknown) => {
      if (!disposed)
        console.warn(`지게 모델을 불러오지 못했습니다: ${kind}`, error);
    });
  return {
    kind,
    rig,
    setLoaded(value: boolean) {
      loaded = value;
      loadNode?.setEnabled(value);
    },
    dispose() {
      disposed = true;
      instance?.dispose();
      rig.dispose();
    },
  };
}
