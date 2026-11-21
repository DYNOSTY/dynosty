// 안 가 본 땅을 덮는 먹빛 암흑 (2026-11-21 사용자: "안 가본 지역은 암흑처리 후 가면 같은 지형 뜨고").
// 마을 둘레(SIGHT_RADIUS)만 밝고 바깥은 먹으로 덮여 있다가, 정찰을 마친 곳과 거기까지의 길이 2초에 걸쳐 걷힌다.
//
// 만드는 법: 땅 높낮이를 따라 나무 위(HEIGHT)에 뜬 큰 판 하나. 점마다 투명도를 달리해 밝은 곳은 뚫고 나머지는 덮는다.
// 판이 땅보다 높이 떠 있어서 비스듬히 내려다보면 실제 땅보다 뒤쪽을 가리게 되는데, 카메라 각도가 고정이라
// (scene.ts 시야 고정) 판의 점이 가리는 땅 자리를 미리 계산해 그 자리의 밝기를 쓴다.
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";
import type { ScoutSite } from "./scout-sites.js";
import { elevation } from "./world.js";

/** 처음부터 보이는 범위: 마을·그루터기 벌판·숲 가장자리까지 */
export const SIGHT_RADIUS = 38;
/** 정찰로 찾은 곳 둘레가 밝아지는 범위와, 거기까지 난 길의 반 폭 */
const SITE_RADIUS = 13;
const PATH_HALF = 5;
/** 판이 뜬 높이(가장 큰 나무 위)와, 그 높이 때문에 가려지는 땅이 뒤로 밀리는 거리 = 높이 ÷ tan(내려다보는 각 36°) */
const HEIGHT = 7.5;
const BEHIND = HEIGHT / Math.tan((36 * Math.PI) / 180);
const INK = [0.06, 0.055, 0.075];
/** 가장자리가 먹 번지듯 들쭉날쭉하게: 자리마다 정해진 흔들림 (-1~1) */
const wobble = (x: number, z: number) =>
  Math.sin(x * 0.37 + Math.cos(z * 0.29) * 2.1) * 0.6 +
  Math.sin(z * 0.83 - x * 0.61) * 0.4;
const soft = (edge: number, width: number, d: number) => {
  const t = Math.max(0, Math.min(1, (edge - d) / width));
  return t * t * (3 - 2 * t);
};
/** 원점(마을)에서 (bx, bz)까지의 선분과 점 사이 거리 */
const segDist = (px: number, pz: number, bx: number, bz: number) => {
  const t = Math.max(
    0,
    Math.min(1, (px * bx + pz * bz) / (bx * bx + bz * bz || 1)),
  );
  return Math.hypot(px - bx * t, pz - bz * t);
};

export function createFog(scene: Scene, sites: ScoutSite[]) {
  // 극좌표 격자: 밝은 범위 근처는 촘촘히(가장자리가 매끄럽게), 먼 곳은 성기게
  const radii: number[] = [];
  for (let r = 12; r <= 96; r += 1.4) radii.push(r);
  for (const r of [104, 116, 132, 152, 180, 220, 280]) radii.push(r);
  const SEGS = 168;
  const positions: number[] = [];
  const indices: number[] = [];
  const ground: Array<[number, number]> = []; // 점마다 가리는 땅 자리
  for (const r of radii)
    for (let s = 0; s < SEGS; s++) {
      const a = (s / SEGS) * Math.PI * 2,
        x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      positions.push(x, elevation(x, z) + HEIGHT, z);
      ground.push([x, z + BEHIND]);
    }
  for (let r = 0; r < radii.length - 1; r++)
    for (let s = 0; s < SEGS; s++) {
      const a = r * SEGS + s,
        b = r * SEGS + ((s + 1) % SEGS),
        c = a + SEGS,
        d = b + SEGS;
      indices.push(a, c, b, b, c, d);
    }
  const colors = new Float32Array((positions.length / 3) * 4);
  for (let i = 0; i < colors.length; i += 4) colors.set(INK, i);
  const mesh = new Mesh("unexplored-ink", scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.colors = colors;
  vd.applyToMesh(mesh, true);
  const mat = new StandardMaterial("unexplored-ink", scene);
  mat.disableLighting = true;
  mat.diffuseColor = Color3.Black();
  mat.specularColor = Color3.Black();
  mat.emissiveColor = Color3.White();
  mat.backFaceCulling = false;
  mat.fogEnabled = false; // 날씨 안개에 물들지 않고 늘 먹빛
  mesh.material = mat;
  mesh.useVertexColors = true;
  mesh.hasVertexAlpha = true;
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;

  /** 거점별 걷힌 정도 0(덮임)~1(다 걷힘) */
  const shown = new Map<string, number>();
  const target = new Map<string, number>();
  const paint = () => {
    for (let i = 0; i < ground.length; i++) {
      const [x, z] = ground[i] as [number, number];
      const w = wobble(x, z);
      let light = soft(SIGHT_RADIUS + w * 2.2, 7, Math.hypot(x, z));
      for (const s of sites) {
        const k = shown.get(s.id) ?? 0;
        if (k <= 0) continue;
        light = Math.max(
          light,
          k * soft(SITE_RADIUS + w * 1.6, 5, Math.hypot(x - s.x, z - s.z)),
          k * soft(PATH_HALF + w, 3.5, segDist(x, z, s.x, s.z)),
        );
      }
      colors[i * 4 + 3] = 1 - light;
    }
    mesh.updateVerticesData("color", colors);
  };
  paint();
  return {
    reset() {
      shown.clear();
      target.clear();
      paint();
    },
    /** 정찰을 마치면 그곳과 거기까지의 길이 2초에 걸쳐 걷힘 */
    reveal(id: string) {
      target.set(id, 1);
    },
    animate(dt: number) {
      if (target.size === 0) return;
      for (const [id, to] of target) {
        const now = Math.min(to, (shown.get(id) ?? 0) + dt * 0.5);
        shown.set(id, now);
        if (now >= to) target.delete(id);
      }
      paint();
    },
    dispose() {
      mat.dispose();
      mesh.dispose();
    },
  };
}
