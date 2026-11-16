import type { GameState } from "./index.js";

export interface ExampleSave {
  readonly format: "dynosty-example";
  readonly saveVersion: 1;
  readonly game: GameState;
  readonly sceneExampleUpdated: boolean;
}

export class SaveDataError extends Error {}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 외부 저장은 TypeScript 형식을 신뢰하지 않고 값 전체를 확인한 뒤 새 객체로 만든다.
export function parseExampleSave(value: unknown): ExampleSave {
  if (!isRecord(value) || value.format !== "dynosty-example")
    throw new SaveDataError("예제 저장 데이터의 형식이 올바르지 않습니다.");
  if (value.saveVersion !== 1)
    throw new SaveDataError("지원하지 않는 저장 버전입니다.");
  const game = value.game;
  if (
    !isRecord(game) ||
    game.schemaVersion !== 1 ||
    typeof game.day !== "number" ||
    !Number.isSafeInteger(game.day) ||
    game.day < 1 ||
    typeof value.sceneExampleUpdated !== "boolean"
  )
    throw new SaveDataError("저장된 날짜나 3D 예제 상태가 올바르지 않습니다.");
  return {
    format: "dynosty-example",
    saveVersion: 1,
    game: { schemaVersion: 1, day: game.day },
    sceneExampleUpdated: value.sceneExampleUpdated,
  };
}

export function createExampleSave(
  game: GameState,
  sceneExampleUpdated: boolean,
): ExampleSave {
  return parseExampleSave({
    format: "dynosty-example",
    saveVersion: 1,
    game,
    sceneExampleUpdated,
  });
}
