import { describe, expect, it } from "vitest";
import {
  advanceLabor,
  commandLabor,
  countCrew,
  createLaborSave,
  createLaborState,
  type LaborCommand,
  type LaborState,
  laborFinished,
  laborNextAt,
  parseLaborSave,
  parseLaborState,
  queueRemaining,
  tickLabor,
} from "./labor.js";

function fixture(offer: "A" | "B" = "A") {
  let state = createLaborState(),
    n = 0;
  const step = (c: LaborCommand) =>
    (state = commandLabor(state, c, `test-${++n}`));
  step({ type: "timber", command: { type: "choose", offer } });
  return {
    step,
    get state() {
      return state;
    },
  };
}
function start(f: ReturnType<typeof fixture>) {
  for (const type of ["contract", "depart"] as const)
    f.step({ type: "timber", command: { type } });
}
function receiveA() {
  const f = fixture();
  start(f);
  f.step({ type: "next" });
  f.step({ type: "timber", command: { type: "inspect" } });
  f.step({ type: "next" });
  f.step({ type: "timber", command: { type: "receive" } });
  return f;
}
function parallelA() {
  const f = receiveA();
  f.step({ type: "timber", command: { type: "repair" } });
  for (const worker of ["crew-3", "crew-4"] as const)
    f.step({ type: "assign", worker, job: "prep" });
  return f;
}
describe("개인별 공유 일손과 동시 작업", () => {
  it("A의 목재보완2명·배급2명이 같은1시간 동안 각각 진행한다", () => {
    const f = parallelA();
    expect(countCrew(f.state, "idle")).toBe(0);
    f.step({ type: "advance", minutes: 60 });
    expect(f.state.elapsed).toBe(540);
    expect(f.state.repairProgress).toBe(60);
    expect(f.state.prepProgress).toBe(120);
    expect(queueRemaining(f.state)).toBe(2);
    expect(f.state.timber.due).toBe(720);
  });
  it("같은 사람 중복배정·운송 예약자 재배치를 거부하고 자원·원본을 보존한다", () => {
    const f = fixture("B");
    start(f);
    const before = f.state;
    expect(() =>
      f.step({ type: "assign", worker: "crew-1", job: "prep" }),
    ).toThrow("이미 배정");
    expect(() =>
      f.step({ type: "move", worker: "crew-1", from: "carrier", to: "idle" }),
    ).toThrow("운송");
    expect(f.state).toEqual(before);
    expect(() =>
      f.step({ type: "assign", worker: "crew-2", job: "prep" }),
    ).toThrow("아직");
  });
  it("재배치로 보완을 멈춰도 진행이 보존되고 두 명 복귀 뒤 잔여시간으로 재개한다", () => {
    const f = parallelA();
    f.step({ type: "advance", minutes: 60 });
    f.step({ type: "move", worker: "crew-2", from: "repair", to: "prep" });
    expect(f.state.timber.phase).toBe("received");
    expect(f.state.timber.due).toBeNull();
    expect(countCrew(f.state, "repair")).toBe(1);
    f.step({ type: "next" });
    expect(f.state.elapsed).toBe(620);
    expect(f.state.repairProgress).toBe(60);
    expect(f.state.prepProgress).toBe(360);
    expect(f.state.prepCompletedAt).toBe(620);
    expect(countCrew(f.state, "idle")).toBe(3);
    f.step({ type: "assign", worker: "crew-2", job: "repair" });
    expect(f.state.timber.due).toBe(800);
    f.step({ type: "next" });
    expect(f.state.repairProgress).toBe(240);
    expect(f.state.timber.stock.available).toBe(20);
  });
  it("B는 예약자1명 외3명으로 배급을 진행해 도착과 배급을 같은10시간에 정산한다", () => {
    const f = fixture("B");
    start(f);
    f.step({ type: "next" });
    expect(f.state.elapsed).toBe(480);
    expect(f.state.timber.phase).toBe("transport");
    for (const worker of ["crew-2", "crew-3", "crew-4"] as const)
      f.step({ type: "assign", worker, job: "prep" });
    f.step({ type: "next" });
    expect(f.state.elapsed).toBe(600);
    expect(f.state.timber.phase).toBe("arrived");
    expect(f.state.prepCompletedAt).toBe(600);
    expect(countCrew(f.state, "carrier")).toBe(1);
    expect(countCrew(f.state, "idle")).toBe(3);
    for (const type of ["inspect"] as const)
      f.step({ type: "timber", command: { type } });
    f.step({ type: "next" });
    for (const type of ["receive", "allocate", "use"] as const)
      f.step({ type: "timber", command: { type } });
    expect(laborFinished(f.state)).toBe(true);
    expect(f.state.timber.iron).toBe(2);
  });
  it("A의 배급 완료가 먼저 와도 보완을 중복 완료하지 않고 두 작업 기한을 구분한다", () => {
    const f = parallelA();
    f.step({ type: "next" });
    expect(f.state.elapsed).toBe(660);
    expect(f.state.prepCompletedAt).toBe(660);
    expect(f.state.repairProgress).toBe(180);
    expect(f.state.timber.stock.quarantine).toBe(4);
    f.step({ type: "next" });
    expect(f.state.elapsed).toBe(720);
    expect(f.state.timber.stock.available).toBe(20);
    for (const type of ["allocate", "use"] as const)
      f.step({ type: "timber", command: { type } });
    expect(laborFinished(f.state)).toBe(true);
    expect(f.state.timber.completedAt).toBe(720);
    expect(f.state.timber.iron).toBe(4);
  });
  it("목재 사용 완료 뒤에도 남은 배급 준비는 같은 전체 시간축에서 끝낼 수 있다", () => {
    const f = receiveA();
    f.step({ type: "timber", command: { type: "repair" } });
    f.step({ type: "next" });
    for (const type of ["allocate", "use"] as const)
      f.step({ type: "timber", command: { type } });
    expect(laborFinished(f.state)).toBe(false);
    expect(f.state.elapsed).toBe(720);
    for (const worker of ["crew-1", "crew-2", "crew-3"] as const)
      f.step({ type: "assign", worker, job: "prep" });
    f.step({ type: "next" });
    expect(f.state.elapsed).toBe(840);
    expect(f.state.timber.elapsed).toBe(720);
    expect(f.state.prepCompletedAt).toBe(840);
    expect(laborFinished(f.state)).toBe(true);
  });
  it("재배치의 이전 작업이 맞지 않으면 최신 배정을 덮어쓰지 않는다", () => {
    const f = parallelA(),
      before = f.state;
    expect(() =>
      f.step({ type: "move", worker: "crew-3", from: "idle", to: "repair" }),
    ).toThrow("상태가 바뀌");
    expect(f.state).toEqual(before);
    const id = before.processed.at(-1) as string;
    expect(
      commandLabor(
        before,
        { type: "assign", worker: "crew-4", job: "prep" },
        id,
      ),
    ).toEqual(before);
  });
  it("전원 배급 준비 중 계약을 누르면 철재·예약이 부분 적용되지 않는다", () => {
    const f = fixture();
    f.step({ type: "advance", minutes: 480 });
    for (const worker of ["crew-1", "crew-2", "crew-3", "crew-4"] as const)
      f.step({ type: "assign", worker, job: "prep" });
    const before = f.state;
    expect(() =>
      f.step({ type: "timber", command: { type: "contract" } }),
    ).toThrow("먼저 확보");
    expect(f.state).toEqual(before);
    expect(f.state.timber.reservedIron).toBe(0);
  });
  it("큰 시간 진행도8시간 요청과 각 작업 경계를 보존한다", () => {
    const f = fixture("B");
    start(f);
    f.step({ type: "advance", minutes: 1440 });
    expect(f.state.elapsed).toBe(480);
    expect(f.state.paused).toBe(true);
    expect(laborNextAt(f.state)).toBe(600);
  });
  it("분할/일괄 진행의 실제 작업량이 같고 정지·3배속·부분초가 보존된다", () => {
    const f = parallelA(),
      s = f.state;
    let split = s;
    for (let i = 0; i < 60; i++) split = advanceLabor(split, 1);
    expect(split).toEqual(advanceLabor(s, 60));
    expect(tickLabor(s, 1000)).toEqual(s);
    const running = { ...s, paused: false, speed: 3 as const };
    const a = tickLabor(running, 500);
    expect(a.remainder).toBe(500);
    expect(tickLabor(a, 500).elapsed).toBe(483);
  });
  it("재배치 중 저장은 개인별 배정·진행·일시중단과 원본을 보존한다", () => {
    const f = parallelA();
    f.step({ type: "advance", minutes: 60 });
    f.step({ type: "move", worker: "crew-2", from: "repair", to: "prep" });
    const save = createLaborSave(f.state);
    const loaded = parseLaborSave(JSON.parse(JSON.stringify(save)));
    expect(loaded.state).toEqual(f.state);
    expect(loaded.state).not.toBe(f.state);
    expect(loaded.state.timber.due).toBeNull();
    expect(loaded.state.repairProgress).toBe(60);
  });
  it.each(["prep-at-open", "prep-too-fast", "repair-paused"])(
    "경과 시간으로 불가능한 진행량 저장을 거부한다: %s",
    (kind) => {
      const f = parallelA();
      if (kind === "prep-too-fast") f.step({ type: "advance", minutes: 60 });
      if (kind === "repair-paused")
        f.step({ type: "move", worker: "crew-2", from: "repair", to: "prep" });
      const value = JSON.parse(JSON.stringify(f.state));
      if (kind === "prep-at-open") value.prepProgress = 1;
      if (kind === "prep-too-fast") value.prepProgress = 241;
      if (kind === "repair-paused") value.repairProgress = 1;
      expect(() => parseLaborState(value)).toThrow();
    },
  );
  it.each([
    "duplicate",
    "carrier",
    "negative",
    "future",
    "deadline",
    "progress",
    "version",
  ])("손상된 일손 저장을 거부한다: %s", (key) => {
    const f = parallelA();
    const s = JSON.parse(JSON.stringify(f.state)) as LaborState &
      Record<string, unknown>;
    const v = JSON.parse(JSON.stringify(s));
    if (key === "duplicate") v.crew[1].id = v.crew[0].id;
    if (key === "carrier") v.crew[0].job = "carrier";
    if (key === "negative") v.prepProgress = -1;
    if (key === "future") v.history[0].minute = 1000;
    if (key === "deadline") v.timber.due = 481;
    if (key === "progress") v.repairProgress = 20;
    if (key === "version") v.version = 99;
    expect(() => parseLaborState(v)).toThrow();
  });
});
