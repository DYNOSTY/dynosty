import { expect, it } from "vitest";
import { laborIron, laborReservedIron, laborStock } from "./exchange.js";
import legacySave from "./fixtures/labor-v1-save.json" with { type: "json" };
import {
  commandLabor,
  countCrew,
  createLaborSave,
  createLaborState,
  type LaborCommand,
  type LaborState,
  laborFinished,
  parseLaborSave,
  parseLaborState,
} from "./labor.js";

function fixture() {
  let s = createLaborState(),
    id = 0;
  const step = (c: LaborCommand) => {
    s = commandLabor(s, c, `ex-${++id}`);
    return s;
  };
  for (const c of [
    { type: "choose", offer: "A" },
    { type: "contract" },
    { type: "depart" },
  ] as const)
    step({ type: "timber", command: c });
  step({ type: "next" });
  step({ type: "timber", command: { type: "inspect" } });
  step({ type: "next" });
  step({ type: "timber", command: { type: "receive" } });
  return {
    step,
    get s() {
      return s;
    },
  };
}
function reserve() {
  const f = fixture();
  f.step({ type: "exchange-request" });
  return f;
}
function depart() {
  const f = reserve();
  f.step({ type: "exchange-depart" });
  return f;
}
function checked() {
  const f = depart();
  f.step({ type: "next" });
  f.step({ type: "next" });
  f.step({ type: "exchange-inspect" });
  f.step({ type: "next" });
  return f;
}
function total(s: LaborState) {
  return Object.values(laborStock(s)).reduce((a, b) => a + b, 0);
}
it("교환 요청·출발 전 취소는 철재와 담당 예약만 해제한다", () => {
  const f = reserve();
  expect(laborIron(f.s)).toBe(4);
  expect(laborReservedIron(f.s)).toBe(1);
  expect(countCrew(f.s, "exchange")).toBe(1);
  expect(laborStock(f.s).quarantine).toBe(4);
  f.step({ type: "exchange-cancel" });
  expect(laborIron(f.s)).toBe(4);
  expect(laborReservedIron(f.s)).toBe(0);
  expect(countCrew(f.s, "idle")).toBe(4);
  f.step({ type: "exchange-request" });
  expect(laborReservedIron(f.s)).toBe(1);
  expect(total(f.s)).toBe(20);
});
it("회수·재납품·재검수·명시 수령에서4가 한 장소에만 존재한다", () => {
  const f = depart();
  expect(laborIron(f.s)).toBe(3);
  expect(laborReservedIron(f.s)).toBe(0);
  expect(laborStock(f.s)).toMatchObject({
    quarantine: 0,
    transit: 4,
    waiting: 0,
    checked: 0,
    available: 16,
  });
  f.step({ type: "next" });
  expect(f.s.exchange.phase).toBe("delivering");
  expect(f.s.elapsed).toBe(570);
  expect(total(f.s)).toBe(20);
  f.step({ type: "next" });
  expect(f.s.exchange.phase).toBe("arrived");
  expect(laborStock(f.s)).toMatchObject({
    transit: 0,
    waiting: 4,
    available: 16,
  });
  f.step({ type: "exchange-inspect" });
  f.step({ type: "next" });
  expect(laborStock(f.s)).toMatchObject({
    waiting: 0,
    checked: 4,
    available: 16,
  });
  expect(countCrew(f.s, "exchange")).toBe(0);
  f.step({ type: "exchange-receive" });
  expect(laborStock(f.s)).toMatchObject({
    checked: 0,
    available: 20,
    quarantine: 0,
  });
  expect(f.s.repairProgress).toBe(0);
  expect(total(f.s)).toBe(20);
});
it("교환 담당1명과 배급3명이 같은 시간을 사용해 배급10h·목재13h를 완료한다", () => {
  const f = depart();
  for (const worker of ["crew-2", "crew-3", "crew-4"] as const)
    f.step({ type: "assign", worker, job: "prep" });
  f.step({ type: "next" });
  expect(f.s.elapsed).toBe(570);
  expect(f.s.prepProgress).toBe(270);
  f.step({ type: "next" });
  expect(f.s.elapsed).toBe(600);
  expect(f.s.prepCompletedAt).toBe(600);
  expect(countCrew(f.s, "exchange")).toBe(1);
  f.step({ type: "next" });
  f.step({ type: "exchange-inspect" });
  f.step({ type: "next" });
  expect(f.s.elapsed).toBe(780);
  f.step({ type: "exchange-receive" });
  for (const type of ["allocate", "use"] as const)
    f.step({ type: "timber", command: { type } });
  expect(laborFinished(f.s)).toBe(true);
  expect(laborIron(f.s)).toBe(3);
  expect(f.s.timber.stock.used).toBe(20);
});
it("정상16을 먼저 배분해도 교환4만 추가되고 사용20을 초과하지 않는다", () => {
  const f = depart();
  f.step({ type: "timber", command: { type: "allocate" } });
  f.step({ type: "next" });
  f.step({ type: "next" });
  f.step({ type: "exchange-inspect" });
  f.step({ type: "next" });
  f.step({ type: "exchange-receive" });
  expect(laborStock(f.s)).toMatchObject({ allocated: 16, available: 4 });
  f.step({ type: "timber", command: { type: "allocate" } });
  f.step({ type: "timber", command: { type: "use" } });
  expect(total(f.s)).toBe(20);
  expect(laborStock(f.s).used).toBe(20);
});
it("출발/검사/수령의 같은ID 재전송은 멱등이고 다른ID 반복은 거부한다", () => {
  const f = reserve();
  for (const c of [{ type: "exchange-depart" }] as const) {
    const s = f.step(c),
      id = s.processed.at(-1);
    if (!id) throw new Error("ID 없음");
    expect(commandLabor(s, c, id)).toEqual(s);
    expect(() => f.step(c)).toThrow();
  }
  const g = checked();
  const s = g.step({ type: "exchange-receive" }),
    id = s.processed.at(-1);
  if (!id) throw new Error("ID 없음");
  expect(commandLabor(s, { type: "exchange-receive" }, id)).toEqual(s);
  expect(() => g.step({ type: "exchange-receive" })).toThrow();
  expect(() => g.step({ type: "exchange-inspect" })).toThrow();
  expect(total(g.s)).toBe(20);
});
it("검수 전 수령·사용·출발 후 취소·교환 담당 재배치·중복 보완은 거부한다", () => {
  const f = depart(),
    before = f.s;
  for (const c of [
    { type: "exchange-receive" },
    { type: "exchange-inspect" },
    { type: "exchange-cancel" },
    { type: "move", worker: "crew-1", from: "exchange", to: "prep" },
    { type: "timber", command: { type: "repair" } },
    { type: "timber", command: { type: "use" } },
  ] as const)
    expect(() => f.step(c)).toThrow();
  expect(f.s).toEqual(before);
});
it("현장 보완 진행 또는 배정이 있으면 교환으로 중복 처리하지 못한다", () => {
  const f = fixture();
  f.step({ type: "timber", command: { type: "repair" } });
  expect(() => f.step({ type: "exchange-request" })).toThrow();
  f.step({ type: "advance", minutes: 60 });
  for (const worker of ["crew-1", "crew-2"] as const)
    f.step({ type: "move", worker, from: "repair", to: "idle" });
  expect(() => f.step({ type: "exchange-request" })).toThrow();
  expect(f.s.repairProgress).toBe(60);
});
it("네 명 모두 배급 중이면 교환 예약은 원장 변경 없이 거부한다", () => {
  const f = fixture();
  for (const worker of ["crew-1", "crew-2", "crew-3", "crew-4"] as const)
    f.step({ type: "assign", worker, job: "prep" });
  const before = f.s;
  expect(() => f.step({ type: "exchange-request" })).toThrow("담당1명");
  expect(f.s).toEqual(before);
});
it("요청·왕복·재검수·수령 대기·완료 저장은 담당·물량·종료 시각을 복원한다", () => {
  const f = reserve();
  const verify = () => {
    const loaded = parseLaborSave(
      JSON.parse(JSON.stringify(createLaborSave(f.s))),
    );
    expect(loaded.state).toEqual(f.s);
    expect(total(loaded.state)).toBe(20);
  };
  verify();
  f.step({ type: "exchange-depart" });
  f.step({ type: "advance", minutes: 60 });
  verify();
  f.step({ type: "next" });
  verify();
  f.step({ type: "next" });
  verify();
  f.step({ type: "exchange-inspect" });
  f.step({ type: "advance", minutes: 60 });
  verify();
  f.step({ type: "next" });
  verify();
  f.step({ type: "exchange-receive" });
  verify();
});
it("실제v1 일손 저장을 읽기 호환해 보완 진행60과 재배치를 유지한다", () => {
  const raw = JSON.stringify(legacySave),
    old = JSON.parse(raw),
    loaded = parseLaborSave(old);
  expect(old.saveVersion).toBe(1);
  expect(loaded.saveVersion).toBe(2);
  expect(loaded.state.version).toBe(2);
  expect(loaded.state.exchange.phase).toBe("none");
  expect(loaded.state.repairProgress).toBe(60);
  expect(loaded.state.prepProgress).toBe(120);
  expect(loaded.state.crew[1]?.job).toBe("prep");
  expect(JSON.stringify(old)).toBe(JSON.stringify(JSON.parse(raw)));
  const n = commandLabor(loaded.state, { type: "next" }, "new-v2");
  expect(n.elapsed).toBe(620);
  expect(n.repairProgress).toBe(60);
});
it.each([
  "early-departure",
  "future-request",
  "wrong-worker",
  "missing-time",
  "duplicate-stock",
  "fake-receive",
  "wrong-phase",
  "wrong-version",
])("손상된 교환 저장은 거부한다: %s", (key) => {
  const f = depart();
  const v = JSON.parse(JSON.stringify(f.s));
  if (key === "early-departure") v.exchange.departure = 400;
  if (key === "future-request") v.exchange.requestedAt = 481;
  if (key === "wrong-worker") v.crew[0].job = "idle";
  if (key === "missing-time") v.exchange.departure = null;
  if (key === "duplicate-stock") v.timber.stock.available = 20;
  if (key === "fake-receive") v.exchange.receivedAt = 480;
  if (key === "wrong-phase") v.exchange.phase = "completed";
  if (key === "wrong-version") v.version = 99;
  expect(() => parseLaborState(v)).toThrow();
});
function advanceTo(f: ReturnType<typeof fixture>, minute: number) {
  while (f.s.elapsed < minute)
    f.step({ type: "advance", minutes: Math.min(1440, minute - f.s.elapsed) });
}
it("저장 시간 상한 안에 끝낼 수 없는 교환 요청은 원장 변경 없이 거부한다", () => {
  const f = fixture();
  advanceTo(f, 14101);
  const before = f.s;
  expect(() => f.step({ type: "exchange-request" })).toThrow();
  expect(f.s).toEqual(before);
});
it("예약 뒤 너무 늦어진 출발은 결제 없이 거부하고 취소는 허용한다", () => {
  const f = reserve();
  advanceTo(f, 14101);
  const before = f.s;
  expect(() => f.step({ type: "exchange-depart" })).toThrow();
  expect(f.s).toEqual(before);
  expect(laborIron(f.s)).toBe(4);
  f.step({ type: "exchange-cancel" });
  expect(laborReservedIron(f.s)).toBe(0);
  expect(countCrew(f.s, "idle")).toBe(4);
});
it.each(["transport", "inspection"])(
  "저장 시간 상한 밖에 종료되는 교환 저장은 거부한다: %s",
  (kind) => {
    const f = depart(),
      v = JSON.parse(JSON.stringify(f.s));
    v.elapsed = 14300;
    v.timber.elapsed = 14300;
    v.exchange.requestedAt = 14200;
    v.exchange.departure = 14250;
    if (kind === "inspection") {
      v.elapsed = 14350;
      v.timber.elapsed = 14350;
      v.exchange.phase = "inspecting";
      v.exchange.requestedAt = 13990;
      v.exchange.departure = 14000;
      v.exchange.inspectionStart = 14300;
    }
    expect(() => parseLaborState(v)).toThrow();
  },
);
it("시간 상한 정각에 끝나는 교환은 정상 수령·사용까지 허용한다", () => {
  const f = fixture();
  for (const worker of ["crew-2", "crew-3", "crew-4"] as const)
    f.step({ type: "assign", worker, job: "prep" });
  f.step({ type: "next" });
  advanceTo(f, 14100);
  f.step({ type: "exchange-request" });
  f.step({ type: "exchange-depart" });
  f.step({ type: "next" });
  f.step({ type: "next" });
  f.step({ type: "exchange-inspect" });
  f.step({ type: "next" });
  expect(f.s.elapsed).toBe(14400);
  f.step({ type: "exchange-receive" });
  for (const type of ["allocate", "use"] as const)
    f.step({ type: "timber", command: { type } });
  expect(laborFinished(f.s)).toBe(true);
  expect(total(f.s)).toBe(20);
});
