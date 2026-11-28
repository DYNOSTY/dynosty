import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

// Parents must be recomputed before children when a building is repositioned.
export function freezeStaticVisual(nodes: TransformNode[]) {
  for (const node of nodes) {
    node.unfreezeWorldMatrix();
    if (node instanceof AbstractMesh) node.doNotSyncBoundingInfo = false;
  }
  for (const node of nodes) {
    node.computeWorldMatrix(true);
    node.freezeWorldMatrix();
    if (node instanceof AbstractMesh) node.doNotSyncBoundingInfo = true;
  }
}

// Snapshot of a node's own transform. Callers refreeze a static visual only
// when its parent actually moved: refreezing on every snapshot re-uploaded
// instance buffers, which stalls the software-rendered CI browser.
export function transformKey(node: TransformNode) {
  const q = node.rotationQuaternion;
  return [
    node.position.x,
    node.position.y,
    node.position.z,
    node.rotation.x,
    node.rotation.y,
    node.rotation.z,
    q?.x ?? 0,
    q?.y ?? 0,
    q?.z ?? 0,
    q?.w ?? 1,
    node.scaling.x,
    node.scaling.y,
    node.scaling.z,
  ].join(",");
}
