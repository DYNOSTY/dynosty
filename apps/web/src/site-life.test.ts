import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import {
  commandLabor,
  createLaborSave,
  createLaborState,
  type LaborCommand,
  laborStock,
  parseLaborSave,
} from "@dynosty/game-core";
import { expect, it } from "vitest";
import { createLaborVisual } from "./labor-scene.js";
import { createLegacyTimberVisual as createTimberVisual } from "./legacy-timber-scene.js";
import { crewActivity, nextTimberStep, transportView } from "./site-life.js";

function flow(offer: "A" | "B" = "A") {
  let state = createLaborState(),
    id = 0;
  const step = (c: LaborCommand) => {
    state = commandLabor(state, c, `life-${++id}`);
    return state;
  };
  const timber = (c: Extract<LaborCommand, { type: "timber" }>["command"]) =>
    step({ type: "timber", command: c });
  return {
    step,
    timber,
    get state() {
      return state;
    },
    depart() {
      timber({ type: "choose", offer });
      timber({ type: "contract" });
      timber({ type: "depart" });
    },
    receive() {
      this.depart();
      while (state.timber.phase === "transport") step({ type: "next" });
      timber({ type: "inspect" });
      while (state.timber.phase === "inspecting") step({ type: "next" });
      timber({ type: "receive" });
    },
  };
}
it("A/B 기존 운송 시간과 하역 상태를 읽는다", () => {
  for (const offer of ["A", "B"] as const) {
    const f = flow(offer);
    expect(nextTimberStep(f.state).title).toContain("공급 제안");
    f.depart();
    expect(transportView(f.state)).toMatchObject({
      moving: true,
      quantity: 20,
      progress: 0,
    });
    f.step({ type: "advance", minutes: offer === "A" ? 180 : 300 });
    expect(transportView(f.state).progress).toBe(0.5);
    while (f.state.timber.phase === "transport") f.step({ type: "next" });
    expect(transportView(f.state)).toMatchObject({
      moving: false,
      quantity: 0,
      progress: 1,
    });
    expect(nextTimberStep(f.state).site).toBe("site-inspection");
  }
});
it("교환 회수/재납품/재검수/수령을 구분하고 저장 복원은 같은 안내를 만든다", () => {
  const f = flow();
  f.receive();
  f.step({ type: "exchange-request" });
  expect(transportView(f.state).label).toContain("출발 대기");
  f.step({ type: "exchange-depart" });
  f.step({ type: "advance", minutes: 45 });
  expect(transportView(f.state)).toMatchObject({
    progress: 0.5,
    x: -2,
    quantity: 4,
  });
  f.step({ type: "next" });
  expect(transportView(f.state).label).toContain("재납품");
  f.step({ type: "advance", minutes: 45 });
  expect(transportView(f.state).progress).toBe(0.5);
  const restored = parseLaborSave(
    JSON.parse(JSON.stringify(createLaborSave(f.state))),
  ).state;
  expect(transportView(restored)).toEqual(transportView(f.state));
  expect(nextTimberStep(restored)).toEqual(nextTimberStep(f.state));
  f.step({ type: "next" });
  expect(nextTimberStep(f.state).site).toBe("site-inspection");
  expect(transportView(f.state).quantity).toBe(0);
  f.step({ type: "exchange-inspect" });
  f.step({ type: "next" });
  f.step({ type: "exchange-receive" });
  expect(transportView(f.state).label).toContain("수령 완료");
  expect(nextTimberStep(f.state).title).toContain("배분");
});
it("보완 인원 부족·배급 병행·정상 B 경로에 잘못된 작업을 안내하지 않는다", () => {
  const f = flow();
  f.receive();
  f.step({ type: "assign", worker: "crew-1", job: "repair" });
  expect(crewActivity(f.state, 0)).toContain("대기");
  f.step({ type: "assign", worker: "crew-2", job: "repair" });
  expect(crewActivity(f.state, 0)).toBe("보완 중");
  f.step({ type: "assign", worker: "crew-3", job: "prep" });
  expect(crewActivity(f.state, 2)).toBe("배급 준비 중");
  f.step({ type: "advance", minutes: 60 });
  f.step({ type: "move", worker: "crew-2", from: "repair", to: "prep" });
  expect(nextTimberStep(f.state).title).toContain("보완 이어가기");
  expect(nextTimberStep(f.state).detail).toContain("1/2명");
  expect(nextTimberStep(f.state).detail).not.toContain("교환을 선택");
  const b = flow("B");
  b.receive();
  expect(nextTimberStep(b.state).title).toContain("배분");
  b.timber({ type: "allocate" });
  expect(nextTimberStep(b.state).title).toContain("사용 확인");
  b.timber({ type: "use" });
  expect(nextTimberStep(b.state).title).toContain("완료");
});
it("주민은 실제 작업 장소로 이동하고 작업/정지 표현·운송 표시를 반복해도 재고와 자원 수는 보존한다", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    timber = createTimberVisual(scene),
    labor = createLaborVisual(scene),
    f = flow();
  try {
    f.receive();
    f.step({ type: "assign", worker: "crew-1", job: "repair" });
    f.step({ type: "assign", worker: "crew-2", job: "repair" });
    f.step({ type: "assign", worker: "crew-3", job: "prep" });
    f.step({ type: "pause", paused: false });
    const s = f.state,
      original = JSON.stringify(s);
    timber.update({ ...s.timber, stock: laborStock(s) });
    labor.update(s);
    const count = scene.meshes.length;
    for (let i = 0; i < 100; i++) labor.animate(0.1);
    const repair = scene.getMeshById("crew-1"),
      prep = scene.getMeshById("crew-3");
    expect(repair?.position.x).toBeGreaterThan(4);
    expect(repair?.position.z).toBeLessThan(-2);
    expect(prep?.position.x).toBeGreaterThan(2);
    expect(prep?.position.z).toBeGreaterThan(-1);
    expect(repair?.rotation.z).not.toBe(0);
    labor.update({ ...s, paused: true });
    labor.animate(0.1);
    expect(repair?.rotation.z).toBe(0);
    for (let i = 0; i < 100; i++) {
      labor.update(s);
      labor.animate(0.016);
    }
    expect(scene.meshes.length).toBe(count);
    expect(JSON.stringify(s)).toBe(original);
    expect(scene.getMeshByName("transport-route-0")?.isPickable).toBe(false);
    labor.update(null);
    expect(scene.getMeshByName("transport-route-0")?.isEnabled()).toBe(false);
  } finally {
    labor.dispose();
    timber.dispose();
    expect(scene.meshes.length).toBe(0);
    scene.dispose();
    engine.dispose();
  }
});
