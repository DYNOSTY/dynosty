import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import {
  advanceTimber,
  bokholElevation,
  commandTimber,
  createPlayState,
  createTimberState,
  createVillageGame,
  requireValue,
} from "@dynosty/game-core";
import { expect, it } from "vitest";
import { createTownVisual } from "./town-scene.js";

it("수역·어군과 결빙 구멍을 전환하고 대기 부지에서 완성 시설로 바뀐다", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    visual = createTownVisual(scene);
  try {
    let s = createTimberState({
      ...createPlayState(),
      minute: 540,
      resources: {
        ...createPlayState().resources,
        RES_WOOD: 3000000,
        RES_METAL: 1000000,
      },
    });
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
    expect(scene.getMeshById("town:build-1:sprout-0")).not.toBeNull();
    const first = scene.getMeshById("town:build-1:sprout-0");
    visual.update({
      ...s,
      town: {
        ...s.town,
        facilities: s.town.facilities.map((f) => ({ ...f, level: 3 })),
      },
    });
    expect(first?.isDisposed()).toBe(true);
    expect(scene.getMeshById("town:build-1:high-bay-ridge")).not.toBeNull();
    visual.update(null);
    expect(scene.getMeshById("town:build-1")).toBeNull();
  } finally {
    visual.dispose();
    scene.dispose();
    engine.dispose();
  }
});

it("구릉지 목축장의 기초 전체가 정지된 땅 위에 놓인다", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    visual = createTownVisual(scene);
  try {
    const position = { x: 46, z: 14 },
      headingRadians = Math.PI / 4;
    let state = commandTimber(
      createVillageGame(),
      { type: "plan-building", kind: "ranch", position, headingRadians },
      "slope-ranch",
    );
    const center = bokholElevation(position.x, position.z);
    expect(Math.abs(center)).toBeGreaterThan(1);
    visual.update(state);
    const root = requireValue(
      scene.getMeshById("town:build-1"),
      "scene.getMeshById('town:build-1')",
    );
    expect(root.position.y).toBeCloseTo(center + 0.05);
    for (let i = 0; i < 800 && state.town.orders.length; i++)
      state = advanceTimber(state, 1);
    expect(state.town.facilities[0]?.kind).toBe("ranch");
    visual.update(state);
    expect(root.position.y).toBeCloseTo(center + 0.75);
    for (const [dx, dz] of [
      [3.2, 0],
      [0, 3.2],
      [-3.2, 0],
      [0, -3.2],
    ] as const)
      expect(
        bokholElevation(position.x + dx, position.z + dz, 120, [position]),
      ).toBeCloseTo(center);
  } finally {
    visual.dispose();
    scene.dispose();
    engine.dispose();
  }
});
