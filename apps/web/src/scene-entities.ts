import "@babylonjs/core/Rendering/outlineRenderer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Node } from "@babylonjs/core/node";
import type { Scene } from "@babylonjs/core/scene";
import {
  type SceneEntity,
  type SceneSnapshot,
  validateSceneSnapshot,
} from "@dynosty/game-core";
import {
  buildModel,
  type ModelAssets,
  type ModelVisual,
} from "./model-assets.js";
import type { GlbVisual } from "./village.js";

type GlbFactory = (
  kind: SceneEntity["kind"],
  parent: Mesh,
  offsetY: number,
) => Promise<GlbVisual>;

import {
  type GroundObstacle,
  type GroundPoint,
  residentPath,
} from "./resident-path.js";

// 박찬님의 실제 모델을 연결할 경계. 현재는 종류별 상자로 표시한다.
export function createSceneEntities(
  scene: Scene,
  onSelectionChange: (id: string | null) => void = () => {},
  onModelError: () => void = () => {},
) {
  let needMaterial: StandardMaterial | null = null;
  let needLetter: StandardMaterial | null = null;
  let selectedId: string | null = null;
  let models: ModelAssets = {};
  let glb: GlbFactory | null = null;
  const objects = new Map<
    string,
    {
      kind: SceneEntity["kind"];
      mesh: Mesh;
      material: StandardMaterial;
      entity: SceneEntity;
      visual: GlbVisual | ModelVisual | null;
      modelAttempted: boolean;
      path: GroundPoint[];
      needMarker: Mesh | null;
    }
  >();
  let elevation = (x: number, z: number) => {
    void x;
    void z;
    return 0;
  };
  let extraObstacles: readonly GroundObstacle[] = [];
  function replan() {
    const buildings = [...objects.values()]
      .filter((o) => o.kind === "building" && o.entity.visible)
      .map((o) => ({
        ...o.entity.position,
        headingRadians: o.entity.headingRadians,
      }));
    for (const object of objects.values())
      if (object.kind === "resident")
        object.path = residentPath(
          object.mesh.position,
          object.entity.position,
          [...buildings, ...extraObstacles],
        );
  }

  function select(id: string | null) {
    const object = id === null ? undefined : objects.get(id);
    const next = object?.entity.visible && object.mesh.isEnabled() ? id : null;
    if (next === selectedId) return;
    if (selectedId !== null) {
      const previous = objects.get(selectedId);
      if (previous) {
        previous.mesh.renderOutline = false;
        previous.visual?.setOutline(false);
      }
    }
    selectedId = next;
    if (next !== null && object) {
      object.mesh.renderOutline = true;
      object.visual?.setOutline(true);
    }
    onSelectionChange(next);
  }

  function remove(id: string) {
    const object = objects.get(id);
    if (!object) return;
    if (id === selectedId) select(null);
    object.visual?.dispose();
    object.mesh.dispose();
    object.material.dispose();
    objects.delete(id);
  }

  return {
    setElevation(height: (x: number, z: number) => number) {
      elevation = height;
      for (const o of objects.values())
        o.mesh.position.y =
          o.entity.position.y +
          (o.kind === "resident" ? 0.5 : 0.75) +
          elevation(o.mesh.position.x, o.mesh.position.z);
    },
    setObstacles(obstacles: readonly GroundObstacle[]) {
      extraObstacles = obstacles;
      replan();
    },
    select,
    selectMesh(mesh: AbstractMesh | null) {
      let current: Node | null = mesh;
      while (current) {
        const object = objects.get(current.id);
        if (object?.mesh === current) {
          select(current.id);
          return;
        }
        current = current.parent;
      }
      select(null);
    },
    // 건물 도감·주민 v04 GLB가 준비되면 JSON 개발 모델 대신 씀
    setGlb(factory: GlbFactory) {
      glb = factory;
      for (const [id, object] of objects) {
        const { kind } = object;
        const size = kind === "resident" ? 1 : 1.5;
        object.modelAttempted = true;
        factory(kind, object.mesh, -size / 2)
          .then((visual) => {
            if (objects.get(id) !== object) return visual.dispose();
            object.visual?.dispose();
            object.visual = visual;
            object.modelAttempted = true;
            object.mesh.isVisible = false;
            visual.setOutline(selectedId === id);
            visual.setMotion(
              object.entity.kind === "resident" ? object.entity.motion : "idle",
            );
          })
          .catch(() => {
            if (objects.get(id) === object) onModelError();
          });
      }
    },
    setModels(value: ModelAssets) {
      models = value;
      for (const object of objects.values()) {
        object.visual?.dispose();
        object.visual = null;
        object.modelAttempted = false;
        object.mesh.isVisible = true;
      }
    },
    animate(delta: number) {
      for (const object of objects.values()) {
        if (!object.mesh.isEnabled()) continue;
        const e = object.entity;
        if (e.kind === "resident") {
          let budget = Math.max(0, delta) * 2;
          let moved = false;
          while (object.path.length && budget > 0) {
            const point = object.path[0];
            if (!point) break;
            const dx = point.x - object.mesh.position.x;
            const dz = point.z - object.mesh.position.z;
            const distance = Math.hypot(dx, dz);
            if (distance <= budget) {
              object.mesh.position.x = point.x;
              object.mesh.position.z = point.z;
              object.path.shift();
              budget -= distance;
            } else {
              object.mesh.position.x += (dx / distance) * budget;
              object.mesh.position.z += (dz / distance) * budget;
              budget = 0;
            }
            if (distance > 0) {
              moved = true;
              object.mesh.rotation.y = Math.atan2(dx, dz);
            }
          }
          object.mesh.position.y =
            e.position.y +
            0.5 +
            elevation(object.mesh.position.x, object.mesh.position.z);
          object.visual?.setMotion(moved ? "walking" : "idle");
          if (e.indoors && object.path.length === 0)
            object.mesh.setEnabled(false);
        }
        object.visual?.animate(delta);
      }
    },
    update(snapshot: SceneSnapshot) {
      // 부적합한 입력이 기존 장면을 일부만 바꾸지 않게 먼저 검사한다.
      validateSceneSnapshot(snapshot);
      const ids = new Set(snapshot.entities.map((entity) => entity.id));
      for (const id of objects.keys()) if (!ids.has(id)) remove(id);
      for (const entity of snapshot.entities) {
        let object = objects.get(entity.id);
        if (object && object.kind !== entity.kind) {
          remove(entity.id);
          object = undefined;
        }
        const size = entity.kind === "resident" ? 1 : 1.5;
        const created = !object;
        if (!object) {
          const mesh = CreateBox(entity.id, { size }, scene);
          const material = new StandardMaterial(`${entity.id}-material`, scene);
          mesh.material = material;
          mesh.renderOutline = false;
          mesh.outlineColor = new Color3(0.3, 0.9, 1);
          mesh.outlineWidth = 0.06;
          object = {
            kind: entity.kind,
            mesh,
            material,
            entity,
            visual: null,
            modelAttempted: false,
            path: [],
            needMarker: null,
          };
          objects.set(entity.id, object);
        }
        object.entity = entity;
        if (
          entity.kind === "resident" &&
          entity.needsHelp &&
          !object.needMarker
        ) {
          if (!needMaterial) {
            needMaterial = new StandardMaterial(
              "resident-need-material",
              scene,
            );
            needMaterial.diffuseColor = new Color3(0.12, 0.23, 0.18);
            needMaterial.emissiveColor = new Color3(0.03, 0.05, 0.03);
            needLetter = new StandardMaterial("resident-need-letter", scene);
            needLetter.diffuseColor = new Color3(1, 0.9, 0.57);
            needLetter.emissiveColor = new Color3(0.2, 0.15, 0.03);
          }
          object.needMarker = CreateBox(
            `need:${entity.id}`,
            { width: 0.5, height: 0.7, depth: 0.04 },
            scene,
          );
          object.needMarker.parent = object.mesh;
          object.needMarker.position.y = 1.5;
          object.needMarker.material = needMaterial;
          object.needMarker.billboardMode = Mesh.BILLBOARDMODE_ALL;
          for (const face of [-1, 1]) {
            const line = CreateBox(
              `need:${entity.id}:line:${face}`,
              { width: 0.08, height: 0.32, depth: 0.02 },
              scene,
            );
            line.parent = object.needMarker;
            line.position.set(0, 0.09, face * 0.035);
            line.material = needLetter;
            const dot = CreateBox(
              `need:${entity.id}:dot:${face}`,
              { size: 0.08 },
              scene,
            );
            dot.parent = object.needMarker;
            dot.position.set(0, -0.2, face * 0.035);
            dot.material = needLetter;
          }
        }
        object.needMarker?.setEnabled(
          entity.kind === "resident" &&
            entity.visible &&
            entity.needsHelp === true,
        );
        const asset = models[entity.kind];
        if (glb && !object.modelAttempted) {
          object.modelAttempted = true;
          const target = object,
            id = entity.id,
            size0 = size;
          glb(entity.kind, object.mesh, -size0 / 2)
            .then((visual) => {
              if (objects.get(id) !== target) return visual.dispose();
              target.visual?.dispose();
              target.visual = visual;
              visual.setMotion(
                target.entity.kind === "resident"
                  ? target.entity.motion
                  : "idle",
              );
              target.mesh.isVisible = false;
              visual.setOutline(selectedId === id);
            })
            .catch(() => {
              if (objects.get(id) === target) onModelError();
            });
        } else if (asset && !object.modelAttempted) {
          object.modelAttempted = true;
          try {
            object.visual = buildModel(
              scene,
              object.mesh,
              object.material,
              asset,
            );
            object.mesh.isVisible = false;
            object.visual.setOutline(selectedId === entity.id);
          } catch {
            onModelError();
          }
        }
        if (entity.kind === "building") {
          for (const mesh of "meshes" in (object.visual ?? {})
            ? (object.visual as ModelVisual).meshes
            : [])
            if (
              mesh.id.includes(":paper-") &&
              mesh.material instanceof StandardMaterial
            ) {
              mesh.material.emissiveColor = entity.lit
                ? new Color3(1, 0.55, 0.12)
                : Color3.Black();
              mesh.material.diffuseColor = entity.lit
                ? new Color3(1, 0.8, 0.35)
                : new Color3(0.55, 0.56, 0.46);
            }
        }
        object.visual?.setMotion?.(
          entity.kind === "resident" ? entity.motion : "idle",
        );
        if (created || entity.kind !== "resident")
          object.mesh.position.set(
            entity.position.x,
            entity.position.y +
              size / 2 +
              elevation(entity.position.x, entity.position.z),
            entity.position.z,
          );
        if (created || entity.kind !== "resident")
          object.mesh.rotation.y = entity.headingRadians;
        object.mesh.setEnabled(
          entity.visible ||
            (entity.kind === "resident" &&
              entity.indoors === true &&
              Math.hypot(
                object.mesh.position.x - entity.position.x,
                object.mesh.position.z - entity.position.z,
              ) > 0.01),
        );
        object.material.diffuseColor =
          entity.kind === "resident"
            ? entity.motion === "walking"
              ? new Color3(0.3, 0.65, 0.95)
              : new Color3(0.6, 0.8, 0.9)
            : entity.highlighted
              ? new Color3(1, 0.9, 0.3)
              : new Color3(0.84, 0.66, 0.38);
      }
      replan();
      if (selectedId !== null && !objects.get(selectedId)?.entity.visible)
        select(null);
    },
    dispose() {
      // 종료 중에는 UI 콜백을 호출하지 않는다.
      selectedId = null;
      for (const id of objects.keys()) remove(id);
      needMaterial?.dispose();
      needLetter?.dispose();
    },
  };
}
