import { describe, expect, it } from "vitest";
import { createSceneExample, validateSceneSnapshot } from "./scene.js";

describe("3D 전달 규격", () => {
  it("Worker에서 복사할 수 있는 값만 전달하며 초기 상태를 공유하지 않는다", () => {
    const first = createSceneExample();
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(createSceneExample()).not.toBe(first);
    expect(createSceneExample().entities[0]).not.toBe(first.entities[0]);
    expect(() => validateSceneSnapshot(first)).not.toThrow();
    expect(() => validateSceneSnapshot(createSceneExample(true))).not.toThrow();
  });

  it("같은 식별값의 위치와 표시 상태만 바꾸고 원본은 보존한다", () => {
    const before = createSceneExample();
    const after = createSceneExample(true);
    expect(after.entities.map((entity) => entity.id)).toEqual(
      before.entities.map((entity) => entity.id),
    );
    expect(before.entities[0]).toMatchObject({
      position: { x: -2 },
      motion: "idle",
    });
    expect(after.entities[0]).toMatchObject({
      position: { x: 2 },
      motion: "walking",
    });
  });

  it("중복 식별값과 비정상 좌표를 거부한다", () => {
    const example = createSceneExample();
    const resident = example.entities[0];
    if (!resident) throw new Error("주민 예제 누락");
    expect(() =>
      validateSceneSnapshot({ ...example, entities: [resident, resident] }),
    ).toThrow(RangeError);
    expect(() =>
      validateSceneSnapshot({
        ...example,
        entities: [{ ...resident, position: { x: Number.NaN, y: 0, z: 0 } }],
      }),
    ).toThrow(RangeError);
  });
});
