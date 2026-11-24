import { expect, it } from "vitest";
import { campaignOf, policyWait } from "./campaign.js";
import { createPlayState, type FoodId } from "./play.js";
import { requireValue } from "./require-value.js";
import {
  advanceTimber,
  commandTimber,
  createTimberSave,
  createTimberState,
  createVillageGame,
  parseTimberSave,
  parseTimberState,
  type TimberCommand,
  type TimberState,
} from "./timber.js";
import {
  BUILDING_RULES,
  type BuildingKind,
  buildingIssue,
  buildingPower,
  connectedDeposits,
  salvageMaterials,
} from "./town.js";

let id = 0;
const cmd = (s: TimberState, c: TimberCommand) =>
  commandTimber(s, c, `town-${++id}`);
const start = () => {
  const w = createPlayState();
  return createTimberState({
    ...w,
    minute: 540,
    resources: {
      ...w.resources,
      RES_WOOD: 3000000,
      RES_METAL: 3000000,
      RES_STONE: 3000000,
      RES_WATER: 3000000,
      RES_PLANT: 3000000,
    },
  });
};
const pose = { position: { x: 12, z: 12 }, headingRadians: Math.PI };
const plan = (s: TimberState, kind: BuildingKind, p = pose) =>
  cmd(s, { type: "plan-building", kind, ...p });
function finish(input: TimberState) {
  let s = input;
  for (let i = 0; i < 500 && s.town.orders.length; i++) s = advanceTimber(s, 1);
  expect(s.town.orders).toHaveLength(0);
  return s;
}
it("무자원은 접수 거부, 자재 확보 후 무인력은 대기하고 1명부터 건설한다", () => {
  const initial = createTimberState();
  expect(() => plan(initial, "ranch", pose)).toThrow();
  let s = start();
  s = {
    ...s,
    residents: s.residents.map((r) => ({ ...r, workplaceId: "workshop" })),
  };
  const before = s.world.resources.RES_WOOD;
  s = plan(s, "home");
  s = advanceTimber(s, 10);
  expect(s.world.resources.RES_WOOD).toBe(before - 500000);
  expect(s.town.orders[0]?.crew).toHaveLength(0);
  const worker = s.residents.find(
    (r) => s.world.citizens.find((c) => c.id === r.id)?.species === "R03",
  );
  if (!worker) throw Error("주민 없음");
  s = {
    ...s,
    residents: s.residents.map((r) =>
      r.id === worker.id ? { ...r, workplaceId: null } : r,
    ),
  };
  s = advanceTimber(s, 60);
  expect(s.town.orders).toHaveLength(1);
  expect(s.town.orders[0]?.crew).toHaveLength(1);
  s = finish(s);
  expect(s.homes).toHaveLength(7);
  expect(s.world.resources.RES_WOOD).toBe(before - 500000);
});
it("여러 부지는 즉시 자재 확보하며 겹침 거부, 순차 완공, 저장 복원도 동일하다", () => {
  let s = plan(start(), "home");
  expect(() => plan(s, "farm")).toThrow();
  s = plan(s, "storage", { ...pose, position: { x: 0, z: 16 } });
  expect(s.town.orders).toHaveLength(2);
  expect(s.town.orders[1]?.crew).toEqual([]);
  expect(s.world.resources.RES_WOOD).toBe(2200000);
  s = advanceTimber(s, 20);
  expect(s.town.orders[1]?.workDone).toBe(0);
  const loaded = parseTimberSave(createTimberSave(s)).state;
  expect(advanceTimber(loaded, 120)).toEqual(advanceTimber(s, 120));
  s = finish(s);
  expect(s.homes).toHaveLength(7);
  expect(s.town.facilities[0]?.kind).toBe("storage");
});
it("자원별 입지와 물 위 건설을 검사하고 채석장은 암반, 어획막은 물가만 허용한다", () => {
  const s = start();
  expect(buildingIssue(s, "quarry", pose)).toContain("자원");
  expect(buildingIssue(s, "fishery", pose)).toContain("물가");
  expect(
    buildingIssue(s, "home", { ...pose, position: { x: 60, z: 32 } }),
  ).toContain("물 위");
  expect(
    buildingIssue(s, "quarry", { ...pose, position: { x: 200, z: -40 } }),
  ).toBeNull();
  expect(
    buildingIssue(s, "fishery", { ...pose, position: { x: 46, z: 32 } }),
  ).toBeNull();
  expect(
    buildingIssue(s, "coal", { ...pose, position: { x: 200, z: -40 } }),
  ).toContain("자원");
});
it("기본 공사량은4명 표준 체격 기준30~50초이며 체격에 따른 작업 이점이 있다", () => {
  const s = start(),
    small = s.world.citizens.find((c) => c.species === "R03"),
    large = s.world.citizens.find((c) => c.species === "R02");
  expect(buildingPower(s, small?.id ?? "")).toBe(1);
  expect(buildingPower(s, large?.id ?? "")).toBe(2);
  for (const rule of Object.values(BUILDING_RULES))
    expect(rule.work / 6).toBeGreaterThanOrEqual(30);
});
it.each(["farm", "ranch", "fishery", "logging", "quarry"] as const)(
  "%s 운영·소모와 입고 경로를 따르고 어획은 즉시 입고한다",
  (kind) => {
    const point =
      kind === "fishery"
        ? { x: 46, z: 32 }
        : kind === "logging"
          ? { x: -24, z: -8 }
          : kind === "quarry"
            ? { x: 200, z: -40 }
            : pose.position;
    let s = finish(plan(start(), kind, { ...pose, position: point }));
    const f = s.town.facilities[0];
    if (!f) throw Error("시설 없음");
    s = cmd(s, { type: "facility-staff", id: f.id, count: 4 });
    let observedBuffer = false;
    for (let i = 0; i < 1000 && !s.town.facilities[0]?.delivered; i++) {
      s = advanceTimber(s, 1);
      observedBuffer ||= (s.town.facilities[0]?.buffer ?? 0) > 0;
    }
    expect(observedBuffer).toBe(kind !== "fishery");
    if (kind === "fishery") expect(s.town.facilities[0]?.haul).toBeNull();
    expect(s.town.facilities[0]?.delivered).toBeGreaterThan(0);
    expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
    if (kind === "farm" || kind === "ranch")
      expect(s.town.spent.RES_WATER).toBeGreaterThan(0);
    if (kind === "logging" || kind === "quarry")
      expect(
        Object.values(s.town.extracted).reduce((n, x) => n + (x ?? 0), 0),
      ).toBeGreaterThan(0);
  },
);
it("얼어도 어획이 가능하고 야간에는 공사를 보존한 채 귀가한다", () => {
  let s = finish(
    plan(start(), "fishery", { ...pose, position: { x: 46, z: 32 } }),
  );
  const f = s.town.facilities[0];
  if (!f) throw Error("시설 없음");
  s = cmd(s, { type: "cold-weather", cold: true });
  s = cmd(s, { type: "facility-staff", id: f.id, count: 4 });
  s = advanceTimber(s, 300);
  expect(s.town.facilities[0]?.delivered).toBeGreaterThan(0);
  s = advanceTimber(s, 1080 - s.world.minute);
  s = plan(s, "home");
  s = advanceTimber(s, 60);
  expect(s.town.orders[0]?.workDone).toBe(0);
  expect(s.town.orders[0]?.crew).toHaveLength(0);
  s = advanceTimber(s, 840);
  s = finish(s);
  expect(s.homes).toHaveLength(7);
}, 20000);
it.each(["scout", "trade"] as const)(
  "%s 파견은 별도 인력이 실제 돌아온 뒤 식량을 정산한다",
  (kind) => {
    let s = finish(plan(start(), kind));
    const f = s.town.facilities[0];
    if (!f) throw Error("시설 없음");
    const food: FoodId = kind === "scout" ? "RES_MEAT" : "RES_FISH";
    s = cmd(s, {
      type: "facility-staff",
      id: f.id,
      count: kind === "scout" ? 2 : 1,
    });
    s = advanceTimber(s, 1);
    const before = s.world.resources[food];
    s = cmd(s, { type: "dispatch-food", id: f.id, food });
    expect(s.world.resources[food]).toBe(before);
    s = advanceTimber(s, 10);
    expect(s.world.resources[food]).toBe(before);
    for (let i = 0; i < 1000 && s.town.trips.length; i++)
      s = advanceTimber(s, 1);
    expect(s.town.trips).toHaveLength(0);
    expect(s.world.resources[food]).toBe(
      before + (kind === "scout" ? 8 : 10) * 10000,
    );
  },
);
it("구버전 변환과 부적합한 건설·인력·자재 기록 거부", () => {
  const old = JSON.parse(JSON.stringify(start()));
  old.version = 13;
  delete old.town;
  expect(parseTimberState(old).town.orders).toEqual([]);
  const bad = JSON.parse(JSON.stringify(plan(start(), "home")));
  bad.town.orders[0].workDone = -1;
  expect(() => parseTimberState(bad)).toThrow();
  const badCost = JSON.parse(JSON.stringify(start()));
  badCost.town.spent.RES_METAL = -1;
  expect(() => parseTimberState(badCost)).toThrow();
});

it("건설 인력의 질병은 교대하고 정찰대 사망·회복 사건도 공통 명부로 처리한다", () => {
  let s = plan(start(), "home");
  s = advanceTimber(s, 1);
  const worker = s.town.orders[0]?.crew[0];
  if (!worker) throw Error("인력 없음");
  s = cmd(s, {
    type: "citizen-event",
    event: { type: "illness", id: "builder-ill", citizenIds: [worker] },
  });
  expect(s.town.orders[0]?.crew).not.toContain(worker);
  s = advanceTimber(s, 1);
  expect(s.town.orders[0]?.crew).toHaveLength(4);
  s = finish(s);
  s = finish(plan(s, "scout", { ...pose, position: { x: -15, z: -15 } }));
  const f = s.town.facilities[0];
  if (!f) throw Error("거점 없음");
  s = cmd(s, { type: "facility-staff", id: f.id, count: 2 });
  s = advanceTimber(s, 1);
  s = cmd(s, { type: "dispatch-food", id: f.id, food: "RES_MEAT" });
  const who = s.town.trips[0]?.ids[0];
  if (!who) throw Error("정찰대 없음");
  s = cmd(s, {
    type: "citizen-event",
    event: { type: "death", id: "scout-death", citizenIds: [who] },
  });
  expect(s.town.trips[0]?.ids).toHaveLength(1);
  expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
});

it("주민은 공터에서 비켜서고 이웃 건물의 출입구는 보호한다", () => {
  let s = start();
  s = {
    ...s,
    residents: s.residents.map((r, i) =>
      i === 0 ? { ...r, position: pose.position, insideHome: false } : r,
    ),
  };
  expect(buildingIssue(s, "home", pose)).toBeNull();
  const ordered = plan(s, "home", pose);
  expect(ordered.residents[0]?.position).not.toEqual(pose.position);
  expect(ordered.town.orders[0]?.crew.length).toBeGreaterThan(0);
  s = plan(start(), "storage", {
    position: { x: 20, z: -12 },
    headingRadians: 0,
  });
  expect(
    buildingIssue(s, "storage", {
      position: { x: 20, z: -6.7 },
      headingRadians: 0,
    }),
  ).toContain("출입구");
});

it("식당 대기 중인 유휴 인력은 명령 즉시 좌석을 놓고 건설에 배정된다", () => {
  const initial = start();
  const s = plan(
    {
      ...initial,
      residents: initial.residents.map((r) => ({
        ...r,
        routine: "restaurant",
        request: "waiting-seat",
        hunger: 500,
      })),
    },
    "home",
  );
  const crew = requireValue(s.town.orders[0], "s.town.orders[0]").crew;
  expect(crew).toHaveLength(4);
  for (const r of s.residents.filter((r) => crew.includes(r.id)))
    expect(r).toMatchObject({
      routine: "working",
      request: null,
      diningSeat: null,
      task: "build-order:build-1",
    });
});

it("새 마을의 첫 식당은 공사 인부가 배식을 맡고 주민이 식사를 마친다", () => {
  const initial = createVillageGame();
  expect(initial.world.minute).toBe(540);
  expect(initial.world.resources.RES_WOOD).toBe(10000000);
  const order = plan(initial, "restaurant");
  const crew = order.town.orders[0]?.crew ?? [];
  expect(crew).toHaveLength(4);
  let s = finish(order);
  expect(
    s.residents
      .filter((r) => r.workplaceId === "restaurant")
      .map((r) => r.id)
      .every((id) => crew.includes(id)),
  ).toBe(true);
  expect(s.restaurantWorkerTarget).toBe(2);
  s = advanceTimber(s, 180);
  expect(
    s.residents.some(
      (r) =>
        r.workplaceId === null && r.lastMeal !== null && r.routine !== "eating",
    ),
  ).toBe(true);
});

it("기존 가격으로 접수한 현장에 이어 새 공사는 새 건설비로 한 번만 정산한다", () => {
  const saved = plan(start(), "home");
  delete requireValue(saved.town.orders[0], "saved.town.orders[0]")
    .priceVersion;
  const refund = 30;
  const legacy = {
    ...saved,
    woodSpent: saved.woodSpent - refund,
    world: {
      ...saved.world,
      resources: {
        ...saved.world.resources,
        RES_WOOD: saved.world.resources.RES_WOOD + refund * 10000,
      },
    },
    town: { ...saved.town, spent: { ...saved.town.spent, RES_WOOD: 20 } },
  };
  const resumed = parseTimberSave(createTimberSave(legacy)).state;
  const next = plan(resumed, "storage", { ...pose, position: { x: 0, z: 16 } });
  expect(next.town.spent.RES_WOOD).toBe(50);
  expect(parseTimberSave(createTimberSave(next)).state).toEqual(next);
});

it("물 보유량으로 농장 착공을 제한하고 물을 받기 전의 옛 건설 기록도 복원한다", () => {
  const village = createVillageGame();
  const dry = {
    ...village,
    world: {
      ...village.world,
      resources: { ...village.world.resources, RES_WATER: 0 },
    },
  };
  for (const kind of ["farm", "ranch"] as const)
    expect(buildingIssue(dry, kind, pose)).toMatch(/물/);
  const farm = plan(village, "farm");
  const current = farm.world.resources.RES_WATER;
  expect(current).toBe(19 * 10000);
  const old = parseTimberSave(createTimberSave(farm)).state;
  requireValue(old.town.orders[0], "old.town.orders[0]").priceVersion = 2;
  delete old.town.spent.RES_WATER;
  const priorWood = 125;
  const woodDifference = priorWood - (old.town.spent.RES_WOOD ?? 0);
  old.town.spent.RES_WOOD = priorWood;
  const previous = {
    ...old,
    woodSpent: old.woodSpent + woodDifference,
    world: {
      ...old.world,
      resources: {
        ...old.world.resources,
        RES_WOOD: old.world.resources.RES_WOOD - woodDifference * 10000,
        RES_WATER: current + 10000,
      },
    },
  };
  expect(
    parseTimberSave(createTimberSave(previous)).state.world.resources.RES_WATER,
  ).toBe(20 * 10000);
});

it("건설 중에는 정지 상태를 유지하고 완공 뒤 한 번만 자재의 90%를 돌려준다", () => {
  let s = plan({ ...start(), paused: true }, "storage");
  expect(s.paused).toBe(true);
  s = finish(s);
  const f = requireValue(s.town.facilities[0], "완공된 저장소");
  const wood = s.world.resources.RES_WOOD;
  expect(salvageMaterials(s, f.id).RES_WOOD).toBe(27);
  s = cmd(s, { type: "demolish-building", id: f.id });
  expect(s.world.resources.RES_WOOD).toBe(wood + 270000);
  expect(s.town.facilities).toHaveLength(0);
  expect(() => cmd(s, { type: "demolish-building", id: f.id })).toThrow();
  expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
});
it("중앙 광장과 관아, 물웅덩이를 건설에서 제외한다", () => {
  const s = start();
  for (const [x, z] of [
    [0, 0],
    [0, -16],
    [20, 16],
  ] as const)
    expect(
      buildingIssue(s, "home", { position: { x, z }, headingRadians: 0 }),
    ).toBeTruthy();
});

it("둥지를 철거하면 거주지를 재배정하고 빈 마을도 저장할 수 있다", () => {
  let s = start();
  for (const id of s.homes.map((h) => h.id))
    s = cmd(s, { type: "demolish-building", id });
  expect(s.residents.every((r) => r.homeId === null)).toBe(true);
  expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
});

it("제재소는 벌목권 안의 숲을 차례로 쓰고 고갈한 숲을 다시 차감하지 않는다", () => {
  let s = finish(
    plan(start(), "logging", {
      position: { x: -44, z: -32 },
      headingRadians: 0,
    }),
  );
  const mill = requireValue(s.town.facilities[0], "제재소");
  const forests = connectedDeposits(s, "logging", mill.position);
  expect(forests.length).toBeGreaterThan(1);
  const first = requireValue(forests[0], "첫 번째 숲").siteId;
  const second = requireValue(forests[1], "두 번째 숲").siteId;
  const original = requireValue(forests[0], "첫 번째 숲").remaining;
  // Only one log remains in the first forest when the next shift arrives.
  s = {
    ...s,
    logging:
      s.logging.siteId === first ? { ...s.logging, remaining: 1 } : s.logging,
    loggingSites: s.loggingSites.map((site) =>
      site.siteId === first ? { ...site, remaining: 1 } : site,
    ),
    town: { ...s.town, extracted: { ...s.town.extracted, [first]: 120 - 1 } },
  };
  expect(original).toBeGreaterThan(0);
  s = advanceTimber(s, 100);
  const after = connectedDeposits(s, "logging", mill.position);
  expect(after.find((l) => l.siteId === first)?.remaining).toBe(0);
  expect(after.find((l) => l.siteId === second)?.remaining).toBeLessThan(120);
  expect(s.town.extracted[first]).toBe(120);
  expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
});

it("기존 시설은 한 번만 철거하고 보호 시설은 보존한다", () => {
  const s = start();
  const id = "village:BLD_GREENHOUSE:-6:22";
  const refund = salvageMaterials(s, id).RES_WOOD ?? 0;
  expect(refund).toBeGreaterThan(0);
  const n = cmd(s, { type: "demolish-building", id });
  expect(n.world.resources.RES_WOOD).toBe(
    s.world.resources.RES_WOOD + refund * 10000,
  );
  expect(() =>
    cmd(parseTimberSave(createTimberSave(n)).state, {
      type: "demolish-building",
      id,
    }),
  ).toThrow();
  for (const protectedId of [
    "village:BLD_OFFICE:0:-16",
    "village:BLD_GATE:0:24",
    "village:BLD_WATCH:-22:-16",
  ])
    expect(() =>
      cmd(n, { type: "demolish-building", id: protectedId }),
    ).toThrow();
});
it("파손된 교역소 철거는 자재의 10%를 반환하고 미완료 보완을 종료한다", () => {
  const s = finish(plan(start(), "trade"));
  const id = requireValue(s.town.facilities[0], "교역소").id;
  const damaged = {
    ...s,
    mutantDamage: { [id]: 100 },
    merchantRepair: { item: 0, quantity: 2, work: 20 },
  };
  expect(salvageMaterials(damaged, id).RES_WOOD).toBe(
    Math.floor((BUILDING_RULES.trade.cost.RES_WOOD ?? 0) * 0.1),
  );
  expect(
    cmd(damaged, { type: "demolish-building", id }).merchantRepair,
  ).toBeUndefined();
});

it("아동 노동을 반포한 뒤에만 새끼 공룡에게 다음 업무를 맡길 수 있다", () => {
  let s = createVillageGame();
  const child = requireValue(
    s.world.citizens.find((c) => c.age === "child"),
    "아동",
  );
  s = {
    ...s,
    residents: s.residents.map((r) =>
      r.id === child.id ? r : { ...r, workplaceId: "guard" },
    ),
  };
  const work = {
    type: "queue-work" as const,
    workId: "yard",
    position: { x: 0, z: 0 },
  };
  expect(() => cmd(s, work)).toThrow();
  const active = { ...s, campaign: campaignOf(s) };
  const rationed = cmd(active, {
    type: "set-ration-policy",
    policy: active.rationPolicy === "cap" ? "needs" : "cap",
  });
  expect(() => cmd(rationed, { type: "enact-child-labor" })).toThrow(
    /열두 시간/,
  );
  s = cmd(active, { type: "enact-child-labor" });
  const saved = parseTimberSave(createTimberSave(s)).state;
  expect(policyWait(saved)).toBe(720);
  expect(() =>
    cmd(saved, {
      type: "set-ration-policy",
      policy: s.rationPolicy === "cap" ? "needs" : "cap",
    }),
  ).toThrow(/열두 시간/);
  expect(s.decree?.title).toBe("아동 노동 허용");
  const assigned = cmd(parseTimberSave(createTimberSave(s)).state, work);
  expect(assigned.residents.find((r) => r.id === child.id)?.nextWork?.id).toBe(
    "yard",
  );
});
