import { expect, it } from "vitest";
import { applyCitizenEvent } from "./play.js";
import {
  advanceTimber,
  commandTimber,
  createTimberSave,
  createTimberState,
  parseTimberSave,
  type TimberPhase,
  type TimberState,
  timberCartPosition,
  timberScene,
} from "./timber.js";

const event = (
  s: TimberState,
  type: "illness" | "recovery" | "death",
  ids: string[],
  id = type,
) =>
  commandTimber(
    s,
    { type: "citizen-event", event: { type, id, citizenIds: ids } },
    id,
  );
it("60명 전원이 실제 표시되고 개별 허기로 식당 건설을 요구하며 식량은 먹을 때만 쓴다", () => {
  const s = createTimberState(),
    next = advanceTimber(s, 2);
  expect(
    timberScene(next).entities.filter((e) => e.kind === "resident"),
  ).toHaveLength(60);
  expect(new Set(next.residents.map((r) => r.hunger)).size).toBeGreaterThan(20);
  expect(next.residents.some((r) => r.request === "no-restaurant")).toBe(true);
  expect(next.world.resources).toEqual(s.world.resources);
});
it("식당 건설만 지시하면 인력이 이동·건설하고 배고픈 주민이 각자 먹고 귀가한다", () => {
  const initial = advanceTimber(createTimberState(), 120);
  let s = commandTimber(initial, { type: "build-restaurant" }, "build");
  expect(s.restaurantBuilt).toBe(false);
  expect(s.construction).not.toBeNull();
  expect(s.world.resources.RES_WOOD).toBe(200000);
  s = advanceTimber(s, 40);
  expect(s.restaurantBuilt).toBe(true);
  expect(s.construction).toBeNull();
  s = commandTimber(s, { type: "set-restaurant-workers", count: 1 }, "staff");
  s = advanceTimber(s, 40);
  expect(
    s.residents.some((r, i) => r.hunger < (initial.residents[i]?.hunger ?? -1)),
  ).toBe(true);
  expect(s.residents.some((r) => r.lastMeal !== null)).toBe(true);
  expect(s.world.resources.RES_PLANT).toBeLessThan(
    initial.world.resources.RES_PLANT,
  );
  expect(s.buildingHealth).toBe(100);
  expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
});
it("식당이 닫혀 있거나 먹이가 없으면 먹지 않고 요구를 전달한다", () => {
  const base = createTimberState();
  for (const minute of [23 * 60, 2 * 60]) {
    const s = advanceTimber(
      { ...base, restaurantBuilt: true, world: { ...base.world, minute } },
      3,
    );
    expect(s.residents.some((r) => r.request === "restaurant-closed")).toBe(
      true,
    );
    expect(s.world.resources).toEqual(base.world.resources);
  }
  const s = advanceTimber(
    commandTimber(
      {
        ...base,
        restaurantBuilt: true,
        world: {
          ...base.world,
          resources: {
            ...base.world.resources,
            RES_PLANT: 0,
            RES_MEAT: 0,
            RES_FISH: 0,
          },
        },
      },
      { type: "set-restaurant-workers", count: 1 },
      "staff",
    ),
    20,
  );
  expect(s.residents.some((r) => r.request === "no-food")).toBe(true);
  expect(s.residents.some((r) => r.routine === "eating")).toBe(false);
});
it("식당은 개인별로 이용하며 근무 중인 주민은 작업장을 이탈하지 않는다", () => {
  const base = createTimberState();
  const s = advanceTimber(
    {
      ...base,
      restaurantBuilt: true,
      world: { ...base.world, minute: 9 * 60 },
      residents: base.residents.map((r) => ({
        ...r,
        workplaceId: "mill",
        hunger: 400,
      })),
    },
    20,
  );
  expect(
    s.residents.every((r) => r.routine === "working" && r.hunger === 420),
  ).toBe(true);
  expect(s.world.resources.RES_PLANT).toBe(base.world.resources.RES_PLANT);
  const after = advanceTimber(
    commandTimber(
      {
        ...s,
        world: { ...s.world, minute: 19 * 60 },
        residents: s.residents.map((r, i) =>
          i === 0 ? { ...r, workplaceId: null } : r,
        ),
      },
      { type: "set-restaurant-workers", count: 1 },
      "evening-staff",
    ),
    30,
  );
  expect(after.residents.some((r) => r.routine === "eating")).toBe(true);
});
it("합류 사건은 종류별 인원을 실제 등록하고 중복 수신해도 늘리지 않는다", () => {
  let s = advanceTimber(createTimberState(), 120);
  const arrival = {
    type: "arrival" as const,
    id: "scenario-arrival",
    groups: [
      { species: "R02", count: 3 },
      { species: "R03", count: 1 },
      { species: "SPINO", count: 2 },
    ],
  };
  s = commandTimber(s, { type: "citizen-event", event: arrival }, "1");
  expect(s.residents).toHaveLength(66);
  expect(s.world.citizens.filter((c) => c.alive)).toHaveLength(66);
  const twice = commandTimber(
    s,
    { type: "citizen-event", event: arrival },
    "2",
  );
  expect(twice.residents).toEqual(s.residents);
  expect(
    timberScene(s).entities.filter((e) => e.kind === "resident"),
  ).toHaveLength(66);
  s = {
    ...s,
    residents: s.residents.map((r, i) =>
      i < 60 ? { ...r, workplaceId: "existing-work" } : r,
    ),
  };
  s = commandTimber(
    s,
    {
      type: "queue-work",
      workId: "new-worker-task",
      position: { x: 14, z: -4 },
    },
    "work",
  );
  expect(
    s.residents.slice(60).some((r) => r.nextWork?.id === "new-worker-task"),
  ).toBe(true);
});
it("기존·신규 주민의 발병·회복·사망 사건을 같은 명부로 처리한다", () => {
  let s = commandTimber(
    createTimberState(),
    {
      type: "citizen-event",
      event: {
        type: "arrival",
        id: "arrival",
        groups: [{ species: "R03", count: 1 }],
      },
    },
    "a",
  );
  const ids = [
    s.residents[0]?.id ?? "missing",
    s.residents[60]?.id ?? "missing",
  ];
  s = event(s, "illness", ids);
  expect(s.residents.filter((r) => r.health === "sick")).toHaveLength(2);
  s = event(s, "recovery", ids);
  expect(s.residents.every((r) => r.health === "healthy")).toBe(true);
  s = event(s, "death", ids);
  expect(s.world.citizens.filter((c) => c.alive)).toHaveLength(59);
  expect(
    timberScene(s).entities.filter((e) => e.kind === "resident" && e.visible),
  ).toHaveLength(59);
  const old = s.residents[0]?.hunger;
  s = advanceTimber(s, 20);
  expect(s.residents[0]?.hunger).toBe(old);
  expect(() =>
    applyCitizenEvent(s.world, {
      type: "recovery",
      id: "revive",
      citizenIds: ids,
    }),
  ).toThrow();
});
it.each(["transport", "unloading", "inspecting", "drying"] as TimberPhase[])(
  "%s 중 담당자 사망 시 유휴 주민이 실제 이동해 남은 작업을 이어받는다",
  (phase) => {
    let s = commandTimber(
      createTimberState(),
      { type: "choose", offer: "A" },
      "choose",
    );
    s = commandTimber(s, { type: "contract" }, "contract");
    let count = 0;
    while (s.phase !== phase && count++ < 15)
      s = commandTimber(s, { type: "next" }, `next${count}`);
    s = advanceTimber(s, 1);
    const wood = s.world.resources.RES_WOOD,
      cart = timberCartPosition(s),
      old = s.workerIds[0] ?? "missing";
    s = event(s, "death", [old]);
    expect(s.phase).toBe("relief");
    expect(s.workerIds).not.toContain(old);
    expect(timberCartPosition(s)).toEqual(cart);
    expect(s.world.resources.RES_WOOD).toBe(wood);
    expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
    const bad = JSON.parse(JSON.stringify(createTimberSave(s)));
    bad.state.due++;
    expect(() => parseTimberSave(bad)).toThrow();
    s = advanceTimber(s, 120);
    expect(s.phase).toBe("ready");
    expect(s.world.resources.RES_WOOD).toBe(1400000);
  },
);
it("시간 경과로 건물은 손상되지 않고 공격·화재 사건만 체력을 줄인다", () => {
  let s = advanceTimber(createTimberState(), 1440);
  expect(s.buildingHealth).toBe(100);
  s = commandTimber(
    s,
    { type: "building-damage", cause: "fire", amount: 25 },
    "fire",
  );
  expect(s.buildingHealth).toBe(75);
  s = advanceTimber(s, 100);
  expect(s.buildingHealth).toBe(75);
  expect(() =>
    commandTimber(
      s,
      { type: "building-damage", cause: "decay" as "fire", amount: 1 },
      "bad",
    ),
  ).toThrow();
});

it("식당 건설 시간 변조는 거부하고 건설 인력이 아프면 유휴 인력이 이어받는다", () => {
  let s = commandTimber(
    advanceTimber(createTimberState(), 120),
    { type: "build-restaurant" },
    "build",
  );
  for (let i = 0; i < 20 && s.construction?.finishAt === null; i++)
    s = advanceTimber(s, 1);
  expect(s.construction?.finishAt).not.toBeNull();
  const bad = JSON.parse(JSON.stringify(createTimberSave(s)));
  bad.state.construction.finishAt++;
  expect(() => parseTimberSave(bad)).toThrow();
  const old = s.construction?.workerId;
  if (!old) throw Error("건설 인력이 없습니다.");
  s = event(s, "illness", [old]);
  expect(s.construction?.workerId).not.toBe(old);
  s = advanceTimber(s, 40);
  expect(s.restaurantBuilt).toBe(true);
  expect(s.world.resources.RES_WOOD).toBe(200000);
});

it("교대 인력이 없으면 작업만 대기하고 다른 주민의 허기·생활은 계속된다", () => {
  let s = commandTimber(
    createTimberState(),
    { type: "choose", offer: "B" },
    "choose",
  );
  s = commandTimber(s, { type: "contract" }, "contract");
  s = commandTimber(s, { type: "next" }, "depart");
  const operator = s.workerIds[0];
  if (!operator) throw Error("담당자 없음");
  s = {
    ...s,
    residents: s.residents.map((r) =>
      r.id === operator ? r : { ...r, workplaceId: "workshop" },
    ),
  };
  s = event(s, "death", [operator]);
  expect(s.phase).toBe("crew-wait");
  const old = s.elapsed,
    hunger = s.residents.find((r) => r.id !== operator)?.hunger ?? 0;
  s = advanceTimber(s, 5);
  expect(s.elapsed).toBe(old + 5);
  expect(s.residents.find((r) => r.id !== operator)?.hunger).toBe(hunger + 5);
  s = commandTimber(
    s,
    {
      type: "citizen-event",
      event: {
        type: "arrival",
        id: "relief-arrival",
        groups: [{ species: "R03", count: 1 }],
      },
    },
    "new",
  );
  expect(s.phase).toBe("relief");
  s = advanceTimber(s, 120);
  expect(s.phase).toBe("ready");
  expect(s.world.resources.RES_WOOD).toBe(1400000);
});

it("보수 중 화재로 파괴되면 작업을 취소하고 자동 복구하지 않는다", () => {
  let s = commandTimber(
    createTimberState(),
    { type: "choose", offer: "B" },
    "choose",
  );
  s = commandTimber(s, { type: "contract" }, "contract");
  s = advanceTimber(s, 100);
  s = commandTimber(
    s,
    { type: "building-damage", cause: "attack", amount: 25 },
    "attack",
  );
  s = commandTimber(s, { type: "use" }, "repair");
  s = commandTimber(
    s,
    { type: "building-damage", cause: "fire", amount: 100 },
    "fire",
  );
  expect(s.reservedWood).toBe(0);
  expect(s.repairWorkerId).toBeNull();
  s = advanceTimber(s, 20);
  expect(s.buildingHealth).toBe(0);
  expect(s.residents.some((r) => r.homeId === "example-building-1")).toBe(
    false,
  );
  expect(s.world.resources.RES_WOOD).toBe(1400000);
});
