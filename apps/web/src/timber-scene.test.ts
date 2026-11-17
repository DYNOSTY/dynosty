import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import {
  commandTimber,
  createTimberState,
  TIMBER_RULES,
  type TimberState,
  timberScene,
} from "@dynosty/game-core";
import { expect, it } from "vitest";
import { createSceneEntities } from "./scene-entities.js";
import { createTimberVisual } from "./timber-scene.js";

it("수레가 야적장에 도착하며 주민은 짐을 기준으로 같은 방향에서 끌고 하역 후 비워진다", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    entities = createSceneEntities(scene),
    visual = createTimberVisual(scene);
  let state: TimberState = createTimberState(),
    id = 0;
  const command = (c: Parameters<typeof commandTimber>[1]) => {
    state = commandTimber(state, c, String(++id));
    entities.update(timberScene(state));
    visual.update(state);
  };
  const frames = (count: number) => {
    for (let i = 0; i < count; i++) {
      entities.animate(1 / 60);
      visual.animate(1 / 60);
    }
  };
  try {
    entities.update(timberScene(state));
    visual.update(state);
    command({ type: "choose", offer: "B" });
    command({ type: "contract" });
    command({ type: "next" });
    command({ type: "advance", minutes: 10 });
    frames(180);
    const cart = scene.getMeshByName("timber-cart"),
      resident = state.transportWorkerId
        ? scene.getMeshById(state.transportWorkerId)
        : null;
    if (!cart || !resident) throw Error("운송 표시가 없습니다.");
    const previous = cart.position.x;
    resident.position.set(-8, 0.5, -8);
    visual.animate(0);
    expect(cart.position.x).toBe(previous);
    expect(resident.position.x).toBeCloseTo(
      cart.position.x + TIMBER_RULES.pullOffset,
    );
    expect(resident.position.z).toBeCloseTo(cart.position.z);
    expect(resident.rotation.y).toBe(Math.PI / 2);
    expect(cart.rotation.y).toBe(0);
    command({ type: "next" });
    frames(400);
    expect(state.phase).toBe("parking");
    expect(resident.rotation.y).toBe(Math.PI / 2);
    command({ type: "next" });
    frames(120);
    expect(state.phase).toBe("releasing");
    expect(
      scene.getTransformNodeByName("timber-cart-handles")?.rotation.z,
    ).toBeCloseTo(-0.18);
    const parked = cart.position.clone();
    command({ type: "next" });
    frames(120);
    expect(state.phase).toBe("unloading");
    expect(cart.position.equals(parked)).toBe(true);
    expect(Math.abs(resident.position.z - cart.position.z)).toBeGreaterThan(1);
    expect(cart.position.x).toBeCloseTo(TIMBER_RULES.yard.x);
    expect(cart.position.z).toBeCloseTo(TIMBER_RULES.yard.z);
    const yard = scene.getMeshByName("timber-warehouse-platform");
    expect(yard?.position.x).toBeCloseTo(cart.position.x);
    expect(yard?.position.z).toBeCloseTo(cart.position.z);
    command({ type: "next" });
    expect(scene.getMeshByName("timber-cargo")?.isEnabled()).toBe(false);
    expect(scene.getMeshByName("timber-waiting-stock")?.isEnabled()).toBe(true);
    while (state.due !== null) command({ type: "next" });
    expect(scene.getMeshByName("timber-cart")?.isEnabled()).toBe(true);
    expect(scene.getMeshByName("timber-roof-patch")?.isEnabled()).toBe(false);
    expect(scene.getMeshByName("timber-build-tool")?.isEnabled()).toBe(false);
    visual.update(null);
    expect(scene.getMeshByName("timber-cart")?.isEnabled()).toBe(false);
    entities.dispose();
    visual.dispose();
    expect(scene.meshes).toHaveLength(0);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
