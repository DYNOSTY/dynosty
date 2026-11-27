import { expect, it } from "vitest";
import { homePlacementIssue } from "./home-placement.js";
import { createCapital, createVillageGame } from "./timber.js";
import { buildingIssue } from "./town.js";

const message = "연료 더미와 겹쳐요.";
const pose = { position: { x: -22, z: 9 }, headingRadians: 0 };

it("처음 마을에서 연료 더미 위에 둥지를 지을 수 없다", () => {
  expect(homePlacementIssue(createVillageGame(), pose)).toBe(message);
});

it("처음 마을에서 연료 더미 위에 시설을 지을 수 없다", () => {
  expect(buildingIssue(createVillageGame(), "restaurant", pose)).toBe(message);
});

it("회전한 둥지의 가장자리가 연료 더미에 걸리면 막는다", () => {
  expect(
    homePlacementIssue(createVillageGame(), {
      position: { x: -22, z: 12.8 },
      headingRadians: Math.PI / 2,
    }),
  ).toBe(message);
});

it("연료 더미에서 떨어진 자리에는 연료 더미 메시지를 표시하지 않는다", () => {
  const nearby = { ...pose, position: { x: -28, z: 9 } };
  const state = createVillageGame();
  expect(homePlacementIssue(state, nearby)).not.toBe(message);
  expect(buildingIssue(state, "restaurant", nearby)).not.toBe(message);
});

it("도성에서는 숨겨진 연료 더미로 건설을 막지 않는다", () => {
  const state = createCapital(createVillageGame());
  expect(state.bokhol).toBeTruthy();
  expect(state.campaign?.beat).toBe("capital");
  expect(homePlacementIssue(state, pose)).not.toBe(message);
  expect(buildingIssue(state, "restaurant", pose)).not.toBe(message);
});
