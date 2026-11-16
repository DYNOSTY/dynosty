import { isRecord } from "@dynosty/game-core";
import type { SettingsStorage } from "./settings.js";

export const AUDIO_CATALOG_KEY = "dynosty.audio.catalog";
export type AudioKind = "bgm" | "voice";
export interface AudioEntry {
  readonly id: string;
  readonly kind: AudioKind;
  readonly name: string;
  readonly fileName: string | null;
}
export interface AudioCatalog {
  readonly catalogVersion: 1;
  readonly entries: readonly AudioEntry[];
}
export class AudioCatalogError extends Error {}
export const emptyAudioCatalog = (): AudioCatalog => ({
  catalogVersion: 1,
  entries: [],
});

export function parseAudioCatalog(value: unknown): AudioCatalog {
  if (
    !isRecord(value) ||
    value.catalogVersion !== 1 ||
    !Array.isArray(value.entries) ||
    value.entries.length > 500
  )
    throw new AudioCatalogError("지원하지 않거나 손상된 음원 목록입니다.");
  const ids = new Set<string>();
  const names = new Set<string>();
  const entries = value.entries.map((entry): AudioEntry => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      !entry.id.trim() ||
      entry.id.length > 100 ||
      (entry.kind !== "bgm" && entry.kind !== "voice") ||
      typeof entry.name !== "string"
    )
      throw new AudioCatalogError("음원 목록의 항목이 올바르지 않습니다.");
    const name = entry.name.trim().normalize("NFC");
    if (!name || name.length > 80)
      throw new AudioCatalogError("음원 이름은 1~80자로 입력해 주세요.");
    if (
      entry.fileName !== null &&
      (typeof entry.fileName !== "string" ||
        !entry.fileName ||
        entry.fileName.length > 255)
    )
      throw new AudioCatalogError("연결 파일명이 올바르지 않습니다.");
    const nameKey = `${entry.kind}:${name.toLowerCase()}`;
    if (ids.has(entry.id) || names.has(nameKey))
      throw new AudioCatalogError(
        "같은 종류의 음원 이름이나 식별값이 중복됩니다.",
      );
    ids.add(entry.id);
    names.add(nameKey);
    return { id: entry.id, kind: entry.kind, name, fileName: entry.fileName };
  });
  return { catalogVersion: 1, entries };
}

export function readAudioCatalog(storage: SettingsStorage) {
  try {
    const raw = storage.getItem(AUDIO_CATALOG_KEY);
    return {
      catalog:
        raw === null ? emptyAudioCatalog() : parseAudioCatalog(JSON.parse(raw)),
      warning: null,
    };
  } catch {
    return {
      catalog: emptyAudioCatalog(),
      warning:
        "음원 목록을 읽지 못했습니다. 기존 기록은 유지되며 파일 직접 선택으로 재생할 수 있습니다.",
    };
  }
}

export function writeAudioCatalog(
  storage: SettingsStorage,
  catalog: AudioCatalog,
) {
  const valid = parseAudioCatalog(catalog);
  const old = storage.getItem(AUDIO_CATALOG_KEY);
  if (old !== null) {
    try {
      parseAudioCatalog(JSON.parse(old));
    } catch {
      throw new AudioCatalogError(
        "기존 음원 목록이 손상되어 덮어쓰지 않았습니다. 파일 직접 선택으로 재생할 수 있습니다.",
      );
    }
  }
  storage.setItem(AUDIO_CATALOG_KEY, JSON.stringify(valid));
}

export function addAudioEntry(
  catalog: AudioCatalog,
  entry: AudioEntry,
): AudioCatalog {
  return parseAudioCatalog({
    ...catalog,
    entries: [...catalog.entries, entry],
  });
}

export function changeAudioEntry(
  catalog: AudioCatalog,
  id: string,
  patch: Partial<Pick<AudioEntry, "name" | "fileName">>,
): AudioCatalog {
  if (!catalog.entries.some((entry) => entry.id === id))
    throw new AudioCatalogError("음원 항목을 찾지 못했습니다.");
  return parseAudioCatalog({
    ...catalog,
    entries: catalog.entries.map((entry) =>
      entry.id === id ? { ...entry, ...patch } : entry,
    ),
  });
}

export function removeAudioEntry(
  catalog: AudioCatalog,
  id: string,
): AudioCatalog {
  if (!catalog.entries.some((entry) => entry.id === id))
    throw new AudioCatalogError("음원 항목을 찾지 못했습니다.");
  return {
    ...catalog,
    entries: catalog.entries.filter((entry) => entry.id !== id),
  };
}

export function audioCatalogError(error: unknown): string {
  return error instanceof AudioCatalogError
    ? error.message
    : "음원 목록을 저장하지 못했습니다. 기존 목록과 파일 연결은 유지됩니다.";
}
