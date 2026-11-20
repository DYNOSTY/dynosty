import { createStoryState, STORY_RULES } from "@dynosty/game-core";
import { describe, expect, it } from "vitest";
import { storyNotice } from "./story-notice.js";

const none = createStoryState();
const rule = STORY_RULES.trade;

describe("이야기 알림", () => {
  it("처음 본 상태와 바뀐 게 없는 상태는 알리지 않는다", () => {
    expect(storyNotice(null, { story: none, now: 10 })).toBeNull();
    expect(
      storyNotice({ story: none, now: 10 }, { story: none, now: 11 }),
    ).toBeNull();
  });
  it("전량 검수를 고르면 늦게 온다고 알리고, 들어오면 다시 알린다", () => {
    const waiting = { picked: { trade: "a" as const }, woodDue: 7000 };
    const start = storyNotice(
      { story: none, now: 6120 },
      { story: waiting, now: 6120 },
    );
    expect(start?.note).toContain(`목재 ${rule.wood}`);
    expect(start?.loss).toBeUndefined();
    const arrived = storyNotice(
      { story: waiting, now: 6999 },
      { story: { ...waiting, woodDue: null }, now: 7000 },
    );
    expect(arrived?.gain).toBe(`목재 +${rule.wood}`);
  });
  it("표본 검수를 고르면 얻은 것과 잃은 것을 함께 알린다", () => {
    const n = storyNotice(
      { story: none, now: 6120 },
      { story: { picked: { trade: "b" }, woodDue: null }, now: 6120 },
    );
    expect(n?.gain).toBe(`목재 +${rule.wood}`);
    expect(n?.loss).toContain(`비관 +${rule.samplePessimism}`);
  });
  it("시간이 뒤로 가거나 하루 넘게 건너뛰면(새 게임·불러오기) 알리지 않는다", () => {
    const picked = { picked: { trade: "b" as const }, woodDue: null };
    expect(
      storyNotice({ story: none, now: 6120 }, { story: picked, now: 100 }),
    ).toBeNull();
    expect(
      storyNotice({ story: none, now: 100 }, { story: picked, now: 9000 }),
    ).toBeNull();
  });
});
