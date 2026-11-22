import type { GroundPoint } from "./resident-path.js";

// Land survey in metres. The origin is the centre of a plot on every playable map.
export const PLOT_STEP = 2;
export function constructionPlot(p: GroundPoint): GroundPoint {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return p;
  return {
    x: Math.floor(p.x / PLOT_STEP + 0.5) * PLOT_STEP,
    z: Math.floor(p.z / PLOT_STEP + 0.5) * PLOT_STEP,
  };
}

export const VILLAGE_LAYOUT: ReadonlyArray<readonly [string, number, number]> =
  [
    ["BLD_OFFICE", 0, -16],
    ["BLD_NEST", -12, -10],
    ["BLD_NEST", 12, -10],
    ["BLD_WAREHOUSE", -16, 2],
    ["BLD_WORKSHOP", 16, 0],
    ["BLD_FORAGE", -12, 14],
    ["BLD_GREENHOUSE", -6, 22],
    ["BLD_WATER", 10, 18],
    ["BLD_FISHERY", 20, 8],
    ["BLD_WATCH", -22, -16],
    ["BLD_CLINIC", -8, -20],
    ["BLD_SALVAGE", 10, -20],
    ["BLD_GATE", 0, 24],
  ];

export function fixedBuildingAt(p: GroundPoint, rebuilding: boolean) {
  return VILLAGE_LAYOUT.some(
    ([id, x, z]) =>
      id !== "BLD_NEST" &&
      !(rebuilding && (id === "BLD_WORKSHOP" || id === "BLD_CLINIC")) &&
      Math.abs(x - p.x) < 4.5 &&
      Math.abs(z - p.z) < 4.5,
  );
}

export const BOKHOL_WATERS = [
  { id: "east-pond", name: "동쪽 물고기 못", x: 60, z: 32, radius: 10 },
  { id: "south-pond", name: "남쪽 물고기 못", x: 30, z: 65, radius: 12 },
] as const;

export const BOKHOL_MAP = {
  size: 512,
  coordinateLimit: 252,
  maxHomes: 100,
} as const;
export const BOKHOL_FORESTS = [
  { id: "west", name: "서쪽 숲", x: -40, z: -8 },
  { id: "central", name: "중앙 동쪽 숲", x: 28, z: 28 },
  { id: "north", name: "북쪽 숲", x: 0, z: -52 },
  { id: "east", name: "동쪽 숲", x: 70, z: -12 },
  { id: "south", name: "남쪽 숲", x: -22, z: 64 },
  { id: "northwest", name: "북서 구석 숲", x: -90, z: -78 },
  { id: "northeast", name: "북동 구석 숲", x: 88, z: -80 },
  { id: "southwest", name: "남서 구석 숲", x: -90, z: 88 },
  { id: "southeast", name: "남동 구석 숲", x: 88, z: 88 },
  { id: "ring-northwest", name: "거주지 북서 둘레 숲", x: -28, z: -32 },
  { id: "ring-northeast", name: "거주지 북동 둘레 숲", x: 26, z: -27 },
  { id: "ring-southwest", name: "거주지 남서 둘레 숲", x: -35, z: 30 },
  { id: "ring-east", name: "거주지 동쪽 둘레 숲", x: 35, z: 0 },
] as const;
export const BOKHOL_MINERALS = [
  {
    id: "coal-west",
    name: "서부 함지 석탄광",
    kind: "coal",
    resource: "RES_COAL",
    x: -150,
    z: -40,
    initial: 180,
  },
  {
    id: "coal-east",
    name: "동부 함지 석탄광",
    kind: "coal",
    resource: "RES_COAL",
    x: 135,
    z: 75,
    initial: 180,
  },
  {
    id: "iron-north",
    name: "북부 함지 철광산",
    kind: "iron",
    resource: "RES_IRON_ORE",
    x: 140,
    z: -125,
    initial: 160,
  },
  {
    id: "iron-south",
    name: "남부 함지 철광산",
    kind: "iron",
    resource: "RES_IRON_ORE",
    x: -90,
    z: 150,
    initial: 160,
  },
  {
    id: "stone-west",
    name: "서부 암반 채석장",
    kind: "stone",
    resource: "RES_STONE",
    x: -170,
    z: 130,
    initial: 240,
  },
  {
    id: "stone-east",
    name: "동부 암반 채석장",
    kind: "stone",
    resource: "RES_STONE",
    x: 185,
    z: -40,
    initial: 240,
  },
  {
    id: "coal-bokhol",
    name: "복홀 서쪽 석탄층",
    kind: "coal",
    resource: "RES_COAL",
    x: -76,
    z: 17,
    initial: 180,
  },
  {
    id: "iron-bokhol",
    name: "복홀 북쪽 철광맥",
    kind: "iron",
    resource: "RES_IRON_ORE",
    x: 46,
    z: -44,
    initial: 160,
  },
  {
    id: "stone-bokhol-west",
    name: "복홀 서북쪽 암반",
    kind: "stone",
    resource: "RES_STONE",
    x: -53,
    z: -46,
    initial: 240,
  },
  {
    id: "stone-bokhol-south",
    name: "복홀 남쪽 암반",
    kind: "stone",
    resource: "RES_STONE",
    x: 9,
    z: 48,
    initial: 240,
  },
] as const;
export const BOKHOL_PRODUCTION_SITES = [
  ...BOKHOL_FORESTS.map((f) => ({
    ...f,
    kind: "forest" as const,
    resource: "RES_WOOD" as const,
    initial: 120,
  })),
  ...BOKHOL_MINERALS,
] as const;
export type ProductionSiteId = (typeof BOKHOL_PRODUCTION_SITES)[number]["id"];
export function productionSiteDefinition(id: ProductionSiteId) {
  const site = BOKHOL_PRODUCTION_SITES.find((f) => f.id === id);
  if (!site) throw new RangeError("알 수 없는 생산 권역입니다.");
  return site;
}
export type ForestId = (typeof BOKHOL_FORESTS)[number]["id"];
export const BOKHOL_FOREST = {
  ...BOKHOL_FORESTS[0],
  halfWidth: 9,
  halfDepth: 11,
  supplyRadius: 26,
} as const;
export function bokholForestAt(p: GroundPoint) {
  return BOKHOL_FORESTS.find(
    (f) =>
      Math.abs(p.x - f.x) <= BOKHOL_FOREST.halfWidth &&
      Math.abs(p.z - f.z) <= BOKHOL_FOREST.halfDepth,
  );
}
export const inBokholForest = (p: GroundPoint) =>
  bokholForestAt(p) !== undefined;
export const sawmillHasForest = (p: GroundPoint) =>
  BOKHOL_FORESTS.some(
    (f) => Math.hypot(p.x - f.x, p.z - f.z) <= BOKHOL_FOREST.supplyRadius,
  );
export type ForestAmounts =
  | number
  | Readonly<Partial<Record<ForestId, number>>>;
const smooth = (n: number) => {
  const t = Math.max(0, Math.min(1, n));
  return t * t * (3 - 2 * t);
};
function landscape(x: number, z: number, forest: ForestAmounts): number {
  const hills =
    (3 +
      Math.sin(x / 23) * 2 +
      Math.cos(z / 29) * 1.8 +
      Math.sin((x + z) / 41) * 2) *
    smooth((Math.hypot(x, z) - 23) / 15);
  let flattened = 1;
  for (const f of BOKHOL_FORESTS) {
    const remaining =
      typeof forest === "number"
        ? f.id === "west"
          ? forest
          : 120
        : (forest[f.id] ?? 120);
    if (remaining > 0) continue;
    const edge = Math.max(
      Math.abs(x - f.x) - BOKHOL_FOREST.halfWidth,
      Math.abs(z - f.z) - BOKHOL_FOREST.halfDepth,
    );
    flattened = Math.min(flattened, smooth(edge / 5));
  }
  let height = hills * flattened;
  for (const site of BOKHOL_MINERALS) {
    const distance = Math.hypot(x - site.x, z - site.z);
    height -=
      (site.kind === "stone" && !site.id.includes("bokhol") ? 4 : 7) *
      (1 - smooth((distance - 7) / 13));
  }
  for (const w of BOKHOL_WATERS) {
    const distance = Math.hypot(x - w.x, z - w.z);
    if (distance < w.radius + 7)
      height = -1 + (height + 1) * smooth((distance - w.radius) / 7);
  }
  for (const site of BOKHOL_MINERALS) {
    if (!site.id.includes("bokhol")) continue;
    const distance = Math.hypot(x - (site.x + 15), z - site.z);
    if (distance < 10) height *= smooth((distance - 6) / 4);
  }
  return height;
}
// 건물 바닥은 주변 구릉의 높이를 유지한 평탄한 기초로 만든다.
export function bokholElevation(
  x: number,
  z: number,
  forest: ForestAmounts = 120,
  foundations: readonly GroundPoint[] = [],
): number {
  const height = landscape(x, z, forest);
  let total = 0,
    levels = 0;
  for (const p of foundations) {
    const distance = Math.hypot(x - p.x, z - p.z);
    const weight = 1 - smooth((distance - 5) / 2);
    if (weight === 0) continue;
    total += weight;
    levels += landscape(p.x, p.z, forest) * weight;
  }
  if (total === 0) return height;
  const blend = Math.min(1, total);
  return height * (1 - blend) + (levels / total) * blend;
}
