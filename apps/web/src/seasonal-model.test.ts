import { existsSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";
import { seasonalModelUrl } from "./seasonal-model.js";

const publicDir = new URL("../public", import.meta.url);

it("겨울에도 실제로 있는 모델 파일만 요청한다", () => {
  for (const folder of ["buildings", "residents"] as const) {
    const models = readdirSync(new URL(`models/${folder}/`, `${publicDir}/`))
      .filter((name) => name.endsWith(".glb") && !name.endsWith("_v2.glb"))
      .map((name) => name.slice(0, -4));
    expect(models.length).toBeGreaterThan(0);
    for (const model of models)
      for (const winter of [false, true]) {
        const url = seasonalModelUrl(folder, model, winter);
        expect(existsSync(new URL(`.${url}`, `${publicDir}/`)), url).toBe(true);
      }
  }
  expect(seasonalModelUrl("buildings", "BLD_NEST", true)).toBe(
    "/models/buildings/BLD_NEST_v2.glb",
  );
  expect(seasonalModelUrl("buildings", "BLD_OFFICE", true)).toBe(
    "/models/buildings/BLD_OFFICE_v2.glb",
  );
});
