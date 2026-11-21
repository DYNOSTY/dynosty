// 본진 세상: 운석 뒤 혹한(기획서) — 눈보라 속 떠 있는 땅, 베어 낸 숲, 무너진 집터, 따뜻한 불빛만 남은 마을
import "@babylonjs/core/Particles/particleSystemComponent";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ColorCurves } from "@babylonjs/core/Materials/colorCurves";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Scene } from "@babylonjs/core/scene";
import { LOGGING_SITES } from "./layout.js";
import { loadSceneAsset } from "./scene-assets.js";
import { SCOUT_SITES } from "./scout-sites.js";

export const ISLAND_RADIUS = 70;
/** 미니맵 한 변(m) */
export const MAP_SPAN = (ISLAND_RADIUS + 1) * 2;
export const POND = { x: 17, z: 15, r: 3.6 };
export const LAKE = { x: 40, z: -26, r: 10 };

const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: readonly number[], b: readonly number[], t: number) =>
  a.map((v, k) => v + ((b[k] ?? v) - v) * t);
// 마을(반경 23)은 평평, 바깥은 언덕, 가장자리는 높은 능선. 호수 자리는 낮게
export const elevation = (x: number, z: number) => {
  const d = Math.hypot(x, z),
    dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  const hills =
    smooth(23, 40, d) * (Math.sin(x * 0.13) * Math.cos(z * 0.11) + 1.2) * 1.5;
  const ridge = smooth(50, 67, d) * (Math.sin(x * 0.21 + z * 0.17) + 1.4) * 2.6;
  return (hills + ridge) * smooth(LAKE.r - 1, LAKE.r + 6, dl);
};
// 결정적 난수 (같은 섬이 매번 같게)
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const segDist = (
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
) => {
  const vx = bx - ax,
    vz = bz - az,
    t = Math.max(
      0,
      Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz)),
    );
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
};

// 큰길: 마을을 지나 섬 끝(다른 마을로 가는 끊긴 길)까지
export const ROADS: Array<[number, number, number, number]> = [
  [0, -62, 0, 62],
  [-60, 1, 60, 0],
];
const PALETTE = {
  summer: {
    snowA: [0.6, 0.66, 0.47],
    snowB: [0.73, 0.75, 0.57],
    dirt: [0.8, 0.72, 0.58],
    lip: [0.55, 0.62, 0.43],
    waste: [0.58, 0.6, 0.46],
    fog: [0.87, 0.85, 0.81],
    fogDensity: 0.004,
    sun: [1, 0.95, 0.86],
    skyDay: [1, 0.97, 0.92],
    skyNight: [0.78, 0.8, 0.88],
    skyGround: [0.58, 0.53, 0.52],
    sunMax: 1,
    pine: [0.27, 0.4, 0.31],
    pineB: [0.33, 0.47, 0.35],
    cap: null,
    rock: [0.55, 0.53, 0.5],
    ice: [0.55, 0.69, 0.72],
    saturation: 0,
  },
  // 혹한: 잿빛 눈, 진창 길, 바깥은 더 어둡게. 채도를 낮추고 눈보라 안개로 먼 곳을 지움
  winter: {
    snowA: [0.74, 0.79, 0.88],
    snowB: [0.86, 0.9, 0.97],
    // 다져진 눈길(회청) — 짙은 흙색이면 거친 땅 격자에 번져 검은 연기 띠처럼 보였음 (11/20 숲 점검)
    dirt: [0.58, 0.58, 0.64],
    lip: [0.84, 0.88, 0.95],
    waste: [0.6, 0.65, 0.74],
    fog: [0.6, 0.66, 0.77],
    fogDensity: 0.0125,
    sun: [0.78, 0.86, 1],
    skyDay: [0.76, 0.83, 0.98],
    skyNight: [0.42, 0.5, 0.7],
    skyGround: [0.28, 0.31, 0.42],
    sunMax: 0.6,
    pine: [0.13, 0.24, 0.2],
    pineB: [0.16, 0.28, 0.23],
    cap: [0.86, 0.87, 0.91],
    rock: [0.42, 0.41, 0.43],
    ice: [0.72, 0.78, 0.84],
    saturation: -18,
  },
} as const;
export type Season = keyof typeof PALETTE;
const c3 = (v: readonly number[]) =>
  new Color3(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);

// 색이 칠해진 원뿔대 조각 (들쭉날쭉한 아래 테두리). ox/oz로 옆으로 밀 수 있음
export function frustum(
  r: () => number,
  y0: number,
  h: number,
  rb: number,
  rt: number,
  segs: number,
  col: readonly number[],
  jag: number,
  ox = 0,
  oz = 0,
) {
  const pos: number[] = [],
    ind: number[] = [],
    colors: number[] = [];
  const off = r() * Math.PI;
  for (let i = 0; i < segs; i++) {
    const a = off + (i / segs) * Math.PI * 2,
      k = 1 + (r() - 0.5) * jag;
    pos.push(Math.cos(a) * rb * k, y0 - r() * jag * 0.35, Math.sin(a) * rb * k);
  }
  for (let i = 0; i < segs; i++) {
    const a = off + (i / segs) * Math.PI * 2;
    pos.push(Math.cos(a) * rt + ox, y0 + h, Math.sin(a) * rt + oz);
  }
  pos.push(ox, y0 + h, oz);
  const top = segs * 2;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % segs;
    // 바깥을 보게(시계 반대 → 시계): 예전엔 면이 안쪽을 봐서 나무·바위가 빛을 못 받고 검게 보였음
    ind.push(i, j, segs + j, i, segs + j, segs + i, segs + i, segs + j, top);
  }
  for (let i = 0; i < pos.length / 3; i++) {
    const shade = 0.88 + r() * 0.24;
    colors.push(
      (col[0] ?? 0) * shade,
      (col[1] ?? 0) * shade,
      (col[2] ?? 0) * shade,
      1,
    );
  }
  const vd = new VertexData();
  vd.positions = pos;
  vd.indices = ind;
  vd.colors = colors;
  return vd;
}
// 소나무 한 층: 가지 끝이 별처럼 튀어나오고 끝이 아래로 처진 치마 (off로 눈 층과 가지 끝을 맞춤)
function pineTier(
  r: () => number,
  off: number,
  y0: number,
  h: number,
  rb: number,
  rt: number,
  segs: number,
  col: readonly number[],
  droop: number,
  notch: number,
  dark: number,
  cap = true,
) {
  const pos: number[] = [],
    ind: number[] = [],
    colors: number[] = [];
  for (let i = 0; i < segs; i++) {
    const a = off + (i / segs) * Math.PI * 2,
      tip = i % 2 === 0,
      k = (tip ? 1 : notch) * (1 + (r() - 0.5) * 0.16);
    pos.push(
      Math.cos(a) * rb * k,
      y0 - (tip ? droop * (0.8 + r() * 0.4) : 0),
      Math.sin(a) * rb * k,
    );
  }
  for (let i = 0; i < segs; i++) {
    const a = off + (i / segs) * Math.PI * 2;
    pos.push(Math.cos(a) * rt, y0 + h, Math.sin(a) * rt);
  }
  pos.push(0, y0 + h, 0);
  const top = segs * 2;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % segs;
    // 바깥을 보게(시계 반대 → 시계): 예전엔 면이 안쪽을 봐서 나무·바위가 빛을 못 받고 검게 보였음
    ind.push(i, j, segs + j, i, segs + j, segs + i);
    if (cap) ind.push(segs + i, segs + j, top);
  }
  // 아래 테두리(가지 끝·밑면 쪽)는 어둡게, 위로 갈수록 밝게
  for (let i = 0; i < pos.length / 3; i++) {
    const shade = (i < segs ? dark : 1) * (0.92 + r() * 0.16);
    colors.push(
      (col[0] ?? 0) * shade,
      (col[1] ?? 0) * shade,
      (col[2] ?? 0) * shade,
      1,
    );
  }
  const vd = new VertexData();
  vd.positions = pos;
  vd.indices = ind;
  vd.colors = colors;
  return vd;
}

export function mergedMesh(
  name: string,
  parts: VertexData[],
  scene: Scene,
  mat: StandardMaterial,
) {
  const vd = parts.reduce((acc, p) => acc.merge(p, true));
  const normals: number[] = [];
  VertexData.ComputeNormals(vd.positions ?? [], vd.indices ?? [], normals);
  vd.normals = normals;
  const m = new Mesh(name, scene);
  vd.applyToMesh(m);
  m.convertToFlatShadedMesh();
  m.material = mat;
  m.isPickable = false;
  m.isVisible = false;
  return m;
}

export function buildWorld(
  scene: Scene,
  paths: Array<[number, number]>,
  season: Season = "winter",
) {
  const P = PALETTE[season];
  /** 온돌 둘레 열기 원판 재질 — 화력에 따라 밝기 (setWeather) */
  let heatMat = null as StandardMaterial | null;
  scene.clearColor = new Color4(0, 0, 0, 0);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = P.fogDensity;
  scene.fogColor = c3(P.fog);
  const ip = scene.imageProcessingConfiguration;
  ip.contrast = 1.2;
  ip.exposure = 1;
  ip.vignetteEnabled = true;
  ip.vignetteWeight = 2.2;
  ip.vignetteColor = new Color4(0.08, 0.07, 0.1, 0);
  if (P.saturation) {
    ip.colorCurvesEnabled = true;
    const curves = new ColorCurves();
    curves.globalSaturation = P.saturation;
    if (season === "winter") {
      curves.shadowsHue = 215;
      curves.shadowsDensity = 45;
      curves.midtonesHue = 210;
      curves.midtonesDensity = 18;
      curves.highlightsHue = 35;
      curves.highlightsDensity = 10;
    }
    ip.colorCurves = curves;
  }

  const sky = new HemisphericLight("sky", new Vector3(-0.2, 1, -0.2), scene);
  sky.groundColor = c3(P.skyGround);
  const sun = new DirectionalLight("sun", new Vector3(0.55, -1, 0.35), scene);
  sun.position = new Vector3(-30, 55, -25);
  sun.diffuse = c3(P.sun);
  // 따뜻한 불빛(문·석등)만 번지게
  const glow = new GlowLayer("warm-glow", scene, {
    blurKernelSize: 24,
    mainTextureRatio: 0.25,
  });
  glow.intensity = 1.1;
  const warmMat = new StandardMaterial("warm-light", scene);
  warmMat.disableLighting = true;
  warmMat.emissiveColor = new Color3(1, 0.55, 0.18); // 차가운 세상 속 유일한 주황

  const vertexMat = (name: string) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.White();
    m.specularColor = Color3.Black();
    return m;
  };

  // 그림자 자국 (그림자 지도가 우리 장면에서 안 그려져 대체)
  const tex = new DynamicTexture("blob-tex", 128, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, "rgba(34,30,40,0.55)");
  grad.addColorStop(0.6, "rgba(34,30,40,0.26)");
  grad.addColorStop(1, "rgba(34,30,40,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  tex.update();
  tex.hasAlpha = true;
  const blobMat = new StandardMaterial("blob-material", scene);
  blobMat.diffuseTexture = tex;
  blobMat.useAlphaFromDiffuseTexture = true;
  blobMat.disableLighting = true;
  blobMat.emissiveColor = Color3.White();
  blobMat.zOffset = -2;
  const blobSrc = CreateDisc("blob", { radius: 1, tessellation: 24 }, scene);
  blobSrc.rotation.x = Math.PI / 2;
  blobSrc.bakeCurrentTransformIntoVertices();
  blobSrc.material = blobMat;
  blobSrc.isPickable = false;
  blobSrc.isVisible = false;
  let blobs = 0;
  // 성능: 같은 모양 수천 개는 thin instance(한 번에 그리기)로 모아 둠
  const batches = new Map<Mesh, number[]>();
  const batch = (src: Mesh, pos: Vector3, rot: Vector3, scale: Vector3) => {
    const m = Matrix.Compose(
      scale,
      Quaternion.FromEulerAngles(rot.x, rot.y, rot.z),
      pos,
    );
    let arr = batches.get(src);
    if (!arr) {
      arr = [];
      batches.set(src, arr);
    }
    for (let i = 0; i < 16; i++) arr.push(m.m[i] ?? 0);
  };
  const blobFlat = blobSrc.clone("blob-flat");
  blobFlat.isVisible = true;
  const shadow = (
    at: TransformNode | Vector3,
    radius: number,
    depth = radius,
  ) => {
    if (at instanceof Vector3) {
      batch(
        blobFlat,
        new Vector3(at.x + radius * 0.25, at.y + 0.03, at.z + radius * 0.15),
        Vector3.Zero(),
        new Vector3(radius, 1, depth),
      );
      return null;
    }
    const b = blobSrc.createInstance(`blob-${blobs++}`);
    b.parent = at;
    b.position.set(radius * 0.25, 0.03, radius * 0.15);
    b.scaling.set(radius, 1, depth);
    return b;
  };

  // ── 땅 (원형 격자) ──
  const R = ISLAND_RADIUS;
  const RINGS = 150,
    SEGS = 260,
    pos: number[] = [],
    idx: number[] = [];
  pos.push(0, 0, 0);
  for (let ri = 1; ri <= RINGS; ri++)
    for (let si = 0; si < SEGS; si++) {
      const a = (si / SEGS) * Math.PI * 2,
        rr = (ri / RINGS) * R;
      pos.push(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    }
  const at = (ri: number, si: number) =>
    ri === 0 ? 0 : 1 + (ri - 1) * SEGS + (si % SEGS);
  for (let ri = 0; ri < RINGS; ri++)
    for (let si = 0; si < SEGS; si++) {
      if (ri === 0) idx.push(0, at(1, si), at(1, si + 1));
      else
        idx.push(
          at(ri, si),
          at(ri + 1, si + 1),
          at(ri, si + 1),
          at(ri, si),
          at(ri + 1, si),
          at(ri + 1, si + 1),
        );
    }
  const colors: number[] = [];
  const noise = rng(7);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i] ?? 0,
      z = pos[i + 2] ?? 0,
      d = Math.hypot(x, z);
    pos[i + 1] = elevation(x, z);
    const g =
      0.5 +
      0.5 * Math.sin(x * 0.31 + Math.cos(z * 0.27) * 2) * Math.cos(z * 0.17) +
      (noise() - 0.5) * 0.3;
    let c = mix(P.snowA, P.snowB, Math.max(0, Math.min(1, g)));
    c = mix(c, P.waste, smooth(30, 55, d) * 0.8); // 바깥 황무지는 잿빛
    const wob = Math.sin(x * 0.9) * 0.35 + Math.cos(z * 1.1) * 0.3;
    const roadW = 0.9 + smooth(25, 60, d) * -0.45; // 마을 밖 길은 좁아지고 눈에 묻힘
    const pathD = Math.min(
      d - 7.2 + wob * 1.5,
      ...ROADS.map(
        ([ax, az, bx, bz]) => segDist(x, z, ax, az, bx, bz) - roadW + wob,
      ),
    );
    c = mix(
      c,
      P.dirt,
      (1 - smooth(-0.2, 0.9, pathD)) *
        (0.65 + noise() * 0.15) *
        (1 - smooth(30, 62, d) * 0.75),
    );
    colors.push(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, 1);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(pos, idx, normals);
  // 가운데 온돌 = 난방의 중심. 둘레만 주황빛이 번져 차가운 섬과 대비 (프로스트펑크 톤)
  if (season === "winter") {
    const tex = new DynamicTexture("heat-tex", 256, scene, false);
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255,150,70,0.5)");
    g.addColorStop(0.4, "rgba(255,120,50,0.2)");
    g.addColorStop(1, "rgba(255,100,40,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    tex.update();
    tex.hasAlpha = true;
    const heat = CreateDisc(
      "heat-glow",
      { radius: 13, tessellation: 48 },
      scene,
    );
    heat.rotation.x = Math.PI / 2;
    heat.position.set(0, 0.08, -1);
    const hm = new StandardMaterial("heat-mat", scene);
    hm.disableLighting = true;
    hm.diffuseColor = Color3.Black();
    hm.emissiveTexture = tex;
    hm.opacityTexture = tex;
    hm.alphaMode = 1; // 더하기
    heat.material = hm;
    heat.isPickable = false;
    heatMat = hm;
  }
  const ground = new Mesh("ground", scene);
  const vd = new VertexData();
  vd.positions = pos;
  vd.indices = idx;
  vd.normals = normals;
  vd.colors = colors;
  vd.applyToMesh(ground);
  ground.material = vertexMat("ground-material");
  ground.freezeWorldMatrix();

  // ── 바깥 눈밭: 섬 절벽을 걷고 땅을 시야 밖까지 이음 (2026-11-21 사용자 "지금은 섬처럼 떠 있잖아") ──
  // 마을 둘레 밖은 먹빛으로 덮여 있다가(fog.ts) 정찰하면 드러난다. 드러난 자리에 허공이 보이지 않게 잿빛 눈밭을 깔아 둠
  {
    const AR = 14,
      AS = 120,
      OUT = 120,
      ap: number[] = [],
      ai: number[] = [],
      ac: number[] = [];
    const far = mix(mix(P.snowA, P.snowB, 0.5), P.waste, 0.8);
    for (let r = 0; r <= AR; r++)
      for (let k = 0; k < AS; k++) {
        const a = (k / AS) * Math.PI * 2,
          rr = R + (r / AR) * OUT,
          x = Math.cos(a) * rr,
          z = Math.sin(a) * rr;
        ap.push(x, elevation(x, z), z);
        ac.push(far[0] ?? 0, far[1] ?? 0, far[2] ?? 0, 1);
      }
    for (let r = 0; r < AR; r++)
      for (let k = 0; k < AS; k++) {
        const p0 = r * AS + k,
          p1 = r * AS + ((k + 1) % AS);
        ai.push(p0, p1 + AS, p1, p0, p0 + AS, p1 + AS);
      }
    const an: number[] = [];
    VertexData.ComputeNormals(ap, ai, an);
    const apron = new Mesh("ground-far", scene);
    const avd = new VertexData();
    avd.positions = ap;
    avd.indices = ai;
    avd.normals = an;
    avd.colors = ac;
    avd.applyToMesh(apron);
    apron.material = vertexMat("ground-far-material");
    apron.isPickable = false;
    apron.freezeWorldMatrix();
  }

  // 언 연못·호수
  const iceMat = new StandardMaterial("ice-material", scene);
  iceMat.diffuseColor = c3(P.ice);
  iceMat.specularColor = new Color3(0.4, 0.42, 0.48);
  for (const [name, w] of [
    ["pond", POND],
    ["lake", LAKE],
  ] as const) {
    const disc = CreateDisc(name, { radius: w.r, tessellation: 48 }, scene);
    disc.rotation.x = Math.PI / 2;
    disc.position.set(w.x, 0.05, w.z);
    disc.material = iceMat;
    disc.isPickable = false;
  }

  // ── 나무·그루터기·죽은 나무·바위 ──
  const treeMat = vertexMat("pine-material");
  // 블렌더로 깎은 나무(tools/blender/tree.py, 2026-11-19)가 오면 같은 메시의 모양만 바꿔 끼움 —
  // 숲 배치(thin instance)·벌목 쓰러짐은 그대로. 재질 색은 정점 색으로 옮겨 한 번에 그림
  const treeHosts: Array<{ mesh: Mesh; kind: string }> = [];
  let treeGeo: Map<string, VertexData> | null = null;
  // 면이 바깥을 보는 방향(감김) 점수: 면 법선 · (면 중심 − 모양 중심)의 합. 부호가 감김 방향을 알려 줌
  const windingScore = (pos: ArrayLike<number>, ix: ArrayLike<number>) => {
    let cx = 0,
      cy = 0,
      cz = 0;
    const n = pos.length / 3;
    for (let i = 0; i < pos.length; i += 3) {
      cx += pos[i] ?? 0;
      cy += pos[i + 1] ?? 0;
      cz += pos[i + 2] ?? 0;
    }
    cx /= n;
    cy /= n;
    cz /= n;
    let score = 0;
    for (let t = 0; t < ix.length; t += 3) {
      const a = (ix[t] ?? 0) * 3,
        b = (ix[t + 1] ?? 0) * 3,
        c = (ix[t + 2] ?? 0) * 3;
      const ux = (pos[b] ?? 0) - (pos[a] ?? 0),
        uy = (pos[b + 1] ?? 0) - (pos[a + 1] ?? 0),
        uz = (pos[b + 2] ?? 0) - (pos[a + 2] ?? 0);
      const vx = (pos[c] ?? 0) - (pos[a] ?? 0),
        vy = (pos[c + 1] ?? 0) - (pos[a + 1] ?? 0),
        vz = (pos[c + 2] ?? 0) - (pos[a + 2] ?? 0);
      const nx = uy * vz - uz * vy,
        ny = uz * vx - ux * vz,
        nz = ux * vy - uy * vx;
      const fx = ((pos[a] ?? 0) + (pos[b] ?? 0) + (pos[c] ?? 0)) / 3 - cx,
        fy =
          ((pos[a + 1] ?? 0) + (pos[b + 1] ?? 0) + (pos[c + 1] ?? 0)) / 3 - cy,
        fz =
          ((pos[a + 2] ?? 0) + (pos[b + 2] ?? 0) + (pos[c + 2] ?? 0)) / 3 - cz;
      score += nx * fx + ny * fy + nz * fz;
    }
    return score;
  };
  const fitTree = (mesh: Mesh, kind: string) => {
    const src = treeGeo?.get(kind);
    if (!src) return;
    // 겉면 방향 맞추기: 블렌더가 내보낸 법선이 바깥 방향의 기준(믿을 수 있음).
    // 감김에서 계산한 법선이 그 법선과 대부분 반대면 감김을 뒤집어 겉면이 앞면이 되게 함 (안 그러면 아랫면이 보이거나 까맣게)
    const vd = new VertexData();
    vd.positions = Array.from(src.positions ?? []);
    vd.colors = Array.from(src.colors ?? []);
    const ix = Array.from(src.indices ?? []);
    const flip = () => {
      for (let i = 0; i < ix.length; i += 3) {
        const t = ix[i + 1] ?? 0;
        ix[i + 1] = ix[i + 2] ?? 0;
        ix[i + 2] = t;
      }
    };
    const geomN: number[] = [];
    VertexData.ComputeNormals(vd.positions, ix, geomN);
    if (src.normals && src.normals.length === vd.positions.length) {
      const n = Array.from(src.normals);
      let agree = 0;
      for (let i = 0; i < n.length; i += 3)
        agree +=
          (n[i] ?? 0) * (geomN[i] ?? 0) +
          (n[i + 1] ?? 0) * (geomN[i + 1] ?? 0) +
          (n[i + 2] ?? 0) * (geomN[i + 2] ?? 0);
      if (agree < 0) flip();
      vd.normals = n;
    } else {
      // 법선이 없으면 코드로 만든 옛 나무와 같은 감김으로 맞추고 감김에서 법선 계산
      const oldPos = mesh.getVerticesData("position"),
        oldIx = mesh.getIndices();
      if (
        oldPos &&
        oldIx &&
        Math.sign(windingScore(oldPos, oldIx)) !==
          Math.sign(windingScore(vd.positions, ix))
      )
        flip();
      const normals: number[] = [];
      VertexData.ComputeNormals(vd.positions, ix, normals);
      vd.normals = normals;
    }
    vd.indices = ix;
    // 이미 thin instance가 붙은 메시의 모양을 제자리에서 바꾸면 그려지지 않음(Babylon) →
    // 새 메시를 만들어 옛 메시의 행렬을 받아 쓰고, 옛 메시는 감춤 (옛 메시는 행렬 보관용으로 남김)
    const fresh = new Mesh(`${mesh.name}-glb`, scene);
    vd.applyToMesh(fresh);
    fresh.material = mesh.material;
    fresh.parent = mesh.parent;
    fresh.isPickable = false;
    fresh.alwaysSelectAsActiveMesh = true;
    let buf: Float32Array | null = null;
    const copy = () => {
      const mats = mesh.thinInstanceGetWorldMatrices();
      const fresh16 = !buf || buf.length !== Math.max(1, mats.length) * 16;
      if (fresh16) buf = new Float32Array(Math.max(1, mats.length) * 16);
      const b = buf as Float32Array;
      mats.forEach((m, i) => {
        m.copyToArray(b, i * 16);
      });
      if (fresh16) fresh.thinInstanceSetBuffer("matrix", b, 16, false);
      else fresh.thinInstanceBufferUpdated("matrix");
      fresh.thinInstanceCount = mats.length;
      fresh.isVisible = mesh.thinInstanceCount > 0;
    };
    copy();
    mesh.isVisible = false;
    // 벌목장 나무·그루터기는 매 장면 행렬이 바뀜(쓰러짐·다시 자람) → 매번 옮겨 담음
    if (mesh.name.startsWith("logging"))
      scene.onBeforeRenderObservable.add(copy);
  };
  const hostTree = (mesh: Mesh, kind: string) => {
    treeHosts.push({ mesh, kind });
    fitTree(mesh, kind);
    return mesh;
  };
  // 눈 쌓인 전나무(컨셉 시트): 별 모양 가지 층 + 층마다 위를 덮은 눈 (가지 끝 초록은 남김)
  // far: 마을에서 먼 숲(40m~)용 — 층·가지를 줄인 같은 모양 (점 개수 약 1/3)
  const makePine = (v: number, name = `pine-${v}`, far = false) => {
    const tr = rng(100 + v),
      parts: VertexData[] = [];
    parts.push(frustum(tr, 0, 1.1, 0.17, 0.1, 6, [0.27, 0.2, 0.17], 0));
    const tiers = far ? 4 + v : 6 + v,
      height = 3.3 + v * 0.55;
    for (let k = 0; k < tiers; k++) {
      const t = k / tiers,
        y = 0.75 + t * height,
        rb = 1.45 * (1 - t * 0.8) + 0.12,
        h = 0.95 - t * 0.3,
        off = tr() * Math.PI,
        segs = far ? 8 : 10;
      parts.push(
        pineTier(
          tr,
          off,
          y,
          h,
          rb,
          rb * 0.18,
          segs,
          k % 2 ? P.pineB : P.pine,
          0.22 * h,
          0.66,
          0.62,
          !P.cap, // 눈이 덮으면 윗면은 안 보이니 안 그림
        ),
      );
      if (P.cap)
        parts.push(
          pineTier(
            tr,
            off,
            y + h * 0.26,
            h * 0.82,
            rb * 0.88,
            rb * 0.2,
            segs,
            P.cap,
            0.12 * h,
            0.72,
            0.86,
          ),
        );
    }
    // 꼭대기 눈 뾰족
    if (P.cap)
      parts.push(frustum(tr, 0.75 + height, 0.45, 0.18, 0.01, 6, P.cap, 0.1));
    // 네 갈래: 전나무 셋(보통·가늘고 높은·넓고 빽빽한) + 적송 하나 — 같은 나무가 줄지어 보이지 않게
    // 먼 숲(40m~)은 가벼운 모양(_FAR): 안개 속이라 차이가 안 보이고 그리는 면은 절반
    const kinds = far
      ? ["TREE_FIR_FAR", "TREE_PINE_FAR", "TREE_FIR_FAR", "TREE_FIR_FAR"]
      : ["TREE_FIR", "TREE_PINE", "TREE_FIR_B", "TREE_FIR_C"];
    return hostTree(
      mergedMesh(name, parts, scene, treeMat),
      kinds[v % 4] ?? "TREE_FIR",
    );
  };
  const pines = [0, 1, 2, 3].map((v) => makePine(v));
  const pinesFar = [0, 1, 2, 3].map((v) => makePine(v, `pine-far-${v}`, true));
  const pineAt = (d: number, n: number) =>
    (d > 40 ? pinesFar : pines)[n % 4] as Mesh;
  const cap = P.cap ?? [0.5, 0.45, 0.4];
  const makeStump = (name = "stump") => hostStump(name);
  const hostStump = (name: string) =>
    hostTree(
      mergedMesh(
        name,
        (() => {
          const sr = rng(55);
          return [
            frustum(sr, 0, 0.42, 0.28, 0.24, 7, [0.33, 0.25, 0.2], 0.2),
            frustum(sr, 0.42, 0.06, 0.25, 0.2, 7, cap, 0.1),
          ];
        })(),
        scene,
        treeMat,
      ),
      "TREE_STUMP",
    );
  const stump = makeStump();
  // 숲 바닥을 채우는 것들: 어린 전나무·쓰러진 적송·덤불 (자리만 먼저 잡고 모양은 GLB가 오면 바뀜)
  const holder = (name: string, kind: string) =>
    hostTree(
      mergedMesh(
        name,
        [frustum(rng(9), 0, 0.3, 0.2, 0.15, 6, cap, 0.1)],
        scene,
        treeMat,
      ),
      kind,
    );
  const youngFir = holder("young-fir", "TREE_FIR_YOUNG");
  const fallenPine = holder("fallen-pine", "TREE_PINE_FALLEN");
  const shrub = holder("shrub", "TREE_SHRUB");
  void (async () => {
    const geo = new Map<string, VertexData>();
    for (const kind of [
      "TREE_FIR",
      "TREE_FIR_B",
      "TREE_FIR_C",
      "TREE_PINE",
      "TREE_STUMP",
      "TREE_FIR_YOUNG",
      "TREE_PINE_FALLEN",
      "TREE_SHRUB",
      "TREE_SNAG",
      "TREE_SNAG_B",
      "TREE_FIR_FAR",
      "TREE_PINE_FAR",
    ]) {
      try {
        const asset = await loadSceneAsset(scene, `/models/trees/${kind}.glb`);
        const inst = asset.instantiateModelsToScene(
          (n) => `${kind}-src:${n}`,
          false,
        );
        const parts: Mesh[] = [];
        for (const root of inst.rootNodes) {
          root.computeWorldMatrix(true);
          for (const m of root.getChildMeshes(false))
            if (m instanceof Mesh && m.getTotalVertices() > 0) parts.push(m);
        }
        for (const m of parts) {
          m.computeWorldMatrix(true);
          const c =
            (m.material as { albedoColor?: Color3 } | null)?.albedoColor ??
            Color3.White();
          // 블렌더가 구운 정점 색(그라데이션)이 있으면 그대로, 없으면 재질 색으로 칠함
          if (!m.isVerticesDataPresent("color")) {
            const n = m.getTotalVertices();
            const cols = new Float32Array(n * 4);
            for (let i = 0; i < n; i++) cols.set([c.r, c.g, c.b, 1], i * 4);
            m.setVerticesData("color", cols);
          }
        }
        const merged = Mesh.MergeMeshes(parts, true, true);
        if (merged) {
          geo.set(kind, VertexData.ExtractFromMesh(merged));
          merged.dispose();
        }
        inst.dispose();
      } catch {
        // 못 받으면 코드로 만든 나무 그대로
      }
    }
    if (scene.isDisposed) return;
    treeGeo = geo;
    for (const h of treeHosts) fitTree(h.mesh, h.kind);
  })();
  const deadTrees = [0, 1].map((v) => {
    const dr = rng(70 + v),
      bark = [0.24, 0.21, 0.21],
      parts = [frustum(dr, 0, 4 + v, 0.22, 0.04, 6, bark, 0.1)];
    for (let k = 0; k < 5; k++) {
      const y = 1.4 + k * 0.6,
        a = dr() * Math.PI * 2,
        len = 1.3 - k * 0.18;
      parts.push(
        frustum(
          dr,
          y,
          0.9,
          0.06,
          0.01,
          4,
          bark,
          0,
          Math.cos(a) * len,
          Math.sin(a) * len,
        ),
      );
    }
    // 프로스트펑크의 얼어붙은 고목 (GLB가 오면 그 모양으로)
    return hostTree(
      mergedMesh(`dead-${v}`, parts, scene, treeMat),
      v ? "TREE_SNAG_B" : "TREE_SNAG",
    );
  });
  const rockMat = vertexMat("rock-material");
  const rocks = [0, 1].map((v) => {
    const rr = rng(300 + v);
    return mergedMesh(
      `rock-${v}`,
      [
        frustum(rr, 0, 0.55, 0.9, 0.45, 7, P.rock, 0.55),
        frustum(rr, 0.5, 0.18, 0.5, 0.1, 7, cap, 0.3),
      ],
      scene,
      rockMat,
    );
  });
  const nearRoad = (x: number, z: number, w: number) =>
    ROADS.some(([ax, az, bx, bz]) => segDist(x, z, ax, az, bx, bz) < w);
  const blocked = (x: number, z: number) =>
    Math.hypot(x, z) < 9.5 ||
    paths.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 5) ||
    nearRoad(x, z, 2.8) ||
    Math.hypot(x - POND.x, z - POND.z) < POND.r + 1.2 ||
    Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 1.5 ||
    SCOUT_SITES.some((s) => Math.hypot(x - s.x, z - s.z) < 8) || // 거점 자리는 비워 둠 (발견 모형)
    LOGGING_SITES.some(
      ([lx, lz]) => Math.hypot(x - lx * 1.12, z - lz * 1.12) < 4.2,
    ); // 벌목터 나무는 logging.ts가 따로 심음
  const r = rng(42);
  const put = (
    src: Mesh,
    x: number,
    z: number,
    s: number,
    _name: string,
    blob: number,
    scale?: Vector3,
  ) => {
    const y = elevation(x, z);
    batch(
      src,
      new Vector3(x, y, z),
      new Vector3((r() - 0.5) * 0.08, r() * Math.PI * 2, (r() - 0.5) * 0.08),
      scale ?? new Vector3(s, s, s),
    );
    if (Math.hypot(x, z) < 34) shadow(new Vector3(x, y, z), blob * s);
  };
  // 숲은 한 덩어리로 빽빽하게, 사이사이 얼어붙은 고목 (레퍼런스 프로스트펑크·실록, 11/20)
  for (let n = 0; n < 12000; n++) {
    const a = r() * Math.PI * 2,
      d = 9 + Math.sqrt(r()) * (R - 11);
    const x = Math.cos(a) * d,
      z = Math.sin(a) * d;
    if (blocked(x, z)) continue;
    const s = 0.7 + r() * 0.7,
      roll = r();
    // 마을 둘레(22~27m)는 땔감으로 베어 낸 그루터기 벌판, 27m부터 숲 가장자리
    if (d > 27 && d < 34) {
      if (roll < 0.22) put(pineAt(d, n), x, z, s, `pine-${n}`, 1.4);
      else if (roll < 0.24)
        put(stump, x, z, 0.8 + r() * 0.5, `stump-${n}`, 0.4);
      else if (roll < 0.3) put(youngFir, x, z, s, `young-${n}`, 0.8);
      else if (roll < 0.33) put(shrub, x, z, s, `shrub-${n}`, 0.6);
      else if (roll < 0.36)
        put(deadTrees[n % 2] as Mesh, x, z, s, `dead-${n}`, 0.7);
      continue;
    }
    if (d > 21 && d <= 27) {
      if (roll < 0.035) put(stump, x, z, 0.8 + r() * 0.5, `stump-${n}`, 0.4);
      else if (roll < 0.04)
        put(deadTrees[n % 2] as Mesh, x, z, s, `dead-${n}`, 0.7);
      else if (roll < 0.055) put(shrub, x, z, s, `shrub-${n}`, 0.6);
      continue;
    }
    if (d <= 21) {
      if (roll < 0.05) put(pineAt(d, n), x, z, s, `pine-${n}`, 1.4);
      continue;
    }
    // 바깥: 숲, 군데군데 죽은 나무와 바위
    if (roll < 0.3) put(pineAt(d, n), x, z, s, `pine-${n}`, 1.4);
    else if (roll < 0.33) put(youngFir, x, z, s, `young-${n}`, 0.8);
    else if (roll < 0.35) put(shrub, x, z, s, `shrub-${n}`, 0.6);
    else if (roll < 0.355 && d < 50)
      put(fallenPine, x, z, s, `fallen-${n}`, 1.2);
    else if (roll < 0.395)
      put(deadTrees[n % 2] as Mesh, x, z, s, `dead-${n}`, 0.7);
    else if (roll < 0.405 || (d > R - 3 && roll < 0.5)) {
      put(
        rocks[n % 2] as Mesh,
        x,
        z,
        s,
        `rock-${n}`,
        0.9,
        new Vector3(
          s * (0.8 + r() * 1.2),
          s * (0.6 + r() * 0.8),
          s * (0.8 + r() * 1.2),
        ),
      );
    }
  }

  // 모아 둔 나무·그루터기·바위를 종류별로 한 번에
  const flushBatches = () => {
    for (const [mesh, arr] of batches) {
      mesh.thinInstanceSetBuffer("matrix", new Float32Array(arr), 16, true);
      mesh.isVisible = true;
      mesh.alwaysSelectAsActiveMesh = true;
    }
    batches.clear();
  };
  flushBatches();

  // ── 무너진 옛 고려 집터: 부서진 돌담 + 불탄 들보 ──
  const stoneMat = new StandardMaterial("ruin-stone", scene);
  stoneMat.diffuseColor = new Color3(0.47, 0.45, 0.46);
  stoneMat.specularColor = Color3.Black();
  const charMat = new StandardMaterial("ruin-char", scene);
  charMat.diffuseColor = new Color3(0.16, 0.13, 0.13);
  charMat.specularColor = Color3.Black();
  const wall = CreateBox(
    "ruin-wall",
    { width: 1, height: 1, depth: 0.5 },
    scene,
  );
  wall.material = stoneMat;
  const beam = CreateBox(
    "ruin-beam",
    { width: 0.22, height: 0.22, depth: 1 },
    scene,
  );
  beam.material = charMat;
  for (const m of [wall, beam]) {
    m.isVisible = false;
    m.isPickable = false;
  }
  const ruinR = rng(91);
  [
    [-38, 30],
    [-48, -18],
    [28, 44],
    [52, 18],
    [-20, -46],
    [18, -50],
  ].forEach(([cx = 0, cz = 0], _i) => {
    const yaw = ruinR() * Math.PI;
    for (let k = 0; k < 4; k++) {
      const side = k % 2 ? 1 : -1,
        along = k < 2;
      const len = 2 + ruinR() * 3.5,
        h = 0.5 + ruinR() * 1.3;
      const lx = along ? (ruinR() - 0.5) * 2 : side * 3,
        lz = along ? side * 2.4 : (ruinR() - 0.5) * 2;
      const x = cx + lx * Math.cos(yaw) - lz * Math.sin(yaw),
        z = cz + lx * Math.sin(yaw) + lz * Math.cos(yaw);
      batch(
        wall,
        new Vector3(x, elevation(x, z) + h / 2 - 0.1, z),
        new Vector3(0, yaw + (ruinR() - 0.5) * 0.2, 0),
        new Vector3(along ? len : 0.5, h, along ? 1 : len * 2),
      );
    }
    for (let k = 0; k < 5; k++) {
      const x = cx + (ruinR() - 0.5) * 5,
        z = cz + (ruinR() - 0.5) * 4;
      const y = elevation(x, z) + 0.3 + ruinR() * 0.6,
        len = 2 + ruinR() * 3;
      batch(
        beam,
        new Vector3(x, y, z),
        new Vector3(
          (ruinR() - 0.5) * 0.9,
          ruinR() * Math.PI,
          (ruinR() - 0.5) * 0.5,
        ),
        new Vector3(1, 1, len),
      );
    }
    shadow(new Vector3(cx, elevation(cx, cz), cz), 4);
  });

  flushBatches();
  // ── 마당 석등 4개 (불빛) ──
  const stone = vertexMat("lantern-material");
  const lantern = mergedMesh(
    "stone-lantern",
    (() => {
      const lr = rng(77),
        g = [0.6, 0.58, 0.56];
      return [
        frustum(lr, 0, 0.2, 0.42, 0.36, 6, g, 0),
        frustum(lr, 0.2, 0.75, 0.12, 0.12, 6, g, 0),
        frustum(lr, 0.95, 0.15, 0.32, 0.3, 6, g, 0),
        frustum(lr, 1.45, 0.3, 0.5, 0.05, 6, cap, 0),
      ];
    })(),
    scene,
    stone,
  );
  [
    Math.PI / 4,
    (3 * Math.PI) / 4,
    (5 * Math.PI) / 4,
    (7 * Math.PI) / 4,
  ].forEach((a, i) => {
    const x = Math.cos(a) * 8.6,
      z = Math.sin(a) * 8.6;
    const l = lantern.createInstance(`lantern-${i}`);
    l.position.set(x, 0, z);
    const fire = CreateBox(
      `lantern-fire-${i}`,
      { width: 0.42, height: 0.34, depth: 0.42 },
      scene,
    );
    fire.position.set(x, 1.27, z);
    fire.material = warmMat;
    fire.isPickable = false;
    glow.addIncludedOnlyMesh(fire);
    shadow(new Vector3(x, 0, z), 0.6);
  });

  // ── 눈보라 (겨울): 바람에 비스듬히 ──
  let snow: ParticleSystem | null = null;
  /** 날씨에 따른 시야 (scene.ts 안개 끝 거리에 곱함) */
  let visibility = 1;
  if (season === "winter") {
    const flake = new DynamicTexture("flake-tex", 32, scene, false);
    const fc = flake.getContext() as CanvasRenderingContext2D;
    const fg = fc.createRadialGradient(16, 16, 0, 16, 16, 16);
    fg.addColorStop(0, "rgba(255,255,255,1)");
    fg.addColorStop(1, "rgba(255,255,255,0)");
    fc.fillStyle = fg;
    fc.fillRect(0, 0, 32, 32);
    flake.update();
    flake.hasAlpha = true;
    // 눈은 카메라 주변(±32m)에만 내림 → 개수를 줄여도 보이는 밀도는 같음
    snow = new ParticleSystem("snow", 3800, scene);
    snow.particleTexture = flake;
    snow.emitter = new Vector3(1, 30, 0);
    snow.minEmitBox = new Vector3(-26, 0, -32);
    snow.maxEmitBox = new Vector3(38, 0, 32);
    // 거의 곧게 내리는 눈 (사용자 11/19: 사선 → 직선). 바람은 아주 조금만
    snow.direction1 = new Vector3(-0.3, -1, 0.05);
    snow.direction2 = new Vector3(-0.1, -1, 0.15);
    snow.minEmitPower = 3;
    snow.maxEmitPower = 5;
    snow.minLifeTime = 6;
    snow.maxLifeTime = 9;
    snow.minSize = 0.12;
    snow.maxSize = 0.32;
    snow.emitRate = 620;
    snow.color1 = new Color4(1, 1, 1, 0.9);
    snow.color2 = new Color4(0.86, 0.88, 0.95, 0.75);
    snow.colorDead = new Color4(1, 1, 1, 0);
    snow.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    snow.preWarmCycles = 80;
    snow.start();
  }

  // ── 낮밤: 게임 시각(분)에 맞춰 해·하늘빛·배경 밝기 ──
  let shown = -1;
  let lastLevel = "";
  const setTime = (minute: number) => {
    const m = ((minute % 1440) + 1440) % 1440;
    if (Math.abs(m - shown) < 0.5) return;
    shown = m;
    const dayT = (m - 360) / 720; // 0 = 06:00, 1 = 18:00
    const daylight = Math.max(
      0,
      Math.sin(Math.PI * Math.max(0, Math.min(1, dayT))),
    );
    const az = Math.PI * Math.max(0, Math.min(1, dayT));
    sun.direction = new Vector3(
      -Math.cos(az) * 0.85,
      -(0.35 + 0.65 * daylight),
      0.4,
    ).normalize();
    sun.intensity = (0.25 + 0.75 * daylight) * P.sunMax;
    sky.intensity = 0.62 + 0.18 * daylight;
    sky.diffuse = c3(mix(P.skyNight, P.skyDay, daylight));
    const warm = smooth(0, 0.18, daylight) * (1 - smooth(0.18, 0.5, daylight));
    sun.diffuse = c3(mix(P.sun, [1, 0.72, 0.55], warm));
    glow.intensity = 0.85 + 0.7 * (1 - daylight); // 밤일수록 불빛이 번짐
    // 밤에는 안개·먼 곳 빛깔도 어둡게: 낮 색 그대로 두면 어두운 마을을 흰 테가 두른 것처럼 보임 (11/21)
    scene.fogColor = c3(
      mix(
        P.fog.map((v, k) => v * ([0.3, 0.34, 0.5][k] ?? 1)),
        P.fog,
        smooth(0, 0.35, daylight),
      ),
    );
    // 배경 밝기는 20단계로만 바꿈 (매 프레임 바꾸면 화면 전체를 다시 그려 느려짐)
    const level = (0.72 + (0.28 * Math.round(daylight * 20)) / 20).toFixed(3);
    if (level !== lastLevel) {
      lastLevel = level;
      document.documentElement.style.setProperty("--daylight", level);
    }
  };
  setTime(9 * 60);
  flushBatches();
  for (const mat of [treeMat, rockMat, stoneMat, charMat, iceMat, stone])
    mat.freeze();

  /** 눈이 카메라를 따라오게 */
  const followSnow = (x: number, z: number) => {
    if (snow) (snow.emitter as Vector3).set(x + 1, 26, z);
  };
  // 날씨(winter.ts) → 눈발 세기·바람·크기, 시야 / 화력·축열 → 온돌 둘레 열기
  // 시야(see): 눈보라도 적당히만 뿌옇게 — 사용자 11/19 "심하면 경험을 해친다"
  const WEATHER_LOOK: Record<
    string,
    { rate: number; wind: number; life: number; size: number; see: number }
  > = {
    맑음: { rate: 90, wind: 0.6, life: 8, size: 0.7, see: 1 },
    흐림: { rate: 240, wind: 0.8, life: 8, size: 0.85, see: 0.96 },
    눈: { rate: 620, wind: 1, life: 7.5, size: 1, see: 0.92 },
    눈보라: { rate: 900, wind: 1.6, life: 5, size: 1.1, see: 0.78 },
    한파: { rate: 160, wind: 1.3, life: 6, size: 0.55, see: 0.94 },
  };
  let lastWeather = "";
  const setWeather = (weather: string, heat: number) => {
    if (heatMat) heatMat.emissiveColor = new Color3(heat, heat, heat);
    if (!snow || weather === lastWeather) return;
    lastWeather = weather;
    const look = WEATHER_LOOK[weather] ?? WEATHER_LOOK.눈;
    if (!look) return;
    snow.emitRate = look.rate;
    snow.minLifeTime = look.life * 0.75;
    snow.maxLifeTime = look.life;
    snow.direction1 = new Vector3(-0.3 * look.wind, -1, 0.05 * look.wind);
    snow.direction2 = new Vector3(-0.1 * look.wind, -1, 0.15 * look.wind);
    snow.minEmitPower = 3 * Math.sqrt(look.wind);
    snow.maxEmitPower = 5 * Math.sqrt(look.wind);
    snow.minSize = 0.12 * look.size;
    snow.maxSize = 0.32 * look.size;
    visibility = look.see;
  };
  return {
    shadow,
    setTime,
    setWeather,
    visibility: () => visibility,
    glow,
    warmMat,
    followSnow,
    makePine: (name: string) => makePine(0, name),
    makeStump,
  };
}
