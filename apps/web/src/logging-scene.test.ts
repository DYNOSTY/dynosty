import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import {
  advanceTimber,
  BOKHOL_MINERALS,
  commandTimber,
  createPlayState,
  createTimberState,
  LOGGING_RULES,
  loggingSiteRules,
  timberScene,
} from "@dynosty/game-core";
import { expect, it } from "vitest";
import { createLoggingVisual } from "./logging-scene.js";
import { createSceneEntities } from "./scene-entities.js";
import { terrainElevation } from "./terrain.js";

function fundedTown() {
  const world = createPlayState();
  return createTimberState({
    ...world,
    resources: { ...world.resources, RES_WOOD: 4500000 },
  });
}
it("숲·작업장·적재·수레가 실제 상태를 표시하고 운반 공룡과 수레가 같은 방향을 향한다", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    entities = createSceneEntities(scene),
    visual = createLoggingVisual(scene);
  let s = advanceTimber(fundedTown(), 120);
  const update = () => {
    entities.update(timberScene(s));
    visual.update(s);
    for (let i = 0; i < 60; i++) {
      entities.animate(1 / 60);
      visual.animate(1 / 60);
    }
  };
  try {
    update();
    expect(scene.getTransformNodeByName("logging-workshop")?.isEnabled()).toBe(
      false,
    );
    s = commandTimber(s, { type: "build-logging" }, "build");
    s = advanceTimber(s, 50);
    s = commandTimber(s, { type: "build-storage" }, "store");
    s = advanceTimber(s, 50);
    s = commandTimber(s, { type: "set-logging-workers", count: 2 }, "staff");
    update();
    expect(scene.getTransformNodeByName("logging-workshop")?.isEnabled()).toBe(
      true,
    );
    const phases = new Set<string>();
    for (let i = 0; i < 100; i++) {
      s = advanceTimber(s, 1);
      update();
      const h = s.logging.haul;
      if (!h) continue;
      phases.add(h.phase);
      if (["outbound", "inbound"].includes(h.phase)) {
        const cart = scene.getTransformNodeByName("logging-cart"),
          resident = scene.getMeshById(h.workerId ?? "");
        if (!cart || !resident) throw Error("운반 모델 없음");
        expect(resident.position.x).toBeCloseTo(cart.position.x);
        expect(Math.abs(resident.position.z - cart.position.z)).toBeCloseTo(
          LOGGING_RULES.pullOffset,
        );
        expect(resident.rotation.y).toBe(h.phase === "outbound" ? 0 : Math.PI);
      }
      expect(scene.getMeshByName("logging-cart-cargo")?.isEnabled()).toBe(
        h.cargo > 0,
      );
    }
    expect(phases.has("inbound")).toBe(true);
    expect(phases.has("park")).toBe(true);
    expect(phases.has("release")).toBe(true);
    expect(scene.getMeshByName("logging-stored-wood")?.isEnabled()).toBe(true);
  } finally {
    visual.dispose();
    entities.dispose();
    expect(scene.getTransformNodeByName("logging-cart")).toBeNull();
    scene.dispose();
    engine.dispose();
  }
});
it("광산 함지에는 입구와 광맥을 표시하고 미건설 작업장은 숨긴다", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    visual = createLoggingVisual(scene);
  try {
    const s = createTimberState();
    visual.update(s);
    for (const m of BOKHOL_MINERALS) {
      const deposit = scene.getTransformNodeByName(`mineral-deposit:${m.id}`),
        workshop = scene.getTransformNodeByName(`logging-workshop:${m.id}`);
      if (!deposit || !workshop) throw Error("광산 표시 없음");
      expect(deposit.isEnabled()).toBe(true);
      expect(workshop.isEnabled()).toBe(false);
      expect(deposit.position.y).toBeCloseTo(terrainElevation(s)(m.x, m.z));
      if (m.kind !== "stone")
        expect(scene.getMeshByName(`mine-dark-mouth:${m.id}`)).not.toBeNull();
    }
    const built = {
      ...s,
      mineralSites: s.mineralSites.map((l) =>
        l.siteId === "coal-west"
          ? { ...l, built: true, storageBuilt: true }
          : l,
      ),
    };
    visual.update(built);
    const mine = scene.getTransformNodeByName("logging-workshop:coal-west");
    const location = loggingSiteRules("coal-west").workshop;
    expect(mine?.isEnabled()).toBe(true);
    expect(mine?.position.y).toBeCloseTo(
      terrainElevation(built)(location.x, location.z),
    );
  } finally {
    visual.dispose();
    scene.dispose();
    engine.dispose();
  }
});
it("숲 나무와 그루터기는 지형 높이를 따르고 공유 메시를 사용한다", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    visual = createLoggingVisual(scene);
  try {
    const s = createTimberState();
    visual.update(s);
    const stump = scene.getMeshByName(
      "forest-tree:TREE_STUMP",
    ) as import("@babylonjs/core/Meshes/mesh").Mesh;
    expect(stump.thinInstanceCount).toBe(0);
    const cleared = { ...s, logging: { ...s.logging, remaining: 0 } };
    visual.update(cleared);
    expect(stump.thinInstanceCount).toBe(32);
    expect(
      stump.thinInstanceGetWorldMatrices().every((matrix) => {
        const p = matrix.getTranslation();
        return Math.abs(p.y - terrainElevation(cleared)(p.x, p.z)) < 0.0001;
      }),
    ).toBe(true);
    expect(terrainElevation(cleared)(-40, -8)).toBe(0);
  } finally {
    visual.dispose();
    scene.dispose();
    engine.dispose();
  }
});
