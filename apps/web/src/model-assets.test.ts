import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Scene } from "@babylonjs/core/scene";
import { createSceneExample } from "@dynosty/game-core";
import { describe, expect, it } from "vitest";
import { loadModelAssets, parseModel } from "./model-assets.js";
import { createSceneEntities } from "./scene-entities.js";

const resident = JSON.parse(
  readFileSync(
    new URL("../public/models/triceratops.json", import.meta.url),
    "utf8",
  ),
);
const building = JSON.parse(
  readFileSync(
    new URL("../public/models/ondol-nest.json", import.meta.url),
    "utf8",
  ),
);
describe("자체 제작 대표 모델", () => {
  it("두 모델의 좌표·크기·역할과 발급 정보를 검증하고 잘못된 모델은 거부한다", () => {
    expect(
      parseModel(resident, "resident").parts.filter((p) => p.role === "leg"),
    ).toHaveLength(4);
    expect(parseModel(building, "building").name).toContain("온돌");
    expect(() => parseModel(building, "resident")).toThrow();
    expect(() =>
      parseModel(
        {
          ...resident,
          parts: [{ ...resident.parts[0], position: [NaN, 0, 0] }],
        },
        "resident",
      ),
    ).toThrow();
    expect(() => parseModel({ ...resident, parts: [] }, "resident")).toThrow();
  });
  it("모델 HTTP·검증 실패를 종류별로 반환하고 성공한 모델은 유지한다", async () => {
    const fetcher: typeof fetch = async (input) =>
      String(input).includes("triceratops")
        ? new Response("missing", { status: 404 })
        : new Response(JSON.stringify(building));
    const result = await loadModelAssets(new AbortController().signal, fetcher);
    expect(result.failed).toEqual(["resident"]);
    expect(result.assets.building?.kind).toBe("building");
  });
  it("하위 메시 클릭을 논리 식별값에 연결하고 숨김·삭제 시 전체 모델과 재질을 정리한다", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const selected: Array<string | null> = [];
    const entities = createSceneEntities(scene, (id) => selected.push(id));
    try {
      entities.setModels({
        resident: parseModel(resident, "resident"),
        building: parseModel(building, "building"),
      });
      entities.update(createSceneExample());
      const root = scene.getMeshById("example-resident-1");
      expect(root?.isVisible).toBe(false);
      const part = scene.getMeshById("example-resident-1:head");
      expect(part).not.toBeNull();
      entities.selectMesh(part);
      expect(selected).toEqual(["example-resident-1"]);
      expect(part?.renderOutline).toBe(true);
      entities.update({ schemaVersion: 1, entities: [] });
      expect(selected.at(-1)).toBeNull();
      expect(scene.meshes).toHaveLength(0);
      expect(scene.materials).toHaveLength(0);
    } finally {
      entities.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
  it("대기·걷기 자세를 전환하면서 메시·동작을 중복 생성하지 않는다", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const entities = createSceneEntities(scene);
    try {
      entities.setModels({ resident: parseModel(resident, "resident") });
      entities.update(createSceneExample());
      const count = scene.meshes.length;
      const leg = scene.getMeshById("example-resident-1:leg-0");
      const body = scene.getMeshById("example-resident-1:body");
      entities.animate(0.1);
      expect(body?.scaling.y).not.toBe(1);
      expect(leg?.rotation.x).toBe(0);
      entities.update(createSceneExample(true));
      entities.animate(0.1);
      expect(leg?.rotation.x).not.toBe(0);
      entities.update(createSceneExample());
      entities.animate(0);
      expect(leg?.rotation.x).toBe(0);
      expect(scene.meshes).toHaveLength(count);
      expect(scene.animationGroups).toHaveLength(0);
    } finally {
      entities.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
});

it("둥지 창호는 입주한 밤에 빛나고 아침에는 발광을 끈다", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    entities = createSceneEntities(scene);
  try {
    entities.setModels({ building: parseModel(building, "building") });
    const base = createSceneExample();
    const update = (lit: boolean) =>
      entities.update({
        ...base,
        entities: base.entities.map((e) =>
          e.kind === "building" ? { ...e, lit } : e,
        ),
      });
    update(true);
    const paper = scene.getMeshById("example-building-1:paper--0.6");
    expect(paper?.material).toBeInstanceOf(StandardMaterial);
    const material = paper?.material as StandardMaterial;
    expect(material.emissiveColor.r).toBe(1);
    update(false);
    expect(material.emissiveColor.r).toBe(0);
  } finally {
    entities.dispose();
    scene.dispose();
    engine.dispose();
  }
});
