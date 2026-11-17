import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import {
  advanceTimber,
  commandTimber,
  createPlayState,
  createTimberState,
} from "@dynosty/game-core";
import { expect, it } from "vitest";
import { createTownVisual } from "./town-scene.js";

it("수역·어군과 결빙 구멍을 전환하고 대기 부지에서 완성 시설로 바뀐다", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    visual = createTownVisual(scene);
  try {
    let s = createTimberState({ ...createPlayState(), minute: 540 });
    visual.update(s);
    expect(scene.getMeshById("fish-shoal:east-pond:0")?.isEnabled()).toBe(true);
    expect(scene.getMeshById("ice-hole:east-pond:2")?.isEnabled()).toBe(false);
    s = commandTimber(s, { type: "cold-weather", cold: true }, "cold");
    visual.update(s);
    expect(scene.getMeshById("ice-hole:east-pond:2")?.isEnabled()).toBe(true);
    expect(scene.getMeshById("fish-shoal:east-pond:0")?.isEnabled()).toBe(
      false,
    );
    s = commandTimber(
      s,
      {
        type: "plan-building",
        kind: "farm",
        position: { x: 12, z: 12 },
        headingRadians: Math.PI / 2,
      },
      "farm",
    );
    visual.update(s);
    expect(scene.getMeshById("town:build-1")?.isVisible).toBe(true);
    s = advanceTimber(s, 120);
    visual.update(s);
    expect(scene.getMeshById("town:build-1")?.isVisible).toBe(false);
    expect(scene.getMeshById("town:build-1")?.rotation.y).toBe(Math.PI / 2);
    expect(scene.getMeshById("town:build-1:crop00")).not.toBeNull();
    visual.update(null);
    expect(scene.getMeshById("town:build-1")).toBeNull();
  } finally {
    visual.dispose();
    scene.dispose();
    engine.dispose();
  }
});
