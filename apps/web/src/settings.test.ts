import { describe, expect, it } from "vitest";
import {
  defaultAudioSettings,
  effectiveVolume,
  parseAudioSettings,
  readAudioSettings,
  SETTINGS_KEY,
  writeAudioSettings,
} from "./settings.js";

function storage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
}

describe("음량 설정 저장", () => {
  it("처음에는 기본값을 사용하며 읽기만으로 저장하지 않는다", () => {
    const store = storage();
    expect(readAudioSettings(store)).toEqual({
      settings: defaultAudioSettings(),
      warning: null,
    });
    expect(store.getItem(SETTINGS_KEY)).toBeNull();
  });

  it("음량과 음소거를 복원하고 게임 저장과 다른 항목을 보존한다", () => {
    const store = storage();
    store.setItem("dynosty.example.saves", "keep game save");
    const settings = {
      ...defaultAudioSettings(),
      masterVolume: 35,
      muted: true,
    };
    writeAudioSettings(store, settings);
    expect(readAudioSettings(store).settings).toEqual(settings);
    expect(effectiveVolume(settings)).toBe(0);
    expect(effectiveVolume({ ...settings, muted: false })).toBe(0.35);
    expect(store.getItem("dynosty.example.saves")).toBe("keep game save");
  });

  it.each([
    "{broken",
    "null",
    "[]",
    JSON.stringify({ ...defaultAudioSettings(), settingsVersion: 2 }),
    JSON.stringify({ ...defaultAudioSettings(), masterVolume: -1 }),
    JSON.stringify({ ...defaultAudioSettings(), masterVolume: 101 }),
    JSON.stringify({ ...defaultAudioSettings(), masterVolume: "50" }),
    JSON.stringify({ ...defaultAudioSettings(), muted: "false" }),
  ])("손상·미지원 설정은 기본값으로 읽되 원문을 유지한다: %s", (raw) => {
    const store = storage();
    store.setItem(SETTINGS_KEY, raw);
    const result = readAudioSettings(store);
    expect(result.settings).toEqual(defaultAudioSettings());
    expect(result.warning).not.toBeNull();
    expect(store.getItem(SETTINGS_KEY)).toBe(raw);
  });

  it("잘못된 새 값과 쓰기 실패가 기존 설정을 덮어쓰지 않는다", () => {
    const store = storage();
    writeAudioSettings(store, defaultAudioSettings());
    const before = store.getItem(SETTINGS_KEY);
    expect(() =>
      writeAudioSettings(store, {
        ...defaultAudioSettings(),
        masterVolume: Number.NaN,
      }),
    ).toThrow();
    const denied = {
      getItem: store.getItem,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() =>
      writeAudioSettings(denied, { ...defaultAudioSettings(), muted: true }),
    ).toThrow();
    expect(store.getItem(SETTINGS_KEY)).toBe(before);
    const unreadable = {
      ...store,
      getItem: () => {
        throw new Error("denied");
      },
    };
    expect(readAudioSettings(unreadable).settings).toEqual(
      defaultAudioSettings(),
    );
    expect(() =>
      parseAudioSettings({ ...defaultAudioSettings(), masterVolume: 1.5 }),
    ).toThrow();
  });
});
