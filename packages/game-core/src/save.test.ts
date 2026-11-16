import { describe, expect, it } from "vitest";
import { createInitialState } from "./index.js";
import { createExampleSave, parseExampleSave, SaveDataError } from "./save.js";

describe("예제 저장 규격", () => {
  it("날짜와 표시 모드를 복사하고 알 수 없는 필드는 실행 상태에 넣지 않는다", () => {
    const saved = createExampleSave({ schemaVersion: 1, day: 12 }, true);
    const restored = parseExampleSave({
      ...JSON.parse(JSON.stringify(saved)),
      unexpected: "ignored",
    });
    expect(restored).toEqual(saved);
    expect(restored.game).not.toBe(saved.game);
    expect(createExampleSave(createInitialState(), false).game.day).toBe(1);
  });

  it.each([
    null,
    [],
    {},
    { format: "other", saveVersion: 1 },
    { ...createExampleSave(createInitialState(), false), saveVersion: 2 },
    {
      ...createExampleSave(createInitialState(), false),
      sceneExampleUpdated: 1,
    },
    ...[0, -1, 1.5, "2", Number.NaN, Number.POSITIVE_INFINITY].map((day) => ({
      ...createExampleSave(createInitialState(), false),
      game: { schemaVersion: 1, day },
    })),
    {
      ...createExampleSave(createInitialState(), false),
      game: { schemaVersion: 2, day: 1 },
    },
  ])("손상되거나 지원하지 않는 저장을 거부한다: %j", (value) => {
    expect(() => parseExampleSave(value)).toThrow(SaveDataError);
  });
});
