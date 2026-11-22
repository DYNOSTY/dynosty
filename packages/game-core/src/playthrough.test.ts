import { describe, expect, it } from "vitest";
import { nextResearch, pendingCampaignEvent } from "./campaign.js";
import {
  advanceToStory,
  commandResearch,
  commandScouts,
  commandSiteCrew,
  createPlayState,
  type PlayState,
  pickCampaign,
  pickStory,
  startBuilding,
} from "./play.js";
import { absMinute, pendingStory } from "./story.js";
import { PLOTS } from "./works.js";

const WORKSHOP = PLOTS.indexOf("BLD_WORKSHOP");
/** 새 게임부터 끝까지 한 시간씩: 사건은 모두 '가', 정찰·공방·연구는 할 수 있을 때. manage = 식량 조달·터 일꾼 */
function play(manage: boolean): PlayState {
  let s = createPlayState();
  if (manage)
    for (const site of ["coal", "iron", "pine", "fish", "store"] as const)
      s = commandSiteCrew(s, site, true);
  for (let i = 0; i < 24 * 200 && !s.campaign.outcome; i++) {
    const ev = pendingCampaignEvent(s.campaign, absMinute(s.day, s.minute));
    if (ev) {
      s = pickCampaign(s, ev, "a");
      continue;
    }
    const st = pendingStory(s.story, s.day, s.minute);
    if (st) {
      s = pickStory(s, st, "a");
      continue;
    }
    if (s.minute === 0) {
      if (s.campaign.stage === 1) s = commandScouts(s, s.campaign.scouts + 1);
    }
    // 조달 없이 정식 조작만: 채집막·망루(사냥)·양식장·온상을 지을 수 있을 때 지음
    if (manage)
      for (const t of [
        "BLD_FORAGE",
        "BLD_WATCH",
        "BLD_FISHERY",
        "BLD_GREENHOUSE",
      ] as const)
        PLOTS.forEach((type, i) => {
          if (type !== t) return;
          try {
            s = startBuilding(s, i);
          } catch {}
        });
    try {
      if (!s.works.built.includes(WORKSHOP)) s = startBuilding(s, WORKSHOP);
    } catch {}
    const r = nextResearch(s.campaign);
    try {
      if (r) s = commandResearch(s, r);
    } catch {}
    s = advanceToStory({ ...s, paused: false }, 60);
  }
  return s;
}

describe("처음부터 엔딩까지", () => {
  it("굶기고 불을 안 때면 혹한 전에 실패한다", () => {
    expect(play(false).campaign.outcome).toBe("failure");
  });
  it("터에 일꾼을 보내고 식량 건물을 지으면(조달 없이) 공존 노선으로 엔딩 A", () => {
    const s = play(true);
    expect(s.campaign.outcome).toBe("ending-a");
    expect(s.campaign.clues).toEqual(["C01", "C02", "C03", "C04"]);
  });
});
