import {
  AMOUNT_SCALE,
  commandTimber,
  createTimberSave,
  createVillageGame,
  parseTimberSave,
  recordResearchStory,
  type TimberState,
  updateCampaign,
} from "@dynosty/game-core";
import { expect, it } from "vitest";
import {
  campaignPage,
  gatheringRumor,
  moraleAdvice,
  villageAdvice,
} from "./campaign-scenes.js";

const loadDevSave = (state: TimberState) =>
  parseTimberSave(
    JSON.parse(
      JSON.stringify({ format: "dynosty-timber", saveVersion: 1, state }),
    ),
  ).state;

const legacyCampaign = (s: TimberState) => {
  if (!s.campaign) throw Error("Expected a campaign fixture");
  const { victoryQuotes: _quotes, ...legacy } = s.campaign;
  return legacy;
};

const legacyCouncil = (
  side: "coexist" | "control",
  beat: "rally" | "verdict",
) => {
  const s = createVillageGame(false, true);
  return loadDevSave(
    recordResearchStory(
      {
        ...s,
        chapter: 5,
        world: { ...s.world, pessimism: 55 },
        rationPolicy: side === "coexist" ? "needs" : "cap",
        campaign: { ...legacyCampaign(s), side, beat, uprising: true },
      },
      "rebellion-started",
    ),
  );
};

it("legacy control verdict opens the mechanization route, not Yangnyeong's order", () => {
  const verdict = legacyCouncil("control", "verdict");
  const next = commandTimber(
    verdict,
    { type: "campaign", beat: "verdict", action: "next" },
    "verdict",
  );
  expect(next.town.development.story).toMatchObject({
    route: "mechanical",
    chungnyeong: "dead",
  });
  expect(campaignPage(verdict).choices[0]?.label).toBe(
    "판결을 기록하고 의원으로",
  );
  expect(campaignPage(verdict).lines.flat().join(" ")).toContain(
    "충녕 마마가 돌아가셨어요",
  );
  expect(campaignPage(next).title).toBe("의원의 등잔");
  expect(
    updateCampaign({ ...next, elapsed: 11 * 1440 }).campaign?.ending,
  ).toBeNull();
});

it("legacy coexist verdict at pessimism 55 keeps playing at day 10", () => {
  const verdict = legacyCouncil("coexist", "verdict");
  const atDay10 = loadDevSave({
    ...verdict,
    elapsed: 10 * 1440,
    world: { ...verdict.world, day: 11 },
  });
  const next = commandTimber(
    atDay10,
    { type: "campaign", beat: "verdict", action: "next" },
    "verdict",
  );
  expect(next.town.development.story).toMatchObject({
    route: "flight",
    chungnyeong: "alive",
  });
  expect(next.campaign).toMatchObject({
    beat: "vigil",
    ending: null,
    lastHigh: 10 * 1440,
  });
  expect(next.town.cold).toBe(false);
  expect(campaignPage(next).goal).toContain("0 / 10일");
  const stable = { ...next, world: { ...next.world, pessimism: 30 } };
  expect(
    updateCampaign({ ...stable, elapsed: 20 * 1440 - 1 }).campaign?.ending,
  ).toBeNull();
  expect(
    updateCampaign({ ...stable, elapsed: 20 * 1440 }).campaign?.ending,
  ).toBe("hope");
});

it.each(["listen", "cordon"] as const)(
  "legacy rally retains the %s choice and its cost and morale effects",
  (action) => {
    const rally = legacyCouncil("coexist", "rally");
    const verdict = commandTimber(
      rally,
      { type: "campaign", beat: "rally", action },
      "rally",
    );
    expect(verdict.campaign?.beat).toBe("verdict");
    expect(verdict.town.development.story.route).toBeNull();
    expect(verdict.world.pessimism).toBe(action === "listen" ? 47 : 63);
    expect(
      rally.world.resources.RES_PLANT - verdict.world.resources.RES_PLANT,
    ).toBe(action === "listen" ? 12 * AMOUNT_SCALE : 0);
    expect(campaignPage(rally).choices.map((choice) => choice.action)).toEqual([
      "listen",
      "cordon",
    ]);
    expect(() =>
      commandTimber(
        rally,
        { type: "campaign", beat: "rally", action: "ally" },
        "ally",
      ),
    ).toThrow();
  },
);

it.each(["ward", "kitchen"] as const)(
  "legacy capital relief (%s) unlocks the seal after one day without a convoy",
  (relief) => {
    const village = createVillageGame(false, true);
    const load = (elapsed: number) =>
      loadDevSave({
        ...village,
        chapter: 3,
        campaign: { ...legacyCampaign(village), beat: "capital", relief },
        elapsed,
        world: {
          ...village.world,
          day: 2,
          minute: (village.world.minute + elapsed) % 1440,
        },
      });
    const readSeal = (s: ReturnType<typeof load>) =>
      commandTimber(
        s,
        { type: "campaign", beat: "capital", action: "next" },
        "read-seal",
      );
    const early = load(1439);
    expect(campaignPage(early).choices).toHaveLength(0);
    expect(() => readSeal(early)).toThrow();
    const ready = load(1440);
    expect(ready.world.citizens).toHaveLength(60);
    const seal = readSeal(ready);
    expect(seal.campaign?.beat).toBe("seal");
    expect(seal.campaign?.relief).toBe(relief);
    expect(seal.world.citizens).toEqual(ready.world.citizens);
    expect(seal.world.resources).toEqual(ready.world.resources);
    expect(seal.campaign?.evacuees).toBeUndefined();
    expect(seal.campaign?.cargo).toBeUndefined();
    expect(campaignPage(ready).choices).toContainEqual(
      expect.objectContaining({ action: "next", label: "왕의 봉서 펼치기" }),
    );
  },
);

it("legacy capital saves before relief can still choose a relief site", () => {
  const village = createVillageGame(false, true);
  const before = loadDevSave({
    ...village,
    chapter: 3,
    campaign: { ...legacyCampaign(village), beat: "capital" },
  });
  expect(campaignPage(before).choices.map(({ action }) => action)).toEqual([
    "ward",
    "kitchen",
  ]);
  const after = commandTimber(
    before,
    { type: "campaign", beat: "capital", action: "ward" },
    "relief",
  );
  expect(after.campaign?.relief).toBe("ward");
  expect(before.world.resources.RES_COAL - after.world.resources.RES_COAL).toBe(
    12 * AMOUNT_SCALE,
  );
});

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

it("기계 충녕은 결말에서만 처음 인사한다", () => {
  const s = createVillageGame();
  for (const prepared of [false, true]) {
    const page = campaignPage({
      ...s,
      chapter: 5,
      campaign: {
        ...s.campaign!,
        beat: "ending",
        ending: "escape",
        revivalPrepared: prepared,
      },
    });
    expect(page.clip).toBe(prepared ? "escape" : "mechanical-late");
    expect(page.lines.slice(-2)).toEqual([
      ["고리", "공주마마?"],
      ["충녕", "안.녕.하.세.요. 저.는. 충.녕.입.니.다."],
    ]);
  }
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

it("목진은 반란 당일 성문 습격 기록이 있을 때만 붉은 눈을 언급한다", () => {
  const base = createVillageGame();
  for (const beat of ["rally", "verdict"] as const) {
    for (const coupGateRaided of [undefined, false, true]) {
      const scene = campaignPage({
        ...base,
        chapter: 5,
        campaign: {
          ...base.campaign!,
          beat,
          revivalPrepared: false,
          ...(coupGateRaided === undefined ? {} : { coupGateRaided }),
        },
      });
      expect(scene.lines[0]?.[1].includes("붉은 눈")).toBe(
        Boolean(coupGateRaided),
      );
    }
  }
});

it("메카 연구가 남으면 영실이 공방 연구를 권한다", () => {
  const s = createVillageGame();
  s.town.development.story.chungnyeong = "dead";
  const p = campaignPage({
    ...s,
    chapter: 5,
    campaign: { ...s.campaign!, beat: "vigil", revivalPrepared: false },
  });
  expect(p.lines[0]).toEqual(["영실", expect.stringContaining("공방")]);
});

it.each([
  ["기존 저장", false, "alive"],
  ["시해가 기록된 저장", true, "dead"],
] as const)(
  "%s의 판결 대사는 충녕의 생사와 일치한다",
  (_, assassinated, health) => {
    const s = createVillageGame();
    const { victoryQuotes: _quotes, ...legacyCampaign } = s.campaign!;
    const verdict = recordResearchStory(
      {
        ...s,
        chapter: 5,
        campaign: {
          ...legacyCampaign,
          beat: "verdict",
          side: "coexist",
          uprising: true,
          ...(assassinated && { revivalPrepared: false }),
        },
      },
      "rebellion-started",
    );
    const saved = createTimberSave(
      assassinated
        ? recordResearchStory(verdict, "chungnyeong-assassinated")
        : verdict,
    );
    const restored = parseTimberSave(JSON.parse(JSON.stringify(saved))).state;
    const next = commandTimber(
      restored,
      { type: "campaign", beat: "verdict", action: "next" },
      "record-verdict",
    );

    expect(next.town.development.story.chungnyeong).toBe(health);
    expect(
      campaignPage(restored).lines.some(([, words]) =>
        words.includes("충녕 마마가 돌아가셨어요"),
      ),
    ).toBe(assassinated);
  },
);
