import { describe, expect, it } from "vitest";
import {
  advanceTimber,
  commandTimber,
  createTimberSave,
  createTimberState,
  parseTimberSave,
  parseTimberState,
  type TimberCommand,
  type TimberOffer,
  tickTimber,
  timberScene,
} from "./timber.js";

function run(offer: TimberOffer = "A") {
  let state = createTimberState(),
    id = 0;
  const command = (c: TimberCommand) =>
    (state = commandTimber(state, c, `test-${++id}`));
  command({ type: "choose", offer });
  return {
    command,
    get state() {
      return state;
    },
  };
}
function receive(f: ReturnType<typeof run>) {
  for (const type of [
    "contract",
    "depart",
    "next",
    "inspect",
    "next",
    "receive",
  ] as const)
    f.command({ type });
}
describe("목재20 조달의 물량·시간·약정", () => {
  it("A는8시간 정상16을 먼저 배분하고12시간에 나머지4를 보완해 실제 사용한다", () => {
    const f = run();
    const original = f.state;
    f.command({ type: "contract" });
    expect(f.state.iron).toBe(8);
    expect(f.state.reservedIron).toBe(4);
    expect(f.state.workers).toBe(1);
    f.command({ type: "depart" });
    expect(f.state.iron).toBe(4);
    expect(f.state.stock.available).toBe(0);
    f.command({ type: "next" });
    expect(f.state.elapsed).toBe(360);
    expect(f.state.stock.waiting).toBe(20);
    expect(() => f.command({ type: "allocate" })).toThrow();
    f.command({ type: "inspect" });
    f.command({ type: "next" });
    expect(f.state.elapsed).toBe(480);
    expect(f.state.stock).toMatchObject({
      checked: 16,
      quarantine: 4,
      available: 0,
    });
    f.command({ type: "receive" });
    f.command({ type: "allocate" });
    expect(f.state.stock.allocated).toBe(16);
    expect(() => f.command({ type: "use" })).toThrow();
    f.command({ type: "repair" });
    expect(f.state.workers).toBe(2);
    f.command({ type: "next" });
    expect(f.state.elapsed).toBe(720);
    expect(f.state.workers).toBe(0);
    expect(f.state.stock.available).toBe(4);
    f.command({ type: "allocate" });
    f.command({ type: "use" });
    expect(f.state.phase).toBe("completed");
    expect(f.state.stock.used).toBe(20);
    expect(f.state.completedAt).toBe(720);
    expect(original.iron).toBe(8);
    expect(original.stock.used).toBe(0);
  });
  it("B도12시간에20 사용하되 철재2가 남고 보완 인력은 쓰지 않는다", () => {
    const f = run("B");
    receive(f);
    expect(f.state.elapsed).toBe(720);
    expect(f.state.phase).toBe("ready");
    expect(f.state.iron).toBe(2);
    expect(() => f.command({ type: "repair" })).toThrow();
    f.command({ type: "allocate" });
    f.command({ type: "use" });
    expect(f.state.completedAt).toBe(720);
    expect(f.state.history.some((x) => x.text.includes("일손2 배정"))).toBe(
      false,
    );
  });
  it("출발 전 취소만 예약을 해제하고 재약정·반복클릭이 비용을 복제하지 않는다", () => {
    const f = run();
    f.command({ type: "contract" });
    const c = f.state;
    expect(() => f.command({ type: "contract" })).toThrow();
    expect(
      commandTimber(c, { type: "contract" }, c.processed.at(-1) as string),
    ).toEqual(c);
    f.command({ type: "cancel" });
    expect(f.state.iron).toBe(8);
    expect(f.state.reservedIron).toBe(0);
    f.command({ type: "choose", offer: "B" });
    f.command({ type: "contract" });
    f.command({ type: "depart" });
    expect(f.state.iron).toBe(2);
    expect(() => f.command({ type: "cancel" })).toThrow();
  });
  it("중복 수령·재검사·배분·사용 확인은20을 넘기거나 보상을 반복하지 않는다", () => {
    const f = run();
    receive(f);
    const s = f.state,
      id = s.processed.at(-1) as string;
    expect(commandTimber(s, { type: "receive" }, id)).toEqual(s);
    expect(() => f.command({ type: "receive" })).toThrow();
    f.command({ type: "repair" });
    f.command({ type: "next" });
    expect(() => f.command({ type: "repair" })).toThrow();
    f.command({ type: "allocate" });
    expect(() => f.command({ type: "allocate" })).toThrow();
    f.command({ type: "use" });
    expect(() => f.command({ type: "use" })).toThrow();
    expect(advanceTimber(f.state, 60)).toEqual(f.state);
  });
  it("긴 구간 진행도 도착·검사·보완 경계에 멈추며 결정 시 일시정지한다", () => {
    const f = run();
    f.command({ type: "contract" });
    f.command({ type: "depart" });
    f.command({ type: "pause", paused: false });
    f.command({ type: "advance", minutes: 1440 });
    expect(f.state.elapsed).toBe(360);
    expect(f.state.phase).toBe("arrived");
    expect(f.state.paused).toBe(true);
    f.command({ type: "inspect" });
    f.command({ type: "advance", minutes: 1440 });
    expect(f.state.phase).toBe("inspected");
    expect(f.state.elapsed).toBe(480);
  });
  it("기한1분 지연도 진행을 막거나 사망시키지 않고 완료 시 지연을 기록한다", () => {
    const f = run("B");
    receive(f);
    f.command({ type: "advance", minutes: 1 });
    f.command({ type: "allocate" });
    f.command({ type: "use" });
    expect(f.state.completedAt).toBe(721);
    expect(f.state.history.at(-1)?.text).toContain("지연");
    expect(
      timberScene(f.state).entities.find((e) => e.kind === "resident")?.position
        .z,
    ).toBe(-2.1);
  });
  it("정지·재개·3배속과 부분 현실초의 나머지를 보존한다", () => {
    const s = createTimberState();
    expect(tickTimber(s, 1000)).toEqual(s);
    const running = { ...s, paused: false, speed: 3 as const };
    const a = tickTimber(running, 500),
      b = tickTimber(a, 500);
    expect(a.elapsed).toBe(1);
    expect(a.remainder).toBe(500);
    expect(b.elapsed).toBe(3);
    expect(b.remainder).toBe(0);
    expect(tickTimber(running, 50000).elapsed).toBe(3);
  });
  it.each([
    "version",
    "negative",
    "sum",
    "reserved",
    "workers",
    "time",
    "history",
    "phase",
  ])("손상된 저장을 거부한다: %s", (key) => {
    const f = run();
    receive(f);
    const s = JSON.parse(JSON.stringify(f.state));
    if (key === "version") s.version = 99;
    if (key === "negative") s.iron = -1;
    if (key === "sum") s.stock.available = 20;
    if (key === "reserved") s.reservedIron = 1;
    if (key === "workers") s.workers = 4;
    if (key === "time") s.elapsed = 0;
    if (key === "history") s.history[0].id = 3;
    if (key === "phase") s.phase = "completed";
    expect(() => parseTimberState(s)).toThrow();
  });
  it("모든 물량 상태·처리ID·기한을 저장하고 복사본으로 복원한다", () => {
    const f = run();
    receive(f);
    f.command({ type: "repair" });
    f.command({ type: "advance", minutes: 60 });
    const save = createTimberSave(f.state),
      loaded = parseTimberSave(JSON.parse(JSON.stringify(save)));
    expect(loaded.state).toEqual(f.state);
    expect(loaded.state).not.toBe(f.state);
    expect(loaded.state.due).toBe(720);
    expect(() => parseTimberSave({ ...save, saveVersion: 2 })).toThrow();
  });
  it("새 체험은 기존 결과·재고와 독립적이다", () => {
    const f = run("B");
    receive(f);
    const old = f.state;
    f.command({ type: "restart" });
    expect(f.state.iron).toBe(8);
    expect(f.state.elapsed).toBe(0);
    expect(f.state.stock).toEqual(createTimberState().stock);
    expect(old.iron).toBe(2);
  });
});

describe("저장 작업 종료 시각의 불변식", () => {
  it.each(["inspecting", "repairing"] as const)(
    "불가능한 %s 종료 시각은 불러오기에서 거부한다",
    (phase) => {
      const f = run();
      for (const type of ["contract", "depart", "next", "inspect"] as const)
        f.command({ type });
      if (phase === "repairing")
        for (const type of ["next", "receive", "repair"] as const)
          f.command({ type });
      expect(parseTimberState(f.state)).toEqual(f.state);
      for (const due of [f.state.elapsed + 1, f.state.elapsed + 1000]) {
        const corrupt = { ...f.state, due };
        expect(() => parseTimberState(corrupt)).toThrow("작업 종료 시각");
        expect(() =>
          parseTimberSave({
            format: "dynosty-timber",
            saveVersion: 1,
            state: corrupt,
          }),
        ).toThrow("작업 종료 시각");
      }
      expect(parseTimberState(f.state).due).toBe(f.state.due);
    },
  );
});
