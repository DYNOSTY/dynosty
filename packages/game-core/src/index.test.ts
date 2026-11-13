import { describe, expect, it } from "vitest";
import { advanceDay, createInitialState } from "./index.js";

describe("게임 상태", () => {
  it("하루를 진행해도 이전 저장 상태를 바꾸지 않는다", () => {
    const before = Object.freeze(createInitialState());
    expect(advanceDay(before)).toEqual({ schemaVersion: 1, day: 2 });
    expect(before.day).toBe(1);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER])(
    "잘못된 날짜 %s를 거부한다",
    (day) => {
      expect(() => advanceDay({ schemaVersion: 1, day })).toThrow(RangeError);
    },
  );
});
