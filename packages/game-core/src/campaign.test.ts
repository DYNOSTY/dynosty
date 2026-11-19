import { expect, it } from "vitest";
import {
  campaignOf,
  campaignOutcome,
  emergencyRation,
  lostPatrol,
  newCampaign,
  returnedScouts,
  SETTLEMENTS,
  updateCampaign,
} from "./campaign.js";
import { RESEARCH_CATALOG } from "./development.js";
import { AMOUNT_SCALE } from "./play.js";
import { SCOUT_SITES } from "./scout-sites.js";
import {
  commandTimber,
  createTimberSave,
  createTimberState,
  createVillageGame,
  parseTimberSave,
  type TimberState,
} from "./timber.js";
import { payTown } from "./town.js";

const restore = (s: TimberState) =>
  parseTimberSave(JSON.parse(JSON.stringify(createTimberSave(s)))).state;
const act = (s: TimberState, action: string) =>
  commandTimber(
    s,
    { type: "campaign", beat: campaignOf(s).beat, action },
    `action-${s.processed.length}`,
  );
const later = (s: TimberState, minutes: number) =>
  updateCampaign({
    ...s,
    elapsed: s.elapsed + minutes,
    world: {
      ...s.world,
      day: s.world.day + Math.floor((s.world.minute + minutes) / 1440),
      minute: (s.world.minute + minutes) % 1440,
    },
  });

const withResearch = (s: TimberState, completed: string[]): TimberState => {
  const flight = completed.includes("TECH_FLIGHT");
  for (const tech of completed) {
    if (s.town.development.completed.includes(tech)) continue;
    const research = RESEARCH_CATALOG.find((r) => r.id === tech);
    if (!research) throw Error(`Unknown research: ${tech}`);
    s = payTown(s, research.cost);
  }
  const development = s.town.development;
  return {
    ...s,
    town: {
      ...s.town,
      development: {
        ...development,
        completed,
        story: flight
          ? { ...development.story, rebellion: true, route: "flight" }
          : development.story,
      },
    },
  };
};
const send = (s: TimberState, ...ids: string[]) =>
  commandTimber(s, { type: "scout-sites", ids }, `send-${s.processed.length}`);
const recall = (s: TimberState, id: string) =>
  commandTimber(
    s,
    { type: "scout-sites", ids: [id], recall: true },
    `recall-${id}`,
  );

it.each([
  { completed: [], minutes: 2160 },
  { completed: ["TECH_TRAIL"], minutes: 1440 },
  { completed: ["TECH_TRAIL", "TECH_SCOUT_SPEED_2"], minutes: 1080 },
  {
    completed: ["TECH_TRAIL", "TECH_SCOUT_SPEED_2", "R17", "TECH_FLIGHT"],
    minutes: 216,
  },
])(
  "applies $minutes minutes to map reports and recall after save/load",
  ({ completed, minutes }) => {
    const patrol = { ...createVillageGame(), campaign: newCampaign("patrol") };
    const sent = restore(send(withResearch(patrol, completed), "reed"));
    const before = later(sent, minutes - 1);
    expect(returnedScouts(before)).toEqual([]);
    expect(() => act(before, "report:reed")).toThrow();
    expect(recall(before, "reed").scoutDepartures?.reed).toBeUndefined();
    const due = later(before, 1);
    expect(returnedScouts(due).map(([id]) => id)).toEqual(["reed"]);
    expect(act(due, "report:reed").campaign?.reports).toEqual(["reed"]);
    expect(recall(due, "reed").scoutDepartures?.reed).toBe(
      sent.scoutDepartures?.reed,
    );
  },
);
it("preserves legacy and active timings until recall and redeparture", () => {
  const initial = { ...createVillageGame(), scoutDepartures: { reed: 540 } };
  const sent = send(withResearch(initial, ["TECH_TRAIL"]), "pine");
  const upgraded = restore(
    withResearch(later(sent, 60), ["TECH_TRAIL", "TECH_SCOUT_SPEED_2"]),
  );
  const duplicate = send(upgraded, "reed", "pine");
  expect(duplicate.scoutDepartures).toEqual(sent.scoutDepartures);
  expect(returnedScouts(later(duplicate, 1920 - 61))).toEqual([]);
  expect(returnedScouts(later(duplicate, 1920 - 60)).map(([id]) => id)).toEqual(
    ["pine"],
  );
  expect(returnedScouts(later(duplicate, 2160 - 60)).map(([id]) => id)).toEqual(
    ["reed", "pine"],
  );

  const resent = restore(send(recall(duplicate, "pine"), "pine"));
  expect(returnedScouts(later(resent, 1439))).toEqual([]);
  expect(returnedScouts(later(resent, 1440)).map(([id]) => id)).toEqual([
    "pine",
  ]);
});

it("uses the saved return schedule for chapter two in non-campaign saves", () => {
  const initial = withResearch(createTimberState(), ["TECH_TRAIL"]);
  const sent = send(initial, ...SCOUT_SITES.map(({ id }) => id));
  const begin = (s: TimberState) =>
    commandTimber(s, { type: "begin-chapter-two" }, "begin");
  expect(() => begin(later(sent, 2399))).toThrow(/정찰 결과/);
  expect(begin(later(sent, 2400)).chapter).toBe(2);
});

it.each([
  { reed: 0 },
  { reed: -1 },
  { reed: 1.5 },
  { reed: 2161 },
  { pine: 1920 },
  { invalid: 50 },
])("rejects invalid saved scout durations %j", (scoutTripDurations) => {
  const initial = { ...createVillageGame(), scoutDepartures: { reed: 540 } };
  expect(() =>
    parseTimberSave({
      ...createTimberSave(initial),
      state: { ...initial, scoutTripDurations },
    }),
  ).toThrow();
});

it("출문 전후의 실제 장부와 정찰 희생, 교섭, 호송, 보름 혹한과 열흘 평가를 이어 저장한다", () => {
  let s = restore(createVillageGame(true));
  expect(s.residents).toHaveLength(600);
  expect(new Set(Object.values(s.world.resources))).toEqual(
    new Set([10000 * AMOUNT_SCALE]),
  );
  s = restore(act(s, "next"));
  s = act(s, "leave");
  expect(s.world.pessimism).toBe(30);
  expect(s.homes).toHaveLength(2);
  expect(s.residents).toHaveLength(60);
  expect(new Set(Object.values(s.world.resources))).toEqual(
    new Set([1000 * AMOUNT_SCALE]),
  );
  s = act(s, "next");
  s = commandTimber(
    s,
    { type: "scout-sites", ids: SCOUT_SITES.map((x) => x.id) },
    "send",
  );
  expect(() => act(s, "next")).toThrow();
  s = later(s, 60 * 60);
  for (const x of SCOUT_SITES) {
    s = restore(act(s, x.id === lostPatrol(s) ? "recover" : "report:" + x.id));
  }
  expect(s.world.citizens.filter((c) => !c.alive)).toHaveLength(2);
  expect(s.scoutVisitors).toBe(1);
  expect(() => act(s, "recover")).toThrow();
  s = act(s, "next");
  for (const [i, v] of SETTLEMENTS.entries()) {
    s = act(s, "send:" + i);
    expect(() => act(s, "send:" + i)).toThrow();
    s = restore(later(s, v.hours * 60));
  }
  s = act(s, "next");
  s = act(s, "ward");
  expect(() => act(s, "next")).toThrow();
  s = act(later(s, 1440), "next");
  s = act(s, "next");
  s = act(s, "invite");
  expect(s.world.citizens.filter((c) => c.alive)).toHaveLength(68);
  expect(() => act(s, "winter")).toThrow();
  s = later(s, 15 * 1440);
  expect(s.town.cold).toBe(true);
  s = later(s, 15 * 1440);
  s = act(s, "next");
  let hope = act(act(s, "coexist"), "next");
  expect(hope.campaign?.uprising).toBe(false);
  hope = later(hope, 10 * 1440 - 1);
  expect(campaignOutcome(hope)).toBeNull();
  hope = later(hope, 1);
  expect(restore(act(hope, "finish")).campaign?.ending).toBe("hope");
  let control = act({ ...s, world: { ...s.world, pessimism: 55 } }, "control");
  expect(control.campaign?.beat).toBe("rally");
  expect(() => act(control, "next")).toThrow();
  control = act(control, "listen");
  expect(control.world.pessimism).toBe(48);
  control = act(control, "next");
  expect(control.town.development.story.chungnyeong).toBe("dead");
  control = later(control, 10 * 1440);
  expect(campaignOutcome(control)).toBeNull();
  control = payTown(control, { RES_WOOD: 60, RES_METAL: 54, RES_COAL: 16 });
  const development = control.town.development;
  const escaped = updateCampaign({
    ...control,
    town: {
      ...control.town,
      development: {
        ...development,
        completed: ["R17", "R18", "TECH_MECHA2", "R19"],
        story: { ...development.story, chungnyeong: "mechanical" },
      },
    },
  });
  expect(restore(escaped).campaign?.ending).toBe("escape");
  expect(
    restore(
      updateCampaign({
        ...control,
        world: { ...control.world, pessimism: 91 },
      }),
    ).campaign?.ending,
  ).toBeNull();
});

it.each([1, 2, 3, 4, 5] as const)(
  "단계 %i에서 99는 버티고 100에 닿으면 난이도에 따라 추방된다",
  (chapter) => {
    const base = createVillageGame();
    const s = restore({
      ...base,
      ...(chapter === 1 ? {} : { chapter }),
      campaign: newCampaign(
        (["patrol", "roads", "capital", "winter", "vigil"] as const)[
          chapter - 1
        ]!,
      ),
      world: { ...base.world, pessimism: 99 },
    });
    expect(campaignOutcome(s)).toBeNull();
    const grace = act(s, "reserve");
    expect(grace.campaign?.ending).toBeNull();
    const before = restore(later(grace, 1439));
    expect(before.campaign?.ending).toBeNull();
    expect(later(before, 1).campaign?.ending).toBe("collapse");
    const recovered = updateCampaign({
      ...before,
      world: { ...before.world, pessimism: 99 },
    });
    const relapse = updateCampaign({
      ...recovered,
      world: { ...recovered.world, pessimism: 100 },
    });
    expect(later(relapse, 1).campaign?.ending).toBeNull();
    const end = act(
      { ...s, campaign: { ...s.campaign!, difficulty: "hard" } },
      "reserve",
    );
    expect(end.elapsed).toBe(s.elapsed);
    expect(end.paused).toBe(true);
    expect(restore(end).campaign?.ending).toBe("collapse");
  },
);
it("지지가 완전히 사라진 상태는 저장을 이어 24시간 지속될 때 추방한다", () => {
  const start = {
    ...createVillageGame(),
    chapter: 5 as const,
    campaign: newCampaign("vigil"),
  };
  const set = (s: TimberState, optimism: number) =>
    updateCampaign({ ...s, world: { ...s.world, optimism } });
  const hard = restore({
    ...start,
    campaign: { ...start.campaign, difficulty: "hard" },
  });
  expect(set(hard, 1).campaign?.ending).toBeNull();
  const expelled = set(hard, 0);
  expect(expelled.elapsed).toBe(hard.elapsed);
  expect(restore(expelled).campaign?.ending).toBe("collapse");
  const before = later(restore(set(start, 0)), 1439);
  expect(before.campaign?.ending).toBeNull();
  expect(later(restore(before), 1).campaign?.ending).toBe("collapse");
  const reset = set(set(before, 1), 0);
  expect(later(reset, 1).campaign?.ending).toBeNull();
  expect(later(reset, 1440).campaign?.ending).toBe("collapse");
});
it("주민 청은 하루 한 번만 비용과 민심을 바꾸고 이전 저장의 출문은 재연하지 않는다", () => {
  const s = createVillageGame();
  const n = act(s, "share");
  expect(n.world.resources.RES_FISH).toBe(
    s.world.resources.RES_FISH - 4 * AMOUNT_SCALE,
  );
  expect(() => act(n, "reserve")).toThrow();
  expect(act(later(n, 1440), "reserve").world.pessimism).toBe(6);
  const old = createTimberState();
  expect(campaignOf(old).beat).toBe("patrol");
  expect(campaignOf({ ...old, chapter: 2 }).beat).toBe("roads");
  expect(() =>
    restore({ ...s, campaign: { ...newCampaign("patrol"), treaties: [1, 1] } }),
  ).toThrow();
});

it.each(["control", "coexist"] as const)(
  "식량 위기에서 %s 비상 배급의 비용과 하루 집행 기록을 보존한다",
  (side) => {
    const base = createVillageGame();
    const s: TimberState = {
      ...base,
      chapter: 5,
      campaign: { ...newCampaign("vigil"), side },
      world: {
        ...base.world,
        pessimism: 20,
        resources: { ...base.world.resources, RES_MEAT: 0 },
      },
    };
    const target = emergencyRation(s);
    expect(target).toBeTruthy();
    const action = `ration:${s.world.day}:${target}`;
    const n = restore(act(s, action));
    expect(n.world.resources.RES_MEAT).toBe(8 * AMOUNT_SCALE);
    expect(n.world.resources.RES_WOOD).toBe(
      s.world.resources.RES_WOOD - (side === "coexist" ? 12 * AMOUNT_SCALE : 0),
    );
    expect(n.world.citizens.filter((p) => p.alive)).toHaveLength(
      s.world.citizens.length - (side === "control" ? 1 : 0),
    );
    expect(n.world.pessimism).toBe(side === "control" ? 32 : 18);
    expect(emergencyRation(n)).toBeUndefined();
    expect(() => act(n, action)).toThrow();
    expect(emergencyRation(later(n, 1440))).toBeTruthy();
  },
);

it("재건 중 순라 인원과 배식소 부상을 실제 주민에게 기록한다", () => {
  let s = createVillageGame(false, true);
  for (const count of [4, 8, 16, 4, 0] as const) {
    s = commandTimber(
      s,
      { type: "set-guards", count },
      "guards-" + s.processed.length,
    );
    expect(
      restore(s).residents.filter((r) => r.workplaceId === "office"),
    ).toHaveLength(count);
  }
  s = commandTimber(s, { type: "set-ration-policy", policy: "cap" }, "decree");
  expect(s.decree?.title).toBe("식단별 배급 상한");
  expect(s.world.pessimism).toBe(31);
  s = commandTimber(s, { type: "set-ration-policy", policy: "cap" }, "same");
  expect(s.decree?.serial).toBe(1);
  s = commandTimber(
    { ...s, restaurantBuilt: true, logging: { ...s.logging, built: true } },
    { type: "advance", minutes: 1 },
    "fight",
  );
  expect(s.openingFight).toBe(true);
  expect(s.world.citizens.filter((r) => r.health === "sick")).toHaveLength(2);
});
