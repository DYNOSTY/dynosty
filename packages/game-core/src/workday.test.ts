import { expect, it } from "vitest";
import { loggingStaff } from "./logging.js";
import { createPlayState } from "./play.js";
import { workplaceOpen } from "./resident-routine.js";
import {
  advanceTimber,
  commandTimber,
  createTimberSave,
  createTimberState,
  parseTimberSave,
  type TimberCommand,
  type TimberState,
  tickTimber,
  timberScene,
} from "./timber.js";

let id = 0;
const cmd = (s: TimberState, c: TimberCommand) =>
  commandTimber(s, c, `day-${++id}`);
const start = (minute: number) =>
  createTimberState({ ...createPlayState(), minute });
it("1배의 09~18시는 실제9분이며 경계에서 작업을 쉰다", () => {
  let s = cmd(start(540), { type: "pause", paused: false });
  for (let i = 0; i < 540; i++) s = tickTimber(s, 1000);
  expect(s.world.minute).toBe(1080);
  expect(s.elapsed).toBe(540);
  expect(workplaceOpen(539)).toBe(false);
  expect(workplaceOpen(540)).toBe(true);
  expect(workplaceOpen(1080)).toBe(false);
});
it("주거지 주변 둥지는 자재 운반을 포함해 30~60초 안에 완공한다", () => {
  let s = cmd(advanceTimber(start(540), 30), {
    type: "build-home",
    position: { x: 12, z: 12 },
    headingRadians: Math.PI,
  });
  let time = 0;
  while (s.construction && time < 60) {
    s = advanceTimber(s, 1);
    time++;
  }
  expect(s.construction).toBeNull();
  expect(time).toBeGreaterThanOrEqual(30);
  expect(time).toBeLessThanOrEqual(60);
});
it("퇴근 시 공사를 보존하고 귀가해 불을 켜며 다음날 재출근 후 이어 짓는다", () => {
  let s = cmd(start(17 * 60 + 35), {
    type: "build-home",
    position: { x: 12, z: 12 },
    headingRadians: Math.PI,
  });
  s = advanceTimber(s, 25);
  expect(s.world.minute).toBe(1080);
  expect(s.construction?.finishAt).not.toBeNull();
  const remaining = (s.construction?.finishAt ?? 0) - s.elapsed;
  const wood = s.world.resources.RES_WOOD;
  s = advanceTimber(s, 60);
  expect(s.construction).not.toBeNull();
  expect((s.construction?.finishAt ?? 0) - s.elapsed).toBe(remaining);
  for (const w of s.construction?.crew ?? [])
    expect(s.residents.find((r) => r.id === w.id)?.insideHome).toBe(true);
  expect(
    timberScene(s).entities.some((e) => e.kind === "building" && e.lit),
  ).toBe(true);
  expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
  s = advanceTimber(s, 14 * 60);
  expect(s.world.minute).toBe(540);
  expect(
    timberScene(s)
      .entities.filter((e) => e.kind === "building")
      .every((e) => !e.lit),
  ).toBe(true);
  s = advanceTimber(s, 60);
  expect(s.construction).toBeNull();
  expect(s.world.resources.RES_WOOD).toBe(wood);
});
it("식당과 작업장에 도착하면 숨고 퇴근 뒤 다시 나와 귀가한다", () => {
  const world = createPlayState();
  let s = cmd(
    createTimberState({
      ...world,
      minute: 540,
      resources: { ...world.resources, RES_WOOD: 3000000 },
    }),
    { type: "build-restaurant" },
  );
  s = advanceTimber(s, 60);
  s = cmd(s, { type: "set-restaurant-workers", count: 2 });
  s = cmd(s, { type: "build-logging" });
  s = advanceTimber(s, 120);
  s = cmd(s, { type: "set-logging-workers", count: 2 });
  s = advanceTimber(s, 60);
  expect(loggingStaff(s).working).toBe(2);
  const workers = s.residents.filter(
    (r) => r.workplaceId !== null && r.routine === "working",
  );
  expect(workers.length).toBeGreaterThanOrEqual(3);
  for (const r of workers) {
    const e = timberScene(s).entities.find((e) => e.id === r.id);
    expect(e?.visible).toBe(false);
    expect(e?.kind === "resident" && e.indoors).toBe(true);
  }
  s = {
    ...s,
    residents: s.residents.map((r) =>
      r.workplaceId === null ? { ...r, hunger: 720 } : r,
    ),
  };
  let ate = false;
  for (let i = 0; i < 120; i++) {
    s = advanceTimber(s, 1);
    ate ||= timberScene(s).entities.some(
      (e) =>
        e.kind === "resident" &&
        e.indoors &&
        s.residents.find((r) => r.id === e.id)?.routine === "eating",
    );
  }
  expect(ate).toBe(true);
  s = advanceTimber(s, 22 * 60 - s.world.minute);
  s = advanceTimber(s, 1);
  expect(
    s.residents.some(
      (r) =>
        r.workplaceId === "restaurant" &&
        (r.routine === "home" || r.insideHome),
    ),
  ).toBe(true);
});
it("아침6시에 둥지의 불이 꺼지고 미배치 주민도 문에서 나와 생활한다", () => {
  let s = advanceTimber(start(5 * 60), 30);
  expect(s.residents.every((r) => r.insideHome)).toBe(true);
  expect(
    timberScene(s).entities.some((e) => e.kind === "building" && e.lit),
  ).toBe(true);
  s = advanceTimber(s, 31);
  expect(s.residents.some((r) => !r.insideHome)).toBe(true);
  expect(
    timberScene(s)
      .entities.filter((e) => e.kind === "building")
      .every((e) => !e.lit),
  ).toBe(true);
});

it("식당 공사도 퇴근하면 멈추고 다음날 현장으로 돌아와 남은 공사를 잇는다", () => {
  let s = cmd(start(17 * 60 + 45), { type: "build-restaurant" });
  s = advanceTimber(s, 15);
  const remain = (s.construction?.finishAt ?? 0) - s.elapsed;
  expect(remain).toBeGreaterThan(0);
  s = advanceTimber(s, 60);
  const worker = s.residents.find((r) => r.id === s.construction?.workerId);
  expect(worker?.insideHome).toBe(true);
  expect((s.construction?.finishAt ?? 0) - s.elapsed).toBe(remain);
  s = advanceTimber(s, 14 * 60);
  expect(s.restaurantBuilt).toBe(false);
  s = advanceTimber(s, 60);
  expect(s.restaurantBuilt).toBe(true);
  expect(s.world.resources.RES_WOOD).toBe(700000);
});
