import { expect, it } from "vitest";
import { BOKHOL_FORESTS, bokholElevation, type ForestId } from "./bokhol.js";
import {
  loggingHaulTask,
  loggingSite,
  loggingSiteRules,
  loggingSites,
  loggingStaff,
  loggingWorkId,
  setLoggingSite,
} from "./logging.js";
import { createPlayState } from "./play.js";
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
function fundedTown() {
  const world = createPlayState();
  return createTimberState({
    ...world,
    resources: { ...world.resources, RES_WOOD: 4500000 },
  });
}
const command = (s: TimberState, c: TimberCommand) =>
  commandTimber(s, c, `forest-${++sequence}`);
function build(s: TimberState, id: ForestId) {
  if (s.world.minute < 540) s = advanceTimber(s, 540 - s.world.minute);
  else if (s.world.minute >= 900)
    s = advanceTimber(s, 1440 - s.world.minute + 540);
  s = command(s, { type: "build-logging", siteId: id });
  s = advanceTimber(s, 160);
  expect(loggingSite(s, id).built).toBe(true);
  s = command(s, { type: "build-storage", siteId: id });
  s = advanceTimber(s, 160);
  expect(loggingSite(s, id).storageBuilt).toBe(true);
  return s;
}
it("중앙·외곽·구석 숲9곳의 자원을 따로 보존하고 각 권역은 반경 안에 제재소를 둔다", () => {
  const s = createTimberState();
  expect(loggingSites(s)).toHaveLength(13);
  expect(new Set(loggingSites(s).map((l) => l.siteId)).size).toBe(13);
  for (const f of BOKHOL_FORESTS) {
    expect(loggingSite(s, f.id).remaining).toBe(120);
    expect(
      Math.hypot(
        loggingSiteRules(f.id).workshop.x - f.x,
        loggingSiteRules(f.id).workshop.z - f.z,
      ),
    ).toBeLessThan(26);
  }
  expect(
    BOKHOL_FORESTS.some((f) => Math.abs(f.x) > 80 && Math.abs(f.z) > 70),
  ).toBe(true);
  expect(
    BOKHOL_FORESTS.some((f) => Math.abs(f.x) < 40 && Math.abs(f.z) < 40),
  ).toBe(true);
});
it("제재소 두 곳이 주민을 중복 고용하지 않고 자기 숲만 줄이며 공동 재고에 각각 입고한다", () => {
  let s = build(fundedTown(), "west");
  s = build(s, "central");
  s = command(s, { type: "set-logging-workers", siteId: "west", count: 2 });
  s = command(s, { type: "set-logging-workers", siteId: "central", count: 2 });
  s = advanceTimber(s, 1440);
  for (const id of ["west", "central"] as const) {
    expect(loggingSite(s, id).delivered).toBeGreaterThan(0);
    expect(loggingStaff(s, id).assigned).toBe(2);
  }
  expect(loggingSite(s, "east").remaining).toBe(120);
  expect(
    s.residents
      .filter((r) => r.workplaceId === loggingWorkId("west"))
      .every((r) => r.workplaceId !== loggingWorkId("central")),
  ).toBe(true);
  const delivered = loggingSites(s).reduce((sum, l) => sum + l.delivered, 0);
  expect(s.world.resources.RES_WOOD).toBe((450 - 200 + delivered) * 10000);
  expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
});
it("한 숲이 고갈되어도 다른 숲과 지형은 남고 다음 권역에 별도 시설을 건설한다", () => {
  let s = command(build(fundedTown(), "west"), {
    type: "set-logging-workers",
    count: 4,
  });
  for (let i = 0; i < 3; i++) s = advanceTimber(s, 1440);
  expect(s.logging.remaining).toBe(0);
  expect(loggingSite(s, "central").remaining).toBe(120);
  const amounts = Object.fromEntries(
    loggingSites(s).map((l) => [l.siteId, l.remaining]),
  );
  expect(bokholElevation(-40, -8, amounts)).toBe(0);
  expect(bokholElevation(70, -12, amounts)).toBe(bokholElevation(70, -12));
  s = build(s, "central");
  expect(s.logging.built).toBe(true);
  expect(loggingSite(s, "central").built).toBe(true);
});
it("외곽 운반·두 곳 동시 진행도 저장 재개 결과가 같으며 잘못된 권역·중복 운반자를 거부한다", () => {
  let s = build(fundedTown(), "southeast");
  s = command(s, {
    type: "set-logging-workers",
    siteId: "southeast",
    count: 2,
  });
  s = advanceTimber(s, 1440);
  expect(loggingSite(s, "southeast").delivered).toBeGreaterThan(0);
  expect(advanceTimber(parseTimberSave(createTimberSave(s)).state, 30)).toEqual(
    advanceTimber(s, 30),
  );
  expect(() =>
    parseTimberState({ ...s, loggingSites: s.loggingSites.slice(1) }),
  ).toThrow();
  expect(() =>
    parseTimberState({
      ...s,
      loggingSites: s.loggingSites.map((l, i) =>
        i === 0 ? { ...l, siteId: "west" } : l,
      ),
    }),
  ).toThrow();
  expect(() =>
    command(s, { type: "build-logging", siteId: "ghost" as ForestId }),
  ).toThrow();
});
it("v10 저장은 기존 서쪽 숲·재고·진행을 유지하고 새 권역만 초기화한다", () => {
  const current = createTimberState();
  const {
    loggingSites: _sites,
    mineralSites: _minerals,
    initialMinerals: _initial,
    ...base
  } = current;
  const { siteId: _id, remaining, ...legacyRest } = base.logging;
  const legacyLogging = { ...legacyRest, forest: remaining };
  const legacy = { ...base, version: 10, logging: legacyLogging };
  const loaded = parseTimberState(legacy);
  expect(loaded.version).toBe(19);
  expect(loaded.world).toEqual(current.world);
  expect(loaded.logging).toEqual(current.logging);
  expect(loaded.loggingSites).toHaveLength(12);
  expect(() =>
    parseTimberState({ ...legacy, logging: { ...legacyLogging, forest: -1 } }),
  ).toThrow();
});
it("두 권역에 같은 운반자를 중복 기록한 저장을 거부한다", () => {
  let s = createTimberState();
  const id = s.residents[0]?.id;
  if (!id) throw Error("주민 없음");
  for (const siteId of ["west", "central"] as const) {
    const l = loggingSite(s, siteId);
    s = setLoggingSite(s, {
      ...l,
      built: true,
      storageBuilt: true,
      remaining: 119,
      haul: {
        workerId: id,
        phase: "pickup",
        cart: loggingSiteRules(siteId).pickup,
        cargo: 1,
        wait: 0,
        relief: false,
      },
    });
  }
  s = {
    ...s,
    residents: s.residents.map((r) =>
      r.id === id ? { ...r, task: loggingHaulTask("west") } : r,
    ),
  };
  expect(() => parseTimberState(s)).toThrow();
});
