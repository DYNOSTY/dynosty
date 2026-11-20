import {
  actCampaign,
  createVillageGame,
  type TimberState,
} from "@dynosty/game-core";
import { expect, it } from "vitest";
import {
  campaignPage,
  gatheringRumor,
  moraleAdvice,
  villageAdvice,
} from "./campaign-scenes.js";

it("달이는 출문 뒤 처음 한 번 저울을 소개하고 이후 지지의 양끝에서만 반응한다", () => {
  const s = createVillageGame();
  const page = campaignPage({
    ...s,
    campaign: { ...s.campaign!, beat: "after" },
  });
  expect(
    page.lines
      .filter(([, words]) => words.includes("양팔저울"))
      .map(([speaker]) => speaker),
  ).toEqual(["달이"]);
  expect(campaignPage(s).lines.flat().join(" ")).not.toContain("저울");
  for (const day of [true, false]) {
    const support = (optimism: number, pessimism: number) =>
      villageAdvice({ ...s, world: { ...s.world, optimism, pessimism } }, day);
    expect(support(50, 0)).toContain("공동 식당");
    expect(support(75, 10)).toMatch(/잘하셨어요|잘했어/);
    expect(support(50, 48)).not.toMatch(/저울|잘했어|걱정|비관|낙관/);
  }
});
it("민심 경계와 해 뜨고 지는 시각에 맞춰 조언자가 바뀐다", () => {
  const s = createVillageGame();
  for (const [minute, who] of [
    [359, "달이"],
    [360, "나르미"],
    [1079, "나르미"],
    [1080, "달이"],
  ] as const) {
    const advice = (pessimism: number) =>
      moraleAdvice({ ...s, world: { ...s.world, minute, pessimism } });
    expect(advice(59)).toBeUndefined();
    for (const [value, words] of [
      [60, /걱정/],
      [75, /걱정/],
      [76, /다툼|망루/],
      [90, /다툼|망루/],
      [91, /배급령/],
      [99, /배급령/],
    ] as const) {
      expect(advice(value)).toEqual([who, expect.stringMatching(words)]);
      expect(advice(value)?.[1]).not.toMatch(/비관|낙관|수치|저울|\d/);
    }
  }
});
it("안내는 도착한 상인과 주민, 돌아온 조와 아직 부족한 식량을 구별한다", () => {
  const s = createVillageGame();
  expect(villageAdvice(s, true, "덕구")).toContain("덕구");
  expect(villageAdvice({ ...s, scoutVisitors: 1 }, true)).toContain(
    "성문 표식",
  );
  const scout = {
    ...s,
    scoutDepartures: { reed: 0 },
    world: { ...s.world, day: 4 },
  };
  expect(villageAdvice(scout, false)).toContain("정찰대가 돌아왔어");
  expect(
    villageAdvice(
      { ...scout, campaign: { ...s.campaign!, reports: ["reed"] } },
      false,
    ),
  ).not.toContain("돌아왔어");
  const shortage = {
    ...s,
    world: { ...s.world, resources: { ...s.world.resources, RES_FISH: 0 } },
  };
  expect(villageAdvice(shortage, true)).toContain("어획막");
});

it("충녕이 깨어난 소식은 확인 전까지 열리고 이후에는 마을 일과로 돌아간다", () => {
  const base = createVillageGame();
  const s: TimberState = {
    ...base,
    chapter: 5,
    campaign: { ...base.campaign!, beat: "vigil" },
    town: {
      ...base.town,
      development: {
        ...base.town.development,
        story: { ...base.town.development.story, chungnyeong: "mechanical" },
      },
    },
  };
  const page = campaignPage(s);
  expect(page.key).toBe("awakening");
  expect(page.auto).toBe(true);
  expect(page.choices.map((c) => c.action)).toEqual(["awakening"]);
  const command = {
    type: "campaign",
    beat: "vigil",
    action: "awakening",
  } as const;
  const seen = actCampaign(s, command);
  expect(campaignPage(seen).auto).toBe(false);
  expect(campaignPage(seen).key).toBe("vigil");
  expect(() => actCampaign(seen, command)).toThrow();
});

it("배급 정책과 민심에 따라 창고 이야기를 달리 전하고 혹한 예보는 모두에게 전한다", () => {
  const base = createVillageGame();
  const rumor = (
    day: number,
    rationPolicy: "cap" | "needs",
    optimism: number,
    pessimism: number,
  ) =>
    gatheringRumor({
      ...base,
      elapsed: day * 1440,
      rationPolicy,
      campaign: { ...base.campaign!, beat: "forecast", since: 0 },
      world: { ...base.world, minute: 360, optimism, pessimism },
    });
  expect(rumor(2, "needs", 50, 50)?.[1]).toContain("푸른 보자기");
  expect(rumor(2, "cap", 50, 50)).toBeUndefined();
  expect(rumor(2, "cap", 60, 40)?.[1]).toContain("혼자 다니지 말래요");
  expect(rumor(3, "needs", 60, 40)?.[1]).toContain("내 발소리");
  for (const policy of ["cap", "needs"] as const) {
    expect(rumor(2, policy, 40, 60)).toBeUndefined();
    expect(rumor(3, policy, 40, 60)).toBeUndefined();
    expect(rumor(4, policy, 40, 60)?.[0]).toBe("영실");
  }
});

it("성문에서 주민이 배급을 기억하고 민심에 따라 빗장을 들거나 건다", () => {
  const base = createVillageGame();
  for (const [rationPolicy, uprising, words] of [
    ["cap", true, "이쪽 빗장은 내가 들 테니"],
    ["needs", true, "자, 빗장 듭시다"],
    ["cap", false, "빗장 걸 거요"],
    ["needs", false, "내가 걸겠소"],
  ] as const) {
    const page = campaignPage({
      ...base,
      chapter: 5,
      rationPolicy,
      campaign: { ...base.campaign!, beat: "verdict", uprising },
    });
    expect(page.lines[1]).toEqual([
      "푸른 보자기를 맨 주민",
      expect.stringContaining(words),
    ]);
  }
});
