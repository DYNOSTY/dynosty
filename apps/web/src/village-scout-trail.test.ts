import { describe, expect, it } from "vitest";
import { scoutTrailCount } from "./village.js";

describe("정찰 발자국 표시 개수", () => {
  it("출발 전에는 없고 이동한 비율만큼 늘며 귀환 중에도 유지된다", () => {
    expect(scoutTrailCount(10, -1, 100)).toBe(0);
    expect(scoutTrailCount(10, 29, 100)).toBe(2);
    expect(scoutTrailCount(10, 100, 100)).toBe(10);
    expect(scoutTrailCount(10, 300, 100)).toBe(10);
  });
  it("이동 시간이 0이어도 유한한 개수를 반환한다", () => {
    expect(scoutTrailCount(10, -1, 0)).toBe(0);
    expect(scoutTrailCount(10, 0, 0)).toBe(10);
  });
});
