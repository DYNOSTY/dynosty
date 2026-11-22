import type { ReactNode } from "react";
import {
  createContext,
  type RefObject,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createAudioController } from "./audio.js";
import {
  type AudioSettings,
  defaultAudioSettings,
  readAudioSettings,
  writeAudioSettings,
} from "./settings.js";

function readBrowserSettings() {
  try {
    return readAudioSettings(window.localStorage);
  } catch {
    return {
      settings: defaultAudioSettings(),
      warning: "브라우저 설정 저장소에 접근할 수 없어 기본값을 사용합니다.",
    };
  }
}

interface AudioControls {
  galleryMusic: string | null;
  setGalleryMusic: (track: string | null) => void;
  settings: AudioSettings;
  warning: string | null;
  saveStatus: string;
  audioRef: RefObject<ReturnType<typeof createAudioController> | null>;
  updateSettings(
    patch: Partial<Pick<AudioSettings, "masterVolume" | "muted">>,
  ): void;
}

const AudioContext = createContext<AudioControls | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const [galleryMusic, setGalleryMusic] = useState<string | null>(null);
  const [initial] = useState(readBrowserSettings);
  const [settings, setSettings] = useState(initial.settings);
  const [warning, setWarning] = useState<string | null>(initial.warning);
  const [saveStatus, setSaveStatus] = useState("");
  const settingsRef = useRef(settings);
  const audioRef = useRef<ReturnType<typeof createAudioController> | null>(
    null,
  );

  useEffect(() => {
    const audio = createAudioController();
    audio.applySettings(settingsRef.current);
    audioRef.current = audio;
    return () => {
      audio.dispose();
      audioRef.current = null;
    };
  }, []);

  function updateSettings(
    patch: Partial<Pick<AudioSettings, "masterVolume" | "muted">>,
  ) {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    audioRef.current?.applySettings(next);
    try {
      writeAudioSettings(window.localStorage, next);
      setWarning(null);
      setSaveStatus("설정을 저장했습니다.");
    } catch {
      setWarning(
        "설정을 저장하지 못했습니다. 브라우저 저장 권한이나 여유 공간을 확인해 주세요.",
      );
      setSaveStatus("이번 실행에만 적용했습니다.");
    }
  }

  return (
    <AudioContext.Provider
      value={{
        galleryMusic,
        setGalleryMusic,
        settings,
        warning,
        saveStatus,
        audioRef,
        updateSettings,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const audio = useContext(AudioContext);
  if (!audio) throw new Error("AudioProvider가 필요합니다.");
  return audio;
}
