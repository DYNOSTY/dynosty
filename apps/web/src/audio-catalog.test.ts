import { describe, expect, it } from "vitest";
import {
  AUDIO_CATALOG_KEY,
  addAudioEntry,
  changeAudioEntry,
  emptyAudioCatalog,
  parseAudioCatalog,
  readAudioCatalog,
  removeAudioEntry,
  writeAudioCatalog,
} from "./audio-catalog.js";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
const entry = {
  id: "bgm-1",
  kind: "bgm" as const,
  name: "아침",
  fileName: "morning.wav",
};

describe("음원 목록", () => {
  it("읽기만으로 저장하지 않고 파일·주소를 제외한 메타데이터만 복원한다", () => {
    const store = storage();
    expect(readAudioCatalog(store).catalog).toEqual(emptyAudioCatalog());
    expect(store.getItem(AUDIO_CATALOG_KEY)).toBeNull();
    store.setItem("dynosty.settings", "keep settings");
    store.setItem("dynosty.example.saves", "keep saves");
    const catalog = parseAudioCatalog({
      catalogVersion: 1,
      entries: [
        {
          ...entry,
          name: " 아침 ",
          url: "blob:temp",
          file: { bytes: "private" },
        },
      ],
    });
    writeAudioCatalog(store, catalog);
    expect(readAudioCatalog(store).catalog.entries).toEqual([entry]);
    expect(store.getItem(AUDIO_CATALOG_KEY)).not.toMatch(/blob:|private|bytes/);
    expect(store.getItem("dynosty.settings")).toBe("keep settings");
    expect(store.getItem("dynosty.example.saves")).toBe("keep saves");
  });

  it("항목을 새로 만들고 같은 ID로 이름·파일 연결을 바꾸며 원본을 보존한다", () => {
    const before = addAudioEntry(emptyAudioCatalog(), entry);
    const renamed = changeAudioEntry(before, entry.id, {
      name: "저녁",
      fileName: "evening.wav",
    });
    expect(renamed.entries[0]).toEqual({
      ...entry,
      name: "저녁",
      fileName: "evening.wav",
    });
    expect(before.entries).toEqual([entry]);
    expect(removeAudioEntry(renamed, entry.id).entries).toEqual([]);
    expect(renamed.entries).toHaveLength(1);
    expect(() => removeAudioEntry(before, "unknown")).toThrow();
    expect(() =>
      changeAudioEntry(before, "unknown", { name: "없음" }),
    ).toThrow();
  });

  it("종류 안의 중복·빈 이름을 거부하고 종류가 다른 같은 이름은 허용한다", () => {
    const before = addAudioEntry(emptyAudioCatalog(), {
      ...entry,
      name: "Theme",
    });
    expect(() =>
      addAudioEntry(before, { ...entry, id: "bgm-2", name: " theme " }),
    ).toThrow(/중복/);
    expect(() =>
      addAudioEntry(before, { ...entry, id: "bgm-2", name: " " }),
    ).toThrow(/이름/);
    expect(() =>
      changeAudioEntry(before, entry.id, { name: "x".repeat(81) }),
    ).toThrow(/이름/);
    expect(
      addAudioEntry(before, {
        ...entry,
        id: "voice-1",
        kind: "voice",
        name: "Theme",
        fileName: null,
      }).entries,
    ).toHaveLength(2);
    expect(() => addAudioEntry(before, { ...entry, kind: "voice" })).toThrow(
      /중복/,
    );
    const korean = addAudioEntry(emptyAudioCatalog(), { ...entry, name: "가" });
    expect(() =>
      addAudioEntry(korean, {
        ...entry,
        id: "other",
        name: "가".normalize("NFD"),
      }),
    ).toThrow(/중복/);
  });

  it.each([
    "{broken",
    "null",
    JSON.stringify({ catalogVersion: 2, entries: [] }),
    JSON.stringify({
      catalogVersion: 1,
      entries: [{ ...entry, kind: "video" }],
    }),
    JSON.stringify({
      catalogVersion: 1,
      entries: [{ ...entry, fileName: 42 }],
    }),
  ])("손상·미지원 기록은 읽기·수정 모두 원문을 보존한다: %s", (raw) => {
    const store = storage();
    store.setItem(AUDIO_CATALOG_KEY, raw);
    expect(readAudioCatalog(store).warning).not.toBeNull();
    expect(readAudioCatalog(store).catalog).toEqual(emptyAudioCatalog());
    expect(() => writeAudioCatalog(store, emptyAudioCatalog())).toThrow(
      /덮어쓰지/,
    );
    expect(store.getItem(AUDIO_CATALOG_KEY)).toBe(raw);
  });

  it("저장 실패·잘못된 새 목록·읽기 거부에서 기존 저장을 보존한다", () => {
    const store = storage();
    const before = addAudioEntry(emptyAudioCatalog(), entry);
    writeAudioCatalog(store, before);
    const raw = store.getItem(AUDIO_CATALOG_KEY);
    const denied = {
      getItem: store.getItem,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() =>
      writeAudioCatalog(denied, removeAudioEntry(before, entry.id)),
    ).toThrow("quota");
    expect(() =>
      writeAudioCatalog(store, { ...before, entries: [entry, entry] }),
    ).toThrow();
    expect(store.getItem(AUDIO_CATALOG_KEY)).toBe(raw);
    expect(
      readAudioCatalog({
        ...store,
        getItem: () => {
          throw new Error("denied");
        },
      }).warning,
    ).not.toBeNull();
  });
});
