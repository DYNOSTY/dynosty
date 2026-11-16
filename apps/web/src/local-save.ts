import {
  type ExampleSave,
  isRecord,
  parseExampleSave,
  SaveDataError,
} from "@dynosty/game-core";

export const LOCAL_SAVE_KEY = "dynosty.example.saves";
export type SaveSlot = "current" | "previous";
export interface ExampleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function readArchive(raw: string): Record<string, unknown> {
  let archive: unknown;
  try {
    archive = JSON.parse(raw);
  } catch {
    throw new SaveDataError(
      "저장 데이터가 손상되었습니다. 기존 저장은 유지됩니다.",
    );
  }
  if (
    !isRecord(archive) ||
    archive.format !== "dynosty-local-example" ||
    archive.storageVersion !== 1 ||
    !("current" in archive) ||
    !("previous" in archive)
  )
    throw new SaveDataError(
      "지원하지 않는 저장 묶음입니다. 기존 저장은 유지됩니다.",
    );
  return archive;
}

export function saveLocalExample(storage: ExampleStorage, value: ExampleSave) {
  const current = parseExampleSave(value);
  const raw = storage.getItem(LOCAL_SAVE_KEY);
  let previous: ExampleSave | null = null;
  if (raw !== null) {
    const archive = readArchive(raw);
    // 손상된 기존 기록을 새 저장으로 덮어 지우지 않는다.
    previous = parseExampleSave(archive.current);
    if (archive.previous !== null) parseExampleSave(archive.previous);
  }
  const encoded = JSON.stringify({
    format: "dynosty-local-example",
    storageVersion: 1,
    current,
    previous,
  });
  // localStorage의 단일 항목 쓰기는 원자적이다. 쓰기 실패 시 두 슬롯 모두 유지된다.
  storage.setItem(LOCAL_SAVE_KEY, encoded);
}

export function loadLocalExample(
  storage: ExampleStorage,
  slot: SaveSlot = "current",
): ExampleSave {
  const raw = storage.getItem(LOCAL_SAVE_KEY);
  if (raw === null) throw new SaveDataError("저장된 예제가 없습니다.");
  const archive = readArchive(raw);
  if (slot === "previous" && archive.previous === null)
    throw new SaveDataError("이전 저장이 없습니다.");
  return parseExampleSave(archive[slot]);
}

export function localSaveError(error: unknown): string {
  return error instanceof SaveDataError
    ? error.message
    : "브라우저 저장소를 사용할 수 없습니다. 저장 권한이나 여유 공간을 확인해 주세요. 기존 저장은 유지됩니다.";
}
