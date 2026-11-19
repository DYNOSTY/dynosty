import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import {
  BOKHOL_WATERS,
  type TimberState,
  townShiftOpen,
} from "@dynosty/game-core";
import { facilityModel } from "./facility-model.js";
import { buildModel, type ModelVisual } from "./model-assets.js";
import { terrainElevation } from "./terrain.js";
export function createTownVisual(scene: Scene) {
  const props = new Map<string, Mesh>();
  const mat = new StandardMaterial("town-placeholder-material", scene);
  mat.diffuseColor = new Color3(0.6, 0.4, 0.2);
  const water = new StandardMaterial("town-water-material", scene);
  water.diffuseColor = new Color3(0.15, 0.46, 0.6);
  water.alpha = 0.9;
  const ice = new StandardMaterial("town-ice-material", scene);
  ice.diffuseColor = new Color3(0.65, 0.82, 0.85);
  const dark = new StandardMaterial("town-ice-hole-material", scene);
  dark.diffuseColor = new Color3(0.05, 0.18, 0.24);
  const ponds = BOKHOL_WATERS.map((w) => {
    const pond = CreateCylinder(
      `water:${w.id}`,
      { diameter: w.radius * 2, height: 0.12, tessellation: 48 },
      scene,
    );
    pond.position.set(w.x, 0.1, w.z);
    pond.isPickable = false;
    const holes = [-2, 2].map((x) => {
      const m = CreateCylinder(
        `ice-hole:${w.id}:${x}`,
        { diameter: 1, height: 0.02, tessellation: 16 },
        scene,
      );
      m.position.set(w.x + x, 0.18, w.z);
      m.material = dark;
      m.isPickable = false;
      return m;
    });
    const fish = [-3, 0, 3].map((x) => {
      const m = CreateBox(
        `fish-shoal:${w.id}:${x}`,
        { width: 0.8, height: 0.12, depth: 0.3 },
        scene,
      );
      m.position.set(w.x + x, 0.2, w.z + 2);
      m.material = dark;
      m.isPickable = false;
      return m;
    });
    return { pond, holes, fish };
  });
  const objects = new Map<
    string,
    { root: Mesh; visual: ModelVisual | null; level: number }
  >();
  return {
    update(s: TimberState | null) {
      const wanted = new Map<string, "cargo" | "tool">();
      if (s) {
        for (const o of s.town.orders.filter((o) => townShiftOpen(s, o.id)))
          for (const id of o.crew) {
            if (o.stage === "deliver") wanted.set(id, "cargo");
            else if (o.stage === "build") wanted.set(id, "tool");
          }
        for (const f of s.town.facilities)
          if (f.haul?.stage === "store") wanted.set(f.haul.worker, "cargo");
      }
      for (const [id, mesh] of props)
        if (!wanted.has(id)) {
          mesh.dispose();
          props.delete(id);
        }
      for (const [id, kind] of wanted) {
        const actor = scene.getMeshById(id);
        if (!actor) continue;
        let mesh = props.get(id);
        if (!mesh) {
          mesh = CreateBox(`town-job:${id}`, { size: 1 }, scene);
          mesh.material = mat;
          props.set(id, mesh);
        }
        mesh.parent = actor;
        mesh.scaling.set(
          kind === "cargo" ? 0.7 : 0.12,
          kind === "cargo" ? 0.3 : 0.65,
          0.25,
        );
        mesh.position.set(0.5, 0.35, 0.4);
        mesh.setEnabled(true);
      }
      for (const p of ponds) {
        p.pond.setEnabled(!!s);
        p.pond.material = s?.town.cold ? ice : water;
        for (const h of p.holes) h.setEnabled(!!s?.town.cold);
        for (const f of p.fish) f.setEnabled(!!s && !s.town.cold);
      }
      const items = s ? [...s.town.facilities, ...s.town.orders] : [];
      for (const [id, o] of objects)
        if (!items.some((f) => f.id === id)) {
          o.visual?.dispose();
          o.root.dispose();
          objects.delete(id);
        }
      for (const f of items) {
        let o = objects.get(f.id);
        const pending = !!s?.town.orders.some((q) => q.id === f.id);
        if (!o) {
          const root = CreateBox(`town:${f.id}`, { size: 1 }, scene);
          root.material = mat;
          root.isVisible = false;
          o = { root, visual: null, level: 0 };
          objects.set(f.id, o);
        }
        const level = "level" in f ? f.level : 1;
        if (!pending && (!o.visual || o.level !== level)) {
          o.visual?.dispose();
          o.visual = buildModel(
            scene,
            o.root,
            mat,
            facilityModel(f.kind, level),
          );
          o.level = level;
        }
        if (pending && !o.visual) {
          o.root.isVisible = true;
          o.root.scaling.set(4, 0.1, 4);
        } else {
          o.root.isVisible = false;
          o.root.scaling.setAll(1);
        }
        o.root.position.set(
          f.position.x,
          terrainElevation(s)(f.position.x, f.position.z) +
            (pending ? 0.05 : 0.75),
          f.position.z,
        );
        o.root.rotation.y = f.headingRadians;
      }
    },
    dispose() {
      for (const mesh of props.values()) mesh.dispose();
      for (const o of objects.values()) {
        o.visual?.dispose();
        o.root.dispose();
      }
      for (const p of ponds) {
        p.pond.dispose();
        for (const m of [...p.holes, ...p.fish]) m.dispose();
      }
      for (const m of [mat, water, ice, dark]) m.dispose();
    },
  };
}
