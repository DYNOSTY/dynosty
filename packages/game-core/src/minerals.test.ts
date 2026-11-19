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

let sequence = 0;
const command = (s: TimberState, c: TimberCommand) =>
  commandTimber(s, c, `mine-${++sequence}`);
function build(id: ProductionSiteId) {
  let s = command(advanceTimber(createTimberState(), 120), {
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
it("넓은 지도에 거주지 둘레 숲과 석탄광·철광산·채석장 각2곳을 둔다", () => {
  expect(BOKHOL_MAP.size).toBe(512);
  expect(BOKHOL_FORESTS).toHaveLength(13);
  for (const kind of ["coal", "iron", "stone"])
    expect(BOKHOL_MINERALS.filter((m) => m.kind === kind)).toHaveLength(2);
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
  expect(loaded.mineralSites).toHaveLength(6);
  expect(loaded.world.resources.RES_IRON_ORE).toBe(0);
  expect(loaded.world.resources.RES_STONE).toBe(0);
  expect(loaded.world.resources.RES_COAL).toBe(
    current.world.resources.RES_COAL,
  );
  expect(() =>
    parseTimberState({ ...old, loggingSites: old.loggingSites.slice(1) }),
  ).toThrow();
});
