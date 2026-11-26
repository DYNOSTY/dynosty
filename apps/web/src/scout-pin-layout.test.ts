import { expect, test } from "vitest";
import { placeScoutPin } from "./scout-pin-layout.js";

const pin = { left: 10, top: 40, width: 30, height: 20 };

test("겹친 표식은 아래쪽 빈 공간을 먼저 사용한다", () => {
  expect(placeScoutPin(pin, 0, 100, [pin])?.top).toBe(63);
});

test("아래 공간이 부족하면 위쪽을 찾고 범위를 벗어나지 않는다", () => {
  expect(placeScoutPin(pin, 0, 75, [pin])?.top).toBe(17);
  expect(placeScoutPin(pin, 40, 60, [pin])).toBeNull();
});
