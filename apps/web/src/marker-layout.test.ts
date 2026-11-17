import { expect, it } from "vitest";
import { type MarkerRect, placeMarker } from "./marker-layout.js";

it("가까운 주민/장소 표지를 화면 안에서 겹치지 않게 놓는다", () => {
  const occupied: MarkerRect[] = [];
  for (const [x, y, w] of [
    [100, 80, 65],
    [112, 81, 70],
    [107, 82, 55],
    [2, 90, 80],
    [198, 95, 80],
  ]) {
    const r = placeMarker(x ?? 0, y ?? 0, w ?? 0, 20, 200, 200, occupied);
    expect(r).not.toBeNull();
    if (!r) throw Error("표지 없음");
    expect(r.left).toBeGreaterThanOrEqual(0);
    expect(r.left + r.width).toBeLessThanOrEqual(200);
    for (const b of occupied)
      expect(
        r.left + r.width <= b.left ||
          b.left + b.width <= r.left ||
          r.top + r.height <= b.top ||
          b.top + b.height <= r.top,
      ).toBe(true);
    occupied.push(r);
  }
});
it("표시 공간이 없으면 잘못된 좌표 대신 숨기고 다음 프레임 빈 공간에서는 복귀한다", () => {
  expect(
    placeMarker(50, 50, 30, 20, 100, 100, [
      { left: 0, top: 0, width: 100, height: 100 },
    ]),
  ).toBeNull();
  expect(placeMarker(50, 50, 30, 20, 100, 100, [])).toEqual({
    left: 35,
    top: 30,
    width: 30,
    height: 20,
  });
});
