import { expect, it } from "vitest";
import { residentPath } from "./resident-path.js";

it("완료 위치에서 시작 위치로 돌아가는 경로가 집과 주민의 여유 폭을 침범하지 않는다", () => {
  const start = { x: 4, z: -3 },
    goal = { x: -2, z: 1 };
  const path = residentPath(start, goal, [{ x: 0, z: -1 }]);
  expect(path.length).toBeGreaterThan(1);
  expect(path.at(-1)).toEqual(goal);
  let from = start;
  for (const to of path) {
    for (let i = 0; i <= 100; i++) {
      const x = from.x + ((to.x - from.x) * i) / 100;
      const z = from.z + ((to.z - from.z) * i) / 100;
      expect(x >= -1.75 && x <= 1.75 && z >= -2.75 && z <= 0.75).toBe(false);
    }
    from = to;
  }
});

it("막히지 않은 길은 직진하고 건물 안의 목적지는 통과 경로를 만들지 않는다", () => {
  expect(
    residentPath({ x: -2, z: 1 }, { x: 2, z: 1 }, [{ x: 0, z: -1 }]),
  ).toEqual([{ x: 2, z: 1 }]);
  expect(
    residentPath({ x: -2, z: 1 }, { x: 0, z: -1 }, [{ x: 0, z: -1 }]),
  ).toEqual([]);
});
