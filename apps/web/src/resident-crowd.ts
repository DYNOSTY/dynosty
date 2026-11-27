import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

type Slot = {
  root: TransformNode;
  visible: () => boolean;
  local: () => Matrix;
};
type Batch = {
  mesh: Mesh;
  slots: Set<Slot>;
  owners: TransformNode[];
  buffer: Float32Array;
  stop: () => void;
};
const batches = new WeakMap<Scene, Map<Mesh, Batch>>();

export function addResidentInstance(
  scene: Scene,
  source: Mesh,
  slot: Slot,
  pickable: boolean,
) {
  let bySource = batches.get(scene);
  if (!bySource) {
    bySource = new Map();
    batches.set(scene, bySource);
  }
  const sources = bySource;
  let batch = bySource.get(source);
  if (!batch) {
    const mesh = source.clone(`resident-batch:${source.name}`, null, true);
    mesh.parent = null;
    mesh.makeGeometryUnique();
    // Babylon flips winding itself when this matrix has a negative determinant.
    mesh.bakeTransformIntoVertices(source.computeWorldMatrix(true));
    mesh.position.setAll(0);
    mesh.scaling.setAll(1);
    mesh.rotation.setAll(0);
    mesh.rotationQuaternion = null;
    mesh.material = source.material;
    mesh.setEnabled(true);
    mesh.isVisible = false;
    mesh.isPickable = pickable;
    mesh.thinInstanceEnablePicking = pickable;
    const bounds = mesh.getBoundingInfo();
    mesh.rawBoundingInfo = new BoundingInfo(
      bounds.minimum.clone(),
      bounds.maximum.clone(),
    );
    mesh.doNotSyncBoundingInfo = true;
    const created: Batch = {
      mesh,
      slots: new Set(),
      owners: [],
      buffer: new Float32Array(0),
      stop: () => {},
    };
    mesh.metadata = { thinOwners: created.owners };
    const world = new Matrix();
    const low = new Vector3(),
      high = new Vector3();
    // Reused every frame so 1,000 residents do not allocate a new list per frame.
    const visible: Slot[] = [];
    const observer = scene.onAfterActiveMeshesEvaluationObservable.add(() => {
      visible.length = 0;
      for (const s of created.slots)
        if (!s.root.isDisposed() && s.root.isEnabled() && s.visible())
          visible.push(s);
      const count = visible.length;
      if (created.buffer.length < count * 16) {
        created.buffer = new Float32Array(Math.max(16, count * 2) * 16);
        mesh.thinInstanceSetBuffer("matrix", created.buffer, 16, false);
      }
      mesh.thinInstanceCount = count;
      // Babylon caches matrices used by picking separately from the GPU buffer.
      const matrices = mesh.thinInstanceGetWorldMatrices();
      matrices.length = count;
      created.owners.length = 0;
      low.setAll(Number.POSITIVE_INFINITY);
      high.setAll(Number.NEGATIVE_INFINITY);
      visible.forEach((s, i) => {
        created.owners.push(s.root);
        s.local().multiplyToRef(s.root.getWorldMatrix(), world);
        world.copyToArray(created.buffer, i * 16);
        if (matrices[i]) matrices[i]?.copyFrom(world);
        else matrices[i] = world.clone();
        const m = world.m;
        low.minimizeInPlaceFromFloats(m[12] ?? 0, m[13] ?? 0, m[14] ?? 0);
        high.maximizeInPlaceFromFloats(m[12] ?? 0, m[13] ?? 0, m[14] ?? 0);
      });
      mesh.isVisible = count > 0;
      if (count) {
        mesh.thinInstanceBufferUpdated("matrix");
        low.subtractFromFloatsToRef(4, 4, 4, low);
        high.addInPlaceFromFloats(4, 4, 4);
        mesh.getBoundingInfo().reConstruct(low, high);
      }
    });
    created.stop = () => {
      scene.onAfterActiveMeshesEvaluationObservable.remove(observer);
    };
    batch = created;
    bySource.set(source, batch);
  }
  const owned = batch;
  owned.slots.add(slot);
  return () => {
    owned.slots.delete(slot);
    if (owned.slots.size) return;
    owned.stop();
    owned.mesh.dispose();
    sources.delete(source);
  };
}

const localRotation = new Quaternion();
export function residentLocal(
  scale: Vector3,
  rotation: number,
  position: Vector3,
  result: Matrix,
) {
  Quaternion.RotationYawPitchRollToRef(0, 0, rotation, localRotation);
  return Matrix.ComposeToRef(scale, localRotation, position, result);
}
