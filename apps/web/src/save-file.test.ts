import { createExampleSave, SaveDataError } from "@dynosty/game-core";
import { describe, expect, it, vi } from "vitest";
import {
  LOCAL_SAVE_KEY,
  loadLocalExample,
  saveLocalExample,
} from "./local-save.js";
import {
  exportSaveFile,
  MAX_SAVE_FILE_BYTES,
  readSaveFile,
} from "./save-file.js";

const first = createExampleSave({ schemaVersion: 1, day: 2 }, true);
const second = createExampleSave({ schemaVersion: 1, day: 3 }, false);
function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}
const file = (text: string) => ({
  name: "save.json",
  size: text.length,
  text: async () => text,
});

describe("저장 파일 변환과 기존 기록 보존", () => {
  it("최근·직전 저장을 각각 내보내고 다시 읽되 내보내기는 기록을 쓰지 않는다", async () => {
    const store = memoryStorage();
    saveLocalExample(store, first);
    saveLocalExample(store, second);
    const before = store.getItem(LOCAL_SAVE_KEY);
    const current = exportSaveFile(store, "current");
    const previous = exportSaveFile(store, "previous");
    expect(await readSaveFile(file(current.text))).toEqual(second);
    expect(await readSaveFile(file(previous.text))).toEqual(first);
    expect(store.getItem(LOCAL_SAVE_KEY)).toBe(before);
    expect(current.fileName).toMatch(/\.json$/);
    expect(await readSaveFile(file(`\uFEFF${previous.text}`))).toEqual(first);
  });

  it.each([
    { name: "wrong.txt", size: 10 },
    { name: "empty.json", size: 0 },
    { name: "large.json", size: MAX_SAVE_FILE_BYTES + 1 },
  ])("파일 이름·크기 검사는 내용을 읽기 전에 거부한다: %j", async (info) => {
    const text = vi.fn(async () => JSON.stringify(first));
    await expect(readSaveFile({ ...info, text })).rejects.toBeInstanceOf(
      SaveDataError,
    );
    expect(text).not.toHaveBeenCalled();
  });

  it.each([
    "{broken",
    "null",
    "[]",
    JSON.stringify({ ...first, saveVersion: 2 }),
    JSON.stringify({ ...first, game: { schemaVersion: 1, day: 0 } }),
  ])("손상·미지원 내용을 검사 단계에서 거부한다: %s", async (raw) => {
    await expect(readSaveFile(file(raw))).rejects.toBeInstanceOf(SaveDataError);
  });

  it("읽기 실패의 원본 오류를 노출하지 않는다", async () => {
    await expect(
      readSaveFile({
        name: "save.json",
        size: 10,
        text: async () => {
          throw new Error("private detail");
        },
      }),
    ).rejects.toThrow("파일을 읽지 못했습니다");
  });

  it("가져온 저장을 확정하면 기존 최근 저장을 직전으로 남기고 쓰기 실패 시 모두 보존한다", async () => {
    const store = memoryStorage();
    saveLocalExample(store, first);
    saveLocalExample(store, second);
    const candidate = await readSaveFile(file(JSON.stringify(first)));
    const before = store.getItem(LOCAL_SAVE_KEY);
    const full = {
      getItem: store.getItem,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => saveLocalExample(full, candidate)).toThrow();
    expect(store.getItem(LOCAL_SAVE_KEY)).toBe(before);
    saveLocalExample(store, candidate);
    expect(loadLocalExample(store)).toEqual(first);
    expect(loadLocalExample(store, "previous")).toEqual(second);
  });

  it("손상된 최근 저장을 덮어쓰지 않고 유효한 직전 저장은 내보낼 수 있다", async () => {
    const store = memoryStorage();
    saveLocalExample(store, first);
    saveLocalExample(store, second);
    const archive = JSON.parse(store.getItem(LOCAL_SAVE_KEY) ?? "null");
    archive.current.game.day = -1;
    const raw = JSON.stringify(archive);
    store.setItem(LOCAL_SAVE_KEY, raw);
    expect(() => exportSaveFile(store, "current")).toThrow();
    expect(JSON.parse(exportSaveFile(store, "previous").text)).toEqual(first);
    expect(() => saveLocalExample(store, first)).toThrow();
    expect(store.getItem(LOCAL_SAVE_KEY)).toBe(raw);
  });
});
