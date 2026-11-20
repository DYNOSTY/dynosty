import { BOKHOL_MAP } from "./bokhol.js";
import raw from "./game-data.json" with { type: "json" };
import { isRecord } from "./save.js";
import type { SceneEntity, SceneSnapshot } from "./scene.js";

export type RuleSet = typeof raw;
export type ResourceId = keyof RuleSet["resources"];
export const RESOURCE_IDS = Object.keys(raw.resources) as ResourceId[];
export const FOOD_IDS = ["RES_PLANT", "RES_MEAT", "RES_FISH"] as const;
export type FoodId = (typeof FOOD_IDS)[number];
export const AMOUNT_SCALE = 10_000;
export class PlayDataError extends Error {}
function fail(): never {
  throw new PlayDataError(
    "게임 기준이나 저장 값이 올바르지 않습니다. 기존 기록은 유지됩니다.",
  );
}
function number(
  value: unknown,
  min: number,
  max: number,
  integer = false,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  )
    fail();
}
function text(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 500) fail();
}

function quantizable(value: number) {
  const units = value * AMOUNT_SCALE;
  return (
    Number.isSafeInteger(Math.round(units)) &&
    Math.abs(units - Math.round(units)) < 0.00001
  );
}
export function parseRules(value: unknown): RuleSet {
  if (!isRecord(value) || value.rulesVersion !== 1) fail();
  for (const key of [
    "resources",
    "initial",
    "time",
    "food",
    "campaign",
    "endings",
    "fuel",
    "approval",
  ])
    if (!isRecord(value[key])) fail();
  const resources = value.resources as Record<string, unknown>;
  if (Object.keys(resources).length !== RESOURCE_IDS.length) fail();
  for (const id of RESOURCE_IDS) {
    const r = resources[id];
    if (!isRecord(r)) fail();
    text(r.name);
    text(r.unit);
    text(r.purpose);
    text(r.acquisition);
    number(r.initial, 0, 1_000_000);
    if (!quantizable(r.initial)) fail();
  }
  if (!Array.isArray(value.population) || value.population.length === 0) fail();
  const ids = new Set<string>();
  let total = 0;
  for (const p of value.population) {
    if (!isRecord(p)) fail();
    text(p.species);
    text(p.name);
    if (p.age !== "adult") fail();
    if (ids.has(p.species) || !FOOD_IDS.includes(p.diet as FoodId)) fail();
    ids.add(p.species);
    number(p.count, 1, 200, true);
    total += p.count;
  }
  if (total > 600) fail();
  const initial = value.initial as Record<string, unknown>;
  number(initial.day, 1, 100_000, true);
  number(initial.minute, 0, 1439, true);
  number(initial.optimism, 0, 100);
  number(initial.pessimism, 0, 100);
  text(initial.weather);
  text(initial.representativeResidentId);
  number(initial.residentHeadingRadians, -Math.PI * 2, Math.PI * 2);
  if (!isRecord(initial.residentPosition)) fail();
  for (const axis of ["x", "y", "z"])
    number(initial.residentPosition[axis], -9, 9);
  if (
    !Array.isArray(initial.buildings) ||
    initial.buildings.length < 1 ||
    initial.buildings.length > 100
  )
    fail();
  const buildingIds = new Set<string>();
  for (const b of initial.buildings) {
    if (!isRecord(b) || b.type !== "ondol-nest" || !isRecord(b.position))
      fail();
    text(b.id);
    number(b.headingRadians, -Math.PI * 2, Math.PI * 2);
    if (buildingIds.has(b.id) || b.id === initial.representativeResidentId)
      fail();
    buildingIds.add(b.id);
    for (const axis of ["x", "y", "z"]) number(b.position[axis], -9, 9);
  }

  const time = value.time as Record<string, unknown>;
  number(time.minutesPerRealSecond, 1, 1440, true);
  number(time.tickMs, 100, 5000, true);
  number(time.maxCatchUpMs, 1, 5000, true);
  if (
    time.minutesPerDay !== 1440 ||
    time.initialPaused !== true ||
    time.loadPaused !== true ||
    time.background !== "pause-manual-resume"
  )
    fail();
  const food = value.food as Record<string, unknown>;
  number(food.unitsPerResidentPerDay, 0.0001, 100);
  number(food.warningDays, 0.01, 30);
  if (
    food.precision !== AMOUNT_SCALE ||
    !quantizable(food.unitsPerResidentPerDay) ||
    food.distribution !== "proportional-by-diet" ||
    food.settlement !== "minute-fixed-point"
  )
    fail();
  const c = value.campaign as Record<string, unknown>;
  if (
    c.stage3 !== "arrival-event" ||
    c.stage4PreparationDays !== 15 ||
    c.stage4ColdDays !== 15 ||
    c.stage5MinimumDays !== 10 ||
    c.r19 !== "after-yangnyeong-route" ||
    c.c04 !== "early-stage4" ||
    c.yangnyeong !== "stage5" ||
    JSON.stringify(c.clues) !== JSON.stringify(["C01", "C02", "C03", "C04"]) ||
    JSON.stringify(c.researchOrder) !== JSON.stringify(["R17", "R18"])
  )
    fail();
  const e = value.endings as Record<string, unknown>;
  if (
    e.concernPessimism !== 60 ||
    e.warningPessimism !== 75 ||
    e.urgentPessimism !== 90 ||
    e.evictionPessimism !== 100 ||
    e.evictionOptimism !== 0 ||
    e.evictionMinutes !== 1440 ||
    e.deathFraction !== 0.8 ||
    e.failureFirst !== true ||
    e.endingAPessimism !== 30 ||
    e.endingAHoldDays !== 10
  )
    fail();
  const f = value.fuel as Record<string, unknown>;
  if (
    f.coalToWood !== 3 ||
    f.heatingFirst !== true ||
    f.protectReservedWood !== true
  )
    fail();
  number(f.heatingCoalPerDay, 0, 1000);
  number(f.kitchenCoalPerDay, 0, 1000);
  if (f.noCoalWoodPerDay !== (f.heatingCoalPerDay + f.kitchenCoalPerDay) * 3)
    fail();
  const a = value.approval as Record<string, unknown>;
  if (a.status !== "user-approved-development-baseline") fail();
  text(a.date);
  text(a.basis);
  if (
    !Array.isArray(value.sources) ||
    value.sources.length < 2 ||
    !Array.isArray(value.developmentChoices) ||
    value.developmentChoices.length === 0
  )
    fail();
  for (const s of value.sources) {
    if (!isRecord(s)) fail();
    text(s.id);
    text(s.url);
    text(s.version);
    if (!Array.isArray(s.sections)) fail();
  }
  for (const choice of value.developmentChoices) text(choice);
  return JSON.parse(JSON.stringify(value)) as RuleSet;
}
export const GAME_RULES = parseRules(raw);
export interface Citizen {
  readonly id: string;
  readonly species: string;
  readonly diet: FoodId;
  readonly age: "adult";
  readonly alive: boolean;
  readonly mechanicalFrom?: string;
  readonly health?: "healthy" | "sick" | "dead";
}
export interface PlayBuilding {
  readonly id: string;
  readonly type: "ondol-nest";
  readonly headingRadians: number;
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
}
export interface PlayState {
  readonly schemaVersion: 1;
  readonly rulesVersion: 1;
  readonly day: number;
  readonly minute: number;
  readonly paused: boolean;
  readonly tickRemainder: number;
  readonly citizens: readonly Citizen[];
  readonly citizenEvents?: readonly string[];
  readonly buildings: readonly PlayBuilding[];
  readonly resources: Readonly<Record<ResourceId, number>>;
  readonly foodCarry: Readonly<Record<FoodId, number>>;
  readonly unmet: Readonly<Record<FoodId, number>>;
  readonly optimism: number;
  readonly pessimism: number;
}
export function createPlayState(rules: RuleSet = GAME_RULES): PlayState {
  const r = parseRules(rules);
  const citizens: Citizen[] = [];
  for (const p of r.population)
    for (let i = 0; i < p.count; i++)
      citizens.push({
        id:
          citizens.length === 0
            ? r.initial.representativeResidentId
            : `${p.species}-${i + 1}`,
        species: p.species,
        diet: p.diet as FoodId,
        age: "adult",
        alive: true,
        health: "healthy",
      });
  return {
    schemaVersion: 1,
    rulesVersion: 1,
    day: r.initial.day,
    minute: r.initial.minute,
    paused: true,
    tickRemainder: 0,
    citizens,
    buildings: r.initial.buildings.map((b) => ({
      ...b,
      type: "ondol-nest",
      headingRadians: b.headingRadians,
      position: { ...b.position },
    })),
    resources: Object.fromEntries(
      RESOURCE_IDS.map((id) => [
        id,
        Math.round(r.resources[id].initial * AMOUNT_SCALE),
      ]),
    ) as Record<ResourceId, number>,
    foodCarry: { RES_PLANT: 0, RES_MEAT: 0, RES_FISH: 0 },
    unmet: { RES_PLANT: 0, RES_MEAT: 0, RES_FISH: 0 },
    optimism: r.initial.optimism,
    pessimism: r.initial.pessimism,
  };
}
export function parsePlayState(
  value: unknown,
  rules: RuleSet = GAME_RULES,
): PlayState {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.rulesVersion !== rules.rulesVersion ||
    typeof value.paused !== "boolean" ||
    !isRecord(value.resources) ||
    !isRecord(value.foodCarry) ||
    !isRecord(value.unmet) ||
    !Array.isArray(value.buildings) ||
    value.buildings.length > 100 ||
    !Array.isArray(value.citizens) ||
    value.citizens.length === 0 ||
    value.citizens.length > 1000
  )
    fail();
  const resourceSource: Record<string, unknown> = {
    ...value.resources,
    ...(!("RES_IRON_ORE" in value.resources) ? { RES_IRON_ORE: 0 } : {}),
    ...(!("RES_STONE" in value.resources) ? { RES_STONE: 0 } : {}),
  };
  number(value.day, 1, 100_000, true);
  number(value.minute, 0, 1439, true);
  number(value.tickRemainder, 0, 999, true);
  number(value.optimism, 0, 100);
  number(value.pessimism, 0, 100);
  const resources = {} as Record<ResourceId, number>;
  for (const id of RESOURCE_IDS) {
    const amount = resourceSource[id];
    number(amount, 0, 10_000_000_000, true);
    resources[id] = amount;
  }
  const carry = {} as Record<FoodId, number>;
  const unmet = {} as Record<FoodId, number>;
  for (const id of FOOD_IDS) {
    const c = value.foodCarry[id];
    const u = value.unmet[id];
    number(c, 0, 1439, true);
    number(u, 0, Number.MAX_SAFE_INTEGER, true);
    carry[id] = c;
    unmet[id] = u;
  }
  if (
    value.citizenEvents !== undefined &&
    (!Array.isArray(value.citizenEvents) ||
      value.citizenEvents.length > 2000 ||
      value.citizenEvents.some(
        (id) => typeof id !== "string" || !id || id.length > 100,
      ) ||
      new Set(value.citizenEvents).size !== value.citizenEvents.length)
  )
    fail();
  const ids = new Set<string>();
  const citizens = value.citizens.map((p): Citizen => {
    if (!isRecord(p) || p.age !== "adult" || typeof p.alive !== "boolean")
      fail();
    text(p.id);
    text(p.species);
    const definition = rules.population.find((x) => x.species === p.species);
    if (!definition || p.diet !== definition.diet || ids.has(p.id)) fail();
    if (
      p.health !== undefined &&
      (!["healthy", "sick", "dead"].includes(p.health as string) ||
        (p.health === "dead") !== !p.alive)
    )
      fail();
    ids.add(p.id);
    return {
      id: p.id,
      species: p.species,
      diet: p.diet as FoodId,
      age: "adult",
      alive: p.alive,
      ...(p.mechanicalFrom !== undefined
        ? { mechanicalFrom: String(p.mechanicalFrom) }
        : {}),
      ...(p.health !== undefined
        ? { health: p.health as NonNullable<Citizen["health"]> }
        : {}),
    };
  });
  const bones = new Set<string>();
  for (const c of citizens)
    if (c.mechanicalFrom !== undefined) {
      const source = citizens.find((p) => p.id === c.mechanicalFrom);
      if (
        !source ||
        source.alive ||
        source.mechanicalFrom ||
        bones.has(source.id) ||
        c.id !== `mecha:${source.id}`
      )
        fail();
      bones.add(source.id);
    }
  const buildings = value.buildings.map((b): PlayBuilding => {
    if (!isRecord(b) || b.type !== "ondol-nest" || !isRecord(b.position))
      fail();
    text(b.id);
    if (ids.has(b.id)) fail();
    ids.add(b.id);
    number(b.headingRadians, -Math.PI * 2, Math.PI * 2);
    const p = b.position;
    number(p.x, -BOKHOL_MAP.coordinateLimit, BOKHOL_MAP.coordinateLimit);
    number(p.y, -48, 48);
    number(p.z, -BOKHOL_MAP.coordinateLimit, BOKHOL_MAP.coordinateLimit);
    return {
      id: b.id,
      type: "ondol-nest",
      headingRadians: b.headingRadians,
      position: { x: p.x, y: p.y, z: p.z },
    };
  });
  return {
    schemaVersion: 1,
    rulesVersion: 1,
    day: value.day,
    minute: value.minute,
    paused: value.paused,
    tickRemainder: value.tickRemainder,
    citizens,
    ...(value.citizenEvents !== undefined
      ? { citizenEvents: [...(value.citizenEvents as string[])] }
      : {}),
    buildings,
    resources,
    foodCarry: carry,
    unmet,
    optimism: value.optimism,
    pessimism: value.pessimism,
  };
}
export function dailyFoodDemand(
  state: PlayState,
  rules: RuleSet = GAME_RULES,
): Record<FoodId, number> {
  const demand = { RES_PLANT: 0, RES_MEAT: 0, RES_FISH: 0 };
  for (const c of state.citizens)
    if (c.alive && !c.mechanicalFrom)
      demand[c.diet] += Math.round(
        rules.food.unitsPerResidentPerDay * AMOUNT_SCALE,
      );
  return demand;
}
export function advancePlayMinutes(
  input: PlayState,
  minutes: number,
  rules: RuleSet = GAME_RULES,
): PlayState {
  number(minutes, 0, 10080, true);
  const state = parsePlayState(input, rules);
  const demand = dailyFoodDemand(state, rules);
  const resources = { ...state.resources };
  const carry = { ...state.foodCarry };
  const unmet = { ...state.unmet };
  for (const id of FOOD_IDS) {
    const numerator = demand[id] * minutes + carry[id];
    const needed = Math.floor(numerator / rules.time.minutesPerDay);
    carry[id] = numerator % rules.time.minutesPerDay;
    const used = Math.min(resources[id], needed);
    resources[id] -= used;
    unmet[id] += needed - used;
    if (!Number.isSafeInteger(unmet[id])) fail();
  }
  const elapsed = state.minute + minutes;
  const day = state.day + Math.floor(elapsed / rules.time.minutesPerDay);
  number(day, 1, 100_000, true);
  return {
    ...state,
    day,
    minute: elapsed % rules.time.minutesPerDay,
    resources,
    foodCarry: carry,
    unmet,
  };
}
export function tickPlay(
  input: PlayState,
  elapsedMs: number,
  rules: RuleSet = GAME_RULES,
): PlayState {
  number(elapsedMs, 0, Number.MAX_SAFE_INTEGER, true);
  const state = parsePlayState(input, rules);
  if (state.paused) return state;
  const numerator =
    Math.min(elapsedMs, rules.time.maxCatchUpMs) *
      rules.time.minutesPerRealSecond +
    state.tickRemainder;
  const minutes = Math.floor(numerator / 1000);
  return {
    ...advancePlayMinutes(state, minutes, rules),
    tickRemainder: numerator % 1000,
  };
}
export function setPlayPaused(state: PlayState, paused: boolean): PlayState {
  return { ...parsePlayState(state), paused, tickRemainder: 0 };
}
export function supplyFood(input: PlayState, days: number): PlayState {
  number(days, 0, 30, true);
  const state = parsePlayState(input);
  const d = dailyFoodDemand(state);
  return {
    ...state,
    resources: {
      ...state.resources,
      ...Object.fromEntries(FOOD_IDS.map((id) => [id, d[id] * days])),
    },
    unmet: { RES_PLANT: 0, RES_MEAT: 0, RES_FISH: 0 },
  };
}
export function foodWarnings(state: PlayState, rules: RuleSet = GAME_RULES) {
  const demand = dailyFoodDemand(state, rules);
  return FOOD_IDS.flatMap((id) =>
    demand[id] > 0 && state.resources[id] < demand[id] * rules.food.warningDays
      ? [
          {
            id,
            name: rules.resources[id].name,
            level:
              state.resources[id] === 0 ? ("empty" as const) : ("low" as const),
          },
        ]
      : [],
  );
}
export type Difficulty = "normal" | "hard";
export function evictionDelay(
  difficulty: Difficulty = "normal",
  rules = GAME_RULES,
) {
  return difficulty === "hard" ? 0 : rules.endings.evictionMinutes;
}
export interface OutcomeFacts {
  difficulty?: Difficulty;
  admitted: number;
  dead: number;
  pessimism: number;
  optimism: number;
  pessimismExtremeMinutes: number;
  optimismZeroMinutes: number;
  stage5Minutes: number;
  lowPessimismMinutes: number;
  route: "coexist" | "yangnyeong" | null;
  clues: readonly string[];
  research: readonly string[];
  mech2: boolean;
}
export function evaluateOutcome(
  f: OutcomeFacts,
  rules: RuleSet = GAME_RULES,
): "failure" | "ending-a" | "ending-b" | "continue" {
  number(f.admitted, 1, 100_000, true);
  number(f.dead, 0, f.admitted, true);
  number(f.pessimism, 0, 100);
  number(f.optimism, 0, 100);
  for (const n of [
    f.pessimismExtremeMinutes,
    f.optimismZeroMinutes,
    f.stage5Minutes,
    f.lowPessimismMinutes,
  ])
    number(n, 0, Number.MAX_SAFE_INTEGER, true);
  const delay = evictionDelay(f.difficulty, rules);
  if (
    (f.pessimism >= rules.endings.evictionPessimism &&
      f.pessimismExtremeMinutes >= delay) ||
    (f.optimism <= rules.endings.evictionOptimism &&
      f.optimismZeroMinutes >= delay) ||
    f.dead / f.admitted >= rules.endings.deathFraction
  )
    return "failure";
  if (
    f.stage5Minutes < rules.campaign.stage5MinimumDays * 1440 ||
    !rules.campaign.clues.every((c) => f.clues.includes(c)) ||
    !rules.campaign.researchOrder.every((r) => f.research.includes(r))
  )
    return "continue";
  if (
    f.route === "coexist" &&
    f.pessimism <= rules.endings.endingAPessimism &&
    f.lowPessimismMinutes >= rules.endings.endingAHoldDays * 1440
  )
    return "ending-a";
  if (f.route === "yangnyeong" && f.research.includes("R19") && f.mech2)
    return "ending-b";
  return "continue";
}
export interface PlaySave {
  readonly format: "dynosty-play";
  readonly saveVersion: 1;
  readonly rulesVersion: 1;
  readonly state: PlayState;
}
export function parsePlaySave(v: unknown): PlaySave {
  if (
    !isRecord(v) ||
    v.format !== "dynosty-play" ||
    v.saveVersion !== 1 ||
    v.rulesVersion !== GAME_RULES.rulesVersion
  )
    fail();
  return {
    format: "dynosty-play",
    saveVersion: 1,
    rulesVersion: 1,
    state: parsePlayState(v.state),
  };
}
export function createPlaySave(state: PlayState): PlaySave {
  return parsePlaySave({
    format: "dynosty-play",
    saveVersion: 1,
    rulesVersion: 1,
    state,
  });
}

export function createPlayScene(
  state: PlayState,
  rules: RuleSet = GAME_RULES,
): SceneSnapshot {
  const representative = state.citizens.find(
    (c) => c.species === "R02" && c.alive,
  );
  const entities: SceneEntity[] = state.buildings.map((b) => ({
    id: b.id,
    kind: "building",
    position: { ...b.position },
    headingRadians: b.headingRadians,
    visible: true,
    highlighted: false,
  }));
  if (representative)
    entities.push({
      id: representative.id,
      kind: "resident",
      position: { ...rules.initial.residentPosition },
      headingRadians: rules.initial.residentHeadingRadians,
      visible: true,
      motion: state.paused ? "idle" : "walking",
    });
  return { schemaVersion: 1, entities };
}

export type CitizenEvent =
  | { type: "mechanize"; id: string; sourceCitizenId: string }
  | {
      type: "arrival";
      id: string;
      groups: readonly { species: string; count: number }[];
    }
  | {
      type: "illness" | "recovery" | "death";
      id: string;
      citizenIds: readonly string[];
      severity?: "minor" | "major" | "critical";
    };
export function applyCitizenEvent(
  input: PlayState,
  event: CitizenEvent,
): PlayState {
  const s = parsePlayState(input);
  text(event.id);
  if (event.id.length > 100) fail();
  if (s.citizenEvents?.includes(event.id)) return s;
  if ((s.citizenEvents?.length ?? 0) >= 2000) fail();
  let citizens = [...s.citizens];
  if (event.type === "mechanize") {
    const source = citizens.find((c) => c.id === event.sourceCitizenId);
    if (
      !source ||
      source.alive ||
      source.mechanicalFrom ||
      citizens.length >= 600 ||
      citizens.some((c) => c.mechanicalFrom === source.id)
    )
      fail();
    citizens.push({
      ...source,
      id: `mecha:${source.id}`,
      alive: true,
      health: "healthy",
      mechanicalFrom: source.id,
    });
  } else if (event.type === "arrival") {
    if (
      !Array.isArray(event.groups) ||
      !event.groups.length ||
      event.groups.length > GAME_RULES.population.length
    )
      fail();
    const species = new Set<string>();
    for (const group of event.groups) {
      const definition = GAME_RULES.population.find(
        (p) => p.species === group.species,
      );
      if (!definition || species.has(group.species)) fail();
      species.add(group.species);
      number(group.count, 1, 600, true);
      if (
        citizens.length + group.count >
        (event.id === "capital-refugees" ? 1000 : 600)
      )
        fail();
      for (let i = 0; i < group.count; i++) {
        const id = `arrival:${event.id}:${group.species}:${i}`;
        if (citizens.some((c) => c.id === id)) fail();
        citizens.push({
          id,
          species: group.species,
          diet: definition.diet as FoodId,
          age: "adult",
          alive: true,
          health: "healthy",
        });
      }
    }
  } else {
    if (
      !["illness", "recovery", "death"].includes(event.type) ||
      (event.severity !== undefined &&
        (event.type !== "illness" ||
          !["minor", "major", "critical"].includes(event.severity))) ||
      !Array.isArray(event.citizenIds) ||
      !event.citizenIds.length ||
      new Set(event.citizenIds).size !== event.citizenIds.length ||
      event.citizenIds.some(
        (id) => !citizens.some((c) => c.id === id && c.alive),
      )
    )
      fail();
    citizens = citizens.map((c) =>
      event.citizenIds.includes(c.id)
        ? {
            ...c,
            alive: event.type !== "death",
            health:
              event.type === "death"
                ? "dead"
                : event.type === "illness"
                  ? "sick"
                  : "healthy",
          }
        : c,
    );
  }
  return parsePlayState({
    ...s,
    citizens,
    citizenEvents: [...(s.citizenEvents ?? []), event.id],
  });
}
export function advancePlayClock(input: PlayState, minutes: number): PlayState {
  number(minutes, 0, 10080, true);
  const s = parsePlayState(input),
    total = s.minute + minutes;
  return parsePlayState({
    ...s,
    day: s.day + Math.floor(total / 1440),
    minute: total % 1440,
  });
}
