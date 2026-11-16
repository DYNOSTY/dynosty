import type {
  GameCommand,
  GameState,
  GameWorkerMessage,
  SceneSnapshot,
} from "@dynosty/game-core";
import { useEffect, useRef, useState } from "react";
import type { SceneController } from "./scene.js";

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const sceneRef = useRef<SceneController | null>(null);
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
      else setWorkerError(event.data.message);
    };
    worker.onerror = () => setWorkerError("게임 계산 연결을 확인해 주세요.");
    return () => {
      worker.terminate();
      workerRef.current = null;
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
    const command: GameCommand = { type: "advance-day" };
    workerRef.current?.postMessage(command);
  }

  function toggleSceneExample() {
    const command: GameCommand = { type: "toggle-scene-example" };
    workerRef.current?.postMessage(command);
  }

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
          disabled={!state || workerError !== null}
        >
          하루 진행
        </button>
        <button
          type="button"
          onClick={toggleSceneExample}
          disabled={!appliedSnapshot || workerError !== null}
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
