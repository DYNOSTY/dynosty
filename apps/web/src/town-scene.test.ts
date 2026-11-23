import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import {
  advanceTimber,
  bokholElevation,
  commandTimber,
  createPlayState,
  createTimberState,
  createVillageGame,
  RESEARCH_CATALOG,
  requireValue,
} from "@dynosty/game-core";
import { expect, it } from "vitest";
import { createTownVisual } from "./town-scene.js";
import { villageCompletions } from "./village-completions.js";

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
    for (const id of s.town.orders[0]?.crew ?? []) new Mesh(id, scene);
    for (let i = 0; i < 100 && s.town.orders[0]?.stage !== "build"; i++)
      s = advanceTimber(s, 1);
    visual.update({ ...s, paused: false });
    const id = requireValue(s.town.orders[0]?.crew[0], "건설 인부");
    const hammer = requireValue(
      scene.getMeshById("town-job:" + id),
      "인부의 망치",
    );
    scene.onBeforeRenderObservable.notifyObservers(scene);
    expect(hammer.rotation.x).not.toBe(0);
    const angle = hammer.rotation.x;
    visual.update({ ...s, paused: true });
    scene.onBeforeRenderObservable.notifyObservers(scene);
    expect(hammer.rotation.x).toBe(angle);
    const building = s;
    s = advanceTimber(s, 120);
    expect(villageCompletions(building, s)).toContain("온상 재배소 건설 완료");
    expect(villageCompletions(s, s)).toEqual([]);
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

it("연구와 정책이 동시에 완료되면 한 줄씩 알리고 다음 갱신에는 반복하지 않는다", () => {
  const s = createVillageGame();
  const tech = requireValue(RESEARCH_CATALOG[0], "기술");
  const after = {
    ...s,
    town: {
      ...s.town,
      development: { ...s.town.development, completed: [tech.id] },
    },
    decree: { serial: 1, title: "새 주민 구휼", reaction: "" },
  };
  expect(villageCompletions(s, after)).toEqual([
    tech.name + " 연구 완료",
    "새 주민 구휼 발효",
  ]);
  expect(villageCompletions(after, after)).toEqual([]);
});
