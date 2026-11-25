import {
  BOKHOL_FORESTS,
  BOKHOL_MAP,
  BOKHOL_MINERALS,
  BOKHOL_PRODUCTION_SITES,
  constructionPlot,
  type ProductionSiteId,
  productionSiteDefinition,
  reservedVillageLand,
  sawmillHasForest,
} from "./bokhol.js";
import {
  actCampaign,
  CAPITAL_MINUTES,
  type Campaign,
  type CampaignCommand,
  campaignOf,
  campaignValid,
  minutesUntilCoup,
  newCampaign,
  policyWait,
  updateCampaign,
} from "./campaign.js";
import {
  createDevelopment,
  isMechanical,
  nextVillageSeed,
  RESEARCH_CATALOG,
  residentShiftOpen,
  setElectricalWork,
  setOvertime,
  startResearch,
  upgradeCost,
  upgradeFacility,
} from "./development.js";
import {
  advanceHomeConstruction,
  createHomeCrew,
  type HomeBuilder,
} from "./home-construction.js";
import {
  clearBuildingFootprint,
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
import { findById, indexById } from "./lookup.js";
import {
  advanceMutants,
  containMutant,
  mutantStructure,
  mutantWound,
  repairMutantDamage,
  usableHomes,
} from "./mutants.js";
import {
  AMOUNT_SCALE,
  advancePlayClock,
  applyCitizenEvent,
  type Citizen,
  type CitizenEvent,
  type CitizenEventRecording,
  createPlayState,
  FOOD_IDS,
  type FoodId,
  GAME_RULES,
  incidentChance,
  isDifficulty,
  type PlayState,
  parsePlayState,
} from "./play.js";
import { requireValue } from "./require-value.js";
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
import {
  encounterReady,
  SCOUT_CREW,
  SCOUT_FINDS,
  SCOUT_SITES,
  type ScoutFind,
  scoutFinding,
  scoutRun,
  scoutTripMinutes,
} from "./scout-sites.js";
import { storageCapacity, warehouseDoor } from "./storage.js";
import {
  createResearchStory,
  mechanizeCitizen,
  recordResearchStory,
  type StoryEvent,
} from "./story-research.js";
import {
  advanceTown,
  BUILDING_RULES,
  type BuildingKind,
  createTown,
  demolishBuilding,
  deposit,
  directStaff,
  dispatchFood,
  type Facility,
  facilityDoor,
  facilityResource,
  facilityStaffLimit,
  mineralWorksites,
  orderResting,
  originalBuildingCost,
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
  nextDwellingId,
  type RationPolicy,
  rationLimit,
  speciesRule,
  VILLAGE_RULES,
  type VillageHome,
} from "./village-services.js";

export const TIMBER_RULES = {
  version: 19,
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
  repairSite: { x: 0, z: -4.2 },
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
  readonly bulletins?: readonly {
    key: string;
    title: string;
    detail: string;
    kind: "loss" | "decree" | "scout";
  }[];
  readonly sighting?: { species: string; source: "gate" | "scout" };
  readonly mutants?: readonly { id: string; due: number }[];
  readonly mutantDamage?: Readonly<Record<string, number>>;
  readonly heating?: number;
  readonly bokhol?: TimberState;
  readonly firedHeat?: number;
  readonly warmerHomes?: readonly string[];
  readonly raid?: {
    minute: number;
    picture: number;
    dead: number;
    injured: number;
  };
  readonly rebuilding?: boolean;
  readonly openingFight?: boolean;
  readonly rationReactionDay?: number;
  readonly decree?: { title: string; reaction: string; serial: number };
  readonly version: 19;
  readonly childLabor?: boolean;
  readonly removedLandmarks?: readonly string[];
  readonly town: TownState;
  readonly world: PlayState;
  readonly initialWood: number;
  readonly initialIron: number;
  readonly chapter?: 2 | 3 | 4 | 5;
  readonly campaign?: Campaign;
  readonly scoutClues?: readonly ScoutFind["kind"][];
  readonly scoutFinds?: Record<string, ScoutFind>;
  readonly scoutDepartures?: Record<string, number>;
  readonly scoutTripDurations?: Record<string, number>;
  readonly yardFoodSince?: Partial<Record<FoodId, number>> | undefined;
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
  readonly firstRationSet?: boolean;
  /** Set on saves from before the guided first mission that already ran. */
  readonly firstMissionDone?: boolean;
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
  | { type: "direct-staff"; resident: string; destination: string | null }
  | { type: "facility-staff"; id: string; count: number }
  | { type: "dispatch-food"; id: string; food: FoodId; rank?: 1 | 2 | 3 }
  | { type: "begin-chapter-two" }
  | { type: "scout-sites"; ids: string[]; recall?: boolean; explore?: boolean }
  | { type: "read-bulletin"; key: string }
  | { type: "scout-choice"; site: string; take: boolean }
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
  | { type: "set-heating"; level: number }
  | { type: "contain-mutant"; resident: string }
  | { type: "repair-mutant"; building: string }
  | { type: "dismiss-sighting" }
  | { type: "dismiss-raid" }
  | { type: "set-gate"; count: number }
  | { type: "demolish-building"; id: string }
  | { type: "set-guards"; count: 0 | 4 | 8 | 16 }
  | { type: "enact-child-labor" }
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
for (let radius = 1; homeSlots.length < 1000; radius++) {
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
export const DEPARTURE_SURVIVING_HOME_COUNT = 2;

export function createVillageGame(
  beforeDeparture = false,
  afterFire = false,
): TimberState {
  const initial = createPlayState();
  const world = {
    ...initial,
    citizens: initial.citizens.map((c, i) =>
      i % 4 === 3 ? { ...c, age: "child" as const } : c,
    ),
  };
  const resources = { ...world.resources };
  for (const id of Object.keys(resources) as (keyof typeof resources)[])
    resources[id] =
      (id === "RES_WATER"
        ? beforeDeparture
          ? 200
          : 20
        : beforeDeparture
          ? 10000
          : 1000) * AMOUNT_SCALE;
  const citizens = beforeDeparture
    ? [
        ...world.citizens,
        ...Array.from({ length: 540 }, (_, i) => ({
          ...requireValue(
            world.citizens[i % world.citizens.length],
            "복홀 주민 원형",
          ),
          id: `departing-${i}`,
        })),
      ]
    : world.citizens;
  const village = createTimberState({
    ...world,
    citizens,
    resources,
    ...(afterFire && {
      pessimism: 30,
      buildings: initialHomes()
        .slice(0, DEPARTURE_SURVIVING_HOME_COUNT)
        .map((home) => ({
          id: home.id,
          type: "ondol-nest" as const,
          position: { ...home.position, y: 0 },
          headingRadians: Math.PI,
        })),
    }),
    minute: 9 * 60,
  });
  return {
    ...village,
    paused: beforeDeparture || afterFire,
    restaurantBuilt: beforeDeparture,
    rebuilding: afterFire,
    campaign: newCampaign(beforeDeparture ? "opening" : "patrol"),
    residents: village.residents.map((r) => ({
      ...r,
      hunger: Math.floor(r.hunger / 2),
    })),
  };
}
export function createCapital(s: TimberState): TimberState {
  const seed = createVillageGame();
  const { lastPolicyAt: _lastPolicyAt, ...history } = campaignOf(s);
  const citizens = Array.from({ length: 1000 }, (_, i) => ({
    ...requireValue(
      seed.world.citizens[i % seed.world.citizens.length],
      "도성 주민 원형",
    ),
    id: `capital-${i + 1}`,
  }));
  const buildings = Array.from({ length: 100 }, (_, i) => ({
    id: i === 0 ? "example-building-1" : `dwelling-${i + 1}`,
    type: "ondol-nest" as const,
    headingRadians: Math.PI,
    position: {
      x: ((i % 10) - 4.5) * 16,
      y: 0,
      z: (Math.floor(i / 10) - 4.5) * 16,
    },
  }));
  // Keep the palace quarter and gate clear. Displaced homes line the outer street.
  let outerStreetX = -72;
  for (const home of buildings) {
    if (reservedVillageLand(home.position, false)) {
      home.position = { x: outerStreetX, y: 0, z: -88 };
      outerStreetX += 16;
    }
  }
  let city = createTimberState({
    ...seed.world,
    resources: { ...seed.world.resources, RES_WATER: 1000 * AMOUNT_SCALE },
    citizens,
    buildings,
  });
  const kinds: Facility["kind"][] = [
    "restaurant",
    "hospital",
    "workshop",
    "storage",
    "trade",
    "scout",
    "farm",
    "ranch",
    "restaurant",
    "hospital",
    "restaurant",
    "restaurant",
  ];
  function capitalWorkPlot(i: number) {
    const p = { x: ((i % 6) - 3) * 16, z: i < 6 ? -16 : 16 };
    return reservedVillageLand(p, false) ? { ...p, z: 2 * p.z } : p;
  }
  const facilities = kinds.map(
    (kind, i): Facility => ({
      id: `build-${i + 1}`,
      kind,
      position: capitalWorkPlot(i),
      headingRadians: 0,
      level: 1,
      sourceId: null,
      target: BUILDING_RULES[kind].staff,
      progress: 0,
      yieldRemainder: 0,
      buffer: 0,
      delivered: 0,
      haul: null,
    }),
  );
  const hospital = requireValue(
    facilities.find((f) => f.kind === "hospital"),
    "병원",
  );
  city = payTown(city, upgradeCost(hospital));
  hospital.level = 2;
  const completed = ["TECH_SEED", "TECH_TRAIL", "UPGRADE_HOSPITAL_2"];
  for (const f of facilities)
    city = payTown(city, originalBuildingCost(f.kind));
  for (const tech of completed)
    city = payTown(
      city,
      requireValue(
        RESEARCH_CATALOG.find((r) => r.id === tech),
        "연구 항목",
      ).cost,
    );
  const posts = facilities.flatMap((facility, index) =>
    Array.from({ length: facility.target }, () => ({
      workplaceId: index === 0 ? "restaurant" : "facility:" + facility.id,
      position: facilityDoor(facility),
    })),
  );
  city = {
    ...city,
    paused: false,
    chapter: 3,
    elapsed: s.elapsed,
    rebuilding: true,
    restaurantBuilt: true,
    restaurantWorkerTarget: 2,
    rationPolicy: "cap",
    bokhol: s,
    processed: s.processed,
    campaign: {
      ...history,
      beat: "capital",
      since: s.elapsed,
      capitalDue: s.elapsed + CAPITAL_MINUTES,
      petitionDay: 0,
    },
    town: {
      ...city.town,
      facilities,
      nextId: facilities.length + 1,
      development: { ...city.town.development, completed },
    },
    residents: city.residents.map((r, i) => ({
      ...r,
      position: r.home ?? r.position,
      insideHome: !!r.home && !posts[i],
      ...posts[i],
    })),
  };
  return city;
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
    version: 19,
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
export function note(s: TimberState, text: string): TimberState {
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

export const villageObstacles = (s: TimberState): GroundObstacle[] => [
  ...townObstacles(s),
  ...(s.construction?.kind === "home" ? [homeObstacle(s.construction)] : []),
];
const restaurants = (s: TimberState) =>
  s.town.facilities.filter((f) => f.kind === "restaurant");
const diningCapacity = (level: number) => [10, 20, 40][level - 1] ?? 10;
function employeeRestaurant(s: TimberState, id: string) {
  const workplace = findById(s.residents, id)?.workplaceId;
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
      s.mutantDamage?.[employeeRestaurant(s, r.id)?.id ?? ""] !== 100 &&
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
  const c = findById(s.world.citizens, r.id) ?? fail("주민 등록이 없습니다.");
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
// Values every resident reads from the same minute's state; computed once per minute.
function routineShared(s: TimberState) {
  const staff = new Map<
    string | undefined,
    ReturnType<typeof restaurantStaff>
  >();
  return {
    obstacles: villageObstacles(s),
    staff(facilityId: string | undefined) {
      let value = staff.get(facilityId);
      if (!value) {
        value = restaurantStaff(s, facilityId);
        staff.set(facilityId, value);
      }
      return value;
    },
  };
}
function routinePlaces(
  s: TimberState,
  id: string,
  seats = diningSeats(s),
  shared = routineShared(s),
) {
  const index = indexById(s.residents, id);
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
  const homeId = s.residents[index]?.homeId;
  const h = homeId == null ? undefined : findById(s.homes, homeId);
  const staff = shared.staff(diningPlace?.id);
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
          : s.residents[index]?.workplaceId === "gate"
            ? {
                x: ((index % 4) - 1.5) * 1.5,
                z: 20 + Math.floor((index % 16) / 4),
              }
            : undefined,
    rationAvailable:
      (s.residents[index]?.rationDay === s.world.day
        ? (s.residents[index]?.rationUsed ?? 0)
        : 0) <
      rationLimit(s.world.citizens[index]?.species ?? "R02", s.rationPolicy),
    minute: s.world.minute,
    workOpen: residentShiftOpen(s, id),
    obstacles: shared.obstacles,
  };
}
function resumeResidents(input: TimberState, minutes: number): TimberState {
  const s = staffTown(staffLogging(staffRestaurant(input), eligible));
  const resources = { ...s.world.resources };
  const seats = diningSeats(s);
  const shared = routineShared(s);
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
    if (r.task?.startsWith("scout:")) {
      const site = SCOUT_SITES.find((q) => r.task === "scout:" + q.id);
      const trip = site && scoutRun(s, site);
      if (trip && (s.world.day - 1) * 1440 + s.world.minute < trip.due)
        return current;
      return { ...current, task: null };
    }
    if (r.task === "patrol-recovery") return current;
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
        ...routinePlaces(s, r.id, seats, shared),
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
                id: nextDwellingId(next.homes),
                timberCost:
                  next.construction?.crew?.reduce(
                    (sum, w) => sum + w.amount,
                    0,
                  ) ?? VILLAGE_RULES.constructionWood,
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
            usableHomes(next, homes),
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
  const children = new Set(
    s.world.citizens.filter((c) => c.age === "child").map((c) => c.id),
  );
  const found: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = nearestRepairResident(
      s.residents.map((r) => ({
        ...r,
        task:
          (!s.childLabor && children.has(r.id)) ||
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
  const children = new Set(
    s.childLabor
      ? []
      : s.world.citizens.filter((c) => c.age === "child").map((c) => c.id),
  );
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
          children.has(r.id) ||
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
        warehouseDoor(s)
          ? "수레를 인계받아 저장소로 운반합니다."
          : "수레를 인계받아 야적장으로 운반합니다.",
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
    Array.isArray(value.mineralSites) &&
    value.mineralSites.length === 6 &&
    value.mineralSites.every(
      (site, i) => isRecord(site) && site.siteId === BOKHOL_MINERALS[i]?.id,
    )
  ) {
    value = {
      ...value,
      mineralSites: [
        ...value.mineralSites,
        ...BOKHOL_MINERALS.slice(6).map((site) => createLogging(site.id)),
      ],
    };
  }
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
  if (isRecord(value) && value.version === 18) {
    // v18 saves predate village bulletins, scout encounters and clues, build
    // price versions, the child labor decree, landmark demolition and the
    // guided first mission. Those optional fields stay absent, which the game
    // reads as the earlier behaviour: no notices, no pending encounter,
    // original build prices for refunds, child labor not enacted and no
    // landmark removed. A save that already ran is past its first orders, so
    // the guide treats it as complete; an untouched save keeps the guide.
    const progressed =
      value.restaurantBuilt === true ||
      (typeof value.elapsed === "number" && value.elapsed > 0);
    value = {
      ...value,
      version: 19,
      ...(progressed && { firstRationSet: true, firstMissionDone: true }),
    };
  }
  if (
    !isRecord(value) ||
    value.version !== 19 ||
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
    value.homes.length > 100 ||
    (value.firstRationSet !== undefined &&
      typeof value.firstRationSet !== "boolean") ||
    (value.firstMissionDone !== undefined &&
      typeof value.firstMissionDone !== "boolean") ||
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
      (h.priceVersion !== undefined &&
        ![2, 3, 4].includes(Number(h.priceVersion))) ||
      (h.timberCost !== undefined &&
        ![20, 50, 100].includes(Number(h.timberCost))) ||
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
      if (
        amount !== 20 &&
        amount !== 100 &&
        amount !== VILLAGE_RULES.constructionWood
      )
        fail("건설 자재 합계가 일치하지 않습니다.");
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
  if (
    value.bokhol !== undefined &&
    (!isRecord(value.bokhol) ||
      value.bokhol.bokhol !== undefined ||
      !isRecord(value.campaign) ||
      !["capital", "ending", "finished"].includes(
        String(value.campaign.beat),
      ) ||
      !isRecord(value.bokhol.campaign) ||
      value.bokhol.campaign.beat !== "roads")
  )
    fail("복홀 인계 기록 오류");
  if (value.scoutDepartures !== undefined) {
    if (!isRecord(value.scoutDepartures)) fail("정찰 기록 오류");
    for (const [id, start] of Object.entries(value.scoutDepartures)) {
      if (!SCOUT_SITES.some((site) => site.id === id)) fail("정찰 거점 오류");
      num(start);
    }
  }
  if (
    value.bulletins !== undefined &&
    (!Array.isArray(value.bulletins) ||
      value.bulletins.length > 100 ||
      !value.bulletins.every(
        (b) =>
          isRecord(b) &&
          ["loss", "decree", "scout"].includes(String(b.kind)) &&
          [b.title, b.key, b.detail].every(
            (v) => typeof v === "string" && v.length <= 500,
          ),
      ))
  )
    fail("마을 사건 기록 오류");
  if (
    value.scoutClues !== undefined &&
    (!Array.isArray(value.scoutClues) ||
      value.scoutClues.length > 6 ||
      new Set(value.scoutClues).size !== value.scoutClues.length ||
      !value.scoutClues.every((k) =>
        SCOUT_FINDS.some(
          (f) => f === k && (f === "record" || f.startsWith("contact")),
        ),
      ))
  )
    fail("정찰 단서 기록 오류");
  if (value.scoutFinds !== undefined) {
    if (!isRecord(value.scoutFinds) || !isRecord(value.scoutDepartures))
      fail("정찰 발견 기록 오류");
    for (const [id, e] of Object.entries(value.scoutFinds)) {
      if (
        !Object.hasOwn(value.scoutDepartures, id) ||
        !isRecord(e) ||
        !SCOUT_FINDS.some((k) => k === e.kind) ||
        !["waiting", "take", "pass", "home"].includes(String(e.decision))
      )
        fail("정찰 발견 기록 오류");
      num(e.due);
    }
  }
  if (value.scoutTripDurations !== undefined) {
    if (!isRecord(value.scoutTripDurations)) fail("정찰 시간 기록 오류");
    for (const [id, minutes] of Object.entries(value.scoutTripDurations)) {
      const site = SCOUT_SITES.find((site) => site.id === id);
      if (
        !site ||
        !isRecord(value.scoutDepartures) ||
        !Object.hasOwn(value.scoutDepartures, id)
      )
        fail("정찰 시간 기록 오류");
      num(minutes, scoutTripMinutes(site));
      if (minutes === 0) fail("정찰 시간 기록 오류");
    }
  }
  if (
    value.removedLandmarks !== undefined &&
    (!Array.isArray(value.removedLandmarks) ||
      value.removedLandmarks.some(
        (x) =>
          ![
            "BLD_WAREHOUSE",
            "BLD_WORKSHOP",
            "BLD_FORAGE",
            "BLD_GREENHOUSE",
            "BLD_WATER",
            "BLD_FISHERY",
            "BLD_CLINIC",
            "BLD_SALVAGE",
          ].includes(x),
      ))
  )
    fail("시설 철거 기록 오류");
  if (value.childLabor !== undefined && typeof value.childLabor !== "boolean")
    fail("아동 노동 정책 기록 오류");
  if (value.yardFoodSince !== undefined) {
    if (!isRecord(value.yardFoodSince)) fail("야적장 보관 기록 오류");
    for (const [food, since] of Object.entries(value.yardFoodSince)) {
      if (!FOOD_IDS.includes(food as FoodId)) fail("야적장 식량 종류 오류");
      num(since, value.elapsed as number);
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
  if (value.residents.length > 1000) fail();
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
      (r.rationUsed as number) > 200000 ||
      (r.lastMeal !== null &&
        (!isRecord(r.lastMeal) ||
          Object.entries(r.lastMeal).some(
            ([food, amount]) =>
              !["RES_PLANT", "RES_MEAT", "RES_FISH"].includes(food) ||
              !Number.isSafeInteger(amount) ||
              (amount as number) <= 0 ||
              (amount as number) > 50000,
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
    // Citizen ids are unique here: parsePlayState(value.world) already checked them.
    const citizen = findById(
      (value.world as unknown as PlayState).citizens,
      r.id as string,
    );
    if (
      !citizen ||
      (citizen.alive ? (citizen.health ?? "healthy") : "dead") !== r.health
    )
      fail("존재하지 않는 주민입니다.");
    if ((r.routine === "eating") !== (r.eatingUntil !== null))
      fail("식사 상태가 올바르지 않습니다.");
    ids.add(r.id);
  }
  const s = JSON.parse(JSON.stringify(value)) as TimberState;
  if (
    s.mutants !== undefined &&
    (!Array.isArray(s.mutants) ||
      new Set(s.mutants.map((m) => m?.id)).size !== s.mutants.length ||
      s.mutants.some(
        (m) =>
          !m ||
          !s.residents.some((r) => r.id === m.id) ||
          !Number.isSafeInteger(m.due) ||
          m.due < 0,
      ))
  )
    fail("변종 사건 기록 오류");
  if (
    s.mutantDamage !== undefined &&
    (!isRecord(s.mutantDamage) ||
      Object.entries(s.mutantDamage).some(
        ([id, damage]) =>
          !mutantStructure(s, id) ||
          !Number.isInteger(damage) ||
          damage <= 0 ||
          damage > 100,
      ))
  )
    fail("건물 손상 기록 오류");
  if (
    s.sighting &&
    (!["gate", "scout"].includes(s.sighting.source) ||
      !["R02", "R03", "SPINO"].includes(s.sighting.species))
  )
    fail("변종 목격 기록 오류");
  num(s.heating ?? 0, 3);
  num(s.firedHeat ?? 0, 3);
  if (
    s.warmerHomes !== undefined &&
    (!Array.isArray(s.warmerHomes) ||
      !s.warmerHomes.every((id) => typeof id === "string"))
  )
    throw Error("온돌 기록을 확인해 주세요.");
  if (s.raid !== undefined) {
    if (!isRecord(s.raid)) fail();
    num(s.raid.minute, s.elapsed);
    num(s.raid.picture, 5);
    num(s.raid.dead, 2);
    num(s.raid.injured, 2);
  }
  if (
    (s.rebuilding !== undefined && typeof s.rebuilding !== "boolean") ||
    (s.openingFight !== undefined && typeof s.openingFight !== "boolean") ||
    (s.rationReactionDay !== undefined &&
      (!Number.isSafeInteger(s.rationReactionDay) ||
        s.rationReactionDay < 1 ||
        s.rationReactionDay > s.world.day)) ||
    (s.decree !== undefined &&
      (!isRecord(s.decree) ||
        typeof s.decree.title !== "string" ||
        typeof s.decree.reaction !== "string" ||
        !Number.isSafeInteger(s.decree.serial) ||
        s.decree.serial < 1))
  )
    fail();
  if (
    s.campaign &&
    ["opening", "departure"].includes(s.campaign.beat) &&
    (s.elapsed !== 0 ||
      !s.paused ||
      s.chapter ||
      ![300, 600].includes(s.residents.length) ||
      !Object.entries(s.world.resources).every(
        ([id, n]) =>
          n === 10000 * AMOUNT_SCALE ||
          (id === "RES_WATER" && n === 200 * AMOUNT_SCALE),
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
    const h = findById(s.homes, r.homeId),
      c = findById(s.world.citizens, r.id);
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
    const h = r.homeId === null ? undefined : findById(s.homes, r.homeId),
      c = findById(s.world.citizens, r.id) ?? fail();
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
  // Saves from before the capital deadline start its clock when first loaded.
  if (
    s.campaign?.beat === "capital" &&
    s.bokhol &&
    s.campaign.capitalDue === undefined
  )
    return {
      ...s,
      campaign: { ...s.campaign, capitalDue: s.elapsed + CAPITAL_MINUTES },
    };
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
  return post && s.mutantDamage?.[post.id] !== 100
    ? s.residents.filter(
        (r) =>
          r.workplaceId === "facility:" + post.id &&
          r.health === "healthy" &&
          !r.task,
      ).length
    : 0;
}
function pickOne<T>(items: readonly [T, ...T[]], random: () => number): T {
  return items[Math.floor(random() * items.length)] ?? items[0];
}
export function visitorOffer(s: TimberState, option: "A" | "B") {
  const item = s.merchantItem;
  if (item === undefined) throw Error("방문 상인이 없습니다.");
  const level = s.town.facilities.find((f) => f.kind === "trade")?.level ?? 1;
  const risk = s.riskyMerchants?.includes(item);
  const payment = paymentItems[item];
  const goods = merchantGoods[item];
  const tender = payment !== undefined && merchantGoods[payment];
  if (!goods || !tender || payment === undefined)
    throw Error("상인의 거래 품목을 확인할 수 없습니다.");
  return {
    goods,
    payment: tender,
    paymentIndex: payment,
    cost: (option === "A" ? 4 : 7) - (risk ? 1 : 0),
    quantity:
      (option === "A" ? 8 : 16) +
      (level - 1) * 2 +
      (risk && option === "B" ? 2 : 0),
  };
}
export function villageDefenseActive(s: TimberState) {
  return (
    !!s.campaign &&
    !["opening", "departure"].includes(s.campaign.beat) &&
    (s.rebuilding !== false || s.campaign.beat === "capital" || s.chapter === 5)
  );
}
export function villageTemperature(s: TimberState) {
  const hour = s.world.minute / 60;
  return Math.round(
    (s.town.cold ? -15 : 3) -
      (s.campaign?.beat === "capital"
        ? Math.min(30, Math.floor((s.elapsed - s.campaign.since) / 60) * 2)
        : 0) +
      6 * Math.cos(((hour - 14) * Math.PI) / 12) +
      ([0, 2, -3, 1, -2][(s.world.day - 1) % 5] ?? 0),
  );
}
export function capitalRoad(s: TimberState) {
  if (s.campaign?.beat !== "capital") return "open";
  const t = villageTemperature(s);
  return t <= -12 ? "closed" : t < 0 ? "slow" : "open";
}
function fireOndol(s: TimberState): TimberState {
  const freeWood = Math.max(
    0,
    Math.floor(s.world.resources.RES_WOOD / AMOUNT_SCALE) - s.reservedWood,
  );
  const homes = usableHomes(s).filter((h) =>
    s.residents.some((r) => r.homeId === h.id && r.health !== "dead"),
  );
  // A manual heating level overrides the automatic one (planner decision).
  const demand =
    s.heating ||
    Math.max(0, Math.min(3, Math.ceil(-villageTemperature(s) / 10)));
  const required = demand * homes.length;
  const inCapital = s.campaign?.beat === "capital";
  const coal = inCapital
    ? Math.min(required, Math.floor(s.world.resources.RES_COAL / AMOUNT_SCALE))
    : 0;
  const woodPerHeat = inCapital ? GAME_RULES.fuel.coalToWood : 1;
  const woodHeat = Math.min(
    required - coal,
    Math.floor(freeWood / woodPerHeat),
  );
  const fuel = coal + woodHeat;
  const base = homes.length ? Math.floor(fuel / homes.length) : 0;
  const warmerHomes = homes
    .slice(0, fuel - base * homes.length)
    .map((h) => h.id);
  return {
    ...(fuel
      ? payTown(s, {
          ...(coal > 0 && { RES_COAL: coal }),
          ...(woodHeat > 0 && { RES_WOOD: woodHeat * woodPerHeat }),
        })
      : s),
    firedHeat: base + Number(warmerHomes.length > 0),
    warmerHomes,
  };
}
function onExpedition(s: TimberState, r: VillageResident) {
  return (
    r.task === "patrol-recovery" ||
    !!r.task?.startsWith("scout:") ||
    !!r.task?.startsWith("expedition:") ||
    s.town.trips.some((t) => t.ids.includes(r.id))
  );
}
export function gateRaid(s: TimberState, random = Math.random): TimberState {
  if (
    !s.campaign ||
    !villageDefenseActive(s) ||
    (s.world.minute >= 360 && s.world.minute < 1080) ||
    s.campaign.ending ||
    (s.campaign.beat !== "capital" &&
      random() >= incidentChance(0.15, s.campaign.difficulty))
  )
    return s;
  const defenders = s.residents.filter(
    (r) => r.workplaceId === "gate" && r.health === "healthy",
  ).length;
  const exposed = s.residents.filter(
    (r) =>
      r.health === "healthy" && !isMechanical(s, r.id) && !onExpedition(s, r),
  );
  let dead = 0,
    injured = 0;
  for (let i = 0; i < 2 && exposed.length; i++) {
    if (random() >= 0.7 / (1 + defenders / 4)) continue;
    const [victim] = exposed.splice(Math.floor(random() * exposed.length), 1);
    if (!victim) continue;
    const killed = random() < 0.2;
    const id = "gate-raid-" + s.elapsed + "-" + i;
    s = applyAutomaticCitizenEvent(
      s,
      killed
        ? { type: "death", id, citizenIds: [victim.id] }
        : {
            type: "illness",
            severity: "major",
            id,
            citizenIds: [victim.id],
          },
    );
    if (killed) dead++;
    else {
      injured++;
      s = mutantWound(s, victim.id, random);
    }
  }
  return note(
    {
      ...s,
      sighting: {
        source: "gate",
        species: pickOne(["R02", "R03", "SPINO"], random),
      },
      raid: {
        minute: s.elapsed,
        picture: Math.floor(random() * 6),
        dead,
        injured,
      },
    },
    `붉은 눈의 변종 공룡이 성문에서 물러났습니다. 사망 ${dead}명, 부상 ${injured}명.`,
  );
}
export function villageFatalIncident(
  s: TimberState,
  random = Math.random,
): TimberState {
  const temperature = villageTemperature(s);
  if (
    !s.campaign ||
    s.campaign.ending ||
    !villageDefenseActive(s) ||
    random() >=
      incidentChance(
        0.01 + Math.max(0, -temperature) * 0.001,
        s.campaign.difficulty,
      )
  )
    return s;
  const cases: {
    id: string;
    cause: string;
    injury?: string;
    mutant: boolean;
  }[] = [];
  const guards = s.residents.filter(
    (r) => r.workplaceId === "office" && r.health === "healthy",
  ).length;
  const patrolProtection = 2 ** [4, 8, 16].filter((n) => guards >= n).length;
  const night = s.world.minute < 360 || s.world.minute >= 1080;
  const ambush = night && random() < 1 / patrolProtection;
  const scoutAccident = random() < 0.01;
  for (const r of s.residents) {
    if (r.health === "dead" || isMechanical(s, r.id)) continue;
    let cause: string | undefined;
    let injury: string | undefined;
    let mutant = false;
    if (
      r.task === "patrol-recovery" ||
      r.task?.startsWith("scout:") ||
      s.town.trips.some((t) => t.kind === "hunt" && t.ids.includes(r.id))
    ) {
      if (!scoutAccident) continue;
      mutant = night && random() < 0.7;
      cause = mutant
        ? "성 밖에서 붉은 눈의 변종 공룡에게 습격당해 숨졌습니다."
        : pickOne(
            [
              "산적의 매복으로 정찰 중 숨졌습니다.",
              "정찰길 낙석 사고로 숨졌습니다.",
              "정찰 중 들짐승의 습격으로 숨졌습니다.",
            ],
            random,
          );
      injury = cause.replace("숨졌습니다.", "다쳤습니다.");
    } else if (atHospital(s, r)) {
      if (
        s.town.patients.some(
          (p) => p.resident === r.id && p.severity !== "minor",
        )
      )
        cause = "병원에서 치료를 받던 중 상태가 악화되어 숨졌습니다.";
    } else if (r.task?.startsWith("expedition:")) continue;
    else if (r.hunger >= 2880 && r.routine !== "eating")
      cause = "굶주림으로 숨졌습니다.";
    else if (
      r.routine === "working" &&
      (r.workplaceId?.startsWith("logging") ||
        s.town.facilities.some(
          (f) => r.workplaceId === "facility:" + f.id && facilityResource(f),
        ))
    ) {
      if (random() >= Math.min(1, 0.35 + Math.max(0, -temperature) * 0.03))
        continue;
      cause = "작업장에서 일하던 중 사고로 숨졌습니다.";
      injury = "작업장에서 일하던 중 다쳤습니다.";
    } else if (
      temperature +
        (r.homeId && s.mutantDamage?.[r.homeId] !== 100
          ? ((s.firedHeat ?? 0) -
              Number(
                !!s.warmerHomes?.length && !s.warmerHomes.includes(r.homeId),
              )) *
            10
          : 0) <
        0 &&
      !r.task &&
      r.routine !== "eating"
    ) {
      injury = "추위로 동상을 입었습니다.";
      cause = r.homeId
        ? "온돌의 불이 추위를 이기지 못해 동사했습니다."
        : "잠자리를 구하지 못하고 마을에서 동사했습니다.";
    } else if (!r.insideHome && night && !r.task && r.routine !== "eating") {
      if (ambush) {
        cause = "마을 밤길에서 피습되어 숨졌습니다.";
        injury = "밤길에서 습격을 받아 다쳤습니다.";
      }
    }
    if (cause)
      cases.push({
        id: r.id,
        cause,
        mutant,
        ...(injury && r.health === "healthy" ? { injury } : {}),
      });
  }
  const casualty = cases[Math.floor(random() * cases.length)];
  if (!casualty) return s;
  const id = "village-fatality-" + s.elapsed;
  if (s.world.citizenEvents?.includes(id)) return s;
  const wounded = casualty.injury && random() >= 0.25;
  let result = note(
    applyAutomaticCitizenEvent(
      s,
      wounded
        ? {
            type: "illness",
            severity: "major",
            id,
            citizenIds: [casualty.id],
          }
        : { type: "death", id, citizenIds: [casualty.id] },
    ),
    `주민 ${s.residents.findIndex((r) => r.id === casualty.id) + 1} · ${wounded ? casualty.injury : casualty.cause}`,
  );
  if (!wounded && result.bulletins)
    result = {
      ...result,
      bulletins: result.bulletins.map((b) =>
        b.key === id ? { ...b, detail: casualty.cause } : b,
      ),
    };
  if (!casualty.mutant) return result;
  const seen: TimberState = {
    ...result,
    sighting: {
      source: "scout",
      species: pickOne(["R02", "R03", "SPINO"], random),
    },
  };
  return wounded ? mutantWound(seen, casualty.id, random) : seen;
}
function ageYardFood(s: TimberState, previousMinute: number): TimberState {
  const covered = storageCapacity(s) * AMOUNT_SCALE;
  let next = s;
  for (const food of FOOD_IDS) {
    const since = next.yardFoodSince?.[food];
    const available = next.world.resources[food];
    if (available - covered < AMOUNT_SCALE) {
      if (since === undefined) continue;
      const ages = { ...next.yardFoodSince };
      delete ages[food];
      next = {
        ...next,
        yardFoodSince: Object.keys(ages).length ? ages : undefined,
      };
    } else if (since === undefined) {
      next = {
        ...next,
        yardFoodSince: { ...next.yardFoodSince, [food]: previousMinute },
      };
    } else if (next.elapsed - since >= 1440) {
      next = note(
        {
          ...next,
          world: {
            ...next.world,
            resources: {
              ...next.world.resources,
              [food]: available - AMOUNT_SCALE,
            },
          },
          yardFoodSince: { ...next.yardFoodSince, [food]: next.elapsed },
        },
        `야적장에 하루 동안 둔 ${GAME_RULES.resources[food].name} 1개가 상했습니다.`,
      );
    }
  }
  return next;
}
function patrolIncidentChance(s: TimberState): number {
  const guards = s.residents.filter(
    (r) => r.workplaceId === "office" && r.health === "healthy",
  ).length;
  const level = [4, 8, 16].filter((required) => guards >= required).length;
  return 0.24 / 2 ** level;
}

export function advanceTimber(
  input: TimberState,
  minutes: number,
): TimberState {
  return advanceParsedTimber(parseTimberState(input), minutes);
}
// `parsed` must come straight from parseTimberState; callers that already
// validated the input skip a second full check of a large state.
function advanceParsedTimber(
  parsed: TimberState,
  minutes: number,
): TimberState {
  let s = parsed;
  num(minutes, 1440);
  if (s.campaign?.ending) return s;
  s = replaceCrew(s);
  const target = Math.min(144000000, s.elapsed + minutes);
  let count = 0;
  while (s.elapsed < target) {
    const beforeUpdate = s.campaign?.beat;
    if (++count > 1500) fail("작업 정산 경계가 너무 많습니다.");
    if (s.phase === "waiting-labor") s = startDrying(s);
    if (s.phase === "crew-wait") s = replaceCrew(s);
    if (s.phase === "transport" && s.due !== null && s.startedAt !== null) {
      const road = capitalRoad(s);
      if (road === "closed" || (road === "slow" && s.elapsed % 2 === 0))
        s = { ...s, due: s.due + 1, startedAt: s.startedAt + 1 };
    }
    const nextTime = Math.min(target, s.due ?? target, s.elapsed + 1),
      elapsed = nextTime - s.elapsed;
    s = {
      ...s,
      elapsed: nextTime,
      world: advancePlayClock(s.world, elapsed),
    };
    for (const [site, e] of Object.entries(s.scoutFinds ?? {})) {
      if (
        e.decision === "waiting" &&
        !s.residents.some(
          (r) => r.task === "scout:" + site && r.health !== "dead",
        )
      ) {
        const departures = { ...s.scoutDepartures },
          durations = { ...s.scoutTripDurations },
          finds = { ...s.scoutFinds };
        delete departures[site];
        delete durations[site];
        delete finds[site];
        s = note(
          {
            ...s,
            scoutDepartures: departures,
            scoutTripDurations: durations,
            scoutFinds: finds,
          },
          "정찰대와 연락이 끊겼습니다.",
        );
        continue;
      }
      if (
        (e.decision !== "take" && e.decision !== "pass") ||
        (s.world.day - 1) * 1440 + s.world.minute < e.due
      )
        continue;
      const escorts = s.residents.some(
        (r) => r.task === "scout:" + site && r.health !== "dead",
      );
      s = {
        ...s,
        scoutFinds: { ...s.scoutFinds, [site]: { ...e, decision: "home" } },
      };
      if (!escorts || e.decision !== "take") continue;
      if (e.kind === "survivors") {
        const id = "field-" + site + "-" + (s.scoutDepartures?.[site] ?? e.due);
        s = applyAutomaticCitizenEvent(s, {
          type: "arrival",
          id,
          groups: [
            { species: "R02", count: 1 },
            { species: "SPINO", count: 1 },
          ],
        });
      } else if (e.kind === "wood") s = deposit(s, "RES_WOOD", 12);
      else if (e.kind === "fish") s = deposit(s, "RES_FISH", 8);
      else if (e.kind === "coal") s = deposit(s, "RES_COAL", 10);
      const [title, , delivery] = scoutFinding(e.kind);
      const clue = e.kind === "record" || e.kind.startsWith("contact");
      s = note(
        {
          ...s,
          ...(clue
            ? { scoutClues: [...new Set([...(s.scoutClues ?? []), e.kind])] }
            : {}),
          bulletins: [
            ...(s.bulletins ?? []).slice(-99),
            {
              kind: "scout",
              key: "return-" + site + "-" + e.due,
              title: "정찰대가 복홀에 돌아왔습니다",
              detail: title + " · " + delivery,
            },
          ],
        },
        "정찰대 귀환 · " + title + " · " + delivery,
      );
    }
    s = ageYardFood(s, nextTime - elapsed);
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
      s.world.day !== parsed.world.day &&
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
        merchantItem:
          capitalRoad(s) !== "closed" && roll < 0.5
            ? Math.floor(roll * 18)
            : undefined,
      };
    }
    if (s.merchantRepair && !s.town.facilities.some((f) => f.kind === "trade"))
      s = note(
        { ...s, merchantRepair: undefined },
        "교역소가 철거되어 남은 보완 작업을 종료했습니다.",
      );
    const repair = s.merchantRepair;
    const repairGoods = repair && merchantGoods[repair.item];
    if (
      repair &&
      repairGoods &&
      s.world.minute >= 540 &&
      s.world.minute < 1080 &&
      merchantStaff(s) > 0
    ) {
      const work = Math.max(0, repair.work - merchantStaff(s));
      if (!work)
        s = note(
          {
            ...deposit(s, repairGoods, repair.quantity),
            merchantRepair: undefined,
          },
          "교역소 직원이 보완을 마쳐 공동 재고에 입고했습니다.",
        );
      else s = { ...s, merchantRepair: { ...repair, work } };
    }
    s = resumeResidents(s, elapsed);
    const campaign = s.campaign;
    if (
      !campaign?.ending &&
      campaign?.beat !== "opening" &&
      campaign?.beat !== "departure" &&
      (campaign || s.rebuilding)
    ) {
      const first =
        s.rebuilding &&
        !s.openingFight &&
        s.restaurantBuilt &&
        (s.logging.built ||
          s.loggingSites.some((site) => site.built) ||
          s.town.facilities.some((f) => f.kind === "logging"));
      if (
        first ||
        ((!s.rebuilding || s.openingFight) &&
          s.elapsed % 1440 === 0 &&
          Math.random() <
            incidentChance(patrolIncidentChance(s), s.campaign?.difficulty))
      ) {
        if (first || Math.random() < 0.5) {
          const ids = s.residents
            .filter((r) => r.health === "healthy" && !r.workplaceId && !r.task)
            .slice(0, 2)
            .map((r) => r.id);
          if (ids.length === 2) {
            const eventId = "brawl-" + s.elapsed;
            s = applyTimberCommand(
              { ...s, openingFight: true },
              {
                type: "citizen-event",
                event: {
                  type: "illness",
                  id: eventId,
                  citizenIds: ids,
                  severity: "minor",
                },
              },
              eventId,
              false,
            );
            s = note(
              s,
              s.restaurantBuilt
                ? "배식 줄에서 다툼이 벌어져 주민 둘이 다쳤습니다."
                : "마을에서 다툼이 벌어져 주민 둘이 다쳤습니다.",
            );
          }
        } else {
          s = applyTimberCommand(
            s,
            { type: "building-damage", cause: "fire", amount: 25 },
            "fire-" + s.elapsed,
            false,
          );
        }
      }
    }
    if (s.due === s.elapsed) s = completeStep(s);
    if (
      villageDefenseActive(s) &&
      !s.campaign?.ending &&
      s.elapsed % 60 === 0
    ) {
      s = villageFatalIncident(fireOndol(s));
      if (
        s.campaign?.beat === "capital" &&
        s.elapsed % 240 === 0 &&
        villageTemperature(s) < 0
      ) {
        const patient = s.residents.find(
          (r) =>
            r.health === "healthy" &&
            !onExpedition(s, r) &&
            !isMechanical(s, r.id),
        );
        if (patient) {
          const id = "capital-cold-" + s.elapsed;
          s = note(
            applyAutomaticCitizenEvent(s, {
              id,
              type: "illness",
              severity: "minor",
              citizenIds: [patient.id],
            }),
            "의원: 오한이 가시지 않는 이가 또 왔습니다. 마른 이불을 이리 주십시오.",
          );
        }
      }
    }
    if (villageDefenseActive(s) && !s.campaign?.ending) {
      if (s.world.minute === 1260) {
        s = gateRaid(s);
        if (
          beforeUpdate === "forecast" &&
          s.campaign &&
          minutesUntilCoup(s) === 0 &&
          s.raid?.minute === s.elapsed
        )
          s = { ...s, campaign: { ...s.campaign, coupGateRaided: true } };
      }
      if (s.mutants?.length) s = advanceMutants(s);
    }

    s = updateCampaign(s);
    if (
      s.campaign?.ending ||
      (beforeUpdate === "forecast" &&
        (s.campaign?.beat !== "forecast" || minutesUntilCoup(s) === 15 * 60))
    )
      break;
  }
  return parseTimberState(s);
}
export function commandTimber(
  input: TimberState,
  command: TimberCommand,
  id: string,
): TimberState {
  return applyTimberCommand(input, command, id, true);
}

export function applyAutomaticCitizenEvent(
  s: TimberState,
  event: CitizenEvent,
) {
  // Simulation fallout must not consume command slots or depend on event log space.
  return applyTimberCommand(
    s,
    { type: "citizen-event", event },
    event.id,
    false,
    "if-room",
  );
}

function applyTimberCommand(
  input: TimberState,
  command: TimberCommand,
  id: string,
  record: boolean,
  recordCitizenEvent: CitizenEventRecording = record,
): TimberState {
  const s = parseTimberState(input);
  if (!id || id.length > 100) fail("명령 식별값이 올바르지 않습니다.");
  if (record) {
    if (s.processed.includes(id)) return s;
    if (s.processed.length >= 1999 && command.type !== "restart")
      fail("처리 기록이 가득 찼습니다.");
  }
  if (
    (s.campaign?.beat === "opening" || s.campaign?.beat === "departure") &&
    !["campaign", "restart"].includes(command.type)
  ) {
    if (command.type === "pause" && command.paused) return s;
    fail("귀족의 출문을 먼저 확인해 주세요.");
  }
  let n = s;
  switch (command.type) {
    case "repair-mutant":
      n = repairMutantDamage(s, command.building);
      break;
    case "contain-mutant":
      n = containMutant(s, command.resident);
      break;
    case "set-heating":
      num(command.level, 3);
      n = { ...s, heating: command.level };
      break;
    case "dismiss-sighting": {
      const { sighting: _read, ...remaining } = s;
      n = remaining;
      break;
    }
    case "dismiss-raid": {
      const { raid, ...rest } = s;
      n = rest;
      break;
    }
    case "set-gate":
    case "set-guards": {
      const workplace = command.type === "set-gate" ? "gate" : "office";
      if (![0, 4, 8, 16].includes(command.count)) fail();
      const guards = s.residents.filter(
        (r) => r.workplaceId === workplace && r.health === "healthy",
      );
      const keep = guards.slice(0, command.count).map((r) => r.id);
      const needed = command.count - keep.length;
      const added = needed
        ? eligible(s, { x: 0, z: workplace === "gate" ? 21 : -11 }, needed)
        : [];
      if (added.length !== needed) fail("배치할 일손이 모자랍니다.");
      const roster = new Set([...keep, ...added]);
      n = {
        ...s,
        residents: s.residents.map((r) =>
          roster.has(r.id)
            ? { ...r, workplaceId: workplace }
            : r.workplaceId === workplace
              ? { ...r, workplaceId: null }
              : r,
        ),
      };
      break;
    }
    case "campaign":
      n = actCampaign(s, command);
      if (
        n.campaign &&
        n.campaign.beat !== command.beat &&
        isDifficulty(command.difficulty)
      ) {
        n = {
          ...n,
          campaign: { ...n.campaign, difficulty: command.difficulty },
        };
      }
      break;
    case "demolish-building":
      n = demolishBuilding(s, command.id);
      break;
    case "plan-building":
      n = planBuilding(s, command.kind, {
        position: constructionPlot(command.position),
        headingRadians: command.headingRadians,
      });
      break;
    case "direct-staff":
      n = directStaff(s, command.resident, command.destination);
      break;
    case "facility-staff":
      n = setFacilityStaff(s, command.id, command.count);
      // 첫 식당의 인원은 식당 직원 배정과 같은 목표를 쓰므로 바로 맞춘다.
      if (n.restaurantWorkerTarget !== s.restaurantWorkerTarget)
        n = staffRestaurant(n);
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
          (site) => now >= (scoutRun(s, site)?.due ?? Infinity),
        )
      )
        fail("정찰 결과를 기다려 주세요.");
      n = note(
        { ...s, chapter: 2 },
        "지도층 생존자가 귀환했습니다. 다섯 마을과의 교류를 회복하세요.",
      );
      break;
    }
    case "read-bulletin":
      n = {
        ...s,
        bulletins: (s.bulletins ?? []).filter((b) => b.key !== command.key),
      };
      break;
    case "scout-choice": {
      const event = s.scoutFinds?.[command.site];
      if (
        !event ||
        !encounterReady(s, command.site) ||
        typeof command.take !== "boolean"
      )
        fail("정찰대의 전갈을 기다려 주세요.");
      const now = (s.world.day - 1) * 1440 + s.world.minute;
      n = {
        ...s,
        scoutFinds: {
          ...s.scoutFinds,
          [command.site]: {
            ...event,
            decision: command.take ? "take" : "pass",
            due:
              now + Math.ceil((s.scoutTripDurations?.[command.site] ?? 60) / 2),
          },
        },
      };
      break;
    }
    case "scout-sites": {
      const finds = { ...s.scoutFinds };
      let residents = s.residents;
      const departures = { ...s.scoutDepartures };
      const durations = { ...s.scoutTripDurations };
      const now = (s.world.day - 1) * 1440 + s.world.minute;
      // Encounters use the saved village seed so a replayed command or a
      // reloaded save finds the same thing.
      let seed = s.town.development.seed;
      for (const id of command.ids) {
        const site = SCOUT_SITES.find((q) => q.id === id);
        if (!site) fail("알 수 없는 정찰 거점");
        const start = departures[id];
        if (command.recall) {
          if (encounterReady(s, id)) fail("정찰대의 전갈에 먼저 답해 주세요.");
          if (
            start !== undefined &&
            now < (scoutRun(s, site)?.due ?? Infinity)
          ) {
            delete departures[id];
            delete durations[id];
            delete finds[id];
            residents = residents.map((r) =>
              r.task === "scout:" + id ? { ...r, task: null } : r,
            );
          }
        } else if (
          start === undefined ||
          (command.explore &&
            now >= (scoutRun(s, site)?.due ?? Infinity) &&
            (s.chapter || s.campaign?.reports.includes(id)))
        ) {
          if (command.explore || villageDefenseActive(s)) {
            const crew = eligible(
              { ...s, residents },
              { x: 0, z: 21 },
              SCOUT_CREW,
            );
            if (crew.length < SCOUT_CREW)
              fail("정찰조를 꾸릴 주민 두 명이 필요합니다.");
            residents = residents.map((r) =>
              crew.includes(r.id)
                ? {
                    ...r,
                    task: "scout:" + id,
                    insideHome: false,
                    routine: "idle",
                    diningSeat: null,
                    eatingUntil: null,
                  }
                : r,
            );
          }
          departures[id] = now;
          durations[id] = scoutTripMinutes(site, s);
          if (command.explore) {
            seed = nextVillageSeed(seed);
            const roll = seed / 4294967296;
            finds[id] = {
              kind: pickOne(SCOUT_FINDS, () => roll),
              decision: "waiting",
              due: now + Math.ceil(durations[id] / 2),
            };
          }
        }
      }
      n = {
        ...s,
        residents,
        town: {
          ...s.town,
          development: { ...s.town.development, seed },
        },
        ...(command.explore || s.scoutFinds ? { scoutFinds: finds } : {}),
        scoutDepartures: departures,
        scoutTripDurations: durations,
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
        paused: command.recall || s.campaign ? s.paused : false,
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
        .filter(
          (r) =>
            !r.nextWork &&
            r.health === "healthy" &&
            (s.childLabor ||
              !s.world.citizens.some(
                (c) => c.id === r.id && c.age === "child",
              )),
        )
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
    case "enact-child-labor":
      if (s.childLabor) fail("이미 시행 중인 정책입니다.");
      if (s.campaign && policyWait(s))
        fail("다음 정책은 발효 후 열두 시간이 지나야 내릴 수 있습니다.");
      n = note(
        {
          ...s,
          childLabor: true,
          ...(s.campaign && {
            campaign: { ...s.campaign, lastPolicyAt: s.elapsed },
          }),
        },
        "아동 노동을 허용하는 방이 붙었습니다.",
      );
      break;
    case "set-ration-policy":
      if (
        s.campaign &&
        (!s.firstRationSet || command.policy !== s.rationPolicy) &&
        policyWait(s)
      )
        fail("다음 정책은 발효 후 열두 시간이 지나야 내릴 수 있습니다.");
      if (!["needs", "cap"].includes(command.policy))
        fail("배급 정책이 올바르지 않습니다.");
      n = note(
        {
          ...s,
          firstRationSet: true,
          rationPolicy: command.policy,
          ...(s.campaign &&
            (!s.firstRationSet || command.policy !== s.rationPolicy) && {
              campaign: { ...s.campaign, lastPolicyAt: s.elapsed },
            }),
        },
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
        position: constructionPlot(command.position),
        headingRadians: command.headingRadians,
      };
      const issue = homePlacementIssue(s, pose);
      if (issue) fail(issue);
      const ids: string[] = [];
      const slots = homeWorkSlots(s, pose);
      let available = clearBuildingFootprint(
        s,
        pose,
        1.85,
        homeEntrance(pose),
        villageObstacles(s),
      );
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
          paused: s.campaign ? s.paused : false,
          woodSpent: s.woodSpent + VILLAGE_RULES.constructionWood,
          world: {
            ...s.world,
            resources: {
              ...s.world.resources,
              RES_WOOD:
                s.world.resources.RES_WOOD -
                VILLAGE_RULES.constructionWood * AMOUNT_SCALE,
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
        `온돌 둥지 배치 확정. 목재${VILLAGE_RULES.constructionWood}을 확보하고 가까운 유휴 주민이 자재를 운반합니다.`,
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
        kind === "logging" &&
        productionSiteDefinition(site.siteId).kind !== "forest" &&
        mineralWorksites(s, site.siteId) >= 2
      )
        fail("광맥당 채굴 시설은 두 곳까지입니다.");
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
        fail(`공동 목재${VILLAGE_RULES.constructionWood}이 필요합니다.`);
      const workerId = eligible(s, constructionSite(kind, position), 1)[0];
      if (!workerId) fail("건설할 유휴 주민이 없습니다.");
      n = note(
        {
          ...s,
          woodSpent: s.woodSpent + VILLAGE_RULES.constructionWood,
          world: {
            ...s.world,
            resources: {
              ...s.world.resources,
              RES_WOOD:
                s.world.resources.RES_WOOD -
                VILLAGE_RULES.constructionWood * AMOUNT_SCALE,
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
          paused: s.campaign ? s.paused : false,
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
          : applyCitizenEvent(s.world, command.event, recordCitizenEvent);
      const workshop =
        command.type === "mechanize" &&
        s.town.facilities.find((f) => f.kind === "workshop");
      const arrivalPoint = workshop ? facilityDoor(workshop) : { x: 0, z: 21 };
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
            : {
                ...createVillageResident(c, i, world.day),
                position: arrivalPoint,
              };
        }),
      };
      n = {
        ...n,
        residents: assignHomes(n.residents, n.world.citizens, usableHomes(n)),
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
      if (capitalRoad(s) === "closed")
        fail("고갯길이 막혀 새 물자를 조달할 수 없습니다.");
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
            paused: s.campaign ? s.paused : false,
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
            paused: s.campaign ? s.paused : false,
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
          residents: assignHomes(n.residents, n.world.citizens, usableHomes(n)),
        };
      if (
        n.buildingHealth === 0 &&
        ["building-travel", "building"].includes(n.phase)
      )
        n = stop({ ...n, reservedWood: 0, repairWorkerId: null }, "ready");
      break;
    case "visit-decision": {
      if (
        capitalRoad(s) === "closed" ||
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
      const paid = payTown(s, { [offer.payment]: offer.cost });
      const bad =
        Math.random() < incidentChance(0.3, s.campaign?.difficulty) ? 2 : 0;
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
      if (s.campaign && policyWait(s))
        fail("다음 정책은 발효 후 열두 시간이 지나야 내릴 수 있습니다.");
      if (
        s.mission !== "register-policy" ||
        !["relief", "registry"].includes(command.policy)
      )
        fail();
      n = note(
        {
          ...s,
          policy: command.policy,
          mission: "village-orders",
          ...(s.campaign && {
            campaign: { ...s.campaign, lastPolicyAt: s.elapsed },
          }),
        },
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
  const villageOrders: Record<string, [string, string]> = {
    share: ["병상에 배식", "누워 있는 우리 누이 몫도 가져다준대."],
    reserve: ["비축분 봉인", "솥이 비었는데 곳간 문엔 빗장을 건다고?"],
    report: [
      "도성 피해 장부 접수",
      "의원께서 다친 이들의 이름을 하나씩 짚어 보셨네.",
    ],
    listen: ["창고 앞 청원 허용", "여기서 기다리면 우리 말도 들어 주신다네."],
    cordon: [
      "창고 출입 통제",
      "빈 그릇 들고 온 이들 앞에 경비부터 세우는구먼.",
    ],
  };
  const order =
    command.type === "campaign"
      ? command.action.startsWith("ration:")
        ? s.campaign?.side === "coexist"
          ? [
              "교역으로 식량 조달",
              "저 집에서 고기를 보내 줬으니 우리도 약속한 재목을 보내야지.",
            ]
          : [
              "비상 식량 징발",
              "어제까지 옆에 누웠던 이를 오늘 그릇에 담으란 말이오?",
            ]
        : villageOrders[command.action]
      : undefined;
  const decision =
    (command.type === "enact-child-labor" ? "아동 노동 허용" : order?.[0]) ??
    (command.type === "set-ration-policy" &&
    (!s.firstRationSet || command.policy !== s.rationPolicy)
      ? command.policy === "needs"
        ? "필요량에 따른 배급"
        : "식단별 배급 상한"
      : command.type === "set-policy"
        ? command.policy === "relief"
          ? "새 주민 구휼"
          : "호구 등록 우선"
        : command.type === "campaign" &&
            n.campaign?.side !== s.campaign?.side &&
            n.campaign?.side
          ? n.campaign.side === "coexist"
            ? "공동 배식과 교류"
            : "배급 통제"
          : null);
  if (decision) {
    const welcome = [
      "필요량에 따른 배급",
      "새 주민 구휼",
      "공동 배식과 교류",
    ].includes(decision);
    const reaction =
      order?.[1] ??
      (welcome
        ? "이제 우리 막내 몫도 청해 볼 수 있겠어."
        : "저 글대로면 우리 집 몫은 얼마나 남는 게요?");
    const supported = order
      ? !["비축분 봉인", "창고 출입 통제", "비상 식량 징발"].includes(decision)
      : welcome;
    const key = supported ? "optimism" : "pessimism";
    const rationChange = command.type === "set-ration-policy";
    n = note(
      {
        ...n,
        ...(rationChange && { rationReactionDay: s.world.day }),
        decree: {
          title: decision,
          reaction,
          serial: (s.decree?.serial ?? 0) + 1,
        },
        world:
          n.world[key] > s.world[key] ||
          (rationChange && s.rationReactionDay === s.world.day)
            ? n.world
            : { ...n.world, [key]: Math.min(100, n.world[key] + 1) },
      },
      reaction,
    );
  }
  if (
    command.type === "citizen-event" &&
    command.event.type === "death" &&
    !s.world.citizenEvents?.includes(command.event.id)
  ) {
    const lost = command.event.citizenIds.filter((id) =>
      s.world.citizens.some((c) => c.id === id && c.alive),
    );
    if (lost.length) {
      const cause = command.event.id.startsWith("gate-raid")
        ? "성문을 지키던 중 습격을 받았습니다."
        : command.event.id.startsWith("ration:")
          ? "비상 배급령이 집행됐습니다."
          : "마을에 부고가 전해졌습니다.";
      n = {
        ...n,
        bulletins: [
          ...(n.bulletins ?? []).slice(-99),
          {
            key: command.event.id,
            kind: "loss",
            title: `주민 ${lost.length}명이 숨졌습니다`,
            detail: cause,
          },
        ],
      };
    }
  }
  if (
    decision &&
    n.decree &&
    [
      "공동 배식과 교류",
      "배급 통제",
      "교역으로 식량 조달",
      "비상 식량 징발",
      "창고 출입 통제",
      "비축분 봉인",
    ].includes(decision)
  ) {
    n = {
      ...n,
      bulletins: [
        ...(n.bulletins ?? []).slice(-99),
        {
          key: "decree-" + n.decree.serial,
          kind: "decree",
          title: decision,
          detail: "관아 앞에 방이 붙었습니다. “" + n.decree.reaction + "”",
        },
      ],
    };
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
    updateCampaign(record ? { ...n, processed: [...n.processed, id] } : n),
  );
}
export function tickTimber(input: TimberState, elapsedMs: number): TimberState {
  const s = parseTimberState(input);
  num(elapsedMs, Number.MAX_SAFE_INTEGER);
  if (s.paused) return s;
  const numerator = Math.min(1000, elapsedMs) * s.speed + s.remainder;
  return {
    ...advanceParsedTimber(s, Math.floor(numerator / 1000)),
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
  const state = parseTimberState(v.state);
  if (state.bokhol) parseTimberState(state.bokhol);
  return { format: "dynosty-timber", saveVersion: 1, state };
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
        visible:
          !r.task?.startsWith("scout:") &&
          r.task !== "patrol-recovery" &&
          r.health !== "dead" &&
          !residentIndoors(s, r),
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
