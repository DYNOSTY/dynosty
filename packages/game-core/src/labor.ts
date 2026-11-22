import {
  advanceExchange,
  commandExchange,
  type ExchangeCommand,
  type ExchangeState,
  emptyExchange,
  exchangeDue,
  parseExchange,
  validateExchange,
} from "./exchange.js";
import {
  advanceTimber,
  commandTimber,
  createTimberState,
  parseTimberState,
  TIMBER_RULES,
  type TimberCommand,
  TimberError,
  type TimberState,
} from "./legacy-timber.js";
import { isRecord } from "./save.js";
import type { SceneSnapshot } from "./scene.js";
export const LABOR_RULES = {
  version: 1,
  workers: 4,
  prepOpensAt: 480,
  prepDeadline: 600,
  prepWork: 360,
  queueGroups: 3,
  workPerGroup: 120,
  repairWorkers: 2,
  repairMinutes: 240,
  assignmentTravelMinutes: 0,
} as const;
export const CREW_IDS = ["crew-1", "crew-2", "crew-3", "crew-4"] as const;
export type CrewId = (typeof CREW_IDS)[number];
export type CrewJob = "idle" | "carrier" | "repair" | "prep" | "exchange";
export const CREW_JOB_NAMES = {
  idle: "대기",
  carrier: "운송·검사",
  exchange: "교환·재검수",
  repair: "목재 보완",
  prep: "배급 준비",
} as const;
export interface LaborState {
  readonly version: 2;
  readonly exchange: ExchangeState;
  readonly elapsed: number;
  readonly paused: boolean;
  readonly speed: 1 | 3;
  readonly remainder: number;
  readonly timber: TimberState;
  readonly crew: readonly { readonly id: CrewId; readonly job: CrewJob }[];
  readonly repairProgress: number;
  readonly prepProgress: number;
  readonly prepCompletedAt: number | null;
  readonly processed: readonly string[];
  readonly history: readonly {
    readonly id: number;
    readonly minute: number;
    readonly text: string;
  }[];
}
export type LaborCommand =
  | ExchangeCommand
  | { type: "timber"; command: TimberCommand }
  | { type: "assign"; worker: CrewId; job: "repair" | "prep" }
  | {
      type: "move";
      worker: CrewId;
      from: CrewJob;
      to: "idle" | "repair" | "prep";
    }
  | { type: "advance"; minutes: number }
  | { type: "next" | "restart" }
  | { type: "pause"; paused: boolean }
  | { type: "speed"; speed: 1 | 3 };
const LOCKED = ["contracted", "transport", "arrived", "inspecting"];
function fail(
  message = "일손 배치 저장이 올바르지 않습니다. 현재 진행과 원본은 유지됩니다.",
): never {
  throw new TimberError(message);
}
function num(v: unknown, max = 14400): asserts v is number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0 || v > max)
    fail();
}
export function countCrew(s: LaborState, job: CrewJob) {
  return s.crew.filter((c) => c.job === job).length;
}
export function laborFinished(s: LaborState) {
  return s.timber.phase === "completed" && s.prepProgress === 360;
}
export function queueRemaining(s: LaborState) {
  return Math.ceil((360 - s.prepProgress) / 120);
}
export function createLaborState(): LaborState {
  return {
    version: 2,
    exchange: emptyExchange(),
    elapsed: 0,
    paused: true,
    speed: 1,
    remainder: 0,
    timber: createTimberState(),
    crew: CREW_IDS.map((id) => ({ id, job: "idle" })),
    repairProgress: 0,
    prepProgress: 0,
    prepCompletedAt: null,
    processed: [],
    history: [
      {
        id: 0,
        minute: 0,
        text: "목재20과 배급 준비를 같은 일손4명으로 처리합니다. 배급 요청은8시간째 열립니다.",
      },
    ],
  };
}
export function parseLaborState(v: unknown): LaborState {
  if (isRecord(v) && v.version === 1) {
    if ("exchange" in v)
      fail(
        "이전 형식에 지원하지 않는 교환 정보가 있습니다. 원본을 유지합니다.",
      );
    return parseLaborState({ ...v, version: 2, exchange: emptyExchange() });
  }
  if (
    !isRecord(v) ||
    v.version !== 2 ||
    typeof v.paused !== "boolean" ||
    (v.speed !== 1 && v.speed !== 3) ||
    !Array.isArray(v.crew) ||
    v.crew.length !== 4 ||
    !Array.isArray(v.history) ||
    !Array.isArray(v.processed)
  )
    fail();
  num(v.elapsed);
  num(v.remainder, 999);
  num(v.repairProgress, 240);
  num(v.prepProgress, 360);
  if (v.prepCompletedAt !== null) num(v.prepCompletedAt);
  const timber = parseTimberState(v.timber);
  if (
    !timber.paused ||
    timber.remainder !== 0 ||
    (timber.phase === "completed"
      ? timber.elapsed > v.elapsed
      : timber.elapsed !== v.elapsed)
  )
    fail("일손과 목재의 시간축이 일치하지 않습니다.");
  const ids = new Set<string>();
  for (const c of v.crew) {
    if (
      !isRecord(c) ||
      !CREW_IDS.includes(c.id as CrewId) ||
      ids.has(c.id as string) ||
      !["idle", "carrier", "repair", "prep", "exchange"].includes(
        c.job as string,
      )
    )
      fail("일손 식별값·중복 배정이 올바르지 않습니다.");
    ids.add(c.id as string);
  }
  if (
    v.processed.length > 2000 ||
    new Set(v.processed).size !== v.processed.length ||
    v.processed.some((x) => typeof x !== "string" || !x || x.length > 100) ||
    v.history.length < 1 ||
    v.history.length > 2000
  )
    fail();
  let previous = 0;
  for (const [i, h] of v.history.entries()) {
    if (
      !isRecord(h) ||
      h.id !== i ||
      typeof h.text !== "string" ||
      h.text.length > 250
    )
      fail();
    num(h.minute);
    if (h.minute < previous || h.minute > v.elapsed) fail();
    previous = h.minute;
  }
  const s = {
    ...JSON.parse(JSON.stringify(v)),
    timber,
    exchange: parseExchange(v.exchange),
  } as LaborState;
  validateExchange(s);
  // 현재 인원 배치와 무관한 물리적 상한. 중단/재배치 이력을 보존해도 이를 넘을 수 없다.
  const prepCapacity =
    Math.max(0, s.elapsed - LABOR_RULES.prepOpensAt) * LABOR_RULES.workers;
  const repairCapacity = Math.max(
    0,
    s.elapsed -
      (timber.departure ?? s.elapsed) -
      (timber.offer ? TIMBER_RULES.offers[timber.offer].travel : 0) -
      TIMBER_RULES.inspectionMinutes,
  );
  if (s.prepProgress > prepCapacity || s.repairProgress > repairCapacity)
    fail(
      "경과 시간으로 불가능한 작업 진행량입니다. 현재 진행과 원본은 유지됩니다.",
    );
  const carrier = countCrew(s, "carrier"),
    repair = countCrew(s, "repair"),
    prep = countCrew(s, "prep");
  if (carrier !== (LOCKED.includes(timber.phase) ? 1 : 0) || repair > 2)
    fail("일손 예약이 작업 상태와 일치하지 않습니다.");
  if (
    (s.elapsed < 480 && (prep > 0 || s.prepProgress > 0)) ||
    (s.prepProgress === 360
      ? s.prepCompletedAt === null || prep !== 0
      : s.prepCompletedAt !== null)
  )
    fail("배급 준비 진행이나 완료 기록이 올바르지 않습니다.");
  if (
    s.prepCompletedAt !== null &&
    (s.prepCompletedAt > s.elapsed || s.prepCompletedAt < 570)
  )
    fail();
  if (timber.offer !== "A" && (repair > 0 || s.repairProgress !== 0)) fail();
  if (["received", "repairing"].includes(timber.phase)) {
    if (
      s.repairProgress >= 240 ||
      (repair === 2) !== (timber.phase === "repairing") ||
      (repair === 2 && timber.due !== s.elapsed + 240 - s.repairProgress)
    )
      fail("목재 보완의 배정·진행·종료 시각이 일치하지 않습니다.");
  } else {
    if (repair !== 0) fail("지금은 목재 보완에 배정할 수 없습니다.");
    const expected =
      timber.offer === "A" &&
      s.exchange.phase !== "completed" &&
      ["ready", "completed"].includes(timber.phase)
        ? 240
        : 0;
    if (s.repairProgress !== expected)
      fail("목재 보완 진행이 올바르지 않습니다.");
  }
  if (laborFinished(s) && !s.paused) fail();
  return s;
}
function note(s: LaborState, text: string): LaborState {
  return {
    ...s,
    history: [...s.history, { id: s.history.length, minute: s.elapsed, text }],
  };
}
function synchronize(s: LaborState): LaborState {
  let t = s.timber;
  if (["received", "repairing"].includes(t.phase)) {
    const active = countCrew(s, "repair") === 2;
    t = {
      ...t,
      phase: active ? "repairing" : "received",
      workers: active ? 2 : 0,
      due: active ? s.elapsed + 240 - s.repairProgress : null,
    };
  }
  return { ...s, timber: { ...t, paused: true, remainder: 0 } };
}
export function laborNextAt(s: LaborState): number | null {
  const times: number[] = [];
  if (s.elapsed < 480) times.push(480);
  if (s.timber.due !== null) times.push(s.timber.due);
  const exchange = exchangeDue(s.exchange);
  if (exchange !== null) times.push(exchange);
  const prep = countCrew(s, "prep");
  if (prep > 0 && s.prepProgress < 360)
    times.push(s.elapsed + Math.ceil((360 - s.prepProgress) / prep));
  return times.length ? Math.min(...times) : null;
}
export function advanceLabor(input: LaborState, minutes: number): LaborState {
  const s = parseLaborState(input);
  num(minutes, 1440);
  if (laborFinished(s)) return s;
  const boundary = laborNextAt(s),
    target = Math.min(14400, s.elapsed + minutes, boundary ?? 14400),
    delta = target - s.elapsed;
  if (delta === 0) return s;
  const timber =
    s.timber.phase === "completed" ? s.timber : advanceTimber(s.timber, delta);
  const repairProgress =
    s.repairProgress + (s.timber.phase === "repairing" ? delta : 0);
  const prepProgress = Math.min(
    360,
    s.prepProgress + countCrew(s, "prep") * delta,
  );
  const prepDone = s.prepProgress < 360 && prepProgress === 360;
  const returnedCarrier =
    LOCKED.includes(s.timber.phase) && !LOCKED.includes(timber.phase);
  const repaired = s.timber.phase === "repairing" && timber.phase === "ready";
  const crew = s.crew.map((c) => ({
    ...c,
    job:
      (returnedCarrier && c.job === "carrier") ||
      (repaired && c.job === "repair") ||
      (prepDone && c.job === "prep")
        ? ("idle" as const)
        : c.job,
  }));
  let n: LaborState = {
    ...s,
    elapsed: target,
    timber,
    crew,
    repairProgress,
    prepProgress,
    prepCompletedAt: prepDone ? target : s.prepCompletedAt,
  };
  const exchangeEvent = advanceExchange(n);
  if (exchangeEvent) n = note(exchangeEvent.state, exchangeEvent.text);
  if (s.elapsed < 480 && target === 480)
    n = note(
      n,
      "배급소에 대기3무리가 생겼습니다.10시간까지 정리를 준비하세요.",
    );
  if (timber.phase !== s.timber.phase)
    n = note(
      n,
      timber.history.at(-1)?.text ?? "목재 작업 상태가 바뀌었습니다.",
    );
  if (prepDone)
    n = note(
      n,
      `배급 준비 완료. 대기 줄이 해소됐습니다.${target <= 600 ? " 기한 충족." : ` ${target - 600}분 지연.`}`,
    );
  const event = target === boundary;
  n = synchronize({
    ...n,
    paused: event || target === 14400 || laborFinished(n) ? true : s.paused,
    remainder: event ? 0 : s.remainder,
  });
  return parseLaborState(n);
}
function assign(
  s: LaborState,
  id: CrewId,
  to: "idle" | "repair" | "prep",
  from: CrewJob,
): LaborState {
  const worker = s.crew.find((c) => c.id === id);
  if (!worker || worker.job !== from)
    fail("배정 상태가 바뀌었습니다. 최신 일손 현황을 확인하세요.");
  if (from === "exchange")
    fail(
      "교환·재검수 담당은 작업 완료 또는 출발 전 취소까지 재배치할 수 없습니다.",
    );
  if (from === "carrier")
    fail("운송·검사 예약자는 작업이 끝날 때까지 재배치할 수 없습니다.");
  if (to === from) fail("이미 같은 작업에 배정돼 있습니다.");
  if (
    to === "repair" &&
    (s.exchange.phase !== "none" ||
      !["received", "repairing"].includes(s.timber.phase) ||
      s.timber.stock.quarantine !== 4 ||
      countCrew(s, "repair") >= 2)
  )
    fail("목재 보완은 격리된4와 최대 일손2명이 필요합니다.");
  if (to === "prep" && (s.elapsed < 480 || s.prepProgress === 360))
    fail("배급 준비 요청이 아직 없거나 이미 완료됐습니다.");
  const crew = s.crew.map((c) => (c.id === id ? { ...c, job: to } : c));
  return synchronize(
    note(
      { ...s, crew },
      `${id.replace("crew-", "일손 ")} 배치: ${CREW_JOB_NAMES[from]} → ${CREW_JOB_NAMES[to]}. 기존 진행은 유지됩니다.`,
    ),
  );
}
export function commandLabor(
  input: LaborState,
  command: LaborCommand,
  id: string,
): LaborState {
  const s = parseLaborState(input);
  if (!id || id.length > 100) fail("명령 식별값이 올바르지 않습니다.");
  if (s.processed.includes(id)) return s;
  if (command.type === "restart")
    return { ...createLaborState(), processed: [id] };
  if (s.processed.length >= 1999)
    fail("처리 이력이 가득 찼습니다. 저장 후 다시 시작하세요.");
  let n = s;
  switch (command.type) {
    case "exchange-request":
    case "exchange-cancel":
    case "exchange-depart":
    case "exchange-inspect":
    case "exchange-receive": {
      const result = commandExchange(s, command);
      n = note(result.state, result.text);
      break;
    }
    case "assign": {
      const worker = s.crew.find((c) => c.id === command.worker);
      if (worker?.job !== "idle")
        fail("이미 배정된 일손입니다. 재배치를 사용하세요.");
      n = assign(s, command.worker, command.job, "idle");
      break;
    }
    case "move":
      n = assign(s, command.worker, command.to, command.from);
      break;
    case "timber": {
      const c = command.command;
      if (["advance", "next", "pause", "speed", "restart"].includes(c.type))
        fail("공용 시간 조작을 사용하세요.");
      if (c.type === "repair") {
        if (s.exchange.phase !== "none")
          fail("교환 진행 중에는 현장 보완을 중복할 수 없습니다.");
        if (s.timber.phase !== "received")
          fail("목재를 수령한 뒤 보완할 수 있습니다.");
        const needed = 2 - countCrew(s, "repair"),
          idle = s.crew.filter((w) => w.job === "idle").slice(0, needed);
        if (idle.length < needed)
          fail(
            "보완 일손2명을 확보하세요. 다른 작업에서 재배치할 수 있습니다.",
          );
        for (const w of idle) n = assign(n, w.id, "repair", "idle");
        break;
      }
      if (c.type === "contract" && countCrew(s, "idle") < 1)
        fail("운송·검사 일손1명을 먼저 확보하세요.");
      const before = s.timber.phase;
      const timber = commandTimber(s.timber, c, id);
      let crew = s.crew;
      if (c.type === "contract") {
        const idle = s.crew.find((w) => w.job === "idle");
        if (!idle) fail();
        crew = s.crew.map((w) =>
          w.id === idle.id ? { ...w, job: "carrier" as const } : w,
        );
      }
      if (c.type === "cancel")
        crew = s.crew.map((w) =>
          w.job === "carrier" ? { ...w, job: "idle" as const } : w,
        );
      n = { ...s, timber, crew };
      if (before !== timber.phase)
        n = note(n, timber.history.at(-1)?.text ?? "목재 작업 변경");
      break;
    }
    case "advance":
      n = advanceLabor(s, command.minutes);
      break;
    case "next": {
      const next = laborNextAt(s);
      if (next === null)
        fail("진행 중인 작업이 없습니다. 일손을 먼저 배치하세요.");
      n = advanceLabor(s, next - s.elapsed);
      break;
    }
    case "pause":
      if (typeof command.paused !== "boolean") fail();
      n = {
        ...s,
        paused: laborFinished(s) ? true : command.paused,
        remainder: 0,
      };
      break;
    case "speed":
      if (command.speed !== 1 && command.speed !== 3) fail();
      n = { ...s, speed: command.speed };
      break;
    default:
      fail("지원하지 않는 일손 명령입니다.");
  }
  const decision = !["advance", "next", "pause", "speed"].includes(
    command.type,
  );
  return parseLaborState({
    ...n,
    paused: decision || laborFinished(n) ? true : n.paused,
    remainder: decision ? 0 : n.remainder,
    processed: [...n.processed, id],
  });
}
export function tickLabor(input: LaborState, elapsedMs: number): LaborState {
  const s = parseLaborState(input);
  num(elapsedMs, Number.MAX_SAFE_INTEGER);
  if (s.paused) return s;
  const numerator = Math.min(1000, elapsedMs) * s.speed + s.remainder;
  const n = advanceLabor(s, Math.floor(numerator / 1000));
  return { ...n, remainder: n.paused ? 0 : numerator % 1000 };
}
export interface LaborSave {
  readonly format: "dynosty-labor";
  readonly saveVersion: 2;
  readonly state: LaborState;
}
export function parseLaborSave(v: unknown): LaborSave {
  if (
    !isRecord(v) ||
    v.format !== "dynosty-labor" ||
    !isRecord(v.state) ||
    !(
      (v.saveVersion === 1 && v.state.version === 1) ||
      (v.saveVersion === 2 && v.state.version === 2)
    )
  )
    fail("지원하지 않는 일손 배치 저장입니다. 원본을 유지합니다.");
  return {
    format: "dynosty-labor",
    saveVersion: 2,
    state: parseLaborState(v.state),
  };
}
export function createLaborSave(state: LaborState): LaborSave {
  return parseLaborSave({ format: "dynosty-labor", saveVersion: 2, state });
}
export function laborScene(): SceneSnapshot {
  return {
    schemaVersion: 1,
    entities: [
      {
        id: "example-building-1",
        kind: "building",
        position: { x: 0, y: 0, z: -1 },
        headingRadians: Math.PI,
        visible: true,
        highlighted: false,
      },
    ],
  };
}
