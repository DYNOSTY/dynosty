import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Scene } from "@babylonjs/core/scene";
import {
  EXCHANGE_RULES,
  type LaborState,
  laborStock,
} from "@dynosty/game-core";
export function exchangeCartX(s: LaborState) {
  const e = s.exchange;
  if (e.phase === "returning")
    return (
      2 -
      8 *
        Math.min(
          1,
          (s.elapsed - (e.departure ?? s.elapsed)) /
            EXCHANGE_RULES.returnMinutes,
        )
    );
  if (e.phase === "delivering")
    return (
      -6 +
      8 *
        Math.min(
          1,
          (s.elapsed -
            (e.departure ?? s.elapsed) -
            EXCHANGE_RULES.returnMinutes) /
            EXCHANGE_RULES.redeliveryMinutes,
        )
    );
  return 2;
}
export function createExchangeVisual(scene: Scene) {
  const wet = new StandardMaterial("exchange-wet", scene),
    dry = new StandardMaterial("exchange-accepted", scene),
    wood = new StandardMaterial("exchange-wood", scene);
  wet.diffuseColor = new Color3(0.32, 0.4, 0.83);
  dry.diffuseColor = new Color3(0.95, 0.76, 0.27);
  wood.diffuseColor = new Color3(0.44, 0.29, 0.15);
  const cart = CreateBox(
    "exchange-cart",
    { width: 1.2, height: 0.25, depth: 0.85 },
    scene,
  );
  cart.position.set(2, 0.42, 2.3);
  cart.material = wood;
  const cargo = CreateBox(
    "exchange-cargo",
    { width: 0.9, height: 0.45, depth: 0.65 },
    scene,
  );
  cargo.parent = cart;
  cargo.position.y = 0.32;
  cargo.material = wet;
  const table = CreateBox(
    "exchange-inspection-table",
    { width: 1.4, height: 0.6, depth: 0.75 },
    scene,
  );
  table.position.set(3.4, 0.3, -3.7);
  table.material = wood;
  const parcel = CreateBox(
    "exchange-inspection-parcel",
    { width: 0.65, height: 0.35, depth: 0.55 },
    scene,
  );
  parcel.position.set(3.4, 0.78, -3.7);
  parcel.material = wet;
  const parts = [cart, cargo, table, parcel];
  for (const x of [-0.48, 0.48])
    for (const z of [-0.48, 0.48]) {
      const wheel = CreateBox(
        `exchange-wheel-${x}-${z}`,
        { size: 0.24 },
        scene,
      );
      wheel.parent = cart;
      wheel.position.set(x, -0.2, z);
      wheel.material = wood;
      parts.push(wheel);
    }
  for (const p of parts) {
    p.setEnabled(false);
    p.isPickable = false;
  }
  let active = false,
    target = 2;
  return {
    update(s: LaborState | null) {
      const next = s !== null && s.exchange.phase !== "none";
      if (s) target = exchangeCartX(s);
      if (next && !active) cart.position.x = target;
      active = next;
      for (const p of parts) p.setEnabled(active);
      // 일손 모드에서는 원납품과 교환품이 같은 검수대를 사용한다.
      if (s) {
        const stock = laborStock(s);
        table.setEnabled(true);
        parcel.setEnabled(stock.waiting + stock.checked > 0);
        parcel.material = stock.checked > 0 ? dry : wet;
        scene
          .getMeshByName("timber-cargo")
          ?.setEnabled(s.timber.phase === "transport");
      }
      if (!active || !s) return;
      scene.getMeshByName("timber-cart")?.setEnabled(false);
      cart.setEnabled(s.timber.phase !== "completed");
      cargo.setEnabled(["returning", "delivering"].includes(s.exchange.phase));
      cargo.material = s.exchange.phase === "returning" ? wet : dry;
      const atInspection = ["arrived", "inspecting", "checked"].includes(
        s.exchange.phase,
      );
      table.setEnabled(true);
      parcel.setEnabled(atInspection);
      parcel.material = s.exchange.phase === "checked" ? dry : wet;
    },
    animate(seconds: number) {
      const oldX = cart.position.x;
      if (active)
        cart.position.x +=
          (target - cart.position.x) * Math.min(1, Math.max(0, seconds) * 4);
      for (const wheel of parts)
        if (wheel.name.includes("wheel"))
          wheel.rotation.z -= (cart.position.x - oldX) / 0.13;
    },
    dispose() {
      for (const p of parts) p.dispose();
      for (const m of [wet, dry, wood]) m.dispose();
    },
  };
}
