import {
  BOKHOL_FORESTS,
  BOKHOL_MAP,
  BOKHOL_MINERALS,
  BOKHOL_WATERS,
  type ProductionSiteId,
  reservedVillageLand,
  VILLAGE_LAYOUT,
  VILLAGE_POND,
} from "./bokhol.js";
import {
  advanceDevelopment,
  collectionRate,
  createDevelopment,
  type DevelopmentState,
  developmentValid,
  hasResearch,
  isMechanical,
  levelProductionRate,
  orderWork,
  RESEARCH_CATALOG,
  residentShiftOpen,
  scoutSpeedRate,
  townShiftOpen,
  tradeRank,
  upgradeCost,
  upgradeResearch,
  upgradeTarget,
} from "./development.js";
import {
  clearBuildingFootprint,
  type HomePlacement,
  homeEntrance,
  homeObstacle,
  rectanglesOverlap,
  rotatedPoint,
} from "./home-placement.js";
import { advanceHospital, hospitalValid, type Patient } from "./hospital.js";
import {
  loggingSiteRules,
  productionSites,
  setLoggingSite,
} from "./logging.js";
import { findById } from "./lookup.js";
import { usableHomes } from "./mutants.js";
import {
  AMOUNT_SCALE,
  type FoodId,
  GAME_RULES,
  productionMultiplier,
  type ResourceId,
} from "./play.js";
import {
  type GroundPoint,
  moveOnGround,
  residentPath,
} from "./resident-path.js";
import { workplaceOpen } from "./resident-routine.js";
import { isRecord } from "./save.js";
import { warehouseDoor } from "./storage.js";
import { capitalRoad, type TimberState } from "./timber.js";
import {
  assignHomes,
  nextDwellingId,
  speciesRule,
  VILLAGE_RULES,
} from "./village-services.js";

export const waterAt = (p: GroundPoint, margin = 0) =>
  BOKHOL_WATERS.find(
    (w) => Math.hypot(p.x - w.x, p.z - w.z) < w.radius + margin,
  );
export type BuildingKind =
  | "home"
  | "restaurant"
  | "logging"
  | "storage"
  | "coal"
  | "iron"
  | "quarry"
  | "waterworks"
  | "fishery"
  | "farm"
  | "ranch"
  | "scout"
  | "trade"
  | "workshop"
  | "hospital";
type Cost = Partial<Record<ResourceId, number>>;
// C1 승인 개발용 정량. 실제 밸런스 확정 근거는 docs/BUILDING_RULES.md 참조.
const previousBuildingRules: Record<
  BuildingKind,
  { name: string; cost: Cost; work: number; staff: number; site: string }
> = {
  hospital: {
    name: "병원",
    cost: { RES_WOOD: 150, RES_METAL: 20 },
    work: 240,
    staff: 2,
    site: "빈 육지 · 의료 인원 배치 · 병상5/15/25개",
  },
  workshop: {
    name: "연구소",
    cost: { RES_WOOD: 80, RES_METAL: 30 },
    work: 240,
    staff: 2,
    site: "빈 육지 · 연구원 배치 · 연구소마다 동시1건",
  },
  home: {
    name: "온돌 둥지",
    cost: { RES_WOOD: 100 },
    work: 180,
    staff: 0,
    site: "빈 육지",
  },
  restaurant: {
    name: "공동 식당",
    cost: { RES_WOOD: 150, RES_METAL: 10 },
    work: 240,
    staff: 2,
    site: "빈 육지 · 여러 곳 건설 가능 · 좌석10/20/40",
  },
  logging: {
    name: "제재소",
    cost: { RES_WOOD: 75, RES_METAL: 10 },
    work: 180,
    staff: 4,
    site: "잔량이 있는 숲 반경26 안의 빈 땅",
  },
  storage: {
    name: "공동 저장소",
    cost: { RES_WOOD: 60 },
    work: 180,
    staff: 0,
    site: "빈 육지 · 가까운 하역 거점",
  },
  coal: {
    name: "석탄광",
    cost: { RES_WOOD: 125, RES_METAL: 20 },
    work: 300,
    staff: 4,
    site: "석탄 광맥 주변",
  },
  iron: {
    name: "철광산",
    cost: { RES_WOOD: 150, RES_METAL: 30 },
    work: 300,
    staff: 4,
    site: "철광석 광맥 주변 · 제련 전 원료",
  },
  quarry: {
    name: "채석장",
    cost: { RES_WOOD: 90, RES_METAL: 15 },
    work: 240,
    staff: 4,
    site: "돌이 많은 암반 주변",
  },
  waterworks: {
    name: "취수장",
    cost: { RES_WOOD: 90, RES_METAL: 10 },
    work: 180,
    staff: 3,
    site: "수원지 옆 육지에서 물을 길어 저장소로 운반",
  },
  fishery: {
    name: "어획막",
    cost: { RES_WOOD: 90, RES_METAL: 10 },
    work: 180,
    staff: 5,
    site: "물고기 못의 육지 쪽 물가 · 결빙 낚시 가능",
  },
  farm: {
    name: "온상 재배소",
    cost: { RES_WATER: 1, RES_WOOD: 125, RES_METAL: 10 },
    work: 240,
    staff: 4,
    site: "빈 육지 · 구릉에도 배치 · 물 필요 · 결빙기 석탄 필요",
  },
  ranch: {
    name: "목축장",
    cost: { RES_WATER: 1, RES_WOOD: 125, RES_STONE: 20 },
    work: 240,
    staff: 4,
    site: "빈 육지 · 구릉에도 배치 · 풀·물로 가축 사육",
  },
  scout: {
    name: "정찰 거점",
    cost: { RES_WOOD: 75 },
    work: 180,
    staff: 2,
    site: "빈 육지 · 배치 인력2명 파견 · 맵에 한 곳",
  },
  trade: {
    name: "교역소",
    cost: { RES_WOOD: 125, RES_METAL: 10 },
    work: 240,
    staff: 1,
    site: "빈 육지 · 교역 인력1명 배치 · 맵에 한 곳",
  },
};
// Save the price edition on each order so refunds and old ledgers use what was paid.
export const BUILDING_RULES = Object.fromEntries(
  Object.entries(previousBuildingRules).map(([kind, rule]) => [
    kind,
    {
      ...rule,
      cost: {
        ...rule.cost,
        RES_WOOD: Math.ceil((rule.cost.RES_WOOD ?? 0) / 2),
      },
    },
  ]),
) as typeof previousBuildingRules;
export function constructionCost(kind: BuildingKind, version: 1 | 2 | 3 | 4) {
  if (version === 4) return BUILDING_RULES[kind].cost;
  if (version === 3) return previousBuildingRules[kind].cost;
  return historicalBuildingCost(kind, version);
}

// Existing capital buildings and older saves were funded at their original prices.
export function originalBuildingCost(kind: BuildingKind): Cost {
  return historicalBuildingCost(kind, 1);
}
function historicalBuildingCost(kind: BuildingKind, version: 1 | 2): Cost {
  return Object.fromEntries(
    Object.entries(previousBuildingRules[kind].cost)
      .filter(([id]) => id !== "RES_WATER")
      .map(([id, amount]) => [id, version === 1 ? amount / 5 : amount]),
  );
}
export interface BuildingOrder extends HomePlacement {
  priceVersion?: 2 | 3 | 4;
  id: string;
  kind: BuildingKind;
  sourceId: ProductionSiteId | null;
  crew: string[];
  stage: "waiting" | "collect" | "deliver" | "build";
  workDone: number;
  upgradeTarget?: string;
  upgradeLevel?: 2 | 3;
}
export interface Facility extends HomePlacement {
  priceVersion?: 2 | 3 | 4;
  id: string;
  kind: Exclude<BuildingKind, "home">;
  sourceId: ProductionSiteId | null;
  level: 1 | 2 | 3;
  target: number;
  progress: number;
  yieldRemainder: number;
  buffer: number;
  delivered: number;
  haul: {
    worker: string;
    cargo: number;
    stage: "pickup" | "store" | "return";
  } | null;
}
export const individualWorkplaces = [
  "logging",
  "workshop",
  "hospital",
  "waterworks",
  "fishery",
  "farm",
  "quarry",
  "coal",
  "iron",
] as const;
export function canDirectStaff(kind: BuildingKind) {
  return individualWorkplaces.some((k) => k === kind);
}
export const facilityStaffLimit = (f: Pick<Facility, "kind" | "level">) =>
  f.kind === "restaurant"
    ? ([2, 4, 6][f.level - 1] ?? 2)
    : f.kind === "fishery"
      ? ([5, 10, 20][f.level - 1] ?? 5)
      : canDirectStaff(f.kind)
        ? BUILDING_RULES[f.kind].staff * (f.level + 1)
        : BUILDING_RULES[f.kind].staff;
export interface Expedition {
  id: string;
  facilityId: string;
  kind: "hunt" | "trade";
  food: FoodId;
  ids: string[];
  stage: "outbound" | "gather" | "return";
  progress: number;
  cargo: number;
  goal: GroundPoint;
  rank: 1 | 2 | 3;
}
export interface TownState {
  nextId: number;
  orders: BuildingOrder[];
  facilities: Facility[];
  trips: Expedition[];
  spent: Cost;
  received: Cost;
  extracted: Partial<Record<ProductionSiteId, number>>;
  cold: boolean;
  development: DevelopmentState;
  patients: Patient[];
}
export const createTown = (): TownState => ({
  nextId: 1,
  orders: [],
  facilities: [],
  trips: [],
  spent: {},
  received: {},
  extracted: {},
  cold: false,
  development: createDevelopment(),
  patients: [],
});
export const buildingPower = (s: TimberState, id: string) =>
  speciesRule(s.world.citizens.find((c) => c.id === id)?.species ?? "R03")
    .space;
export const facilityDoor = (f: HomePlacement) => rotatedPoint(f, 0, 3.2);
export const townObstacles = (s: TimberState) => [
  ...s.homes.map(homeObstacle),
  ...(warehouseDoor(s) ? [] : [{ x: 4.5, z: 2.8 }]),
  ...s.town.facilities.map((f) => ({
    ...f.position,
    headingRadians: f.headingRadians,
    halfWidth: 2,
    halfDepth: 2,
  })),
  ...s.town.orders.map((o) => ({
    ...o.position,
    headingRadians: o.headingRadians,
    halfWidth: 2.25,
    halfDepth: 2.25,
  })),
  ...BOKHOL_WATERS.map((w) => ({
    x: w.x,
    z: w.z,
    halfWidth: w.radius,
    halfDepth: w.radius,
  })),
];
const resourceDeposits = [
  ...BOKHOL_FORESTS.map((f) => ({ ...f, kind: "logging" })),
  ...BOKHOL_MINERALS.map((m) => ({
    ...m,
    kind: m.kind === "stone" ? "quarry" : m.kind,
  })),
];
export function connectedDeposits(
  s: TimberState,
  kind: BuildingKind,
  p: GroundPoint,
) {
  const sites = productionSites(s);
  return resourceDeposits
    .filter((d) => d.kind === kind && Math.hypot(p.x - d.x, p.z - d.z) <= 26)
    .sort(
      (a, b) =>
        Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(p.x - b.x, p.z - b.z),
    )
    .map((d) => sites.find((l) => l.siteId === d.id) ?? invalidTown());
}
export function mineralWorksites(s: TimberState, siteId: ProductionSiteId) {
  return (
    s.town.facilities.filter((f) => f.sourceId === siteId).length +
    s.town.orders.filter((o) => !o.upgradeTarget && o.sourceId === siteId)
      .length +
    Number(!!productionSites(s).find((site) => site.siteId === siteId)?.built) +
    Number(
      s.construction?.kind === "logging" && s.construction.siteId === siteId,
    )
  );
}
export function buildingSource(
  s: TimberState,
  kind: BuildingKind,
  p: GroundPoint,
): ProductionSiteId | null {
  return (
    connectedDeposits(s, kind, p).find((l) => l.remaining > 0)?.siteId ?? null
  );
}
export function buildingIssue(
  s: TimberState,
  kind: BuildingKind,
  p: HomePlacement,
): string | null {
  if (
    !Object.hasOwn(BUILDING_RULES, kind) ||
    !p?.position ||
    ![p.position.x, p.position.z, p.headingRadians].every(Number.isFinite) ||
    p.headingRadians < 0 ||
    p.headingRadians >= 2 * Math.PI
  )
    return "건물 종류·위치·방향을 확인해 주세요.";
  if (s.town.orders.length >= 100) return "건설 대기열 한도입니다.";
  if (
    kind === "home" &&
    s.homes.length + s.town.orders.filter((o) => o.kind === "home").length >=
      BOKHOL_MAP.maxHomes
  )
    return "둥지 수 한도입니다.";
  if (
    ["scout", "trade"].includes(kind) &&
    [...s.town.facilities, ...s.town.orders].some((f) => f.kind === kind)
  )
    return "정찰 거점과 교역소는 맵에 각각 한 곳만 건설할 수 있어요.";
  const protectedLand = reservedVillageLand(
    p.position,
    !!s.rebuilding,
    s.removedLandmarks,
  );
  if (protectedLand) return protectedLand;
  const rect = { ...p, halfWidth: 2.25, halfDepth: 2.25 };
  const samples = [-1, 0, 1].flatMap((x) =>
    [-1, 0, 1].map((z) => rotatedPoint(p, x * 2.25, z * 2.25)),
  );
  if (samples.some((q) => Math.abs(q.x) > 250 || Math.abs(q.z) > 250))
    return "지도 밖에는 지을 수 없어요.";
  if (samples.some((q) => waterAt(q, 0.5)))
    return "물 위에는 지을 수 없어요. 육지 쪽 물가를 골라 주세요.";
  const occupied = [
    ...s.homes.map((h) => ({
      ...h,
      headingRadians: h.headingRadians ?? Math.PI,
    })),
    ...s.town.facilities,
    ...s.town.orders,
    ...(s.construction
      ? [
          {
            ...s.construction,
            headingRadians: s.construction.headingRadians ?? 0,
          },
        ]
      : []),
  ];
  if (
    occupied.some((q) =>
      rectanglesOverlap(rect, { ...q, halfWidth: 2.25, halfDepth: 2.25 }),
    )
  )
    return "건물 또는 건설 대기 부지와 겹쳐요.";
  if (
    !warehouseDoor(s) &&
    Math.hypot(p.position.x - 4.5, p.position.z - 2.8) < 5
  )
    return "공동 야적장과 겹쳐요.";
  if (
    s.restaurantBuilt &&
    !s.town.facilities.some((f) => f.kind === "restaurant") &&
    Math.hypot(p.position.x + 4.3, p.position.z - 6) < 7
  )
    return "공동 식당과 겹쳐요.";
  for (const l of productionSites(s)) {
    const { workshopPlot, storagePlot } = loggingSiteRules(l.siteId);
    if (
      l.built &&
      Math.hypot(p.position.x - workshopPlot.x, p.position.z - workshopPlot.z) <
        7
    )
      return "기존 작업장과 겹쳐요.";
    if (
      l.storageBuilt &&
      Math.hypot(p.position.x - storagePlot.x, p.position.z - storagePlot.z) < 5
    )
      return "기존 저장소와 겹쳐요.";
  }
  if (
    BOKHOL_FORESTS.some(
      (f) =>
        samples.some(
          (q) => Math.abs(q.x - f.x) < 9.5 && Math.abs(q.z - f.z) < 11.5,
        ) &&
        (productionSites(s).find((l) => l.siteId === f.id)?.remaining ?? 0) > 0,
    )
  )
    return "숲이 서 있는 땅에는 지을 수 없어요.";
  if (
    ["logging", "coal", "iron", "quarry"].includes(kind) &&
    !buildingSource(s, kind, p.position)
  )
    return "해당 자원이 남아 있는 숲·광맥·암반 가까이에 지어 주세요.";
  if (kind === "coal" || kind === "iron" || kind === "quarry") {
    const source = buildingSource(s, kind, p.position);
    if (source && mineralWorksites(s, source) >= 2)
      return "이 광맥에는 건설 중인 곳을 포함해 채굴 시설을 두 곳까지 지을 수 있어요.";
  }
  if (
    kind === "waterworks" &&
    !waterAt(p.position, 8) &&
    Math.hypot(p.position.x - VILLAGE_POND.x, p.position.z - VILLAGE_POND.z) >
      VILLAGE_POND.r + 8
  )
    return "취수장은 수원지 옆 육지에 지어 주세요.";
  if (kind === "fishery" && !waterAt(p.position, 7))
    return "물고기가 모이는 물가에만 어획막을 지을 수 있어요.";
  if (
    BOKHOL_MINERALS.some(
      (m) => Math.hypot(p.position.x - m.x, p.position.z - m.z) < 10,
    )
  )
    return "채굴할 암반·광맥 자체를 건물로 덮을 수 없어요.";
  const door = facilityDoor(p);
  if (
    !residentPath(door, door, townObstacles(s)).length ||
    occupied.some((h) =>
      [homeEntrance(h), facilityDoor(h)].some((position) =>
        rectanglesOverlap(rect, {
          position,
          headingRadians: 0,
          halfWidth: 0.45,
          halfDepth: 0.45,
        }),
      ),
    )
  )
    return "출입구와 접근 공간을 비워 주세요.";
  for (const [resource, amount] of Object.entries(BUILDING_RULES[kind].cost)) {
    const id = resource as ResourceId;
    const available =
      Math.floor(s.world.resources[id] / AMOUNT_SCALE) -
      (id === "RES_WOOD" ? s.reservedWood : 0);
    if (available < amount)
      return `${GAME_RULES.resources[id].name} 부족 · 필요 ${amount}, 사용 가능 ${available}`;
  }
  return null;
}
export function payTown(s: TimberState, cost: Cost): TimberState {
  if (
    Object.entries(cost).some(
      ([r, n]) =>
        !Object.hasOwn(s.world.resources, r) ||
        !Number.isSafeInteger(n) ||
        n < 0 ||
        s.world.resources[r as ResourceId] -
          (r === "RES_WOOD" ? s.reservedWood * AMOUNT_SCALE : 0) <
          n * AMOUNT_SCALE,
    )
  )
    throw Error("필요한 자원이 부족합니다.");
  const resources = { ...s.world.resources },
    spent = { ...s.town.spent };
  for (const [r, n] of Object.entries(cost)) {
    resources[r as ResourceId] -= n * AMOUNT_SCALE;
    spent[r as ResourceId] = (spent[r as ResourceId] ?? 0) + n;
  }
  return {
    ...s,
    woodSpent: s.woodSpent + (cost.RES_WOOD ?? 0),
    world: { ...s.world, resources },
    town: { ...s.town, spent },
  };
}
export function planBuilding(
  s: TimberState,
  kind: BuildingKind,
  pose: HomePlacement,
): TimberState {
  const issue = buildingIssue(s, kind, pose);
  if (issue) throw Error(issue);
  const n = clearBuildingFootprint(
    payTown(s, BUILDING_RULES[kind].cost),
    pose,
    2.25,
    facilityDoor(pose),
    townObstacles(s),
  );
  const order: BuildingOrder = {
    ...pose,
    id: `build-${n.town.nextId}`,
    priceVersion: 4,
    kind,
    sourceId: buildingSource(s, kind, pose.position),
    crew: [],
    stage: "waiting",
    workDone: 0,
  };
  if (!n.town.orders.length && townShiftOpen(n, order.id)) {
    order.crew = freeTownResidents(n, facilityDoor(order), 4);
    if (order.crew.length) order.stage = "collect";
  }
  return {
    ...n,
    residents: n.residents.map((r) =>
      order.crew.includes(r.id)
        ? {
            ...r,
            task: `build-order:${order.id}`,
            routine: "working",
            request: null,
            diningSeat: null,
            eatingUntil: null,
            insideHome: false,
          }
        : r,
    ),
    town: {
      ...n.town,
      nextId: n.town.nextId + 1,
      orders: [...n.town.orders, order],
    },
  };
}
export function idleTownResidents(s: TimberState) {
  const children = new Set(
    s.world.citizens.filter((c) => c.age === "child").map((c) => c.id),
  );
  return s.residents.filter(
    (r) =>
      r.health === "healthy" &&
      (s.childLabor || !children.has(r.id)) &&
      !r.workplaceId &&
      !r.task &&
      !r.nextWork &&
      r.routine !== "eating" &&
      !s.workerIds.includes(r.id) &&
      !s.town.trips.some((t) => t.ids.includes(r.id)),
  );
}
export function freeTownResidents(
  s: TimberState,
  p: GroundPoint,
  count: number,
): string[] {
  if (count <= 0) return [];
  const obstacles = townObstacles(s);
  const length = (id: string, path: GroundPoint[]) => {
    let q = findById(s.residents, id)?.position ?? p,
      n = 0;
    for (const p of path) {
      n += Math.hypot(q.x - p.x, q.z - p.z);
      q = p;
    }
    return n;
  };
  return idleTownResidents(s)
    .map((r) => {
      const path = residentPath(r.position, p, obstacles);
      return { id: r.id, path, length: length(r.id, path) };
    })
    .filter((r) => r.path.length)
    .sort((a, b) => a.length - b.length)
    .slice(0, count)
    .map((r) => r.id);
}
export const orderResting = (s: TimberState, id: string) =>
  !residentShiftOpen(s, id) && s.town.orders.some((o) => o.crew.includes(id));
export function advanceTown(input: TimberState, minutes: number): TimberState {
  if (!minutes) return input;
  let s = input;
  const waiting = input.town.orders.slice(1);
  if (waiting.some((o) => o.crew.length)) {
    const tasks = new Set(waiting.map((o) => `build-order:${o.id}`));
    s = {
      ...s,
      residents: s.residents.map((r) =>
        r.task && tasks.has(r.task) ? { ...r, task: null, routine: "idle" } : r,
      ),
      town: {
        ...s.town,
        orders: s.town.orders.map((o, i) =>
          i && o.crew.length ? { ...o, crew: [] } : o,
        ),
      },
    };
  }
  for (const first of input.town.orders.slice(0, 1)) {
    const open = first ? townShiftOpen(s, first.id) : false;
    if (
      first &&
      (open ||
        s.residents.some(
          (r) => r.health === "healthy" && isMechanical(s, r.id),
        ))
    ) {
      const o = {
        ...first,
        crew: first.crew.filter((id) =>
          s.residents.some((r) => r.id === id && r.health === "healthy"),
        ),
      };
      const extra = (
        o.crew.length < 4
          ? freeTownResidents(s, facilityDoor(o), s.residents.length)
          : []
      )
        .filter((id) => open || isMechanical(s, id))
        .slice(0, 4 - o.crew.length);
      o.crew = [...o.crew, ...extra];
      const active = o.crew.filter((id) => open || isMechanical(s, id));
      if (active.length) {
        if (o.stage === "waiting") o.stage = "collect";
        const goal =
          o.stage === "collect"
            ? (warehouseDoor(s, o.position) ?? { x: 4.5, z: 0.6 })
            : facilityDoor(o);
        s = {
          ...s,
          residents: s.residents.map((r) => {
            if (first.crew.includes(r.id) && !o.crew.includes(r.id))
              return { ...r, task: null };
            if (!active.includes(r.id)) return r;
            return {
              ...r,
              position: moveOnGround(
                r.position,
                goal,
                minutes,
                2,
                townObstacles(s),
              ),
              task: `build-order:${o.id}`,
              routine: "working",
              insideHome: false,
              eatingUntil: null,
              diningSeat: null,
              request: null,
            };
          }),
        };
        const arrived = active.every((id) => {
          const r = s.residents.find((r) => r.id === id) ?? invalidTown();
          return (
            Math.hypot(r.position.x - goal.x, r.position.z - goal.z) < 0.01
          );
        });
        if (arrived && o.stage === "collect") o.stage = "deliver";
        else if (arrived && o.stage === "deliver") o.stage = "build";
        else if (o.stage === "build")
          o.workDone +=
            active.reduce((n, id) => {
              const r = s.residents.find((r) => r.id === id) ?? invalidTown();
              return (
                n +
                (Math.hypot(r.position.x - goal.x, r.position.z - goal.z) < 0.01
                  ? buildingPower(s, id)
                  : 0)
              );
            }, 0) * minutes;
      }
      s = {
        ...s,
        town: {
          ...s.town,
          orders: s.town.orders.map((q) => (q.id === o.id ? o : q)),
        },
      };
      if (o.workDone >= orderWork(o)) {
        let residents = s.residents.map((r) =>
          o.crew.includes(r.id)
            ? { ...r, task: null, routine: "idle" as const }
            : r,
        );
        if (o.upgradeTarget) {
          s = {
            ...s,
            town: {
              ...s.town,
              facilities: s.town.facilities.map((f) =>
                f.id === o.upgradeTarget
                  ? { ...f, level: o.upgradeLevel ?? f.level }
                  : f,
              ),
            },
          };
          s = {
            ...s,
            homes: s.homes.map((h) =>
              h.id === o.upgradeTarget
                ? {
                    ...h,
                    level: o.upgradeLevel ?? h.level ?? 1,
                    capacity: 20 + ((o.upgradeLevel ?? 1) - 1) * 10,
                  }
                : h,
            ),
          };
          residents = assignHomes(residents, s.world.citizens, usableHomes(s));
        } else if (o.kind === "home") {
          const homes = [
            ...s.homes,
            {
              id: nextDwellingId(s.homes),
              ...(o.priceVersion && { priceVersion: o.priceVersion }),
              position: o.position,
              headingRadians: o.headingRadians,
              capacity: VILLAGE_RULES.homeSpace,
            },
          ];
          residents = assignHomes(
            residents,
            s.world.citizens,
            usableHomes(s, homes),
          );
          s = {
            ...s,
            homes,
            world: {
              ...s.world,
              buildings: homes.map((h) => ({
                id: h.id,
                type: "ondol-nest",
                position: { ...h.position, y: 0 },
                headingRadians: h.headingRadians ?? Math.PI,
              })),
            },
          };
        } else {
          const f: Facility = {
            ...o,
            kind: o.kind,
            level: 1,
            target:
              o.kind === "workshop"
                ? 0
                : Math.min(o.crew.length, BUILDING_RULES[o.kind].staff),
            progress: 0,
            yieldRemainder: 0,
            buffer: 0,
            delivered: 0,
            haul: null,
          };
          const firstRestaurant =
            f.kind === "restaurant" &&
            !s.town.facilities.some((site) => site.kind === "restaurant");
          if (
            firstRestaurant &&
            s.rebuilding &&
            !s.chapter &&
            !s.firstRationSet
          )
            f.target = 0;
          const retained = o.crew.slice(0, f.target);
          residents = residents.map((r) =>
            retained.includes(r.id)
              ? {
                  ...r,
                  workplaceId: firstRestaurant
                    ? "restaurant"
                    : `facility:${f.id}`,
                  insideHome: false,
                }
              : r,
          );
          s = {
            ...s,
            restaurantWorkerTarget: firstRestaurant
              ? f.target
              : s.restaurantWorkerTarget,
            restaurantBuilt: s.restaurantBuilt || o.kind === "restaurant",
            town: { ...s.town, facilities: [...s.town.facilities, f] },
          };
        }
        s = {
          ...s,
          residents,
          town: {
            ...s.town,
            orders: s.town.orders.filter((q) => q.id !== o.id),
          },
        };
      }
    }
  }
  return advanceHospital(
    advanceDevelopment(advanceTownProduction(s, minutes), minutes),
    minutes,
  );
}
export const facilityResource = (f: Facility): ResourceId | null =>
  (
    ({
      logging: "RES_WOOD",
      coal: "RES_COAL",
      iron: "RES_IRON_ORE",
      quarry: "RES_STONE",
      waterworks: "RES_WATER",
      fishery: "RES_FISH",
      farm: "RES_PLANT",
      ranch: "RES_MEAT",
    }) as Partial<Record<BuildingKind, ResourceId>>
  )[f.kind] ?? null;
const landmarkKinds: Record<string, BuildingKind> = {
  BLD_WAREHOUSE: "storage",
  BLD_WORKSHOP: "workshop",
  BLD_FORAGE: "farm",
  BLD_GREENHOUSE: "farm",
  BLD_WATER: "storage",
  BLD_FISHERY: "fishery",
  BLD_CLINIC: "hospital",
  BLD_SALVAGE: "quarry",
};
export function demolishableLandmark(s: TimberState, target: string) {
  return VILLAGE_LAYOUT.find(
    ([id, x, z]) =>
      target === `village:${id}:${x}:${z}` &&
      Object.hasOwn(landmarkKinds, id) &&
      !s.removedLandmarks?.includes(id) &&
      !(s.rebuilding && ["BLD_CLINIC", "BLD_WORKSHOP"].includes(id)),
  )?.[0];
}
export function salvageMaterials(s: TimberState, id: string): Cost {
  const building = upgradeTarget(s, id);
  const landmark = demolishableLandmark(s, id);
  const kind = landmark && landmarkKinds[landmark];
  if (!building && !kind) return {};
  const cost: Cost = !building
    ? originalBuildingCost(kind as BuildingKind)
    : building.kind === "home" && building.timberCost !== undefined
      ? { RES_WOOD: building.timberCost }
      : { ...constructionCost(building.kind, building.priceVersion ?? 1) };
  for (let level = 1; level < (building?.level ?? 1); level++) {
    for (const [key, n] of Object.entries(
      upgradeCost({ kind: building?.kind ?? (kind as BuildingKind), level }),
    )) {
      const r = key as ResourceId;
      cost[r] = (cost[r] ?? 0) + n;
    }
  }
  const rate = (s.mutantDamage?.[id] ?? 0) > 0 ? 0.1 : 0.9;
  return Object.fromEntries(
    Object.entries(cost).map(([r, n]) => [r, Math.floor(n * rate)]),
  );
}
export function demolishBuilding(s: TimberState, id: string): TimberState {
  const b = upgradeTarget(s, id);
  if (!b) {
    const landmark = demolishableLandmark(s, id);
    if (!landmark) throw Error("철거할 건물이 없습니다.");
    const refund = salvageMaterials(s, id);
    for (const [r, n] of Object.entries(refund))
      s = deposit(s, r as ResourceId, n);
    return {
      ...s,
      removedLandmarks: [...(s.removedLandmarks ?? []), landmark],
    };
  }
  const dev = s.town.development;
  if (
    s.town.orders.some((o) => o.upgradeTarget === id) ||
    s.town.trips.some((t) => t.facilityId === id) ||
    dev.research.some((job) => job.facility === id) ||
    s.town.patients.some((p) => p.hospital === id)
  )
    throw Error("진행 중인 개량·파견·연구·치료를 마친 뒤 철거할 수 있습니다.");
  if (b.kind !== "home" && b.haul)
    throw Error("운반 중인 수레가 돌아오면 철거할 수 있습니다.");
  if (id === "example-building-1" && s.repairWorkerId)
    throw Error("보수 공사가 진행 중입니다.");
  const refund = salvageMaterials(s, id);
  if (b.kind !== "home" && b.buffer) {
    const r = facilityResource(b);
    if (r) s = deposit(s, r, b.buffer);
  }
  const homes = s.homes.filter((h) => h.id !== id);
  const facilities = s.town.facilities.filter((f) => f.id !== id);
  const primary = s.town.facilities.find((f) => f.kind === "restaurant");
  const nextRestaurant = facilities.find((f) => f.kind === "restaurant");
  const residents = s.residents.map((r) => {
    const workplaceId =
      r.workplaceId === `facility:${id}` ||
      (primary?.id === id && r.workplaceId === "restaurant")
        ? null
        : primary?.id === id &&
            nextRestaurant &&
            r.workplaceId === `facility:${nextRestaurant.id}`
          ? "restaurant"
          : r.workplaceId;
    if (b.kind === "restaurant" && r.diningSeat !== null)
      return {
        ...r,
        workplaceId,
        eatingUntil: null,
        diningSeat: null,
        routine: "idle" as const,
      };
    return workplaceId !== r.workplaceId ? { ...r, workplaceId } : r;
  });
  const damage = { ...s.mutantDamage };
  delete damage[id];
  s = {
    ...s,
    homes,
    residents:
      b.kind === "home"
        ? assignHomes(residents, s.world.citizens, usableHomes(s, homes))
        : residents,
    mutantDamage: damage,
    ...(b.kind === "trade" &&
      !facilities.some((f) => f.kind === "trade") && {
        merchantRepair: undefined,
        merchantItem: undefined,
      }),
    restaurantBuilt: primary?.id === id ? !!nextRestaurant : s.restaurantBuilt,
    restaurantWorkerTarget:
      primary?.id === id
        ? (nextRestaurant?.target ?? 0)
        : s.restaurantWorkerTarget,
    world: {
      ...s.world,
      buildings: s.world.buildings.filter((h) => h.id !== id),
    },
    town: {
      ...s.town,
      facilities,
      development: {
        ...dev,
        electrical: dev.electrical.filter((x) => x !== id),
        overtime: dev.overtime.filter((o) => o.target !== id),
        grandfathered: dev.grandfathered.filter((x) => !x.startsWith(id + ":")),
      },
    },
  };
  for (const [r, n] of Object.entries(refund))
    s = deposit(s, r as ResourceId, n);
  return s;
}
export function directStaff(
  s: TimberState,
  residentId: string,
  destination: string | null,
): TimberState {
  const r = s.residents.find((r) => r.id === residentId);
  const citizen = s.world.citizens.find((c) => c.id === residentId);
  const previous = s.town.facilities.find(
    (f) => "facility:" + f.id === r?.workplaceId,
  );
  const next = s.town.facilities.find((f) => f.id === destination);
  if (
    !r ||
    !citizen?.alive ||
    (!s.childLabor && citizen.age === "child") ||
    r.health !== "healthy" ||
    r.task ||
    r.nextWork ||
    r.routine === "eating" ||
    s.workerIds.includes(r.id) ||
    s.town.trips.some((t) => t.ids.includes(r.id)) ||
    (r.workplaceId && (!previous || !canDirectStaff(previous.kind))) ||
    (destination !== null && (!next || !canDirectStaff(next.kind)))
  )
    throw Error("지금은 이 주민을 배치할 수 없습니다.");
  if (next?.id === previous?.id) return s;
  const assigned = (id: string) =>
    s.residents.filter((r) => r.workplaceId === "facility:" + id).length;
  if (
    next &&
    (assigned(next.id) >= facilityStaffLimit(next) ||
      !residentPath(r.position, facilityDoor(next), townObstacles(s)).length)
  )
    throw Error("근무지의 빈자리와 이동 경로를 확인해 주세요.");
  return {
    ...s,
    residents: s.residents.map((q) =>
      q.id === residentId
        ? {
            ...q,
            workplaceId: next ? "facility:" + next.id : null,
            insideHome: false,
          }
        : q,
    ),
    town: {
      ...s.town,
      facilities: s.town.facilities.map((f) =>
        f.id === previous?.id
          ? { ...f, target: Math.max(0, f.target - 1) }
          : f.id === next?.id
            ? { ...f, target: Math.max(f.target, assigned(f.id) + 1) }
            : f,
      ),
    },
  };
}
export function setFacilityStaff(
  s: TimberState,
  id: string,
  count: number,
): TimberState {
  const f = s.town.facilities.find((f) => f.id === id);
  if (
    !f ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > facilityStaffLimit(f)
  )
    throw Error("운영 인원 지시가 올바르지 않습니다.");
  const primary = s.town.facilities.find((q) => q.kind === "restaurant");
  return {
    ...s,
    restaurantWorkerTarget:
      f.kind === "restaurant" && primary?.id === f.id
        ? count
        : s.restaurantWorkerTarget,
    town: {
      ...s.town,
      facilities: s.town.facilities.map((f) =>
        f.id === id ? { ...f, target: count } : f,
      ),
    },
  };
}
export function staffTown(input: TimberState): TimberState {
  let s = input;
  for (const f of s.town.facilities) {
    if (
      !facilityStaffLimit(f) ||
      (f.kind === "restaurant" &&
        s.town.facilities.find((q) => q.kind === "restaurant")?.id === f.id)
    )
      continue;
    const away = s.town.trips.find((t) => t.facilityId === f.id);
    const traveling = new Set(away?.ids ?? []);
    let ids = s.residents
      .filter(
        (r) => r.workplaceId === `facility:${f.id}` && r.health === "healthy",
      )
      .sort((a, b) => Number(traveling.has(b.id)) - Number(traveling.has(a.id)))
      .slice(0, Math.max(f.target, away?.ids.length ?? 0))
      .map((r) => r.id);
    s = {
      ...s,
      residents: s.residents.map((r) =>
        r.workplaceId === `facility:${f.id}` && !ids.includes(r.id)
          ? { ...r, workplaceId: null }
          : r,
      ),
    };
    ids = [
      ...ids,
      ...freeTownResidents(s, facilityDoor(f), f.target - ids.length),
    ];
    s = {
      ...s,
      residents: s.residents.map((r) =>
        ids.includes(r.id)
          ? { ...r, workplaceId: `facility:${f.id}`, insideHome: false }
          : r,
      ),
    };
  }
  return s;
}
export function deposit(s: TimberState, r: ResourceId, n: number): TimberState {
  return {
    ...s,
    world: {
      ...s.world,
      resources: {
        ...s.world.resources,
        [r]: s.world.resources[r] + n * AMOUNT_SCALE,
      },
    },
    town: {
      ...s.town,
      received: { ...s.town.received, [r]: (s.town.received[r] ?? 0) + n },
    },
  };
}
function advanceTownProduction(
  input: TimberState,
  minutes: number,
): TimberState {
  let s = input;
  for (const original of s.town.facilities) {
    const f = { ...original };
    const resource = facilityResource(f);
    if (!resource || s.mutantDamage?.[f.id] === 100) continue;
    const workers = s.residents.filter(
      (r) =>
        r.workplaceId === `facility:${f.id}` &&
        r.health === "healthy" &&
        residentShiftOpen(s, r.id) &&
        r.routine === "working" &&
        Math.hypot(
          r.position.x - facilityDoor(f).x,
          r.position.z - facilityDoor(f).z,
        ) < 0.01,
    );
    const power = !s.town.orders.some(
      (o) => o.upgradeTarget === f.id && o.stage !== "waiting",
    )
      ? workers.reduce((n, r) => n + buildingPower(s, r.id), 0)
      : 0;
    f.progress =
      Math.round(
        (f.progress +
          power *
            (f.sourceId ? 30 : 1) *
            minutes *
            collectionRate(s, f) *
            productionMultiplier(s.campaign?.difficulty)) *
          1000,
      ) / 1000;
    const unitWork = 30;
    while (power > 0 && f.progress >= unitWork && f.buffer < 20) {
      let amount = f.kind === "farm" ? 3 : f.kind === "ranch" ? 2 : 1;
      const yieldUnits = amount * 6 + f.yieldRemainder;
      const extraYield =
        f.kind === "farm" &&
        collectionRate(s, f) === 1 &&
        hasResearch(s, "TECH_CULTURE");
      if (extraYield) amount = Math.floor(yieldUnits / 5);
      if (f.buffer + amount > 20) break;
      const cost: Cost =
        f.kind === "farm"
          ? { RES_WATER: 1, ...(s.town.cold ? { RES_COAL: 1 } : {}) }
          : f.kind === "ranch"
            ? { RES_PLANT: 1, RES_WATER: 1 }
            : {};
      if (
        Object.entries(cost).some(
          ([r, n]) => s.world.resources[r as ResourceId] < n * AMOUNT_SCALE,
        )
      )
        break;
      if (f.sourceId) {
        let l = productionSites(s).find((site) => site.siteId === f.sourceId);
        if (!l?.remaining) {
          // Quarries and mines move on like sawmills, within the per-deposit cap.
          l = connectedDeposits(s, f.kind, f.position).find(
            (site) =>
              site.remaining > 0 &&
              (f.kind === "logging" || mineralWorksites(s, site.siteId) < 2),
          );
          if (!l) {
            f.progress = 0;
            break;
          }
          f.sourceId = l.siteId;
        }
        amount = Math.min(amount, l.remaining);
        s = setLoggingSite(s, { ...l, remaining: l.remaining - amount });
        s = {
          ...s,
          town: {
            ...s.town,
            extracted: {
              ...s.town.extracted,
              [f.sourceId]: (s.town.extracted[f.sourceId] ?? 0) + amount,
            },
          },
        };
      }
      s = payTown(s, cost);
      if (extraYield) f.yieldRemainder = yieldUnits % 5;
      f.progress -= unitWork;
      f.buffer += Math.min(amount, 20 - f.buffer);
    }
    f.progress = Math.min(f.progress, unitWork);
    const destination = warehouseDoor(s, f.position) ?? { x: 4.5, z: 0.6 };
    if (f.kind === "fishery") {
      const amount = f.buffer;
      s = deposit(s, resource, amount);
      f.buffer -= amount;
      f.delivered += amount;
    }
    if (
      f.kind !== "fishery" &&
      !f.haul &&
      f.buffer >= 5 &&
      workplaceOpen(s.world.minute)
    ) {
      const id = freeTownResidents(s, facilityDoor(f), 1)[0];
      if (id) {
        f.haul = { worker: id, cargo: Math.min(5, f.buffer), stage: "pickup" };
        f.buffer -= f.haul.cargo;
      }
    }
    if (f.haul) {
      let h = { ...f.haul },
        r = s.residents.find((r) => r.id === h.worker);
      if (r?.health !== "healthy") {
        if (r)
          s = {
            ...s,
            residents: s.residents.map((q) =>
              q.id === r?.id ? { ...q, task: null } : q,
            ),
          };
        const id = freeTownResidents(s, r?.position ?? facilityDoor(f), 1)[0];
        if (id) h.worker = id;
        else {
          f.haul = h;
          s = {
            ...s,
            town: {
              ...s.town,
              facilities: s.town.facilities.map((q) => (q.id === f.id ? f : q)),
            },
          };
          continue;
        }
        r = s.residents.find((r) => r.id === h.worker);
      }
      if (r) {
        const goal = h.stage === "store" ? destination : facilityDoor(f),
          position = moveOnGround(
            r.position,
            goal,
            minutes,
            2,
            townObstacles(s),
          );
        s = {
          ...s,
          residents: s.residents.map((q) =>
            q.id === h.worker
              ? {
                  ...q,
                  position,
                  task: `facility-haul:${f.id}`,
                  insideHome: false,
                  routine: "working",
                  eatingUntil: null,
                  diningSeat: null,
                  request: null,
                }
              : q,
          ),
        };
        if (Math.hypot(position.x - goal.x, position.z - goal.z) < 0.01) {
          if (h.stage === "pickup") h.stage = "store";
          else if (h.stage === "store") {
            const unloaded = h.cargo;
            s = deposit(s, resource, unloaded);
            f.delivered += unloaded;
            h = {
              ...h,
              cargo: h.cargo - unloaded,
              stage: unloaded === h.cargo ? "return" : "store",
            };
          } else {
            s = {
              ...s,
              residents: s.residents.map((q) =>
                q.id === h.worker ? { ...q, task: null } : q,
              ),
            };
            f.haul = null;
          }
        }
        if (f.haul) f.haul = h;
      }
    }
    s = {
      ...s,
      town: {
        ...s.town,
        facilities: s.town.facilities.map((q) => (q.id === f.id ? f : q)),
      },
    };
  }
  return advanceTrips(s, minutes);
}
export function dispatchFood(
  s: TimberState,
  facilityId: string,
  food: FoodId,
  rank: 1 | 2 | 3 = tradeRank(s),
): TimberState {
  if (!Number.isInteger(rank) || rank < 1 || rank > tradeRank(s))
    throw Error("아직 열리지 않은 교역·정찰 범위입니다.");
  const f = s.town.facilities.find((f) => f.id === facilityId);
  if (
    !f ||
    s.mutantDamage?.[f.id] === 100 ||
    !["scout", "trade"].includes(f.kind) ||
    !["RES_PLANT", "RES_MEAT", "RES_FISH"].includes(food)
  )
    throw Error("파견할 거점과 식량을 확인해 주세요.");
  if (f.kind === "trade" && capitalRoad(s) === "closed")
    throw Error("눈에 길이 막혀 교역 수레를 보낼 수 없습니다.");
  if (!workplaceOpen(s.world.minute))
    throw Error("파견은 일과시간에 지시해 주세요.");
  if (s.town.trips.some((t) => t.facilityId === f.id))
    throw Error("이미 파견 중입니다.");
  const ids = s.residents
    .filter(
      (r) =>
        r.workplaceId === `facility:${f.id}` &&
        r.health === "healthy" &&
        !r.task &&
        !s.town.trips.some((t) => t.ids.includes(r.id)),
    )
    .slice(0, f.kind === "scout" ? 2 : 1)
    .map((r) => r.id);
  if (ids.length !== (f.kind === "scout" ? 2 : 1))
    throw Error("거점에 파견 인력을 먼저 배치해 주세요.");
  if (
    f.kind === "trade" &&
    s.world.resources.RES_WOOD - s.reservedWood * AMOUNT_SCALE <
      ([5, 8, 12][rank - 1] ?? 5) * AMOUNT_SCALE
  )
    throw Error("교역에 필요한 목재가 부족합니다.");
  let n =
    f.kind === "trade"
      ? payTown(s, { RES_WOOD: [5, 8, 12][rank - 1] ?? 5 })
      : s;
  const trip: Expedition = {
    id: `trip-${s.town.nextId}`,
    facilityId,
    kind: f.kind === "scout" ? "hunt" : "trade",
    food: f.kind === "scout" ? "RES_MEAT" : food,
    ids,
    stage: "outbound",
    progress: 0,
    cargo: 0,
    rank,
    goal:
      f.kind === "scout"
        ? { x: -60 - (rank - 1) * 50, z: -20 - (rank - 1) * 25 }
        : { x: [80, 150, 220][rank - 1] ?? 80, z: 0 },
  };
  n = {
    ...n,
    paused: s.campaign ? s.paused : false,
    town: {
      ...n.town,
      nextId: n.town.nextId + 1,
      trips: [...n.town.trips, trip],
    },
    residents: n.residents.map((r) =>
      ids.includes(r.id)
        ? { ...r, task: `expedition:${trip.id}`, insideHome: false }
        : r,
    ),
  };
  return n;
}
function advanceTrips(input: TimberState, minutes: number): TimberState {
  let s = input;
  for (const old of s.town.trips) {
    const t = { ...old };
    const road = t.kind === "trade" ? capitalRoad(s) : "open";
    if (road === "closed") continue;
    const f =
      s.town.facilities.find((f) => f.id === t.facilityId) ?? invalidTown();
    if (
      t.ids.some(
        (id) => s.residents.find((r) => r.id === id)?.health !== "healthy",
      )
    )
      continue;
    const goal = t.stage === "return" ? facilityDoor(f) : t.goal;
    s = {
      ...s,
      residents: s.residents.map((r) =>
        t.ids.includes(r.id)
          ? {
              ...r,
              position: moveOnGround(
                r.position,
                goal,
                road === "slow" ? minutes / 2 : minutes,
                t.kind === "hunt"
                  ? 2 *
                      (hasResearch(s, "TECH_FLIGHT")
                        ? 10
                        : 1.25 * scoutSpeedRate(s))
                  : 2,
                townObstacles(s),
              ),
              insideHome: false,
              routine: "working",
            }
          : r,
      ),
    };
    if (
      t.ids.every((id) => {
        const r = s.residents.find((r) => r.id === id) ?? invalidTown();
        return Math.hypot(r.position.x - goal.x, r.position.z - goal.z) < 0.01;
      })
    ) {
      if (t.stage === "outbound") t.stage = "gather";
      else if (
        t.stage === "gather" &&
        (t.kind === "trade" || workplaceOpen(s.world.minute))
      ) {
        t.progress = Math.min(
          60,
          t.progress +
            t.ids.reduce((n, id) => n + buildingPower(s, id), 0) *
              minutes *
              levelProductionRate(f) *
              (t.kind === "hunt"
                ? productionMultiplier(s.campaign?.difficulty)
                : 1),
        );
        if (t.progress >= 60) {
          t.cargo =
            t.kind === "hunt"
              ? ([8, 12, 18][t.rank - 1] ?? 8)
              : ([10, 16, 24][t.rank - 1] ?? 10);
          t.stage = "return";
        }
      } else if (t.stage === "return") {
        const unloaded = t.cargo;
        s = deposit(s, t.food, unloaded);
        t.cargo -= unloaded;
        if (t.cargo > 0) {
          s = {
            ...s,
            town: {
              ...s.town,
              trips: s.town.trips.map((q) => (q.id === t.id ? t : q)),
            },
          };
          continue;
        }
        if (t.kind === "trade")
          s = {
            ...s,
            town: {
              ...s.town,
              development: {
                ...s.town.development,
                tradeCount: s.town.development.tradeCount + 1,
              },
            },
          };
        s = {
          ...s,
          residents: s.residents.map((r) =>
            t.ids.includes(r.id) ? { ...r, task: null } : r,
          ),
          scoutVisitors:
            t.kind === "hunt" ? (s.scoutVisitors ?? 0) + 1 : s.scoutVisitors,
          town: { ...s.town, trips: s.town.trips.filter((q) => q.id !== t.id) },
        };
        continue;
      }
    }
    s = {
      ...s,
      town: {
        ...s.town,
        trips: s.town.trips.map((q) => (q.id === t.id ? t : q)),
      },
    };
  }
  return s;
}

export function townValid(s: TimberState): boolean {
  const t = s.town;
  const n = (v: unknown, max = 1e9): v is number =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
  const pose = (v: unknown): boolean =>
    isRecord(v) &&
    isRecord(v.position) &&
    n(Math.abs(Number(v.position.x)), 250) &&
    n(Math.abs(Number(v.position.z)), 250) &&
    typeof v.position.x === "number" &&
    typeof v.position.z === "number" &&
    n(v.headingRadians, 2 * Math.PI - 1e-10);
  const costs = (v: unknown) =>
    isRecord(v) &&
    Object.entries(v).every(
      ([r, q]) =>
        Object.hasOwn(s.world.resources, r) && n(q) && Number.isInteger(q),
    );
  if (
    !isRecord(t) ||
    !Number.isSafeInteger(t.nextId) ||
    t.nextId < 1 ||
    typeof t.cold !== "boolean" ||
    !costs(t.spent) ||
    !costs(t.received) ||
    !isRecord(t.extracted) ||
    !Array.isArray(t.orders) ||
    !Array.isArray(t.facilities) ||
    !Array.isArray(t.trips) ||
    t.orders.length > 100 ||
    t.facilities.length > 600 ||
    t.trips.length > 100
  )
    return false;
  const all = [...t.orders, ...t.facilities];
  if (new Set(all.map((q) => q?.id)).size !== all.length) return false;
  const sourceValid = (q: BuildingOrder | Facility) => {
    if (!["logging", "coal", "iron", "quarry"].includes(q.kind))
      return q.sourceId === null;
    const d = [
      ...BOKHOL_FORESTS.map((f) => ({ ...f, kind: "logging" })),
      ...BOKHOL_MINERALS.map((m) => ({
        ...m,
        kind: m.kind === "stone" ? "quarry" : m.kind,
      })),
    ].find((d) => d.id === q.sourceId);
    return (
      !!d &&
      d.kind === q.kind &&
      Math.hypot(q.position.x - d.x, q.position.z - d.z) <= 26
    );
  };
  if (
    all.some(
      (q) =>
        !isRecord(q) ||
        typeof q.id !== "string" ||
        !/^build-\d+$/.test(q.id) ||
        !Object.hasOwn(BUILDING_RULES, q.kind) ||
        (q.priceVersion !== undefined &&
          q.priceVersion !== 2 &&
          q.priceVersion !== 3 &&
          q.priceVersion !== 4) ||
        !pose(q) ||
        !sourceValid(q),
    )
  )
    return false;
  if (all.some((q) => Number(q.id.slice(6)) >= t.nextId)) return false;
  if (!developmentValid(s) || !hospitalValid(s)) return false;
  for (const o of t.orders)
    if (o.upgradeTarget) {
      const f = upgradeTarget(s, o.upgradeTarget);
      if (
        !f ||
        f.level >= 3 ||
        o.upgradeLevel !== f.level + 1 ||
        o.kind !== f.kind ||
        o.position.x !== f.position.x ||
        o.position.z !== f.position.z ||
        o.headingRadians !== f.headingRadians ||
        t.orders.filter((q) => q.upgradeTarget === f.id).length !== 1
      )
        return false;
    } else if (o.upgradeLevel !== undefined) return false;
  const minimum: Cost = {};
  for (const id of [
    ...t.development.completed,
    ...t.development.research.map((j) => j.tech),
  ]) {
    const r = RESEARCH_CATALOG.find((r) => r.id === id);
    if (!r) return false;
    for (const [resource, n] of Object.entries(r.cost))
      minimum[resource as ResourceId] =
        (minimum[resource as ResourceId] ?? 0) + n;
  }

  for (const f of [
    ...t.facilities,
    ...s.homes.map((h) => upgradeTarget(s, h.id) ?? invalidTown()),
  ]) {
    for (let level = 1; level < f.level; level++) {
      const research = upgradeResearch(f.kind, level + 1);
      if (
        !research ||
        (!t.development.completed.includes(research) &&
          !t.development.grandfathered.includes(`${f.id}:${level + 1}`))
      )
        return false;
      for (const [r, n] of Object.entries(
        upgradeCost({ ...f, level: level as 1 | 2 }),
      ))
        minimum[r as ResourceId] = (minimum[r as ResourceId] ?? 0) + n;
    }
  }

  for (const q of all)
    for (const [r, n] of Object.entries(
      "upgradeTarget" in q && q.upgradeTarget
        ? upgradeCost(upgradeTarget(s, q.upgradeTarget) ?? invalidTown())
        : constructionCost(q.kind, q.priceVersion ?? 1),
    ))
      minimum[r as ResourceId] = (minimum[r as ResourceId] ?? 0) + n;
  if (
    Object.entries(minimum).some(
      ([r, n]) => (t.spent[r as ResourceId] ?? 0) < n,
    ) ||
    s.woodSpent < (t.spent.RES_WOOD ?? 0)
  )
    return false;
  const reserved = new Set<string>();
  for (const o of t.orders) {
    if (
      !Array.isArray(o.crew) ||
      o.crew.length > 4 ||
      new Set(o.crew).size !== o.crew.length ||
      !["waiting", "collect", "deliver", "build"].includes(o.stage) ||
      !n(o.workDone, orderWork(o)) ||
      o.workDone >= orderWork(o)
    )
      return false;
    for (const id of o.crew) {
      const r = s.residents.find((r) => r.id === id);
      if (
        !r ||
        reserved.has(id) ||
        r.workplaceId !== null ||
        s.workerIds.includes(id) ||
        (r.health === "healthy" && r.task !== `build-order:${o.id}`)
      )
        return false;
      reserved.add(id);
    }
  }
  for (const f of t.facilities) {
    if (
      (f.kind as string) === "home" ||
      !Number.isInteger(f.target) ||
      !n(f.target, facilityStaffLimit(f)) ||
      !n(f.progress, 30) ||
      !Number.isInteger(f.yieldRemainder) ||
      !n(f.yieldRemainder, 4) ||
      !Number.isInteger(f.buffer) ||
      !n(f.buffer, 20) ||
      !Number.isInteger(f.delivered) ||
      !n(f.delivered)
    )
      return false;
    if (f.haul) {
      const h = f.haul,
        r = s.residents.find((r) => r.id === h.worker);
      if (
        !isRecord(h) ||
        !r ||
        reserved.has(r.id) ||
        !["pickup", "store", "return"].includes(h.stage) ||
        !Number.isInteger(h.cargo) ||
        !n(h.cargo, 5) ||
        r.workplaceId !== null ||
        (r.health === "healthy" && r.task !== `facility-haul:${f.id}`)
      )
        return false;
      reserved.add(r.id);
    }
  }
  for (const trip of t.trips) {
    if (
      !isRecord(trip) ||
      !t.facilities.some(
        (f) =>
          f.id === trip.facilityId &&
          f.kind === (trip.kind === "hunt" ? "scout" : "trade"),
      ) ||
      !["hunt", "trade"].includes(trip.kind) ||
      !["RES_MEAT", "RES_FISH", "RES_PLANT"].includes(trip.food) ||
      !["outbound", "gather", "return"].includes(trip.stage) ||
      !Array.isArray(trip.ids) ||
      trip.ids.length < 1 ||
      trip.ids.length > (trip.kind === "hunt" ? 2 : 1) ||
      !n(trip.progress, 64) ||
      !n(trip.cargo, 24) ||
      !isRecord(trip.goal) ||
      !n(Math.abs(trip.goal.x), 250) ||
      !n(Math.abs(trip.goal.z), 250)
    )
      return false;
    for (const id of trip.ids) {
      const r = s.residents.find((r) => r.id === id);
      if (
        !r ||
        reserved.has(id) ||
        (r.health === "healthy" &&
          r.workplaceId !== `facility:${trip.facilityId}`) ||
        (r.health === "healthy" && r.task !== `expedition:${trip.id}`)
      )
        return false;
      reserved.add(id);
    }
  }
  for (const [id, q] of Object.entries(t.extracted))
    if (
      !productionSites(s).some((l) => l.siteId === id) ||
      !n(q) ||
      !Number.isInteger(q)
    )
      return false;
  for (const r of s.residents) {
    if (
      r.workplaceId?.startsWith("facility:") &&
      !t.facilities.some(
        (f) =>
          `facility:${f.id}` === r.workplaceId && facilityStaffLimit(f) > 0,
      )
    )
      return false;
    if (
      (r.task?.startsWith("build-order:") ||
        r.task?.startsWith("facility-haul:") ||
        r.task?.startsWith("expedition:")) &&
      !reserved.has(r.id)
    )
      return false;
  }
  return true;
}

export function reconcileTownHealth(s: TimberState): TimberState {
  const trips = s.town.trips
    .map((t) => ({
      ...t,
      ids: t.ids.filter(
        (id) => s.residents.find((r) => r.id === id)?.health !== "dead",
      ),
    }))
    .filter((t) => t.ids.length);
  const orders = s.town.orders.map((o) => ({
    ...o,
    crew: o.crew.filter(
      (id) => s.residents.find((r) => r.id === id)?.health === "healthy",
    ),
  }));
  return {
    ...s,
    town: { ...s.town, trips, orders },
    residents: s.residents.map((r) => {
      const trip = trips.find((t) => t.ids.includes(r.id));
      if (trip && r.health === "healthy")
        return {
          ...r,
          task: `expedition:${trip.id}`,
          workplaceId: `facility:${trip.facilityId}`,
        };
      if (
        r.task?.startsWith("build-order:") &&
        !orders.some((o) => o.crew.includes(r.id))
      )
        return { ...r, task: null };
      return r;
    }),
  };
}

function invalidTown(): never {
  throw Error("건설·생산 명부의 참조가 올바르지 않습니다.");
}
