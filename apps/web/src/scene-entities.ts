import "@babylonjs/core/Rendering/outlineRenderer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import {
  type SceneEntity,
  type SceneSnapshot,
  validateSceneSnapshot,
} from "@dynosty/game-core";

// 박찬님의 실제 모델을 연결할 경계. 현재는 종류별 상자로 표시한다.
export function createSceneEntities(
  scene: Scene,
  onSelectionChange: (id: string | null) => void = () => {},
) {
  let selectedId: string | null = null;
  const objects = new Map<
    string,
    {
      kind: SceneEntity["kind"];
      mesh: Mesh;
      material: StandardMaterial;
      entity: SceneEntity;
    }
  >();

  function select(id: string | null) {
    const object = id === null ? undefined : objects.get(id);
    const next = object?.entity.visible && object.mesh.isEnabled() ? id : null;
    if (next === selectedId) return;
    if (selectedId !== null) {
      const previous = objects.get(selectedId);
      if (previous) previous.mesh.renderOutline = false;
    }
    selectedId = next;
    if (next !== null && object) object.mesh.renderOutline = true;
    onSelectionChange(next);
  }

  function remove(id: string) {
    const object = objects.get(id);
    if (!object) return;
    if (id === selectedId) select(null);
    object.mesh.dispose();
    object.material.dispose();
    objects.delete(id);
  }

  return {
    select,
    selectMesh(mesh: AbstractMesh | null) {
      const object = mesh ? objects.get(mesh.id) : undefined;
      select(object?.mesh === mesh ? (mesh?.id ?? null) : null);
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
        if (!object) {
          const mesh = CreateBox(entity.id, { size }, scene);
          const material = new StandardMaterial(`${entity.id}-material`, scene);
          mesh.material = material;
          mesh.renderOutline = false;
          mesh.outlineColor = new Color3(0.3, 0.9, 1);
          mesh.outlineWidth = 0.06;
          object = { kind: entity.kind, mesh, material, entity };
          objects.set(entity.id, object);
        }
        object.entity = entity;
        object.mesh.position.set(
          entity.position.x,
          entity.position.y + size / 2,
          entity.position.z,
        );
        object.mesh.rotation.y = entity.headingRadians;
        object.mesh.setEnabled(entity.visible);
        object.material.diffuseColor =
          entity.kind === "resident"
            ? entity.motion === "walking"
              ? new Color3(0.3, 0.65, 0.95)
              : new Color3(0.6, 0.8, 0.9)
            : entity.highlighted
              ? new Color3(1, 0.9, 0.3)
              : new Color3(0.84, 0.66, 0.38);
      }
      if (selectedId !== null && !objects.get(selectedId)?.entity.visible)
        select(null);
    },
    dispose() {
      // 종료 중에는 UI 콜백을 호출하지 않는다.
      selectedId = null;
      for (const id of objects.keys()) remove(id);
    },
  };
}
