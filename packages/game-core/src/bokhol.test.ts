import { expect, it } from "vitest";
import {
  BOKHOL_FOREST,
  BOKHOL_MAP,
  bokholElevation,
  constructionPlot,
  inBokholForest,
  reservedVillageLand,
  sawmillHasForest,
  VILLAGE_LAYOUT,
} from "./bokhol.js";
import { LOGGING_RULES, loggingWorkplace } from "./logging.js";
import { applyCitizenEvent, createPlayState, parsePlayState } from "./play.js";
import { requireValue } from "./require-value.js";
import {
  commandTimber,
  createCapital,
  createTimberState,
  createVillageGame,
  parseTimberState,
  timberScene,
} from "./timber.js";
import { HOME_PLOTS } from "./village-services.js";

it("복홀은 넓은 구릉지이며 숲이 고갈되면 해당 구역만 평탄해진다", () => {
  expect(BOKHOL_MAP.size).toBe(512);
  expect(bokholElevation(-38, -8)).toBeGreaterThan(0.5);
  for (let x = -44; x <= -32; x += 2)
    for (let z = -16; z <= 0; z += 2) expect(bokholElevation(x, z, 0)).toBe(0);
  expect(bokholElevation(80, 60, 0)).toBe(bokholElevation(80, 60, 120));
  expect(bokholElevation(80, 60)).not.toBe(bokholElevation(60, 80));
  expect(inBokholForest(BOKHOL_FOREST)).toBe(true);
  expect(sawmillHasForest(LOGGING_RULES.workshop)).toBe(true);
  expect(sawmillHasForest({ x: 124, z: 0 })).toBe(false);
  const site = { x: 64, z: 40 };
  expect(bokholElevation(site.x + 1, site.z, 120, [site])).toBe(
    bokholElevation(site.x, site.z, 120, [site]),
  );
});
it("600명과 거주지100곳을 지도 안에 수용하고 외곽 위치도 저장·표시한다", () => {
  expect(HOME_PLOTS).toHaveLength(100);
  expect(new Set(HOME_PLOTS.map((p) => `${p.x}:${p.z}`)).size).toBe(100);
  let world = applyCitizenEvent(createPlayState(), {
    id: "large-town",
    type: "arrival",
    groups: [{ species: "R02", count: 540 }],
  });
  world = {
    ...world,
    buildings: HOME_PLOTS.map((position, i) => ({
      id: `house-${i}`,
      type: "ondol-nest" as const,
      position: { ...position, y: 0 },
      headingRadians: 0,
    })),
  };
  const s = createTimberState(parsePlayState(world));
  expect(s.residents).toHaveLength(600);
  expect(s.residents.every((r) => r.homeId !== null)).toBe(true);
  expect(timberScene(s).entities).toHaveLength(700);
  expect(parseTimberState(s)).toEqual(s);
  const first = world.buildings[0];
  if (!first) throw Error("거주지 없음");
  const edge = {
    ...world,
    buildings: [{ ...first, position: { x: 100, y: 0, z: 100 } }],
  };
  expect(parsePlayState(edge).buildings[0]?.position.x).toBe(100);
  expect(() =>
    parsePlayState({
      ...edge,
      buildings: [{ ...first, position: { x: 253, y: 0, z: 100 } }],
    }),
  ).toThrow();
});
it("제재소 직원은 제재소 안에서 일하며 개별 벌목 지시를 만들지 않는다", () => {
  const s = createTimberState();
  for (let i = 0; i < 4; i++) {
    const residents = s.residents.map((r, j) =>
      j < 4 ? { ...r, workplaceId: "logging" } : r,
    );
    const point = loggingWorkplace({ ...s, residents }, residents[i]?.id ?? "");
    expect(Math.abs(point.x - LOGGING_RULES.workshop.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(point.z - LOGGING_RULES.workshop.z)).toBeLessThanOrEqual(3);
    expect(inBokholForest(point)).toBe(false);
  }
});
it("숲이 남아 있는 부지는 건설 후보에서 제외하고 고갈 뒤 건설할 수 있다", () => {
  let s = createTimberState();
  const occupied = HOME_PLOTS.slice(0, 18).map((position, i) => ({
    id: i === 0 ? "example-building-1" : `dwelling-${i + 1}`,
    position,
    capacity: 20,
  }));
  s = {
    ...s,
    homes: occupied,
    world: {
      ...s.world,
      buildings: occupied.map((h) => ({
        id: h.id,
        type: "ondol-nest" as const,
        position: { ...h.position, y: 0 },
        headingRadians: Math.PI,
      })),
    },
  };
  expect(() =>
    commandTimber(
      s,
      {
        type: "build-home",
        position: { x: -39, z: -8 },
        headingRadians: Math.PI,
      },
      "before",
    ),
  ).toThrow();
  const cleared = {
    ...s,
    logging: {
      ...s.logging,
      built: true,
      storageBuilt: true,
      remaining: 0,
      delivered: 120,
    },
    world: {
      ...s.world,
      resources: {
        ...s.world.resources,
        RES_WOOD: s.world.resources.RES_WOOD + 1200000,
      },
    },
  };
  const after = commandTimber(
    cleared,
    {
      type: "build-home",
      position: { x: -39, z: -8 },
      headingRadians: Math.PI,
    },
    "after",
  );
  expect(inBokholForest(after.construction?.position ?? { x: 0, z: 0 })).toBe(
    true,
  );
});

it("복홀과 도성의 초기 건물은 겹치지 않는 측량 구획에 놓인다", () => {
  for (const [, x, z] of VILLAGE_LAYOUT)
    expect(constructionPlot({ x, z })).toEqual({ x, z });
  const village = createVillageGame(true);
  for (const s of [
    village,
    createVillageGame(false, true),
    createCapital(village),
  ]) {
    const buildings = [...s.homes, ...s.town.facilities];
    for (const [i, b] of buildings.entries()) {
      expect(constructionPlot(b.position)).toEqual(b.position);
      expect(reservedVillageLand(b.position, !!s.rebuilding)).toBeNull();
      expect(
        buildings
          .slice(0, i)
          .some(
            (other) =>
              Math.abs(other.position.x - b.position.x) < 4.5 &&
              Math.abs(other.position.z - b.position.z) < 4.5,
          ),
      ).toBe(false);
    }
  }
});
it("같은 구획에 내린 명령은 한 부지만 쓰고 기존 저장의 위치는 보존한다", () => {
  const s = commandTimber(
    createVillageGame(),
    {
      type: "plan-building",
      kind: "home",
      position: { x: 12.68, z: 11.15 },
      headingRadians: Math.PI,
    },
    "plot",
  );
  expect(s.town.orders[0]?.position).toEqual({ x: 12, z: 12 });
  expect(() =>
    commandTimber(
      s,
      {
        type: "plan-building",
        kind: "storage",
        position: { x: 11.4, z: 12.6 },
        headingRadians: 0,
      },
      "again",
    ),
  ).toThrow();
  const old = {
    ...s,
    town: {
      ...s.town,
      orders: [
        {
          ...requireValue(s.town.orders[0], "s.town.orders[0]"),
          position: { x: 12.25, z: 12.5 },
        },
      ],
    },
  };
  expect(parseTimberState(old).town.orders[0]?.position).toEqual({
    x: 12.25,
    z: 12.5,
  });
});
