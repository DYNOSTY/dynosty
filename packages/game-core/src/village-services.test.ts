import { expect, it } from "vitest";
import { createPlayState } from "./play.js";
import {
  advanceTimber,
  commandTimber,
  createTimberSave,
  createTimberState,
  parseTimberSave,
  restaurantStaff,
} from "./timber.js";
import {
  homeUsage,
  mealPlan,
  rationLimit,
  speciesRule,
} from "./village-services.js";

const citizen = (species: string) =>
  createPlayState().citizens.find((c) => c.species === species) ??
  (() => {
    throw Error("주민 없음");
  })();
const resources = () => ({ ...createPlayState().resources });
it.each([
  ["R03", "RES_MEAT", "RES_FISH", 2500],
  ["SPINO", "RES_FISH", "RES_MEAT", 5000],
] as const)(
  "%s는 선호 식량이 없으면 다른 동물성 식량을 같은 몫으로 배급받는다",
  (species, primary, alternative, amount) => {
    const stock = resources();
    stock[primary] = 0;
    const plan = mealPlan(citizen(species), "needs", 0, stock);
    expect(plan.foods).toEqual({ [alternative]: amount });
    expect(plan.amount).toBe(amount);
    expect(plan.relief).toBe(360);
    expect(stock[alternative]).toBe(1200000);
  },
);
it("선호 먹이부터 쓰고 부족분만 대체하며 초식 주민에게는 동물성 식량을 쓰지 않는다", () => {
  const stock = resources();
  stock.RES_MEAT = 1000;
  stock.RES_FISH = 2000;
  expect(mealPlan(citizen("R03"), "needs", 0, stock).foods).toEqual({
    RES_MEAT: 1000,
    RES_FISH: 1500,
  });
  stock.RES_PLANT = 0;
  expect(mealPlan(citizen("R02"), "needs", 0, stock).amount).toBe(0);
});
it("종별 정량·하루 상한을 지키며 덜 배급받은 큰 주민의 허기는 남는다", () => {
  expect(mealPlan(citizen("R02"), "needs", 0, resources())).toMatchObject({
    amount: 5000,
    relief: 360,
  });
  expect(mealPlan(citizen("R02"), "cap", 0, resources())).toMatchObject({
    amount: 2500,
    relief: 180,
  });
  expect(rationLimit("R02", "needs")).toBe(20000);
  expect(rationLimit("R03", "needs")).toBe(10000);
  expect(mealPlan(citizen("R02"), "cap", 10000, resources()).amount).toBe(0);
  const stock = resources();
  stock.RES_FISH = 0;
  stock.RES_MEAT = 1000;
  expect(mealPlan(citizen("SPINO"), "needs", 0, stock)).toMatchObject({
    amount: 1000,
    relief: 72,
  });
});
it("식당은 건물만 있어서는 배급하지 않고 직원이 도착한 뒤 운영한다", () => {
  let s = { ...createTimberState(), restaurantBuilt: true };
  s = advanceTimber(s, 30);
  expect(s.world.resources.RES_PLANT).toBe(1200000);
  expect(s.residents.some((r) => r.request === "no-staff")).toBe(true);
  s = commandTimber(s, { type: "set-restaurant-workers", count: 1 }, "staff");
  expect(restaurantStaff(s)).toMatchObject({
    assigned: 1,
    present: 0,
    serving: 0,
  });
  s = advanceTimber(s, 35);
  expect(restaurantStaff(s).assigned).toBe(1);
  expect(s.residents.some((r) => r.lastMeal !== null)).toBe(true);
  expect(() =>
    commandTimber(s, { type: "set-restaurant-workers", count: 3 }, "bad"),
  ).toThrow();
});
it("직원은 영업 중 자기 식당에서 먹고 배급 기록은 저장 복원 후에도 중복되지 않는다", () => {
  let s = commandTimber(
    { ...createTimberState(), restaurantBuilt: true },
    { type: "set-restaurant-workers", count: 1 },
    "staff",
  );
  s = advanceTimber(s, 25);
  const employee = s.residents.find((r) => r.workplaceId === "restaurant");
  if (!employee) throw Error("직원 없음");
  s = {
    ...s,
    residents: s.residents.map((r) =>
      r.id === employee.id
        ? { ...r, hunger: 400, rationUsed: 0, lastMeal: null }
        : r,
    ),
  };
  s = advanceTimber(s, 1);
  const eating = s.residents.find((r) => r.id === employee.id);
  expect(eating?.routine).toBe("eating");
  expect(eating?.workplaceId).toBe("restaurant");
  const c = s.world.citizens.find((c) => c.id === employee.id);
  if (!c) throw Error("주민 없음");
  expect(eating?.rationUsed).toBe(speciesRule(c.species).portion);
  s = parseTimberSave(JSON.parse(JSON.stringify(createTimberSave(s)))).state;
  s = advanceTimber(s, 6);
  expect(s.residents.find((r) => r.id === employee.id)?.rationUsed).toBe(
    eating?.rationUsed,
  );
  expect(restaurantStaff(s).serving).toBe(1);
});
it("인원수를 줄이면 직원을 해제하고 질병 사건에는 유휴 주민이 자리를 잇는다", () => {
  let s = commandTimber(
    { ...createTimberState(), restaurantBuilt: true },
    { type: "set-restaurant-workers", count: 1 },
    "staff",
  );
  const id = s.residents.find((r) => r.workplaceId === "restaurant")?.id;
  if (!id) throw Error("직원 없음");
  s = commandTimber(
    s,
    {
      type: "citizen-event",
      event: { id: "sick", type: "illness", citizenIds: [id] },
    },
    "sick",
  );
  expect(s.residents.find((r) => r.id === id)?.workplaceId).toBeNull();
  expect(
    s.residents.filter((r) => r.workplaceId === "restaurant"),
  ).toHaveLength(1);
  s = commandTimber(s, { type: "set-restaurant-workers", count: 0 }, "release");
  expect(restaurantStaff(s).assigned).toBe(0);
});
it("배급 정책을 바꿔도 이미 받은 몫을 지우지 않으며 새 날에만 초기화한다", () => {
  let s = createTimberState();
  const id = s.residents[0]?.id;
  if (!id) throw Error("주민 없음");
  s = {
    ...s,
    residents: s.residents.map((r) =>
      r.id === id ? { ...r, rationUsed: 10000 } : r,
    ),
  };
  s = commandTimber(s, { type: "set-ration-policy", policy: "cap" }, "cap");
  expect(s.residents[0]?.rationUsed).toBe(10000);
  s = commandTimber(s, { type: "set-ration-policy", policy: "needs" }, "needs");
  expect(s.residents[0]?.rationUsed).toBe(10000);
  s = advanceTimber(s, 1020);
  expect(s.world.day).toBe(2);
  expect(s.residents[0]?.rationUsed).toBe(0);
});
it("6곳의 실제 둥지에 체격별 공간으로 입주하고 문까지 이동한 뒤 실내에서 쉰다", () => {
  let s = createTimberState();
  expect(s.homes).toHaveLength(6);
  expect(s.world.buildings).toHaveLength(6);
  expect(s.residents.every((r) => r.homeId !== null)).toBe(true);
  expect(
    s.homes.reduce(
      (sum, h) => sum + homeUsage(h.id, s.residents, s.world.citizens),
      0,
    ),
  ).toBe(100);
  s = advanceTimber(s, 720);
  expect(s.residents.every((r) => r.insideHome)).toBe(true);
  for (const r of s.residents) expect(r.position).toEqual(r.home);
});
it("합류로 거주 공간이 부족하면 요구하고 둥지 증설 뒤 자동 입주한다", () => {
  let s = commandTimber(
    createTimberState(),
    {
      type: "citizen-event",
      event: {
        type: "arrival",
        id: "new",
        groups: [{ species: "SPINO", count: 15 }],
      },
    },
    "new",
  );
  s = advanceTimber(s, 1);
  expect(s.residents.some((r) => r.homeId === null)).toBe(true);
  s = commandTimber(
    s,
    { type: "build-home", position: { x: 12, z: 12 }, headingRadians: Math.PI },
    "home",
  );
  const builder = s.construction?.workerId;
  s = advanceTimber(s, 190);
  expect(s.homes).toHaveLength(7);
  expect(s.world.buildings).toHaveLength(7);
  expect(s.residents.every((r) => r.homeId !== null)).toBe(true);
  expect(s.world.resources.RES_WOOD).toBe(1000000);
  expect(s.residents.find((r) => r.id === builder)?.task).toBeNull();
  expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
});
it("거주·배급·직원 기록이 손상된 저장을 거부한다", () => {
  const s = createTimberState();
  for (const damage of ["home", "ration", "staff"]) {
    const bad = JSON.parse(JSON.stringify(createTimberSave(s)));
    if (damage === "home") bad.state.residents[0].homeId = "missing";
    if (damage === "ration") bad.state.residents[0].rationUsed = 30000;
    if (damage === "staff") bad.state.restaurantWorkerTarget = 3;
    expect(() => parseTimberSave(bad)).toThrow();
  }
});
