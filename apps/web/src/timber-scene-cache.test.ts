import { createVillageGame, timberScene } from "@dynosty/game-core";
import { expect, it } from "vitest";
import { rememberScene, sceneOf } from "./timber-scene-cache.js";

it("워커 장면은 동일 객체로 반환하고 없는 장면은 생성해 저장한다", () => {
  const state = createVillageGame();
  const scene = timberScene(state);
  rememberScene(state, scene);
  expect(sceneOf(state)).toBe(scene);
  const unknown = createVillageGame();
  const fallback = sceneOf(unknown);
  expect(fallback).toEqual(timberScene(unknown));
  expect(sceneOf(unknown)).toBe(fallback);
});
