import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import {
  BOKHOL_PRODUCTION_SITES,
  LOGGING_RULES,
  loggingSite,
  loggingSiteRules,
  type ProductionSiteId,
  productionSiteDefinition,
  type TimberState,
} from "@dynosty/game-core";
import { terrainElevation } from "./terrain.js";

export function createLoggingVisual(scene: Scene) {
  const visuals = BOKHOL_PRODUCTION_SITES.map((f) => ({
    id: f.id,
    visual: createLoggingSiteVisual(scene, f.id),
  }));
  return {
    update(s: TimberState | null) {
      for (const { visual } of visuals) visual.update(s);
    },
    animate(delta: number) {
      for (const { visual } of visuals) visual.animate(delta);
    },
    dispose() {
      for (const { visual } of visuals) visual.dispose();
    },
  };
}
function createLoggingSiteVisual(scene: Scene, siteId: ProductionSiteId) {
  const rules = loggingSiteRules(siteId);
  const patch = productionSiteDefinition(siteId);
  const isForest = patch.kind === "forest";
  const unique = (name: string) =>
    siteId === "west" ? name : `${name}:${siteId}`;
  const material = (name: string, color: Color3) => {
    const m = new StandardMaterial(unique(`logging-${name}`), scene);
    m.diffuseColor = color;
    m.specularColor = Color3.Black();
    return m;
  };
  const wood = material("wood", new Color3(0.43, 0.27, 0.12));
  const tile = material("tile", new Color3(0.23, 0.29, 0.3));
  const leaves = material("leaves", new Color3(0.12, 0.32, 0.18));
  const logs = material(
    "logs",
    isForest
      ? new Color3(0.7, 0.49, 0.23)
      : patch.kind === "coal"
        ? new Color3(0.12, 0.14, 0.16)
        : patch.kind === "iron"
          ? new Color3(0.5, 0.25, 0.15)
          : new Color3(0.55, 0.56, 0.52),
  );
  const box = (
    name: string,
    size: [number, number, number],
    position: [number, number, number],
    material = wood,
    parent?: TransformNode,
  ) => {
    const mesh = CreateBox(
      unique(name),
      { width: size[0], height: size[1], depth: size[2] },
      scene,
    );
    mesh.position.set(position[0] ?? 0, position[1] ?? 0, position[2] ?? 0);
    mesh.material = material;
    if (parent) mesh.parent = parent;
    return mesh;
  };
  const workshop = new TransformNode(unique("logging-workshop"), scene);
  workshop.position.set(rules.workshopPlot.x, 0, rules.workshopPlot.z);
  box("logging-workshop-floor", [8.4, 0.2, 6], [0, 0.1, 0], wood, workshop);
  for (const x of [-3.8, 3.8])
    for (const z of [-2.8, 2.8])
      box("logging-post", [0.17, 2.2, 0.17], [x, 1.1, z], wood, workshop);
  for (const x of [-2.1, 2.1]) {
    const roof = box(
      "logging-tiled-roof",
      [4.8, 0.15, 7],
      [x, 2.4, 0],
      tile,
      workshop,
    );
    roof.rotation.z = x > 0 ? -0.25 : 0.25;
  }
  const storage = new TransformNode(unique("logging-storage"), scene);
  storage.position.set(rules.storagePlot.x, 0, rules.storagePlot.z);
  box("logging-storage-floor", [3.5, 0.15, 4], [0, 0.08, 0], wood, storage);
  for (const x of [-1.5, 1.5])
    box("logging-storage-post", [0.15, 2, 0.15], [x, 1, 1.7], wood, storage);
  box(
    "logging-storage-roof",
    [4, 0.17, 4.5],
    [0, 2.1, 0],
    tile,
    storage,
  ).rotation.x = 0.12;
  const delivered = box(
    "logging-stored-wood",
    [2.3, 0.8, 2.5],
    [0, 0.5, 0],
    logs,
    storage,
  );
  const buffer = box(
    "logging-cut-wood",
    [2.6, 0.8, 1.4],
    [rules.workshop.x, 0.5, rules.workshop.z + 3],
    logs,
  );
  const forest = Array.from({ length: isForest ? 32 : 0 }, (_, i) => {
    const tree = new TransformNode(unique(`logging-tree-${i}`), scene);
    tree.position.set(
      patch.x - 7 + (i % 8) * 2,
      0,
      patch.z - 9 + Math.floor(i / 8) * 6,
    );
    box("logging-trunk", [0.35, 1.4, 0.35], [0, 0.7, 0], wood, tree);
    const crown = CreateCylinder(
      unique("logging-crown"),
      { height: 3, diameterBottom: 2, diameterTop: 0, tessellation: 6 },
      scene,
    );
    crown.parent = tree;
    crown.position.y = 2.5;
    crown.material = leaves;
    return tree;
  });
  const deposit = new TransformNode(unique("mineral-deposit"), scene);
  deposit.position.set(patch.x, 0, patch.z);
  if (!isForest) {
    for (let i = 0; i < 8; i++) {
      const rock = box(
        "deposit-rock",
        [2.5 + (i % 3), 1.6, 2.1],
        [Math.cos(i) * 7, 0.4, Math.sin(i) * 7],
        logs,
        deposit,
      );
      rock.rotation.y = i * 0.8;
      rock.rotation.z = i % 2 ? 0.15 : -0.15;
    }
    if (patch.kind !== "stone") {
      box("mine-dark-mouth", [3.8, 2.5, 0.3], [8, 1.1, 0], tile, deposit);
      for (const x of [6, 10])
        box("mine-entry-post", [0.35, 3, 0.4], [x, 1.5, 0], wood, deposit);
      box("mine-entry-crossbar", [4.8, 0.4, 0.5], [8, 3, 0], wood, deposit);
    }
  }
  const cart = new TransformNode(unique("logging-cart"), scene);
  const cartBase = box(
    "logging-cart-base",
    [1.5, 0.25, 1.7],
    [0, 0.45, 0],
    wood,
    cart,
  );
  for (const x of [-0.85, 0.85]) {
    const wheel = CreateCylinder(
      unique("logging-cart-wheel"),
      { height: 0.18, diameter: 0.8, tessellation: 10 },
      scene,
    );
    wheel.parent = cart;
    wheel.position.set(x, 0.4, 0);
    wheel.rotation.z = Math.PI / 2;
    wheel.material = tile;
  }
  const handles = new TransformNode(unique("logging-handles"), scene);
  handles.parent = cart;
  handles.position.y = 0.5;
  for (const x of [-0.58, 0.58])
    box("logging-cart-shaft", [0.12, 0.12, 2.5], [x, 0, 1.6], wood, handles);
  const cargo = box(
    "logging-cart-cargo",
    [1.25, 0.6, 1.4],
    [0, 0.85, 0],
    logs,
    cart,
  );
  let state: TimberState | null = null,
    initialized = false;
  return {
    update(s: TimberState | null) {
      state = s;
      const site = s ? loggingSite(s, siteId) : null;
      const height = terrainElevation(s);
      deposit.setEnabled(!!s && !isForest);
      deposit.position.y = height(patch.x, patch.z);
      for (const node of [workshop, storage])
        node.position.y = height(node.position.x, node.position.z);
      buffer.position.y = 0.5 + height(buffer.position.x, buffer.position.z);
      workshop.setEnabled(!!site?.built);
      storage.setEnabled(!!site?.storageBuilt);
      forest.forEach((t, i) => {
        t.setEnabled(
          !!site && i * (LOGGING_RULES.forest / forest.length) < site.remaining,
        );
        t.position.y = height(t.position.x, t.position.z);
      });
      buffer.setEnabled(!!site && site.buffer > 0);
      buffer.scaling.y = Math.max(0.1, (site?.buffer ?? 0) / 20);
      delivered.setEnabled(!!site && site.delivered > 0);
      delivered.scaling.y = Math.max(
        0.1,
        Math.min(1, (s?.world.resources[patch.resource] ?? 0) / 1_000_000),
      );
      cart.setEnabled(!!site?.storageBuilt);
      cargo.setEnabled((site?.haul?.cargo ?? 0) > 0);
      if (!initialized || !site?.haul) {
        cart.position.set(rules.pickup.x, 0, rules.pickup.z);
        initialized = !!s;
      }
    },
    animate(delta: number) {
      if (!state) return;
      const height = terrainElevation(state);
      const h = loggingSite(state, siteId).haul;
      const target = h?.cart ?? rules.pickup;
      const dx = target.x - cart.position.x,
        dz = target.z - cart.position.z;
      const length = Math.hypot(dx, dz),
        step = Math.min(length, delta * LOGGING_RULES.speed);
      if (length > 0) {
        cart.position.x += (dx / length) * step;
        cart.position.z += (dz / length) * step;
      }
      cart.position.y = height(cart.position.x, cart.position.z);
      const returning =
        !!h && ["turn", "inbound", "park-home", "release"].includes(h.phase);
      const heading = returning ? Math.PI : 0;
      cart.rotation.y += Math.max(
        -delta * 2,
        Math.min(delta * 2, heading - cart.rotation.y),
      );
      const pulling =
        !!h && ["outbound", "inbound"].includes(h.phase) && !h.relief;
      const desired = pulling ? 0 : 0.18;
      handles.rotation.x += Math.max(
        -delta * 0.18,
        Math.min(delta * 0.18, desired - handles.rotation.x),
      );
      if (
        h?.workerId &&
        (pulling || ["park", "park-home"].includes(h.phase)) &&
        !h.relief
      ) {
        const resident = scene.getMeshById(h.workerId);
        if (resident) {
          resident.position.set(
            cart.position.x,
            0.5 +
              height(
                cart.position.x,
                cart.position.z +
                  (returning ? -1 : 1) * LOGGING_RULES.pullOffset,
              ),
            cart.position.z + (returning ? -1 : 1) * LOGGING_RULES.pullOffset,
          );
          resident.rotation.y = returning ? Math.PI : 0;
        }
      }
      cartBase.isPickable = false;
    },
    dispose() {
      for (const node of [workshop, storage, cart, deposit, ...forest])
        node.dispose();
      buffer.dispose();
      for (const m of [wood, tile, leaves, logs]) m?.dispose();
    },
  };
}
