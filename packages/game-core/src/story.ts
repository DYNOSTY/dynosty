// 사건·정책 선택 (시나리오기획서 4.1 정책표 P05 「교역 명문과 실물 검수」)
// 가: 전량 검수 — 불량 수령 방지 / 검수 인력 묶임·시간 지연
// 나: 표본 검수 — 수용 속도 +50% / 불량 물류 유입 시 비관 폭증
//
// ⚠ 수치는 기획서에 없어 임시 값이다(2026-11-20, 사용자 확정 전). 바꿀 땐 STORY_RULES만 고치면 된다.
// 뜨는 시점도 임시: 기획서로는 2단계 「끊어진 길을 잇다」 사건인데 단계 진행이 아직 계산 쪽에 없어
// 달력으로 대신한다. 기존 화면 시험이 '하루 진행'으로 4일차까지 넘기므로 그 뒤인 5일차 아침으로 잡았다.
export const STORY_RULES = {
  trade: {
    day: 5,
    minute: 6 * 60,
    /** 수레에 실린 목재 (의뢰 「마른 목재 20 조달」) */
    wood: 20,
    /** 가: 전량 검수 — 모두 풀어 보느라 하루 뒤에 들어옴 */
    fullDelayMinutes: 1440,
    /** 나: 표본 검수 — 바로 들이지만 젖은 목재가 섞여 들어와 비관이 오름 */
    samplePessimism: 10,
  },
} as const;
export type StoryId = keyof typeof STORY_RULES;
export type StorySide = "a" | "b";
export interface StoryState {
  /** 이미 고른 사건과 고른 쪽 (가 = a, 나 = b) */
  readonly picked: Readonly<Partial<Record<StoryId, StorySide>>>;
  /** 전량 검수로 늦게 들어올 목재의 도착 시각 (1일차 0시부터 센 분). 없으면 null */
  readonly woodDue: number | null;
}
const IDS = Object.keys(STORY_RULES) as StoryId[];
const DAY = 1440;

export function createStoryState(): StoryState {
  return { picked: {}, woodDue: null };
}
/** 1일차 0시부터 센 분 */
export function absMinute(day: number, minute: number) {
  return (day - 1) * DAY + minute;
}
/** 지금 떠 있어야 하는 사건 (때가 됐는데 아직 고르지 않은 것). 없으면 null */
export function pendingStory(
  story: StoryState,
  day: number,
  minute: number,
): StoryId | null {
  const now = absMinute(day, minute);
  return (
    IDS.find(
      (id) =>
        !story.picked[id] &&
        now >= absMinute(STORY_RULES[id].day, STORY_RULES[id].minute),
    ) ?? null
  );
}
/** 다음 사건까지 남은 분 (이미 떠 있으면 0). 남은 사건이 없으면 null */
export function minutesUntilStory(
  story: StoryState,
  day: number,
  minute: number,
): number | null {
  const now = absMinute(day, minute);
  const left = IDS.filter((id) => !story.picked[id]).map((id) =>
    Math.max(0, absMinute(STORY_RULES[id].day, STORY_RULES[id].minute) - now),
  );
  return left.length ? Math.min(...left) : null;
}
/** 저장 기록에서 읽기 — 사건이 생기기 전의 옛 저장에는 없으므로 기본값으로 채움 */
export function parseStoryState(value: unknown): StoryState {
  if (value === undefined) return createStoryState();
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("사건 기록 형식 오류");
  const v = value as { picked?: unknown; woodDue?: unknown };
  if (typeof v.picked !== "object" || v.picked === null)
    throw new Error("사건 기록 형식 오류");
  const picked: Partial<Record<StoryId, StorySide>> = {};
  for (const [id, side] of Object.entries(v.picked)) {
    if (!IDS.includes(id as StoryId) || (side !== "a" && side !== "b"))
      throw new Error("사건 기록 형식 오류");
    picked[id as StoryId] = side;
  }
  if (
    v.woodDue !== null &&
    (!Number.isSafeInteger(v.woodDue) || (v.woodDue as number) < 0)
  )
    throw new Error("사건 기록 형식 오류");
  return { picked, woodDue: v.woodDue as number | null };
}
