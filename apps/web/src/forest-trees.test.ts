import { expect, it } from "vitest";
import { liftNeedleColor } from "./forest-trees.js";

it("어두운 침엽수 녹색을 선형 공간에서 여섯 배 밝힌다", () => {
  for (const color of [
    { r: 0.02, g: 0.05, b: 0.04 },
    { r: 0.05, g: 0.13, b: 0.1 },
  ]) {
    const result = liftNeedleColor(color);
    expect(result.r).toBeCloseTo(color.r * 6);
    expect(result.g).toBeCloseTo(color.g * 6);
    expect(result.b).toBeCloseTo(color.b * 6);
  }
});

it("눈과 껍질, 고목 색은 유지한다", () => {
  for (const color of [
    { r: 0.85, g: 0.89, b: 0.96 },
    { r: 0.3, g: 0.15, b: 0.1 },
    { r: 0.085, g: 0.08, b: 0.09 },
  ]) {
    expect(liftNeedleColor(color)).toEqual(color);
  }
});

it("밝힌 채널을 1 이하로 제한한다", () => {
  expect(liftNeedleColor({ r: 0.2, g: 0.29, b: 0.25 })).toEqual({
    r: 1,
    g: 1,
    b: 1,
  });
});
