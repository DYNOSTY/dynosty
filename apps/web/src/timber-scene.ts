import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import {
  AMOUNT_SCALE,
  builderWorkPosition,
  homeWorkPosition,
  TIMBER_RULES,
  type TimberState,
  timberCartPosition,
  warehouseDoor,
  workplaceOpen,
} from "@dynosty/game-core";
import { createLoggingVisual } from "./logging-scene.js";
import { terrainElevation } from "./terrain.js";

export const RESTAURANT_CENTER = {
  x: TIMBER_RULES.restaurant.x + 1.2,
  z: TIMBER_RULES.restaurant.z + 1.2,
};

export function createTimberVisual(scene: Scene) {
  const loggingVisual = createLoggingVisual(scene);
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
  base.position.set(TIMBER_RULES.cartStart.x, 0.42, TIMBER_RULES.cartStart.z);
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
  const handles = new TransformNode("timber-cart-handles", scene);
  handles.parent = base;
  handles.position.set(0.6, 0.12, 0);
  for (const z of [-0.3, 0.3]) {
    const shaft = CreateBox(
      `timber-cart-shaft-${z}`,
      { width: 1.8, height: 0.08, depth: 0.08 },
      scene,
    );
    shaft.parent = handles;
    shaft.position.set(0.9, 0, z);
    shaft.material = brown;
    parts.push(shaft);
  }
  const waiting = CreateBox(
    "timber-waiting-stock",
    { width: 0.7, height: 0.5, depth: 0.7 },
    scene,
  );
  waiting.position.set(3.15, 0.25, 3.2);
  waiting.material = brown;
  parts.push(waiting);
  const warehouse = CreateBox(
    "timber-warehouse-platform",
    { width: 3.5, height: 0.12, depth: 2.5 },
    scene,
  );
  warehouse.position.set(TIMBER_RULES.yard.x, 0.06, TIMBER_RULES.yard.z);
  warehouse.material = brown;
  parts.push(warehouse);
  const restaurant = CreateBox(
    "resident-restaurant",
    { width: 4.5, height: 0.18, depth: 4.5 },
    scene,
  );
  restaurant.position.set(RESTAURANT_CENTER.x, 0.15, RESTAURANT_CENTER.z);
  restaurant.material = brown;
  parts.push(restaurant);
  const mealTable = CreateBox(
    "resident-meal-table",
    { width: 3.6, height: 0.6, depth: 0.6 },
    scene,
  );
  mealTable.position.set(RESTAURANT_CENTER.x, 0.55, RESTAURANT_CENTER.z);
  mealTable.material = dry;
  parts.push(mealTable);
  const buildSite = new TransformNode("village-construction", scene);
  const foundation = CreateBox(
    "village-construction-foundation",
    { width: 2.4, height: 0.1, depth: 2 },
    scene,
  );
  foundation.parent = buildSite;
  foundation.position.y = 0.05;
  foundation.material = brown;
  parts.push(foundation);
  for (const x of [-1, 1])
    for (const z of [-0.8, 0.8]) {
      const post = CreateBox(
        `village-construction-post-${x}-${z}`,
        { width: 0.12, height: 1.2, depth: 0.12 },
        scene,
      );
      post.parent = buildSite;
      post.position.set(x, 0.6, z);
      post.material = brown;
      parts.push(post);
    }
  const tool = CreateBox(
    "timber-build-tool",
    { width: 0.08, height: 0.5, depth: 0.08 },
    scene,
  );
  tool.material = brown;
  const toolHead = CreateBox(
    "timber-build-tool-head",
    { width: 0.3, height: 0.14, depth: 0.14 },
    scene,
  );
  toolHead.parent = tool;
  toolHead.position.y = 0.25;
  toolHead.material = dry;
  parts.push(tool, toolHead);
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
  quarantine.position.set(3.15, 0.175, 1.9);
  quarantine.material = wet;
  parts.push(quarantine);
  const accepted = CreateBox(
    "timber-accepted",
    { width: 1, height: 0.35, depth: 0.7 },
    scene,
  );
  accepted.position.set(4.5, 0.175, 3.65);
  accepted.material = dry;
  parts.push(accepted);
  const patch = CreateBox(
    "timber-roof-patch",
    { width: 0.65, height: 0.07, depth: 0.65 },
    scene,
  );
  patch.position.set(-0.24, 1.5, -1.4);
  patch.rotation.x = -0.36;
  patch.material = hole;
  parts.push(patch);
  const shelter = CreateBox(
    "timber-temporary-shelter",
    { width: 1.5, height: 0.15, depth: 1.3 },
    scene,
  );
  shelter.position.set(-4, 1.8, -3);
  shelter.rotation.z = 0.12;
  shelter.material = brown;
  parts.push(shelter);
  for (const x of [-4.6, -3.4]) {
    const post = CreateBox(
      `timber-shelter-post-${x}`,
      { width: 0.12, height: 1.8, depth: 0.12 },
      scene,
    );
    post.position.set(x, 0.9, -3);
    post.material = brown;
    parts.push(post);
  }
  for (const m of parts) {
    m.isPickable = false;
    m.setEnabled(false);
  }
  const homeCargo = Array.from({ length: 3 }, (_, i) => {
    const m = CreateBox(
      `home-building-cargo-${i}`,
      { width: 0.9, height: 0.2, depth: 0.5 },
      scene,
    );
    m.material = brown;
    m.isPickable = false;
    parts.push(m);
    return m;
  });
  const homeTools = Array.from({ length: 3 }, (_, i) => {
    const m = CreateBox(
      `home-building-tool-${i}`,
      { width: 0.5, height: 0.1, depth: 0.15 },
      scene,
    );
    m.material = dry;
    m.isPickable = false;
    parts.push(m);
    return m;
  });
  let active = false,
    hauling = false,
    parking = false,
    handleAngle = 0,
    building = false,
    builderId: string | null = null,
    workTime = 0;
  let target = { ...TIMBER_RULES.cartStart } as { x: number; z: number };
  let transportId: string | null = null;
  return {
    update(s: TimberState | null) {
      loggingVisual.update(s);
      active = s !== null;
      for (const m of parts) m.setEnabled(active);
      buildSite.setEnabled(s !== null && s.construction !== null);
      buildSite.rotation.y = s?.construction?.headingRadians ?? 0;
      for (let i = 0; i < 3; i++) {
        const w = s?.construction?.crew?.[i],
          r = w?.id ? scene.getMeshById(w.id) : null;
        const actor = s?.residents.find((q) => q.id === w?.id);
        const pose = s?.construction
          ? {
              position: s.construction.position,
              headingRadians: s.construction.headingRadians ?? Math.PI,
            }
          : null;
        const workPoint = pose
          ? w?.workSlot === undefined
            ? builderWorkPosition(pose, i, s?.construction?.crew?.length ?? 1)
            : homeWorkPosition(pose, w.workSlot)
          : null;
        const onSite =
          actor?.health === "healthy" &&
          workPoint &&
          Math.hypot(
            actor.position.x - workPoint.x,
            actor.position.z - workPoint.z,
          ) < 0.01;
        const cargo = homeCargo[i],
          hammer = homeTools[i];
        if (cargo) {
          cargo.parent = r;
          cargo.position.set(0, 0.2, 0.7);
          cargo.setEnabled(
            !!r &&
              w?.phase === "deliver" &&
              !!s &&
              workplaceOpen(s.world.minute),
          );
        }
        if (hammer) {
          hammer.parent = r;
          hammer.position.set(0.6, 0.4, 0.3);
          hammer.setEnabled(
            !!r &&
              !!onSite &&
              !!s &&
              workplaceOpen(s.world.minute) &&
              w?.phase === "build" &&
              s?.construction?.finishAt !== null,
          );
        }
      }
      if (s?.construction)
        buildSite.position.set(
          s.construction.position.x,
          terrainElevation(s)(
            s.construction.position.x,
            s.construction.position.z,
          ),
          s.construction.position.z,
        );
      if (!s) return;
      restaurant.setEnabled(
        (s.restaurantBuilt &&
          !s.town.facilities.some((f) => f.kind === "restaurant")) ||
          s.construction?.kind === "restaurant",
      );
      mealTable.setEnabled(
        s.restaurantBuilt &&
          !s.town.facilities.some((f) => f.kind === "restaurant"),
      );
      restaurant.isPickable = s.restaurantBuilt;
      mealTable.isPickable = s.restaurantBuilt;
      hauling = s.phase === "transport" || s.phase === "parking";
      parking = s.phase === "parking";
      handleAngle =
        s.phase === "select" ||
        s.phase === "approaching" ||
        s.phase === "transport"
          ? 0
          : s.phase === "parking"
            ? -0.18 *
              Math.min(
                1,
                (s.elapsed - (s.startedAt ?? s.elapsed)) /
                  TIMBER_RULES.parkMinutes,
              )
            : -0.18;
      transportId = s.transportWorkerId;
      target = timberCartPosition(s);
      if (s.phase !== "transport") base.position.set(target.x, 0.42, target.z);
      if (s.phase === "select" || s.phase === "approaching")
        handles.rotation.z = 0;
      if (!["transport", "parking"].includes(s.phase))
        handles.rotation.z = handleAngle;
      const door = warehouseDoor(s, TIMBER_RULES.cartStart);
      const drop = door ?? TIMBER_RULES.yard;
      warehouse.setEnabled(!door);
      waiting.position.set(drop.x - 1.35, 0.25, drop.z + 0.4);
      quarantine.position.set(drop.x - 1.35, 0.175, drop.z - 0.9);
      accepted.position.set(drop.x, 0.175, drop.z + 0.85);
      base.rotation.y = Math.atan2(
        TIMBER_RULES.cartStart.z - drop.z,
        drop.x - TIMBER_RULES.cartStart.x,
      );
      base.setEnabled(s.contractId !== null);
      cargo.setEnabled(s.stock.cart > 0);
      cargo.scaling.y = Math.max(0.01, s.stock.cart / 20);
      waiting.setEnabled(s.stock.waiting > 0);
      waiting.scaling.y = Math.max(0.01, s.stock.waiting / 20);
      builderId = s.repairWorkerId ?? s.construction?.workerId ?? null;
      patch.setEnabled(s.buildingHealth < 100);
      const constructionActive =
        !!s.construction &&
        workplaceOpen(s.world.minute) &&
        s.construction.finishAt !== null;
      const singleBuilderActive =
        constructionActive &&
        !s.construction?.crew &&
        s.residents.some(
          (r) =>
            r.id === s.construction?.workerId &&
            r.task === `${s.construction?.kind}-construction` &&
            r.health === "healthy",
        );
      building = (s.phase === "building" || constructionActive) && !s.paused;
      tool.setEnabled(s.phase === "building" || singleBuilderActive);
      quarantine.setEnabled(s.stock.quarantine > 0);
      accepted.setEnabled(s.world.resources.RES_WOOD > 0);
      accepted.scaling.x = Math.max(
        0.2,
        Math.min(1.5, s.world.resources.RES_WOOD / AMOUNT_SCALE / 100),
      );
      patch.material = s.buildingHealth === 100 ? dry : hole;
      const delayed = s.elapsed > TIMBER_RULES.deadline && s.settledAt === null;
      shelter.setEnabled(delayed);
      for (const m of parts)
        if (m.name.startsWith("timber-shelter-post-")) m.setEnabled(delayed);
    },
    animate(_delta: number) {
      loggingVisual.animate(_delta);
      if (!active) return;
      workTime += building ? _delta : 0;
      for (const m of homeTools)
        if (m.isEnabled())
          m.rotation.z = building ? Math.sin(workTime * 8) * 0.5 : 0;
      const angleStep = Math.max(0, _delta) * 0.18;
      handles.rotation.z += Math.max(
        -angleStep,
        Math.min(angleStep, handleAngle - handles.rotation.z),
      );
      const builder = builderId ? scene.getMeshById(builderId) : null;
      if (tool.isEnabled() && builder) {
        tool.position.set(
          builder.position.x + 0.5,
          1,
          builder.position.z + 0.3,
        );
        tool.rotation.z = building ? Math.sin(workTime * 8) * 0.5 : 0;
      }
      const dx = target.x - base.position.x,
        dz = target.z - base.position.z,
        distance = Math.hypot(dx, dz),
        step = Math.min(distance, Math.max(0, _delta) * TIMBER_RULES.walkSpeed);
      if (distance > 0) {
        base.position.x += (dx / distance) * step;
        base.position.z += (dz / distance) * step;
      }
      if (!hauling || !transportId) return;
      const resident = scene.getMeshById(transportId);
      // 짐의 이동이 기준이다. 운송 주민은 수레 앞 연결 위치를 따라간다.
      if (resident) {
        resident.position.set(
          base.position.x + Math.cos(base.rotation.y) * TIMBER_RULES.pullOffset,
          0.5,
          base.position.z - Math.sin(base.rotation.y) * TIMBER_RULES.pullOffset,
        );
        resident.rotation.y = Math.PI / 2 + base.rotation.y;
        if (parking) resident.position.y = 0.5;
      }
    },
    dispose() {
      loggingVisual.dispose();
      handles.dispose();
      buildSite.dispose();
      for (const m of parts) m.dispose();
      for (const m of [brown, wet, dry, hole]) m.dispose();
    },
  };
}
