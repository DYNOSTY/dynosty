// 기존 일손·교환 예제의 저장·정산을 보존한다. 마을 생활은 timber.ts를 사용한다.
import { isRecord } from "./save.js";
import type { SceneSnapshot } from "./scene.js";

export const TIMBER_RULES = {
  version: 1,
  requested: 20,
  deadline: 720,
  initialIron: 8,
  workers: 4,
  inspectionMinutes: 120,
  repairMinutes: 240,
  repairWorkers: 2,
  offers: {
    A: { cost: 4, travel: 360, wet: 4 },
    B: { cost: 6, travel: 600, wet: 0 },
  },
  // 체험판 전용 개발 선택. 본편의 미정 수치를 대신하지 않는다.
  minutesPerRealSecond: 1,
  transportInspectionWorkers: 1,
  useMinutes: 0,
} as const;
export type TimberOffer = keyof typeof TIMBER_RULES.offers;
export type TimberPhase =
  | "select"
  | "contracted"
  | "transport"
  | "arrived"
  | "inspecting"
  | "inspected"
  | "received"
  | "repairing"
  | "ready"
  | "completed";
export interface TimberState {
  readonly version: 1;
  readonly elapsed: number;
  readonly paused: boolean;
  readonly speed: 1 | 3;
  readonly remainder: number;
  readonly offer: TimberOffer | null;
  readonly phase: TimberPhase;
  readonly iron: number;
  readonly reservedIron: number;
  readonly workers: number;
  readonly departure: number | null;
  readonly due: number | null;
  readonly completedAt: number | null;
  readonly stock: {
    readonly waiting: number;
    readonly checked: number;
    readonly quarantine: number;
    readonly available: number;
    readonly allocated: number;
    readonly used: number;
  };
  readonly processed: readonly string[];
  readonly history: readonly {
    readonly id: number;
    readonly minute: number;
    readonly text: string;
  }[];
}
export type TimberCommand =
  | { type: "choose"; offer: TimberOffer }
  | {
      type:
        | "contract"
        | "cancel"
        | "depart"
        | "inspect"
        | "receive"
        | "repair"
        | "allocate"
        | "use"
        | "next"
        | "restart";
    }
  | { type: "advance"; minutes: number }
  | { type: "pause"; paused: boolean }
  | { type: "speed"; speed: 1 | 3 };
export class TimberError extends Error {}
function fail(message = "체험판 상태가 올바르지 않습니다."): never {
  throw new TimberError(message);
}
function num(v: unknown, max = 14400): asserts v is number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0 || v > max)
    fail("마을 저장 수치가 올바르지 않습니다.");
}
const PHASES: readonly string[] = [
  "select",
  "contracted",
  "transport",
  "arrived",
  "inspecting",
  "inspected",
  "received",
  "repairing",
  "ready",
  "completed",
];
export function createTimberState(): TimberState {
  return {
    version: 1,
    elapsed: 0,
    paused: true,
    speed: 1,
    remainder: 0,
    offer: null,
    phase: "select",
    iron: 8,
    reservedIron: 0,
    workers: 0,
    departure: null,
    due: null,
    completedAt: null,
    stock: {
      waiting: 0,
      checked: 0,
      quarantine: 0,
      available: 0,
      allocated: 0,
      used: 0,
    },
    processed: [],
    history: [
      {
        minute: 0,
        id: 0,
        text: "비가 새는 둥지: 마른 목재20을 12시간 안에 사용 준비하세요.",
      },
    ],
  };
}
export function parseTimberState(v: unknown): TimberState {
  if (
    !isRecord(v) ||
    v.version !== 1 ||
    typeof v.paused !== "boolean" ||
    ![1, 3].includes(v.speed as number) ||
    !PHASES.includes(v.phase as string) ||
    ![null, "A", "B"].includes(v.offer as null) ||
    !isRecord(v.stock) ||
    !Array.isArray(v.processed) ||
    !Array.isArray(v.history)
  )
    fail("지원하지 않는 마을 저장입니다. 기존 기록은 유지됩니다.");
  num(v.elapsed);
  num(v.remainder, 999);
  num(v.iron, 8);
  num(v.reservedIron, 8);
  num(v.workers, 4);
  for (const key of ["departure", "due", "completedAt"])
    if (v[key] !== null) num(v[key]);
  for (const key of [
    "waiting",
    "checked",
    "quarantine",
    "available",
    "allocated",
    "used",
  ])
    num(v.stock[key], 20);
  if (
    v.processed.length > 2000 ||
    new Set(v.processed).size !== v.processed.length ||
    v.processed.some((x) => typeof x !== "string" || !x || x.length > 100) ||
    v.history.length > 2000 ||
    v.history.length === 0
  )
    fail("체험판 처리 이력이 올바르지 않습니다.");
  let previous = 0;
  for (const [index, h] of v.history.entries()) {
    if (
      !isRecord(h) ||
      h.id !== index ||
      typeof h.text !== "string" ||
      h.text.length > 250
    )
      fail("체험판 이력이 올바르지 않습니다.");
    num(h.minute);
    if (h.minute < previous || h.minute > v.elapsed)
      fail("체험판 시간이 올바르지 않습니다.");
    previous = h.minute;
  }
  const s = JSON.parse(JSON.stringify(v)) as TimberState;
  const p = s.phase,
    st = s.stock,
    offer = s.offer ? TIMBER_RULES.offers[s.offer] : null;
  const delivered = !["select", "contracted", "transport"].includes(p);
  if (
    Object.values(st).reduce((a, b) => a + b, 0) !== (delivered ? 20 : 0) ||
    s.reservedIron > s.iron ||
    s.workers !==
      (["contracted", "transport", "arrived", "inspecting"].includes(p)
        ? 1
        : p === "repairing"
          ? 2
          : 0)
  )
    fail("체험판 재고·예약이 일치하지 않습니다.");
  if (p !== "select" && !offer) fail("계약 정보가 없습니다.");
  const minimumArrival = (s.departure ?? 0) + (offer?.travel ?? 0);
  if (p === "transport" && s.due !== minimumArrival)
    fail("운송 완료 시각이 일치하지 않습니다.");
  if (
    ["inspected", "received", "repairing", "ready", "completed"].includes(p) &&
    s.elapsed < minimumArrival + TIMBER_RULES.inspectionMinutes
  )
    fail("검사 시간을 건너뛸 수 없습니다.");
  if (
    ["ready", "completed"].includes(p) &&
    s.offer === "A" &&
    s.elapsed <
      minimumArrival +
        TIMBER_RULES.inspectionMinutes +
        TIMBER_RULES.repairMinutes
  )
    fail("보완 시간을 건너뛸 수 없습니다.");
  if (p === "inspecting" || p === "repairing") {
    const duration =
      p === "inspecting"
        ? TIMBER_RULES.inspectionMinutes
        : TIMBER_RULES.repairMinutes;
    const minimumEnd =
      minimumArrival +
      TIMBER_RULES.inspectionMinutes +
      (p === "repairing" ? TIMBER_RULES.repairMinutes : 0);
    if (s.due === null || s.due < minimumEnd || s.due > s.elapsed + duration)
      fail(
        "체험판 작업 종료 시각이 올바르지 않습니다. 기존 기록은 유지됩니다.",
      );
  }
  const spent = !["select", "contracted"].includes(p);
  if (
    s.iron !== (spent ? 8 - (offer?.cost ?? 0) : 8) ||
    s.reservedIron !== (p === "contracted" ? offer?.cost : 0)
  )
    fail("체험판 비용 이력이 일치하지 않습니다.");
  if (
    ["transport", "inspecting", "repairing"].includes(p) !== (s.due !== null) ||
    (s.due !== null && s.due <= s.elapsed)
  )
    fail("체험판 작업 시간이 올바르지 않습니다.");
  if (spent && (s.departure === null || s.departure > s.elapsed))
    fail("출발 시각이 올바르지 않습니다.");
  if (!spent && s.departure !== null) fail("출발 이력이 올바르지 않습니다.");
  if (delivered && s.elapsed < (s.departure ?? 0) + (offer?.travel ?? 0))
    fail("도착 시간이 올바르지 않습니다.");
  if (p === "arrived" || p === "inspecting") {
    if (st.waiting !== 20) fail("검사 대기 물량이 올바르지 않습니다.");
  } else if (st.waiting !== 0) fail("대기 물량이 올바르지 않습니다.");
  if (p === "inspected") {
    if (st.checked !== 20 - (offer?.wet ?? 0) || st.quarantine !== offer?.wet)
      fail("검사 결과가 올바르지 않습니다.");
  } else if (st.checked !== 0) fail("수령 물량이 올바르지 않습니다.");
  if (
    ["received", "repairing"].includes(p) &&
    (s.offer !== "A" ||
      st.quarantine !== 4 ||
      st.available + st.allocated !== 16)
  )
    fail("보완 물량이 올바르지 않습니다.");
  if (
    ["ready", "completed"].includes(p) &&
    (st.quarantine !== 0 || st.available + st.allocated + st.used !== 20)
  )
    fail("합격 물량이 올바르지 않습니다.");
  if (
    p === "completed"
      ? st.used !== 20 || s.completedAt !== s.elapsed || !s.paused
      : st.used !== 0 || s.completedAt !== null
  )
    fail("사용 완료 기록이 올바르지 않습니다.");
  return s;
}
function note(s: TimberState, text: string): TimberState {
  return {
    ...s,
    history: [...s.history, { id: s.history.length, minute: s.elapsed, text }],
  };
}
export function advanceTimber(
  input: TimberState,
  minutes: number,
): TimberState {
  const s = parseTimberState(input);
  num(minutes, 1440);
  if (s.phase === "completed") return s;
  const target = Math.min(14400, s.elapsed + minutes, s.due ?? 14400);
  let next = { ...s, elapsed: target };
  if (s.due !== null && target === s.due) {
    if (s.phase === "transport")
      next = {
        ...next,
        phase: "arrived",
        due: null,
        paused: true,
        remainder: 0,
        stock: { ...s.stock, waiting: 20 },
      };
    if (s.phase === "inspecting")
      next = {
        ...next,
        phase: "inspected",
        due: null,
        paused: true,
        remainder: 0,
        workers: 0,
        stock: {
          ...s.stock,
          waiting: 0,
          checked: 20 - TIMBER_RULES.offers[s.offer as TimberOffer].wet,
          quarantine: TIMBER_RULES.offers[s.offer as TimberOffer].wet,
        },
      };
    if (s.phase === "repairing")
      next = {
        ...next,
        phase: "ready",
        due: null,
        paused: true,
        remainder: 0,
        workers: 0,
        stock: { ...s.stock, quarantine: 0, available: s.stock.available + 4 },
      };
    return parseTimberState(
      note(
        next,
        s.phase === "transport"
          ? "수레 도착. 검사 전에는 사용할 수 없습니다."
          : s.phase === "inspecting"
            ? "전량 검사·수량 확인 완료. 합격분을 수령하세요."
            : "젖은 목재4 건조·재검사 합격. 일손2가 복귀했습니다.",
      ),
    );
  }
  if (target === 14400) next = { ...next, paused: true };
  return parseTimberState(next);
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
    fail("처리 이력이 가득 찼습니다. 저장한 뒤 새 체험을 시작하세요.");
  let n = s;
  const requirePhase = (...phases: TimberPhase[]) => {
    if (!phases.includes(s.phase))
      fail("지금은 이 작업을 할 수 없습니다. 현재 물품 상태를 확인하세요.");
  };
  const stock = s.stock;
  switch (command.type) {
    case "restart":
      return { ...createTimberState(), processed: [id] };
    case "choose":
      requirePhase("select");
      if (command.offer !== "A" && command.offer !== "B")
        fail("지원하지 않는 제안입니다.");
      n = { ...s, offer: command.offer, paused: true };
      break;
    case "contract": {
      requirePhase("select");
      if (!s.offer) fail("공급 제안을 먼저 선택하세요.");
      const o = TIMBER_RULES.offers[s.offer];
      if (s.iron - s.reservedIron < o.cost || 4 - s.workers < 1)
        fail("철재 또는 일손이 부족합니다.");
      n = note(
        {
          ...s,
          phase: "contracted",
          reservedIron: o.cost,
          workers: 1,
          paused: true,
        },
        `제안${s.offer} 약정: 철재${o.cost}와 운송·검사 일손1 예약.`,
      );
      break;
    }
    case "cancel":
      requirePhase("contracted");
      n = note(
        { ...s, phase: "select", reservedIron: 0, workers: 0 },
        "출발 전 약정 취소. 예약만 해제했습니다.",
      );
      break;
    case "depart": {
      requirePhase("contracted");
      const o = TIMBER_RULES.offers[s.offer as TimberOffer];
      n = note(
        {
          ...s,
          phase: "transport",
          iron: s.iron - o.cost,
          reservedIron: 0,
          departure: s.elapsed,
          due: s.elapsed + o.travel,
          paused: true,
        },
        "철재 지불·수레 출발. 운송 중 물량은 사용 재고가 아닙니다.",
      );
      break;
    }
    case "inspect":
      requirePhase("arrived");
      n = note(
        { ...s, phase: "inspecting", due: s.elapsed + 120, paused: true },
        "전량 품질 검사와 수량·수령 확인 시작: 2시간.",
      );
      break;
    case "receive":
      requirePhase("inspected");
      n = note(
        {
          ...s,
          phase: s.offer === "A" ? "received" : "ready",
          stock: { ...stock, available: stock.checked, checked: 0 },
        },
        `정상분${stock.checked} 수령. 불량분은 격리합니다.`,
      );
      break;
    case "repair":
      requirePhase("received");
      if (stock.quarantine !== 4 || 4 - s.workers < 2)
        fail("보완할 목재나 일손이 부족합니다.");
      n = note(
        {
          ...s,
          phase: "repairing",
          workers: 2,
          due: s.elapsed + 240,
          paused: true,
        },
        "일손2 배정. 젖은4 건조·재검사를 합쳐4시간.",
      );
      break;
    case "allocate":
      requirePhase("received", "repairing", "ready");
      if (stock.available === 0) fail("배분할 합격 목재가 없습니다.");
      n = note(
        {
          ...s,
          stock: {
            ...stock,
            available: 0,
            allocated: stock.allocated + stock.available,
          },
        },
        `정상 목재${stock.available}을 둥지에 배분했습니다.`,
      );
      break;
    case "use":
      requirePhase("ready");
      if (stock.allocated !== 20) fail("둥지에 마른 목재20을 먼저 배분하세요.");
      n = note(
        {
          ...s,
          phase: "completed",
          completedAt: s.elapsed,
          paused: true,
          stock: { ...stock, allocated: 0, used: 20 },
        },
        s.elapsed <= 720
          ? "사용 확인: 지붕 보수 준비 완료. 약정한 기한을 지켰습니다."
          : "사용 확인: 임시 쉼터를 거쳐 보수 준비를 마쳤습니다. 지연 원인은 기록됩니다.",
      );
      break;
    case "next":
      if (s.due === null) fail("진행 중인 운송·검사·보완이 없습니다.");
      n = advanceTimber(s, s.due - s.elapsed);
      break;
    case "advance":
      n = advanceTimber(s, command.minutes);
      break;
    case "pause":
      if (typeof command.paused !== "boolean")
        fail("정지 명령이 올바르지 않습니다.");
      n = {
        ...s,
        paused: s.phase === "completed" ? true : command.paused,
        remainder: 0,
      };
      break;
    case "speed":
      if (command.speed !== 1 && command.speed !== 3)
        fail("지원하지 않는 속도입니다.");
      n = { ...s, speed: command.speed };
      break;
    default:
      fail("지원하지 않는 마을 명령입니다.");
  }
  const decision = !["pause", "speed", "next", "advance"].includes(
    command.type,
  );
  return parseTimberState({
    ...n,
    paused: decision ? true : n.paused,
    remainder: decision ? 0 : n.remainder,
    processed: [...n.processed, id],
  });
}
export function tickTimber(input: TimberState, elapsedMs: number): TimberState {
  const s = parseTimberState(input);
  num(elapsedMs, Number.MAX_SAFE_INTEGER);
  if (s.paused) return s;
  const numerator = Math.min(1000, elapsedMs) * s.speed + s.remainder;
  const n = advanceTimber(s, Math.floor(numerator / 1000));
  return { ...n, remainder: n.paused ? 0 : numerator % 1000 };
}
export interface TimberSave {
  readonly format: "dynosty-timber";
  readonly saveVersion: 1;
  readonly state: TimberState;
}
export function parseTimberSave(v: unknown): TimberSave {
  if (!isRecord(v) || v.format !== "dynosty-timber" || v.saveVersion !== 1)
    fail("지원하지 않는 마을 저장입니다. 기존 기록은 유지됩니다.");
  return {
    format: "dynosty-timber",
    saveVersion: 1,
    state: parseTimberState(v.state),
  };
}
export function createTimberSave(state: TimberState): TimberSave {
  return parseTimberSave({ format: "dynosty-timber", saveVersion: 1, state });
}
export function timberScene(state: TimberState): SceneSnapshot {
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
      {
        id: "example-resident-1",
        kind: "resident",
        position:
          state.phase === "completed"
            ? { x: 0.3, y: 0, z: -2.1 }
            : { x: -2, y: 0, z: 1 },
        headingRadians: Math.PI,
        visible: true,
        motion: state.phase === "repairing" ? "walking" : "idle",
      },
    ],
  };
}
