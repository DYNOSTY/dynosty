// 캠페인 다섯 단계와 엔딩으로 가는 길 (시나리오기획서 2장·3장, 개발인계서 6장)
//   1 복홀의 첫 명령: 정찰 5회, 3차 정찰대 전멸 사건, 단서 C01
//   2 끊어진 길을 잇다: 교역 검수(story.ts trade)와 다섯 마을 사건, 단서 C02
//   3 붕괴하는 왕도 한양 + 충녕의 남하: 봉서(C03), 난민 수용, 신분 공개
//   4 함께 견디는 보름 혹한: 준비 15일 + 혹한 15일, 단서 C04, 연구 R17·R18
//   5 누굴 위한 복홀인가: 노선 선택 뒤 10일 → 엔딩 A·B (실패는 어느 단계에서든)
//
// 지금은 "얇게 끝까지" 판: 단계마다 사건 선택과 조건만 잇는다 (2026-11-22 사용자 "추천대로 ㄱ").
// 한양·호송은 새 무대 없이 복홀 화면 위의 사건으로 지나간다.
// ⚠ 사건의 수치(민심·자원·지연)와 연구 값·시간은 기획서에 없어 임시 값이다. 바꿀 땐 CAMPAIGN_RULES만 고친다.
// ponytail: 아직 없는 것 — 난민 합류로 인구가 느는 것, 혹한 15일의 실제 기온, 사건 뒤의 서사적 재등장(유가족 등)
import type { StorySide } from "./story.js";

const DAY = 1440;
type Delta = {
  readonly pessimism?: number;
  readonly optimism?: number;
  /** 자원 변화 (자원 이름 → 낱개 수, 음수 = 씀) */
  readonly resources?: Readonly<Record<string, number>>;
  /** 다음 단계로 넘어가기가 이만큼(분) 늦어짐 */
  readonly hold?: number;
  readonly clue?: string;
  readonly route?: "coexist" | "yangnyeong";
};
type EventRule = {
  readonly stage: number;
  /** 단계가 시작된 뒤 이만큼(분) 지나면 뜸 */
  readonly after?: number;
  /** 정찰대가 이만큼 돌아오면 뜸 */
  readonly scouts?: number;
  readonly a: Delta;
  /** 없으면 고를 것 없이 알리기만 하는 사건 */
  readonly b?: Delta;
};
export const CAMPAIGN_RULES = {
  scoutGoal: 5,
  /** 4단계: 준비와 혹한 (game-data.json campaign과 같은 값) */
  prepDays: 15,
  coldDays: 15,
  /** 4단계에 들어선 뒤 C04가 드러나기까지 */
  c04After: DAY,
  events: {
    // 1단계 · 3차 정찰대 전멸: 가 = 호위대를 보내 유품과 보고서 회수 / 나 = 추모 기록만
    lost: {
      stage: 1,
      scouts: 3,
      a: { pessimism: -5, hold: DAY },
      b: { pessimism: 5 },
    },
    // 2단계 · 다섯 마을: 가 = 먼저 식량을 보냄 / 나 = 거래를 미룸
    village: {
      stage: 2,
      after: DAY / 2,
      a: { optimism: 5, resources: { RES_PLANT: -20 } },
      b: { pessimism: 5 },
    },
    // 3단계 · 충녕이 봉서를 펴 보임 (고를 것 없음)
    letter: { stage: 3, after: DAY / 2, a: { clue: "C03" } },
    // 호송 · 굶주린 난민: 가 = 행렬에 받아들임 / 나 = 조금 나눠 주고 떠남
    refugee: {
      stage: 3,
      after: DAY,
      a: {
        optimism: 5,
        resources: { RES_PLANT: -15, RES_MEAT: -15, RES_FISH: -15 },
      },
      b: { pessimism: 3, resources: { RES_PLANT: -5 } },
    },
    // 호송 · 길목: 가 = 공주임을 밝힘 / 나 = 숨기고 돌아감
    identity: {
      stage: 3,
      after: DAY * 1.5,
      a: { pessimism: 3 },
      b: { hold: DAY },
    },
    // 5단계 · 통치 노선: 가 = 충녕(공존) / 나 = 양녕(통제)
    route: {
      stage: 5,
      after: DAY / 4,
      a: { pessimism: -10, optimism: 10, route: "coexist" },
      b: {
        pessimism: 15,
        resources: { RES_WOOD: 30, RES_METAL: 20 },
        route: "yangnyeong",
      },
    },
  } satisfies Record<string, EventRule>,
  /** 연구: 기술 공방에서 낮(일하는 시각)에만 나아감 */
  research: {
    R17: { wood: 20, metal: 10, workMinutes: 1080 },
    R18: { wood: 30, metal: 20, workMinutes: 1080 },
    R19: { wood: 30, metal: 30, workMinutes: 1080 },
    MECH2: { wood: 0, metal: 40, workMinutes: 1080 },
  },
} as const;
export type CampaignEventId = keyof typeof CAMPAIGN_RULES.events;
export type ResearchId = keyof typeof CAMPAIGN_RULES.research;
export type Route = "coexist" | "yangnyeong";
export type Outcome = "failure" | "ending-a" | "ending-b";
const EVENT_IDS = Object.keys(CAMPAIGN_RULES.events) as CampaignEventId[];
export const RESEARCH_IDS = Object.keys(
  CAMPAIGN_RULES.research,
) as ResearchId[];

export interface CampaignState {
  readonly stage: number;
  /** 이 단계가 시작된 시각 (1일차 0시부터 센 분) */
  readonly stageStart: number;
  /** 이 시각 전에는 다음 단계로 넘어가지 않음 (회수·우회로 늦어진 만큼) */
  readonly holdUntil: number;
  /** 돌아온 정찰대 수 (화면이 알려 줌) */
  readonly scouts: number;
  readonly picked: Readonly<Partial<Record<CampaignEventId, StorySide>>>;
  readonly clues: readonly string[];
  readonly research: readonly ResearchId[];
  /** 하고 있는 연구와 나아간 만큼(일한 분) */
  readonly researching: {
    readonly id: ResearchId;
    readonly done: number;
  } | null;
  readonly route: Route | null;
  /** 노선을 정한 시각 */
  readonly routeAt: number | null;
  /** 엔딩 판정에 쓰는 이어진 시간(분): 비관 100 · 낙관 0 · 비관 30 이하 */
  readonly pessimismExtremeMinutes: number;
  readonly optimismZeroMinutes: number;
  readonly lowPessimismMinutes: number;
  readonly outcome: Outcome | null;
}

export function createCampaign(): CampaignState {
  return {
    stage: 1,
    stageStart: 0,
    holdUntil: 0,
    scouts: 0,
    picked: {},
    clues: [],
    research: [],
    researching: null,
    route: null,
    routeAt: null,
    pessimismExtremeMinutes: 0,
    optimismZeroMinutes: 0,
    lowPessimismMinutes: 0,
    outcome: null,
  };
}

/** 지금 떠 있어야 하는 사건 (때가 됐는데 아직 고르지 않은 것). 없으면 null */
export function pendingCampaignEvent(
  c: CampaignState,
  now: number,
): CampaignEventId | null {
  if (c.outcome) return null;
  return (
    EVENT_IDS.find((id) => {
      const rule: EventRule = CAMPAIGN_RULES.events[id];
      if (rule.stage !== c.stage || c.picked[id]) return false;
      if (rule.scouts !== undefined) return c.scouts >= rule.scouts;
      return now >= c.stageStart + (rule.after ?? 0);
    }) ?? null
  );
}

/** 사건에서 한쪽을 고름. 돌려주는 값 = 새 상태와, 민심·자원에 줄 변화 */
export function pickCampaignEvent(
  c: CampaignState,
  id: CampaignEventId,
  side: StorySide,
  now: number,
): { campaign: CampaignState; delta: Delta } {
  const rule: EventRule = CAMPAIGN_RULES.events[id];
  const delta = side === "a" ? rule.a : rule.b;
  if (pendingCampaignEvent(c, now) !== id || !delta)
    throw new Error("지금 고를 수 없는 사건");
  return {
    delta,
    campaign: {
      ...c,
      picked: { ...c.picked, [id]: side },
      holdUntil: Math.max(c.holdUntil, now + (delta.hold ?? 0)),
      clues: delta.clue ? [...c.clues, delta.clue] : c.clues,
      route: delta.route ?? c.route,
      routeAt: delta.route ? now : c.routeAt,
    },
  };
}

/** 돌아온 정찰대 수를 맞춤 (줄어들지는 않음) */
export function reportScouts(c: CampaignState, count: number): CampaignState {
  return count > c.scouts ? { ...c, scouts: count } : c;
}

/** 지금 시작할 수 있는 연구 (없으면 null): 단서 넷이 모이면 R17 → R18, 양녕 노선이면 R19 → 메카 2차 */
export function nextResearch(c: CampaignState): ResearchId | null {
  if (c.researching || c.outcome || c.clues.length < 4) return null;
  const order: ResearchId[] =
    c.route === "yangnyeong" ? ["R17", "R18", "R19", "MECH2"] : ["R17", "R18"];
  return order.find((id) => !c.research.includes(id)) ?? null;
}
export function startResearch(c: CampaignState, id: ResearchId): CampaignState {
  if (nextResearch(c) !== id) throw new Error("지금 할 수 없는 연구");
  return { ...c, researching: { id, done: 0 } };
}

/** 4단계의 날씨 예보 줄: 혹한까지 남은 날 또는 혹한 며칠째 (4단계가 아니면 null) */
export function coldForecast(
  c: CampaignState,
  now: number,
): { phase: "prep" | "cold"; day: number; of: number } | null {
  if (c.stage !== 4) return null;
  const d = Math.floor((now - c.stageStart) / DAY);
  return d < CAMPAIGN_RULES.prepDays
    ? {
        phase: "prep",
        day: CAMPAIGN_RULES.prepDays - d,
        of: CAMPAIGN_RULES.prepDays,
      }
    : {
        phase: "cold",
        day: Math.min(CAMPAIGN_RULES.coldDays, d - CAMPAIGN_RULES.prepDays + 1),
        of: CAMPAIGN_RULES.coldDays,
      };
}

/** 시간이 흐른 만큼 단계·단서·연구·판정용 시간을 나아가게 함 */
export function stepCampaign(
  c: CampaignState,
  input: {
    /** 흐른 뒤의 시각 */
    now: number;
    minutes: number;
    /** 그중 일하는 시각이었던 분 (연구가 나아감) */
    workMinutes: number;
    pessimism: number;
    optimism: number;
    /** 교역 검수 사건(story.ts trade)을 고르고 목재도 다 들어왔는지 */
    tradeDone: boolean;
    /** 기술 공방이 서 있는지 (없으면 연구가 멈춤) */
    workshop: boolean;
    endingAPessimism: number;
  },
): CampaignState {
  if (c.outcome) return c;
  const { now, minutes } = input;
  let next: CampaignState = {
    ...c,
    pessimismExtremeMinutes:
      input.pessimism >= 100 ? c.pessimismExtremeMinutes + minutes : 0,
    optimismZeroMinutes:
      input.optimism <= 0 ? c.optimismZeroMinutes + minutes : 0,
    lowPessimismMinutes:
      c.route && input.pessimism <= input.endingAPessimism
        ? c.lowPessimismMinutes + minutes
        : 0,
  };
  if (next.researching && input.workshop) {
    const done = next.researching.done + input.workMinutes;
    const id = next.researching.id;
    next =
      done >= CAMPAIGN_RULES.research[id].workMinutes
        ? { ...next, researching: null, research: [...next.research, id] }
        : { ...next, researching: { id, done } };
  }
  const enter = (stage: number, clue?: string): CampaignState => ({
    ...next,
    stage,
    stageStart: now,
    clues: clue ? [...next.clues, clue] : next.clues,
  });
  const p = next.picked;
  if (now < next.holdUntil) return next;
  if (next.stage === 1) {
    if (next.scouts >= CAMPAIGN_RULES.scoutGoal && p.lost)
      return enter(2, "C01");
  } else if (next.stage === 2) {
    if (input.tradeDone && p.village) return enter(3, "C02");
  } else if (next.stage === 3) {
    if (p.letter && p.refugee && p.identity) return enter(4);
  } else if (next.stage === 4) {
    if (
      !next.clues.includes("C04") &&
      now >= next.stageStart + CAMPAIGN_RULES.c04After
    )
      next = { ...next, clues: [...next.clues, "C04"] };
    if (
      now >=
      next.stageStart +
        (CAMPAIGN_RULES.prepDays + CAMPAIGN_RULES.coldDays) * DAY
    )
      return enter(5);
  }
  return next;
}

/** 저장 기록에서 읽기 — 캠페인이 생기기 전의 옛 저장에는 없으므로 처음 상태로 채움 */
export function parseCampaign(value: unknown): CampaignState {
  if (value === undefined) return createCampaign();
  const bad = () => new Error("캠페인 기록 형식 오류");
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw bad();
  const v = value as Record<string, unknown>;
  const int = (x: unknown) => {
    if (!Number.isSafeInteger(x) || (x as number) < 0) throw bad();
    return x as number;
  };
  const stage = int(v.stage);
  if (stage < 1 || stage > 5) throw bad();
  if (typeof v.picked !== "object" || v.picked === null) throw bad();
  const picked: Partial<Record<CampaignEventId, StorySide>> = {};
  for (const [id, side] of Object.entries(v.picked)) {
    if (!EVENT_IDS.includes(id as CampaignEventId)) throw bad();
    if (side !== "a" && side !== "b") throw bad();
    picked[id as CampaignEventId] = side;
  }
  const list = (x: unknown, ok: (s: string) => boolean) => {
    if (!Array.isArray(x) || !x.every((s) => typeof s === "string" && ok(s)))
      throw bad();
    return [...new Set(x as string[])];
  };
  const isResearch = (s: string) => RESEARCH_IDS.includes(s as ResearchId);
  let researching: CampaignState["researching"] = null;
  if (v.researching !== null) {
    const r = v.researching as { id?: unknown; done?: unknown };
    if (typeof r !== "object" || typeof r.id !== "string" || !isResearch(r.id))
      throw bad();
    researching = { id: r.id as ResearchId, done: int(r.done) };
  }
  if (v.route !== null && v.route !== "coexist" && v.route !== "yangnyeong")
    throw bad();
  if (
    v.outcome !== null &&
    v.outcome !== "failure" &&
    v.outcome !== "ending-a" &&
    v.outcome !== "ending-b"
  )
    throw bad();
  return {
    stage,
    stageStart: int(v.stageStart),
    holdUntil: int(v.holdUntil),
    scouts: int(v.scouts),
    picked,
    clues: list(v.clues, (s) => /^C0[1-4]$/.test(s)),
    research: list(v.research, isResearch) as ResearchId[],
    researching,
    route: v.route,
    routeAt: v.routeAt === null ? null : int(v.routeAt),
    pessimismExtremeMinutes: int(v.pessimismExtremeMinutes),
    optimismZeroMinutes: int(v.optimismZeroMinutes),
    lowPessimismMinutes: int(v.lowPessimismMinutes),
    outcome: v.outcome,
  };
}
