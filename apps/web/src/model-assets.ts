import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { PickingInfo } from "@babylonjs/core/Collisions/pickingInfo";
import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import type { Scene } from "@babylonjs/core/scene";
import { isRecord } from "@dynosty/game-core";
import { freezeStaticVisual, transformKey } from "./static-visual.js";
export interface ModelPart {
  name: string;
  shape: "box" | "sphere" | "cylinder";
  size: [number, number, number];
  position: [number, number, number];
  rotation: [number, number, number];
  color?: [number, number, number];
  role?: string;
  phase?: number;
  tessellation?: number;
}
export interface ModelAsset {
  format: "dynosty-model";
  version: 1;
  id: string;
  kind: "resident" | "building";
  name: string;
  units: "meter";
  origin: string;
  parts: ModelPart[];
}
export type ModelAssets = Partial<Record<ModelAsset["kind"], ModelAsset>>;
export function parseModel(
  value: unknown,
  kind: ModelAsset["kind"],
): ModelAsset {
  const bad = () => {
    throw new Error("모델 파일의 형식이나 좌표가 올바르지 않습니다.");
  };
  if (
    !isRecord(value) ||
    value.format !== "dynosty-model" ||
    value.version !== 1 ||
    value.kind !== kind ||
    value.units !== "meter" ||
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.name !== "string" ||
    !value.name ||
    typeof value.origin !== "string" ||
    !Array.isArray(value.parts) ||
    value.parts.length < 1 ||
    value.parts.length > 100
  )
    return bad();
  const ids = new Set<string>();
  const vector = (v: unknown, min: number, max: number) =>
    Array.isArray(v) &&
    v.length === 3 &&
    v.every(
      (n) =>
        typeof n === "number" && Number.isFinite(n) && n >= min && n <= max,
    );
  for (const p of value.parts) {
    if (
      !isRecord(p) ||
      typeof p.name !== "string" ||
      !p.name ||
      ids.has(p.name) ||
      !["box", "sphere", "cylinder"].includes(p.shape as string) ||
      !vector(p.size, 0, 10) ||
      !vector(p.position, -20, 20) ||
      !vector(p.rotation, -Math.PI * 2, Math.PI * 2)
    )
      return bad();
    ids.add(p.name);
    const size = p.size as number[];
    if (
      p.shape === "cylinder"
        ? (size[0] ?? 0) <= 0 || (size[1] ?? 0) <= 0
        : size.some((n) => n <= 0)
    )
      return bad();
    if (p.color !== undefined && !vector(p.color, 0, 1)) return bad();
    if (
      p.role !== undefined &&
      !["leg", "body", "head", "tail"].includes(p.role as string)
    )
      return bad();
    if (
      p.phase !== undefined &&
      (typeof p.phase !== "number" ||
        !Number.isFinite(p.phase) ||
        Math.abs(p.phase) > 10)
    )
      return bad();
    if (
      p.tessellation !== undefined &&
      (typeof p.tessellation !== "number" ||
        !Number.isSafeInteger(p.tessellation) ||
        p.tessellation < 3 ||
        p.tessellation > 32)
    )
      return bad();
  }
  if (
    kind === "resident" &&
    ![2, 4].includes(
      value.parts.filter((p) => isRecord(p) && p.role === "leg").length,
    )
  )
    return bad();
  return JSON.parse(JSON.stringify(value)) as ModelAsset;
}
export async function loadModelAssets(
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<{ assets: ModelAssets; failed: string[] }> {
  const result: { assets: ModelAssets; failed: string[] } = {
    assets: {},
    failed: [],
  };
  await Promise.all(
    (
      [
        ["resident", "triceratops.json"],
        ["building", "ondol-nest.json"],
      ] as const
    ).map(async ([kind, file]) => {
      try {
        const response = await fetcher(
          `${import.meta.env.BASE_URL}models/${file}`,
          { signal },
        );
        if (!response.ok) throw new Error("모델 응답 실패");
        result.assets[kind] = parseModel(await response.json(), kind);
      } catch (error) {
        if (signal.aborted) throw error;
        result.failed.push(kind);
      }
    }),
  );
  return result;
}
const OUTLINE = new Color3(0.3, 0.9, 1);
function createPart(id: string, p: ModelPart, scene: Scene): Mesh {
  const mesh =
    p.shape === "box"
      ? CreateBox(
          id,
          { width: p.size[0], height: p.size[1], depth: p.size[2] },
          scene,
        )
      : p.shape === "sphere"
        ? CreateSphere(
            id,
            {
              diameterX: p.size[0],
              diameterY: p.size[1],
              diameterZ: p.size[2],
              segments: 8,
            },
            scene,
          )
        : CreateCylinder(
            id,
            {
              diameterBottom: p.size[0],
              height: p.size[1],
              diameterTop: p.size[2],
              tessellation: p.tessellation ?? 8,
            },
            scene,
          );
  mesh.outlineColor = OUTLINE.clone();
  mesh.outlineWidth = 0.06;
  return mesh;
}

// Residents of the same model share one mesh per piece and are drawn as thin instances.
// Each resident used to add one mesh, draw call and material per part (~20); with the
// capital's 1,000 residents the scene walked over ten thousand meshes every frame.
// Coloured parts that never move relative to the resident are merged into one
// vertex-coloured "figure", the breathing body parts into one "body"; legs and tails
// stay separate to animate. Once the scene has placed the residents for a frame, the
// shared model writes every visible resident's piece matrices into one buffer, so
// Babylon walks a handful of meshes instead of thousands.
// An outline applies to a whole mesh, so a selected resident leaves the buffer and is
// drawn with ordinary instances of outlined twins instead.
type SharedPiece = {
  name: string;
  part: ModelPart;
  plain: Mesh;
  outlined: Mesh;
  // Local matrix of a piece that never animates.
  still: Matrix | null;
};
type Slot = { root: Mesh; time: number; motion: string; outlined: boolean };
type SharedModel = {
  key: string;
  refs: number;
  pieces: SharedPiece[];
  material: StandardMaterial;
  slots: Set<Slot>;
  // owners[i] is the resident root drawn by thin instance i of every piece.
  owners: Mesh[];
  visible: Slot[];
  buffers: Float32Array[];
  stop: () => void;
};
const sharedModels = new WeakMap<Scene, Map<string, SharedModel>>();
function mergedPiece(
  scene: Scene,
  id: string,
  parts: ModelPart[],
  pivot: [number, number, number],
) {
  const meshes = parts.map((p) => {
    const mesh = createPart(`${id}:${p.name}`, p, scene);
    mesh.position.set(
      p.position[0] - pivot[0],
      p.position[1] - pivot[1],
      p.position[2] - pivot[2],
    );
    mesh.rotation.set(...p.rotation);
    const [r, g, b] = p.color ?? [1, 1, 1];
    mesh.setVerticesData(
      VertexBuffer.ColorKind,
      Array.from({ length: mesh.getTotalVertices() }, () => [
        r,
        g,
        b,
        1,
      ]).flat(),
    );
    return mesh;
  });
  const merged =
    meshes.length === 1
      ? meshes[0]
      : Mesh.MergeMeshes(meshes, true, true, undefined, false, false);
  if (!merged) throw new Error("주민 모델 부위를 합치지 못했습니다.");
  if (meshes.length === 1) {
    merged.bakeCurrentTransformIntoVertices();
  }
  merged.name = merged.id = id;
  merged.outlineColor = OUTLINE.clone();
  merged.outlineWidth = 0.06;
  return merged;
}

// Local transform of a resident piece at an animation time (same motion as before).
const pose = {
  position: new Vector3(),
  rotation: new Vector3(),
  scaling: new Vector3(),
};
function posePiece(p: ModelPart, time: number, motion: string) {
  pose.position.set(...p.position);
  pose.rotation.set(...p.rotation);
  pose.scaling.setAll(1);
  if (p.role === "leg" && motion === "walking")
    pose.rotation.x += Math.sin(time * 8 + (p.phase ?? 0)) * 0.45;
  if (p.role === "body") {
    if (motion === "walking") pose.position.y += Math.sin(time * 16) * 0.02;
    else pose.scaling.y = 1 + Math.sin(time * 2) * 0.018;
  }
  if (p.role === "tail")
    pose.rotation.y += Math.sin(time * (motion === "walking" ? 4 : 1)) * 0.08;
  return pose;
}

const turn = new Quaternion();
const local = new Matrix();
const world = new Matrix();
const lowest = new Vector3();
const highest = new Vector3();
const rootWorld = new Matrix();
function localMatrix(
  part: ModelPart,
  time: number,
  motion: string,
  out: Matrix,
) {
  const { position, rotation, scaling } = posePiece(part, time, motion);
  Quaternion.RotationYawPitchRollToRef(
    rotation.y,
    rotation.x,
    rotation.z,
    turn,
  );
  return Matrix.ComposeToRef(scaling, turn, position, out);
}
function writeInstances(model: SharedModel) {
  const owners = model.owners;
  const visible = model.visible;
  owners.length = visible.length = 0;
  for (const slot of model.slots)
    if (!slot.outlined && slot.root.isEnabled()) {
      visible.push(slot);
      owners.push(slot.root);
    }
  const count = visible.length;
  const { pieces, buffers } = model;
  pieces.forEach((piece, k) => {
    const buffer = buffers[k];
    if (!buffer || buffer.length < count * 16) {
      buffers[k] = new Float32Array(Math.max(16, count * 2) * 16);
      piece.plain.thinInstanceSetBuffer("matrix", buffers[k], 16, false);
    }
  });
  lowest.setAll(Number.POSITIVE_INFINITY);
  highest.setAll(Number.NEGATIVE_INFINITY);
  visible.forEach((slot, i) => {
    // The scene has just evaluated every enabled root for this frame.
    rootWorld.copyFrom(slot.root.getWorldMatrix());
    const m = rootWorld.m;
    lowest.minimizeInPlaceFromFloats(m[12] ?? 0, m[13] ?? 0, m[14] ?? 0);
    highest.maximizeInPlaceFromFloats(m[12] ?? 0, m[13] ?? 0, m[14] ?? 0);
    pieces.forEach((piece, k) => {
      const still = piece.still;
      (still ?? localMatrix(piece.part, slot.time, slot.motion, local))
        .multiplyToRef(rootWorld, world)
        .copyToArray(buffers[k] as Float32Array, i * 16);
    });
  });
  for (const piece of pieces) {
    piece.plain.thinInstanceCount = count;
    piece.plain.isVisible = count > 0;
    if (count) piece.plain.thinInstanceBufferUpdated("matrix");
  }
  if (!count) return;
  // Every resident fits inside a few metres of its root; this box keeps frustum
  // culling and the first picking test cheap without measuring each instance.
  lowest.subtractFromFloatsToRef(4, 4, 4, lowest);
  highest.addInPlaceFromFloats(4, 4, 4);
  for (const piece of pieces)
    piece.plain.getBoundingInfo().reConstruct(lowest, highest);
}

function acquireShared(scene: Scene, asset: ModelAsset): SharedModel | null {
  const coloured = asset.parts.filter((p) => p.color);
  if (!coloured.length) return null;
  let models = sharedModels.get(scene);
  if (!models) {
    models = new Map();
    sharedModels.set(scene, models);
  }
  const key = JSON.stringify([asset.id, asset.parts]);
  let model = models.get(key);
  if (!model) {
    const material = new StandardMaterial(`model:${asset.id}:material`, scene);
    material.diffuseColor = Color3.White();
    const pieces: SharedPiece[] = [];
    const piece = (
      name: string,
      parts: ModelPart[],
      base: ModelPart,
    ): SharedPiece => {
      const id = `model:${asset.id}:${name}`;
      const [plain, outlined] = [false, true].map((outline) => {
        const mesh = mergedPiece(
          scene,
          outline ? `${id}:outlined` : id,
          parts,
          base.position,
        );
        mesh.material = material;
        mesh.isVisible = false;
        mesh.isPickable = false;
        mesh.renderOutline = outline;
        return mesh;
      }) as [Mesh, Mesh];
      // Picking tests each thin instance against the piece's own bounds.
      const { minimum, maximum } = plain.getBoundingInfo();
      plain.rawBoundingInfo = new BoundingInfo(
        minimum.clone(),
        maximum.clone(),
      );
      plain.doNotSyncBoundingInfo = true;
      plain.isPickable = true;
      plain.thinInstanceEnablePicking = true;
      const animated = ["leg", "tail", "body"].includes(base.role ?? "");
      return {
        name,
        part: base,
        plain,
        outlined,
        still: animated ? null : localMatrix(base, 0, "idle", new Matrix()),
      };
    };
    const still = coloured.filter(
      (p) => p.role !== "leg" && p.role !== "tail" && p.role !== "body",
    );
    const body = coloured.filter((p) => p.role === "body");
    if (still.length)
      pieces.push(
        piece("figure", still, {
          name: "figure",
          shape: "box",
          size: [1, 1, 1],
          position: [0, 0, 0],
          rotation: [0, 0, 0],
        }),
      );
    const [first] = body;
    if (first)
      pieces.push(
        piece("body", body, {
          ...first,
          name: "body",
          rotation: [0, 0, 0],
        }),
      );
    for (const p of coloured)
      if (p.role === "leg" || p.role === "tail")
        pieces.push(piece(p.name, [{ ...p, rotation: [0, 0, 0] }], p));
    const created: SharedModel = {
      key,
      refs: 0,
      pieces,
      material,
      slots: new Set(),
      owners: [],
      visible: [],
      buffers: [],
      stop: () => {},
    };
    for (const p of pieces) p.plain.metadata = { thinOwners: created.owners };
    const observer = scene.onAfterActiveMeshesEvaluationObservable.add(() =>
      writeInstances(created),
    );
    created.stop = () =>
      scene.onAfterActiveMeshesEvaluationObservable.remove(observer);
    model = created;
    models.set(key, model);
  }
  model.refs++;
  return model;
}
function releaseShared(scene: Scene, model: SharedModel) {
  if (--model.refs > 0) return;
  model.stop();
  for (const { plain, outlined } of model.pieces) {
    plain.dispose();
    outlined.dispose();
  }
  model.material.dispose();
  sharedModels.get(scene)?.delete(model.key);
}

// A click on a shared resident piece hits a thin instance; report its resident root.
export function pickedNode(info: PickingInfo | null) {
  const mesh = info?.pickedMesh ?? null;
  const owners = mesh?.metadata?.thinOwners as Mesh[] | undefined;
  return owners?.[info?.thinInstanceIndex ?? -1] ?? mesh;
}

export function buildModel(
  scene: Scene,
  root: Mesh,
  material: StandardMaterial,
  asset: ModelAsset,
) {
  const meshes: Array<Mesh | InstancedMesh> = [];
  const materials: StandardMaterial[] = [];
  const rig: Array<{ mesh: Mesh | InstancedMesh; part: ModelPart }> = [];
  const shared = asset.kind === "resident" ? acquireShared(scene, asset) : null;
  const slot: Slot = { root, time: 0, motion: "idle", outlined: false };
  shared?.slots.add(slot);
  let outlines: InstancedMesh[] = [];
  const place = (mesh: Mesh | InstancedMesh, p: ModelPart) => {
    meshes.push(mesh);
    mesh.parent = root;
    mesh.position.set(...p.position);
    mesh.rotation.set(...p.rotation);
    rig.push({ mesh, part: p });
  };
  try {
    if (asset.kind === "building") {
      // Keep changing window and fallback materials separate from baked colours.
      for (const colored of [true, false]) {
        const parts = asset.parts.filter(
          (p) => !p.name.startsWith("paper-") && !!p.color === colored,
        );
        if (!parts.length) continue;
        const mesh = mergedPiece(
          scene,
          `${root.id}:${colored ? "model" : "fallback"}`,
          parts,
          [0, 0, 0],
        );
        meshes.push(mesh);
        mesh.parent = root;
        if (colored) {
          const m = new StandardMaterial(`${root.id}:model:material`, scene);
          m.diffuseColor = Color3.White();
          materials.push(m);
          mesh.material = m;
        } else mesh.material = material;
      }
    }
    for (const p of asset.parts) {
      if (asset.kind === "building" && !p.name.startsWith("paper-")) continue;
      if (shared && p.color) continue;
      const id = `${root.id}:${p.name}`;
      const mesh = createPart(id, p, scene);
      if (p.color) {
        const m = new StandardMaterial(`${id}:material`, scene);
        m.diffuseColor = new Color3(...p.color);
        materials.push(m);
        mesh.material = m;
      } else mesh.material = material;
      mesh.renderOutline = false;
      place(mesh, p);
    }
  } catch (error) {
    for (const m of meshes) m.dispose();
    for (const m of materials) m.dispose();
    if (shared) {
      shared.slots.delete(slot);
      releaseShared(scene, shared);
    }
    throw error;
  }
  const applyPose = () => {
    for (const { mesh, part: p } of rig) {
      if (asset.kind !== "resident") {
        mesh.position.set(...p.position);
        mesh.rotation.set(...p.rotation);
        mesh.scaling.setAll(1);
        continue;
      }
      const { position, rotation, scaling } = posePiece(
        p,
        slot.time,
        slot.motion,
      );
      mesh.position.copyFrom(position);
      mesh.rotation.copyFrom(rotation);
      mesh.scaling.copyFrom(scaling);
    }
  };
  let frozenAt = "";
  return {
    meshes,
    refreshStatic(force = false) {
      if (asset.kind !== "building") return;
      const key = transformKey(root);
      if (!force && key === frozenAt) return;
      frozenAt = key;
      freezeStaticVisual(meshes);
    },
    setOutline(value: boolean) {
      for (const mesh of meshes)
        if (!(mesh instanceof InstancedMesh)) mesh.renderOutline = value;
      if (!shared || slot.outlined === value) return;
      slot.outlined = value;
      for (const mesh of outlines) {
        mesh.dispose();
        const at = rig.findIndex((r) => r.mesh === mesh);
        if (at >= 0) rig.splice(at, 1);
      }
      outlines = [];
      if (!value) return;
      for (const piece of shared.pieces) {
        const mesh = piece.outlined.createInstance(`${root.id}:${piece.name}`);
        mesh.isVisible = true;
        mesh.isPickable = true;
        mesh.parent = root;
        outlines.push(mesh);
        rig.push({ mesh, part: piece.part });
      }
      applyPose();
    },
    setMotion(value: string) {
      if (slot.motion !== value) {
        slot.motion = value;
        slot.time = 0;
      }
    },
    animate(delta: number) {
      if (asset.kind === "building") return;
      slot.time += Math.min(Math.max(delta, 0), 0.1);
      applyPose();
    },
    dispose() {
      for (const mesh of outlines) mesh.dispose();
      for (const mesh of meshes) mesh.dispose();
      for (const m of materials) m.dispose();
      if (shared) {
        shared.slots.delete(slot);
        releaseShared(scene, shared);
      }
    },
  };
}
export type ModelVisual = ReturnType<typeof buildModel>;
