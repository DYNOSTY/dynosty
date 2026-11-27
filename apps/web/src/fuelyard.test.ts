import {
  createVillageGame,
  FUEL_YARD_COAL,
  FUEL_YARD_WOOD,
  fixedBuildingAt,
  VILLAGE_LAYOUT,
} from "@dynosty/game-core";
import { expect, test } from "vitest";
import { fuelCounts } from "./fuelyard.js";

test("연료 재고를 아래부터 채우고 최대 개수로 제한한다", () => {
  expect(fuelCounts(0, 0)).toEqual({ logs: 0, coal: [0, 0, 0] });
  expect(fuelCounts(5, 20)).toEqual({ logs: 5, coal: [3, 3, 2] });
  expect(fuelCounts(1000, 1000)).toEqual({ logs: 33, coal: [20, 20, 20] });
});

test("초기 복홀의 연료 더미는 고정 건물과 둥지 및 건설 부지에서 떨어진다", () => {
  const state = createVillageGame();
  for (const p of [FUEL_YARD_WOOD, FUEL_YARD_COAL]) {
    // 더미 주변 0.8m까지 건물의 4.5m 보호 범위와 분리한다.
    for (const dx of [-0.8, 0, 0.8])
      for (const dz of [-0.8, 0, 0.8]) {
        expect(fixedBuildingAt({ x: p.x + dx, z: p.z + dz }, false)).toBe(
          false,
        );
        for (const [, x, z] of VILLAGE_LAYOUT)
          expect(
            Math.abs(p.x + dx - x) >= 4.5 || Math.abs(p.z + dz - z) >= 4.5,
          ).toBe(true);
      }
    for (const home of state.homes)
      expect(
        Math.hypot(p.x - home.position.x, p.z - home.position.z),
      ).toBeGreaterThan(4.5);
    expect(state.construction).toBeNull();
    expect(state.town.orders).toHaveLength(0);
  }
});
