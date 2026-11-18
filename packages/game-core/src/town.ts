import {
  BOKHOL_FORESTS,
  BOKHOL_MAP,
  BOKHOL_MINERALS,
  BOKHOL_WATERS,
  bokholElevation,
  type ProductionSiteId,
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
  type HomePlacement,
  homeEntrance,
  homeObstacle,
  rectanglesOverlap,
  rotatedPoint,
} from "./home-placement.js";
import { advanceHospital, hospitalValid, type Patient } from "./hospital.js";
import { loggingSites, productionSites, setLoggingSite } from "./logging.js";
import { AMOUNT_SCALE, type FoodId, type ResourceId } from "./play.js";
import {
  type GroundPoint,
  moveOnGround,
  residentPath,
} from "./resident-path.js";
import { workplaceOpen } from "./resident-routine.js";
import { isRecord } from "./save.js";
import { storageRoom } from "./storage.js";
import type { TimberState } from "./timber.js";
import { assignHomes, speciesRule, VILLAGE_RULES } from "./village-services.js";

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
  | "fishery"
  | "farm"
  | "ranch"
  | "scout"
  | "trade"
  | "workshop"
  | "hospital";
type Cost = Partial<Record<ResourceId, number>>;
// C1 승인 개발용 정량. 실제 밸런스 확정 근거는 docs/BUILDING_RULES.md 참조.
export const BUILDING_RULES: Record<
  BuildingKind,
  { name: string; cost: Cost; work: number; staff: number; site: string }
> = {
  hospital: {
    name: "병원",
    cost: { RES_WOOD: 30, RES_METAL: 4 },
    work: 240,
    staff: 2,
    site: "평탄한 빈 땅 · 의료 인원 배치 · 병상5/15/25개",
  },
  workshop: {
    name: "연구소",
    cost: { RES_WOOD: 16, RES_METAL: 6 },
    work: 240,
    staff: 2,
    site: "평탄한 빈 땅 · 연구원 배치 · 연구소마다 동시1건",
  },
  home: {
    name: "온돌 둥지",
    cost: { RES_WOOD: 20 },
    work: 180,
    staff: 0,
    site: "평탄한 빈 땅",
  },
  restaurant: {
    name: "공동 식당",
    cost: { RES_WOOD: 30, RES_METAL: 2 },
    work: 240,
    staff: 2,
    site: "평탄한 빈 땅 · 여러 곳 건설 가능 · 좌석10/20/40",
  },
  logging: {
    name: "제재소",
    cost: { RES_WOOD: 15, RES_METAL: 2 },
    work: 180,
    staff: 4,
    site: "잔량이 있는 숲 반경26 안의 빈 땅",
  },
  storage: {
    name: "공동 저장소",
    cost: { RES_WOOD: 12 },
    work: 180,
    staff: 0,
    site: "평탄한 빈 땅 · 가까운 하역 거점",
  },
  coal: {
    name: "석탄광",
    cost: { RES_WOOD: 25, RES_METAL: 4 },
    work: 300,
    staff: 4,
    site: "석탄 광맥 주변",
  },
  iron: {
    name: "철광산",
    cost: { RES_WOOD: 30, RES_METAL: 6 },
    work: 300,
    staff: 4,
    site: "철광석 광맥 주변 · 제련 전 원료",
  },
  quarry: {
    name: "채석장",
    cost: { RES_WOOD: 18, RES_METAL: 3 },
    work: 240,
    staff: 4,
    site: "돌이 많은 암반 주변",
  },
  fishery: {
    name: "어획막",
    cost: { RES_WOOD: 18, RES_METAL: 2 },
    work: 180,
    staff: 5,
    site: "물고기 못의 육지 쪽 물가 · 결빙 낚시 가능",
  },
  farm: {
    name: "온상 재배소",
    cost: { RES_WOOD: 25, RES_METAL: 2 },
    work: 240,
    staff: 4,
    site: "빈 육지 · 구릉에도 배치 · 물 필요 · 결빙기 석탄 필요",
  },
  ranch: {
    name: "목축장",
    cost: { RES_WOOD: 25, RES_STONE: 4 },
    work: 240,
    staff: 4,
    site: "빈 육지 · 구릉에도 배치 · 풀·물로 가축 사육",
  },
  scout: {
    name: "정찰 거점",
    cost: { RES_WOOD: 15 },
    work: 180,
    staff: 2,
    site: "평탄한 빈 땅 · 배치 인력2명 파견 · 맵에 한 곳",
  },
  trade: {
    name: "교역소",
    cost: { RES_WOOD: 25, RES_METAL: 2 },
    work: 240,
    staff: 1,
    site: "평탄한 빈 땅 · 교역 인력1명 배치 · 맵에 한 곳",
  },
};
export interface BuildingOrder extends HomePlacement {
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
export const facilityStaffLimit = (f: Pick<Facility, "kind" | "level">) =>
  f.kind === "restaurant" || f.kind === "hospital"
    ? ([2, 4, 6][f.level - 1] ?? 2)
    : f.kind === "fishery"
      ? ([5, 10, 20][f.level - 1] ?? 5)
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
  { x: 4.5, z: 2.8 },
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
export function buildingSource(
  s: TimberState,
  kind: BuildingKind,
  p: GroundPoint,
): ProductionSiteId | null {
  const candidates = productionSites(s)
    .filter((l) => l.remaining > 0)
    .filter((l) => {
      const d = [
        ...BOKHOL_FORESTS.map((f) => ({ ...f, kind: "logging" })),
        ...BOKHOL_MINERALS.map((m) => ({
          ...m,
          kind: m.kind === "stone" ? "quarry" : m.kind,
        })),
      ].find((d) => d.id === l.siteId);
      return d?.kind === kind && Math.hypot(p.x - d.x, p.z - d.z) <= 26;
    });
  return (
    candidates.sort((a, b) => {
      const all = [...BOKHOL_FORESTS, ...BOKHOL_MINERALS],
        x = all.find((f) => f.id === a.siteId) ?? invalidTown(),
        y = all.find((f) => f.id === b.siteId) ?? invalidTown();
      return (
        Math.hypot(p.x - x.x, p.z - x.z) - Math.hypot(p.x - y.x, p.z - y.z)
      );
    })[0]?.siteId ?? null
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
  if (Math.hypot(p.position.x - 4.5, p.position.z - 2.8) < 5)
    return "공동 야적장과 겹쳐요.";
  if (
    s.restaurantBuilt &&
    !s.town.facilities.some((f) => f.kind === "restaurant") &&
    Math.hypot(p.position.x + 4.3, p.position.z - 6) < 7
  )
    return "공동 식당과 겹쳐요.";
  for (const l of productionSites(s)) {
    const d =
      [...BOKHOL_FORESTS, ...BOKHOL_MINERALS].find((d) => d.id === l.siteId) ??
      invalidTown();
    if (
      l.built &&
      Math.hypot(p.position.x - (d.x + 13), p.position.z - d.z) < 7
    )
      return "기존 작업장과 겹쳐요.";
    if (
      l.storageBuilt &&
      Math.hypot(p.position.x - (d.x + 13), p.position.z - (d.z + 10)) < 5
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
  if (kind === "fishery" && !waterAt(p.position, 7))
    return "물고기가 모이는 물가에만 어획막을 지을 수 있어요.";
  if (
    BOKHOL_MINERALS.some(
      (m) => Math.hypot(p.position.x - m.x, p.position.z - m.z) < 10,
    )
  )
    return "채굴할 암반·광맥 자체를 건물로 덮을 수 없어요.";
  const amounts = Object.fromEntries(
    loggingSites(s).map((l) => [l.siteId, l.remaining]),
  );
  const heights = samples.map((q) => bokholElevation(q.x, q.z, amounts));
  if (
    !["coal", "iron", "quarry", "fishery", "logging", "farm", "ranch"].includes(
      kind,
    ) &&
    Math.max(...heights) - Math.min(...heights) > 0.12
  )
    return "건물 바닥 전체가 평탄한 땅을 골라 주세요.";
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
  if (
    s.residents.some(
      (r) =>
        r.health !== "dead" &&
        !r.insideHome &&
        rectanglesOverlap(rect, {
          position: r.position,
          headingRadians: 0,
          halfWidth: 0.35,
          halfDepth: 0.35,
        }),
    )
  )
    return "주민이 서 있는 자리예요. 이동한 뒤 배치해 주세요.";
  for (const [resource, amount] of Object.entries(BUILDING_RULES[kind].cost))
    if (
      s.world.resources[resource as ResourceId] -
        (resource === "RES_WOOD" ? s.reservedWood * AMOUNT_SCALE : 0) <
      amount * AMOUNT_SCALE
    )
      return "자원이 부족하면 건설 대기를 접수할 수 없어요.";
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
  const n = payTown(s, BUILDING_RULES[kind].cost);
  const order: BuildingOrder = {
    ...pose,
    id: `build-${n.town.nextId}`,
    kind,
    sourceId: buildingSource(s, kind, pose.position),
    crew: [],
    stage: "waiting",
    workDone: 0,
  };
  return {
    ...n,
    paused: false,
    town: {
      ...n.town,
      nextId: n.town.nextId + 1,
      orders: [...n.town.orders, order],
    },
  };
}
export function freeTownResidents(
  s: TimberState,
  p: GroundPoint,
  count: number,
): string[] {
  if (count <= 0) return [];
  return s.residents
    .filter(
      (r) =>
        r.health === "healthy" &&
        !r.workplaceId &&
        !r.task &&
        !r.nextWork &&
        r.routine !== "eating" &&
        !s.workerIds.includes(r.id) &&
        !s.town.trips.some((t) => t.ids.includes(r.id)),
    )
    .map((r) => ({
      id: r.id,
      path: residentPath(r.position, p, townObstacles(s)),
    }))
    .filter((r) => r.path.length)
    .sort((a, b) => {
      const length = (id: string, path: GroundPoint[]) => {
        let q = s.residents.find((r) => r.id === id)?.position ?? p,
          n = 0;
        for (const p of path) {
          n += Math.hypot(q.x - p.x, q.z - p.z);
          q = p;
        }
        return n;
      };
      return length(a.id, a.path) - length(b.id, b.path);
    })
    .slice(0, count)
    .map((r) => r.id);
}
export const orderResting = (s: TimberState, id: string) =>
  !residentShiftOpen(s, id) && s.town.orders.some((o) => o.crew.includes(id));
export function advanceTown(input: TimberState, minutes: number): TimberState {
  if (!minutes) return input;
  let s = input;
  const first = s.town.orders[0];
  const open = first ? townShiftOpen(s, first.id) : false;
  if (
    first &&
    !s.construction &&
    (open ||
      s.residents.some((r) => r.health === "healthy" && isMechanical(s, r.id)))
  ) {
    const o = {
      ...first,
      crew: first.crew.filter((id) =>
        s.residents.some((r) => r.id === id && r.health === "healthy"),
      ),
    };
    const extra = freeTownResidents(s, facilityDoor(o), s.residents.length)
      .filter((id) => open || isMechanical(s, id))
      .slice(0, 4 - o.crew.length);
    o.crew = [...o.crew, ...extra];
    const active = o.crew.filter((id) => open || isMechanical(s, id));
    if (active.length) {
      if (o.stage === "waiting") o.stage = "collect";
      const goal = o.stage === "collect" ? { x: 4.5, z: 0.6 } : facilityDoor(o);
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
        return Math.hypot(r.position.x - goal.x, r.position.z - goal.z) < 0.01;
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
    s = { ...s, town: { ...s.town, orders: [o, ...s.town.orders.slice(1)] } };
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
        residents = assignHomes(residents, s.world.citizens, s.homes);
      } else if (o.kind === "home") {
        const homes = [
          ...s.homes,
          {
            id: `dwelling-${s.homes.length + 1}`,
            position: o.position,
            headingRadians: o.headingRadians,
            capacity: VILLAGE_RULES.homeSpace,
          },
        ];
        residents = assignHomes(
          residents,
          s.world.citizens,
          s.buildingHealth > 0
            ? homes
            : homes.filter((h) => h.id !== "example-building-1"),
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
          target: 0,
          progress: 0,
          yieldRemainder: 0,
          buffer: 0,
          delivered: 0,
          haul: null,
        };
        s = {
          ...s,
          restaurantBuilt: s.restaurantBuilt || o.kind === "restaurant",
          town: { ...s.town, facilities: [...s.town.facilities, f] },
        };
      }
      s = {
        ...s,
        residents,
        town: { ...s.town, orders: s.town.orders.slice(1) },
      };
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
      fishery: "RES_FISH",
      farm: "RES_PLANT",
      ranch: "RES_MEAT",
    }) as Partial<Record<BuildingKind, ResourceId>>
  )[f.kind] ?? null;
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
    if (!resource) continue;
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
    f.progress += power * minutes * collectionRate(s, f);
    while (power > 0 && f.progress >= 30 && f.buffer < 20) {
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
        const l =
          productionSites(s).find((l) => l.siteId === f.sourceId) ??
          invalidTown();
        if (!l.remaining) break;
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
      f.progress -= 30;
      f.buffer += Math.min(amount, 20 - f.buffer);
    }
    f.progress = Math.min(f.progress, 30);
    const warehouses = s.town.facilities.filter((q) => q.kind === "storage");
    const drop = warehouses.sort(
      (a, b) =>
        Math.hypot(a.position.x - f.position.x, a.position.z - f.position.z) -
        Math.hypot(b.position.x - f.position.x, b.position.z - f.position.z),
    )[0];
    const destination = drop ? facilityDoor(drop) : { x: 4.5, z: 0.6 };
    if (f.kind === "fishery") {
      const amount = Math.min(f.buffer, storageRoom(s, resource));
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
            const unloaded = Math.min(h.cargo, storageRoom(s, resource));
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
    !["scout", "trade"].includes(f.kind) ||
    !["RES_PLANT", "RES_MEAT", "RES_FISH"].includes(food)
  )
    throw Error("파견할 거점과 식량을 확인해 주세요.");
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
    paused: false,
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
                minutes,
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
              levelProductionRate(f),
        );
        if (t.progress >= 60) {
          t.cargo =
            t.kind === "hunt"
              ? ([8, 12, 18][t.rank - 1] ?? 8)
              : ([10, 16, 24][t.rank - 1] ?? 10);
          t.stage = "return";
        }
      } else if (t.stage === "return") {
        const unloaded = Math.min(t.cargo, storageRoom(s, t.food));
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
        : BUILDING_RULES[q.kind].cost,
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
