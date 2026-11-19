import { expect, it } from "vitest";
import {
  campaignOf,
  campaignOutcome,
  lostPatrol,
  newCampaign,
  SETTLEMENTS,
  updateCampaign,
} from "./campaign.js";
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
it("출문 전후의 실제 장부와 정찰 희생, 교섭, 호송, 보름 혹한과 열흘 평가를 이어 저장한다", () => {
  let s = restore(createVillageGame(true));
  expect(s.residents).toHaveLength(300);
  expect(new Set(Object.values(s.world.resources))).toEqual(
    new Set([10000 * AMOUNT_SCALE]),
  );
  s = restore(act(s, "next"));
  s = act(s, "leave");
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
  expect(control.world.pessimism).toBe(47);
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

it.each([
  ["pessimism", 100, 99],
  ["optimism", 0, 1],
] as const)(
  "%s 극단값이 24시간 연속일 때만 추방하고 저장·회복을 처리한다",
  (metric, extreme, recovered) => {
    const start = {
      ...createVillageGame(),
      chapter: 5 as const,
      campaign: newCampaign("vigil"),
    };
    const set = (s: TimberState, value: number) =>
      updateCampaign({ ...s, world: { ...s.world, [metric]: value } });
    const before = later(restore(set(start, extreme)), 1439);
    expect(before.campaign?.ending).toBeNull();
    expect(later(restore(before), 1).campaign?.ending).toBe("collapse");
    const reset = set(set(before, recovered), extreme);
    expect(later(reset, 1).campaign?.ending).toBeNull();
    expect(later(reset, 1440).campaign?.ending).toBe("collapse");
  },
);
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
