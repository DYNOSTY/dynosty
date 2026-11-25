import { AssetContainer } from "@babylonjs/core/assetContainer";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { NodeIO } from "@gltf-transform/core";
import { getBounds } from "@gltf-transform/functions";
import { describe, expect, it, vi } from "vitest";
import * as assets from "./scene-assets.js";
import { createVillage, residentGlb } from "./village.js";

it.each(["summer", "winter"] as const)(
  "%s 법령 배달 포졸은 일반 R02 모델로 나타난다",
  async (season) => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    // NullEngine has no canvas for drawing the smoke texture and decree text.
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return {
            createRadialGradient: () => ({ addColorStop() {} }),
            fillRect() {},
            fillText() {},
          };
        }
      },
    );
    const load = vi
      .spyOn(assets, "loadSceneAsset")
      .mockRejectedValue(Error("missing asset"));
    try {
      const village = createVillage(
        scene,
        () => null,
        {
          glow: { addIncludedOnlyMesh() {} },
          warmMat: new StandardMaterial("warm", scene),
        },
        new TransformNode("world", scene),
        season,
      );
      await village.ready;
      load.mockClear();
      const regular = new AssetContainer(scene);
      regular.meshes.push(CreateBox("R02", {}, scene));
      regular.removeAllFromScene();
      load.mockImplementation(async (_, url) => {
        if (url === "/models/residents/R02_Triceratops.glb") return regular;
        throw Error("missing asset");
      });
      village.postDecree("법령", true);
      village.animate(0.1);
      expect(load.mock.calls.map(([, url]) => url)).toEqual([
        "/models/residents/R02_Triceratops.glb",
      ]);
      await vi.waitFor(() =>
        expect(scene.getMeshByName("관아 포졸:glb:R02")?.isEnabled()).toBe(
          true,
        ),
      );
      village.dispose();
      regular.dispose();
    } finally {
      load.mockRestore();
      vi.unstubAllGlobals();
      scene.dispose();
      engine.dispose();
    }
  },
);

describe("게임 주민 GLB", () => {
  it.each([
    ["R02", "R02_Triceratops"],
    ["R03", "R03_Velociraptor"],
    ["SPINO", "SPINO_Spinosaurus"],
  ])("%s의 계절별 고유 모델을 선택한다", async (species, file) => {
    expect(residentGlb(species, "summer")?.url).toBe(
      `/models/residents/${file}.glb`,
    );
    expect(residentGlb(species, "winter")?.url).toBe(
      `/models/residents/${file}_v2.glb`,
    );
    // Rest-pose vertex extrema (including joint transforms), summer/winter
    // agree within 0.2 mm. A positive scale alone cannot catch an unreadable sail.
    const bounds =
      species === "R02"
        ? ([0, 1.7736, 1.33] as const)
        : species === "R03"
          ? ([0.01542, 2.36088, 1.65] as const)
          : ([0.03999, 2.68, 2.35] as const);
    for (const season of ["summer", "winter"] as const) {
      const model = residentGlb(species, season);
      if (!model) throw Error(`Missing ${species}`);
      const document = await new NodeIO().read(
        new URL(`../public${model.crowdUrl}`, import.meta.url).pathname,
      );
      const crowdScene =
        document.getRoot().getDefaultScene() ??
        document.getRoot().listScenes()[0];
      if (!crowdScene) throw Error("군중 장면 없음");
      const { min, max } = getBounds(crowdScene);
      // Decimation may move an extremal vertex, but not a visible amount.
      expect(Math.abs((min[1] - model.bottom) * model.scale)).toBeLessThan(
        0.02,
      );
      expect(
        Math.abs((max[1] - min[1]) * model.scale - bounds[2]),
      ).toBeLessThan(0.02);
      expect((bounds[0] - model.bottom) * model.scale).toBeCloseTo(0, 3);
      expect((bounds[1] - bounds[0]) * model.scale).toBeCloseTo(bounds[2], 2);
    }
  });
  it("알 수 없는 종은 GLB를 사용하지 않는다", () =>
    expect(residentGlb("unknown", "winter")).toBeNull());
});
