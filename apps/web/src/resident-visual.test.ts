import { readFile } from "node:fs/promises";
import "@babylonjs/loaders/glTF";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Ray } from "@babylonjs/core/Culling/ray";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Tools } from "@babylonjs/core/Misc/tools";
import { Scene } from "@babylonjs/core/scene";
import { createSceneExample } from "@dynosty/game-core";
import { expect, it, vi } from "vitest";
import { installMeshoptDecoder } from "./meshopt.js";
import { createResidentVisual } from "./resident-visual.js";
import { createSceneEntities } from "./scene-entities.js";

it("600명이 같은 원본을 공유하고 선택이 바뀐 뒤 도착한 상세 모델은 복제하지 않는다", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const asset = new AssetContainer(scene);
  const source = CreateBox("source", {}, scene);
  asset.meshes.push(source);
  asset.removeAllFromScene();
  const clone = vi.spyOn(asset, "instantiateModelsToScene");
  let finish!: (c: AssetContainer) => void;
  const detail = new Promise<AssetContainer>((resolve) => {
    finish = resolve;
  });
  const load = vi.fn(async (_scene: Scene, url: string) =>
    url.includes("/crowd/") ? asset : detail,
  );
  try {
    const roots = Array.from(
      { length: 600 },
      (_, i) => new Mesh(`citizen-${i}`, scene),
    );
    const visuals = await Promise.all(
      roots.map((root) =>
        createResidentVisual(
          scene,
          root,
          -0.5,
          "R03",
          "winter",
          () => null,
          load,
        ),
      ),
    );
    expect(new Set(load.mock.calls.map((c) => c[1]))).toEqual(
      new Set(["/models/residents/crowd/R03_Velociraptor_v2.glb"]),
    );
    expect(source.instances).toHaveLength(600);
    expect(roots[599]?.getChildMeshes()[0]).toBeInstanceOf(InstancedMesh);
    expect(clone).not.toHaveBeenCalled();
    visuals[0]?.setOutline(true);
    visuals[0]?.setOutline(false);
    visuals[599]?.setOutline(true);
    expect(
      roots[599]
        ?.getChildMeshes()
        .filter((m) => m.isEnabled() && m.renderOutline),
    ).toHaveLength(1);
    expect(source.renderOutline).toBeFalsy();
    finish(asset);
    await vi.waitFor(() => expect(clone).toHaveBeenCalledTimes(1));
    expect(
      roots[0]?.getChildMeshes().filter((m) => m.isEnabled()),
    ).toHaveLength(1);
    expect(
      roots[599]
        ?.getChildMeshes()
        .filter((m) => m.isEnabled() && m.renderOutline),
    ).toHaveLength(1);
    for (const visual of visuals) visual.dispose();
    expect(source.instances).toHaveLength(0);
    expect(scene.meshes).toHaveLength(600);
  } finally {
    asset.dispose();
    scene.dispose();
    engine.dispose();
  }
});

it("겨울 실패 시 같은 종 여름 GLB로 클릭·걷기·개별 선택·해제를 유지한다", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const selected = vi.fn(),
    entities = createSceneEntities(scene, selected);
  const assets: AssetContainer[] = [];
  installMeshoptDecoder();
  // Node has no script tag. Use the same installed offline meshopt decoder.
  const script = vi
    .spyOn(Tools, "LoadBabylonScriptAsync")
    .mockResolvedValue(undefined);
  const load = vi.fn(async (_scene: Scene, url: string) => {
    if (url.endsWith("_v2.glb")) throw Error("missing winter");
    const bytes = await readFile(new URL(`../public${url}`, import.meta.url));
    const asset = await LoadAssetContainerAsync(new Uint8Array(bytes), scene, {
      pluginExtension: ".glb",
    });
    assets.push(asset);
    return asset;
  });
  try {
    const camera = new FreeCamera("eye", new Vector3(0, 2, -10), scene);
    const base = createSceneExample();
    const resident = base.entities.find((e) => e.kind === "resident");
    if (!resident) throw Error("주민 없음");
    const disc = CreateDisc("shadow-source", { radius: 1 }, scene);
    disc.rotation.x = Math.PI / 2;
    disc.bakeCurrentTransformIntoVertices();
    disc.isPickable = disc.isVisible = false;
    entities.setGlb((_kind, parent, off, _level, species) =>
      createResidentVisual(
        scene,
        parent,
        off,
        species ?? "unknown",
        "winter",
        (at, radius, depth) => {
          const blob = disc.createInstance("contact-shadow");
          blob.parent = at;
          blob.scaling.set(radius, 1, depth);
          blob.position.set(radius * 0.25, 0.03, radius * 0.15);
          return blob;
        },
        load,
      ),
    );
    entities.update({
      ...base,
      entities: [
        {
          ...resident,
          id: "spino-51",
          species: "SPINO",
          position: { x: 5, y: 0, z: 0 },
        },
      ],
    });
    const root = scene.getMeshById("spino-51");
    if (!root) throw Error("주민 노드 없음");
    await vi.waitFor(() =>
      expect(
        root.getChildMeshes().some((m) => m instanceof InstancedMesh),
      ).toBe(true),
    );
    const crowd = root.getChildMeshes().find((m) => m.name.endsWith(":crowd"));
    if (!crowd) throw Error("군중 메시 없음");
    scene.render();
    const [shadow] = disc.instances;
    expect(shadow).toBeInstanceOf(InstancedMesh);
    const edge = new Ray(new Vector3(6.15, 4, 0), Vector3.Down());
    expect(scene.pickWithRay(edge, (m) => m === shadow)?.pickedMesh).toBe(
      shadow,
    );
    entities.selectMesh(scene.pickWithRay(edge)?.pickedMesh ?? null);
    expect(selected).not.toHaveBeenCalled();
    const hit = scene.pickWithRay(
      new Ray(new Vector3(5, 1, -8), new Vector3(0, 0, 1)),
    );
    expect(hit?.pickedMesh).toBe(crowd);
    entities.animate(0.1);
    const pivot = crowd.parent as Mesh;
    expect(pivot.rotation.z).not.toBe(0);
    camera.position.z = -120;
    scene.render();
    entities.animate(0.1);
    expect(pivot.rotation.z).toBe(0);
    entities.selectMesh(hit?.pickedMesh ?? null);
    expect(selected).toHaveBeenLastCalledWith(root.id);
    await vi.waitFor(() =>
      expect(
        scene.animationGroups.some(
          (g) => g.isPlaying && g.name.endsWith("Idle"),
        ),
      ).toBe(true),
    );
    expect(load.mock.calls.map((c) => c[1])).toEqual([
      "/models/residents/crowd/SPINO_Spinosaurus_v2.glb",
      "/models/residents/crowd/SPINO_Spinosaurus.glb",
      "/models/residents/SPINO_Spinosaurus_v2.glb",
      "/models/residents/SPINO_Spinosaurus.glb",
    ]);
    scene.render();
    const detailedHit = scene.pickWithRay(
      new Ray(new Vector3(5, 1, -8), new Vector3(0, 0, 1)),
    )?.pickedMesh;
    expect(detailedHit?.renderOutline).toBe(true);
    entities.selectMesh(detailedHit ?? null);
    expect(selected.mock.calls).toEqual([[root.id]]);
    entities.update({
      ...base,
      entities: [
        {
          ...resident,
          id: root.id,
          species: "SPINO",
          position: { x: 7, y: 0, z: 0 },
        },
      ],
    });
    entities.animate(0.1);
    expect(
      scene.animationGroups.some((g) => g.isPlaying && g.name.endsWith("Walk")),
    ).toBe(true);
    expect(crowd.isEnabled()).toBe(false);
    entities.select(null);
    expect(crowd.isEnabled()).toBe(true);
    expect(scene.animationGroups).toHaveLength(0);
    expect(root.getChildMeshes()).toEqual(
      expect.arrayContaining([crowd, shadow]),
    );
    expect(root.getChildMeshes()).toHaveLength(2);
  } finally {
    entities.dispose();
    for (const a of assets) a.dispose();
    scene.dispose();
    engine.dispose();
    script.mockRestore();
  }
});
