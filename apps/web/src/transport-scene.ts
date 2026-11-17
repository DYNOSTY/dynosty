import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type { LaborState } from "@dynosty/game-core";
import { transportView } from "./site-life.js";
/** 안내선과 결속띠만 소유한다. 수레·적재·검수대 수량은 기존 표시를 따른다. */
export function createTransportDecor(scene: Scene) {
  const material = new StandardMaterial("transport-route-material", scene);
  material.diffuseColor = new Color3(0.48, 0.52, 0.38);
  const straps = new StandardMaterial("transport-straps-material", scene);
  straps.diffuseColor = new Color3(0.18, 0.16, 0.13);
  const route = Array.from({ length: 9 }, (_, i) => {
    const m = CreateBox(
      `transport-route-${i}`,
      { width: 0.45, height: 0.02, depth: 0.12 },
      scene,
    );
    m.position.set(-6 + i, 0.025, 1.5);
    m.material = material;
    m.isPickable = false;
    m.setEnabled(false);
    return m;
  });
  const cargoParts = ["timber-cargo", "exchange-cargo"].flatMap((name) => {
    const parent = scene.getMeshByName(name);
    if (!parent) return [];
    return [-0.28, 0.28].map((x) => {
      const m = CreateBox(
        `${name}-tie-${x}`,
        { width: 0.045, height: 0.02, depth: 0.68 },
        scene,
      );
      m.parent = parent;
      m.position.set(x, 0.23, 0);
      m.material = straps;
      m.isPickable = false;
      return m;
    });
  });
  return {
    update(s: LaborState | null) {
      const view = s ? transportView(s) : null;
      for (const m of route) {
        m.setEnabled(s !== null);
        m.position.z = s?.exchange.phase !== "none" ? 2.3 : 1.5;
      }
      material.diffuseColor.set(
        view?.moving ? 0.85 : 0.48,
        view?.moving ? 0.76 : 0.52,
        0.38,
      );
      for (const m of cargoParts) m.setEnabled(s !== null);
    },
    dispose() {
      for (const m of [...route, ...cargoParts]) m.dispose();
      material.dispose();
      straps.dispose();
    },
  };
}
