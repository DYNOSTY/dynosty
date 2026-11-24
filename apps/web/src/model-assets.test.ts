import { readFileSync } from "node:fs";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import type { PickingInfo } from "@babylonjs/core/Collisions/pickingInfo";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { createSceneExample } from "@dynosty/game-core";
import { describe, expect, it } from "vitest";
import {
  buildModel,
  loadModelAssets,
  type ModelVisual,
  parseModel,
  pickedNode,
} from "./model-assets.js";
import { residentModel } from "./resident-model.js";
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

it("주민 모델은 같은 부위를 공유 메시에 몰아 그리고 선택한 주민만 윤곽선을 켠다", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    new FreeCamera("camera", new Vector3(0, 5, -10), scene);
    const asset = residentModel("R02");
    const material = new StandardMaterial("resident-fallback", scene);
    // Like scene entities: the root box carries the resident and stays hidden.
    const roots = ["resident-a", "resident-b"].map((id) => {
      const root = CreateBox(id, { size: 1 }, scene);
      root.material = material;
      root.isVisible = false;
      return root;
    });
    const [a, b] = roots.map((root) =>
      buildModel(scene, root, material, asset),
    ) as [ModelVisual, ModelVisual];
    const [ra, rb] = roots as [Mesh, Mesh];
    rb.position.x = 3;
    scene.render();
    const figure = scene.getMeshById(`model:${asset.id}:figure`) as Mesh;
    // Still parts merge into one figure and the breathing parts into one body;
    // each leg and the tail stay separate so they can swing.
    const shared = scene.meshes.filter(
      (m) => m.name.startsWith(`model:${asset.id}:`) && m.isVisible,
    );
    expect(shared).toHaveLength(
      2 +
        asset.parts.filter((p) => p.role === "leg" || p.role === "tail").length,
    );
    expect(a.meshes).toHaveLength(0);
    expect(figure.thinInstanceCount).toBe(2);
    expect(figure.renderOutline).toBe(false);
    // Each thin instance follows its resident, and a click resolves to that resident.
    expect(figure.thinInstanceGetWorldMatrices()[1]?.getTranslation().x).toBe(
      3,
    );
    expect(
      pickedNode({
        pickedMesh: figure,
        thinInstanceIndex: 1,
      } as unknown as PickingInfo),
    ).toBe(rb);

    a.setOutline(true);
    scene.render();
    const twin = scene.getMeshById("resident-a:figure") as InstancedMesh;
    expect(twin.sourceMesh.renderOutline).toBe(true);
    expect(twin.parent).toBe(ra);
    expect(figure.thinInstanceCount).toBe(1);
    expect(
      pickedNode({
        pickedMesh: figure,
        thinInstanceIndex: 0,
      } as unknown as PickingInfo),
    ).toBe(rb);
    a.setOutline(false);
    scene.render();
    expect(scene.getMeshById("resident-a:figure")).toBeNull();
    expect(figure.thinInstanceCount).toBe(2);
    // A resident indoors (disabled root) leaves the shared buffer.
    rb.setEnabled(false);
    scene.render();
    expect(figure.thinInstanceCount).toBe(1);

    a.setOutline(true);
    a.dispose();
    b.dispose();
    for (const root of roots) root.dispose();
    material.dispose();
    expect(scene.meshes).toHaveLength(0);
    expect(scene.materials).toHaveLength(0);
    expect(scene.onAfterActiveMeshesEvaluationObservable.hasObservers()).toBe(
      false,
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
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
