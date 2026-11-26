import { describe, expect, it } from "vitest";
import {
  forestCounts,
  forestDecorations,
  forestIsFar,
} from "./forest-layout.js";

describe("복홀 숲 배치", () => {
  it("남은 양에 따라 기존 인덱스 순서대로 나무가 그루터기로 바뀐다", () => {
    expect(forestCounts(120)).toEqual({ standing: 32, stumps: 0 });
    expect(forestCounts(119)).toEqual({ standing: 32, stumps: 0 });
    expect(forestCounts(60)).toEqual({ standing: 16, stumps: 16 });
    expect(forestCounts(0)).toEqual({ standing: 0, stumps: 32 });
    expect(forestCounts(-1)).toEqual({ standing: 0, stumps: 32 });
  });
  it("숲 중심과 마을 중심의 거리가 40m를 넘을 때 먼 모델을 쓴다", () => {
    expect(forestIsFar(40, 0)).toBe(false);
    expect(forestIsFar(-40, -8)).toBe(true);
    expect(forestIsFar(28, 28)).toBe(false);
  });
  it("모든 장식의 중심은 숲의 기존 범위 안이다", () => {
    expect(forestDecorations()).toHaveLength(5);
    for (const decoration of forestDecorations()) {
      expect(Math.abs(decoration.x)).toBeLessThanOrEqual(7);
      expect(Math.abs(decoration.z)).toBeLessThanOrEqual(9);
    }
  });
});
