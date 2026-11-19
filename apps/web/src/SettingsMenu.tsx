import { type ReactNode, useId, useRef, useState } from "react";
import { useAudio } from "./AudioProvider.js";

// 게임 콘솔에서는 명령 칸 모양(children)으로 그린다. 접근 이름은 '설정' 그대로
export function SettingsMenu({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
} = {}) {
  const { settings, warning, saveStatus, audioRef, updateSettings } =
    useAudio();
  const [previewStatus, setPreviewStatus] = useState("");
  const [startingPreview, setStartingPreview] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

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
        className={className}
        aria-haspopup="dialog"
        aria-label="설정"
        onClick={() => dialogRef.current?.showModal()}
      >
        {children ?? "설정"}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="settings-dialog"
        // 창 밖(어두운 곳)을 누르면 닫힘
        onClick={(event) => {
          const r = event.currentTarget.getBoundingClientRect();
          const out =
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom;
          if (event.target === event.currentTarget && out)
            dialogRef.current?.close();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") dialogRef.current?.close();
        }}
        onClose={() => {
          audioRef.current?.stopPreview();
          setPreviewStatus("");
        }}
      >
        <div className="settings-heading">
          <h2 id={titleId}>설정</h2>
          <button
            type="button"
            className="g-knob g-knob--close"
            aria-label="설정 닫기"
            title="닫기 (Esc)"
            onClick={() => dialogRef.current?.close()}
          />
        </div>
        <details>
          <summary>세계관 · 밤에 벌어지는 일</summary>
          <p>
            운석이 떨어진 뒤, 밤 정찰 기록에 눈이 벌겋게 빛나는 공룡이 등장했다.
            전날까지 한 둥지를 쓰던 이도 알아보지 못했고, 성문의 빗장을 들이받아
            꺾을 만큼 힘이 셌다. 성 밖에서 이들을 만난 정찰대가 처음 쓴 이름이
            ‘변종’이었다.
          </p>
          <p>
            쥬신의 마지막 밤, 변종 떼가 도성 성문을 무너뜨렸다. 문을 지키다 다친
            수비병 중에서도 변종이 나타났다. 성안의 구원로마저 끊기면서 왕도는
            함락되고 쥬신은 멸망했다.
          </p>
        </details>
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
