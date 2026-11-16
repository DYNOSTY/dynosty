import { useEffect, useId, useRef, useState } from "react";
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

export function SettingsMenu() {
  const [initial] = useState(readBrowserSettings);
  const [settings, setSettings] = useState(initial.settings);
  const [warning, setWarning] = useState<string | null>(initial.warning);
  const [saveStatus, setSaveStatus] = useState("");
  const [previewStatus, setPreviewStatus] = useState("");
  const [startingPreview, setStartingPreview] = useState(false);
  const settingsRef = useRef(settings);
  const audioRef = useRef<ReturnType<typeof createAudioController> | null>(
    null,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

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

  async function preview() {
    setPreviewStatus("");
    setStartingPreview(true);
    try {
      if (await audioRef.current?.preview())
        setPreviewStatus("확인음을 재생했습니다.");
    } catch {
      setPreviewStatus(
        "확인음을 재생하지 못했습니다. 브라우저의 소리 재생 권한을 확인해 주세요.",
      );
    } finally {
      setStartingPreview(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
      >
        설정
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="settings-dialog"
        onClose={() => {
          audioRef.current?.stopPreview();
          setPreviewStatus("");
        }}
      >
        <div className="settings-heading">
          <h2 id={titleId}>설정</h2>
          <button type="button" onClick={() => dialogRef.current?.close()}>
            설정 닫기
          </button>
        </div>
        <label className="volume-label">
          전체 음량 <output>{settings.masterVolume}%</output>
          <input
            type="range"
            aria-label="전체 음량"
            aria-valuetext={`${settings.masterVolume}%`}
            min={0}
            max={100}
            step={1}
            value={settings.masterVolume}
            onChange={(event) =>
              updateSettings({
                masterVolume: event.currentTarget.valueAsNumber,
              })
            }
          />
        </label>
        <label className="mute-label">
          <input
            type="checkbox"
            checked={settings.muted}
            onChange={(event) =>
              updateSettings({ muted: event.currentTarget.checked })
            }
          />
          소리 끄기
        </label>
        <p className="hint">변경한 설정은 이 브라우저에 자동으로 저장됩니다.</p>
        <button
          type="button"
          onClick={() => void preview()}
          disabled={
            startingPreview || settings.muted || settings.masterVolume === 0
          }
        >
          확인음 듣기
        </button>
        <p className="hint">
          {settings.muted || settings.masterVolume === 0
            ? "소리가 꺼져 있습니다. 음량을 높이고 소리 끄기를 해제하면 확인음을 들을 수 있습니다."
            : "짧은 확인음으로 음량을 확인합니다."}
        </p>
        <p aria-live="polite" data-testid="settings-save-status">
          {saveStatus}
        </p>
        <p aria-live="polite" data-testid="audio-preview-status">
          {previewStatus}
        </p>
        {warning ? <p role="alert">{warning}</p> : null}
      </dialog>
    </>
  );
}
