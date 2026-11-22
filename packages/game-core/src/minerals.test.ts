import { expect, it } from "vitest";
import {
  BOKHOL_FORESTS,
  BOKHOL_MAP,
  BOKHOL_MINERALS,
  bokholElevation,
  type ProductionSiteId,
  productionSiteDefinition,
} from "./bokhol.js";
import { loggingSite, loggingSites, productionSites } from "./logging.js";
import { createPlayState } from "./play.js";
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
import { buildingIssue, idleTownResidents } from "./town.js";

let sequence = 0;
function fundedTown() {
  const world = createPlayState();
  return createTimberState({
    ...world,
    resources: { ...world.resources, RES_WOOD: 4500000 },
  });
}
const command = (s: TimberState, c: TimberCommand) =>
  commandTimber(s, c, `mine-${++sequence}`);
function build(id: ProductionSiteId) {
  let s = command(advanceTimber(fundedTown(), 120), {
    type: "build-logging",
    siteId: id,
  });
  s = advanceTimber(s, 180);
  expect(loggingSite(s, id).built).toBe(true);
  s = command(s, { type: "build-storage", siteId: id });
  s = advanceTimber(s, 180);
  expect(loggingSite(s, id).storageBuilt).toBe(true);
  return command(s, { type: "set-logging-workers", siteId: id, count: 2 });
}
it("넓은 지도에 거주지 둘레 숲과 석탄광·철광산·채석장 및 마을 가까운 추가 광맥을 둔다", () => {
  expect(BOKHOL_MAP.size).toBe(512);
  expect(BOKHOL_FORESTS).toHaveLength(13);
  for (const kind of ["coal", "iron", "stone"])
    expect(BOKHOL_MINERALS.filter((m) => m.kind === kind)).toHaveLength(
      kind === "stone" ? 4 : 3,
    );
  for (const m of BOKHOL_MINERALS) {
    const rim =
      [
        [26, 0],
        [-26, 0],
        [0, 26],
        [0, -26],
      ].reduce(
        (sum, [x = 0, z = 0]) => sum + bokholElevation(m.x + x, m.z + z),
        0,
      ) / 4;
    expect(bokholElevation(m.x, m.z)).toBeLessThan(rim - 2);
  }
});
it.each(["coal-west", "iron-north", "stone-east"] as const)(
  "%s 인원 배치 후 하역한 자원만 입고하고 다른 자원과 숲은 유지한다",
  (id) => {
    let s = build(id);
    const resource = productionSiteDefinition(id).resource;
    const initial = { ...s.world.resources };
    s = advanceTimber(s, 1440);
    const l = loggingSite(s, id);
    expect(l.delivered).toBeGreaterThan(0);
    expect(s.world.resources[resource]).toBe(
      initial[resource] + l.delivered * 10000,
    );
    expect(s.world.resources.RES_METAL).toBe(initial.RES_METAL);
    expect(loggingSites(s).every((f) => f.remaining === 120)).toBe(true);
    expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
    expect(
      advanceTimber(parseTimberSave(createTimberSave(s)).state, 20),
    ).toEqual(advanceTimber(s, 20));
    expect(() =>
      parseTimberState({
        ...s,
        world: {
          ...s.world,
          resources: {
            ...s.world.resources,
            [resource]: s.world.resources[resource] + 10000,
          },
        },
      }),
    ).toThrow();
  },
);
it("광맥이 고갈되어도 함지는 남고 숲이나 다른 광맥의 자원은 줄지 않는다", () => {
  let s = build("coal-east");
  for (let i = 0; i < 4; i++) s = advanceTimber(s, 1440);
  const coal = loggingSite(s, "coal-east");
  expect(coal.remaining).toBe(0);
  expect(coal.delivered).toBe(180);
  expect(loggingSite(s, "coal-west").remaining).toBe(180);
  const m = BOKHOL_MINERALS.find((m) => m.id === "coal-east");
  if (!m) throw Error("광맥 없음");
  expect(
    bokholElevation(
      m.x,
      m.z,
      Object.fromEntries(
        productionSites(s).map((l) => [l.siteId, l.remaining]),
      ),
    ),
  ).toBe(bokholElevation(m.x, m.z));
});
it("v11 이전 숲·재고·진행을 보존하고 새 숲·광물 권역과 초기 재고를 추가한다", () => {
  const current = createTimberState();
  const {
    mineralSites: _mineral,
    initialMinerals: _initial,
    ...base
  } = current;
  const legacy = (l: typeof current.logging) => {
    const { remaining, ...rest } = l;
    return { ...rest, forest: remaining };
  };
  const resources = { ...base.world.resources };
  delete (resources as Partial<typeof resources>).RES_IRON_ORE;
  delete (resources as Partial<typeof resources>).RES_STONE;
  const old = {
    ...base,
    version: 11,
    logging: legacy(base.logging),
    loggingSites: base.loggingSites.slice(0, 8).map(legacy),
    world: { ...base.world, resources },
  };
  const loaded = parseTimberState(old);
  expect(loaded.version).toBe(18);
  expect(loaded.logging.remaining).toBe(120);
  expect(loaded.loggingSites).toHaveLength(12);
  expect(loaded.mineralSites).toHaveLength(BOKHOL_MINERALS.length);
  expect(loaded.world.resources.RES_IRON_ORE).toBe(0);
  expect(loaded.world.resources.RES_STONE).toBe(0);
  expect(loaded.world.resources.RES_COAL).toBe(
    current.world.resources.RES_COAL,
  );
  expect(() =>
    parseTimberState({ ...old, loggingSites: old.loggingSites.slice(1) }),
  ).toThrow();
});

it("새 광맥 옆에는 건설할 자리가 있고 예전 광산 재고가 보존된다", () => {
  const s = fundedTown();
  for (const site of BOKHOL_MINERALS.slice(6)) {
    const pose = { position: { x: site.x + 15, z: site.z }, headingRadians: 0 };
    expect(
      buildingIssue(s, site.kind === "stone" ? "quarry" : site.kind, pose),
      site.name,
    ).toBeNull();
    expect(buildingIssue(s, "home", pose), site.name).toBeNull();
  }
  const legacy = { ...s, mineralSites: s.mineralSites.slice(0, 6) };
  const restored = parseTimberState(legacy);
  expect(restored.mineralSites.slice(0, 6)).toEqual(legacy.mineralSites);
  expect(restored.mineralSites).toHaveLength(BOKHOL_MINERALS.length);
});

it("한 광맥의 공사 두 곳이 자리를 예약하고 저장 후에도 세 번째 광산을 막는다", () => {
  let s = createVillageGame();
  for (const z of [-48, -40])
    s = command(s, {
      type: "plan-building",
      kind: "quarry",
      position: { x: 164, z },
      headingRadians: 0,
    });
  s = parseTimberSave(createTimberSave(s)).state;
  expect(s.town.orders.map((o) => o.sourceId)).toEqual([
    "stone-east",
    "stone-east",
  ]);
  expect(() =>
    command(s, {
      type: "plan-building",
      kind: "quarry",
      position: { x: 164, z: -32 },
      headingRadians: 0,
    }),
  ).toThrow(/두 곳/);
  expect(() =>
    command(s, { type: "build-logging", siteId: "stone-east" }),
  ).toThrow();
});
it("주민을 지정해 병원으로 보내거나 빼고 저장 후에도 지정을 유지한다", () => {
  let s = command(createVillageGame(), {
    type: "plan-building",
    kind: "hospital",
    position: { x: 12, z: 12 },
    headingRadians: 0,
  });
  s = advanceTimber(s, 120);
  const f = s.town.facilities[0];
  const r = s.residents.find(
    (r, i) =>
      !r.workplaceId &&
      !r.task &&
      !r.nextWork &&
      s.world.citizens[i]?.age !== "child",
  );
  if (!f || !r) throw Error("근무지와 주민이 필요합니다.");
  s = command(s, { type: "direct-staff", resident: r.id, destination: f.id });
  s = parseTimberSave(createTimberSave(advanceTimber(s, 1))).state;
  expect(s.residents.find((q) => q.id === r.id)?.workplaceId).toBe(
    "facility:" + f.id,
  );
  s = command(s, { type: "direct-staff", resident: r.id, destination: null });
  expect(s.residents.find((q) => q.id === r.id)?.workplaceId).toBeNull();
});

it("관아의 아동 노동령을 유휴 명부와 병원 직접 배치에 함께 적용한다", () => {
  let s = command(createVillageGame(), {
    type: "plan-building",
    kind: "hospital",
    position: { x: 12, z: 12 },
    headingRadians: 0,
  });
  s = advanceTimber(s, 120);
  const hospital = s.town.facilities.find((f) => f.kind === "hospital");
  const child = s.world.citizens.find(
    (c) =>
      c.age === "child" &&
      s.residents.some(
        (r) =>
          r.id === c.id &&
          !r.task &&
          !r.workplaceId &&
          r.health === "healthy" &&
          r.routine !== "eating",
      ),
  );
  if (!hospital || !child)
    throw Error("병원과 대기 중인 새끼 공룡이 필요합니다.");
  const assign = {
    type: "direct-staff" as const,
    resident: child.id,
    destination: hospital.id,
  };
  expect(idleTownResidents(s).some((r) => r.id === child.id)).toBe(false);
  expect(() => command(s, assign)).toThrow();
  s = parseTimberSave(
    createTimberSave(command(s, { type: "enact-child-labor" })),
  ).state;
  expect(idleTownResidents(s).some((r) => r.id === child.id)).toBe(true);
  s = command(s, assign);
  expect(s.residents.find((r) => r.id === child.id)?.workplaceId).toBe(
    "facility:" + hospital.id,
  );
  expect(idleTownResidents(s).some((r) => r.id === child.id)).toBe(false);
});
