import {
  type ExampleSave,
  parseExampleSave,
  SaveDataError,
} from "@dynosty/game-core";
import {
  type ExampleStorage,
  loadLocalExample,
  type SaveSlot,
} from "./local-save.js";

export const MAX_SAVE_FILE_BYTES = 64 * 1024;
export interface SaveFile {
  readonly name: string;
  readonly size: number;
  text(): Promise<string>;
}

export async function readSaveFile(file: SaveFile): Promise<ExampleSave> {
  if (!/\.json$/i.test(file.name))
    throw new SaveDataError("JSON 저장 파일을 선택해 주세요.");
  if (
    !Number.isSafeInteger(file.size) ||
    file.size <= 0 ||
    file.size > MAX_SAVE_FILE_BYTES
  )
    throw new SaveDataError(
      "저장 파일은 비어 있지 않은 64KB 이하 파일이어야 합니다.",
    );
  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new SaveDataError("파일을 읽지 못했습니다. 기존 저장은 유지됩니다.");
  }
  try {
    return parseExampleSave(JSON.parse(text.replace(/^\uFEFF/, "")));
  } catch (error) {
    if (error instanceof SaveDataError) throw error;
    throw new SaveDataError("저장 파일의 JSON 형식이 올바르지 않습니다.");
  }
}

export function exportSaveFile(storage: ExampleStorage, slot: SaveSlot) {
  const save = loadLocalExample(storage, slot);
  return {
    fileName: `dynosty-example-day-${save.game.day}-${slot}.json`,
    text: `${JSON.stringify(save, null, 2)}\n`,
  };
}
