import { expect, it, vi } from "vitest";
import {
  CAPITAL_MINUTES,
  CONVOY_ITEMS,
  campaignOf,
  campaignOutcome,
  convoyLoad,
  emergencyRation,
  lostPatrol,
  minutesUntilCoup,
  newCampaign,
  returnedScouts,
  SETTLEMENTS,
  updateCampaign,
} from "./campaign.js";
import { RESEARCH_CATALOG } from "./development.js";
import { AMOUNT_SCALE, PlayDataError } from "./play.js";
import { requireValue } from "./require-value.js";
import { SCOUT_SITES } from "./scout-sites.js";
import {
  advanceTimber,
  capitalRoad,
  commandTimber,
  createTimberSave,
  createTimberState,
  createVillageGame,
  gateRaid,
  parseTimberSave,
  TIMBER_RULES,
  type TimberState,
  villageFatalIncident,
  villageTemperature,
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

it("남문 세 행렬을 인계한 뒤 같은 복홀에서 공방 연구와 세 엔딩을 끝까지 진행한다", () => {
  let s = restore(createVillageGame(true));
  expect(s.residents).toHaveLength(600);
  expect(new Set(Object.values(s.world.resources))).toEqual(
    new Set([10000 * AMOUNT_SCALE, 200 * AMOUNT_SCALE]),
  );
  s = restore(act(s, "next"));
  s = act(s, "leave");
  expect(s.world.pessimism).toBe(30);
  expect(s.homes).toHaveLength(2);
  expect(s.residents).toHaveLength(60);
  expect(new Set(Object.values(s.world.resources))).toEqual(
    new Set([1000 * AMOUNT_SCALE, 20 * AMOUNT_SCALE]),
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
    if (x.id !== lostPatrol(s)) {
      s = restore(act(s, "report:" + x.id));
      continue;
    }
    const roll = vi.spyOn(Math, "random");
    try {
      for (const [draw, increase] of [
        [0.49, 1],
        [0.5, 0],
      ] as const) {
        roll.mockReturnValue(draw);
        const stayed = restore(act(s, "remember"));
        expect(stayed.world.pessimism).toBe(s.world.pessimism + increase);
        expect(stayed.campaign?.recoveryDue).toBeNull();
        expect(stayed.residents.some((r) => r.task === "patrol-recovery")).toBe(
          false,
        );
      }
    } finally {
      roll.mockRestore();
    }
    const before = restore({
      ...s,
      logging: { ...s.logging, built: true, target: 2 },
      residents: s.residents.map((r, i) =>
        i < 2 ? { ...r, workplaceId: "logging" } : r,
      ),
    });
    s = restore(act(before, "recover"));
    expect(s.world.optimism).toBe(before.world.optimism + 1);
    const roster = s.residents.filter((r) => r.task === "patrol-recovery");
    expect(roster).toHaveLength(2);
    expect(roster.every((r) => r.workplaceId === "logging")).toBe(true);
    const workingDay = commandTimber(
      s,
      { type: "advance", minutes: 30 },
      "work",
    );
    expect(workingDay.logging.progress).toBe(before.logging.progress);
    expect(workingDay.logging.buffer).toBe(before.logging.buffer);
    const lastMinute = later(
      workingDay,
      requireValue(
        requireValue(s.campaign, "s.campaign").recoveryDue,
        "s.campaign.recoveryDue",
      ) -
        workingDay.elapsed -
        1,
    );
    expect(
      lastMinute.residents.filter((r) => r.task === "patrol-recovery"),
    ).toHaveLength(2);
    const back = restore(
      commandTimber(lastMinute, { type: "advance", minutes: 1 }, "return"),
    );
    expect(back.campaign?.recoveryDue).toBeNull();
    expect(
      back.residents
        .filter((r) => roster.some((member) => member.id === r.id))
        .every((r) => r.workplaceId === "logging" && !r.task),
    ).toBe(true);
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
  expect(s.residents).toHaveLength(1000);
  expect(s.residents.every((r) => r.homeId)).toBe(true);
  expect(s.town.facilities.length).toBeGreaterThan(10);
  expect(s.town.development.completed).toContain("UPGRADE_HOSPITAL_2");
  const city = restore(s);
  const hospital = requireValue(
    city.town.facilities.find((f) => f.kind === "hospital" && f.level === 2),
    "병원",
  );
  expect(() =>
    act({ ...city, mutantDamage: { [hospital.id]: 100 } }, "share"),
  ).toThrow("병원");
  const decree = act(city, "share");
  expect(() => act(later(decree, 719), "reserve")).toThrow();
  expect(act(later(decree, 720), "reserve").campaign?.lastPolicyAt).toBe(
    decree.elapsed + 720,
  );
  s = act(s, "report");
  expect(() => act(s, "next")).toThrow();
  expect(() => act(later(s, 359), "open-stores")).toThrow();
  const firstBatch = act(later(s, 360), "open-stores");
  const coalBefore = firstBatch.world.resources.RES_COAL;
  const loaded = restore(act(firstBatch, "load:RES_COAL"));
  expect(loaded.world.resources.RES_COAL).toBe(
    coalBefore - 1000 * AMOUNT_SCALE,
  );
  expect(loaded.campaign?.cargo?.RES_COAL).toBe(1000);
  s = act(later(s, 1440), "open-stores");
  expect(() => act(s, "open-stores")).toThrow();
  for (let trip = 1; trip <= 3; trip++) {
    expect(() => act(s, "dispatch:" + trip)).toThrow();
    for (const item of CONVOY_ITEMS)
      while (convoyLoad(s, item) > 0) s = act(s, "load:" + item);
    expect(() => act(s, "next")).toThrow();
    if (trip === 3) {
      expect(() => act(s, "dispatch:3")).toThrow();
      for (let i = 0; i < 4; i++) s = act(s, "muster");
    }
    s = restore(act(s, "dispatch:" + trip));
    expect(s.campaign?.departures).toBe(trip);
    expect(() => act(s, "dispatch:" + trip)).toThrow();
  }
  s = act(restore(s), "next");
  s = act(s, "next");
  s = act(s, "invite");
  expect(s.world.citizens.filter((c) => c.alive)).toHaveLength(68);
  expect(() => act(s, "winter")).toThrow();
  s = later(s, 15 * 1440);
  expect(s.town.cold).toBe(true);
  s = later(s, 15 * 1440);
  const beforeArrival = s.world.resources;
  const arrival = { type: "campaign", beat: "thaw", action: "next" } as const;
  s = commandTimber(restore(s), arrival, "arrive-at-bokhol");
  s = restore(s);
  expect(s.chapter).toBe(5);
  expect(commandTimber(s, arrival, "arrive-at-bokhol")).toEqual(s);
  expect(() => commandTimber(s, arrival, "repeat-arrival")).toThrow(
    "이미 지난 장면",
  );
  for (const [item, units] of [
    ["RES_WOOD", 3000],
    ["RES_MEAT", 1500],
    ["RES_FISH", 1500],
    ["RES_COAL", 1800],
  ] as const)
    expect(s.world.resources[item] - beforeArrival[item]).toBe(
      units * AMOUNT_SCALE,
    );
  expect(s.world.citizens.filter((p) => p.alive)).toHaveLength(188);
  expect(s.town.received.RES_COAL).toBeGreaterThanOrEqual(1800);
  s = restore(s);
  const command = (
    state: TimberState,
    cmd: Parameters<typeof commandTimber>[1],
  ) => commandTimber(state, cmd, "run-" + state.processed.length);
  const day = (state: TimberState) =>
    command(state, { type: "advance", minutes: 1440 });
  const roll = vi.spyOn(Math, "random").mockReturnValue(0.99);
  try {
    // Hold nightly incidents constant to compare the three choices on the same arriving convoy.
    s = act(s, "coexist");
    for (
      let d = 0;
      d < 6 && minutesUntilCoup(s) > 1 && s.campaign?.beat === "forecast";
      d++
    ) {
      s = command(s, {
        type: "advance",
        minutes: Math.min(1440, minutesUntilCoup(s) - 1),
      });
    }
    expect(minutesUntilCoup(s)).toBe(1);
    for (const [optimism, action, ending] of [
      [69, "resist", "escape"],
      [70, "resist", "hope"],
      [70, "ally", "order"],
    ] as const) {
      const rally = restore(
        command(
          { ...s, world: { ...s.world, optimism } },
          { type: "advance", minutes: 1 },
        ),
      );
      let run = act(act(rally, action), "next");
      if (ending === "escape") {
        expect(run.town.development.story.chungnyeong).toBe("dead");
        run = command(run, {
          type: "plan-building",
          kind: "workshop",
          position: { x: 12, z: 12 },
          headingRadians: Math.PI,
        });
        for (
          let d = 0;
          d < 3 && !run.town.facilities.some((f) => f.kind === "workshop");
          d++
        )
          run = day(run);
        const lab = requireValue(
          run.town.facilities.find((f) => f.kind === "workshop"),
          "시나리오 대상",
        );
        run = command(run, { type: "facility-staff", id: lab.id, count: 2 });
        for (const tech of ["R17", "R18", "TECH_MECHA2"]) {
          expect(run.campaign?.ending).toBeNull();
          run = restore(command(run, { type: "start-research", tech }));
          for (
            let d = 0;
            d < 10 && !run.town.development.completed.includes(tech);
            d++
          )
            run = day(run);
          expect(run.town.development.completed).toContain(tech);
        }
      }
      for (let d = 0; d < 12 && !run.campaign?.ending; d++) run = day(run);
      expect(restore(run).campaign?.ending).toBe(ending);
    }
  } finally {
    roll.mockRestore();
  }
}, 120_000);

it("도성은 민심과 관계없이 세 번째 수레를 보내지 못한 채 36시간이 지나면 함락된다", () => {
  const base = createVillageGame();
  const city: TimberState = {
    ...base,
    bokhol: { ...base, campaign: { ...campaignOf(base), beat: "roads" } },
    chapter: 3,
    elapsed: 300,
    campaign: {
      ...newCampaign("capital", 300),
      capitalDue: 300 + CAPITAL_MINUTES,
      difficulty: "hard",
    },
    world: { ...base.world, pessimism: 100 },
  };
  const before = restore(later(city, 36 * 60 - 1));
  expect(before.campaign?.ending).toBeNull();
  expect(later(before, 1).campaign?.ending).toBe("collapse");
  expect(
    later({ ...before, campaign: { ...campaignOf(before), departures: 3 } }, 1)
      .campaign?.ending,
  ).toBeNull();
});
it("도성 기한 이전의 저장은 불러온 때부터 36시간을 주고, 이후 저장은 기한을 유지한다", () => {
  const base = createVillageGame();
  const legacy: TimberState = {
    ...base,
    bokhol: { ...base, campaign: { ...campaignOf(base), beat: "roads" } },
    chapter: 3,
    elapsed: 300 + 3 * 1440,
    campaign: newCampaign("capital", 300),
  };
  const loaded = restore(legacy);
  expect(campaignOf(loaded).capitalDue).toBe(legacy.elapsed + CAPITAL_MINUTES);
  expect(later(loaded, 1).campaign?.ending).toBeNull();
  const halfway = restore(later(loaded, CAPITAL_MINUTES / 2));
  expect(campaignOf(halfway).capitalDue).toBe(legacy.elapsed + CAPITAL_MINUTES);
  expect(later(halfway, CAPITAL_MINUTES / 2).campaign?.ending).toBe("collapse");
});
it.each([1, 2, 4, 5] as const)(
  "단계 %i에서 99는 버티고 100에 닿으면 난이도에 따라 추방된다",
  (chapter) => {
    const base = createVillageGame();
    const s = restore({
      ...base,
      ...(chapter === 1 ? {} : { chapter }),
      campaign: newCampaign(
        requireValue(
          (["patrol", "roads", "capital", "winter", "vigil"] as const)[
            chapter - 1
          ],
          "(['patrol', 'roads', 'capital', 'winter', 'vigil'] as c",
        ),
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
      { ...s, campaign: { ...campaignOf(s), difficulty: "hard" } },
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

it("마을 사망 사고는 해당 환경에서 한 명에게만 발생하고 저장 후 중복되지 않는다", () => {
  const start = createVillageGame(false, true);
  expect(villageFatalIncident(start, () => 0)).toBe(start);
  const night = { ...start, world: { ...start.world, minute: 1080 } };
  expect(villageFatalIncident(night, () => 0.01)).toBe(night);
  const attack = restore(villageFatalIncident(night, () => 0));
  expect(attack.history.at(-1)?.text).toContain("피습");
  expect(attack.world.citizens.filter((r) => !r.alive)).toHaveLength(1);
  expect(villageFatalIncident(attack, () => 0)).toBe(attack);
  const cold = {
    ...night,
    town: { ...night.town, cold: true },
  };
  expect(
    villageFatalIncident(
      cold,
      vi.fn().mockReturnValueOnce(0).mockReturnValue(0.999),
    ).history.at(-1)?.text,
  ).toContain("동상");
});

it("온돌 연료를 매시간 결제하고 성문 전투 결과와 삽화를 저장한다", () => {
  let s = createVillageGame(false, true);
  expect(villageTemperature(s)).toBeGreaterThan(0);
  s = commandTimber(s, { type: "set-gate", count: 4 }, "gate");
  expect(s.residents.filter((r) => r.workplaceId === "gate")).toHaveLength(4);
  s = commandTimber(s, { type: "set-heating", level: 3 }, "heat");
  const wood = s.world.resources.RES_WOOD;
  const coal = s.world.resources.RES_COAL;
  s = commandTimber(s, { type: "advance", minutes: 60 }, "hour");
  expect(s.firedHeat).toBe(3);
  expect(s.world.resources.RES_COAL).toBe(coal);
  expect(s.world.resources.RES_WOOD).toBe(
    wood -
      new Set(s.residents.map((r) => r.homeId).filter(Boolean)).size *
        3 *
        AMOUNT_SCALE,
  );
  expect(gateRaid(s, () => 0)).toBe(s);
  s = { ...s, world: { ...s.world, minute: 1260 } };
  for (const [difficulty, threshold] of [
    ["easy", 0.075],
    ["normal", 0.15],
    ["hard", 0.75],
  ] as const) {
    const state = { ...s, campaign: { ...campaignOf(s), difficulty } };
    expect(gateRaid(state, () => threshold)).toBe(state);
    expect(gateRaid(state, () => threshold - 0.0001).raid).toBeDefined();
  }
  const safe = restore(
    gateRaid(s, vi.fn().mockReturnValueOnce(0).mockReturnValue(0.99)),
  );
  expect(safe.raid).toMatchObject({ picture: 5, dead: 0, injured: 0 });
  const raid = restore(gateRaid(s, () => 0));
  expect(raid.raid).toMatchObject({ picture: 0, dead: 2, injured: 0 });
  expect(raid.world.citizens.filter((r) => !r.alive)).toHaveLength(2);
  expect(
    commandTimber(raid, { type: "dismiss-raid" }, "read").raid,
  ).toBeUndefined();
});

it("영상, 충분한 난방, 연료 부족과 장기 굶주림을 구별한다", () => {
  const s = createVillageGame(false, true);
  const cold = {
    ...s,
    town: { ...s.town, cold: true },
    world: { ...s.world, minute: 840 },
  };
  expect(villageTemperature(cold)).toBeLessThan(0);
  const housed = createVillageGame();
  const sheltered = {
    ...housed,
    rebuilding: true,
    town: { ...housed.town, cold: true },
    world: { ...housed.world, minute: 840 },
    firedHeat: 3,
  };
  const safe = villageFatalIncident(sheltered, () => 0);
  expect(
    safe.residents.filter((r) => r.homeId && r.health === "dead"),
  ).toHaveLength(0);
  const hungry = {
    ...s,
    residents: s.residents.map((r, i) =>
      i === 0 ? { ...r, hunger: 2880 } : r,
    ),
  };
  expect(villageFatalIncident(hungry, () => 0).history.at(-1)?.text).toContain(
    "굶주림",
  );
  const poor = payTown(cold, { RES_WOOD: 999 });
  const heated = commandTimber(
    { ...poor, heating: 3 },
    { type: "advance", minutes: 60 },
    "low-fuel",
  );
  expect(heated.firedHeat).toBe(1);
  expect(heated.world.resources.RES_WOOD).toBe(0);
});

it("도성 한파가 길을 막고 집마다 불을 올리며 환자를 낸다", () => {
  const base = createVillageGame(false, true);
  const city: TimberState = {
    ...base,
    campaign: { ...campaignOf(base), beat: "capital", since: 0 },
    chapter: 3,
  };
  expect(capitalRoad(city)).toBe("open");
  const late = later(city, 1439);
  expect(capitalRoad(late)).toBe("closed");
  expect(() => commandTimber(late, { type: "contract" }, "closed")).toThrow(
    "고갯길",
  );
  const end = commandTimber(
    late,
    { type: "advance", minutes: 1 },
    "winter-hour",
  );
  expect(end.firedHeat).toBe(3);
  expect(end.world.resources.RES_COAL).toBeLessThan(
    late.world.resources.RES_COAL,
  );
  expect(end.world.citizenEvents).toContain("capital-cold-1440");
});

it.each([
  "coal only",
  "mixed fuel",
  "wood fallback with a repair reservation",
  "insufficient fuel with a repair reservation",
  "reserved wood only",
] as const)("settles capital ondol fuel: %s", (scenario) => {
  const base = createVillageGame(false, true);
  let city = later(
    { ...base, campaign: newCampaign("capital"), chapter: 3 },
    59,
  );
  city = commandTimber(city, { type: "set-heating", level: 1 }, "heat");
  const homes = city.homes.filter((home) =>
    city.residents.some((resident) => resident.homeId === home.id),
  );
  expect(homes).toHaveLength(2);
  const [coal, freeWood, reserved, coalLeft, freeWoodLeft] = (
    {
      "coal only": [3, 0, 0, 1, 0],
      "mixed fuel": [1, 5, 0, 0, 2],
      "wood fallback with a repair reservation": [0, 8, 20, 0, 2],
      "insufficient fuel with a repair reservation": [1, 2, 20, 0, 2],
      "reserved wood only": [0, 0, 20, 0, 0],
    } as const
  )[scenario];
  city = payTown(city, {
    RES_COAL: city.world.resources.RES_COAL / AMOUNT_SCALE - coal,
    RES_WOOD:
      city.world.resources.RES_WOOD / AMOUNT_SCALE - freeWood - reserved,
  });
  if (reserved) {
    // Start from a settled procurement ledger, then reserve wood through the repair command.
    city = commandTimber(
      {
        ...city,
        phase: "ready",
        offer: "B",
        contractId: "settled-contract",
        transportWorkerId: city.residents[0]?.id ?? null,
        mission: "register-policy",
        settledAt: city.elapsed,
        initialWood: city.initialWood - 20 * AMOUNT_SCALE,
        initialIron:
          city.initialIron + TIMBER_RULES.offers.B.cost * AMOUNT_SCALE,
        stock: { ...city.stock, available: 20 },
      },
      { type: "building-damage", cause: "fire", amount: 25 },
      "damage",
    );
    city = commandTimber(city, { type: "use" }, "repair");
    expect(city.reservedWood).toBe(reserved);
  }
  const end = commandTimber(
    restore(city),
    { type: "advance", minutes: 1 },
    "hour",
  );
  expect(end.world.resources.RES_COAL).toBe(coalLeft * AMOUNT_SCALE);
  expect(end.world.resources.RES_WOOD).toBe(
    (reserved + freeWoodLeft) * AMOUNT_SCALE,
  );
  expect(end.reservedWood).toBe(reserved);
  expect(end.firedHeat).toBe(scenario === "reserved wood only" ? 0 : 1);
  expect(end.warmerHomes).toEqual(
    scenario === "insufficient fuel with a repair reservation"
      ? homes.slice(0, 1).map((home) => home.id)
      : [],
  );
});

it.each([
  [69, "resist", "dead", null],
  [70, "resist", "alive", "hope"],
  [69, "ally", "dead", "order"],
  [70, "ally", "dead", "order"],
] as const)("반란 당시 희망 %i, 선택 %s", (optimism, action, life, ending) => {
  const start = createVillageGame();
  const chosen = act(
    {
      ...start,
      chapter: 5,
      campaign: newCampaign("summit"),
      world: { ...start.world, optimism },
    },
    "control",
  );
  const rally = restore(later(chosen, minutesUntilCoup(chosen)));
  expect(rally.campaign?.beat).toBe("rally");
  expect(rally.town.development.story.rebellion).toBe(true);
  const verdict = act(
    { ...rally, world: { ...rally.world, optimism: 50 } },
    action,
  );
  expect(verdict.town.development.story.chungnyeong).toBe(life);
  expect(restore(later(act(verdict, "next"), 11 * 1440)).campaign?.ending).toBe(
    ending,
  );
});

it("단계별 경구 추첨을 저장하고 이어 할 때 같은 경구를 보여준다", () => {
  const state = createVillageGame();
  const roll = vi.spyOn(Math, "random").mockReturnValue(0.99);
  try {
    const campaign = newCampaign("patrol");
    expect(campaign.victoryQuotes).toEqual([9, 9, 9, 9, 9]);
    expect(restore({ ...state, campaign }).campaign?.victoryQuotes).toEqual(
      campaign.victoryQuotes,
    );
  } finally {
    roll.mockRestore();
  }
});

it("첫밤과 이튿밤에 변종 없이 지나가도 닷새째 반란이 시작되고 저장 후 야습을 재처리하지 않는다", () => {
  const start = createVillageGame(false, true);
  const base = act(
    { ...start, chapter: 5, campaign: newCampaign("summit") },
    "coexist",
  );
  const first = minutesUntilCoup(base) - 4 * 1440;
  const roll = vi.spyOn(Math, "random").mockReturnValue(0.99);
  try {
    for (const night of [1, 2, 5]) {
      const before = later(base, first + (night - 1) * 1440 - 1);
      const after = commandTimber(
        restore(before),
        { type: "advance", minutes: 1 },
        "scheduled-night",
      );
      expect(after.world.minute).toBe(1260);
      expect(after.mutants ?? []).toHaveLength(0);
      expect(after.raid).toBeUndefined();
      const resumed = restore(after);
      expect(
        commandTimber(
          resumed,
          { type: "advance", minutes: 1 },
          "scheduled-night",
        ),
      ).toEqual(resumed);
      expect(after.campaign?.beat).toBe(night === 5 ? "rally" : "forecast");
    }
  } finally {
    roll.mockRestore();
  }
});

it("닷새째 밤 습격 기록은 저장하거나 성문 보고를 닫아도 판결까지 남는다", () => {
  const start = createVillageGame(false, true);
  const chosen = act(
    {
      ...start,
      chapter: 5,
      world: { ...start.world, pessimism: 55 },
      campaign: newCampaign("summit"),
    },
    "control",
  );
  const before = later(chosen, minutesUntilCoup(chosen) - 1);
  for (const draw of [0, 0.99]) {
    const roll = vi.spyOn(Math, "random").mockReturnValue(draw);
    try {
      let state = commandTimber(
        restore(before),
        { type: "advance", minutes: 1 },
        "coup-night",
      );
      expect(Boolean(state.campaign?.coupGateRaided)).toBe(draw === 0);
      if (state.raid)
        state = commandTimber(state, { type: "dismiss-raid" }, "read");
      state = restore(act(restore(state), "listen"));
      expect(state.campaign?.beat).toBe("verdict");
      expect(Boolean(state.campaign?.coupGateRaided)).toBe(draw === 0);
    } finally {
      roll.mockRestore();
    }
  }
});

it("첫 배급령이 기존 배급 방식과 같아도 방과 주민 반응을 한 번만 기록한다", () => {
  const start = createVillageGame();
  const policy = {
    type: "set-ration-policy",
    policy: start.rationPolicy,
  } as const;
  const first = commandTimber(start, policy, "first-decree");
  expect(first.decree?.title).toBe("필요량에 따른 배급");
  expect(first.decree?.serial).toBe(1);
  expect(first.world.optimism).toBe(start.world.optimism + 1);
  const again = commandTimber(restore(first), policy, "same-decree");
  expect(again.decree).toEqual(first.decree);
  expect(again.world.optimism).toBe(first.world.optimism);
});

it("자동 화재와 추방이 같은 분에 일어나면 그 분에서 멈춘다", () => {
  const base = createVillageGame(false, true);
  const state: TimberState = {
    ...base,
    elapsed: 1439,
    openingFight: true,
    campaign: { ...newCampaign("vigil"), pessimismExtremeSince: 0 },
    world: { ...base.world, minute: 1439, pessimism: 100 },
  };
  const random = vi.spyOn(Math, "random").mockReturnValue(0.2);
  try {
    random.mockReturnValueOnce(0.2).mockReturnValueOnce(0.8);
    const result = advanceTimber(state, 10);
    expect(result.buildingHealth).toBe(base.buildingHealth - 25);
    expect(result.campaign?.ending).toBe("collapse");
    expect(result.elapsed).toBe(1440);
    expect(advanceTimber(result, 1).elapsed).toBe(1440);
  } finally {
    random.mockRestore();
  }
});

it("명령 기록이 가득 차도 자동 화재는 시간 진행을 막지 않는다", () => {
  const base = createVillageGame(false, true);
  const state: TimberState = {
    ...base,
    elapsed: 1439,
    openingFight: true,
    world: { ...base.world, minute: 1439 },
    processed: Array.from({ length: 1999 }, (_, i) => `command-${i}`),
  };
  const random = vi.spyOn(Math, "random").mockReturnValue(0.2);
  try {
    random.mockReturnValueOnce(0.2).mockReturnValueOnce(0.8);
    const result = advanceTimber(state, 1);
    expect(result.elapsed).toBe(1440);
    expect(result.buildingHealth).toBe(base.buildingHealth - 25);
    expect(result.processed).toEqual(state.processed);
  } finally {
    random.mockRestore();
  }
});

it("자동 배식소 다툼은 마지막 사용자 명령 기록 자리를 차지하지 않는다", () => {
  const base = createVillageGame(false, true);
  const state: TimberState = {
    ...base,
    restaurantBuilt: true,
    logging: { ...base.logging, built: true },
    processed: Array.from({ length: 1998 }, (_, i) => `command-${i}`),
  };
  const result = commandTimber(state, { type: "advance", minutes: 1 }, "step");
  expect(result.openingFight).toBe(true);
  expect(result.world.citizens.filter((r) => r.health === "sick")).toHaveLength(
    2,
  );
  expect(result.processed).toEqual([...state.processed, "step"]);
});

it.each([
  { ledger: "processed commands", commands: 1998, events: 1 },
  { ledger: "citizen events", commands: 1, events: 2000 },
])(
  "resolves both night raid casualties with a nearly full or full $ledger ledger",
  ({ commands, events }) => {
    const base = createVillageGame(false, true);
    const before = restore({
      ...base,
      elapsed: 659,
      world: {
        ...base.world,
        minute: 1259,
        citizenEvents: Array.from({ length: events }, (_, i) => `event-${i}`),
      },
      processed: Array.from({ length: commands }, (_, i) => `command-${i}`),
    });
    const random = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.99) // No unrelated hourly fatality.
      .mockReturnValueOnce(0) // Raid occurs.
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0) // Death.
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.5) // Injury.
      .mockReturnValue(0.99); // No mutation.
    try {
      const command = { type: "advance", minutes: 1 } as const;
      const after = commandTimber(before, command, "night-tick");
      expect(after.elapsed).toBe(660);
      expect(after.world.minute).toBe(1260);
      expect(after.raid).toMatchObject({ minute: 660, dead: 1, injured: 1 });
      expect(after.world.citizens.filter((r) => !r.alive)).toHaveLength(1);
      expect(
        after.world.citizens.filter((r) => r.health === "sick"),
      ).toHaveLength(1);
      expect(after.residents.filter((r) => r.health === "dead")).toHaveLength(
        1,
      );
      expect(after.residents.filter((r) => r.health === "sick")).toHaveLength(
        1,
      );
      expect(after.town.patients).toEqual([
        expect.objectContaining({ severity: "major" }),
      ]);
      expect(after.processed).toEqual([...before.processed, "night-tick"]);
      expect(after.world.citizenEvents).toEqual(
        events === 2000
          ? before.world.citizenEvents
          : [
              ...(before.world.citizenEvents ?? []),
              "gate-raid-660-0",
              "gate-raid-660-1",
            ],
      );
      const resumed = restore(after);
      expect(resumed).toEqual(after);
      expect(commandTimber(resumed, command, "night-tick")).toEqual(resumed);
      if (commands === 1998) {
        expect(() => commandTimber(resumed, command, "another-tick")).toThrow(
          "처리 기록이 가득 찼습니다.",
        );
      } else {
        const target = resumed.residents.find((r) => r.health === "healthy");
        if (!target) throw Error("Expected a healthy raid survivor");
        const citizenIds = [target.id];
        const citizenEvent = (id: string) =>
          ({
            type: "citizen-event",
            event: { type: "death", id, citizenIds },
          }) as const;
        expect(
          commandTimber(resumed, citizenEvent("event-0"), "duplicate-event")
            .world,
        ).toEqual(resumed.world);
        expect(() =>
          commandTimber(resumed, citizenEvent("fresh-event"), "new-event"),
        ).toThrow(PlayDataError);
      }
    } finally {
      random.mockRestore();
    }
  },
);

it.each(["fatality", "capital cold"])(
  "resolves hourly %s with both ledgers full",
  (incident) => {
    const base = createVillageGame(false, true);
    const cold = incident === "capital cold";
    const before = restore({
      ...base,
      elapsed: 1439,
      ...(cold && {
        chapter: 3,
        campaign: { ...campaignOf(base), beat: "capital", since: 0 },
      }),
      openingFight: true,
      processed: Array.from({ length: 1999 }, (_, i) => `command-${i}`),
      world: {
        ...base.world,
        minute: 1139,
        citizenEvents: Array.from({ length: 2000 }, (_, i) => `event-${i}`),
      },
    });
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    if (!cold) random.mockReturnValueOnce(0.99).mockReturnValue(0);
    try {
      const after = restore(advanceTimber(before, 1));
      expect(after.elapsed).toBe(1440);
      expect(
        after.residents.filter((r) => r.health === (cold ? "sick" : "dead")),
      ).toHaveLength(1);
      expect(after.processed).toEqual(before.processed);
      expect(after.world.citizenEvents).toEqual(before.world.citizenEvents);
    } finally {
      random.mockRestore();
    }
  },
);

it("기존 저장의 주민 사건 기록이 가득 차도 자동 다툼을 처리한다", () => {
  const base = createVillageGame();
  const before = restore({
    ...base,
    elapsed: 1439,
    world: {
      ...base.world,
      minute: 1439,
      citizenEvents: Array.from({ length: 2000 }, (_, i) => `event-${i}`),
    },
  });
  const random = vi.spyOn(Math, "random").mockReturnValue(0);
  try {
    const after = advanceTimber(before, 1);
    expect(after.elapsed).toBe(1440);
    expect(
      after.world.citizens.filter((citizen) => citizen.health === "sick"),
    ).toHaveLength(2);
    expect(after.world.citizenEvents).toEqual(before.world.citizenEvents);
    expect(after.history.at(-1)?.text).toBe(
      "마을에서 다툼이 벌어져 주민 둘이 다쳤습니다.",
    );
  } finally {
    random.mockRestore();
  }
});

it("같은 날 배급 전환을 반복해도 민심이 누적되지 않고 새날에는 다시 반응한다", () => {
  const base = createVillageGame(false, true);
  const change = (state: TimberState, policy: "needs" | "cap", id: string) =>
    commandTimber(state, { type: "set-ration-policy", policy }, id);
  const first = restore(change(base, "cap", "first"));
  expect(first.world.pessimism).toBe(base.world.pessimism + 1);
  expect(() => change(first, "needs", "too-early")).toThrow("열두 시간");
  const back = change(later(first, 720), "needs", "back");
  expect(back.world.day).toBe(first.world.day);
  expect(back.rationPolicy).toBe("needs");
  expect(back.decree?.title).toBe("필요량에 따른 배급");
  expect(back.world.optimism).toBe(first.world.optimism);

  const nextDay = later(back, 720);
  expect(nextDay.world.day).toBeGreaterThan(back.world.day);
  expect(change(nextDay, "cap", "day-two").world.pessimism).toBe(
    first.world.pessimism + 1,
  );
});

it("재건 표시가 없는 기존 저장에서도 포졸 배치가 일일 화재 확률을 낮춘다", () => {
  const base = createVillageGame();
  const oldSave = createTimberSave({
    ...base,
    elapsed: 1439,
    world: { ...base.world, minute: 1439 },
  });
  const data = JSON.parse(JSON.stringify(oldSave));
  delete data.state.rebuilding;
  const state = parseTimberSave(data).state;
  const withGuards = restore(
    commandTimber(state, { type: "set-guards", count: 4 }, "patrol"),
  );
  expect(
    withGuards.residents.filter((r) => r.workplaceId === "office"),
  ).toHaveLength(4);

  const random = vi.spyOn(Math, "random");
  try {
    // This roll is below 24%, but above the 12% threshold with four guards.
    random.mockReturnValueOnce(0.18).mockReturnValue(0.8);
    expect(advanceTimber(state, 1).buildingHealth).toBe(
      base.buildingHealth - 25,
    );
    random.mockReturnValueOnce(0.18);
    expect(advanceTimber(withGuards, 1).buildingHealth).toBe(
      base.buildingHealth,
    );
  } finally {
    random.mockRestore();
  }
});

it("복홀에서 도성 단계를 하던 기존 저장은 도성 함락 기한으로 끝나지 않는다", () => {
  const base = createVillageGame(false, true);
  expect(base.bokhol).toBeUndefined();
  const { capitalDue: _due, ...legacy } = campaignOf(base);
  const loaded = restore({
    ...base,
    chapter: 3,
    campaign: { ...legacy, beat: "capital", since: 0, relief: "ward" },
  });
  const passed = later(loaded, 37 * 60);
  expect(campaignOf(passed).ending ?? null).toBeNull();
  expect(campaignOf(passed).beat).toBe("capital");
  expect(act(passed, "next").campaign?.ending ?? null).toBeNull();
});
