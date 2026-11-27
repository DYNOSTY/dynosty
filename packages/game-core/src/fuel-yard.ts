import type { TimberState } from "./timber.js";

/** 창고 옆 장작 더미 · 석탄 더미 자리(3D: apps/web/src/fuelyard.ts). 박찬님 원본은 온돌 앞 큰길 양옆(±3.9, -4.6)이었지만
 * 지금 마을에서는 둥지·주민 줄과 겹쳐 창고(BLD_WAREHOUSE, -16, 2) 서쪽 빈 땅으로 옮김 */
export const FUEL_YARD_WOOD = { x: -22, z: 8 };
export const FUEL_YARD_COAL = { x: -22, z: 10 };

// 장작은 z 방향 1m, 한 줄의 x 범위 약 ±0.7m이고 석탄 반지름은 약 0.85m다.
export const FUEL_YARD_RECT = {
  position: { x: -22, z: 9 },
  headingRadians: 0,
  halfWidth: 1.0,
  halfDepth: 2.0,
};

export function fuelYardShown(s: TimberState): boolean {
  return !(s.bokhol && s.campaign?.beat === "capital");
}
