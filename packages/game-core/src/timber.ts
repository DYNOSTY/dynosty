import {
  BOKHOL_FORESTS,
  BOKHOL_MAP,
  BOKHOL_MINERALS,
  BOKHOL_PRODUCTION_SITES,
  type ProductionSiteId,
  productionSiteDefinition,
  sawmillHasForest,
} from "./bokhol.js";
import {
  actCampaign,
  type Campaign,
  type CampaignCommand,
  campaignValid,
  newCampaign,
  updateCampaign,
} from "./campaign.js";
import {
  createDevelopment,
  isMechanical,
  residentShiftOpen,
  setElectricalWork,
  setOvertime,
  startResearch,
  upgradeFacility,
} from "./development.js";
import {
  advanceHomeConstruction,
  createHomeCrew,
  type HomeBuilder,
} from "./home-construction.js";
import {
  type HomePlacement,
  homeEntrance,
  homeObstacle,
  homePlacementIssue,
  homeWorkSlots,
  rotatedPoint,
} from "./home-placement.js";
import { atHospital, reconcilePatients } from "./hospital.js";
import {
  advanceLogging,
  createLogging,
  LOGGING_RULES,
  type LoggingState,
  loggingSite,
  loggingSiteRules,
  loggingSites,
  loggingValid,
  loggingWorkplace,
  productionSites,
  setLoggingSite,
  staffLogging,
} from "./logging.js";
import {
  AMOUNT_SCALE,
  advancePlayClock,
  applyCitizenEvent,
  type Citizen,
  type CitizenEvent,
  createPlayState,
  type FoodId,
  type PlayState,
  parsePlayState,
} from "./play.js";
import {
  type GroundObstacle,
  type GroundPoint,
  residentPath,
} from "./resident-path.js";
import {
  advanceResidentRoutine,
  afterWorkDestination,
  RESIDENT_ROUTINE_RULES,
  type ResidentRoutine,
  restaurantOpen,
  workplaceOpen,
} from "./resident-routine.js";
import { isRecord } from "./save.js";
import type { SceneSnapshot } from "./scene.js";
import { SCOUT_SITES } from "./scout-sites.js";
import { storageRoom, warehouseDoor } from "./storage.js";
import {
  createResearchStory,
  mechanizeCitizen,
  recordResearchStory,
  type StoryEvent,
} from "./story-research.js";
import {
  advanceTown,
  type BuildingKind,
  createTown,
  deposit,
  dispatchFood,
  facilityDoor,
  facilityStaffLimit,
  orderResting,
  payTown,
  planBuilding,
  reconcileTownHealth,
  setFacilityStaff,
  staffTown,
  type TownState,
  townObstacles,
  townValid,
} from "./town.js";
import {
  assignHomes,
  HOME_PLOTS,
  homeUsage,
  initialHomes,
  type MealPlan,
  mealPlan,
  type RationPolicy,
  rationLimit,
  speciesRule,
  VILLAGE_RULES,
  type VillageHome,
} from "./village-services.js";

export const TIMBER_RULES = {
  version: 18,
  requested: 20,
  deadline: 60,
  workers: 60,
  inspectionMinutes: 5,
  repairMinutes: 15,
  repairWorkers: 2,
  unloadMinutes: 3,
  parkMinutes: 2,
  warmth: { x: -2.5, z: 1 },
  restaurant: { x: -5.5, z: 4.8 },
  useMinutes: 8,
  minutesPerRealSecond: 1,
  offers: {
    A: { cost: 4, travel: 20, wet: 4 },
    B: { cost: 6, travel: 35, wet: 0 },
  },
  cartStart: { x: -7, z: 2.8 },
  yard: { x: 4.5, z: 2.8 },
  pullOffset: 3,
  house: { x: 0, z: -1 },
  repairSite: { x: 0, z: -3 },
  walkSpeed: 2,
} as const;
export type TimberOffer = keyof typeof TIMBER_RULES.offers;
export type TimberPhase =
  | "select"
  | "relief"
  | "crew-wait"
  | "approaching"
  | "transport"
  | "parking"
  | "releasing"
  | "unloading"
  | "inspecting"
  | "returning"
  | "waiting-labor"
  | "drying-travel"
  | "drying"
  | "ready"
  | "building-travel"
  | "building";
export type RegisterPolicy = "relief" | "registry";
export interface RepairResident {
  readonly id: string;
  readonly position: { readonly x: number; readonly z: number };
  readonly workplaceId: string | null;
  readonly task: string | null;
}
export function nearestRepairResident(
  residents: readonly RepairResident[],
  site: { x: number; z: number },
  buildings: readonly { x: number; z: number }[],
): string | null {
  let chosen: string | null = null,
    shortest = Infinity;
  for (const resident of residents) {
    if (resident.workplaceId !== null || resident.task !== null) continue;
    const path = residentPath(resident.position, site, buildings);
    if (!path.length) continue;
    let length = 0,
      previous = resident.position;
    for (const point of path) {
      length += Math.hypot(point.x - previous.x, point.z - previous.z);
      previous = point;
    }
    if (length < shortest) {
      shortest = length;
      chosen = resident.id;
    }
  }
  return chosen;
}

export interface VillageResident extends ResidentRoutine {
  readonly id: string;
  readonly homeId: string | null;
  readonly homeSlot: number | null;
  readonly insideHome: boolean;
  readonly rationDay: number;
  readonly rationUsed: number;
  readonly lastMeal: MealPlan["foods"] | null;
}
export interface TimberState {
  readonly version: 18;
  readonly town: TownState;
  readonly world: PlayState;
  readonly initialWood: number;
  readonly initialIron: number;
  readonly chapter?: 2 | 3 | 4 | 5;
  readonly campaign?: Campaign;
  readonly scoutDepartures?: Record<string, number>;
  readonly yardDryAt?: number | undefined;
  readonly woodSpent: number;
  readonly logging: LoggingState;
  readonly loggingSites: readonly LoggingState[];
  readonly mineralSites: readonly LoggingState[];
  readonly initialMinerals: Readonly<
    Record<"RES_COAL" | "RES_IRON_ORE" | "RES_STONE", number>
  >;
  readonly elapsed: number;
  readonly paused: boolean;
  readonly speed: 1 | 3;
  readonly remainder: number;
  readonly offer: TimberOffer | null;
  readonly contractId: string | null;
  readonly phase: TimberPhase;
  readonly startedAt: number | null;
  readonly due: number | null;
  readonly workerIds: readonly string[];
  readonly transportWorkerId: string | null;
  readonly repairWorkerId: string | null;
  readonly residents: readonly VillageResident[];
  readonly suspended: {
    readonly phase: Exclude<
      TimberPhase,
      "relief" | "crew-wait" | "select" | "ready" | "waiting-labor"
    >;
    readonly ids: readonly string[];
    readonly progress: number;
    readonly remaining: number;
    readonly origins: readonly GroundPoint[];
    readonly destinations: readonly GroundPoint[];
    readonly returnTo: GroundPoint | null;
    readonly cart: GroundPoint;
  } | null;
  readonly homes: readonly VillageHome[];
  readonly restaurantWorkerTarget: number;
  readonly rationPolicy: RationPolicy;
  readonly restaurantBuilt: boolean;
  readonly construction: {
    readonly kind: "restaurant" | "home" | "logging" | "storage";
    readonly siteId?: ProductionSiteId;
    readonly position: GroundPoint;
    readonly workerId: string;
    readonly headingRadians?: number;
    readonly crew?: readonly HomeBuilder[];
    readonly finishAt: number | null;
    readonly startedAt: number | null;
  } | null;
  readonly returnTo: GroundPoint | null;
  readonly buildingHealth: number;
  readonly reservedWood: number;
  readonly settledAt: number | null;
  readonly repairCompletedAt: number | null;
  readonly scoutVisitors?: number | undefined;
  readonly riskyMerchants?: readonly number[];
  readonly merchantRepair?:
    | { item: number; quantity: number; work: number }
    | undefined;
  readonly merchantItem?: number | undefined;
  readonly mission: "procurement" | "register-policy" | "village-orders";
  readonly policy: RegisterPolicy | null;
  readonly stock: {
    readonly cart: number;
    readonly waiting: number;
    readonly quarantine: number;
    readonly available: number;
    readonly used: number;
  };
  readonly processed: readonly string[];
  readonly history: readonly { id: number; minute: number; text: string }[];
}
export type TimberCommand =
  | CampaignCommand
  | { type: "story-event"; event: StoryEvent }
  | { type: "mechanize"; source: string }
  | { type: "electrical-work"; id: string; enabled: boolean }
  | { type: "upgrade-facility"; id: string }
  | { type: "start-research"; tech: string }
  | { type: "set-overtime"; target: string; enabled: boolean }
  | {
      type: "plan-building";
      kind: BuildingKind;
      position: GroundPoint;
      headingRadians: number;
    }
  | { type: "facility-staff"; id: string; count: number }
  | { type: "dispatch-food"; id: string; food: FoodId; rank?: 1 | 2 | 3 }
  | { type: "begin-chapter-two" }
  | { type: "scout-sites"; ids: string[]; recall?: boolean }
  | { type: "cold-weather"; cold: boolean }
  | {
      type: "queue-work";
      workId: string;
      position: GroundPoint;
    }
  | {
      type: "build-restaurant" | "build-logging" | "build-storage";
      siteId?: ProductionSiteId;
    }
  | { type: "build-home"; position: GroundPoint; headingRadians: number }
  | { type: "set-logging-workers"; count: number; siteId?: ProductionSiteId }
  | { type: "set-restaurant-workers"; count: number }
  | { type: "set-ration-policy"; policy: RationPolicy }
  | { type: "citizen-event"; event: CitizenEvent }
  | { type: "building-damage"; cause: "attack" | "fire"; amount: number }
  | { type: "choose"; offer: TimberOffer }
  | { type: "contract" | "use" | "next" | "restart" }
  | { type: "advance"; minutes: number }
  | { type: "pause"; paused: boolean }
  | { type: "speed"; speed: 1 | 3 }
  | {
      type: "visit-decision";
      item: number;
      day: number;
      option: "A" | "B" | "decline";
    }
  | { type: "gate-decision"; accept: boolean }
  | { type: "set-policy"; policy: RegisterPolicy };
export class TimberError extends Error {}
function fail(message = "게임 상태가 올바르지 않습니다."): never {
  throw new TimberError(message);
}
function num(value: unknown, max = 144000000): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > max
  )
    fail("저장 수치가 올바르지 않습니다.");
}
const phases: readonly string[] = [
  "crew-wait",
  "select",
  "relief",
  "approaching",
  "transport",
  "parking",
  "releasing",
  "unloading",
  "inspecting",
  "returning",
  "waiting-labor",
  "drying-travel",
  "drying",
  "ready",
  "building-travel",
  "building",
];
const point = (value: unknown): value is GroundPoint =>
  isRecord(value) &&
  typeof value.x === "number" &&
  typeof value.z === "number" &&
  Number.isFinite(value.x) &&
  Number.isFinite(value.z) &&
  Math.abs(value.x) <= BOKHOL_MAP.coordinateLimit &&
  Math.abs(value.z) <= BOKHOL_MAP.coordinateLimit;
const activePhases: readonly string[] = [
  "relief",
  "approaching",
  "transport",
  "parking",
  "releasing",
  "unloading",
  "inspecting",
  "returning",
  "drying-travel",
  "drying",
  "building-travel",
  "building",
];
const homeSlots: GroundPoint[] = [
  { x: -2, z: 1 },
  { x: -4, z: -3 },
  { x: 3, z: -5 },
  { x: -4, z: 3 },
];
for (let radius = 1; homeSlots.length < 600; radius++) {
  for (let x = -radius; x <= radius; x++)
    for (let z = -radius; z <= radius; z++) {
      if (Math.abs(x) !== radius && Math.abs(z) !== radius) continue;
      const p = { x: x * 3, z: z * 3 };
      if (
        homeSlots.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 2.5) ||
        !residentPath(p, p, [...HOME_PLOTS, TIMBER_RULES.yard]).length ||
        (p.z >= 1 && p.z <= 4 && p.x >= -8 && p.x <= 9) ||
        (p.x >= -8 && p.x <= 0 && p.z >= 3 && p.z <= 10)
      )
        continue;
      homeSlots.push(p);
    }
}
function createVillageResident(
  c: Citizen,
  index: number,
  day = 1,
): VillageResident {
  const home = homeSlots[index] ?? fail("마을 수용 인원을 초과했습니다.");
  let seed = 0;
  for (const char of c.id) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  return {
    id: c.id,
    position: { ...home },
    home: null,
    homeId: null,
    homeSlot: null,
    insideHome: false,
    rationDay: day,
    rationUsed: 0,
    lastMeal: null,
    workplaceId: null,
    task: null,
    nextWork: null,
    hunger: c.mechanicalFrom ? 0 : (seed + index * 97) % 420,
    diningSeat: null,
    health: c.alive ? (c.health ?? "healthy") : "dead",
    request: null,
    eatingUntil: null,
    routine: "idle",
  };
}
export function createVillageGame(beforeDeparture = false): TimberState {
  const world = createPlayState();
  const resources = { ...world.resources };
  for (const id of Object.keys(resources) as (keyof typeof resources)[])
    resources[id] = (beforeDeparture ? 10000 : 1000) * AMOUNT_SCALE;
  const citizens = beforeDeparture
    ? [
        ...world.citizens,
        ...Array.from({ length: 240 }, (_, i) => ({
          ...world.citizens[i % world.citizens.length]!,
          id: `departing-${i}`,
        })),
      ]
    : world.citizens;
  const village = createTimberState({
    ...world,
    citizens,
    resources,
    minute: 9 * 60,
  });
  return {
    ...village,
    campaign: newCampaign(beforeDeparture ? "opening" : "patrol"),
    residents: village.residents.map((r) => ({
      ...r,
      hunger: Math.floor(r.hunger / 2),
    })),
  };
}
export function createTimberState(
  inputWorld: PlayState = createPlayState(),
): TimberState {
  const parsed = parsePlayState(inputWorld);
  const citizens = parsed.citizens;
  const homes =
    parsed.buildings.length > 1
      ? parsed.buildings.map((b) => ({
          id: b.id,
          position: { x: b.position.x, z: b.position.z },
          capacity: VILLAGE_RULES.homeSpace,
          headingRadians: b.headingRadians,
        }))
      : initialHomes();
  const world = {
    ...parsed,
    buildings: homes.map((h) => ({
      id: h.id,
      type: "ondol-nest" as const,
      position: { ...h.position, y: 0 },
      headingRadians: h.headingRadians ?? Math.PI,
    })),
  };
  return {
    version: 18,
    town: createTown(),
    world: { ...world, paused: true },
    initialWood: parsed.resources.RES_WOOD,
    initialIron: parsed.resources.RES_METAL,
    woodSpent: 0,
    logging: createLogging(),
    loggingSites: BOKHOL_FORESTS.slice(1).map((f) => createLogging(f.id)),
    mineralSites: BOKHOL_MINERALS.map((f) => createLogging(f.id)),
    initialMinerals: {
      RES_COAL: world.resources.RES_COAL,
      RES_IRON_ORE: world.resources.RES_IRON_ORE,
      RES_STONE: world.resources.RES_STONE,
    },
    elapsed: 0,
    paused: true,
    speed: 1,
    remainder: 0,
    offer: null,
    contractId: null,
    phase: "select",
    startedAt: null,
    due: null,
    workerIds: [],
    transportWorkerId: null,
    repairWorkerId: null,
    residents: assignHomes(
      citizens.map((c, i) => createVillageResident(c, i, world.day)),
      citizens,
      homes,
    ),
    homes,
    restaurantWorkerTarget: 0,
    rationPolicy: "needs",
    suspended: null,
    restaurantBuilt: false,
    construction: null,
    returnTo: null,
    buildingHealth: 100,
    reservedWood: 0,
    settledAt: null,
    repairCompletedAt: null,
    mission: "procurement",
    policy: null,
    stock: { cart: 0, waiting: 0, quarantine: 0, available: 0, used: 0 },
    processed: [],
    history: [
      {
        id: 0,
        minute: 0,
        text: "마른 목재20 조달. 계약 뒤 운송·하역·검수·복귀·재고 정산은 자동입니다.",
      },
    ],
  };
}
function note(s: TimberState, text: string): TimberState {
  return {
    ...s,
    history: [...s.history, { id: s.history.length, minute: s.elapsed, text }],
  };
}
function dropPoint(s: TimberState) {
  return warehouseDoor(s, TIMBER_RULES.cartStart) ?? TIMBER_RULES.yard;
}
function front(s: TimberState, p: GroundPoint): GroundPoint {
  const d = dropPoint(s);
  const angle = Math.atan2(
    d.z - TIMBER_RULES.cartStart.z,
    d.x - TIMBER_RULES.cartStart.x,
  );
  return {
    x: p.x + Math.cos(angle) * TIMBER_RULES.pullOffset,
    z: p.z + Math.sin(angle) * TIMBER_RULES.pullOffset,
  };
}
const constructionSite = (
  kind: "restaurant" | "home" | "logging" | "storage",
  p: GroundPoint,
  headingRadians = Math.PI,
): GroundPoint =>
  kind === "home" ? homeEntrance({ position: p, headingRadians }) : { ...p };
const habitableHomes = (homes: readonly VillageHome[], health: number) =>
  health > 0 ? homes : homes.filter((h) => h.id !== "example-building-1");
export const villageObstacles = (s: TimberState): GroundObstacle[] => [
  ...townObstacles(s),
  ...(s.construction?.kind === "home" ? [homeObstacle(s.construction)] : []),
];
const restaurants = (s: TimberState) =>
  s.town.facilities.filter((f) => f.kind === "restaurant");
const diningCapacity = (level: number) => [10, 20, 40][level - 1] ?? 10;
function employeeRestaurant(s: TimberState, id: string) {
  const workplace = s.residents.find((r) => r.id === id)?.workplaceId;
  if (
    !workplace ||
    (workplace !== "restaurant" && !workplace.startsWith("facility:"))
  )
    return undefined;
  return restaurants(s).find(
    (f, i) =>
      workplace === `facility:${f.id}` ||
      (i === 0 && workplace === "restaurant"),
  );
}
function isDiningEmployee(s: TimberState, r: VillageResident) {
  return (
    r.workplaceId === "restaurant" ||
    (!!r.workplaceId?.startsWith("facility:") &&
      s.town.facilities.some(
        (f) => f.kind === "restaurant" && `facility:${f.id}` === r.workplaceId,
      ))
  );
}
function employeePosition(s: TimberState, id: string): GroundPoint {
  const facility = employeeRestaurant(s, id);
  if (facility) return facilityDoor(facility);
  const index = s.residents
    .filter((r) => r.workplaceId === "restaurant")
    .findIndex((r) => r.id === id);
  return {
    x: TIMBER_RULES.restaurant.x + index * 2.4,
    z: TIMBER_RULES.restaurant.z + 4.4,
  };
}
export function restaurantStaff(s: TimberState, facilityId?: string) {
  const assigned = s.residents.filter(
    (r) =>
      isDiningEmployee(s, r) &&
      r.health === "healthy" &&
      (!facilityId || employeeRestaurant(s, r.id)?.id === facilityId),
  );
  const present = assigned.filter(
    (r) =>
      Math.hypot(
        r.position.x - employeePosition(s, r.id).x,
        r.position.z - employeePosition(s, r.id).z,
      ) < 0.01,
  );
  const serving = restaurantOpen(s.world.minute)
    ? present.filter((r) => r.routine === "working")
    : [];
  return {
    assigned: assigned.length,
    present: present.length,
    serving: serving.length,
  };
}
function staffRestaurant(s: TimberState): TimberState {
  let retained = 0;
  let residents = s.residents.map((r) =>
    r.workplaceId === "restaurant"
      ? r.health === "healthy" && retained++ < s.restaurantWorkerTarget
        ? r
        : { ...r, workplaceId: null }
      : r,
  );
  let next = { ...s, residents };
  const first = restaurants(s)[0];
  const limit = first ? facilityStaffLimit(first) : 2;
  for (let count = 0; count < limit; count++) {
    if (
      residents.filter((r) => r.workplaceId === "restaurant").length >=
      s.restaurantWorkerTarget
    )
      break;
    const id = eligible(
      next,
      first ? facilityDoor(first) : TIMBER_RULES.restaurant,
      1,
    )[0];
    if (!id) break;
    residents = residents.map((r) =>
      r.id === id
        ? {
            ...r,
            workplaceId: "restaurant",
            insideHome: false,
            diningSeat: null,
          }
        : r,
    );
    next = { ...next, residents };
  }
  return next;
}
function residentMeal(
  s: TimberState,
  r: VillageResident,
  resources = s.world.resources,
) {
  const c =
    s.world.citizens.find((c) => c.id === r.id) ??
    fail("주민 등록이 없습니다.");
  return mealPlan(
    c,
    s.rationPolicy,
    r.rationDay === s.world.day ? r.rationUsed : 0,
    resources,
  );
}
export const restaurantSeats = (s: TimberState) =>
  restaurants(s).reduce((n, f) => n + diningCapacity(f.level), 0) ||
  (s.restaurantBuilt ? 10 : 0);
function diningSeats(s: TimberState): Map<string, number> {
  const seats = new Map<string, number>();
  if (!s.restaurantBuilt) return seats;
  const admitted = new Set(
    s.town.patients.filter((p) => p.hospital !== null).map((p) => p.resident),
  );
  // Staff can eat too; occupied seats remain reserved while service pauses.
  for (const r of s.residents)
    if (
      r.health !== "dead" &&
      r.routine === "eating" &&
      r.diningSeat !== null &&
      !isDiningEmployee(s, r) &&
      !r.nextWork &&
      !(r.workplaceId && residentShiftOpen(s, r.id)) &&
      !admitted.has(r.id)
    )
      seats.set(r.id, r.diningSeat);
  if (!restaurantStaff(s).serving) return seats;
  const candidates = s.residents.filter(
    (r) =>
      r.health !== "dead" &&
      !admitted.has(r.id) &&
      !s.workerIds.includes(r.id) &&
      (!r.task ||
        (!workplaceOpen(s.world.minute) &&
          (orderResting(s, r.id) ||
            s.construction?.crew?.some((w) => w.id === r.id) ||
            s.construction?.workerId === r.id))) &&
      !isDiningEmployee(s, r) &&
      (residentMeal(s, r).amount > 0 || r.routine === "eating") &&
      !r.nextWork &&
      !(r.workplaceId && residentShiftOpen(s, r.id)) &&
      (r.hunger >= RESIDENT_ROUTINE_RULES.hungryAt || r.routine === "eating"),
  );
  const facilities = restaurants(s);
  const available = facilities.length
    ? facilities.flatMap((f, index) =>
        restaurantStaff(s, f.id).serving
          ? Array.from(
              { length: diningCapacity(f.level) },
              (_, i) => index * 40 + i,
            )
          : [],
      )
    : Array.from({ length: 10 }, (_, i) => i);
  for (const r of candidates)
    if (
      r.diningSeat !== null &&
      available.includes(r.diningSeat) &&
      ![...seats.values()].includes(r.diningSeat)
    )
      seats.set(r.id, r.diningSeat);
  for (const r of candidates.sort(
    (a, b) => b.hunger - a.hunger || a.id.localeCompare(b.id),
  )) {
    if (seats.size >= restaurantSeats(s)) break;
    if (seats.has(r.id)) continue;
    const free = available
      .filter((i) => ![...seats.values()].includes(i))
      .sort((a, b) => {
        const x =
          facilities[Math.floor(a / 40)]?.position ?? TIMBER_RULES.restaurant;
        const y =
          facilities[Math.floor(b / 40)]?.position ?? TIMBER_RULES.restaurant;
        return (
          Math.hypot(r.position.x - x.x, r.position.z - x.z) -
          Math.hypot(r.position.x - y.x, r.position.z - y.z)
        );
      })[0];
    if (free !== undefined) seats.set(r.id, free);
  }
  return seats;
}
function routinePlaces(s: TimberState, id: string, seats = diningSeats(s)) {
  const index = s.residents.findIndex((r) => r.id === id);
  const seat = seats.get(id) ?? -1;
  const employee = isDiningEmployee(s, s.residents[index] ?? fail());
  const facilities = restaurants(s);
  const diningPlace =
    employeeRestaurant(s, id) ??
    (seat >= 0
      ? facilities[Math.floor(seat / 40)]
      : [...facilities].sort(
          (a, b) =>
            Math.hypot(
              a.position.x - (s.residents[index]?.position.x ?? 0),
              a.position.z - (s.residents[index]?.position.z ?? 0),
            ) -
            Math.hypot(
              b.position.x - (s.residents[index]?.position.x ?? 0),
              b.position.z - (s.residents[index]?.position.z ?? 0),
            ),
        )[0]);
  const diningOrigin = diningPlace
    ? facilityDoor(diningPlace)
    : TIMBER_RULES.restaurant;
  const h = s.homes.find((h) => h.id === s.residents[index]?.homeId);
  const staff = restaurantStaff(s, diningPlace?.id);
  return {
    warmth: h
      ? rotatedPoint(
          { position: h.position, headingRadians: h.headingRadians ?? Math.PI },
          ((index % 3) - 1) * 0.65,
          3.6,
        )
      : (homeSlots[index] ?? TIMBER_RULES.warmth),
    restaurant: !s.restaurantBuilt
      ? null
      : seat >= 0
        ? {
            ...diningOrigin,
          }
        : { x: -10 - (index % 3) * 2, z: 5 + (Math.floor(index / 3) % 4) * 2 },
    seatAvailable: employee || seat >= 0,
    restaurantEmployee: employee,
    restaurantStaffed: staff.serving > 0,
    eatingMinutes: Math.max(5, Math.ceil(30 / Math.max(1, staff.present))),
    workplace: s.residents[index]?.workplaceId?.startsWith("facility:")
      ? facilityDoor(
          s.town.facilities.find(
            (f) => `facility:${f.id}` === s.residents[index]?.workplaceId,
          ) ?? fail(),
        )
      : s.residents[index]?.workplaceId?.startsWith("logging")
        ? loggingWorkplace(s, id)
        : s.residents[index]?.workplaceId === "restaurant"
          ? employeePosition(s, id)
          : undefined,
    rationAvailable:
      (s.residents[index]?.rationDay === s.world.day
        ? (s.residents[index]?.rationUsed ?? 0)
        : 0) <
      rationLimit(s.world.citizens[index]?.species ?? "R02", s.rationPolicy),
    minute: s.world.minute,
    workOpen: residentShiftOpen(s, id),
    obstacles: villageObstacles(s),
  };
}
function resumeResidents(input: TimberState, minutes: number): TimberState {
  const s = staffTown(staffLogging(staffRestaurant(input), eligible));
  const resources = { ...s.world.resources };
  const seats = diningSeats(s);
  const residents = s.residents.map((r) => {
    const current = {
      ...r,
      diningSeat: seats.get(r.id) ?? null,
      rationDay: s.world.day,
      rationUsed: r.rationDay === s.world.day ? r.rationUsed : 0,
      hunger: isMechanical(s, r.id)
        ? 0
        : r.health === "dead"
          ? r.hunger
          : Math.min(2880, r.hunger + minutes),
    };
    if (s.workerIds.includes(r.id)) return { ...current, insideHome: false };
    if (
      s.town.patients.some((p) => p.resident === r.id && p.hospital !== null)
    ) {
      const meal = residentMeal(s, current, resources);
      const served =
        atHospital(s, current) &&
        current.hunger >= RESIDENT_ROUTINE_RULES.hungryAt &&
        meal.amount > 0;
      if (served)
        for (const [food, amount] of Object.entries(meal.foods))
          resources[food as FoodId] -= amount;
      return {
        ...current,
        hunger: served
          ? Math.max(0, current.hunger - meal.relief)
          : current.hunger,
        rationUsed: current.rationUsed + (served ? meal.amount : 0),
        lastMeal: served ? meal.foods : r.lastMeal,
        insideHome: false,
        request: null,
      };
    }
    const meal = residentMeal(s, current, resources);
    const builderRest =
      orderResting(s, r.id) ||
      (!workplaceOpen(s.world.minute) &&
        (s.construction?.crew?.some((w) => w.id === r.id) ||
          s.construction?.workerId === r.id));
    if (
      !builderRest &&
      s.construction &&
      !s.construction.crew &&
      s.construction.workerId === r.id &&
      current.task === `${s.construction.kind}-construction`
    ) {
      const goal = constructionSite(
        s.construction.kind,
        s.construction.position,
      );
      if (
        Math.hypot(current.position.x - goal.x, current.position.z - goal.z) >
        0.01
      ) {
        current.task = null;
        current.nextWork = {
          id: `${s.construction.kind}-construction`,
          position: goal,
        };
      }
    }
    const next = advanceResidentRoutine(
      builderRest ? { ...current, task: null, nextWork: null } : current,
      s.elapsed,
      minutes,
      TIMBER_RULES.walkSpeed,
      {
        ...routinePlaces(s, r.id, seats),
        ...(isMechanical(s, r.id) ? { minute: 720 } : {}),
        hungerRelief: meal.relief,
      },
      meal.amount > 0,
    );
    if (next.routine === "eating" && r.routine !== "eating")
      for (const [food, amount] of Object.entries(meal.foods))
        resources[food as FoodId] -= amount;
    const served = next.routine === "eating" && r.routine !== "eating";
    return {
      ...next,
      ...(builderRest
        ? { task: current.task, nextWork: current.nextWork }
        : {}),
      rationUsed: current.rationUsed + (served ? meal.amount : 0),
      lastMeal: served ? meal.foods : r.lastMeal,
      insideHome:
        next.homeId !== null &&
        (next.routine === "idle" || next.routine === "resting") &&
        next.home !== null &&
        Math.hypot(
          next.position.x - next.home.x,
          next.position.z - next.home.z,
        ) < 0.01,
      request:
        next.health === "dead"
          ? null
          : (next.request ??
            (next.homeId === null && !isMechanical(s, r.id)
              ? "no-home"
              : null)),
    };
  });
  let next: TimberState = { ...s, residents, world: { ...s.world, resources } };
  const build = next.construction;
  if (build && !build.crew && !workplaceOpen(s.world.minute))
    next = {
      ...next,
      construction: {
        ...build,
        startedAt: build.startedAt === null ? null : build.startedAt + minutes,
        finishAt: build.finishAt === null ? null : build.finishAt + minutes,
      },
    };
  if (build && !build.crew && workplaceOpen(s.world.minute)) {
    const builder = next.residents.find((r) => r.id === build.workerId);
    if (builder?.health !== "healthy" || (!builder.task && !builder.nextWork)) {
      const replacement = eligible(
        next,
        constructionSite(build.kind, build.position),
        1,
      )[0];
      if (replacement)
        next = {
          ...next,
          construction: {
            ...build,
            workerId: replacement,
            startedAt: null,
            finishAt: null,
          },
          residents: next.residents.map((r) =>
            r.id === replacement
              ? {
                  ...r,
                  nextWork: {
                    id: `${build.kind}-construction`,
                    position: constructionSite(build.kind, build.position),
                  },
                }
              : r,
          ),
        };
    } else if (
      build.finishAt !== null &&
      builder.task !== `${build.kind}-construction`
    ) {
      next = {
        ...next,
        construction: {
          ...build,
          startedAt: (build.startedAt ?? s.elapsed) + minutes,
          finishAt: build.finishAt + minutes,
        },
      };
    } else if (
      builder?.task === `${build.kind}-construction` &&
      build.finishAt === null
    )
      next = {
        ...next,
        construction: {
          ...build,
          startedAt: s.elapsed,
          finishAt: s.elapsed + VILLAGE_RULES.constructionMinutes,
        },
      };
    else if (
      build.finishAt !== null &&
      s.elapsed >= build.finishAt &&
      builder?.health === "healthy"
    ) {
      const homes =
        build.kind === "home"
          ? [
              ...next.homes,
              {
                id: `dwelling-${next.homes.length + 1}`,
                position: { ...build.position },
                capacity: VILLAGE_RULES.homeSpace,
              },
            ]
          : next.homes;
      if (build.kind === "logging" || build.kind === "storage") {
        const site = loggingSite(next, build.siteId ?? "west");
        next = setLoggingSite(next, {
          ...site,
          built: site.built || build.kind === "logging",
          storageBuilt: site.storageBuilt || build.kind === "storage",
        });
      }
      next = note(
        {
          ...next,
          homes,
          world: {
            ...next.world,
            buildings: homes.map((h) => ({
              id: h.id,
              type: "ondol-nest" as const,
              position: { ...h.position, y: 0 },
              headingRadians: h.headingRadians ?? Math.PI,
            })),
          },
          restaurantBuilt:
            build.kind === "restaurant" ? true : next.restaurantBuilt,
          construction: null,
          residents: assignHomes(
            next.residents.map((r) =>
              r.id === build.workerId
                ? { ...r, task: null, routine: "idle" as const }
                : r,
            ),
            next.world.citizens,
            habitableHomes(homes, next.buildingHealth),
          ),
        },
        build.kind === "restaurant"
          ? "공동 식당 건설 완료. 운영 인원을 배치해 주세요."
          : build.kind === "home"
            ? "온돌 둥지 건설 완료. 거주지가 필요한 주민을 자동 배정했습니다."
            : build.kind === "logging"
              ? `${productionSiteDefinition(build.siteId ?? "west").name} 작업장 건설 완료. 작업 인원을 정해 주세요.`
              : `${productionSiteDefinition(build.siteId ?? "west").name} 저장소 건설 완료. 운반은 유휴 주민이 자동으로 맡습니다.`,
      );
    }
  }
  next = advanceHomeConstruction(
    next,
    minutes,
    eligible,
    villageObstacles(next),
  );
  return advanceTown(
    advanceLogging(next, minutes, eligible, villageObstacles(next)),
    minutes,
  );
}
function destination(s: TimberState, id: string): GroundPoint {
  if (s.phase === "relief")
    return (
      s.suspended?.destinations[s.workerIds.indexOf(id)] ??
      fail("교대 목적지가 없습니다.")
    );
  if (s.phase === "approaching") return front(s, TIMBER_RULES.cartStart);
  if (s.phase === "releasing")
    return { x: front(s, dropPoint(s)).x, z: front(s, dropPoint(s)).z + 2 };
  if (s.phase === "returning")
    return s.returnTo ?? fail("복귀 목적지가 없습니다.");
  if (s.phase === "drying-travel")
    return {
      x: dropPoint(s).x + s.workerIds.indexOf(id) * 2,
      z: warehouseDoor(s) ? dropPoint(s).z : 0.8,
    };
  return TIMBER_RULES.repairSite;
}
function pathLength(
  from: GroundPoint,
  to: GroundPoint,
  obstacles: readonly GroundPoint[],
): number {
  const path = residentPath(from, to, obstacles);
  if (!path.length) return Infinity;
  let total = 0,
    previous = from;
  for (const p of path) {
    total += Math.hypot(p.x - previous.x, p.z - previous.z);
    previous = p;
  }
  return total;
}
function movementMinutes(s: TimberState): number {
  return Math.max(
    1,
    ...s.workerIds.map((id) =>
      Math.ceil(
        pathLength(
          s.residents.find((r) => r.id === id)?.position ?? fail(),
          destination(s, id),
          villageObstacles(s),
        ) / TIMBER_RULES.walkSpeed,
      ),
    ),
  );
}
function duration(s: TimberState): number {
  if (
    [
      "relief",
      "approaching",
      "releasing",
      "returning",
      "drying-travel",
      "building-travel",
    ].includes(s.phase)
  )
    return movementMinutes(s);
  if (s.phase === "transport")
    return s.offer ? TIMBER_RULES.offers[s.offer].travel : fail();
  if (s.phase === "parking") return TIMBER_RULES.parkMinutes;
  if (s.phase === "unloading") return TIMBER_RULES.unloadMinutes;
  if (s.phase === "inspecting") return TIMBER_RULES.inspectionMinutes;
  if (s.phase === "drying") return TIMBER_RULES.repairMinutes;
  if (s.phase === "building") return TIMBER_RULES.useMinutes;
  return 0;
}
function schedule(
  s: TimberState,
  phase: TimberPhase,
  workerIds: readonly string[],
): TimberState {
  const returner = s.residents.find((r) => r.id === workerIds[0]);
  const next = {
    ...s,
    returnTo:
      phase === "returning" && returner
        ? afterWorkDestination(
            returner,
            s.elapsed,
            routinePlaces(s, returner.id),
          )
        : null,
    phase,
    workerIds,
    startedAt: s.elapsed,
    due: null,
    residents: s.residents.map((r) =>
      workerIds.includes(r.id)
        ? {
            ...r,
            routine: "idle" as const,
            eatingUntil: null,
            insideHome: false,
          }
        : r,
    ),
  };
  const length = duration(next);
  if (!Number.isFinite(length) || length <= 0)
    fail("업무 장소에 도달할 수 없습니다.");
  return { ...next, due: s.elapsed + length };
}
function stop(s: TimberState, phase: TimberPhase): TimberState {
  return resumeResidents(
    { ...s, phase, workerIds: [], startedAt: null, due: null, returnTo: null },
    0,
  );
}
function eligible(s: TimberState, site: GroundPoint, count: number): string[] {
  const found: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = nearestRepairResident(
      s.residents.map((r) => ({
        ...r,
        task:
          found.includes(r.id) ||
          r.nextWork !== null ||
          r.routine === "eating" ||
          s.workerIds.includes(r.id) ||
          r.health !== "healthy"
            ? "reserved"
            : r.task,
      })),
      site,
      villageObstacles(s),
    );
    if (!id) return [];
    found.push(id);
  }
  return found;
}
function finishMovement(s: TimberState): TimberState {
  return {
    ...s,
    residents: s.residents.map((r) =>
      s.workerIds.includes(r.id)
        ? { ...r, position: { ...destination(s, r.id) } }
        : r,
    ),
  };
}
function credit(s: TimberState, quantity: number): TimberState {
  return {
    ...s,
    world: {
      ...s.world,
      resources: {
        ...s.world.resources,
        RES_WOOD: s.world.resources.RES_WOOD + quantity * AMOUNT_SCALE,
      },
    },
    stock: { ...s.stock, available: s.stock.available + quantity },
  };
}
function finishProcurement(s: TimberState): TimberState {
  return note(
    { ...stop(s, "ready"), settledAt: s.elapsed, mission: "register-policy" },
    "조달 완료. 공동 재고에 전량 반영하고 다음 임무 P01 장부 선택으로 넘어갑니다.",
  );
}
function startDrying(s: TimberState): TimberState {
  const ids = eligible(
    s,
    warehouseDoor(s, TIMBER_RULES.cartStart) ?? { x: 4.5, z: 0.8 },
    2,
  );
  if (ids.length < 2) return stop(s, "waiting-labor");
  return note(
    schedule(s, "drying-travel", ids),
    "젖은 목재 보완에 유휴 주민2명을 자동 배정했습니다.",
  );
}
function replaceCrew(s: TimberState): TimberState {
  if (
    s.phase !== "crew-wait" &&
    !s.workerIds.some(
      (id) => s.residents.find((r) => r.id === id)?.health !== "healthy",
    )
  )
    return s;
  if (
    s.phase === "select" ||
    s.phase === "ready" ||
    s.phase === "waiting-labor"
  )
    return s;
  const saved: NonNullable<TimberState["suspended"]> = s.suspended ?? {
    phase: s.phase as NonNullable<TimberState["suspended"]>["phase"],
    ids: s.workerIds,
    progress: s.elapsed - (s.startedAt ?? s.elapsed),
    remaining: (s.due ?? s.elapsed) - s.elapsed,
    origins: s.workerIds.map(
      (id) => s.residents.find((r) => r.id === id)?.position ?? fail(),
    ),
    destinations: s.workerIds.map((id) => movePosition(s, id)),
    returnTo: s.returnTo,
    cart: timberCartPosition(s),
  };
  const incoming: string[] = [];
  for (const site of saved.destinations) {
    const chosen = nearestRepairResident(
      s.residents.map((r) => ({
        ...r,
        task:
          r.health !== "healthy" ||
          r.routine === "eating" ||
          r.nextWork ||
          s.workerIds.includes(r.id) ||
          incoming.includes(r.id)
            ? "reserved"
            : r.task,
      })),
      site,
      villageObstacles(s),
    );
    if (!chosen) {
      if (s.phase === "crew-wait") return s;
      return note(
        {
          ...s,
          phase: "crew-wait",
          suspended: saved,
          workerIds: [],
          startedAt: null,
          due: null,
          returnTo: null,
          residents: s.residents.map((r) =>
            s.workerIds.includes(r.id)
              ? {
                  ...r,
                  position: movePosition(s, r.id),
                  task: null,
                  routine: "idle",
                  eatingUntil: null,
                  diningSeat: null,
                }
              : r,
          ),
        },
        "교대할 유휴 인력을 기다립니다. 다른 주민의 생활은 계속됩니다.",
      );
    }
    incoming.push(chosen);
  }
  const next = {
    ...s,
    suspended: saved,
    residents: s.residents.map((r) =>
      s.workerIds.includes(r.id)
        ? {
            ...r,
            position: movePosition(s, r.id),
            task: null,
            routine: "idle" as const,
            eatingUntil: null,
            diningSeat: null,
          }
        : r,
    ),
  };
  return note(
    schedule(next, "relief", incoming),
    "가까운 유휴 주민이 현장으로 이동해 남은 업무를 인계받습니다.",
  );
}
function completeStep(s: TimberState): TimberState {
  switch (s.phase) {
    case "relief": {
      const saved = s.suspended ?? fail("교대할 업무가 없습니다.");
      const resumed = {
        ...s,
        phase: saved.phase,
        startedAt: s.elapsed - saved.progress,
        due: s.elapsed + saved.remaining,
        returnTo: saved.returnTo,
        suspended: null,
        transportWorkerId: [
          "approaching",
          "transport",
          "parking",
          "releasing",
          "unloading",
          "inspecting",
          "returning",
        ].includes(saved.phase)
          ? (s.workerIds[0] ?? null)
          : s.transportWorkerId,
        repairWorkerId: ["building-travel", "building"].includes(saved.phase)
          ? (s.workerIds[0] ?? null)
          : s.repairWorkerId,
        residents: s.residents.map((r) => {
          const i = s.workerIds.indexOf(r.id);
          return i >= 0
            ? { ...r, position: (saved.origins as GroundPoint[])[i] ?? fail() }
            : r;
        }),
      };
      return note(
        resumed,
        "교대 완료. 이미 정산한 물량을 유지하고 남은 업무를 이어갑니다.",
      );
    }
    case "approaching":
      return note(
        schedule(finishMovement(s), "transport", s.workerIds),
        "수레를 인계받아 입고 장소로 운송합니다.",
      );
    case "transport":
      return note(
        schedule(
          {
            ...s,
            residents: s.residents.map((r) =>
              s.workerIds.includes(r.id)
                ? { ...r, position: front(s, dropPoint(s)) }
                : r,
            ),
          },
          "parking",
          s.workerIds,
        ),
        "하역 위치에 멈춰 수레 손잡이를 내려놓습니다.",
      );
    case "parking":
      return note(
        schedule(s, "releasing", s.workerIds),
        "수레를 내려놓았습니다. 손잡이에서 옆으로 물러납니다.",
      );
    case "releasing":
      return note(
        schedule(finishMovement(s), "unloading", s.workerIds),
        "빈손으로 하역 위치에 섰습니다. 자동 하역을 시작합니다.",
      );
    case "unloading":
      return note(
        schedule(s, "inspecting", s.workerIds),
        "하역 완료. 전량 검수를 자동으로 시작합니다.",
      );
    case "inspecting": {
      if (
        storageRoom(s, "RES_WOOD", true) <
        20 - (s.offer ? TIMBER_RULES.offers[s.offer].wet : 0)
      )
        return { ...s, startedAt: (s.startedAt ?? 0) + 1, due: s.elapsed + 1 };
      const wet = s.offer ? TIMBER_RULES.offers[s.offer].wet : fail();
      return note(
        schedule(
          credit(
            { ...s, stock: { ...s.stock, waiting: 0, quarantine: wet } },
            20 - wet,
          ),
          "returning",
          s.workerIds,
        ),
        `합격${20 - wet} 공동 재고에 자동 입고. 격리${wet}. 운송 주민이 복귀합니다.`,
      );
    }
    case "returning": {
      const next = stop(finishMovement(s), "ready");
      return next.stock.quarantine
        ? startDrying(note(next, "운송 주민 복귀 완료."))
        : finishProcurement(next);
    }
    case "drying-travel":
      return note(
        schedule(finishMovement(s), "drying", s.workerIds),
        "보완 작업 장소에 도착했습니다. 건조·재검사를 시작합니다.",
      );
    case "drying":
      if (storageRoom(s, "RES_WOOD", true) < 4)
        return { ...s, startedAt: (s.startedAt ?? 0) + 1, due: s.elapsed + 1 };
      return finishProcurement(
        credit({ ...s, stock: { ...s.stock, quarantine: 0 } }, 4),
      );
    case "building-travel":
      return note(
        schedule(finishMovement(s), "building", s.workerIds),
        "직접 명령한 건물 보수를 시작합니다.",
      );
    case "building":
      return note(
        {
          ...stop(s, "ready"),
          buildingHealth: 100,
          reservedWood: 0,
          repairWorkerId: null,
          repairCompletedAt: s.elapsed,
          world: {
            ...s.world,
            resources: {
              ...s.world.resources,
              RES_WOOD: s.world.resources.RES_WOOD - 20 * AMOUNT_SCALE,
            },
          },
          woodSpent: s.woodSpent + 20,
          stock: {
            ...s.stock,
            available: Math.max(0, s.stock.available - 20),
            used: s.stock.used + Math.min(20, s.stock.available),
          },
        },
        "건물 보수 완료. 공동 목재20 사용, 인력을 해제했습니다.",
      );
    default:
      return s;
  }
}
export function parseTimberState(value: unknown): TimberState {
  if (
    isRecord(value) &&
    (value.version === 10 || value.version === 11) &&
    isRecord(value.logging) &&
    !("mineralSites" in value)
  ) {
    const old = value;
    const oldLogging = value.logging;
    const migrate = (l: unknown, id?: ProductionSiteId) => {
      if (!isRecord(l) || !("forest" in l) || "remaining" in l)
        fail("이전 생산 기록이 올바르지 않습니다.");
      const { forest, ...rest } = l;
      return { ...rest, siteId: id ?? l.siteId, remaining: forest };
    };
    const oldWorld = parsePlayState(old.world);
    let extra: unknown[] = [];
    if (old.version === 11) {
      if (!Array.isArray(old.loggingSites) || old.loggingSites.length !== 8)
        fail("이전 숲 권역 기록이 올바르지 않습니다.");
      extra = old.loggingSites.map((l) => migrate(l));
    } else if ("loggingSites" in old || "siteId" in oldLogging)
      fail("이전 생산 기록이 올바르지 않습니다.");
    value = {
      ...old,
      version: 12,
      world: oldWorld,
      logging: migrate(old.logging, "west"),
      loggingSites:
        old.version === 10
          ? BOKHOL_FORESTS.slice(1).map((f) => createLogging(f.id))
          : [
              ...extra,
              ...BOKHOL_FORESTS.slice(9).map((f) => createLogging(f.id)),
            ],
      mineralSites: BOKHOL_MINERALS.map((f) => createLogging(f.id)),
      initialMinerals: {
        RES_COAL: oldWorld.resources.RES_COAL,
        RES_IRON_ORE: oldWorld.resources.RES_IRON_ORE,
        RES_STONE: oldWorld.resources.RES_STONE,
      },
      construction:
        isRecord(old.construction) &&
        ["logging", "storage"].includes(old.construction.kind as string)
          ? { ...old.construction, siteId: old.construction.siteId ?? "west" }
          : old.construction,
    };
  }
  if (
    isRecord(value) &&
    value.version === 12 &&
    Array.isArray(value.homes) &&
    Array.isArray(value.residents)
  ) {
    const homes = value.homes.map((h) =>
      isRecord(h) ? { ...h, headingRadians: h.headingRadians ?? Math.PI } : h,
    );
    if (homes.some((h) => !isRecord(h))) fail();
    const world = parsePlayState(value.world);
    for (const r of value.residents) {
      if (!isRecord(r)) fail();
      if (r.homeId !== null) {
        const h = homes.find(
          (h) => isRecord(h) && h.id === r.homeId,
        ) as unknown as VillageHome | undefined;
        if (!h || !isRecord(r.home))
          fail("이전 거주지 기록이 올바르지 않습니다.");
        const door = homeEntrance({
          position: h.position,
          headingRadians: h.headingRadians ?? Math.PI,
        });
        if (r.home.x !== door.x || r.home.z !== door.z)
          fail("이전 귀가 위치가 올바르지 않습니다.");
      }
    }
    const residents = assignHomes(
      value.residents as unknown as VillageResident[],
      world.citizens,
      homes as unknown as VillageHome[],
    );
    value = { ...value, version: 13, homes, residents };
  }
  if (isRecord(value) && value.version === 13)
    value = { ...value, version: 14, town: createTown() };
  if (
    isRecord(value) &&
    value.version === 14 &&
    isRecord(value.town) &&
    Array.isArray(value.town.facilities) &&
    Array.isArray(value.town.trips)
  )
    value = {
      ...value,
      version: 15,
      town: {
        ...value.town,
        facilities: value.town.facilities.map((f) => ({
          ...f,
          level: 1,
          yieldRemainder: 0,
        })),
        trips: value.town.trips.map((t) => ({ ...t, rank: 1 })),
        development: createDevelopment(),
      },
    };
  if (
    isRecord(value) &&
    value.version === 15 &&
    isRecord(value.town) &&
    Array.isArray(value.residents)
  )
    value = {
      ...value,
      version: 16,
      town: {
        ...value.town,
        patients: value.residents
          .filter((r) => isRecord(r) && r.health === "sick")
          .map((r) => ({
            resident: r.id,
            severity: "minor",
            progress: 0,
            hospital: null,
          })),
      },
    };
  if (
    isRecord(value) &&
    value.version === 16 &&
    isRecord(value.town) &&
    isRecord(value.town.development) &&
    Array.isArray(value.town.patients) &&
    Array.isArray(value.town.facilities) &&
    Array.isArray(value.town.orders)
  ) {
    const facilities = value.town.facilities;
    const beds = new Map<string, number>();
    value = {
      ...value,
      version: 17,
      town: {
        ...value.town,
        patients: value.town.patients.map((p) => {
          const f = facilities.find((f) => f.id === p.hospital);
          const used = beds.get(p.hospital) ?? 0;
          const limit = [5, 15, 25][(f?.level ?? 1) - 1] ?? 5;
          if (p.hospital !== null) beds.set(p.hospital, used + 1);
          return {
            ...p,
            progress: p.progress * 12,
            hospital: used >= limit ? null : p.hospital,
          };
        }),
        development: {
          ...value.town.development,
          story: createResearchStory(),
          electrical: [],
          grandfathered: [
            ...facilities.flatMap((f) =>
              [2, 3]
                .filter((level) => level <= f.level)
                .map((level) => `${f.id}:${level}`),
            ),
            ...value.town.orders
              .filter((o) => o.upgradeTarget)
              .map((o) => `${o.upgradeTarget}:${o.upgradeLevel}`),
          ],
        },
      },
    };
  }
  if (
    isRecord(value) &&
    value.version === 17 &&
    isRecord(value.town) &&
    isRecord(value.town.development) &&
    Array.isArray(value.residents) &&
    Array.isArray(value.town.trips)
  ) {
    const old = value.town.development.research;
    const trips = value.town.trips;
    value = {
      ...value,
      version: 18,
      residents: value.residents.map((r) => {
        if (!isRecord(r) || r.workplaceId !== null) return r;
        const trip = trips.find(
          (t) =>
            isRecord(t) &&
            Array.isArray(t.ids) &&
            t.ids.includes(r.id) &&
            r.task === `expedition:${t.id}`,
        );
        return trip ? { ...r, workplaceId: `facility:${trip.facilityId}` } : r;
      }),
      town: {
        ...value.town,
        development: {
          ...value.town.development,
          research: old === null ? [] : isRecord(old) ? [old] : old,
        },
      },
    };
  }
  if (
    !isRecord(value) ||
    value.version !== 18 ||
    !phases.includes(value.phase as string) ||
    typeof value.paused !== "boolean" ||
    ![1, 3].includes(value.speed as number) ||
    !isRecord(value.stock) ||
    !Array.isArray(value.residents) ||
    !Array.isArray(value.workerIds) ||
    !Array.isArray(value.processed) ||
    !Array.isArray(value.history)
  )
    fail("지원하지 않는 작업 저장입니다. 기존 원본은 유지됩니다.");
  if (value.phase === "relief" || value.phase === "crew-wait") {
    const saved = value.suspended;
    if (
      !isRecord(saved) ||
      !activePhases.includes(saved.phase as string) ||
      saved.phase === "relief" ||
      !Array.isArray(saved.ids) ||
      saved.ids.length !==
        (Array.isArray(saved.origins) ? saved.origins.length : -1) ||
      !Array.isArray(saved.origins) ||
      !Array.isArray(saved.destinations) ||
      saved.origins.length !==
        (value.phase === "relief"
          ? value.workerIds.length
          : saved.ids.length) ||
      saved.destinations.length !== saved.origins.length ||
      !saved.origins.every(point) ||
      !saved.destinations.every(point) ||
      !point(saved.cart) ||
      (saved.returnTo !== null && !point(saved.returnTo))
    )
      fail("교대 저장이 올바르지 않습니다.");
    num(saved.progress);
    num(saved.remaining);
    if (saved.remaining === 0) fail();
    num(value.elapsed);
    const handover = JSON.parse(JSON.stringify(value)) as TimberState;
    if (value.phase === "relief") {
      num(value.startedAt);
      num(value.due);
      if (
        handover.startedAt === null ||
        handover.due === null ||
        handover.startedAt > handover.elapsed ||
        handover.due <= handover.elapsed ||
        handover.due !== handover.startedAt + movementMinutes(handover)
      )
        fail("교대 종료 시각이 올바르지 않습니다.");
    } else if (
      value.workerIds.length ||
      value.startedAt !== null ||
      value.due !== null ||
      value.returnTo !== null
    )
      fail("교대 대기 상태가 올바르지 않습니다.");
    const crew =
      value.phase === "relief"
        ? (value.workerIds as string[])
        : (saved.ids as string[]);
    parseTimberState({
      ...value,
      phase: saved.phase,
      workerIds: crew,
      suspended: null,
      returnTo: saved.returnTo,
      startedAt: (value.elapsed as number) - saved.progress,
      due: (value.elapsed as number) + saved.remaining,
      repairWorkerId: ["building-travel", "building"].includes(
        saved.phase as string,
      )
        ? value.workerIds[0]
        : value.repairWorkerId,
      residents: value.residents.map((r) => {
        if (!isRecord(r)) fail();
        const i = crew.indexOf(r.id as string);
        return i >= 0
          ? { ...r, position: (saved.origins as GroundPoint[])[i] }
          : r;
      }),
    });
    return handover;
  }
  if (
    !Array.isArray(value.homes) ||
    value.homes.length < 1 ||
    value.homes.length > 100 ||
    !["needs", "cap"].includes(value.rationPolicy as string)
  )
    fail("거주지·배급 정책이 올바르지 않습니다.");
  num(value.restaurantWorkerTarget, 6);
  const homeIds = new Set<string>();
  for (const h of value.homes) {
    if (
      !isRecord(h) ||
      typeof h.id !== "string" ||
      !h.id ||
      homeIds.has(h.id) ||
      !point(h.position) ||
      !Number.isInteger(h.level ?? 1) ||
      Number(h.level ?? 1) < 1 ||
      Number(h.level ?? 1) > 3 ||
      h.capacity !== 20 + (Number(h.level ?? 1) - 1) * 10 ||
      (h.headingRadians !== undefined &&
        (typeof h.headingRadians !== "number" ||
          !Number.isFinite(h.headingRadians) ||
          h.headingRadians < 0 ||
          h.headingRadians >= Math.PI * 2))
    )
      fail("거주지 정보가 올바르지 않습니다.");
    homeIds.add(h.id);
  }
  if (value.suspended !== null) fail("교대 중이 아닌 상태의 업무 보관입니다.");
  parsePlayState(value.world);
  if (
    typeof value.restaurantBuilt !== "boolean" ||
    (value.returnTo !== null && !point(value.returnTo)) ||
    (value.phase === "returning") !== (value.returnTo !== null)
  )
    fail("건물·복귀 상태가 올바르지 않습니다.");
  if (
    value.construction !== null &&
    (!isRecord(value.construction) ||
      typeof value.construction.workerId !== "string" ||
      !["restaurant", "home", "logging", "storage"].includes(
        value.construction.kind as string,
      ) ||
      !point(value.construction.position) ||
      (value.construction.finishAt !== null &&
        (!Number.isSafeInteger(value.construction.finishAt) ||
          (value.construction.finishAt as number) < 0)))
  )
    fail("식당 건설 상태가 올바르지 않습니다.");
  if (value.construction !== null) {
    const build = value.construction as Record<string, unknown>;
    if (
      build.headingRadians !== undefined &&
      (typeof build.headingRadians !== "number" ||
        !Number.isFinite(build.headingRadians) ||
        build.headingRadians < 0 ||
        build.headingRadians >= Math.PI * 2)
    )
      fail("건설 방향이 올바르지 않습니다.");
    if (build.crew !== undefined) {
      if (
        build.kind !== "home" ||
        !Array.isArray(build.crew) ||
        build.crew.length < 1 ||
        build.crew.length > 3 ||
        build.headingRadians === undefined
      )
        fail("둥지 건설 인력이 올바르지 않습니다.");
      let amount = 0;
      const builders = new Set<string>();
      const workSlots = new Set<number>();
      for (const w of build.crew) {
        if (
          !isRecord(w) ||
          !(w.id === null || typeof w.id === "string") ||
          !Number.isSafeInteger(w.amount) ||
          (w.amount as number) < 1 ||
          !["collect", "deliver", "build"].includes(w.phase as string) ||
          !point(w.source)
        )
          fail("건설 자재 기록이 올바르지 않습니다.");
        if (
          w.workSlot !== undefined &&
          (!Number.isInteger(w.workSlot) ||
            (w.workSlot as number) < 0 ||
            (w.workSlot as number) > 2)
        )
          fail("건설 작업 위치가 올바르지 않습니다.");
        if (typeof w.workSlot === "number") {
          if (workSlots.has(w.workSlot))
            fail("건설 작업 위치가 중복되었습니다.");
          workSlots.add(w.workSlot);
        }
        amount += w.amount as number;
        if (w.id !== null) {
          if (
            builders.has(w.id as string) ||
            !value.residents.some((r) => isRecord(r) && r.id === w.id)
          )
            fail("건설 인력이 중복되거나 없습니다.");
          builders.add(w.id as string);
        }
      }
      if (amount !== 20) fail("건설 자재 합계가 일치하지 않습니다.");
      if (
        build.finishAt !== null &&
        (build.crew as Record<string, unknown>[]).some(
          (w) => w.phase !== "build",
        )
      )
        fail("자재 운반 전에 건설할 수 없습니다.");
    }

    if (["logging", "storage"].includes(build.kind as string)) {
      if (!BOKHOL_PRODUCTION_SITES.some((f) => f.id === build.siteId))
        fail("공사 권역이 올바르지 않습니다.");
      const rules = loggingSiteRules(build.siteId as ProductionSiteId);
      const expected =
        build.kind === "logging" ? rules.workshop : rules.storage;
      if (
        !point(build.position) ||
        build.position.x !== expected.x ||
        build.position.z !== expected.z
      )
        fail("공사 위치와 숲 권역이 일치하지 않습니다.");
    } else if (build.siteId !== undefined)
      fail("해당 공사에는 숲 권역이 없습니다.");
    if ((build.startedAt === null) !== (build.finishAt === null))
      fail("식당 건설 시각이 일치하지 않습니다.");
    if (build.startedAt !== null) {
      num(build.startedAt);
      num(build.finishAt, 14430);
      if (
        build.startedAt > (value.elapsed as number) ||
        ![8, VILLAGE_RULES.constructionMinutes].includes(
          build.finishAt - build.startedAt,
        ) ||
        build.finishAt <= (value.elapsed as number)
      )
        fail("식당 건설 종료 시각이 올바르지 않습니다.");
    }
  }
  for (const key of ["elapsed", "initialWood", "initialIron", "woodSpent"])
    num(value[key], 10_000_000_000);
  num(value.remainder, 999);
  num(value.buildingHealth, 100);
  if (
    value.chapter !== undefined &&
    ![2, 3, 4, 5].includes(value.chapter as number)
  )
    fail("단계 오류");
  if (
    value.campaign !== undefined &&
    !campaignValid(value.campaign, value.elapsed as number)
  )
    fail("캠페인 기록 오류");
  if (value.scoutDepartures !== undefined) {
    if (!isRecord(value.scoutDepartures)) fail("정찰 기록 오류");
    for (const [id, start] of Object.entries(value.scoutDepartures)) {
      if (!SCOUT_SITES.some((site) => site.id === id)) fail("정찰 거점 오류");
      num(start);
    }
  }
  if (value.yardDryAt !== undefined) num(value.yardDryAt);
  num(value.reservedWood, 20);
  for (const key of ["startedAt", "due", "settledAt", "repairCompletedAt"])
    if (value[key] !== null) num(value[key]);
  for (const key of ["cart", "waiting", "quarantine", "available", "used"])
    num(value.stock[key], 20);
  if (
    ![null, "A", "B"].includes(value.offer as null) ||
    ![null, "relief", "registry"].includes(value.policy as null) ||
    !["procurement", "register-policy", "village-orders"].includes(
      value.mission as string,
    )
  )
    fail();
  if (value.scoutVisitors !== undefined) num(value.scoutVisitors, 1000000);
  if (value.riskyMerchants !== undefined) {
    if (
      !Array.isArray(value.riskyMerchants) ||
      new Set(value.riskyMerchants).size !== value.riskyMerchants.length
    )
      fail();
    for (const item of value.riskyMerchants) num(item, 8);
  }
  if (value.merchantRepair !== undefined) {
    const r = value.merchantRepair;
    if (!isRecord(r)) fail();
    num(r.item, 8);
    num(r.quantity, 4);
    num(r.work, 30);
    if (!r.quantity) fail();
  }
  if (value.merchantItem !== undefined) num(value.merchantItem, 8);
  if (value.residents.length > 600) fail();
  const ids = new Set<string>();
  for (const r of value.residents) {
    if (
      !isRecord(r) ||
      typeof r.id !== "string" ||
      !r.id ||
      ids.has(r.id) ||
      !point(r.position) ||
      (r.homeId !== null &&
        (typeof r.homeId !== "string" || !homeIds.has(r.homeId))) ||
      typeof r.insideHome !== "boolean" ||
      !Number.isSafeInteger(r.rationDay) ||
      (r.rationDay as number) < 1 ||
      (r.rationDay as number) > (value.world as unknown as PlayState).day ||
      !Number.isSafeInteger(r.rationUsed) ||
      (r.rationUsed as number) < 0 ||
      (r.rationUsed as number) > 20000 ||
      (r.lastMeal !== null &&
        (!isRecord(r.lastMeal) ||
          Object.entries(r.lastMeal).some(
            ([food, amount]) =>
              !["RES_PLANT", "RES_MEAT", "RES_FISH"].includes(food) ||
              !Number.isSafeInteger(amount) ||
              (amount as number) <= 0 ||
              (amount as number) > 5000,
          ))) ||
      (r.home !== null && !point(r.home)) ||
      (r.diningSeat !== null &&
        (!Number.isSafeInteger(r.diningSeat) ||
          (r.diningSeat as number) < 0 ||
          (r.diningSeat as number) >=
            Math.max(
              1,
              Array.isArray((value.town as TownState)?.facilities)
                ? (value.town as TownState).facilities.filter(
                    (f) => f.kind === "restaurant",
                  ).length
                : 0,
            ) *
              40)) ||
      !Number.isSafeInteger(r.hunger) ||
      (r.hunger as number) < 0 ||
      (r.hunger as number) > 2880 ||
      !["healthy", "sick", "dead"].includes(r.health as string) ||
      ![
        null,
        "no-restaurant",
        "restaurant-closed",
        "no-food",
        "no-staff",
        "ration-exhausted",
        "no-home",
        "waiting-seat",
      ].includes(r.request as null) ||
      (r.eatingUntil !== null &&
        (!Number.isSafeInteger(r.eatingUntil) ||
          (r.eatingUntil as number) < 0 ||
          (r.eatingUntil as number) > 144000360)) ||
      ![
        "idle",
        "home",
        "warmth",
        "restaurant",
        "eating",
        "next-work",
        "to-work",
        "working",
        "resting",
      ].includes(r.routine as string) ||
      (r.nextWork !== null &&
        (!isRecord(r.nextWork) ||
          typeof r.nextWork.id !== "string" ||
          !r.nextWork.id ||
          r.nextWork.id.length > 100 ||
          !point(r.nextWork.position))) ||
      (r.workplaceId !== null && typeof r.workplaceId !== "string") ||
      (r.task !== null && typeof r.task !== "string")
    )
      fail("주민 명부가 올바르지 않습니다.");
    if (
      !(value.world as unknown as PlayState).citizens.some(
        (c) =>
          c.id === r.id &&
          (c.alive ? (c.health ?? "healthy") : "dead") === r.health,
      )
    )
      fail("존재하지 않는 주민입니다.");
    if ((r.routine === "eating") !== (r.eatingUntil !== null))
      fail("식사 상태가 올바르지 않습니다.");
    ids.add(r.id);
  }
  const s = JSON.parse(JSON.stringify(value)) as TimberState;
  if (
    s.campaign &&
    ["opening", "departure"].includes(s.campaign.beat) &&
    (s.elapsed !== 0 ||
      !s.paused ||
      s.chapter ||
      s.residents.length !== 300 ||
      !Object.values(s.world.resources).every(
        (n) => n === 10000 * AMOUNT_SCALE,
      ))
  )
    fail("출문 전 장부가 일치하지 않습니다.");
  if (!townValid(s)) fail("건설·생산·파견 기록이 올바르지 않습니다.");
  if (
    s.world.buildings.length !== s.homes.length ||
    s.homes.some(
      (h) =>
        !s.world.buildings.some(
          (b) =>
            b.id === h.id &&
            b.position.x === h.position.x &&
            b.position.z === h.position.z &&
            b.headingRadians === (h.headingRadians ?? Math.PI),
        ),
    )
  )
    fail("거주지와 건물 명부가 일치하지 않습니다.");
  for (const h of s.homes)
    if (homeUsage(h.id, s.residents, s.world.citizens) > h.capacity)
      fail("둥지 수용 공간을 초과했습니다.");
  if (s.construction?.crew)
    for (const w of s.construction.crew) {
      const r = s.residents.find((r) => r.id === w.id);
      if (
        r?.health === "healthy" &&
        (r.workplaceId !== null ||
          r.task !== "home-construction" ||
          r.nextWork !== null ||
          s.workerIds.includes(r.id))
      )
        fail("건설 인력이 다른 업무에 중복 배치되었습니다.");
    }
  const sleeping = new Set<string>();
  for (const r of s.residents) {
    if (r.homeId === null) {
      if (r.homeSlot !== null) fail("거주지 없는 주민의 잠자리 기록입니다.");
      continue;
    }
    const h = s.homes.find((h) => h.id === r.homeId),
      c = s.world.citizens.find((c) => c.id === r.id);
    if (
      !h ||
      !c?.alive ||
      c.mechanicalFrom ||
      r.homeSlot === null ||
      !Number.isInteger(r.homeSlot) ||
      r.homeSlot < 0 ||
      r.homeSlot + speciesRule(c.species).space > h.capacity
    )
      fail("잠자리 배정이 올바르지 않습니다.");
    for (let k = 0; k < speciesRule(c.species).space; k++) {
      const key = `${h.id}:${r.homeSlot + k}`;
      if (sleeping.has(key)) fail("잠자리가 중복 배정되었습니다.");
      sleeping.add(key);
    }
  }
  for (const r of s.residents) {
    const h = s.homes.find((h) => h.id === r.homeId),
      c = s.world.citizens.find((c) => c.id === r.id) ?? fail();
    if (
      h
        ? !r.home ||
          r.home.x !==
            homeEntrance({
              position: h.position,
              headingRadians: h.headingRadians ?? Math.PI,
            }).x ||
          r.home.z !==
            homeEntrance({
              position: h.position,
              headingRadians: h.headingRadians ?? Math.PI,
            }).z
        : r.home !== null
    )
      fail("귀가 목적지가 거주지와 다릅니다.");
    if (
      r.insideHome &&
      (!h ||
        !["idle", "resting"].includes(r.routine) ||
        Math.hypot(
          r.position.x - (r.home?.x ?? 100),
          r.position.z - (r.home?.z ?? 100),
        ) > 0.01)
    )
      fail("실내 상태가 올바르지 않습니다.");
    if (
      r.rationUsed > speciesRule(c.species).portion * 4 ||
      (r.lastMeal &&
        Object.values(r.lastMeal).reduce((a, b) => a + b, 0) >
          speciesRule(c.species).portion)
    )
      fail("종별 배급 기록이 올바르지 않습니다.");
  }
  if (
    s.buildingHealth === 0 &&
    s.residents.some((r) => r.homeId === "example-building-1")
  )
    fail("파괴된 둥지에 입주할 수 없습니다.");
  if (!loggingValid(s)) fail("벌목·운반 재고 정보가 올바르지 않습니다.");
  const staff = s.residents.filter((r) => r.workplaceId === "restaurant");
  if (
    s.restaurantWorkerTarget >
      (restaurants(s)[0]
        ? facilityStaffLimit(
            restaurants(s)[0] ?? { kind: "restaurant", level: 1 },
          )
        : 2) ||
    staff.length > s.restaurantWorkerTarget ||
    (!s.restaurantBuilt && staff.length)
  )
    fail("식당 인력 배치가 올바르지 않습니다.");
  const seats = s.residents.flatMap((r) =>
    r.diningSeat === null ? [] : [r.diningSeat],
  );
  if (
    seats.some((seat) => {
      const f = restaurants(s)[Math.floor(seat / 40)];
      return restaurants(s).length
        ? !f || seat % 40 >= diningCapacity(f.level)
        : seat >= 10;
    })
  )
    fail("식당 좌석 기록이 올바르지 않습니다.");
  if (new Set(seats).size !== seats.length) fail("식당 자리 중복 예약입니다.");
  if (
    s.residents.length !== s.world.citizens.length ||
    (s.construction &&
      (!s.residents.some((r) => r.id === s.construction?.workerId) ||
        (s.construction.kind === "restaurant" && s.restaurantBuilt)))
  )
    fail("주민·식당 등록이 일치하지 않습니다.");
  for (const id of [s.transportWorkerId, s.repairWorkerId])
    if (id !== null && !ids.has(id)) fail("업무 담당 주민이 없습니다.");
  if (
    new Set(s.workerIds).size !== s.workerIds.length ||
    s.workerIds.some(
      (id) =>
        !ids.has(id) ||
        s.residents.find((r) => r.id === id)?.workplaceId !== null ||
        s.residents.find((r) => r.id === id)?.task !== null,
    )
  )
    fail("주민 중복 배정 또는 작업장 배치 충돌입니다.");
  const busy = activePhases.includes(s.phase),
    expectedWorkers = ["drying-travel", "drying"].includes(s.phase)
      ? 2
      : busy
        ? 1
        : 0;
  if (
    s.workerIds.length !== expectedWorkers ||
    busy !== (s.due !== null) ||
    busy !== (s.startedAt !== null)
  )
    fail("업무 예약이 일치하지 않습니다.");
  if (
    busy &&
    (s.startedAt === null ||
      s.due === null ||
      s.startedAt > s.elapsed ||
      s.due <= s.elapsed ||
      s.due !== s.startedAt + duration(s))
  )
    fail("작업 종료 시각이 올바르지 않습니다.");
  const contracted = s.contractId !== null;
  if (
    contracted
      ? typeof s.contractId !== "string" ||
        !s.contractId ||
        !s.offer ||
        !s.transportWorkerId ||
        s.phase === "select"
      : s.phase !== "select" || s.transportWorkerId !== null
  )
    fail("계약 정보가 올바르지 않습니다.");
  if (
    Object.values(s.stock).reduce((a, b) => a + b, 0) !== (contracted ? 20 : 0)
  )
    fail("물량 보존이 일치하지 않습니다.");
  if (
    ["approaching", "transport", "parking", "releasing"].includes(s.phase)
      ? s.stock.cart !== 20
      : s.phase !== "unloading" && s.stock.cart !== 0
  )
    fail("수레 재고가 올바르지 않습니다.");
  if (s.phase === "unloading") {
    const moved = Math.floor(
      (20 * (s.elapsed - (s.startedAt ?? 0))) / TIMBER_RULES.unloadMinutes,
    );
    if (s.stock.cart !== 20 - moved || s.stock.waiting !== moved)
      fail("하역 물량이 올바르지 않습니다.");
  } else if (
    s.phase === "inspecting" ? s.stock.waiting !== 20 : s.stock.waiting !== 0
  )
    fail("검사 대기 재고가 올바르지 않습니다.");
  if (
    [
      "approaching",
      "transport",
      "parking",
      "releasing",
      "unloading",
      "inspecting",
    ].includes(s.phase) &&
    (s.stock.available || s.stock.used || s.stock.quarantine)
  )
    fail("검수 전 입고를 허용하지 않습니다.");
  const wet = s.offer ? TIMBER_RULES.offers[s.offer].wet : 0;
  if (
    s.phase === "returning" &&
    (s.stock.available !== 20 - wet ||
      s.stock.quarantine !== wet ||
      s.stock.used !== 0)
  )
    fail("검수 결과가 올바르지 않습니다.");
  if (
    ["waiting-labor", "drying-travel", "drying"].includes(s.phase) &&
    (s.offer !== "A" ||
      s.stock.available !== 16 ||
      s.stock.quarantine !== 4 ||
      s.stock.used !== 0)
  )
    fail("보완 물량이 올바르지 않습니다.");
  if (
    ["ready", "building-travel", "building"].includes(s.phase) &&
    s.settledAt === null
  )
    fail("조달 완료 이력이 없습니다.");
  if (
    s.world.resources.RES_WOOD !==
      s.initialWood +
        (s.town.received.RES_WOOD ?? 0) * AMOUNT_SCALE +
        (s.stock.available +
          s.stock.used +
          loggingSites(s).reduce((sum, l) => sum + l.delivered, 0) -
          s.woodSpent -
          (s.yardDryAt ? 1 : 0)) *
          AMOUNT_SCALE ||
    s.world.resources.RES_METAL !==
      s.initialIron -
        (s.town.spent.RES_METAL ?? 0) * AMOUNT_SCALE +
        (s.town.received.RES_METAL ?? 0) * AMOUNT_SCALE -
        (contracted && s.offer
          ? TIMBER_RULES.offers[s.offer].cost * AMOUNT_SCALE
          : 0)
  )
    fail("공동 재고 정산이 일치하지 않습니다.");
  if (!isRecord(s.initialMinerals)) fail("초기 광물 재고가 없습니다.");
  for (const resource of ["RES_COAL", "RES_IRON_ORE", "RES_STONE"] as const) {
    num(s.initialMinerals[resource], 10_000_000_000);
    const received = productionSites(s)
      .filter((l) => productionSiteDefinition(l.siteId).resource === resource)
      .reduce((sum, l) => sum + l.delivered, 0);
    if (
      s.world.resources[resource] !==
      s.initialMinerals[resource] +
        (received +
          (s.town.received[resource] ?? 0) -
          (s.town.spent[resource] ?? 0)) *
          AMOUNT_SCALE
    )
      fail("광물 공동 재고 정산이 일치하지 않습니다.");
  }
  if (!townValid(s)) fail("건설·생산·파견 기록이 올바르지 않습니다.");
  const repairs = ["building-travel", "building"].includes(s.phase);
  if (
    repairs
      ? s.buildingHealth <= 0 ||
        s.buildingHealth >= 100 ||
        s.reservedWood !== 20 ||
        s.workerIds[0] !== s.repairWorkerId
      : s.reservedWood !== 0 || s.repairWorkerId !== null
  )
    fail("보수 명령 정보가 올바르지 않습니다.");
  if (s.world.resources.RES_WOOD < s.reservedWood * AMOUNT_SCALE)
    fail("예약 목재가 부족합니다.");
  if (
    s.settledAt === null
      ? s.mission !== "procurement"
      : s.settledAt > s.elapsed ||
        s.mission === "procurement" ||
        s.stock.cart + s.stock.waiting + s.stock.quarantine !== 0 ||
        s.stock.available + s.stock.used !== 20
  )
    fail("임무 정산이 올바르지 않습니다.");
  if (s.mission !== "village-orders" && s.policy !== null)
    fail("장부 정책 선택이 올바르지 않습니다.");
  if (
    s.processed.length > 1999 ||
    s.processed.some(
      (id) => typeof id !== "string" || !id || id.length > 100,
    ) ||
    new Set(s.processed).size !== s.processed.length ||
    s.history.length < 1 ||
    s.history.length > 2100
  )
    fail();
  let previous = 0;
  for (const [i, h] of s.history.entries()) {
    if (
      !h ||
      h.id !== i ||
      typeof h.text !== "string" ||
      h.text.length > 250 ||
      !Number.isSafeInteger(h.minute) ||
      h.minute < previous ||
      h.minute > s.elapsed
    )
      fail("처리 기록이 올바르지 않습니다.");
    previous = h.minute;
  }
  return s;
}
const merchantGoods = [
  "RES_PLANT",
  "RES_MEAT",
  "RES_FISH",
  "RES_WOOD",
  "RES_METAL",
  "RES_WATER",
  "RES_IRON_ORE",
  "RES_STONE",
  "RES_COAL",
] as const;
const paymentItems = [5, 3, 4, 4, 8, 3, 2, 3, 1] as const;
function merchantStaff(s: TimberState) {
  const post = s.town.facilities.find((f) => f.kind === "trade");
  return post
    ? s.residents.filter(
        (r) =>
          r.workplaceId === "facility:" + post.id &&
          r.health === "healthy" &&
          !r.task,
      ).length
    : 0;
}
export function visitorOffer(s: TimberState, option: "A" | "B") {
  const item = s.merchantItem;
  if (item === undefined) throw Error("방문 상인이 없습니다.");
  const level = s.town.facilities.find((f) => f.kind === "trade")?.level ?? 1;
  const risk = s.riskyMerchants?.includes(item);
  const payment = paymentItems[item]!;
  return {
    goods: merchantGoods[item]!,
    payment: merchantGoods[payment]!,
    paymentIndex: payment,
    cost: (option === "A" ? 4 : 7) - (risk ? 1 : 0),
    quantity:
      (option === "A" ? 8 : 16) +
      (level - 1) * 2 +
      (risk && option === "B" ? 2 : 0),
  };
}
export function advanceTimber(
  input: TimberState,
  minutes: number,
): TimberState {
  let s = parseTimberState(input);
  num(minutes, 1440);
  if (
    s.workerIds.some(
      (id) => s.residents.find((r) => r.id === id)?.health !== "healthy",
    )
  )
    return { ...s, paused: true };
  const target = Math.min(144000000, s.elapsed + minutes);
  let count = 0;
  while (s.elapsed < target) {
    if (++count > 1500) fail("작업 정산 경계가 너무 많습니다.");
    if (s.phase === "waiting-labor") s = startDrying(s);
    if (s.phase === "crew-wait") s = replaceCrew(s);
    const nextTime = Math.min(target, s.due ?? target, s.elapsed + 1),
      elapsed = nextTime - s.elapsed;
    s = {
      ...s,
      elapsed: nextTime,
      world: advancePlayClock(s.world, elapsed),
    };
    if (s.yardDryAt && s.elapsed >= s.yardDryAt) {
      s = note(
        {
          ...s,
          yardDryAt: undefined,
          world: {
            ...s.world,
            resources: {
              ...s.world.resources,
              RES_WOOD: s.world.resources.RES_WOOD + AMOUNT_SCALE,
            },
          },
        },
        "야적장에서 젖었던 목재 1개가 말라 다시 쓸 수 있습니다.",
      );
    }
    if (s.phase === "unloading") {
      const moved = Math.floor(
        (20 * (s.elapsed - (s.startedAt ?? 0))) / TIMBER_RULES.unloadMinutes,
      );
      s = { ...s, stock: { ...s.stock, cart: 20 - moved, waiting: moved } };
    }
    if (
      !s.merchantRepair &&
      s.world.day !== input.world.day &&
      s.world.minute === 0 &&
      s.town.facilities.some(
        (f) =>
          f.kind === "trade" &&
          s.residents.some(
            (r) =>
              r.workplaceId === "facility:" + f.id && r.health === "healthy",
          ),
      )
    ) {
      const roll = Math.random();
      s = {
        ...s,
        merchantItem: roll < 0.5 ? Math.floor(roll * 18) : undefined,
      };
    }
    const repair = s.merchantRepair;
    if (
      repair &&
      s.world.minute >= 540 &&
      s.world.minute < 1080 &&
      merchantStaff(s) > 0
    ) {
      const work = Math.max(0, repair.work - merchantStaff(s));
      if (
        !work &&
        storageRoom(s, merchantGoods[repair.item]!) >= repair.quantity
      )
        s = note(
          {
            ...deposit(s, merchantGoods[repair.item]!, repair.quantity),
            merchantRepair: undefined,
          },
          "교역소 직원이 보완을 마쳐 공동 재고에 입고했습니다.",
        );
      else s = { ...s, merchantRepair: { ...repair, work } };
    }
    s = resumeResidents(s, elapsed);
    if (s.due === s.elapsed) s = completeStep(s);
    const previousEnding = s.campaign?.ending;
    s = updateCampaign(s);
    if (!previousEnding && s.campaign?.ending) break;
  }
  return parseTimberState(s);
}
export function commandTimber(
  input: TimberState,
  command: TimberCommand,
  id: string,
): TimberState {
  const s = parseTimberState(input);
  if (!id || id.length > 100) fail("명령 식별값이 올바르지 않습니다.");
  if (s.processed.includes(id)) return s;
  if (s.processed.length >= 1999 && command.type !== "restart")
    fail("처리 기록이 가득 찼습니다.");
  if (
    (s.campaign?.beat === "opening" || s.campaign?.beat === "departure") &&
    !["campaign", "restart"].includes(command.type)
  ) {
    if (command.type === "pause" && command.paused) return s;
    fail("귀족의 출문을 먼저 확인해 주세요.");
  }
  let n = s;
  switch (command.type) {
    case "campaign":
      n = actCampaign(s, command);
      break;
    case "plan-building":
      n = planBuilding(s, command.kind, {
        position: command.position,
        headingRadians: command.headingRadians,
      });
      break;
    case "facility-staff":
      n = setFacilityStaff(s, command.id, command.count);
      break;
    case "dispatch-food":
      n = dispatchFood(s, command.id, command.food, command.rank);
      break;
    case "upgrade-facility":
      n = upgradeFacility(s, command.id);
      break;
    case "start-research":
      n = startResearch(s, command.tech);
      break;
    case "set-overtime":
      n = setOvertime(s, command.target, command.enabled);
      break;
    case "begin-chapter-two": {
      if (s.campaign) {
        n = actCampaign(s, {
          type: "campaign",
          beat: "patrol",
          action: "next",
        });
        break;
      }
      if (s.chapter) return s;
      const now = (s.world.day - 1) * 1440 + s.world.minute;
      if (
        !SCOUT_SITES.every(
          (site) =>
            now - (s.scoutDepartures?.[site.id] ?? Infinity) >= site.hours * 60,
        )
      )
        fail("정찰 결과를 기다려 주세요.");
      n = note(
        { ...s, chapter: 2 },
        "지도층 생존자가 귀환했습니다. 다섯 마을과의 교류를 회복하세요.",
      );
      break;
    }
    case "scout-sites": {
      const departures = { ...s.scoutDepartures };
      const now = (s.world.day - 1) * 1440 + s.world.minute;
      for (const id of command.ids) {
        const site = SCOUT_SITES.find((q) => q.id === id);
        if (!site) fail("알 수 없는 정찰 거점");
        const start = departures[id];
        if (command.recall) {
          if (start !== undefined && now - start < site.hours * 60)
            delete departures[id];
        } else if (start === undefined) departures[id] = now;
      }
      n = {
        ...s,
        scoutDepartures: departures,
        ...(s.campaign
          ? {
              campaign: {
                ...s.campaign,
                patrolOrder: [
                  ...new Set([
                    ...s.campaign.patrolOrder,
                    ...Object.keys(departures),
                  ]),
                ],
              },
            }
          : {}),
        paused: command.recall ? s.paused : false,
      };
      break;
    }
    case "cold-weather":
      if (s.campaign?.beat === "winter" && !command.cold)
        fail("보름 혹한이 아직 끝나지 않았습니다.");
      if (typeof command.cold !== "boolean") fail();
      n = { ...s, town: { ...s.town, cold: command.cold } };
      if (
        s.town.cold &&
        !command.cold &&
        !warehouseDoor(s) &&
        !s.yardDryAt &&
        s.world.resources.RES_WOOD >= (s.reservedWood + 1) * AMOUNT_SCALE
      ) {
        n = note(
          {
            ...n,
            yardDryAt: s.elapsed + 60,
            world: {
              ...s.world,
              resources: {
                ...s.world.resources,
                RES_WOOD: s.world.resources.RES_WOOD - AMOUNT_SCALE,
              },
            },
          },
          "눈이 녹아 야적장 목재 1개가 젖었습니다. 한 시간 동안 말립니다.",
        );
      }
      break;
    case "restart":
      return { ...createTimberState(), processed: [id] };
    case "queue-work": {
      if (
        typeof command.workId !== "string" ||
        !command.workId ||
        command.workId.length > 100 ||
        !point(command.position)
      )
        fail("다음 업무 지시가 올바르지 않습니다.");
      const candidates = s.residents
        .filter((r) => !r.nextWork && r.health === "healthy")
        .map((r) => ({ ...r, position: movePosition(s, r.id) }));
      const chosen = nearestRepairResident(
        candidates,
        command.position,
        villageObstacles(s),
      );
      if (!chosen) fail("다음 업무를 예약할 주민이 없습니다.");
      n = {
        ...s,
        residents: s.residents.map((r) =>
          r.id === chosen
            ? {
                ...r,
                nextWork: {
                  id: command.workId,
                  position: { ...command.position },
                },
              }
            : r,
        ),
      };
      if (s.phase === "returning" && s.workerIds.includes(chosen)) {
        n = {
          ...n,
          residents: n.residents.map((r) =>
            r.id === chosen ? { ...r, position: movePosition(s, r.id) } : r,
          ),
        };
        n = schedule(n, "returning", s.workerIds);
      }
      break;
    }
    case "set-restaurant-workers":
      num(
        command.count,
        restaurants(s)[0]
          ? facilityStaffLimit(
              restaurants(s)[0] ?? { kind: "restaurant", level: 1 },
            )
          : 2,
      );
      if (!s.restaurantBuilt) fail("식당을 먼저 건설해 주세요.");
      n = staffRestaurant({ ...s, restaurantWorkerTarget: command.count });
      break;
    case "set-ration-policy":
      if (!["needs", "cap"].includes(command.policy))
        fail("배급 정책이 올바르지 않습니다.");
      n = note(
        { ...s, rationPolicy: command.policy },
        "배급 정책 변경. 오늘 이미 받은 배급량은 유지합니다.",
      );
      break;
    case "set-logging-workers": {
      num(command.count, LOGGING_RULES.maxWorkers);
      const site = loggingSite(s, command.siteId ?? "west");
      if (!site.built) fail("작업장을 먼저 건설해 주세요.");
      n = staffLogging(
        setLoggingSite(s, { ...site, target: command.count }),
        eligible,
      );
      break;
    }
    case "build-home": {
      const pose: HomePlacement = {
        position: command.position,
        headingRadians: command.headingRadians,
      };
      const issue = homePlacementIssue(s, pose);
      if (issue) fail(issue);
      const ids: string[] = [];
      const slots = homeWorkSlots(s, pose);
      let available = s;
      for (let i = 0; i < slots.length; i++) {
        const id = eligible(available, homeEntrance(pose), 1)[0];
        if (!id) break;
        ids.push(id);
        available = {
          ...available,
          residents: available.residents.map((r) =>
            r.id === id ? { ...r, task: "home-construction" } : r,
          ),
        };
      }
      if (!ids[0]) fail("건설할 유휴 주민이 없습니다.");
      n = note(
        {
          ...s,
          paused: false,
          woodSpent: s.woodSpent + 20,
          world: {
            ...s.world,
            resources: {
              ...s.world.resources,
              RES_WOOD: s.world.resources.RES_WOOD - 20 * AMOUNT_SCALE,
            },
          },
          residents: available.residents.map((r) =>
            ids.includes(r.id)
              ? {
                  ...r,
                  insideHome: false,
                  nextWork: null,
                  diningSeat: null,
                  eatingUntil: null,
                  request: null,
                }
              : r,
          ),
          construction: {
            kind: "home",
            position: { ...pose.position },
            headingRadians: pose.headingRadians,
            workerId: ids[0],
            crew: createHomeCrew(ids, slots),
            startedAt: null,
            finishAt: null,
          },
        },
        "온돌 둥지 배치 확정. 목재20을 확보하고 가까운 유휴 주민이 자재를 운반합니다.",
      );
      break;
    }
    case "build-logging":
    case "build-storage":
    case "build-restaurant": {
      const kind =
        command.type === "build-logging"
          ? "logging"
          : command.type === "build-storage"
            ? "storage"
            : "restaurant";
      const site = loggingSite(s, command.siteId ?? "west");
      const siteRules = loggingSiteRules(site.siteId);
      if (
        (kind === "logging" && site.built) ||
        (kind === "storage" && site.storageBuilt)
      )
        fail("이미 건설한 시설입니다.");
      if (
        kind === "logging" &&
        productionSiteDefinition(site.siteId).kind === "forest" &&
        !sawmillHasForest(siteRules.workshop)
      )
        fail("제재소는 숲 가까이에 지어야 합니다.");
      if (s.construction)
        fail("현재 공사를 마친 뒤 다음 공사를 지시해 주세요.");
      if (kind === "restaurant" && s.restaurantBuilt)
        fail("식당이 이미 있습니다.");
      const position =
        kind === "restaurant"
          ? TIMBER_RULES.restaurant
          : kind === "logging"
            ? siteRules.workshop
            : siteRules.storage;
      if (
        s.world.resources.RES_WOOD - s.reservedWood * AMOUNT_SCALE <
        VILLAGE_RULES.constructionWood * AMOUNT_SCALE
      )
        fail("공동 목재20이 필요합니다.");
      const workerId = eligible(s, constructionSite(kind, position), 1)[0];
      if (!workerId) fail("건설할 유휴 주민이 없습니다.");
      n = note(
        {
          ...s,
          woodSpent: s.woodSpent + 20,
          world: {
            ...s.world,
            resources: {
              ...s.world.resources,
              RES_WOOD: s.world.resources.RES_WOOD - 20 * AMOUNT_SCALE,
            },
          },
          construction: {
            ...(kind === "logging" || kind === "storage"
              ? { siteId: site.siteId }
              : {}),
            kind,
            position: { ...position },
            workerId,
            startedAt: null,
            finishAt: null,
          },
          residents: s.residents.map((r) =>
            r.id === workerId
              ? {
                  ...r,
                  nextWork: {
                    id: `${kind}-construction`,
                    position: constructionSite(kind, position),
                  },
                  insideHome: false,
                }
              : r,
          ),
          paused: false,
        },
        kind === "restaurant"
          ? "공동 식당 건설 명령."
          : kind === "logging"
            ? `${productionSiteDefinition(site.siteId).name} 지정 부지에 작업장 건설 명령.`
            : `${productionSiteDefinition(site.siteId).name} 근처에 저장소 건설 명령.`,
      );
      break;
    }
    case "story-event":
      if (s.campaign) fail("본편 사건은 캠페인에서 진행합니다.");
      n = recordResearchStory(s, command.event);
      break;
    case "electrical-work":
      n = setElectricalWork(s, command.id, command.enabled);
      break;
    case "mechanize":
    case "citizen-event": {
      if (
        command.type === "citizen-event" &&
        command.event.type === "mechanize"
      )
        throw Error("메카 제작 명령으로 연구·노선을 확인해야 합니다.");
      const world =
        command.type === "mechanize"
          ? mechanizeCitizen(s, command.source)
          : applyCitizenEvent(s.world, command.event);
      n = {
        ...s,
        world,
        residents: world.citizens.map((c, i) => {
          const existing = s.residents.find((r) => r.id === c.id);
          return existing
            ? {
                ...existing,
                health: c.alive ? (c.health ?? "healthy") : "dead",
                ...(!c.alive || (c.health ?? "healthy") !== "healthy"
                  ? {
                      task: null,
                      nextWork: null,
                      eatingUntil: null,
                      diningSeat: null,
                      routine: "idle" as const,
                    }
                  : {}),
              }
            : createVillageResident(c, i, world.day);
        }),
      };
      n = {
        ...n,
        residents: assignHomes(
          n.residents,
          n.world.citizens,
          habitableHomes(n.homes, n.buildingHealth),
        ),
      };
      n = staffLogging(staffRestaurant(replaceCrew(n)), eligible);
      if (
        n.construction &&
        !n.construction.crew &&
        n.residents.find((r) => r.id === n.construction?.workerId)?.health !==
          "healthy"
      ) {
        n = {
          ...n,
          construction: {
            ...n.construction,
            startedAt: null,
            finishAt: null,
          },
        };
        const replacement = eligible(
          n,
          constructionSite(
            n.construction?.kind ?? "restaurant",
            n.construction?.position ?? TIMBER_RULES.restaurant,
          ),
          1,
        )[0];
        if (replacement)
          n = {
            ...n,
            construction: {
              ...(n.construction?.siteId
                ? { siteId: n.construction.siteId }
                : {}),
              kind: n.construction?.kind ?? "restaurant",
              position: n.construction?.position ?? {
                ...TIMBER_RULES.restaurant,
              },
              workerId: replacement,
              startedAt: null,
              finishAt: null,
            },
            residents: n.residents.map((r) =>
              r.id === replacement
                ? {
                    ...r,
                    nextWork: {
                      id: `${n.construction?.kind ?? "restaurant"}-construction`,
                      position: constructionSite(
                        n.construction?.kind ?? "restaurant",
                        n.construction?.position ?? TIMBER_RULES.restaurant,
                      ),
                    },
                  }
                : r,
            ),
          };
      }
      break;
    }
    case "choose":
      if (s.phase !== "select" || !["A", "B"].includes(command.offer)) fail();
      n = { ...s, offer: command.offer };
      break;
    case "contract": {
      if (s.phase !== "select" || !s.offer)
        fail("공급 제안을 먼저 선택하세요.");
      const offer = TIMBER_RULES.offers[s.offer];
      if (s.world.resources.RES_METAL < offer.cost * AMOUNT_SCALE)
        fail("공동 철재가 부족합니다.");
      const ids = eligible(s, front(s, TIMBER_RULES.cartStart), 1);
      if (!ids.length) fail("운송을 맡을 도달 가능한 유휴 주민이 없습니다.");
      n = note(
        schedule(
          {
            ...s,
            contractId: id,
            transportWorkerId: ids[0] ?? null,
            stock: { ...s.stock, cart: 20 },
            world: {
              ...s.world,
              resources: {
                ...s.world.resources,
                RES_METAL:
                  s.world.resources.RES_METAL - offer.cost * AMOUNT_SCALE,
              },
            },
            paused: false,
          },
          "approaching",
          ids,
        ),
        "계약 확정. 공동 철재 정산, 유휴 주민 자동 배정. 수레를 받으러 갑니다.",
      );
      break;
    }
    case "use": {
      if (s.phase !== "ready" || s.settledAt === null)
        fail("조달 작업이 끝난 뒤 보수할 수 있습니다.");
      if (s.buildingHealth === 100) fail("정상 건물은 보수하지 않습니다.");
      if (s.buildingHealth === 0) fail("파괴된 건물은 재건이 필요합니다.");
      if (s.world.resources.RES_WOOD < 20 * AMOUNT_SCALE)
        fail("공동 목재20이 필요합니다.");
      const ids = eligible(s, TIMBER_RULES.repairSite, 1);
      if (!ids.length) fail("도달 가능한 유휴 주민이 없습니다.");
      n = note(
        schedule(
          {
            ...s,
            repairWorkerId: ids[0] ?? null,
            reservedWood: 20,
            paused: false,
          },
          "building-travel",
          ids,
        ),
        "직접 보수 명령. 가까운 유휴 주민과 공동 목재20을 예약했습니다.",
      );
      break;
    }
    case "building-damage":
      if (!["attack", "fire"].includes(command.cause))
        fail("손상 원인이 올바르지 않습니다.");
      num(command.amount, 100);
      n = note(
        {
          ...s,
          buildingHealth: Math.max(0, s.buildingHealth - command.amount),
        },
        `건물 ${command.cause === "fire" ? "화재" : "공격"} 피해. 보수는 직접 명령해야 합니다.`,
      );
      if (n.buildingHealth === 0)
        n = {
          ...n,
          residents: assignHomes(
            n.residents,
            n.world.citizens,
            habitableHomes(n.homes, n.buildingHealth),
          ),
        };
      if (
        n.buildingHealth === 0 &&
        ["building-travel", "building"].includes(n.phase)
      )
        n = stop({ ...n, reservedWood: 0, repairWorkerId: null }, "ready");
      break;
    case "visit-decision": {
      if (
        command.item !== s.merchantItem ||
        command.day !== s.world.day ||
        s.merchantItem === undefined ||
        !["A", "B", "decline"].includes(command.option)
      )
        fail("방문 제안이 바뀌었습니다.");
      if (command.option === "decline") {
        n = { ...s, merchantItem: undefined };
        break;
      }
      if (!merchantStaff(s) || s.merchantRepair)
        fail("교역소에 거래를 맡을 직원이 필요합니다.");
      const offer = visitorOffer(s, command.option);
      if (storageRoom(s, offer.goods) < offer.quantity)
        fail("저장 공간이 부족합니다.");
      const paid = payTown(s, { [offer.payment]: offer.cost });
      const bad = Math.random() < 0.3 ? 2 : 0;
      n = note(
        {
          ...deposit(paid, offer.goods, offer.quantity - bad),
          merchantItem: undefined,
          riskyMerchants: bad
            ? [...new Set([...(s.riskyMerchants ?? []), command.item])]
            : (s.riskyMerchants ?? []),
          merchantRepair: bad
            ? { item: command.item, quantity: bad, work: 20 }
            : undefined,
        },
        bad
          ? "검수 결과 2개 규격 미달 · 교역소 직원 보완 대기"
          : "검수 완료 · 전량 공동 입고",
      );
      break;
    }
    case "gate-decision": {
      const scout = (s.scoutVisitors ?? 0) > 0;
      if (
        (!scout && s.mission !== "register-policy") ||
        typeof command.accept !== "boolean"
      )
        fail();
      const visit = "gate-" + s.processed.length;
      if (command.accept) {
        n = commandTimber(
          s,
          {
            type: "citizen-event",
            event: {
              type: "arrival",
              id: visit,
              groups: [
                { species: "R02", count: 2 },
                { species: "R03", count: 1 },
              ],
            },
          },
          visit + "-arrive",
        );
        n = commandTimber(
          n,
          {
            type: "citizen-event",
            event: {
              type: "illness",
              id: visit + "-sick",
              citizenIds: ["arrival:" + visit + ":R02:0"],
              severity: "minor",
            },
          },
          visit + "-care",
        );
      } else {
        n = {
          ...s,
          world: {
            ...s.world,
            pessimism: Math.min(100, s.world.pessimism + 1),
          },
        };
      }
      n = note(
        {
          ...n,
          scoutVisitors: scout ? (s.scoutVisitors ?? 1) - 1 : s.scoutVisitors,
          mission: scout ? s.mission : "village-orders",
        },
        command.accept
          ? "달이: 주민 3명이 합류했습니다. 한 명은 치료가 필요합니다."
          : "문이 닫혔습니다. 배식을 기다리던 주민들이 말없이 길을 비켜 주었습니다.",
      );
      break;
    }
    case "set-policy":
      if (
        s.mission !== "register-policy" ||
        !["relief", "registry"].includes(command.policy)
      )
        fail();
      n = note(
        { ...s, policy: command.policy, mission: "village-orders" },
        "P01 장부 정책 선택을 기록했습니다.",
      );
      break;
    case "pause":
      if (typeof command.paused !== "boolean") fail();
      n = { ...s, paused: command.paused, remainder: 0 };
      break;
    case "speed":
      if (![1, 3].includes(command.speed)) fail();
      n = { ...s, speed: command.speed };
      break;
    case "next":
      if (s.due === null) fail("진행 중인 업무가 없습니다.");
      n = advanceTimber(s, s.due - s.elapsed);
      break;
    case "advance":
      n = advanceTimber(s, command.minutes);
      break;
    default:
      fail("지원하지 않는 명령입니다.");
  }
  if (command.type === "mechanize")
    n = reconcilePatients(reconcileTownHealth(n));
  if (command.type === "citizen-event")
    n = reconcilePatients(
      reconcileTownHealth(n),
      command.event.type === "illness" ? command.event.severity : undefined,
      command.event.type === "illness" &&
        !s.world.citizenEvents?.includes(command.event.id)
        ? command.event.citizenIds
        : [],
    );
  return parseTimberState(
    updateCampaign({ ...n, processed: [...n.processed, id] }),
  );
}
export function tickTimber(input: TimberState, elapsedMs: number): TimberState {
  const s = parseTimberState(input);
  num(elapsedMs, Number.MAX_SAFE_INTEGER);
  if (s.paused) return s;
  const numerator = Math.min(1000, elapsedMs) * s.speed + s.remainder;
  return {
    ...advanceTimber(s, Math.floor(numerator / 1000)),
    remainder: numerator % 1000,
  };
}
export interface TimberSave {
  readonly format: "dynosty-timber";
  readonly saveVersion: 1;
  readonly state: TimberState;
}
export function parseTimberSave(v: unknown): TimberSave {
  if (!isRecord(v) || v.format !== "dynosty-timber" || v.saveVersion !== 1)
    fail("지원하지 않는 저장 형식입니다.");
  return {
    format: "dynosty-timber",
    saveVersion: 1,
    state: parseTimberState(v.state),
  };
}
export function createTimberSave(state: TimberState): TimberSave {
  return parseTimberSave({ format: "dynosty-timber", saveVersion: 1, state });
}
export function timberCartPosition(s: TimberState): GroundPoint {
  if (s.phase === "relief" || s.phase === "crew-wait")
    return s.suspended?.cart ?? fail("교대 수레 위치가 없습니다.");
  if (s.phase === "select" || s.phase === "approaching")
    return { ...TIMBER_RULES.cartStart };
  const drop = dropPoint(s);
  if (s.phase !== "transport") return drop;
  const t = Math.min(
    1,
    Math.max(
      0,
      (s.elapsed - (s.startedAt ?? 0)) /
        TIMBER_RULES.offers[s.offer ?? "A"].travel,
    ),
  );
  return {
    x: TIMBER_RULES.cartStart.x + (drop.x - TIMBER_RULES.cartStart.x) * t,
    z: TIMBER_RULES.cartStart.z + (drop.z - TIMBER_RULES.cartStart.z) * t,
  };
}
function movePosition(s: TimberState, id: string): GroundPoint {
  const resident = s.residents.find((r) => r.id === id);
  if (!resident) return { x: 0, z: 0 };
  if (s.phase === "transport" && id === s.transportWorkerId)
    return front(s, timberCartPosition(s));
  if (
    !s.workerIds.includes(id) ||
    ![
      "relief",
      "approaching",
      "releasing",
      "returning",
      "drying-travel",
      "building-travel",
    ].includes(s.phase)
  )
    return resident.position;
  const goal = destination(s, id),
    path = residentPath(resident.position, goal, villageObstacles(s));
  let remaining = (s.elapsed - (s.startedAt ?? 0)) * TIMBER_RULES.walkSpeed,
    previous = resident.position;
  for (const p of path) {
    const length = Math.hypot(p.x - previous.x, p.z - previous.z);
    if (remaining < length)
      return {
        x: previous.x + ((p.x - previous.x) * remaining) / length,
        z: previous.z + ((p.z - previous.z) * remaining) / length,
      };
    remaining -= length;
    previous = p;
  }
  return goal;
}
export function residentIndoors(s: TimberState, r: VillageResident): boolean {
  if (r.health === "dead") return false;
  if (r.insideHome || r.routine === "eating" || atHospital(s, r)) return true;
  if (r.routine !== "working" || r.task !== null) return false;
  const goal =
    r.workplaceId === "restaurant"
      ? employeePosition(s, r.id)
      : r.workplaceId?.startsWith("facility:")
        ? facilityDoor(
            s.town.facilities.find(
              (f) => `facility:${f.id}` === r.workplaceId,
            ) ?? fail(),
          )
        : r.workplaceId?.startsWith("logging")
          ? loggingWorkplace(s, r.id)
          : null;
  return (
    goal !== null &&
    Math.hypot(r.position.x - goal.x, r.position.z - goal.z) < 0.01
  );
}
export function timberScene(s: TimberState): SceneSnapshot {
  return {
    schemaVersion: 1,
    entities: [
      ...s.homes.map((h) => ({
        id: h.id,
        kind: "building" as const,
        level: h.level ?? 1,
        position: { ...h.position, y: 0 },
        headingRadians: h.headingRadians ?? Math.PI,
        visible: true,
        highlighted: false,
        lit:
          (s.world.minute >= 18 * 60 || s.world.minute < 6 * 60) &&
          s.residents.some(
            (r) => r.homeId === h.id && r.insideHome && r.health !== "dead",
          ),
      })),
      ...s.residents.map((r) => ({
        id: r.id,
        kind: "resident" as const,
        species: s.world.citizens.find((c) => c.id === r.id)?.species ?? "R02",
        position: { ...movePosition(s, r.id), y: 0 },
        headingRadians:
          s.phase === "transport" && r.id === s.transportWorkerId
            ? Math.PI / 2
            : Math.PI,
        visible: r.health !== "dead" && !residentIndoors(s, r),
        indoors: residentIndoors(s, r) && r.health !== "dead",
        needsHelp: r.request !== null && r.request !== "waiting-seat",
        motion:
          productionSites(s).some(
            (l) =>
              l.haul?.workerId === r.id &&
              !["park", "unload", "park-home"].includes(l.haul.phase),
          ) ||
          (s.workerIds.includes(r.id) &&
            [
              "relief",
              "approaching",
              "transport",
              "releasing",
              "returning",
              "drying-travel",
              "building-travel",
            ].includes(s.phase)) ||
          ["home", "warmth", "restaurant", "next-work", "to-work"].includes(
            r.routine,
          )
            ? ("walking" as const)
            : ("idle" as const),
      })),
    ],
  };
}
