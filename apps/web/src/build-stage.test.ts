import { describe, expect, it } from "vitest";
import { buildStage } from "./build-stage.js";

describe("buildStage", () => {
  it("진행률을 세 단계로 나눈다", () => {
    expect(
      [-1, 0, 1 / 3 - 0.001, 1 / 3, 2 / 3 - 0.001, 2 / 3, 1, 2].map(buildStage),
    ).toEqual([1, 1, 1, 2, 2, 3, 3, 3]);
    expect(buildStage(Number.NaN)).toBe(1);
  });
});
