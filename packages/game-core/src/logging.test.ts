import { expect, it } from "vitest";
import { LOGGING_RULES, loggingStaff, loggingWorkplace } from "./logging.js";
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
it("인원수로 배치하고 실제 출근 뒤에만 생산하며 저장소 하역 전에는 공동 목재를 늘리지 않는다", () => {
  let s = build();
  s = command(s, { type: "set-logging-workers", count: 2 });
  expect(loggingStaff(s).assigned).toBe(2);
  expect(loggingStaff(s).working).toBe(0);
  const initial = s.world.resources.RES_WOOD;
  s = advanceTimber(s, 1);
  expect(s.logging.remaining).toBe(120);
  let observed = false;
  for (let i = 0; i < 80 && s.logging.delivered === 0; i++) {
    s = advanceTimber(s, 1);
    if (s.logging.haul?.cargo) {
      observed = true;
      expect(s.world.resources.RES_WOOD).toBe(initial);
    }
    expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
  }
  expect(observed).toBe(true);
  expect(s.logging.delivered).toBeGreaterThan(0);
  expect(s.world.resources.RES_WOOD).toBe(
    initial + s.logging.delivered * AMOUNT_SCALE,
  );
  expect(s.logging.haul?.cargo).toBe(0);
  expect(s.logging.haul?.phase).toBe("turn");
});
it("저장소가 없으면 현장 적재20에서 멈추고 숲과 공동 재고가 보존된다", () => {
  let s = build(false);
  s = command(s, { type: "set-logging-workers", count: 4 });
  s = advanceTimber(s, 200);
  expect(s.logging.buffer).toBe(20);
  expect(s.logging.remaining).toBe(100);
  expect(s.logging.haul).toBeNull();
  expect(s.logging.delivered).toBe(0);
  const resources = s.world.resources;
  s = advanceTimber(s, 30);
  expect(s.logging.remaining).toBe(100);
  expect(s.world.resources).toEqual(resources);
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
it("운반 중 저장을 이어도 중복 입고가 없고 질병 때는 유휴 주민이 교대한다", () => {
  let s = command(build(), { type: "set-logging-workers", count: 2 });
  for (let i = 0; i < 100 && s.logging.haul?.phase !== "outbound"; i++)
    s = advanceTimber(s, 1);
  const previous = s.logging.haul?.workerId;
  if (!previous) throw Error("운반 인력 없음");
  const restored = parseTimberSave(createTimberSave(s)).state;
  expect(advanceTimber(restored, 80)).toEqual(advanceTimber(s, 80));
  s = command(s, {
    type: "citizen-event",
    event: { id: "sick-carrier", type: "illness", citizenIds: [previous] },
  });
  s = advanceTimber(s, 1);
  expect(s.logging.haul?.workerId).not.toBe(previous);
  expect(s.logging.haul?.relief).toBe(true);
  s = advanceTimber(s, 100);
  expect(s.logging.delivered).toBeGreaterThan(0);
});
it("일시정지 중 운반 인력의 질병·즉시 회복도 저장 가능한 인계 상태로 남는다", () => {
  let s = command(build(), { type: "set-logging-workers", count: 1 });
  for (let i = 0; i < 100 && s.logging.haul?.phase !== "outbound"; i++)
    s = advanceTimber(s, 1);
  const id = s.logging.haul?.workerId;
  if (!id) throw Error("운반 없음");
  s = command(s, {
    type: "citizen-event",
    event: { id: "ill", type: "illness", citizenIds: [id] },
  });
  expect(s.logging.haul?.workerId).toBeNull();
  s = command(s, {
    type: "citizen-event",
    event: { id: "recover", type: "recovery", citizenIds: [id] },
  });
  expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
  expect(advanceTimber(s, 60).logging.delivered).toBeGreaterThan(0);
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
  let hauling = advanceTimber(active, 40);
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
it("교대할 인력이 없으면 짐을 보존하고 회복한 주민이 인계받는다", () => {
  let s = command(build(), { type: "set-logging-workers", count: 1 });
  for (let i = 0; i < 100 && s.logging.haul?.phase !== "outbound"; i++)
    s = advanceTimber(s, 1);
  const cargo = s.logging.haul?.cargo;
  s = command(s, {
    type: "citizen-event",
    event: {
      id: "all-sick",
      type: "illness",
      citizenIds: s.residents.map((r) => r.id),
    },
  });
  s = advanceTimber(s, 10);
  expect(s.logging.haul?.workerId).toBeNull();
  expect(s.logging.haul?.cargo).toBe(cargo);
  s = command(s, { type: "set-logging-workers", count: 0 });
  const id = s.residents[10]?.id;
  if (!id) throw Error("주민 없음");
  s = command(s, {
    type: "citizen-event",
    event: { id: "one-recovers", type: "recovery", citizenIds: [id] },
  });
  s = advanceTimber(s, 60);
  expect(s.logging.delivered).toBeGreaterThan(0);
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
