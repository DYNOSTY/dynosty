import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
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
