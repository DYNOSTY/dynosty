import { describe, expect, it } from "vitest";
import {
  AMOUNT_SCALE,
  advancePlayMinutes,
  advanceToStory,
  createPlayState,
  parsePlayState,
  pickStory,
  setPlayPaused,
  tickPlay,
} from "./play.js";
import { absMinute, pendingStory, STORY_RULES } from "./story.js";

const rule = STORY_RULES.trade;
/** 사건이 뜬 시각에 멈춘 게임 */
function atStory() {
  return advanceToStory(setPlayPaused(createPlayState(), false), 10080);
}

describe("사건·정책 선택 (P05 교역 검수)", () => {
  it("때가 되면 그 시각에서 멈추고 사건이 뜬다", () => {
    const start = createPlayState();
    expect(pendingStory(start.story, start.day, start.minute)).toBeNull();
    const s = atStory();
    expect([s.day, s.minute, s.paused]).toEqual([rule.day, rule.minute, true]);
    expect(pendingStory(s.story, s.day, s.minute)).toBe("trade");
  });
  it("고르기 전에는 다시 시작해도 시간이 흐르지 않는다", () => {
    const s = tickPlay(setPlayPaused(atStory(), false), 5000);
    expect([s.day, s.minute, s.paused]).toEqual([rule.day, rule.minute, true]);
    const d = advanceToStory(atStory(), 1440);
    expect([d.day, d.minute]).toEqual([rule.day, rule.minute]);
  });
  it("전량 검수: 목재가 하루 뒤에 들어오고 비관은 그대로다", () => {
    const before = atStory();
    const picked = pickStory(before, "trade", "a");
    expect(picked.paused).toBe(false);
    expect(picked.resources.RES_WOOD).toBe(before.resources.RES_WOOD);
    expect(picked.pessimism).toBe(before.pessimism);
    expect(picked.story.woodDue).toBe(
      absMinute(rule.day, rule.minute) + rule.fullDelayMinutes,
    );
    // 같은 하루를 사건 없이 보낸 것과 비교하면 목재가 딱 수레만큼 많다
    const plain = advancePlayMinutes(
      { ...picked, story: { ...picked.story, woodDue: null } },
      rule.fullDelayMinutes,
    );
    const late = advancePlayMinutes(picked, rule.fullDelayMinutes);
    expect(late.resources.RES_WOOD - plain.resources.RES_WOOD).toBe(
      rule.wood * AMOUNT_SCALE,
    );
    expect(late.story.woodDue).toBeNull();
    expect(pendingStory(late.story, late.day, late.minute)).toBeNull();
  });
  it("표본 검수: 목재가 바로 들어오고 비관이 오른다", () => {
    const before = atStory();
    const picked = pickStory(before, "trade", "b");
    expect(picked.resources.RES_WOOD - before.resources.RES_WOOD).toBe(
      rule.wood * AMOUNT_SCALE,
    );
    expect(picked.pessimism).toBe(
      Math.min(100, before.pessimism + rule.samplePessimism),
    );
    expect(picked.story.woodDue).toBeNull();
  });
  it("뜨지 않은 사건이나 이미 고른 사건은 고를 수 없다", () => {
    expect(() => pickStory(createPlayState(), "trade", "a")).toThrow();
    const picked = pickStory(atStory(), "trade", "b");
    expect(() => pickStory(picked, "trade", "a")).toThrow();
  });
  it("사건이 없던 옛 저장은 기본값으로 읽고, 잘못된 기록은 거부한다", () => {
    const { story: _story, ...old } = createPlayState();
    expect(parsePlayState(old).story).toEqual({ picked: {}, woodDue: null });
    expect(() =>
      parsePlayState({
        ...old,
        story: { picked: { trade: "c" }, woodDue: null },
      }),
    ).toThrow();
  });
});
