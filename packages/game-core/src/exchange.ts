import type { LaborState } from "./labor.js";
import { isRecord } from "./save.js";
import { TIMBER_RULES, TimberError } from "./timber.js";

// 체험 전용 개발값. 본편의 조달 조건을 확정하지 않는다.
export const EXCHANGE_RULES = {
  quantity: 4,
  extraIron: 1,
  returnMinutes: 90,
  redeliveryMinutes: 90,
  inspectionMinutes: 120,
  workers: 1,
} as const;
// 일손/목재 저장 형식의 기존 시간 범위와 같은 상한이다.
const MAX_ELAPSED_MINUTES = 14400;
const EXCHANGE_MINUTES =
  EXCHANGE_RULES.returnMinutes +
  EXCHANGE_RULES.redeliveryMinutes +
  EXCHANGE_RULES.inspectionMinutes;
function requireTime(elapsed: number, duration: number) {
  if (elapsed + duration > MAX_ELAPSED_MINUTES)
    fail(
      "남은 저장 시간 범위 안에 교환 작업을 마칠 수 없습니다. 기존 진행과 예약은 유지됩니다.",
    );
}
export type ExchangePhase =
  | "none"
  | "reserved"
  | "returning"
  | "delivering"
  | "arrived"
  | "inspecting"
  | "checked"
  | "completed";
export interface ExchangeState {
  readonly phase: ExchangePhase;
  readonly requestedAt: number | null;
  readonly departure: number | null;
  readonly inspectionStart: number | null;
  readonly receivedAt: number | null;
}
export type ExchangeCommand = {
  type:
    | "exchange-request"
    | "exchange-cancel"
    | "exchange-depart"
    | "exchange-inspect"
    | "exchange-receive";
};
export function emptyExchange(): ExchangeState {
  return {
    phase: "none",
    requestedAt: null,
    departure: null,
    inspectionStart: null,
    receivedAt: null,
  };
}
function fail(
  message = "교환 저장의 물량·담당·시각이 올바르지 않습니다. 현재 진행과 원본은 유지됩니다.",
): never {
  throw new TimberError(message);
}
export function exchangeLocked(e: ExchangeState) {
  return [
    "reserved",
    "returning",
    "delivering",
    "arrived",
    "inspecting",
  ].includes(e.phase);
}
export function exchangeDue(e: ExchangeState): number | null {
  if (e.phase === "returning" && e.departure !== null)
    return e.departure + EXCHANGE_RULES.returnMinutes;
  if (e.phase === "delivering" && e.departure !== null)
    return (
      e.departure +
      EXCHANGE_RULES.returnMinutes +
      EXCHANGE_RULES.redeliveryMinutes
    );
  if (e.phase === "inspecting" && e.inspectionStart !== null)
    return e.inspectionStart + EXCHANGE_RULES.inspectionMinutes;
  return null;
}
export function parseExchange(v: unknown): ExchangeState {
  if (
    !isRecord(v) ||
    ![
      "none",
      "reserved",
      "returning",
      "delivering",
      "arrived",
      "inspecting",
      "checked",
      "completed",
    ].includes(v.phase as string)
  )
    fail();
  for (const key of [
    "requestedAt",
    "departure",
    "inspectionStart",
    "receivedAt",
  ] as const) {
    const n = v[key];
    if (
      n !== null &&
      (typeof n !== "number" ||
        !Number.isSafeInteger(n) ||
        n < 0 ||
        n > MAX_ELAPSED_MINUTES)
    )
      fail();
  }
  return {
    phase: v.phase as ExchangePhase,
    requestedAt: v.requestedAt as number | null,
    departure: v.departure as number | null,
    inspectionStart: v.inspectionStart as number | null,
    receivedAt: v.receivedAt as number | null,
  };
}
export function laborIron(s: LaborState) {
  return (
    s.timber.iron -
    (s.exchange.departure === null ? 0 : EXCHANGE_RULES.extraIron)
  );
}
export function laborReservedIron(s: LaborState) {
  return (
    s.timber.reservedIron +
    (s.exchange.phase === "reserved" ? EXCHANGE_RULES.extraIron : 0)
  );
}
/** 기본 원장의 미해결4를 물리적 위치로 한 번만 투영한다. 저장 물량을 복사하지 않는다. */
export function laborStock(s: LaborState) {
  const stock = { ...s.timber.stock, transit: 0 };
  if (
    ["returning", "delivering", "arrived", "inspecting", "checked"].includes(
      s.exchange.phase,
    )
  ) {
    stock.quarantine -= EXCHANGE_RULES.quantity;
    if (["returning", "delivering"].includes(s.exchange.phase))
      stock.transit = EXCHANGE_RULES.quantity;
    else if (s.exchange.phase === "checked")
      stock.checked += EXCHANGE_RULES.quantity;
    else stock.waiting += EXCHANGE_RULES.quantity;
  }
  return stock;
}
export function validateExchange(s: LaborState) {
  const e = s.exchange,
    t = s.timber,
    assigned = s.crew.filter((c) => c.job === "exchange").length;
  if (assigned !== (exchangeLocked(e) ? 1 : 0)) fail();
  if (e.phase === "none") {
    if (
      e.requestedAt !== null ||
      e.departure !== null ||
      e.inspectionStart !== null ||
      e.receivedAt !== null
    )
      fail();
    return;
  }
  const earliest =
    (t.departure ?? s.elapsed) +
    TIMBER_RULES.offers.A.travel +
    TIMBER_RULES.inspectionMinutes;
  if (
    t.offer !== "A" ||
    s.repairProgress !== 0 ||
    s.crew.some((c) => c.job === "repair") ||
    e.requestedAt === null ||
    e.requestedAt < earliest ||
    e.requestedAt > s.elapsed
  )
    fail();
  if (e.phase === "completed") {
    if (
      !["ready", "completed"].includes(t.phase) ||
      t.stock.quarantine !== 0 ||
      e.receivedAt === null ||
      e.receivedAt > t.elapsed
    )
      fail();
  } else if (
    t.phase !== "received" ||
    t.stock.quarantine !== EXCHANGE_RULES.quantity
  )
    fail();
  if (e.phase === "reserved") {
    if (
      e.departure !== null ||
      e.inspectionStart !== null ||
      e.receivedAt !== null ||
      laborReservedIron(s) > laborIron(s)
    )
      fail();
    return;
  }
  if (
    e.departure === null ||
    e.departure < e.requestedAt ||
    e.departure > s.elapsed ||
    laborIron(s) < 0
  )
    fail();
  if (e.departure + EXCHANGE_MINUTES > MAX_ELAPSED_MINUTES) fail();
  const returned = e.departure + EXCHANGE_RULES.returnMinutes,
    arrived = returned + EXCHANGE_RULES.redeliveryMinutes;
  if (e.phase === "returning" && s.elapsed >= returned) fail();
  if (
    e.phase === "delivering" &&
    (s.elapsed < returned || s.elapsed >= arrived)
  )
    fail();
  if (
    ["arrived", "inspecting", "checked", "completed"].includes(e.phase) &&
    s.elapsed < arrived
  )
    fail();
  if (["reserved", "returning", "delivering", "arrived"].includes(e.phase)) {
    if (e.inspectionStart !== null || e.receivedAt !== null) fail();
  } else {
    if (
      e.inspectionStart === null ||
      e.inspectionStart < arrived ||
      e.inspectionStart > s.elapsed
    )
      fail();
    const checked = e.inspectionStart + EXCHANGE_RULES.inspectionMinutes;
    if (checked > MAX_ELAPSED_MINUTES) fail();
    if (e.phase === "inspecting" && s.elapsed >= checked) fail();
    if (["checked", "completed"].includes(e.phase) && s.elapsed < checked)
      fail();
    if (e.phase === "completed") {
      if (e.receivedAt === null || e.receivedAt < checked) fail();
    } else if (e.receivedAt !== null) fail();
  }
  const total = Object.values(laborStock(s)).reduce((a, b) => a + b, 0);
  if (total !== 20) fail();
}
export function advanceExchange(
  s: LaborState,
): { state: LaborState; text: string } | null {
  const e = s.exchange;
  if (exchangeDue(e) !== s.elapsed) return null;
  if (e.phase === "returning")
    return {
      state: { ...s, exchange: { ...e, phase: "delivering" } },
      text: "불량4 공급처 회수 완료. 교환품4 재납품 수레가 출발했습니다.",
    };
  if (e.phase === "delivering")
    return {
      state: { ...s, exchange: { ...e, phase: "arrived" } },
      text: "교환품4 도착. 재검수 전에는 사용할 수 없습니다.",
    };
  if (e.phase === "inspecting")
    return {
      state: {
        ...s,
        exchange: { ...e, phase: "checked" },
        crew: s.crew.map((c) =>
          c.job === "exchange" ? { ...c, job: "idle" as const } : c,
        ),
      },
      text: "교환품4 재검수 합격. 담당자는 복귀했고 수령 확인을 기다립니다.",
    };
  return null;
}
export function commandExchange(
  s: LaborState,
  c: ExchangeCommand,
): { state: LaborState; text: string } {
  const e = s.exchange;
  if (c.type === "exchange-request") {
    if (
      e.phase !== "none" ||
      s.timber.phase !== "received" ||
      s.repairProgress !== 0 ||
      s.crew.some((w) => w.job === "repair")
    )
      fail(
        "보완을 진행하지 않은 격리4만 교환할 수 있습니다. 보완 담당을 먼저 대기로 옮기세요.",
      );
    requireTime(s.elapsed, EXCHANGE_MINUTES);
    const worker = s.crew.find((w) => w.job === "idle");
    if (!worker) fail("교환·재검수 담당1명을 먼저 확보하세요.");
    if (laborIron(s) - laborReservedIron(s) < EXCHANGE_RULES.extraIron)
      fail("교환 운송에 필요한 철재1이 부족합니다.");
    return {
      state: {
        ...s,
        exchange: {
          ...emptyExchange(),
          phase: "reserved",
          requestedAt: s.elapsed,
        },
        crew: s.crew.map((w) =>
          w.id === worker.id ? { ...w, job: "exchange" as const } : w,
        ),
      },
      text: "격리4 교환 요청. 추가 철재1과 담당1명을 예약했습니다. 출발 전 취소할 수 있습니다.",
    };
  }
  if (c.type === "exchange-cancel") {
    if (e.phase !== "reserved") fail("교환은 출발 전에만 취소할 수 있습니다.");
    return {
      state: {
        ...s,
        exchange: emptyExchange(),
        crew: s.crew.map((w) =>
          w.job === "exchange" ? { ...w, job: "idle" as const } : w,
        ),
      },
      text: "교환 예약을 취소했습니다. 철재와 담당 예약만 해제했습니다.",
    };
  }
  if (c.type === "exchange-depart") {
    if (e.phase !== "reserved")
      fail("교환 요청 후 한 번만 출발할 수 있습니다.");
    requireTime(s.elapsed, EXCHANGE_MINUTES);
    return {
      state: {
        ...s,
        exchange: { ...e, phase: "returning", departure: s.elapsed },
      },
      text: "불량4 회수 수레 출발. 추가 철재1을 지불했습니다. 출발 후 취소할 수 없습니다.",
    };
  }
  if (c.type === "exchange-inspect") {
    if (e.phase !== "arrived")
      fail("재납품 도착 후 한 번만 재검수를 시작할 수 있습니다.");
    requireTime(s.elapsed, EXCHANGE_RULES.inspectionMinutes);
    return {
      state: {
        ...s,
        exchange: { ...e, phase: "inspecting", inspectionStart: s.elapsed },
      },
      text: "교환품4 전량 재검수 시작. 완료 뒤 수령 확인이 필요합니다.",
    };
  }
  if (c.type === "exchange-receive") {
    if (e.phase !== "checked")
      fail("재검수에 합격한 교환품4만 한 번 수령할 수 있습니다.");
    const text =
      "교환품4 수령 확인. 격리/교환 대기에서 해제해 사용 가능 목재로 옮겼습니다.";
    const t = s.timber;
    return {
      state: {
        ...s,
        exchange: { ...e, phase: "completed", receivedAt: s.elapsed },
        timber: {
          ...t,
          phase: "ready",
          stock: {
            ...t.stock,
            quarantine: 0,
            available: t.stock.available + EXCHANGE_RULES.quantity,
          },
          history: [
            ...t.history,
            { id: t.history.length, minute: s.elapsed, text },
          ],
        },
      },
      text,
    };
  }
  return fail("지원하지 않는 교환 명령입니다.");
}
