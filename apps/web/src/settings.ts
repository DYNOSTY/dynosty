export const SETTINGS_KEY = "dynosty.settings";

export interface AudioSettings {
  readonly settingsVersion: 1;
  readonly masterVolume: number;
  readonly muted: boolean;
}

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultAudioSettings(): AudioSettings {
  return { settingsVersion: 1, masterVolume: 50, muted: false };
}

export function parseAudioSettings(value: unknown): AudioSettings {
  if (
    typeof value !== "object" ||
    value === null ||
    !("settingsVersion" in value) ||
    value.settingsVersion !== 1 ||
    !("masterVolume" in value) ||
    typeof value.masterVolume !== "number" ||
    !Number.isInteger(value.masterVolume) ||
    value.masterVolume < 0 ||
    value.masterVolume > 100 ||
    !("muted" in value) ||
    typeof value.muted !== "boolean"
  )
    throw new Error("올바르지 않은 설정입니다.");
  return {
    settingsVersion: 1,
    masterVolume: value.masterVolume,
    muted: value.muted,
  };
}

export function readAudioSettings(storage: SettingsStorage) {
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    return {
      settings:
        raw === null
          ? defaultAudioSettings()
          : parseAudioSettings(JSON.parse(raw)),
      warning: null,
    };
  } catch {
    return {
      settings: defaultAudioSettings(),
      warning:
        "저장된 설정을 읽지 못해 기본값을 사용합니다. 설정을 바꾸면 다시 저장을 시도합니다.",
    };
  }
}

export function writeAudioSettings(
  storage: SettingsStorage,
  value: AudioSettings,
) {
  storage.setItem(SETTINGS_KEY, JSON.stringify(parseAudioSettings(value)));
}

export function effectiveVolume(settings: AudioSettings): number {
  return settings.muted ? 0 : settings.masterVolume / 100;
}
