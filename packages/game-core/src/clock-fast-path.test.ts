import { expect, it } from "vitest";
import * as play from "./play.js";

it("검증된 시계는 자정을 넘겨도 주민과 건물을 다시 복사하지 않는다", () => {
  const state = { ...play.createPlayState(), minute: 1439 };
  const next = play.advanceParsedClock(state, 1);
  expect(next.day).toBe(2);
  expect(next.minute).toBe(0);
  expect(next).toEqual(play.advancePlayClock(state, 1));
  expect(next.citizens).toBe(state.citizens);
  expect(next.buildings).toBe(state.buildings);
  expect(() =>
    play.advanceParsedClock({ ...state, day: 100_000 }, 1),
  ).toThrow();
  expect(() => play.advancePlayClock({ ...state, minute: -1 }, 1)).toThrow();
});
