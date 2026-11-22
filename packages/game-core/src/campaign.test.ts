import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_RULES,
  type CampaignState,
  coldForecast,
  createCampaign,
  nextResearch,
  parseCampaign,
  pendingCampaignEvent,
  pickCampaignEvent,
  reportScouts,
  startResearch,
  stepCampaign,
} from "./campaign.js";
import {
  AMOUNT_SCALE,
  advanceToStory,
  commandResearch,
  commandScouts,
  createPlayState,
  pickCampaign,
  startBuilding,
} from "./play.js";

const DAY = 1440;
/** 민심이 평온한 채로 시간이 흐름 */
const pass = (c: CampaignState, now: number, more = {}) =>
  stepCampaign(c, {
    now,
    minutes: 60,
    workMinutes: 60,
    pessimism: 10,
    optimism: 50,
    tradeDone: true,
    workshop: true,
    endingAPessimism: 30,
    ...more,
  });
const pick = (
  c: CampaignState,
  id: Parameters<typeof pickCampaignEvent>[1],
  side: "a" | "b",
  now: number,
) => pickCampaignEvent(c, id, side, now).campaign;

describe("캠페인 단계", () => {
  it("1단계: 정찰대가 세 번 돌아오면 전멸 사건이 뜨고, 다섯 번 + 선택을 마쳐야 2단계로 간다", () => {
    let c = createCampaign();
    expect(pendingCampaignEvent(c, 0)).toBeNull();
    c = reportScouts(c, 3);
    expect(pendingCampaignEvent(c, 100)).toBe("lost");
    c = reportScouts(c, 5);
    expect(pass(c, 200).stage).toBe(1); // 사건을 아직 안 골랐음
    c = pick(c, "lost", "b", 200);
    c = pass(c, 260);
    expect(c.stage).toBe(2);
    expect(c.clues).toEqual(["C01"]);
    expect(reportScouts(c, 2).scouts).toBe(5); // 줄어들지 않음
  });

  it("회수를 고르면 하루 뒤에야 다음 단계로 넘어간다", () => {
    let c = reportScouts(createCampaign(), 5);
    c = pick(c, "lost", "a", 100);
    expect(pass(c, 100 + DAY - 1).stage).toBe(1);
    expect(pass(c, 100 + DAY).stage).toBe(2);
  });

  it("처음부터 5단계 노선 선택까지 이어진다", () => {
    let c = reportScouts(createCampaign(), 5);
    c = pass(pick(c, "lost", "b", 0), 60);
    // 2단계: 교역 검수가 끝나고 다섯 마을 사건을 골라야 함
    expect(pendingCampaignEvent(c, 60)).toBeNull();
    let now = 60 + DAY / 2;
    expect(pendingCampaignEvent(c, now)).toBe("village");
    expect(
      pass(pick(c, "village", "a", now), now, { tradeDone: false }).stage,
    ).toBe(2);
    c = pass(pick(c, "village", "a", now), now);
    expect([c.stage, c.clues]).toEqual([3, ["C01", "C02"]]);
    // 3단계: 봉서 → 난민 → 신분, 차례로 뜸
    for (const id of ["letter", "refugee", "identity"] as const) {
      now = c.stageStart + CAMPAIGN_RULES.events[id].after;
      expect(pendingCampaignEvent(c, now)).toBe(id);
      c = pick(c, id, "a", now);
    }
    expect(c.clues).toContain("C03");
    c = pass(c, now);
    expect(c.stage).toBe(4);
    // 4단계: 하루 뒤 C04, 준비 15일 + 혹한 15일
    expect(coldForecast(c, now)).toEqual({ phase: "prep", day: 15, of: 15 });
    expect(nextResearch(c)).toBeNull(); // 단서가 아직 셋
    c = pass(c, now + DAY);
    expect(c.clues).toHaveLength(4);
    expect(coldForecast(c, now + 15 * DAY)).toEqual({
      phase: "cold",
      day: 1,
      of: 15,
    });
    expect(pass(c, now + 30 * DAY - 1).stage).toBe(4);
    c = pass(c, now + 30 * DAY);
    expect(c.stage).toBe(5);
    expect(coldForecast(c, now + 30 * DAY)).toBeNull();
    // 5단계: 노선
    now = c.stageStart + CAMPAIGN_RULES.events.route.after;
    expect(pendingCampaignEvent(c, now)).toBe("route");
    c = pick(c, "route", "b", now);
    expect([c.route, c.routeAt]).toEqual(["yangnyeong", now]);
  });

  it("연구: 단서 넷이 모이면 R17 → R18, 양녕 노선이면 R19 → 메카 2차. 공방이 없으면 멈춘다", () => {
    let c: CampaignState = {
      ...createCampaign(),
      stage: 5,
      clues: ["C01", "C02", "C03", "C04"],
    };
    expect(nextResearch(c)).toBe("R17");
    expect(() => startResearch(c, "R18")).toThrow();
    c = startResearch(c, "R17");
    expect(nextResearch(c)).toBeNull();
    expect(pass(c, 60, { workshop: false }).researching?.done).toBe(0);
    for (let i = 0; i < 18; i++) c = pass(c, 60 * (i + 1));
    expect([c.research, c.researching]).toEqual([["R17"], null]);
    c = { ...c, research: ["R17", "R18"] };
    expect(nextResearch(c)).toBeNull();
    expect(nextResearch({ ...c, route: "yangnyeong" })).toBe("R19");
  });

  it("판정용 시간: 비관 100이 이어지면 쌓이고 끊기면 0, 낮은 비관은 노선을 정한 뒤에만 센다", () => {
    let c = pass(createCampaign(), 60, { pessimism: 100 });
    expect(c.pessimismExtremeMinutes).toBe(60);
    expect(c.lowPessimismMinutes).toBe(0);
    c = pass(c, 120);
    expect(c.pessimismExtremeMinutes).toBe(0);
    c = pass({ ...c, route: "coexist", routeAt: 120 }, 180);
    expect(c.lowPessimismMinutes).toBe(60);
  });

  it("저장: 옛 저장은 처음 상태로, 지금 상태는 그대로 돌아온다", () => {
    expect(parseCampaign(undefined)).toEqual(createCampaign());
    const c = startResearch(
      {
        ...pick(reportScouts(createCampaign(), 3), "lost", "a", 10),
        clues: ["C01", "C02", "C03", "C04"],
      },
      "R17",
    );
    expect(parseCampaign(JSON.parse(JSON.stringify(c)))).toEqual(c);
    expect(() => parseCampaign({ ...c, stage: 9 })).toThrow();
  });
});

describe("캠페인 — 게임 진행과 묶임", () => {
  it("사건이 뜨면 시간이 서고, 고르면 민심이 바뀌고 다시 흐른다", () => {
    let s = commandScouts({ ...createPlayState(), paused: false }, 3);
    s = advanceToStory(s, 30);
    expect(s.paused).toBe(true);
    const at = [s.day, s.minute];
    expect(advanceToStory({ ...s, paused: false }, 600).minute).toBe(at[1]); // 고르기 전에는 안 흐름
    const before = s.pessimism;
    s = pickCampaign(s, "lost", "b");
    expect(s.pessimism).toBe(before + CAMPAIGN_RULES.events.lost.b.pessimism);
    expect(s.paused).toBe(false);
    expect(advanceToStory(s, 30).minute).toBe((at[1] ?? 0) + 30);
    expect(() => pickCampaign(s, "lost", "a")).toThrow();
  });

  it("연구는 공방이 서 있고 단서가 모여야 시작되고, 값을 바로 치른다", () => {
    const base = createPlayState();
    const ready = {
      ...base,
      campaign: {
        ...base.campaign,
        stage: 4,
        clues: ["C01", "C02", "C03", "C04"],
      },
    };
    expect(() => commandResearch(ready, "R17")).toThrow(); // 공방 없음
    const built = {
      ...ready,
      works: { ...ready.works, built: [...ready.works.built, 4] },
    };
    const s = commandResearch(built, "R17");
    expect(s.campaign.researching).toEqual({ id: "R17", done: 0 });
    expect(built.resources.RES_WOOD - s.resources.RES_WOOD).toBe(
      CAMPAIGN_RULES.research.R17.wood * AMOUNT_SCALE,
    );
    expect(() => startBuilding(s, 4)).toThrow(); // 이미 선 부지
  });

  it("비관 100이 하루 이어지면 실패로 끝나고 시간이 선다", () => {
    const base = createPlayState();
    let s = advanceToStory(
      {
        ...base,
        paused: false,
        pessimism: 100,
        campaign: { ...base.campaign, pessimismExtremeMinutes: 1439 },
      },
      1,
    );
    // 민심은 한 분 사이에 조금 내려갈 수 있어, 100에 머문 경우만 본다
    if (s.pessimism >= 100) {
      expect(s.campaign.outcome).toBe("failure");
      expect(s.paused).toBe(true);
      s = advanceToStory({ ...s, paused: false }, 60);
      expect(s.paused).toBe(true);
    } else expect(s.campaign.outcome).toBeNull();
  });
});
