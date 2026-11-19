import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import {
  commandLabor,
  createLaborState,
  type LaborCommand,
  laborStock,
} from "@dynosty/game-core";
import { expect, it } from "vitest";
import { createLaborVisual } from "./labor-scene.js";
import { createLegacyTimberVisual as createTimberVisual } from "./legacy-timber-scene.js";

it("수레 회수·재납품 색상·검수대 물량 이동과 종료 정리를 실제 mesh에서 확인한다", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    timber = createTimberVisual(scene),
    labor = createLaborVisual(scene);
  let s = createLaborState(),
    id = 0;
  const step = (c: LaborCommand) => {
    s = commandLabor(s, c, `scene-ex-${++id}`);
    timber.update({ ...s.timber, stock: laborStock(s) });
    labor.update(s);
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
  step({ type: "exchange-request" });
  expect(scene.getMeshByName("timber-cart")?.isEnabled()).toBe(false);
  expect(scene.getMeshByName("exchange-cart")?.isEnabled()).toBe(true);
  expect(scene.getMeshByName("exchange-cargo")?.isEnabled()).toBe(false);
  step({ type: "exchange-depart" });
  expect(scene.getMeshByName("timber-quarantine")?.isEnabled()).toBe(false);
  expect(scene.getMeshByName("exchange-cargo")?.material?.name).toBe(
    "exchange-wet",
  );
  step({ type: "advance", minutes: 60 });
  for (let i = 0; i < 30; i++) labor.animate(0.1);
  expect(scene.getMeshByName("exchange-cart")?.position.x).toBeLessThan(-3);
  step({ type: "next" });
  expect(scene.getMeshByName("exchange-cargo")?.material?.name).toBe(
    "exchange-accepted",
  );
  step({ type: "next" });
  expect(scene.getMeshByName("exchange-cargo")?.isEnabled()).toBe(false);
  expect(scene.getMeshByName("exchange-inspection-parcel")?.isEnabled()).toBe(
    true,
  );
  step({ type: "exchange-inspect" });
  step({ type: "next" });
  expect(
    scene.getMeshByName("exchange-inspection-parcel")?.material?.name,
  ).toBe("exchange-accepted");
  step({ type: "exchange-receive" });
  expect(scene.getMeshByName("exchange-inspection-parcel")?.isEnabled()).toBe(
    false,
  );
  expect(scene.getMeshByName("timber-quarantine")?.isEnabled()).toBe(false);
  labor.update(null);
  timber.update(null);
  expect(scene.getMeshByName("exchange-cart")?.isEnabled()).toBe(false);
  labor.dispose();
  timber.dispose();
  expect(scene.meshes).toHaveLength(0);
  expect(scene.materials.some((m) => m.name.startsWith("exchange-"))).toBe(
    false,
  );
  scene.dispose();
  engine.dispose();
});
