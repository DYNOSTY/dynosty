import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import type { Scene } from "@babylonjs/core/scene";
import {
  type LaborState,
  queueRemaining,
  type SceneSnapshot,
} from "@dynosty/game-core";
import { createExchangeVisual, exchangeCartX } from "./exchange-scene.js";
import { createSceneEntities } from "./scene-entities.js";
import { SITE_POINTS } from "./site-targets.js";

/** 일손 이동은 시각 보간이며 게임의 작업 시간이나 배치를 변경하지 않는다. */
export function createLaborVisual(scene: Scene) {
  const workers = createSceneEntities(scene);
  const exchangeVisual = createExchangeVisual(scene);
  const material = new StandardMaterial("labor-station-material", scene);
  material.diffuseColor = new Color3(0.36, 0.62, 0.64);
  const waiting = new StandardMaterial("labor-queue-material", scene);
  waiting.diffuseColor = new Color3(0.96, 0.63, 0.29);
  const bench = CreateBox(
    "labor-prep-station",
    { width: 2.4, height: 0.65, depth: 0.7 },
    scene,
  );
  bench.position.set(3.8, 0.325, 0.2);
  bench.material = material;
  const queue = Array.from({ length: 3 }, (_, i) => {
    const marker = CreateCylinder(
      `labor-queue-${i}`,
      { height: 0.75, diameter: 0.4, tessellation: 8 },
      scene,
    );
    marker.position.set(6.5, 0.375, -2.5 + i * 0.85);
    marker.material = waiting;
    return marker;
  });
  const props = [bench, ...queue];
  for (const p of props) {
    p.setEnabled(false);
    p.isPickable = false;
  }
  const quarantine = scene.getMeshByName("timber-quarantine");
  let shown = false;
  let state: LaborState | null = null;
  let settled = false;
  const positions = new Map<
    string,
    { x: number; z: number; heading: number }
  >();
  function target(s: LaborState, i: number) {
    const job = s.crew[i]?.job;
    if (job === "repair") {
      const slot = s.crew
        .filter((c) => c.job === "repair")
        .findIndex((c) => c.id === s.crew[i]?.id);
      return { x: slot === 0 ? -1.9 : 1.4, z: -2.5 };
    }
    if (job === "prep")
      return { x: 3.0 + (i % 2) * 2.2, z: -1.8 + Math.floor(i / 2) * 2.8 };
    if (job === "exchange") {
      if (["reserved", "returning", "delivering"].includes(s.exchange.phase))
        return { x: exchangeCartX(s) + 0.9, z: 3.2 };
      return { x: 2.1, z: -3.7 };
    }
    if (job === "carrier") {
      const t = s.timber;
      const progress =
        t.phase === "transport" && t.due !== null
          ? Math.max(0, 1 - (t.due - t.elapsed) / (t.offer === "A" ? 360 : 600))
          : t.phase === "contracted"
            ? 0
            : 1;
      return { x: -6 + progress * 8, z: 2.3 };
    }
    return { x: -4.5 + (i % 2) * 2.0, z: -2.0 + Math.floor(i / 2) * 2.8 };
  }
  function animate(seconds: number) {
    exchangeVisual.animate(seconds);
    if (!state) return;
    if (settled) {
      workers.animate(seconds);
      return;
    }
    settled = true;
    const s = state;
    const snapshot: SceneSnapshot = {
      schemaVersion: 1,
      entities: s.crew.map((c, i) => {
        const goal = target(s, i);
        const p = positions.get(c.id) ?? { ...goal, heading: Math.PI };
        const dx = goal.x - p.x,
          dz = goal.z - p.z,
          distance = Math.hypot(dx, dz);
        const step = Math.min(
          distance,
          Math.max(0, Math.min(seconds, 0.1)) * 2.5,
        );
        const moving = distance - step > 0.01;
        if (distance > 0.01) p.heading = Math.atan2(dx, dz);
        if (moving) {
          p.x += (dx / distance) * step;
          p.z += (dz / distance) * step;
          settled = false;
        } else {
          p.x = goal.x;
          p.z = goal.z;
        }
        positions.set(c.id, p);
        return {
          id: c.id,
          kind: "resident",
          position: { x: p.x, y: 0, z: p.z },
          headingRadians: p.heading,
          visible: true,
          highlighted: false,
          motion: moving ? "walking" : "idle",
        };
      }),
    };
    workers.update(snapshot);
    workers.animate(seconds);
  }
  return {
    setModels(assets: Parameters<typeof workers.setModels>[0]) {
      workers.setModels(assets);
      // 에셋이 늦게 도착해도 정지한 주민의 대체 상자를 실제 모델로 교체한다.
      settled = false;
    },
    update(next: LaborState | null) {
      state = next;
      if (shown !== (next !== null)) {
        if (next) quarantine?.position.set(...SITE_POINTS["site-quarantine"]);
        else quarantine?.position.set(2.7, 0.175, 0.5);
        shown = next !== null;
      }
      exchangeVisual.update(next);
      settled = false;
      bench.setEnabled(next !== null);
      for (const [i, p] of queue.entries())
        p.setEnabled(
          next !== null && next.elapsed >= 480 && i < queueRemaining(next),
        );
      if (!next) {
        positions.clear();
        workers.update({ schemaVersion: 1, entities: [] });
      } else animate(0);
    },
    animate,
    dispose() {
      workers.dispose();
      exchangeVisual.dispose();
      for (const p of props) p.dispose();
      material.dispose();
      waiting.dispose();
    },
  };
}
