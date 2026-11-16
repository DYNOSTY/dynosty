import { createExampleSave, SaveDataError } from "@dynosty/game-core";
import { describe, expect, it } from "vitest";
import {
  LOCAL_SAVE_KEY,
  loadLocalExample,
  localSaveError,
  saveLocalExample,
} from "./local-save.js";

function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
}
const first = createExampleSave({ schemaVersion: 1, day: 2 }, true);
const second = createExampleSave({ schemaVersion: 1, day: 3 }, false);

describe("로컬 저장 보존", () => {
  it("최근 저장과 직전 저장을 보관하고 불러오기는 기록을 바꾸지 않는다", () => {
    const storage = memoryStorage();
    storage.setItem("other-app", "keep");
    saveLocalExample(storage, first);
    expect(() => loadLocalExample(storage, "previous")).toThrow("이전 저장");
    saveLocalExample(storage, second);
    const before = storage.getItem(LOCAL_SAVE_KEY);
    expect(loadLocalExample(storage)).toEqual(second);
    expect(loadLocalExample(storage, "previous")).toEqual(first);
    expect(storage.getItem(LOCAL_SAVE_KEY)).toBe(before);
    expect(storage.getItem("other-app")).toBe("keep");
  });

  it("쓰기 실패 시 최근·직전 저장 모두 그대로 남는다", () => {
    const storage = memoryStorage();
    saveLocalExample(storage, first);
    saveLocalExample(storage, second);
    const before = storage.getItem(LOCAL_SAVE_KEY);
    const full = {
      getItem: storage.getItem,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => saveLocalExample(full, first)).toThrow();
    expect(storage.getItem(LOCAL_SAVE_KEY)).toBe(before);
    expect(loadLocalExample(storage)).toEqual(second);
    expect(loadLocalExample(storage, "previous")).toEqual(first);
  });

  it.each(["{broken", '{"storageVersion":99}', "null"])(
    "알 수 없는 기존 기록을 자동으로 덮어쓰지 않는다: %s",
    (raw) => {
      const storage = memoryStorage();
      storage.setItem(LOCAL_SAVE_KEY, raw);
      expect(() => loadLocalExample(storage)).toThrow(SaveDataError);
      expect(() => saveLocalExample(storage, first)).toThrow(SaveDataError);
      expect(storage.getItem(LOCAL_SAVE_KEY)).toBe(raw);
    },
  );

  it("최근 저장이 손상되어도 유효한 직전 저장은 읽을 수 있다", () => {
    const storage = memoryStorage();
    saveLocalExample(storage, first);
    saveLocalExample(storage, second);
    const archive = JSON.parse(storage.getItem(LOCAL_SAVE_KEY) ?? "null");
    archive.current.game.day = -1;
    const corrupted = JSON.stringify(archive);
    storage.setItem(LOCAL_SAVE_KEY, corrupted);
    expect(() => loadLocalExample(storage)).toThrow(SaveDataError);
    expect(loadLocalExample(storage, "previous")).toEqual(first);
    expect(() => saveLocalExample(storage, second)).toThrow(SaveDataError);
    expect(storage.getItem(LOCAL_SAVE_KEY)).toBe(corrupted);
  });

  it("잘못된 새 저장과 저장 권한 오류가 기존 기록을 바꾸지 않는다", () => {
    const storage = memoryStorage();
    saveLocalExample(storage, first);
    const before = storage.getItem(LOCAL_SAVE_KEY);
    expect(() =>
      saveLocalExample(storage, {
        ...second,
        game: { schemaVersion: 1, day: 0 },
      }),
    ).toThrow(SaveDataError);
    expect(storage.getItem(LOCAL_SAVE_KEY)).toBe(before);
    const denied = {
      getItem: () => {
        throw new Error("private provider detail");
      },
      setItem: storage.setItem,
    };
    expect(() => saveLocalExample(denied, second)).toThrow();
    expect(storage.getItem(LOCAL_SAVE_KEY)).toBe(before);
    expect(localSaveError(new Error("private detail"))).not.toContain(
      "private",
    );
  });

  it("저장이 없는 경우 쓰기를 하지 않고 안내한다", () => {
    const storage = memoryStorage();
    expect(() => loadLocalExample(storage)).toThrow("저장된 예제가 없습니다");
    expect(storage.getItem(LOCAL_SAVE_KEY)).toBeNull();
  });
});
