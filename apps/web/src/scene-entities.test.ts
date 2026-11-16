import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { createSceneExample } from "@dynosty/game-core";
import { describe, expect, it } from "vitest";
import { createSceneEntities } from "./scene-entities.js";

describe("표시 정보에서 Babylon 객체로 변환", () => {
  it("식별값으로 객체를 재사용하고 위치·방향·색을 갱신한다", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const entities = createSceneEntities(scene);
    try {
      entities.update(createSceneExample());
      const resident = scene.getMeshById("example-resident-1");
      expect(resident?.position).toMatchObject({ x: -2, y: 0.5, z: 1 });
      entities.update(createSceneExample(true));
      expect(scene.getMeshById("example-resident-1")).toBe(resident);
      expect(scene.meshes).toHaveLength(2);
      expect(resident?.position).toMatchObject({ x: 2, y: 0.5, z: 1 });
      expect(resident?.rotation.y).toBe(Math.PI / 2);
      const material = scene.getMeshById("example-building-1")?.material;
      expect(material).toBeInstanceOf(StandardMaterial);
      if (material instanceof StandardMaterial)
        expect(material.diffuseColor.asArray()).toEqual([1, 0.9, 0.3]);
    } finally {
      entities.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  it("숨김·삭제·종료 후 불필요한 객체를 남기지 않는다", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const entities = createSceneEntities(scene);
    try {
      const snapshot = createSceneExample();
      entities.update(snapshot);
      entities.update({
        ...snapshot,
        entities: snapshot.entities
          .filter((entity) => entity.kind === "resident")
          .map((entity) => ({ ...entity, visible: false })),
      });
      expect(scene.getMeshById("example-resident-1")?.isEnabled()).toBe(false);
      expect(scene.getMeshById("example-building-1")).toBeNull();
      expect(scene.materials).toHaveLength(1);
      entities.dispose();
      expect(scene.meshes).toHaveLength(0);
      expect(scene.materials).toHaveLength(0);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});

describe("예제 대상 선택", () => {
  function world() {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const selected: Array<string | null> = [];
    const entities = createSceneEntities(scene, (id) => selected.push(id));
    entities.update(createSceneExample());
    return {
      scene,
      entities,
      selected,
      dispose() {
        entities.dispose();
        scene.dispose();
        engine.dispose();
      },
    };
  }

  it("한 대상에만 테두리를 표시하고 기존 외형 색과 게임 정보를 바꾸지 않는다", () => {
    const w = world();
    try {
      const building = w.scene.getMeshById("example-building-1") as Mesh;
      const resident = w.scene.getMeshById("example-resident-1") as Mesh;
      const material = building.material as StandardMaterial;
      const before = material.diffuseColor.asArray();
      w.entities.select(building.id);
      w.entities.select(building.id);
      expect(building.renderOutline).toBe(true);
      expect(resident.renderOutline).toBe(false);
      expect(material.diffuseColor.asArray()).toEqual(before);
      w.entities.selectMesh(resident);
      expect(building.renderOutline).toBe(false);
      expect(resident.renderOutline).toBe(true);
      w.entities.selectMesh(null);
      expect(resident.renderOutline).toBe(false);
      expect(w.selected).toEqual([building.id, resident.id, null]);
      w.entities.select("unknown");
      expect(w.selected).toHaveLength(3);
    } finally {
      w.dispose();
    }
  });

  it("표시 갱신에서 선택을 유지하고 숨김·삭제·종류 교체 시 해제한다", () => {
    const w = world();
    try {
      const id = "example-resident-1";
      w.entities.select(id);
      const mesh = w.scene.getMeshById(id) as Mesh;
      const snapshot = createSceneExample(true);
      w.entities.update(snapshot);
      expect(w.scene.getMeshById(id)).toBe(mesh);
      expect(mesh.renderOutline).toBe(true);
      expect(mesh.position.x).toBe(2);
      w.entities.update({
        ...snapshot,
        entities: snapshot.entities.map((e) =>
          e.id === id ? { ...e, visible: false } : e,
        ),
      });
      expect(mesh.renderOutline).toBe(false);
      expect(w.selected).toEqual([id, null]);
      w.entities.update(snapshot);
      w.entities.select(id);
      w.entities.update({
        ...snapshot,
        entities: snapshot.entities.filter((e) => e.id !== id),
      });
      expect(w.selected).toEqual([id, null, id, null]);
      w.entities.update(snapshot);
      w.entities.select(id);
      w.entities.update({
        ...snapshot,
        entities: snapshot.entities.map((e) =>
          e.id === id
            ? { ...e, kind: "building" as const, highlighted: false }
            : e,
        ),
      });
      expect(w.selected.at(-1)).toBeNull();
      expect((w.scene.getMeshById(id) as Mesh).renderOutline).toBe(false);
    } finally {
      w.dispose();
    }
  });

  it("잘못된 갱신은 선택을 보존하고 종료 때 UI 콜백·객체를 남기지 않는다", () => {
    const w = world();
    try {
      w.entities.select("example-building-1");
      const mesh = w.scene.getMeshById("example-building-1") as Mesh;
      expect(() =>
        w.entities.update({ ...createSceneExample(), schemaVersion: 2 as 1 }),
      ).toThrow();
      expect(mesh.renderOutline).toBe(true);
      expect(w.selected).toEqual([mesh.id]);
      w.entities.dispose();
      expect(w.scene.meshes).toHaveLength(0);
      expect(w.selected).toEqual([mesh.id]);
    } finally {
      w.dispose();
    }
  });
});
