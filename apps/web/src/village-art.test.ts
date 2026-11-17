import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { BUILDING_RULES, type BuildingKind } from "@dynosty/game-core";
import { expect, it } from "vitest";
import { facilityModel } from "./facility-model.js";
import { buildModel, parseModel } from "./model-assets.js";
import { residentModel } from "./resident-model.js";

it("14종 시설의 모든 단계와3종 주민 모델을 실제3D로 구성하고 정리한다", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    root = new Mesh("art-test", scene),
    mat = new StandardMaterial("art", scene);
  try {
    for (const kind of Object.keys(BUILDING_RULES) as BuildingKind[]) {
      const signatures = new Set<string>();
      for (const level of [1, 2, 3] as const) {
        const asset = parseModel(facilityModel(kind, level), "building");
        signatures.add(JSON.stringify(asset.parts));
        const v = buildModel(scene, root, mat, asset);
        expect(root.getChildMeshes().length).toBeGreaterThan(0);
        v.dispose();
        expect(root.getChildMeshes()).toHaveLength(0);
      }
      expect(signatures.size).toBe(3);
    }
    const trice = residentModel("R02"),
      raptor = residentModel("R03"),
      spino = residentModel("SPINO");
    expect(trice.parts.some((p) => p.name === "frill")).toBe(true);
    expect(trice.parts.filter((p) => p.role === "leg")).toHaveLength(4);
    expect(raptor.parts.filter((p) => p.role === "leg")).toHaveLength(2);
    expect(spino.parts.some((p) => p.name.startsWith("back-sail"))).toBe(true);
    for (const asset of [trice, raptor, spino]) {
      parseModel(asset, "resident");
      const v = buildModel(scene, root, mat, asset);
      v.setMotion("walking");
      v.animate(0.5);
      v.dispose();
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
