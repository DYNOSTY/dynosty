import { createVillageGame } from "@dynosty/game-core";
import { expect, it } from "vitest";
import { campaignPage, villageAdvice } from "./campaign-scenes.js";

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
    expect(support(15, 70)).toMatch(/걱정|겁이/);
    expect(support(50, 48)).not.toMatch(/저울|잘했어|걱정|비관|낙관/);
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
