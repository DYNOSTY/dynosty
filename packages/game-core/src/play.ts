import raw from "./game-data.json" with { type: "json" };
import { isRecord } from "./save.js";
import type { SceneEntity, SceneSnapshot } from "./scene.js";
import {
  createWinterState,
  parseWinterState,
  stepWinter,
  type WinterState,
} from "./winter.js";

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
  if (Object.keys(resources).length !== 7) fail();
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
    e.warningPessimism !== 90 ||
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
  readonly buildings: readonly PlayBuilding[];
  readonly resources: Readonly<Record<ResourceId, number>>;
  readonly foodCarry: Readonly<Record<FoodId, number>>;
  readonly unmet: Readonly<Record<FoodId, number>>;
  readonly optimism: number;
  readonly pessimism: number;
  /** 절기·온돌·체온 (winter.ts) — 옛 저장에는 없어서 불러올 때 기본값으로 채움 */
  readonly winter: WinterState;
  /** 생산 분자 이월 (벌목 목재, food와 같은 고정 소수점) */
  readonly work: { readonly woodCarry: number };
}
// 벌목장 B02 (온돌 UI v0.4 표): 정원6 · 목재18/일 → 1단계 초기 배치 4명 = 하루 12, 낮 9~18시에만
export const LOGGING = { woodPerDay: 12, from: 9, to: 18 } as const;
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
    winter: createWinterState(citizens.map((c) => c.id)),
    work: { woodCarry: 0 },
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
    value.citizens.length > 600
  )
    fail();
  number(value.day, 1, 100_000, true);
  number(value.minute, 0, 1439, true);
  number(value.tickRemainder, 0, 999, true);
  number(value.optimism, 0, 100);
  number(value.pessimism, 0, 100);
  const resources = {} as Record<ResourceId, number>;
  for (const id of RESOURCE_IDS) {
    const amount = value.resources[id];
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
  const ids = new Set<string>();
  const citizens = value.citizens.map((p): Citizen => {
    if (!isRecord(p) || p.age !== "adult" || typeof p.alive !== "boolean")
      fail();
    text(p.id);
    text(p.species);
    const definition = rules.population.find((x) => x.species === p.species);
    if (!definition || p.diet !== definition.diet || ids.has(p.id)) fail();
    ids.add(p.id);
    return {
      id: p.id,
      species: p.species,
      diet: p.diet as FoodId,
      age: "adult",
      alive: p.alive,
    };
  });
  const buildings = value.buildings.map((b): PlayBuilding => {
    if (!isRecord(b) || b.type !== "ondol-nest" || !isRecord(b.position))
      fail();
    text(b.id);
    if (ids.has(b.id)) fail();
    ids.add(b.id);
    number(b.headingRadians, -Math.PI * 2, Math.PI * 2);
    const p = b.position;
    number(p.x, -9, 9);
    number(p.y, -9, 9);
    number(p.z, -9, 9);
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
    buildings,
    resources,
    foodCarry: carry,
    unmet,
    optimism: value.optimism,
    pessimism: value.pessimism,
    winter: (() => {
      try {
        return parseWinterState(
          value.winter,
          citizens.map((c) => c.id),
        );
      } catch {
        fail();
      }
    })(),
    work: (() => {
      const w = isRecord(value.work) ? value.work : { woodCarry: 0 };
      number(w.woodCarry, 0, Number.MAX_SAFE_INTEGER, true);
      return { woodCarry: w.woodCarry };
    })(),
  };
}
export function dailyFoodDemand(
  state: PlayState,
  rules: RuleSet = GAME_RULES,
): Record<FoodId, number> {
  const demand = { RES_PLANT: 0, RES_MEAT: 0, RES_FISH: 0 };
  for (const c of state.citizens)
    if (c.alive)
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
  // 절기·온돌·체온: 정시 경계에서 끊어 1시간 이하씩 (불때기 시간표가 시각마다 맞게)
  let winter = state.winter;
  let citizens = state.citizens;
  let optimism = state.optimism;
  let pessimism = state.pessimism;
  let wDay = state.day;
  let wMinute = state.minute;
  let woodCarry = state.work.woodCarry;
  const workMinutes = (LOGGING.to - LOGGING.from) * 60;
  let left = minutes;
  while (left > 0) {
    const hour = Math.floor(wMinute / 60);
    const logging = hour >= LOGGING.from && hour < LOGGING.to;
    // 벌목 중에는 매분 난방 후 생산: 그 목재는 다음 분부터 연료로 쓸 수 있다.
    const chunk = logging ? 1 : Math.min(left, 60 - (wMinute % 60));
    const r = stepWinter({
      winter,
      day: wDay,
      minute: wMinute,
      minutes: chunk,
      coal: resources.RES_COAL,
      wood: resources.RES_WOOD,
      // ponytail: 공사·연구 예약 목재 연결 전이라 0 — 예약 장부가 생기면 여기로 넘김
      reservedWood: 0,
      scale: AMOUNT_SCALE,
      citizens,
    });
    winter = r.winter;
    resources.RES_COAL -= r.coalUsed;
    resources.RES_WOOD -= r.woodUsed;
    if (r.deaths.length) {
      const dead = new Set(r.deaths);
      citizens = citizens.map((c) =>
        dead.has(c.id) ? { ...c, alive: false } : c,
      );
    }
    // 벌목: 일하는 시각에만 목재가 쌓임
    if (logging) {
      // ponytail: 벌목꾼 4명이 늘 일한다고 봄 — 일손 배치·부상과 연결되면 인원 비례로
      const n = LOGGING.woodPerDay * AMOUNT_SCALE * chunk + woodCarry;
      resources.RES_WOOD += Math.floor(n / workMinutes);
      woodCarry = n % workMinutes;
    }
    pessimism = Math.min(100, Math.max(0, pessimism + r.pessimismDelta));
    optimism = Math.min(100, Math.max(0, optimism + r.optimismDelta));
    wMinute += chunk;
    if (wMinute >= rules.time.minutesPerDay) {
      wMinute -= rules.time.minutesPerDay;
      wDay += 1;
    }
    left -= chunk;
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
    citizens,
    optimism,
    pessimism,
    winter,
    work: { woodCarry },
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
export interface OutcomeFacts {
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
  if (
    (f.pessimism >= rules.endings.evictionPessimism &&
      f.pessimismExtremeMinutes >= rules.endings.evictionMinutes) ||
    (f.optimism <= rules.endings.evictionOptimism &&
      f.optimismZeroMinutes >= rules.endings.evictionMinutes) ||
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
