import {
  isRecord,
  parseTimberSave,
  TimberError,
  type TimberSave,
} from "@dynosty/game-core";
import type { ExampleStorage } from "./local-save.js";
export const TIMBER_SAVE_KEY = "dynosty.timber.saves.v17";
function archive(storage: ExampleStorage) {
  const raw =
    storage.getItem(TIMBER_SAVE_KEY) ??
    storage.getItem("dynosty.timber.saves.v16") ??
    storage.getItem("dynosty.timber.saves.v15") ??
    storage.getItem("dynosty.timber.saves.v14") ??
    storage.getItem("dynosty.timber.saves.v13") ??
    storage.getItem("dynosty.timber.saves.v12") ??
    storage.getItem("dynosty.timber.saves.v11") ??
    storage.getItem("dynosty.timber.saves.v10");
  if (raw === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new TimberError(
      "체험판 저장 기록이 손상됐습니다. 기존 원본을 유지합니다.",
    );
  }
  if (
    !isRecord(v) ||
    v.format !== "dynosty-timber-archive" ||
    v.storageVersion !== 1 ||
    !("previous" in v)
  )
    throw new TimberError(
      "지원하지 않는 체험판 저장 묶음입니다. 원본을 유지합니다.",
    );
  return {
    current: parseTimberSave(v.current),
    previous: v.previous === null ? null : parseTimberSave(v.previous),
  };
}
export function saveTimber(storage: ExampleStorage, save: TimberSave) {
  const parsed = parseTimberSave(save),
    old = archive(storage);
  storage.setItem(
    TIMBER_SAVE_KEY,
    JSON.stringify({
      format: "dynosty-timber-archive",
      storageVersion: 1,
      current: parsed,
      previous: old?.current ?? null,
    }),
  );
}
export function loadTimber(storage: ExampleStorage, previous = false) {
  const a = archive(storage),
    s = previous ? a?.previous : a?.current;
  if (!s) throw new TimberError("해당 체험판 저장이 없습니다.");
  return parseTimberSave(s);
}
export function timberSaveError(e: unknown) {
  return e instanceof TimberError
    ? e.message
    : "체험판 저장소를 사용할 수 없습니다. 현재 진행과 기존 기록은 유지됩니다.";
}
