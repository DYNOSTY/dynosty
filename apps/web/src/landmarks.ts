// 정찰을 마친 거점에 솟아오르는 모형 (기획서 정찰과조달.md의 정착지)
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { ScoutSite } from "./scout-sites.js";
import { elevation, rng } from "./world.js";

type Glow = { addIncludedOnlyMesh(m: Mesh): void };
type Part = [
  "box" | "cyl" | "cone" | "ball",
  [number, number, number],
  [number, number, number],
  string,
  number?,
];

const DARK = "#3b2d26",
  STONE = "#77737a",
  CLOTH = "#34436a";
// [모양, 크기(폭·높이·깊이), 위치(x·y·z), 색, 회전y]
const MODELS: Record<string, Part[]> = {
  // 갈대나루·솔그늘·옛 제철터·돌등 사냥막은 건물 도감 GLB로 (village.addLandmark)
  // 무너진 고려 집터: 비석과 단서 불빛
  record: [
    ["box", [1.1, 2.4, 0.4], [0, 1.2, 0], STONE],
    ["box", [1.4, 0.3, 0.7], [0, 0.15, 0], STONE],
    ["box", [0.5, 0.3, 0.3], [0.9, 0.2, 0.7], "glow"],
  ],
};

export function createLandmarks(
  scene: Scene,
  sites: ScoutSite[],
  glow: Glow,
  warmMat: StandardMaterial,
) {
  const mats = new Map<string, StandardMaterial>();
  const mat = (hex: string) => {
    if (hex === "glow") return warmMat;
    let m = mats.get(hex);
    if (!m) {
      m = new StandardMaterial(`lm-${hex}`, scene);
      m.diffuseColor = Color3.FromHexString(hex);
      m.specularColor = Color3.Black();
      mats.set(hex, m);
    }
    return m;
  };
  const roots = new Map<
    string,
    { node: TransformNode; t: number; on: boolean }
  >();
  for (const site of sites) {
    const node = new TransformNode(`landmark-${site.id}`, scene);
    node.position.set(site.x, elevation(site.x, site.z), site.z);
    node.rotation.y = Math.atan2(-site.x, -site.z); // 앞면이 마을 쪽
    node.setEnabled(false);
    const parts: Part[] = [
      ...(MODELS[site.id] ?? []),
      // 발견 깃발
      ["cyl", [0.1, 3.4, 0.1], [-3.6, 1.7, 3.2], DARK],
      ["box", [0.05, 0.7, 1.1], [-3.6, 3, 3.75], CLOTH],
    ];
    const r = rng(site.x * 7 + site.z);
    parts.forEach(([shape, [w, h, d], [x, y, z], color, ry], i) => {
      const name = `lm-${site.id}-${i}`;
      const m =
        shape === "box"
          ? CreateBox(name, { width: w, height: h, depth: d }, scene)
          : shape === "cyl"
            ? CreateCylinder(
                name,
                { height: h, diameter: w, tessellation: 8 },
                scene,
              )
            : shape === "cone"
              ? CreateCylinder(
                  name,
                  {
                    height: h,
                    diameterBottom: w,
                    diameterTop: 0,
                    tessellation: shape === "cone" && w > 3 ? 6 : 7,
                  },
                  scene,
                )
              : CreateSphere(name, { diameter: w, segments: 6 }, scene);
      m.parent = node;
      m.position.set(x, y, z);
      m.rotation.y = ry ?? (r() - 0.5) * 0.1;
      m.material = mat(color);
      m.isPickable = false;
      if (color === "glow") glow.addIncludedOnlyMesh(m);
    });
    roots.set(site.id, { node, t: 0, on: false });
  }
  return {
    reset() {
      for (const r of roots.values()) {
        r.on = false;
        r.t = 0;
        r.node.setEnabled(false);
      }
    },
    /** 정찰을 마친 거점: 땅에서 솟아오르며 나타남 */
    show(id: string) {
      const r = roots.get(id);
      if (!r || r.on) return;
      r.on = true;
      r.node.setEnabled(true);
      r.node.scaling = new Vector3(1, 0.01, 1);
    },
    animate(dt: number) {
      for (const r of roots.values()) {
        if (!r.on || r.t >= 1) continue;
        r.t = Math.min(1, r.t + dt / 1.4);
        const e = 1 - (1 - r.t) ** 3;
        r.node.scaling.y = Math.max(0.01, e);
      }
    },
  };
}
