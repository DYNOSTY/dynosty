import type {
  GameCommand,
  GameState,
  GameWorkerMessage,
  SceneSnapshot,
} from "@dynosty/game-core";
import { useEffect, useRef, useState } from "react";
import {
  loadLocalExample,
  localSaveError,
  type SaveSlot,
  saveLocalExample,
} from "./local-save.js";
import type { SceneController } from "./scene.js";

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const sceneRef = useRef<SceneController | null>(null);
  const pendingSaveRef = useRef<number | null>(null);
  const nextRequestRef = useRef(0);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [snapshot, setSnapshot] = useState<SceneSnapshot | null>(null);
  const [appliedSnapshot, setAppliedSnapshot] = useState<SceneSnapshot | null>(
    null,
  );
  const [apiStatus, setApiStatus] = useState("연결 중");
  const [sceneStatus, setSceneStatus] = useState("불러오는 중");
  const [workerError, setWorkerError] = useState<string | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL("./game.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<GameWorkerMessage>) => {
      if (event.data.type === "state") setState(event.data.state);
      else if (event.data.type === "scene") setSnapshot(event.data.snapshot);
      else if (event.data.type === "error") setWorkerError(event.data.message);
      else {
        const message = event.data;
        if (pendingSaveRef.current !== message.requestId) return;
        try {
          if (message.type === "save-ready") {
            saveLocalExample(window.localStorage, message.save);
            setSaveStatus("예제를 저장했습니다.");
          } else if (message.type === "load-complete") {
            setSaveStatus("예제를 불러왔습니다.");
          } else {
            setSaveError(message.message);
            setSaveStatus("");
          }
        } catch (error) {
          setSaveError(localSaveError(error));
          setSaveStatus("");
        } finally {
          pendingSaveRef.current = null;
          setSaveBusy(false);
        }
      }
    };
    worker.onerror = () => {
      pendingSaveRef.current = null;
      setSaveBusy(false);
      setSaveStatus("");
      setWorkerError("게임 계산 연결을 확인해 주세요.");
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
      pendingSaveRef.current = null;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/game/initial", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("API 응답 오류");
        const initial: GameState = await response.json();
        if (initial.schemaVersion !== 1 || initial.day !== 1)
          throw new Error("API 형식 오류");
        setApiStatus("연결 완료");
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setApiStatus("연결 실패 — API 실행을 확인해 주세요");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    void import("./scene.js")
      .then(({ mountScene }) => {
        if (cancelled) return;
        sceneRef.current = mountScene(canvas);
        setSceneStatus("준비 완료");
      })
      .catch(() => {
        if (!cancelled)
          setSceneStatus("3D 표시 실패 — WebGL 지원을 확인해 주세요");
      });
    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!snapshot || sceneStatus !== "준비 완료" || !sceneRef.current) return;
    try {
      sceneRef.current.update(snapshot);
      setAppliedSnapshot(snapshot);
    } catch {
      setSceneStatus("3D 표시 정보 오류 — 전달 형식을 확인해 주세요");
    }
  }, [snapshot, sceneStatus]);

  function advance() {
    if (pendingSaveRef.current !== null) return;
    const command: GameCommand = { type: "advance-day" };
    workerRef.current?.postMessage(command);
  }

  function toggleSceneExample() {
    if (pendingSaveRef.current !== null) return;
    const command: GameCommand = { type: "toggle-scene-example" };
    workerRef.current?.postMessage(command);
  }

  function accessSave(operation: "save" | "load", slot: SaveSlot = "current") {
    if (!workerRef.current || pendingSaveRef.current !== null) return;
    setSaveError(null);
    setSaveStatus("");
    try {
      const requestId = ++nextRequestRef.current;
      const command: GameCommand =
        operation === "save"
          ? { type: "request-save", requestId }
          : {
              type: "load-example",
              requestId,
              data: loadLocalExample(window.localStorage, slot),
            };
      pendingSaveRef.current = requestId;
      setSaveBusy(true);
      workerRef.current.postMessage(command);
    } catch (error) {
      pendingSaveRef.current = null;
      setSaveBusy(false);
      setSaveError(localSaveError(error));
    }
  }

  const saveDisabled = !state || !snapshot || workerError !== null || saveBusy;

  const resident = appliedSnapshot?.entities.find(
    (entity) => entity.kind === "resident",
  );

  return (
    <main>
      <header>
        <p className="eyebrow">3D 생존 · 도시 경영</p>
        <h1>DYNOSTY</h1>
        <p>게임 개발을 시작할 준비가 됐어요.</p>
      </header>
      <section aria-label="개발 환경 연결 상태" className="panel">
        <p>
          온라인 서버: <strong role="status">{apiStatus}</strong>
        </p>
        <p>
          3D 화면: <strong>{sceneStatus}</strong>
        </p>
        <p aria-live="polite">
          게임 시간:{" "}
          <strong>{state ? `${state.day}일차` : "계산 준비 중"}</strong>
        </p>
        {workerError ? <p role="alert">{workerError}</p> : null}
        <button
          type="button"
          onClick={advance}
          disabled={!state || workerError !== null || saveBusy}
        >
          하루 진행
        </button>
        <button
          type="button"
          onClick={toggleSceneExample}
          disabled={!appliedSnapshot || workerError !== null || saveBusy}
        >
          3D 연결 예제 바꾸기
        </button>
        <p aria-live="polite">
          3D 예제 동작:{" "}
          <strong data-testid="scene-example-motion">
            {resident?.kind === "resident"
              ? resident.motion === "walking"
                ? "걷기 표시"
                : "대기 표시"
              : "준비 중"}
          </strong>
        </p>
        <p className="hint">
          연결 확인용 예제입니다. 자원·주민·미션 규칙은 앞으로 추가합니다.
        </p>
      </section>
      <section aria-label="로컬 저장" className="panel">
        <h2>예제 저장</h2>
        <p>
          이 브라우저에 저장됩니다. 최근 저장과 그 직전 저장을 불러올 수
          있습니다.
        </p>
        <button
          type="button"
          onClick={() => accessSave("save")}
          disabled={saveDisabled}
        >
          예제 저장
        </button>
        <button
          type="button"
          onClick={() => accessSave("load")}
          disabled={saveDisabled}
        >
          저장 불러오기
        </button>
        <button
          type="button"
          onClick={() => accessSave("load", "previous")}
          disabled={saveDisabled}
        >
          이전 저장 불러오기
        </button>
        <p aria-live="polite" data-testid="local-save-status">
          {saveBusy ? "처리 중입니다." : saveStatus}
        </p>
        {saveError ? <p role="alert">{saveError}</p> : null}
      </section>
      <section aria-label="3D 개발 장면">
        <canvas
          ref={canvasRef}
          aria-label="바닥과 건물이 있는 3D 예제. 마우스로 회전하고 확대할 수 있습니다."
          tabIndex={0}
        />
        <p className="hint">마우스로 회전 · 휠로 확대</p>
      </section>
    </main>
  );
}
