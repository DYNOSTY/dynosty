import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { TIMBER_RULES, type TimberState } from "@dynosty/game-core";
export function createTimberVisual(scene: Scene) {
  const brown = new StandardMaterial("timber-cart-material", scene);
  brown.diffuseColor = new Color3(0.45, 0.27, 0.12);
  brown.specularColor = Color3.Black();
  const wet = new StandardMaterial("timber-wet-material", scene);
  wet.diffuseColor = new Color3(0.29, 0.34, 0.65);
  const dry = new StandardMaterial("timber-dry-material", scene);
  dry.diffuseColor = new Color3(0.91, 0.72, 0.32);
  const hole = new StandardMaterial("timber-hole-material", scene);
  hole.diffuseColor = new Color3(0.05, 0.08, 0.09);
  for (const m of [wet, dry, hole]) m.specularColor = Color3.Black();
  const base = CreateBox(
    "timber-cart",
    { width: 1.2, height: 0.25, depth: 0.85 },
    scene,
  );
  base.position.set(-6, 0.42, 1.5);
  base.material = brown;
  const cargo = CreateBox(
    "timber-cargo",
    { width: 1.05, height: 0.4, depth: 0.7 },
    scene,
  );
  cargo.parent = base;
  cargo.position.y = 0.3;
  cargo.material = dry;
  const parts = [base, cargo];
  for (const x of [-0.48, 0.48])
    for (const z of [-0.48, 0.48]) {
      const wheel = CreateBox(`timber-wheel-${x}-${z}`, { size: 0.26 }, scene);
      wheel.parent = base;
      wheel.position.set(x, -0.2, z);
      wheel.material = hole;
      parts.push(wheel);
    }
  const quarantine = CreateBox(
    "timber-quarantine",
    { width: 0.7, height: 0.35, depth: 0.6 },
    scene,
  );
  quarantine.position.set(2.7, 0.175, 0.5);
  quarantine.material = wet;
  parts.push(quarantine);
  const accepted = CreateBox(
    "timber-accepted",
    { width: 1, height: 0.35, depth: 0.7 },
    scene,
  );
  accepted.position.set(1.8, 0.175, -0.6);
  accepted.material = dry;
  parts.push(accepted);
  const patch = CreateBox(
    "timber-roof-patch",
    { width: 0.65, height: 0.07, depth: 0.65 },
    scene,
  );
  patch.position.set(-0.24, 1.86, -1.25);
  patch.rotation.x = -Math.PI / 3;
  patch.material = hole;
  parts.push(patch);
  const shelter = CreateBox(
    "timber-temporary-shelter",
    { width: 1.5, height: 0.15, depth: 1.3 },
    scene,
  );
  shelter.position.set(-2, 0.75, 1);
  shelter.rotation.z = 0.12;
  shelter.material = brown;
  parts.push(shelter);
  for (const m of parts) {
    m.isPickable = false;
    m.setEnabled(false);
  }
  let target = -6,
    active = false;
  return {
    update(s: TimberState | null) {
      active = s !== null;
      for (const m of parts) m.setEnabled(active);
      if (!s) return;
      const travel = s.offer ? TIMBER_RULES.offers[s.offer].travel : 1;
      const progress =
        s.departure === null
          ? 0
          : Math.min(1, (s.elapsed - s.departure) / travel);
      target = -6 + progress * 8;
      base.setEnabled(s.departure !== null && s.phase !== "completed");
      quarantine.setEnabled(s.stock.quarantine > 0);
      accepted.setEnabled(s.stock.available + s.stock.allocated > 0);
      accepted.scaling.x = Math.max(
        0.2,
        (s.stock.available + s.stock.allocated) / 20,
      );
      patch.material = s.phase === "completed" ? dry : hole;
      shelter.setEnabled(s.elapsed > 720 && s.phase !== "completed");
    },
    animate(delta: number) {
      if (active)
        base.position.x += (target - base.position.x) * Math.min(1, delta * 4);
    },
    dispose() {
      for (const m of parts) m.dispose();
      for (const m of [brown, wet, dry, hole]) m.dispose();
    },
  };
}
