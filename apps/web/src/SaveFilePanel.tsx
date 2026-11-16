import { type ExampleSave, SaveDataError } from "@dynosty/game-core";
import { useEffect, useRef, useState } from "react";
import {
  localSaveError,
  type SaveSlot,
  saveLocalExample,
} from "./local-save.js";
import { exportSaveFile, readSaveFile } from "./save-file.js";

export function SaveFilePanel() {
  const [candidate, setCandidate] = useState<ExampleSave | null>(null);
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const importedRef = useRef(false);
  const downloads = useRef(new Set<{ url: string; timer: number }>());

  useEffect(
    () => () => {
      requestRef.current += 1;
      for (const download of downloads.current) {
        window.clearTimeout(download.timer);
        URL.revokeObjectURL(download.url);
      }
      downloads.current.clear();
    },
    [],
  );

  async function select(file: File | undefined) {
    if (!file) return;
    const request = ++requestRef.current;
    importedRef.current = false;
    setCandidate(null);
    setFileName(file.name);
    setReading(true);
    setStatus("");
    setError(null);
    try {
      const save = await readSaveFile(file);
      if (requestRef.current !== request) return;
      setCandidate(save);
      setStatus("파일을 확인했습니다. 내용을 확인하고 가져오기를 눌러 주세요.");
    } catch (error) {
      if (requestRef.current === request) setError(localSaveError(error));
    } finally {
      if (requestRef.current === request) setReading(false);
    }
  }

  function importFile() {
    if (!candidate || importedRef.current || reading) return;
    setError(null);
    setStatus("");
    try {
      saveLocalExample(window.localStorage, candidate);
      importedRef.current = true;
      setCandidate(null);
      setStatus(
        "파일을 가져왔습니다. 저장 불러오기를 누르면 예제에 적용됩니다.",
      );
    } catch (error) {
      setError(localSaveError(error));
    }
  }

  function download(slot: SaveSlot) {
    setError(null);
    setStatus("");
    let url: string | null = null;
    let anchor: HTMLAnchorElement | null = null;
    try {
      const file = exportSaveFile(window.localStorage, slot);
      url = URL.createObjectURL(
        new Blob([file.text], { type: "application/json" }),
      );
      anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.fileName;
      document.body.append(anchor);
      anchor.click();
      const item = { url, timer: 0 };
      item.timer = window.setTimeout(() => {
        URL.revokeObjectURL(item.url);
        downloads.current.delete(item);
      }, 1000);
      downloads.current.add(item);
      setStatus("저장 파일 다운로드를 요청했습니다.");
    } catch (error) {
      if (url) URL.revokeObjectURL(url);
      setError(
        error instanceof SaveDataError
          ? error.message
          : "파일을 내보내지 못했습니다. 브라우저 저장소와 다운로드 권한을 확인해 주세요. 기존 저장은 유지됩니다.",
      );
    } finally {
      anchor?.remove();
    }
  }

  return (
    <section className="panel" aria-label="저장 파일 내보내기와 가져오기">
      <h2>저장 파일</h2>
      <p className="hint">
        먼저 예제를 저장하면 파일로 내보낼 수 있습니다. 파일에는 날짜와 3D 예제
        상태만 포함됩니다.
      </p>
      <div className="media-actions">
        <button
          type="button"
          onClick={() => download("current")}
          disabled={reading}
        >
          최근 저장 내보내기
        </button>
        <button
          type="button"
          onClick={() => download("previous")}
          disabled={reading}
        >
          이전 저장 내보내기
        </button>
      </div>
      <label className="save-file-label">
        가져올 저장 파일
        <input
          type="file"
          accept="application/json,.json"
          disabled={reading}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            void select(file);
          }}
        />
      </label>
      <p>{fileName || "선택한 파일 없음"}</p>
      {candidate ? (
        <p data-testid="save-file-preview">
          {candidate.game.day}일차 ·{" "}
          {candidate.sceneExampleUpdated ? "걷기" : "대기"} 표시
        </p>
      ) : null}
      <button
        type="button"
        onClick={importFile}
        disabled={!candidate || reading}
      >
        파일 가져오기
      </button>
      <p className="hint">
        가져오기를 확정하면 최근 저장을 바꾸고 기존 최근 저장은 직전 저장으로
        보관합니다. 실행 중인 예제는 바뀌지 않습니다.
      </p>
      <p aria-live="polite" data-testid="save-file-status">
        {reading ? "파일을 검사하고 있습니다." : status}
      </p>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
