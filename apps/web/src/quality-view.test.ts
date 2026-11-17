import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import {
  commandLabor,
  createLaborSave,
  createLaborState,
  type LaborCommand,
  parseLaborSave,
} from "@dynosty/game-core";
import { expect, it } from "vitest";
import { createLaborVisual } from "./labor-scene.js";
import { createQualityVisual } from "./quality-scene.js";
import { qualityView } from "./quality-view.js";
import { createTimberVisual } from "./timber-scene.js";

function fixture(offer: "A" | "B" = "A") {
  let s = createLaborState(),
    n = 0;
  const step = (c: LaborCommand) => {
    s = commandLabor(s, c, `quality-${++n}`);
  };
  const depart = () => {
    step({ type: "timber", command: { type: "choose", offer } });
    step({ type: "timber", command: { type: "contract" } });
    step({ type: "timber", command: { type: "depart" } });
  };
  const receive = () => {
    depart();
    while (s.timber.phase === "transport") step({ type: "next" });
    step({ type: "timber", command: { type: "inspect" } });
    while (s.timber.phase === "inspecting") step({ type: "next" });
    step({ type: "timber", command: { type: "receive" } });
  };
  return {
    step,
    depart,
    receive,
    get state() {
      return s;
    },
  };
}
it("출발 전 재고와 예약·실제 비용을 구분하고 운송20을 한 곳에만 계산한다", () => {
  const f = fixture();
  expect(qualityView(f.state).total).toBe(0);
  f.step({ type: "timber", command: { type: "choose", offer: "A" } });
  f.step({ type: "timber", command: { type: "contract" } });
  expect(qualityView(f.state)).toMatchObject({
    spent: 0,
    reserved: 4,
    freeIron: 4,
    inspected: false,
  });
  f.step({ type: "timber", command: { type: "depart" } });
  expect(qualityView(f.state)).toMatchObject({
    total: 20,
    spent: 4,
    reserved: 0,
    bins: { transit: 20, waiting: 0 },
  });
  f.step({ type: "next" });
  expect(qualityView(f.state)).toMatchObject({
    total: 20,
    bins: { transit: 0, waiting: 20 },
    normal: null,
  });
});
it("A 보완·배분·사용·저장 복원은 총20과 원납품 최초 품질 결과를 보존한다", () => {
  const f = fixture();
  f.receive();
  expect(qualityView(f.state)).toMatchObject({
    normal: 16,
    wet: 4,
    total: 20,
    bins: { available: 16, quarantine: 4 },
  });
  f.step({ type: "timber", command: { type: "repair" } });
  f.step({ type: "next" });
  expect(qualityView(f.state)).toMatchObject({
    repaired: 4,
    spent: 4,
    bins: { available: 20, quarantine: 0 },
  });
  f.step({ type: "timber", command: { type: "allocate" } });
  expect(qualityView(f.state)).toMatchObject({
    bins: { available: 0, allocated: 20 },
  });
  f.step({ type: "timber", command: { type: "use" } });
  expect(qualityView(f.state)).toMatchObject({
    normal: 16,
    wet: 4,
    bins: { used: 20, allocated: 0 },
    total: 20,
  });
  expect(qualityView(parseLaborSave(createLaborSave(f.state)).state)).toEqual(
    qualityView(f.state),
  );
});
it("교환 예약·운송·검사·수령은 미해결4를 이동하고 비용을 중복 계산하지 않는다", () => {
  const f = fixture();
  f.receive();
  f.step({ type: "timber", command: { type: "allocate" } });
  f.step({ type: "exchange-request" });
  expect(qualityView(f.state)).toMatchObject({
    spent: 4,
    reserved: 1,
    total: 20,
    exchanged: 0,
  });
  f.step({ type: "exchange-depart" });
  expect(qualityView(f.state)).toMatchObject({
    spent: 5,
    reserved: 0,
    total: 20,
    bins: { transit: 4, quarantine: 0, allocated: 16 },
  });
  f.step({ type: "next" });
  f.step({ type: "next" });
  expect(qualityView(f.state)).toMatchObject({
    bins: { transit: 0, waiting: 4 },
    total: 20,
  });
  f.step({ type: "exchange-inspect" });
  f.step({ type: "next" });
  expect(qualityView(f.state)).toMatchObject({
    exchanged: 0,
    exchangePending: 4,
    bins: { checked: 4 },
    total: 20,
  });
  f.step({ type: "exchange-receive" });
  expect(qualityView(f.state)).toMatchObject({
    exchanged: 4,
    exchangePending: 0,
    bins: { available: 4, allocated: 16 },
    total: 20,
    iron: 3,
  });
});
it("B는 정상20·격리0이며 검사 전에는 실제 결과를 확정하지 않고 파생은 원본을 유지한다", () => {
  const f = fixture("B");
  const before = JSON.stringify(f.state);
  qualityView(f.state);
  expect(JSON.stringify(f.state)).toBe(before);
  f.receive();
  expect(qualityView(f.state)).toMatchObject({
    normal: 20,
    wet: 0,
    repaired: 0,
    spent: 6,
    total: 20,
    bins: { available: 20, quarantine: 0 },
  });
});
it("실제 장면에서 정상과 배분 더미를 분리하고 사용 후 제거하며 모드 전환·폐기에 누수가 없다", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    t = createTimberVisual(scene),
    l = createLaborVisual(scene),
    q = createQualityVisual(scene),
    f = fixture();
  const show = () => {
    const v = qualityView(f.state);
    t.update({ ...f.state.timber, stock: v.bins });
    l.update(f.state);
    q.update(f.state);
  };
  f.depart();
  f.step({ type: "next" });
  show();
  expect(
    scene.getMeshByName("exchange-inspection-parcel")?.material?.name,
  ).toBe("quality-pending-material");
  f.step({ type: "timber", command: { type: "inspect" } });
  f.step({ type: "next" });
  show();
  expect(
    scene.getMeshByName("exchange-inspection-parcel")?.material?.name,
  ).toBe("exchange-accepted");
  f.step({ type: "timber", command: { type: "receive" } });
  show();
  expect(scene.getMeshByName("timber-accepted")?.isEnabled()).toBe(true);
  f.step({ type: "timber", command: { type: "allocate" } });
  show();
  expect(scene.getMeshByName("timber-accepted")?.isEnabled()).toBe(false);
  expect(scene.getMeshByName("quality-allocated")?.isEnabled()).toBe(true);
  f.step({ type: "exchange-request" });
  f.step({ type: "exchange-depart" });
  show();
  expect(scene.getMeshByName("timber-quarantine")?.isEnabled()).toBe(false);
  const count = scene.meshes.length;
  for (let i = 0; i < 100; i++) show();
  expect(scene.meshes).toHaveLength(count);
  q.update(null);
  expect(scene.getMeshByName("quality-allocated")?.isEnabled()).toBe(false);
  t.update(f.state.timber);
  expect(scene.getMeshByName("timber-accepted")?.isEnabled()).toBe(true);
  q.dispose();
  l.dispose();
  t.dispose();
  expect(scene.meshes).toHaveLength(0);
  scene.dispose();
  engine.dispose();
});
