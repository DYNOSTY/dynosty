import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { Scene } from "@babylonjs/core/scene";
import { expect, test } from "vitest";
import { createFog, getInitialMistCircles } from "./fog.js";
import { SCOUT_SITES } from "./scout-sites.js";

test("NullEngine 재질에 안개가 등록되고 정찰 후 2초 동안 걷힌다", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const fog = createFog(scene, SCOUT_SITES);
  const material = new StandardMaterial("frozen", scene);
  const pbr = new PBRMaterial("pbr", scene);
  const plugin = material.pluginManager?.getPlugin("DynostyMist");
  expect(plugin?.registerForExtraEvents).toBe(true);
  expect(pbr.pluginManager?.getPlugin("DynostyMist")).toBeDefined();
  material.freeze();

  let sites = new Float32Array();
  let initial = new Float32Array();
  const ubo = {
    updateFloat3() {},
    updateFloat4() {},
    updateFloatArray(name: string, value: Float32Array) {
      if (name === "mistSites") sites = new Float32Array(value);
      if (name === "mistInitial") initial = new Float32Array(value);
    },
  } as unknown as UniformBuffer;
  const read = () => {
    plugin?.hardBindForSubMesh(ubo, scene, engine, null!);
    return sites[3];
  };
  const first = SCOUT_SITES[0];
  expect(first).toBeDefined();
  expect(read()).toBe(0);
  const expected = getInitialMistCircles();
  expect(initial.length).toBe(expected.length * 4);
  expected.forEach((circle, i) => {
    expect(Array.from(initial.slice(i * 4, i * 4 + 4))).toEqual([
      circle.x,
      circle.z,
      circle.radius,
      0,
    ]);
  });
  fog.reveal(first!.id);
  fog.animate(1);
  expect(read()).toBeCloseTo(0.5);
  fog.animate(1);
  expect(read()).toBe(1);
  fog.reset();
  expect(read()).toBe(0);
  fog.dispose();
  scene.dispose();
  engine.dispose();
});
