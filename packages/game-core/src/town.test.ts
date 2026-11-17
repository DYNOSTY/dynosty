import { expect, it } from "vitest";
import { createPlayState, type FoodId } from "./play.js";
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
  buildingPower,
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
  expect(s.world.resources.RES_WOOD).toBe(before - 200000);
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
  expect(s.world.resources.RES_WOOD).toBe(before - 200000);
});
it("여러 부지는 즉시 자재 확보하며 겹침 거부, 순차 완공, 저장 복원도 동일하다", () => {
  let s = plan(start(), "home");
  expect(() => plan(s, "farm")).toThrow();
  s = plan(s, "storage", { ...pose, position: { x: 0, z: 16 } });
  expect(s.town.orders).toHaveLength(2);
  expect(s.world.resources.RES_WOOD).toBe(2680000);
  s = advanceTimber(s, 20);
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
  "%s 운영·소모·운반 후에만 공동 재고에 입고한다",
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
    expect(observedBuffer).toBe(true);
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

it("대기 부지의 입구나 주민이 서 있는 곳을 덮는 배치를 거부한다", () => {
  let s = start();
  s = {
    ...s,
    residents: s.residents.map((r, i) =>
      i === 0 ? { ...r, position: pose.position, insideHome: false } : r,
    ),
  };
  expect(buildingIssue(s, "home", pose)).toContain("주민");
  s = plan(start(), "storage", {
    position: { x: -16, z: 8 },
    headingRadians: 0,
  });
  expect(
    buildingIssue(s, "storage", {
      position: { x: -16, z: 13.3 },
      headingRadians: 0,
    }),
  ).toContain("출입구");
});
