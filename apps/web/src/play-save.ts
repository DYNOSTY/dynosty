import {
  isRecord,
  PlayDataError,
  type PlaySave,
  parsePlaySave,
} from "@dynosty/game-core";
import type { ExampleStorage, SaveSlot } from "./local-save.js";
export const PLAY_SAVE_KEY = "dynosty.play.saves";
function archive(storage: ExampleStorage) {
  const raw = storage.getItem(PLAY_SAVE_KEY);
  if (raw === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new PlayDataError(
      "게임 저장 기록이 손상되었습니다. 기존 기록은 유지됩니다.",
    );
  }
  if (
    !isRecord(v) ||
    v.format !== "dynosty-play-archive" ||
    v.storageVersion !== 1 ||
    !("current" in v) ||
    !("previous" in v)
  )
    throw new PlayDataError(
      "지원하지 않는 게임 저장 묶음입니다. 기존 기록은 유지됩니다.",
    );
  const current = parsePlaySave(v.current);
  const previous = v.previous === null ? null : parsePlaySave(v.previous);
  return { current, previous };
}
export function savePlay(storage: ExampleStorage, save: PlaySave) {
  const current = parsePlaySave(save);
  const old = archive(storage);
  storage.setItem(
    PLAY_SAVE_KEY,
    JSON.stringify({
      format: "dynosty-play-archive",
      storageVersion: 1,
      current,
      previous: old?.current ?? null,
    }),
  );
}
export function loadPlay(
  storage: ExampleStorage,
  slot: SaveSlot = "current",
): PlaySave {
  const a = archive(storage);
  if (!a?.[slot]) throw new PlayDataError("해당 게임 저장 기록이 없습니다.");
  return parsePlaySave(a[slot]);
}
export function playSaveError(error: unknown) {
  return error instanceof PlayDataError
    ? error.message
    : "게임 저장소를 사용할 수 없습니다. 현재 게임과 기존 기록은 유지됩니다.";
}
