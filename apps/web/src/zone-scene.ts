import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { LaborState } from "@dynosty/game-core";
import { qualityView } from "./quality-view.js";
import { ZONES } from "./site-zones.js";
/** 구역과 묶음은 기존 상태의 표시이며 용량·충돌·이동 시간 규칙을 추가하지 않는다. */
export function createZoneVisual(scene: Scene) {
  const parts: Mesh[] = [],
    materials: StandardMaterial[] = [];
  const mat = (name: string, color: readonly [number, number, number]) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = new Color3(...color);
    m.specularColor = Color3.Black();
    materials.push(m);
    return m;
  };
  const dark = mat("zone-dark", [0.14, 0.16, 0.14]),
    edge = mat("zone-edge", [0.8, 0.8, 0.65]),
    wood = mat("zone-wood", [0.68, 0.47, 0.25]),
    wet = mat("zone-wet-wood", [0.39, 0.32, 0.24]),
    pending = mat("zone-unchecked-wood", [0.5, 0.53, 0.51]);
  function box(
    name: string,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    m: StandardMaterial,
  ) {
    const mesh = CreateBox(name, { width: w, height: h, depth: d }, scene);
    mesh.position.set(x, y, z);
    mesh.material = m;
    mesh.isPickable = false;
    mesh.setEnabled(false);
    parts.push(mesh);
    return mesh;
  }
  for (const zone of ZONES) {
    const [x, , z] = zone.point,
      floor = mat(`zone-${zone.id}-material`, zone.color);
    box(
      `zone-${zone.id}-floor`,
      zone.width,
      0.025,
      zone.depth,
      x,
      0.018,
      z,
      floor,
    );
    for (const side of [-1, 1]) {
      box(
        `zone-${zone.id}-edge-x-${side}`,
        zone.width,
        0.015,
        0.045,
        x,
        0.038,
        z + (side * zone.depth) / 2,
        edge,
      );
      box(
        `zone-${zone.id}-edge-z-${side}`,
        0.045,
        0.015,
        zone.depth,
        x + (side * zone.width) / 2,
        0.038,
        z,
        edge,
      );
    }
    // 표지 기둥의 글자는 투영 표식과 화면의 구역 안내를 함께 사용한다.
    box(`zone-${zone.id}-sign-post`, 0.045, 0.8, 0.045, x, 0.4, z + 0.4, dark);
    box(
      `zone-${zone.id}-sign-board`,
      0.32,
      0.18,
      0.035,
      x,
      0.87,
      z + 0.4,
      edge,
    );
    if (zone.id === "quarantine") {
      for (const angle of [-0.65, 0.65])
        box(
          `zone-quarantine-cross-${angle}`,
          0.055,
          0.02,
          zone.depth * 0.8,
          x,
          0.045,
          z,
          dark,
        ).rotation.y = angle;
      for (const side of [-1, 1]) {
        box(
          `zone-quarantine-fence-${side}`,
          0.06,
          0.5,
          0.06,
          x + (side * zone.width) / 2,
          0.25,
          z + 0.55,
          dark,
        );
      }
      box(
        "zone-quarantine-rail",
        zone.width,
        0.05,
        0.05,
        x,
        0.45,
        z + 0.55,
        dark,
      );
    } else if (zone.id === "storage") {
      for (const side of [-1, 1])
        box(
          `zone-storage-rack-${side}`,
          0.055,
          0.65,
          0.055,
          x + side * 0.57,
          0.325,
          z + 0.45,
          dark,
        );
      box("zone-storage-rack-top", 1.2, 0.055, 0.055, x, 0.65, z + 0.45, dark);
    } else {
      for (let i = -1; i <= 1; i++)
        box(
          `zone-${zone.id}-stripe-${i}`,
          0.04,
          0.02,
          zone.depth * 0.7,
          x + i * 0.27,
          0.047,
          z,
          dark,
        ).rotation.y = zone.id === "allocation" ? 0.4 : 0;
    }
  }
  // 같은 재질의 고정 장식은 합쳐 그리기 호출을 줄인다. 목재 선택 면은 분리한다.
  const kept: Mesh[] = [],
    groups = new Map<string, Mesh[]>();
  for (const p of parts) {
    if (p.name.endsWith("-floor") || p.name.includes("-cross-")) kept.push(p);
    else {
      const key = p.material?.name ?? "";
      const group = groups.get(key) ?? [];
      group.push(p);
      groups.set(key, group);
    }
  }
  for (const [name, group] of groups) {
    const merged = Mesh.MergeMeshes(group, true);
    if (merged) {
      merged.name = `zone-static-${name}`;
      merged.isPickable = false;
      merged.setEnabled(false);
      kept.push(merged);
    } else kept.push(...group);
  }
  parts.length = 0;
  parts.push(...kept);
  const roots = [
    "exchange-inspection-parcel",
    "timber-quarantine",
    "timber-accepted",
    "quality-allocated",
  ].flatMap((name) => {
    const root = scene.getMeshByName(name);
    if (!root) return [];
    const half = root.getBoundingInfo().boundingBox.extendSize.y,
      originalY = root.position.y,
      originalScale = root.scaling.y;
    const children: Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const bounds = root.getBoundingInfo().boundingBox.extendSize;
      const plank = CreateBox(
        `${name}-plank-${i}`,
        { width: bounds.x * 1.75, height: 0.07, depth: bounds.z * 0.46 },
        scene,
      );
      plank.parent = root;
      plank.position.set(
        0,
        half + (0.045 + Math.floor(i / 3) * 0.085) / 0.25,
        ((i % 3) - 1) * bounds.z * 0.58,
      );
      plank.scaling.y = 4;
      plank.material = name === "timber-quarantine" ? wet : wood;
      plank.isPickable = false;
      plank.setEnabled(false);
      children.push(plank);
    }
    const bounds = root.getBoundingInfo().boundingBox.extendSize;
    for (const side of [-1, 1]) {
      const strap = CreateBox(
        `${name}-strap-${side}`,
        { width: 0.035, height: 0.018, depth: bounds.z * 1.8 },
        scene,
      );
      strap.parent = root;
      strap.position.set(side * bounds.x * 0.5, half + 0.17 / 0.25, 0);
      strap.scaling.y = 4;
      strap.material = dark;
      strap.isPickable = false;
      strap.setEnabled(false);
      children.push(strap);
    }
    const batches: Mesh[] = [];
    for (const kind of ["plank", "strap"] as const) {
      const group = children.filter((m) => m.name.includes(`-${kind}-`));
      const merged = Mesh.MergeMeshes(group, true);
      if (merged) {
        merged.name = `${name}-${kind}-0`;
        merged.setParent(root);
        merged.isPickable = false;
        merged.setEnabled(false);
        batches.push(merged);
      } else batches.push(...group);
    }
    return [{ root, half, originalY, originalScale, children: batches }];
  });
  return {
    update(s: LaborState | null) {
      const waiting = s ? qualityView(s).bins.waiting : 0;
      for (const p of parts) p.setEnabled(s !== null);
      for (const group of roots) {
        group.root.scaling.y = s ? 0.25 : group.originalScale;
        group.root.position.y = s
          ? group.originalY - group.half * 0.75
          : group.originalY;
        for (const child of group.children) {
          child.setEnabled(s !== null);
          if (
            child.name.includes("-plank-") &&
            group.root.name === "exchange-inspection-parcel"
          )
            child.material = waiting > 0 ? pending : wood;
        }
      }
    },
    dispose() {
      for (const group of roots) {
        group.root.scaling.y = group.originalScale;
        group.root.position.y = group.originalY;
        for (const m of group.children) m.dispose();
      }
      for (const p of parts) p.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
