import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { createSceneExample } from "@dynosty/game-core";
import { describe, expect, it, vi } from "vitest";
import { createSceneEntities } from "./scene-entities.js";

it("구릉을 따라 이동할 때 주민의 발과 건물 기초가 지면 높이를 따른다", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    entities = createSceneEntities(scene);
  try {
    entities.setElevation((x) => x / 10);
    const initial = createSceneExample();
    entities.update(initial);
    const resident = scene.getMeshById("example-resident-1"),
      home = scene.getMeshById("example-building-1");
    if (!resident || !home) throw Error("표시 없음");
    expect(resident.position.y).toBeCloseTo(0.3);
    expect(home.position.y).toBeCloseTo(0.75);
    entities.update({
      ...initial,
      entities: initial.entities.map((e) =>
        e.kind === "resident" ? { ...e, position: { x: 8, y: 0, z: 1 } } : e,
      ),
    });
    for (let i = 0; i < 10; i++) {
      entities.animate(0.5);
      expect(resident.position.y).toBeCloseTo(0.5 + resident.position.x / 10);
    }
  } finally {
    entities.dispose();
    scene.dispose();
    engine.dispose();
  }
});

describe("표시 정보에서 Babylon 객체로 변환", () => {
  it("재시작·복귀 도중에도 매 프레임 집을 우회하고 목적지에 도착한다", () => {
    const engine = new NullEngine(),
      scene = new Scene(engine),
      entities = createSceneEntities(scene);
    const snapshot = createSceneExample();
    const move = (x: number, z: number) =>
      entities.update({
        ...snapshot,
        entities: snapshot.entities.map((e) =>
          e.kind === "resident" ? { ...e, position: { x, y: 0, z } } : e,
        ),
      });
    try {
      move(4, -3);
      const resident = scene.getMeshById("example-resident-1");
      if (!resident) throw new Error("주민 표시가 없습니다.");
      for (const goal of [
        { x: -2, z: 1 },
        { x: 4, z: -3 },
        { x: 0, z: -3 },
        { x: -2, z: 1 },
      ]) {
        move(goal.x, goal.z);
        for (let frame = 0; frame < 600; frame++) {
          entities.animate(1 / 60);
          const { x, z } = resident.position;
          expect(x >= -1.75 && x <= 1.75 && z >= -2.75 && z <= 0.75).toBe(
            false,
          );
        }
        expect(resident.position.x).toBeCloseTo(goal.x);
        expect(resident.position.z).toBeCloseTo(goal.z);
      }
    } finally {
      entities.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
  it("식별값으로 객체를 재사용하고 위치·방향·색을 갱신한다", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const entities = createSceneEntities(scene);
    try {
      entities.update(createSceneExample());
      const resident = scene.getMeshById("example-resident-1");
      expect(resident?.position).toMatchObject({ x: -2, y: 0.5, z: 1 });
      entities.update(createSceneExample(true));
      expect(resident?.position.x).toBe(-2);
      entities.animate(1);
      expect(resident?.position.x).toBe(0);
      entities.animate(1);
      expect(scene.getMeshById("example-resident-1")).toBe(resident);
      expect(scene.meshes).toHaveLength(2);
      expect(resident?.position).toMatchObject({ x: 2, y: 0.5, z: 1 });
      expect(resident?.rotation.y).toBe(Math.PI / 2);
      entities.update({
        ...createSceneExample(true),
        entities: createSceneExample(true).entities.map((e) =>
          e.kind === "resident" ? { ...e, headingRadians: Math.PI } : e,
        ),
      });
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
      w.entities.animate(2);
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

describe("늦게 도착하는 GLB와 최신 게임 표시", () => {
  it("setGlb 도중 갱신이 와도 중복 요청하지 않고 최신 동작·선택을 적용한다", async () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    const entities = createSceneEntities(scene);
    const pending = new Map<
      string,
      (value: import("./village.js").GlbVisual) => void
    >();
    const factory = vi.fn(
      (kind: string) =>
        new Promise<import("./village.js").GlbVisual>((resolve) =>
          pending.set(kind, resolve),
        ),
    );
    const visual = () => ({
      setOutline: vi.fn(),
      setMotion: vi.fn(),
      animate: vi.fn(),
      dispose: vi.fn(),
    });
    try {
      entities.update(createSceneExample());
      entities.setGlb(factory);
      entities.update(createSceneExample(true));
      entities.select("example-resident-1");
      expect(factory).toHaveBeenCalledTimes(2);
      const resident = visual();
      pending.get("resident")?.(resident);
      await Promise.resolve();
      expect(resident.setMotion).toHaveBeenCalledWith("walking");
      expect(resident.setOutline).toHaveBeenCalledWith(true);
      entities.dispose();
      const building = visual();
      pending.get("building")?.(building);
      await Promise.resolve();
      expect(building.dispose).toHaveBeenCalledOnce();
    } finally {
      entities.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
  it("새 엔티티의 GLB가 완성될 때 대기 중 전달된 걷기 상태를 반영한다", async () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    const entities = createSceneEntities(scene);
    const visual = {
      setOutline: vi.fn(),
      setMotion: vi.fn(),
      animate: vi.fn(),
      dispose: vi.fn(),
    };
    try {
      entities.setGlb(async () => visual);
      entities.update(createSceneExample(true));
      await Promise.resolve();
      expect(visual.setMotion).toHaveBeenCalledWith("walking");
    } finally {
      entities.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
});
it("요구가 있는 주민만 표식을 보이고 해소·종료 시 숨기고 정리한다", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    entities = createSceneEntities(scene),
    base = createSceneExample();
  const update = (needsHelp: boolean) =>
    entities.update({
      ...base,
      entities: base.entities.map((e) =>
        e.kind === "resident" ? { ...e, needsHelp } : e,
      ),
    });
  try {
    update(true);
    expect(scene.getMeshById("need:example-resident-1")?.isEnabled()).toBe(
      true,
    );
    update(false);
    expect(scene.getMeshById("need:example-resident-1")?.isEnabled()).toBe(
      false,
    );
    entities.dispose();
    expect(scene.meshes).toHaveLength(0);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

it("실내 휴식은 문까지 걸어간 뒤 숨기고 다음 지시 때 문에서 다시 나온다", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    entities = createSceneEntities(scene),
    base = createSceneExample();
  const resident = base.entities.find((e) => e.kind === "resident");
  if (!resident) throw Error("주민 없음");
  try {
    entities.update(base);
    entities.update({
      ...base,
      entities: base.entities.map((e) =>
        e.kind === "resident"
          ? {
              ...e,
              position: { x: -2, y: 0, z: -3 },
              visible: false,
              indoors: true,
            }
          : e,
      ),
    });
    expect(scene.getMeshById(resident.id)?.isEnabled()).toBe(true);
    entities.animate(10);
    expect(scene.getMeshById(resident.id)?.isEnabled()).toBe(false);
    expect(scene.getMeshById(resident.id)?.position.z).toBe(-3);
    entities.update({
      ...base,
      entities: base.entities.map((e) =>
        e.kind === "resident"
          ? {
              ...e,
              position: { x: -4, y: 0, z: -3 },
              visible: true,
              indoors: false,
            }
          : e,
      ),
    });
    expect(scene.getMeshById(resident.id)?.position.z).toBe(-3);
    entities.animate(1);
    expect(scene.getMeshById(resident.id)?.position.x).toBe(-4);
  } finally {
    entities.dispose();
    scene.dispose();
    engine.dispose();
  }
});
it("대기 GLB가 늦게 와도 새 종별 모델을 덮어쓰지 않고 단계 개량은 모델을 교체한다", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    entities = createSceneEntities(scene);
  const pending = new Map<
    string,
    (v: import("./village.js").GlbVisual) => void
  >();
  const visual = {
    setOutline: vi.fn(),
    setMotion: vi.fn(),
    animate: vi.fn(),
    dispose: vi.fn(),
  };
  try {
    const base = createSceneExample();
    entities.update(base);
    entities.setGlb(
      (kind) => new Promise((resolve) => pending.set(kind, resolve)),
    );
    const custom = {
      ...base,
      entities: base.entities.map((e) =>
        e.kind === "resident"
          ? { ...e, species: "SPINO" }
          : { ...e, level: 1 as const },
      ),
    };
    entities.update(custom);
    expect(scene.getMeshById("example-resident-1:back-sail-0")).not.toBeNull();
    pending.get("resident")?.(visual);
    await Promise.resolve();
    expect(visual.dispose).toHaveBeenCalledOnce();
    expect(scene.getMeshById("example-resident-1:back-sail-0")).not.toBeNull();
    const original = scene.getMeshById("example-building-1:oval-nest-roof");
    entities.update({
      ...custom,
      entities: custom.entities.map((e) =>
        e.kind === "building" ? { ...e, level: 3 as const } : e,
      ),
    });
    expect(original?.isDisposed()).toBe(true);
    expect(
      scene.getMeshById("example-building-1:court-wing--1.1-ridge"),
    ).not.toBeNull();
  } finally {
    entities.dispose();
    scene.dispose();
    engine.dispose();
  }
});
