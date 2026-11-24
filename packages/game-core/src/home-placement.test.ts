import { expect, it } from "vitest";
import { bokholElevation } from "./bokhol.js";
import {
  homeEntrance,
  homePlacementIssue,
  rectanglesOverlap,
} from "./home-placement.js";
import { createPlayState } from "./play.js";
import { residentPath } from "./resident-path.js";
import {
  advanceTimber,
  commandTimber,
  createTimberSave,
  createTimberState,
  parseTimberSave,
  parseTimberState,
  type TimberCommand,
  type TimberState,
  villageObstacles,
} from "./timber.js";

let sequence = 0;
const command = (s: TimberState, c: TimberCommand) =>
  commandTimber(s, c, `home-${++sequence}`);
const pose = {
  position: { x: 12, z: 12 },
  headingRadians: Math.PI + Math.PI / 12,
};
const idle = () => advanceTimber(createTimberState(), 120);
it("평탄한 임의 부지에 회전 배치하고 가까운 유휴 주민이 목재50을 나눠 운반한 뒤 완공한다", () => {
  let s = idle();
  expect(homePlacementIssue(s, pose)).toBeNull();
  const before = s.world.resources.RES_WOOD;
  s = command(s, { type: "build-home", ...pose });
  expect(s.world.resources.RES_WOOD).toBe(before - 500000);
  const crew = s.construction?.crew;
  expect(crew).toHaveLength(3);
  expect(crew?.reduce((n, w) => n + w.amount, 0)).toBe(50);
  expect(s.construction?.finishAt).toBeNull();
  let carrying = false;
  for (let i = 0; i < 80 && s.construction; i++) {
    s = advanceTimber(s, 1);
    carrying ||=
      s.construction?.crew?.some((w) => w.phase === "deliver") ?? false;
    if (s.construction?.finishAt !== null && s.construction)
      expect(s.construction.crew?.every((w) => w.phase === "build")).toBe(true);
    expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
  }
  expect(carrying).toBe(true);
  expect(s.construction).toBeNull();
  expect(s.homes).toHaveLength(7);
  const home = s.homes.at(-1);
  expect(home?.position).toEqual(pose.position);
  expect(home?.headingRadians).toBe(pose.headingRadians);
  expect(s.world.buildings.at(-1)?.headingRadians).toBe(pose.headingRadians);
  expect(s.residents.every((r) => r.task !== "home-construction")).toBe(true);
});
it("기존 주민의 고정 잠자리는 유지하고 빈 둥지에 합류 주민을 자동 입주시킨다", () => {
  let s = idle();
  const beds = new Map(s.residents.map((r) => [r.id, [r.homeId, r.homeSlot]]));
  s = command(s, { type: "build-home", ...pose });
  s = advanceTimber(s, 80);
  const id = s.homes.at(-1)?.id;
  expect(s.residents.some((r) => r.homeId === id)).toBe(false);
  s = command(s, {
    type: "citizen-event",
    event: {
      type: "arrival",
      id: "future-residents",
      groups: [{ species: "SPINO", count: 20 }],
    },
  });
  expect(s.residents.filter((r) => r.homeId === id)).toHaveLength(10);
  for (const r of s.residents)
    if (beds.has(r.id)) expect([r.homeId, r.homeSlot]).toEqual(beds.get(r.id));
  const h = s.homes.at(-1);
  if (!h) throw Error("둥지 없음");
  for (const r of s.residents.filter((r) => r.homeId === id))
    expect(r.home).toEqual(
      homeEntrance({
        position: h.position,
        headingRadians: h.headingRadians ?? 0,
      }),
    );
  const saved = parseTimberSave(createTimberSave(s)).state;
  expect(saved).toEqual(s);
});
it("건물 겹침·숲·광맥·지도 밖·자원 부족을 거부하고 재고를 차감하지 않는다", () => {
  const s = idle();
  for (const position of [
    { x: 0, z: -1 },
    { x: -40, z: -8 },
    { x: -150, z: -40 },
    { x: 251, z: 250 },
  ]) {
    expect(homePlacementIssue(s, { ...pose, position })).not.toBeNull();
    expect(() =>
      command(s, { type: "build-home", ...pose, position }),
    ).toThrow();
    expect(s.world.resources.RES_WOOD).toBe(1200000);
  }
  expect(
    homePlacementIssue(s, { ...pose, position: { x: 50, z: 20 } }),
  ).toBeNull();
  const world = createPlayState();
  const poor = advanceTimber(
    createTimberState({
      ...world,
      resources: { ...world.resources, RES_WOOD: 10000 },
    }),
    30,
  );
  expect(() => command(poor, { type: "build-home", ...pose })).toThrow(/목재/);
});
it("각도가 다른 건물의 모서리를 검사하고 회전한 집의 입구까지 집을 관통하지 않는다", () => {
  const rotated = {
    position: { x: 0, z: 0 },
    headingRadians: Math.PI / 4,
    halfWidth: 1.65,
    halfDepth: 1.5,
  };
  expect(
    rectanglesOverlap(rotated, {
      ...rotated,
      position: { x: 3, z: 0 },
      headingRadians: 0,
    }),
  ).toBe(true);
  expect(
    rectanglesOverlap(rotated, {
      ...rotated,
      position: { x: 5, z: 0 },
      headingRadians: 0,
    }),
  ).toBe(false);
  const entrance = homeEntrance(rotated);
  expect(
    residentPath({ x: 0, z: -5 }, entrance, [
      { x: 0, z: 0, headingRadians: Math.PI / 4 },
    ]).length,
  ).toBeGreaterThan(1);
});
it("자재 운반 중 질병으로 교대해도 목재를 재차 지불하지 않는다", () => {
  let s = command(idle(), { type: "build-home", ...pose });
  for (
    let i = 0;
    i < 30 && !s.construction?.crew?.some((w) => w.phase === "deliver");
    i++
  )
    s = advanceTimber(s, 1);
  const id = s.construction?.crew?.find((w) => w.phase === "deliver")?.id;
  if (!id) throw Error("운반 없음");
  s = command(s, {
    type: "citizen-event",
    event: { type: "illness", id: "builder-ill", citizenIds: [id] },
  });
  s = advanceTimber(s, 80);
  expect(s.homes).toHaveLength(7);
  expect(s.world.resources.RES_WOOD).toBe(700000);
});
it("공사 중 저장 재개가 동일하며 중복 잠자리·위조된 자재 합계는 거부한다", () => {
  let s = command(idle(), { type: "build-home", ...pose });
  s = advanceTimber(s, 5);
  expect(advanceTimber(parseTimberSave(createTimberSave(s)).state, 80)).toEqual(
    advanceTimber(s, 80),
  );
  if (!s.construction?.crew) throw Error("공사 없음");
  expect(() =>
    parseTimberState({
      ...s,
      construction: {
        ...s.construction,
        crew: s.construction?.crew?.map((w, i) =>
          i === 0 ? { ...w, amount: w.amount + 1 } : w,
        ),
      },
    }),
  ).toThrow(/자재/);
  const housed = idle(),
    first = housed.residents[0],
    other = housed.residents.find(
      (r) => r.homeId === first?.homeId && r.id !== first?.id,
    );
  if (!first || !other) throw Error("입주 없음");
  expect(() =>
    parseTimberState({
      ...housed,
      residents: housed.residents.map((r) =>
        r.id === other.id ? { ...r, homeSlot: first.homeSlot } : r,
      ),
    }),
  ).toThrow(/잠자리/);
});
it("높이가 있는 평탄한 땅도 주거 구역 제한 없이 허용한다", () => {
  const s = idle();
  let found = false;
  for (let x = 80; x <= 220 && !found; x += 4)
    for (let z = -220; z <= 220 && !found; z += 4) {
      if (bokholElevation(x, z) < 1) continue;
      if (
        homePlacementIssue(s, { position: { x, z }, headingRadians: 0 }) ===
        null
      )
        found = true;
    }
  expect(found).toBe(true);
  expect(
    villageObstacles(s).filter((p) => p.x === 4.5 && p.z === 2.8),
  ).toHaveLength(1);
});
it("v12 저장의 입주를 유지해 잠자리를 부여하고 손상된 귀가 기록은 거부한다", () => {
  const current = idle();
  const old = {
    ...current,
    version: 12,
    homes: current.homes.map(({ headingRadians: _heading, ...h }) => h),
    residents: current.residents.map(({ homeSlot: _slot, ...r }) => r),
  };
  const upgraded = parseTimberState(old);
  expect(upgraded.version).toBe(19);
  for (const r of upgraded.residents) {
    expect(r.homeId).toBe(current.residents.find((q) => q.id === r.id)?.homeId);
    expect(r.homeSlot).not.toBeNull();
  }
  expect(() =>
    parseTimberState({
      ...old,
      residents: old.residents.map((r, i) =>
        i === 0 ? { ...r, home: { x: 200, z: 200 } } : r,
      ),
    }),
  ).toThrow();
});
it("현장 작업자가 모두 아프면 교대 인력이 실제로 도착하기 전에는 완공하지 않는다", () => {
  let s = command(idle(), { type: "build-home", ...pose });
  for (let i = 0; i < 50 && s.construction?.finishAt === null; i++)
    s = advanceTimber(s, 1);
  const ids = s.construction?.crew?.flatMap((w) => (w.id ? [w.id] : [])) ?? [];
  expect(ids).toHaveLength(3);
  s = command(s, {
    type: "citizen-event",
    event: { type: "illness", id: "all-builders-ill", citizenIds: ids },
  });
  s = advanceTimber(s, 1);
  expect(s.homes).toHaveLength(6);
  expect(s.construction?.finishAt).toBeNull();
  s = advanceTimber(s, 70);
  expect(s.homes).toHaveLength(7);
});
