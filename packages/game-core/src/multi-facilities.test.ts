import { expect, it } from "vitest";
import { createPlayState } from "./play.js";
import { advanceResidentRoutine } from "./resident-routine.js";
import {
  advanceTimber,
  commandTimber,
  createTimberSave,
  createTimberState,
  parseTimberSave,
  parseTimberState,
  type TimberCommand,
  type TimberState,
} from "./timber.js";
import {
  BUILDING_RULES,
  type BuildingKind,
  buildingIssue,
  facilityDoor,
  facilityStaffLimit,
} from "./town.js";

let counter = 0;
const cmd = (s: TimberState, c: TimberCommand) =>
  commandTimber(s, c, `multi-${++counter}`);
function start() {
  const w = createPlayState();
  return createTimberState({
    ...w,
    minute: 540,
    resources: {
      ...w.resources,
      RES_WOOD: 50000000,
      RES_METAL: 50000000,
      RES_STONE: 50000000,
    },
  });
}
function build(s: TimberState, kind: BuildingKind, x = 12, z = 12) {
  s = cmd(s, {
    type: "plan-building",
    kind,
    position: { x, z },
    headingRadians: Math.PI,
  });
  for (let i = 0; i < 500 && s.town.orders.length; i++) s = advanceTimber(s, 1);
  expect(s.town.orders).toHaveLength(0);
  return s;
}
it("식당별10석과 배치 인력을 보존하고 두 곳에서 동시에 식사하며 중복 좌석은 거부한다", () => {
  let s = build(build(start(), "restaurant"), "restaurant", 0, 16);
  for (const f of s.town.facilities)
    s = cmd(s, { type: "facility-staff", id: f.id, count: 2 });
  s = advanceTimber(s, 40);
  const primary = s.town.facilities[0];
  if (!primary) throw Error("식당 없음");
  s = {
    ...s,
    residents: s.residents.map((r, i) => ({
      ...r,
      hunger: r.workplaceId ? 0 : 400,
      rationUsed: 0,
      eatingUntil: null,
      diningSeat: null,
      routine: "idle",
      position: facilityDoor(
        (r.workplaceId === "restaurant"
          ? s.town.facilities[0]
          : s.town.facilities.find(
              (f) => r.workplaceId === `facility:${f.id}`,
            )) ??
          s.town.facilities[i % 2] ??
          primary,
      ),
    })),
  };
  s = advanceTimber(s, 10);
  const diners = s.residents.filter(
    (r) => r.routine === "eating" && r.workplaceId === null,
  );
  expect(diners).toHaveLength(20);
  expect(
    new Set(diners.map((r) => Math.floor((r.diningSeat ?? -1) / 40))),
  ).toEqual(new Set([0, 1]));
  expect(
    diners.every(
      (r) => r.eatingUntil !== null && r.eatingUntil - s.elapsed <= 30,
    ),
  ).toBe(true);
  expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
  let bad = JSON.parse(JSON.stringify(s)) as TimberState;
  const [a, b] = bad.residents.filter((r) => r.diningSeat !== null);
  if (!a || !b) throw Error("식사 주민 없음");
  bad = {
    ...bad,
    residents: bad.residents.map((r) =>
      r.id === b.id ? { ...r, diningSeat: a.diningSeat } : r,
    ),
  };
  expect(() => parseTimberState(bad)).toThrow();
  s = {
    ...s,
    residents: s.residents.map((r) =>
      r.workplaceId ? { ...r, hunger: 400 } : r,
    ),
  };
  for (let i = 0; i < 40; i++) {
    s = advanceTimber(s, 1);
    expect(
      s.residents.filter(
        (r) => r.routine === "eating" && r.workplaceId === null,
      ).length,
    ).toBeLessThanOrEqual(20);
  }
});
it("식당·어획막 정원은 단계별로 달라지고 둥지·저장소만 무인 운영한다", () => {
  expect(
    [1, 2, 3].map((level) =>
      facilityStaffLimit({ kind: "restaurant", level: level as 1 | 2 | 3 }),
    ),
  ).toEqual([2, 4, 6]);
  expect(
    [1, 2, 3].map((level) =>
      facilityStaffLimit({ kind: "fishery", level: level as 1 | 2 | 3 }),
    ),
  ).toEqual([5, 10, 20]);
  for (const [kind, rule] of Object.entries(BUILDING_RULES))
    expect(rule.staff > 0).toBe(!["home", "storage"].includes(kind));
});
it("두 연구소는 서로 다른 연구를 동시에 진행하고 선행·중복·저장 검증을 유지한다", () => {
  let s = build(build(start(), "workshop"), "workshop", 0, 16);
  for (const f of s.town.facilities)
    s = cmd(s, { type: "facility-staff", id: f.id, count: 2 });
  s = cmd(s, { type: "start-research", tech: "TECH_TRAIL" });
  s = cmd(s, { type: "start-research", tech: "UPGRADE_HOME_2" });
  expect(() =>
    cmd(s, { type: "start-research", tech: "TECH_TRAIL" }),
  ).toThrow();
  expect(() =>
    cmd(s, { type: "start-research", tech: "UPGRADE_HOME_3" }),
  ).toThrow();
  s = advanceTimber(s, 40);
  expect(s.town.development.research).toHaveLength(2);
  expect(s.town.development.research.every((j) => j.work > 0)).toBe(true);
  expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
  const old = {
    ...s,
    version: 17,
    town: {
      ...s.town,
      development: {
        ...s.town.development,
        research: s.town.development.research[0],
      },
    },
  };
  // A v17 record can only contain its one paid research job; keep the paid cost ledger intact.
  expect(parseTimberState(old).town.development.research).toEqual([
    s.town.development.research[0],
  ]);
  const bad = JSON.parse(JSON.stringify(s)) as TimberState;
  if (bad.town.development.research[1])
    bad.town.development.research[1].facility =
      bad.town.development.research[0]?.facility ?? "";
  expect(() => parseTimberState(bad)).toThrow();
});
it("어획막은 물가에 지어 배치 인원만으로 운반 없이 즉시 입고한다", () => {
  let s = build(start(), "fishery", 46, 32);
  const f = s.town.facilities[0];
  if (!f) throw Error("어획막 없음");
  expect(
    buildingIssue(s, "fishery", {
      position: { x: 0, z: 16 },
      headingRadians: 0,
    }),
  ).toContain("물가");
  const before = s.world.resources.RES_FISH;
  s = {
    ...s,
    residents: s.residents.map((r, i) => ({
      ...r,
      workplaceId: i < 5 ? null : "guard",
    })),
  };
  s = cmd(s, { type: "facility-staff", id: f.id, count: 5 });
  s = advanceTimber(s, 60);
  expect(s.world.resources.RES_FISH).toBeGreaterThan(before);
  expect(s.town.facilities[0]?.haul).toBeNull();
  expect(s.town.facilities[0]?.buffer).toBe(0);
});
it("의료 인원 없이는 회복량이 오르지 않고 배치하면 여러 병원에서 치료한다", () => {
  let s = build(build(start(), "hospital"), "hospital", 0, 16);
  for (const f of s.town.facilities)
    s = cmd(s, { type: "facility-staff", id: f.id, count: 0 });
  const ids = s.residents.slice(0, 8).map((r) => r.id);
  s = cmd(s, {
    type: "citizen-event",
    event: { type: "illness", id: "multi-injury", citizenIds: ids },
  });
  s = advanceTimber(s, 40);
  expect(s.town.patients.every((p) => p.progress === 0)).toBe(true);
  for (const f of s.town.facilities)
    s = cmd(s, { type: "facility-staff", id: f.id, count: 1 });
  s = advanceTimber(s, 40);
  expect(s.town.patients.every((p) => p.progress > 0)).toBe(true);
  expect(new Set(s.town.patients.map((p) => p.hospital)).size).toBe(2);
});
it("정찰·교역만 하나로 제한하고 재배소·목축장은 빈 구릉에 건설할 수 있다", () => {
  const s = build(start(), "scout");
  expect(
    buildingIssue(s, "scout", { position: { x: 0, z: 16 }, headingRadians: 0 }),
  ).toContain("한 곳");
  for (const kind of ["farm", "ranch"] as const)
    expect(
      buildingIssue(start(), kind, {
        position: { x: 46, z: 32 },
        headingRadians: 0,
      }),
    ).toBeNull();
});
it("직원이 늘면 한 끼 체류가 짧아지고 어떤 입력도30분을 넘지 않는다", () => {
  const initialResident = createTimberState().residents[0];
  if (!initialResident) throw Error("주민 없음");
  const r = {
    ...initialResident,
    hunger: 400,
    position: { x: 0, z: 0 },
  };
  const places = {
    warmth: { x: 0, z: 0 },
    restaurant: { x: 0, z: 0 },
    minute: 420,
    restaurantStaffed: true,
    obstacles: [],
  };
  const slow = advanceResidentRoutine(
    r,
    0,
    1,
    2,
    { ...places, eatingMinutes: 30 },
    true,
  );
  const fast = advanceResidentRoutine(
    r,
    0,
    1,
    2,
    { ...places, eatingMinutes: 15 },
    true,
  );
  expect(slow.eatingUntil).toBe(30);
  expect(fast.eatingUntil).toBe(15);
  expect(
    advanceResidentRoutine(r, 0, 1, 2, { ...places, eatingMinutes: 100 }, true)
      .eatingUntil,
  ).toBe(30);
});
it("2단계 식당에4명을 배치해도 정수8분 식사와 저장 복원이 유효하다", () => {
  let s = build(start(), "restaurant");
  s = {
    ...s,
    town: {
      ...s.town,
      development: { ...s.town.development, grandfathered: ["build-1:2"] },
    },
  };
  s = cmd(s, { type: "upgrade-facility", id: "build-1" });
  s = advanceTimber(s, 150);
  expect(s.town.facilities[0]?.level).toBe(2);
  s = cmd(s, { type: "set-restaurant-workers", count: 4 });
  s = advanceTimber(s, 40);
  const f = s.town.facilities[0];
  if (!f) throw Error("식당 없음");
  s = {
    ...s,
    residents: s.residents.map((r) => ({
      ...r,
      hunger: r.workplaceId ? 0 : 400,
      rationUsed: 0,
      eatingUntil: null,
      diningSeat: null,
      routine: "idle",
      position: facilityDoor(f),
    })),
  };
  s = advanceTimber(s, 2);
  const diner = s.residents.find(
    (r) => r.routine === "eating" && r.workplaceId === null,
  );
  expect(diner?.eatingUntil).toBe(s.elapsed + 8);
  expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
});
it("입원한 주민이 식당 손님의 좌석을 차지하지 않는다", () => {
  let s = build(
    build(build(start(), "restaurant"), "restaurant", 0, 16),
    "hospital",
    -15,
    -15,
  );
  for (const f of s.town.facilities)
    s = cmd(s, {
      type: "facility-staff",
      id: f.id,
      count: f.kind === "hospital" ? 1 : 2,
    });
  s = advanceTimber(s, 35);
  s = cmd(s, {
    type: "citizen-event",
    event: {
      type: "illness",
      id: "ward-diners",
      citizenIds: s.residents.slice(0, 5).map((r) => r.id),
    },
  });
  s = advanceTimber(s, 35);
  const first = s.town.facilities[0];
  if (!first) throw Error("식당 없음");
  s = {
    ...s,
    residents: s.residents.map((r, i) => ({
      ...r,
      hunger: r.workplaceId ? 0 : 400,
      rationUsed: 0,
      eatingUntil: null,
      diningSeat: null,
      routine:
        r.health === "sick" ? "resting" : r.workplaceId ? "working" : "idle",
      position:
        r.health === "sick" || r.workplaceId
          ? r.position
          : facilityDoor(s.town.facilities[i % 2] ?? first),
    })),
  };
  s = advanceTimber(s, 10);
  expect(s.town.patients).toHaveLength(5);
  expect(
    s.residents.filter((r) => r.routine === "eating" && r.workplaceId === null),
  ).toHaveLength(20);
  expect(
    s.residents
      .filter((r) => r.health === "sick")
      .every((r) => r.diningSeat === null),
  ).toBe(true);
});
it("파견 인력이 회복하면 임시 대체 직원과 중복 배치되지 않는다", () => {
  let s = build(start(), "trade");
  s = cmd(s, { type: "facility-staff", id: "build-1", count: 1 });
  s = advanceTimber(s, 1);
  s = cmd(s, { type: "dispatch-food", id: "build-1", food: "RES_FISH" });
  const who = s.town.trips[0]?.ids[0];
  if (!who) throw Error("교역 인력 없음");
  s = cmd(s, {
    type: "citizen-event",
    event: { type: "illness", id: "trip-sick", citizenIds: [who] },
  });
  s = advanceTimber(s, 1);
  s = cmd(s, {
    type: "citizen-event",
    event: { type: "recovery", id: "trip-recovery", citizenIds: [who] },
  });
  s = advanceTimber(s, 1);
  expect(
    s.residents.filter((r) => r.workplaceId === "facility:build-1"),
  ).toHaveLength(1);
  expect(s.residents.find((r) => r.id === who)?.workplaceId).toBe(
    "facility:build-1",
  );
  expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
});
