import { expect, it } from "vitest";
import {
  collectionRate,
  RESEARCH_CATALOG,
  scoutSpeedRate,
} from "./development.js";
import { hospitalBeds, hospitalHours, recoveryRequired } from "./hospital.js";
import { createPlayState, dailyFoodDemand, parsePlayState } from "./play.js";
import { requireValue } from "./require-value.js";
import { storageCapacity, yardStock } from "./storage.js";
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
import { type BuildingKind, facilityDoor } from "./town.js";

let serial = 0;
const cmd = (s: TimberState, c: TimberCommand) =>
  commandTimber(s, c, `integration-${++serial}`);
const start = () => {
  const w = createPlayState();
  return createTimberState({
    ...w,
    minute: 540,
    resources: {
      ...w.resources,
      RES_WOOD: 4000000,
      RES_METAL: 3000000,
      RES_STONE: 2000000,
    },
  });
};
function build(s: TimberState, kind: BuildingKind, x: number, z: number) {
  s = cmd(s, {
    type: "plan-building",
    kind,
    position: { x, z },
    headingRadians: Math.PI,
  });
  for (let i = 0; i < 250 && s.town.orders.length; i++) s = advanceTimber(s, 1);
  expect(s.town.orders).toHaveLength(0);
  return s;
}
function secondFacility(s: TimberState) {
  const f = s.town.facilities[1];
  if (!f) throw Error("시설 없음");
  return f;
}
function lab() {
  let s = build(start(), "workshop", 12, 12);
  s = cmd(s, { type: "facility-staff", id: "build-1", count: 2 });
  s = advanceTimber(s, 30);
  return {
    ...s,
    town: { ...s.town, development: { ...s.town.development, tradeCount: 1 } },
  };
}
// Completion-boundary fixture keeps costs, prerequisites, staff and the actual completion code.
function finishResearch(s: TimberState, tech: string) {
  const row = RESEARCH_CATALOG.find((r) => r.id === tech);
  if (!row) throw Error("연구 없음");
  s = { ...s, world: { ...s.world, minute: 600 } };
  s = cmd(s, { type: "start-research", tech });
  const job = s.town.development.research[0];
  if (!job) throw Error("연구 시작 실패");
  s = {
    ...s,
    town: {
      ...s.town,
      development: {
        ...s.town.development,
        research: [{ ...job, work: row.workdays * 540 * 3 - 1 }],
      },
    },
  };
  s = advanceTimber(s, 1);
  expect(s.town.development.completed).toContain(tech);
  return s;
}
function upgrade(s: TimberState, id: string) {
  s = cmd(s, { type: "upgrade-facility", id });
  return advanceTimber(s, 130);
}
it("건물별 연구로 공사를 허가하고 둥지 잠자리와 지원 시설을1~3단계로 개량한다", () => {
  let s = lab();
  expect(() =>
    cmd(s, { type: "upgrade-facility", id: "example-building-1" }),
  ).toThrow(/연구/);
  s = finishResearch(s, "UPGRADE_HOME_2");
  s = upgrade(s, "example-building-1");
  expect(s.homes[0]).toMatchObject({ level: 2, capacity: 30 });
  s = finishResearch(s, "UPGRADE_HOME_3");
  s = upgrade(s, "example-building-1");
  expect(s.homes[0]).toMatchObject({ level: 3, capacity: 40 });
  expect(s.homes).toHaveLength(6);
  expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
});
it("병원 단계별5/15/25병상과 경상12/8/4시간, 경중2/4배를 실제 치료에 적용한다", () => {
  let s = build(lab(), "hospital", 0, 16);
  s = cmd(s, { type: "facility-staff", id: "build-2", count: 2 });
  s = advanceTimber(s, 1);
  expect([1, 2, 3].map(hospitalBeds)).toEqual([5, 15, 25]);
  expect([1, 2, 3].map(hospitalHours)).toEqual([12, 8, 4]);
  s = finishResearch(s, "UPGRADE_HOSPITAL_2");
  s = upgrade(s, "build-2");
  s = finishResearch(s, "UPGRADE_HOSPITAL_3");
  s = upgrade(s, "build-2");
  const people = s.residents.slice(-3).map((r) => r.id);
  for (const [i, severity] of (
    ["minor", "major", "critical"] as const
  ).entries())
    s = cmd(s, {
      type: "citizen-event",
      event: {
        type: "illness",
        id: `hospital-stage-${++serial}`,
        citizenIds: [people[i] ?? ""],
        severity,
      },
    });
  s = advanceTimber(s, 50);
  expect(s.town.patients.map(recoveryRequired)).toEqual([720, 1440, 2880]);
  const before = s.town.patients.map((p) => p.progress);
  s = { ...s, world: { ...s.world, minute: 1320 } };
  s = advanceTimber(s, 1);
  expect(s.town.patients.map((p, i) => p.progress - (before[i] ?? 0))).toEqual([
    3, 3, 3,
  ]);
});
it("채집 연구는 건물 단계와 곱하지 않고2배까지만 적용하며 기존 연구를 반복할 수 없다", () => {
  let s = build(lab(), "fishery", 46, 32);
  s = finishResearch(s, "GATHER_RES_FISH_1");
  expect(collectionRate(s, secondFacility(s))).toBe(1.5);
  s = finishResearch(s, "GATHER_RES_FISH_2");
  s = finishResearch(s, "UPGRADE_FISHERY_2");
  s = upgrade(s, "build-2");
  expect(collectionRate(s, secondFacility(s))).toBe(2);
  expect(() =>
    cmd(s, { type: "start-research", tech: "GATHER_RES_FISH_2" }),
  ).toThrow(/완료/);
  s = cmd(s, { type: "facility-staff", id: "build-2", count: 2 });
  s = advanceTimber(s, 180);
  expect(s.town.facilities[1]?.delivered).toBeGreaterThan(0);
});
it("저장 공간500/1000/2000은 연구·건물의 높은 값으로 적용하고 초과 재고는 보존한다", () => {
  let s = build(lab(), "storage", 0, 16);
  expect(storageCapacity(s)).toBe(500);
  s = finishResearch(s, "SPACE_2");
  expect(storageCapacity(s)).toBe(1000);
  s = finishResearch(s, "UPGRADE_STORAGE_2");
  s = upgrade(s, "build-2");
  expect(storageCapacity(s)).toBe(1000);
  s = finishResearch(s, "SPACE_3");
  expect(storageCapacity(s)).toBe(2000);
  const legacy = {
    ...s,
    world: {
      ...s.world,
      resources: { ...s.world.resources, RES_FISH: 30000000 },
    },
  };
  expect(parseTimberState(legacy).world.resources.RES_FISH).toBe(30000000);
});
it("창고가 없어도 시작 적재 용량을 쓰고 창고 하나로 기존 용량이 줄지 않는다", () => {
  const village = createVillageGame();
  expect(storageCapacity(village)).toBe(1500);
  expect(storageCapacity(start())).toBe(500);
  expect(yardStock(village, "RES_WOOD")).toBe(0);
  const crowded = {
    ...village,
    world: {
      ...village.world,
      resources: { ...village.world.resources, RES_WOOD: 2000 * 10000 },
    },
  };
  // 넘친 물량은 기획자 규칙대로 야적장에 둔다.
  expect(yardStock(crowded, "RES_WOOD")).toBe(500);
  const warehouse = build(start(), "storage", 0, 16);
  expect(storageCapacity(warehouse)).toBe(500);
  const campaign = requireValue(village.campaign, "캠페인 기록");
  expect(storageCapacity({ ...warehouse, campaign })).toBe(1500);
});
it("저장 용량을 넘긴 수레 화물도 야적장 재고에 한 번만 더한다", () => {
  const w = createPlayState();
  let s = createTimberState({
    ...w,
    minute: 540,
    resources: { ...w.resources, RES_WOOD: 3000000, RES_PLANT: 5000000 },
  });
  s = build(s, "farm", 46, 32);
  s = cmd(s, { type: "facility-staff", id: "build-1", count: 2 });
  s = advanceTimber(s, 180);
  const f = s.town.facilities[0];
  expect(f?.delivered).toBeGreaterThan(0);
  expect(s.world.resources.RES_PLANT).toBe(
    5000000 + (f?.delivered ?? 0) * 10000,
  );
  expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
});
it("반란 전·다른 분기 연구는 거부하고 진압 루트에서 날틀이 정찰 기본10배를 대체한다", () => {
  let s = lab();
  expect(() => cmd(s, { type: "start-research", tech: "R17" })).toThrow(/반란/);
  s = cmd(s, { type: "story-event", event: "rebellion-started" });
  s = cmd(s, { type: "story-event", event: "rebellion-suppressed" });
  expect(() =>
    cmd(s, { type: "story-event", event: "allied-yangnyeong" }),
  ).toThrow();
  s = finishResearch(s, "TECH_TRAIL");
  s = {
    ...s,
    town: { ...s.town, development: { ...s.town.development, tradeCount: 1 } },
  };
  s = finishResearch(s, "TECH_SCOUT_SPEED_2");
  s = finishResearch(s, "R17");
  s = finishResearch(s, "TECH_FLIGHT");
  expect(scoutSpeedRate(s)).toBe(10);
  expect(() => cmd(s, { type: "start-research", tech: "R18" })).toThrow(/분기/);
});
it("메카2는 충녕 시해 분기에서 부활시키고 사망자의 뼈를 한 번만 써서 공통 주민으로 등록한다", () => {
  let s = lab();
  const source = s.residents.at(-1)?.id ?? "";
  expect(() => cmd(s, { type: "mechanize", source })).toThrow();
  s = cmd(s, { type: "story-event", event: "rebellion-started" });
  s = cmd(s, { type: "story-event", event: "chungnyeong-assassinated" });
  s = finishResearch(s, "R17");
  s = finishResearch(s, "R18");
  s = finishResearch(s, "TECH_MECHA2");
  expect(s.town.development.story.chungnyeong).toBe("mechanical");
  s = finishResearch(s, "R19");
  expect(() => cmd(s, { type: "mechanize", source })).toThrow();
  s = cmd(s, {
    type: "citizen-event",
    event: { type: "death", id: "bone-source", citizenIds: [source] },
  });
  const demand = dailyFoodDemand(s.world);
  s = cmd(s, { type: "mechanize", source });
  s = cmd(s, { type: "mechanize", source });
  expect(
    s.world.citizens.filter((c) => c.mechanicalFrom === source),
  ).toHaveLength(1);
  const mech = s.residents.find((r) => r.id === `mecha:${source}`);
  expect(mech).toMatchObject({ homeId: null, homeSlot: null, hunger: 0 });
  expect(dailyFoodDemand(s.world)).toEqual(demand);
  expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
  const tampered = s.world;
  expect(() =>
    parsePlayState({
      ...tampered,
      citizens: tampered.citizens.map((c) =>
        c.id === source ? { ...c, alive: true, health: "healthy" } : c,
      ),
    }),
  ).toThrow();
});
it("전기자극기는 독재 루트에서 지정 시설만 기본200%로 바꾸고 중복4배를 만들지 않는다", () => {
  let s = build(lab(), "fishery", 46, 32);
  expect(() =>
    cmd(s, { type: "electrical-work", id: "build-2", enabled: true }),
  ).toThrow();
  s = cmd(s, { type: "story-event", event: "rebellion-started" });
  s = cmd(s, { type: "story-event", event: "allied-yangnyeong" });
  s = finishResearch(s, "R17");
  s = finishResearch(s, "TECH_ELECTRICAL");
  s = cmd(s, { type: "electrical-work", id: "build-2", enabled: true });
  expect(collectionRate(s, secondFacility(s))).toBe(2);
  s = cmd(s, { type: "electrical-work", id: "build-2", enabled: false });
  expect(collectionRate(s, secondFacility(s))).toBe(1);
});
it("구v16 저장의 개량·회복비율을 승계하고 병상이 줄면 회복량을 잃지 않고 대기한다", () => {
  let s = build(lab(), "hospital", 0, 16);
  const people = s.residents.slice(-8).map((r) => r.id);
  s = cmd(s, {
    type: "citizen-event",
    event: { type: "illness", id: "old-eight", citizenIds: people },
  });
  const h = s.town.facilities[1];
  if (!h) throw Error("병원 없음");
  const old = {
    ...s,
    version: 16,
    town: {
      ...s.town,
      patients: s.town.patients.map((p) => ({
        ...p,
        hospital: h.id,
        progress: 30,
      })),
    },
    residents: s.residents.map((r) =>
      people.includes(r.id)
        ? {
            ...r,
            workplaceId: null,
            insideHome: false,
            position: facilityDoor(h),
          }
        : r,
    ),
  };
  const migrated = parseTimberState(old);
  expect(
    migrated.town.patients.filter((p) => p.hospital !== null),
  ).toHaveLength(5);
  expect(migrated.town.patients.every((p) => p.progress === 360)).toBe(true);
  const bad = migrated;
  expect(() =>
    parseTimberState({
      ...bad,
      town: {
        ...bad.town,
        development: {
          ...bad.town.development,
          story: {
            rebellion: false,
            route: "mechanical",
            chungnyeong: "mechanical",
          },
        },
      },
    }),
  ).toThrow();
});

it("메카는 야간에도 배치된 시설에서 일하고 배급·수면·둥지를 요구하지 않는다", () => {
  let s = build(lab(), "fishery", 46, 32);
  s = cmd(s, { type: "story-event", event: "rebellion-started" });
  s = cmd(s, { type: "story-event", event: "chungnyeong-assassinated" });
  s = finishResearch(s, "R17");
  s = finishResearch(s, "R18");
  s = finishResearch(s, "TECH_MECHA2");
  const source = s.residents.at(-1)?.id ?? "";
  s = cmd(s, {
    type: "citizen-event",
    event: { type: "death", id: "night-bones", citizenIds: [source] },
  });
  s = cmd(s, { type: "mechanize", source });
  s = cmd(s, { type: "facility-staff", id: "build-1", count: 0 });
  s = {
    ...s,
    world: { ...s.world, minute: 1320 },
    residents: s.residents.map((r) => ({
      ...r,
      hunger: 0,
      workplaceId: r.id.startsWith("mecha:") ? null : "guard",
    })),
  };
  s = cmd(s, { type: "facility-staff", id: "build-2", count: 1 });
  const food = [
    s.world.resources.RES_PLANT,
    s.world.resources.RES_MEAT,
    s.world.resources.RES_FISH,
  ];
  const deliveredBefore = secondFacility(s).delivered;
  s = advanceTimber(s, 120);
  const mech = s.residents.find((r) => r.id === `mecha:${source}`);
  expect(mech).toMatchObject({
    hunger: 0,
    homeId: null,
    request: null,
    workplaceId: "facility:build-2",
  });
  expect(secondFacility(s).delivered).toBeGreaterThan(0);
  expect([
    s.world.resources.RES_PLANT,
    s.world.resources.RES_MEAT,
    s.world.resources.RES_FISH,
  ]).toEqual([
    food[0],
    food[1],
    (food[2] ?? 0) + (secondFacility(s).delivered - deliveredBefore) * 10000,
  ]);
});

it("공동 목재가 꽉 차도 검수한 물량을 즉시 야적장에 정산한다", () => {
  const w = createPlayState();
  let s = createTimberState({
    ...w,
    minute: 540,
    resources: { ...w.resources, RES_WOOD: 5000000 },
  });
  s = cmd(s, { type: "choose", offer: "B" });
  s = cmd(s, { type: "contract" });
  s = advanceTimber(s, 110);
  expect(s.phase).toBe("ready");
  expect(s.stock.waiting).toBe(0);
  expect(s.world.resources.RES_WOOD).toBe(5200000);
  s = cmd(s, {
    type: "plan-building",
    kind: "home",
    position: { x: 12, z: 12 },
    headingRadians: Math.PI,
  });
  s = advanceTimber(s, 100);
  expect(s.stock.waiting).toBe(0);
  expect(s.stock.available).toBe(20);
  expect(s.world.resources.RES_WOOD).toBe(4700000);
});
it("연구와 치료를 이어가도록 경과10일을 지나도 시간이 멈추지 않는다", () => {
  let s = start();
  s = { ...s, elapsed: 14399, world: { ...s.world, day: 10, minute: 1439 } };
  s = advanceTimber(s, 20);
  expect(s.elapsed).toBe(14419);
  expect(s.world.day).toBe(11);
});
