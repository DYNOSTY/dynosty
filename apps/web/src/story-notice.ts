import { STORY_RULES, type StoryState } from "@dynosty/game-core";

// 이야기 알림 (기획서 화면 여섯 갈래 중 「이야기 알림」): 사건에서 고른 결과와 늦게 들어온 물자를 잠깐 알린다.
// 계산 쪽 상태가 바뀐 순간을 화면에서 비교해 만든다 (수치는 story.ts STORY_RULES — 임시 값)
export interface StoryNoticeData {
  readonly title: string;
  readonly gain?: string;
  readonly loss?: string;
  readonly note?: string;
}
/** 비교할 한 순간: 사건 상태와 그때 시각(1일차 0시부터 센 분) */
export interface StoryMoment {
  readonly story: StoryState;
  readonly now: number;
}
const { wood, fullDelayMinutes, samplePessimism } = STORY_RULES.trade;

/** 앞 순간과 지금을 견주어 띄울 알림 (없으면 null).
 *  ponytail: 시간이 이어질 때만 알린다(뒤로 가거나 하루 넘게 건너뛰면 새 게임·불러오기로 보고 건너뜀).
 *  같은 날 안의 저장을 불러오면 잘못 알릴 수 있다 — 알림이 늘면 계산 쪽에 알림 기록을 두는 쪽으로 */
export function storyNotice(
  prev: StoryMoment | null,
  next: StoryMoment,
): StoryNoticeData | null {
  if (!prev || next.now < prev.now || next.now - prev.now > 1440) return null;
  const was = prev.story.picked.trade;
  const is = next.story.picked.trade;
  if (!was && is === "a")
    return {
      title: "전량 검수를 시작했다",
      note: `목재 ${wood} · ${fullDelayMinutes === 1440 ? "하루" : `${Math.ceil(fullDelayMinutes / 60)}시간`} 뒤에 들어온다`,
    };
  if (!was && is === "b")
    return {
      title: "표본만 보고 들였다",
      gain: `목재 +${wood}`,
      loss: `젖은 목재가 섞였다 · 비관 +${samplePessimism}`,
    };
  if (
    was === "a" &&
    is === "a" &&
    prev.story.woodDue !== null &&
    next.story.woodDue === null
  )
    return { title: "검수를 마친 목재가 들어왔다", gain: `목재 +${wood}` };
  return null;
}
