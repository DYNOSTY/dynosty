// 지게(블렌더 tools/blender/jige.py)를 공룡 등에 지움 — 마을 일꾼(village.ts)·벌목꾼(logging.ts)이 같이 씀
// 빈 지게는 늘 보이고, 짐(LOAD 노드)만 켜고 끔
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { MaterialLibrary } from "./materials.js";
import { loadSceneAsset } from "./scene-assets.js";

export type JigeLoad = "wood" | "plant" | "fish";

export function wearJige(
  scene: Scene,
  kind: JigeLoad,
  lib: MaterialLibrary,
  parent?: TransformNode,
) {
  const rig = new TransformNode(`jige-${kind}`, scene);
  rig.parent = parent ?? null;
  // 공룡 모델 단위: 등(가슴 높이) 뒤쪽
  rig.position.set(0, 1.25, -0.34);
  rig.scaling.setAll(1.1);
  let loadNode: TransformNode | null = null;
  let on = false;
  let disposed = false;
  let dispose = () => {
    disposed = true;
    rig.dispose();
  };
  void loadSceneAsset(scene, `/models/props/JIGE_${kind}.glb`).then((asset) => {
    if (disposed) return;
    const inst = asset.instantiateModelsToScene(
      (n) => `${rig.name}:${n}`,
      false,
    );
    for (const root of inst.rootNodes) root.parent = rig;
    for (const m of rig.getChildMeshes(false)) {
      m.isPickable = false;
      lib.dress(m.material);
    }
    loadNode =
      (rig.getDescendants(false).find((n) => n.name.endsWith("LOAD")) as
        | TransformNode
        | undefined) ?? null;
    loadNode?.setEnabled(on);
    dispose = () => {
      inst.dispose();
      rig.dispose();
    };
  });
  return {
    rig,
    /** 짐을 지고 있는지 */
    setEnabled(value: boolean) {
      on = value;
      loadNode?.setEnabled(value);
    },
    dispose: () => dispose(),
  };
}
