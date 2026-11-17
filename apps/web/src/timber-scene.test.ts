import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import {
  commandTimber,
  createTimberState,
  type TimberState,
} from "@dynosty/game-core";
import { expect, it } from "vitest";
import { createTimberVisual } from "./timber-scene.js";

it("수레·격리·사용가능 물량·지붕과 임시쉼터는 실제 조달 상태를 따르고 종료 시 정리된다", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    v = createTimberVisual(scene);
  let s: TimberState = createTimberState(),
    id = 0;
  const step = (
    type:
      | "contract"
      | "depart"
      | "next"
      | "inspect"
      | "receive"
      | "repair"
      | "allocate"
      | "use",
  ) => {
    s = commandTimber(s, { type }, String(++id));
    v.update(s);
  };
  try {
    v.update(null);
    expect(scene.meshes.every((m) => !m.isEnabled())).toBe(true);
    v.update(s);
    const patch = scene.getMeshByName("timber-roof-patch");
    const before = patch?.material;
    s = commandTimber(s, { type: "choose", offer: "A" }, "choose");
    step("contract");
    step("depart");
    s = commandTimber(s, { type: "advance", minutes: 180 }, "half");
    v.update(s);
    v.animate(1);
    expect(scene.getMeshByName("timber-cart")?.position.x).toBe(-2);
    step("next");
    step("inspect");
    step("next");
    step("receive");
    expect(scene.getMeshByName("timber-quarantine")?.isEnabled()).toBe(true);
    expect(scene.getMeshByName("timber-accepted")?.isEnabled()).toBe(true);
    step("repair");
    step("next");
    expect(scene.getMeshByName("timber-quarantine")?.isEnabled()).toBe(false);
    step("allocate");
    step("use");
    expect(patch?.material).not.toBe(before);
    expect(scene.getMeshByName("timber-cart")?.isEnabled()).toBe(false);
    v.update(null);
    expect(scene.meshes.every((m) => !m.isEnabled())).toBe(true);
    v.dispose();
    expect(scene.meshes).toHaveLength(0);
    expect(
      scene.materials.filter((m) => m.name.startsWith("timber-")),
    ).toHaveLength(0);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
