import {
  isRecord,
  type LaborSave,
  parseLaborSave,
  LegacyTimberError as TimberError,
} from "@dynosty/game-core";
import type { ExampleStorage } from "./local-save.js";
export const LABOR_SAVE_KEY = "dynosty.labor.saves";
function archive(storage: ExampleStorage) {
  const raw = storage.getItem(LABOR_SAVE_KEY);
  if (raw === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new TimberError(
      "일손 저장 기록이 손상됐습니다. 기존 원본을 유지합니다.",
    );
  }
  if (
    !isRecord(v) ||
    v.format !== "dynosty-labor-archive" ||
    v.storageVersion !== 1 ||
    !("previous" in v)
  )
    throw new TimberError(
      "지원하지 않는 일손 저장 묶음입니다. 원본을 유지합니다.",
    );
  return {
    current: parseLaborSave(v.current),
    previous: v.previous === null ? null : parseLaborSave(v.previous),
  };
}
export function saveLabor(storage: ExampleStorage, s: LaborSave) {
  const current = parseLaborSave(s),
    old = archive(storage);
  storage.setItem(
    LABOR_SAVE_KEY,
    JSON.stringify({
      format: "dynosty-labor-archive",
      storageVersion: 1,
      current,
      previous: old?.current ?? null,
    }),
  );
}
export function loadLabor(storage: ExampleStorage, previous = false) {
  const a = archive(storage),
    s = previous ? a?.previous : a?.current;
  if (!s) throw new TimberError("해당 일손 체험 저장이 없습니다.");
  // archive에서 최근·이전 저장을 모두 검사하고 복사했으므로 선택한 값을 재검사하지 않는다.
  return s;
}
export function laborSaveError(e: unknown) {
  return e instanceof TimberError
    ? e.message
    : "일손 저장소를 사용할 수 없습니다. 현재 진행과 기존 원본은 유지됩니다.";
}
