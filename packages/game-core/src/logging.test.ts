import { expect, it } from "vitest";
import {
  LOGGING_RULES,
  loggingSiteRules,
  loggingStaff,
  loggingWorkplace,
} from "./logging.js";
import { AMOUNT_SCALE, createPlayState } from "./play.js";
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

let serial = 0;
function fundedTown() {
  const world = createPlayState();
  return createTimberState({
    ...world,
    resources: { ...world.resources, RES_WOOD: 4500000 },
  });
}
const command = (s: TimberState, c: TimberCommand) =>
  commandTimber(s, c, `logging-${++serial}`);
function build(storage = true) {
  let s = command(advanceTimber(fundedTown(), 120), {
    type: "build-logging",
  });
  s = advanceTimber(s, 50);
  expect(s.logging.built).toBe(true);
  if (storage) {
    s = command(s, { type: "build-storage" });
    s = advanceTimber(s, 50);
    expect(s.logging.storageBuilt).toBe(true);
  }
  return s;
}
it("인원수로 배치하고 실제 출근 뒤에만 생산하며 생산 즉시 공동 목재를 늘린다", () => {
  let s = build();
  s = command(s, { type: "set-logging-workers", count: 2 });
  expect(loggingStaff(s).assigned).toBe(2);
  expect(loggingStaff(s).working).toBe(0);
  const initial = s.world.resources.RES_WOOD;
  s = advanceTimber(s, 1);
  expect(s.logging.remaining).toBe(120);
  for (let i = 0; i < 80 && s.logging.delivered === 0; i++) {
    s = advanceTimber(s, 1);
    expect(s.logging.haul).toBeNull();
    expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
  }
  expect(s.logging.delivered).toBeGreaterThan(0);
  expect(s.world.resources.RES_WOOD).toBe(
    initial + s.logging.delivered * AMOUNT_SCALE,
  );
  expect(s.logging.buffer).toBe(0);
});
it("저장소가 없어도 공동 재고로 입고하고 숲의 잔량을 보존한다", () => {
  let s = command(build(false), { type: "set-logging-workers", count: 4 });
  const wood = s.world.resources.RES_WOOD;
  s = advanceTimber(s, 200);
  expect(s.logging.delivered).toBeGreaterThan(20);
  expect(s.logging.remaining + s.logging.delivered).toBe(120);
  expect(s.world.resources.RES_WOOD).toBe(
    wood + s.logging.delivered * AMOUNT_SCALE,
  );
  expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
});
it("퇴근·0명 배치에는 생산하지 않고 빈 수레 정리를 마치면 운반 주민이 귀가한다", () => {
  let s = build();
  s = command(s, { type: "set-logging-workers", count: 2 });
  s = advanceTimber(s, 80);
  s = command(s, { type: "set-logging-workers", count: 0 });
  s = advanceTimber(s, 300);
  expect(s.logging.haul).toBeNull();
  expect(s.logging.buffer).toBe(0);
  expect(s.residents.some((r) => r.task === "logging-haul")).toBe(false);
  const forest = s.logging.remaining;
  s = advanceTimber(s, 30);
  expect(s.logging.remaining).toBe(forest);
  s = command(s, { type: "set-logging-workers", count: 1 });
  s = advanceTimber(s, 18 * 60 - s.world.minute);
  const night = s.logging.remaining;
  s = advanceTimber(s, 100);
  expect(s.logging.remaining).toBe(night);
  expect(loggingStaff(s).working).toBe(0);
});
function legacyHaul(s: TimberState): TimberState {
  return {
    ...s,
    logging: {
      ...s.logging,
      remaining: 115,
      buffer: 2,
      haul: {
        workerId: null,
        cargo: 3,
        wait: 0,
        relief: true,
        phase: "pickup",
        cart: loggingSiteRules().pickup,
      },
    },
  };
}
it("이전 저장의 현장 적재와 수레 화물은 한 번만 입고한다", () => {
  const old = legacyHaul(build());
  const migrated = advanceTimber(
    parseTimberSave(createTimberSave(old)).state,
    1,
  );
  expect(migrated.logging).toMatchObject({
    delivered: 5,
    remaining: 115,
    buffer: 0,
    haul: null,
  });
  expect(migrated.world.resources.RES_WOOD - old.world.resources.RES_WOOD).toBe(
    5 * AMOUNT_SCALE,
  );
  expect(
    advanceTimber(parseTimberSave(createTimberSave(migrated)).state, 1).logging,
  ).toEqual(migrated.logging);
});
it("자원 증식·유령 인력·임의 좌표·건설 완료 위조 저장을 거부한다", () => {
  const building = command(advanceTimber(fundedTown(), 120), {
    type: "build-logging",
  });
  expect(() =>
    parseTimberState({
      ...building,
      logging: { ...building.logging, built: true },
    }),
  ).toThrow();
  const s = build();
  expect(() =>
    parseTimberState({ ...s, logging: { ...s.logging, delivered: 1 } }),
  ).toThrow();
  expect(() =>
    parseTimberState({ ...s, logging: { ...s.logging, target: 5 } }),
  ).toThrow();
  const active = command(s, { type: "set-logging-workers", count: 1 });
  expect(
    loggingWorkplace(
      active,
      active.residents.find((r) => r.workplaceId === "logging")?.id ?? "",
    ).x,
  ).toBeLessThan(LOGGING_RULES.pickup.x);
  let hauling = legacyHaul(active);
  if (!hauling.logging.haul) throw Error("운반 없음");
  expect(() =>
    parseTimberState({
      ...hauling,
      logging: {
        ...hauling.logging,
        haul: { ...hauling.logging.haul, workerId: "ghost" },
      },
    }),
  ).toThrow();
  hauling = {
    ...hauling,
    logging: {
      ...hauling.logging,
      haul: { ...hauling.logging.haul, cart: { x: 47, z: 47 } },
    },
  };
  expect(() => parseTimberState(hauling)).toThrow();
});
it("숲120을 다 쓰면 생산이 멈추며 운반과 재고를 합해120이 보존된다", () => {
  let s = command(build(), { type: "set-logging-workers", count: 4 });
  for (let i = 0; i < 3; i++) s = advanceTimber(s, 1440);
  expect(s.logging.remaining).toBe(0);
  expect(s.logging.buffer).toBe(0);
  expect(s.logging.delivered).toBe(120);
  expect(s.logging.haul).toBeNull();
  const wood = s.world.resources.RES_WOOD;
  s = advanceTimber(s, 100);
  expect(s.world.resources.RES_WOOD).toBe(wood);
});
