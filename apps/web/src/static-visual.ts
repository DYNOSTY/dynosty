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
