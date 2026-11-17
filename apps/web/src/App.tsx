import type {
  GameCommand,
  GameState,
  GameWorkerMessage,
  PlayCommand,
  PlayState,
  SceneSnapshot,
} from "@dynosty/game-core";
import {
  AMOUNT_SCALE,
  type BuildingKind,
  createPlaySave,
  type HomePlacement,
  type TimberState,
  timberScene,
} from "@dynosty/game-core";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  loadLocalExample,
  localSaveError,
  type SaveSlot,
  saveLocalExample,
} from "./local-save.js";
import { MediaPanel } from "./MediaPanel.js";
import { PlayPanel } from "./PlayPanel.js";
import { PlaySavePanel } from "./PlaySavePanel.js";
import { loadPlay, playSaveError, savePlay } from "./play-save.js";
import { SaveFilePanel } from "./SaveFilePanel.js";
import { SelectionPanel } from "./SelectionPanel.js";
import { SettingsMenu } from "./SettingsMenu.js";
import type { BuildingHover, SceneController } from "./scene.js";
import { TimberDemo } from "./TimberDemo.js";
import { VideoPanel } from "./VideoPanel.js";
import { WorkspacePanel } from "./WorkspacePanel.js";

export function App() {
  const [buildingHover, setBuildingHover] = useState<BuildingHover | null>(
    null,
  );
  const [selectedHospital, setSelectedHospital] = useState<string | null>(null);
  const [timberOpen, setTimberOpen] = useState(false);
  const [timberState, setTimberState] = useState<TimberState | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [playState, setPlayState] = useState<PlayState | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const [exampleClock, setExampleClock] = useState(false);
  const [playSaveBusy, setPlaySaveBusy] = useState(false);
  const [playSaveStatus, setPlaySaveStatus] = useState("");
  const [playSaveFailure, setPlaySaveFailure] = useState<string | null>(null);
  const pendingPlaySaveRef = useRef<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const savePanelId = useId();
  const toolsPanelId = useId();
  const saveMenuRef = useRef<HTMLButtonElement>(null);
  const toolsMenuRef = useRef<HTMLButtonElement>(null);
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
  useEffect(() => {
    if (sceneStatus === "준비 완료")
      sceneRef.current?.setSelectionEnabled(!timberOpen || toolsOpen);
  }, [timberOpen, toolsOpen, sceneStatus]);
  const [cameraInfo, setCameraInfo] = useState<{
    distance: number;
    angle: number;
    height: number;
  } | null>(null);
  const [assetWarning, setAssetWarning] = useState<string | null>(null);
  const [workerError, setWorkerError] = useState<string | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL("./game.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<GameWorkerMessage>) => {
      if (event.data.type === "play-state") {
        setPlayState(event.data.state);
        setPlayError(null);
      } else if (event.data.type === "play-error")
        setPlayError(event.data.message);
      else if (
        event.data.type === "play-save-ready" ||
        event.data.type === "play-loaded" ||
        event.data.type === "play-save-error"
      ) {
        const message = event.data;
        if (pendingPlaySaveRef.current !== message.requestId) return;
        try {
          if (message.type === "play-save-ready") {
            savePlay(window.localStorage, message.save);
            setPlaySaveStatus("게임을 저장했습니다.");
          } else if (message.type === "play-loaded")
            setPlaySaveStatus("게임을 불러왔습니다. 일시정지 상태입니다.");
          else setPlaySaveFailure(message.message);
        } catch (error) {
          setPlaySaveFailure(playSaveError(error));
        } finally {
          pendingPlaySaveRef.current = null;
          setPlaySaveBusy(false);
        }
      } else if (event.data.type === "state") setState(event.data.state);
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
      pendingPlaySaveRef.current = null;
      setPlaySaveBusy(false);
      setPlayError(
        "게임 기준이나 계산 모듈을 확인하지 못해 새 게임을 시작할 수 없습니다.",
      );
      pendingSaveRef.current = null;
      setSaveBusy(false);
      setSaveStatus("");
      setWorkerError("게임 계산 연결을 확인해 주세요.");
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
      pendingSaveRef.current = null;
      pendingPlaySaveRef.current = null;
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
      .then(async ({ mountScene }) => {
        if (cancelled) return;
        sceneRef.current = mountScene(
          canvas,
          setSelectedId,
          setAssetWarning,
          setCameraInfo,
          setBuildingHover,
          setSelectedHospital,
        );
        await sceneRef.current.ready;
        if (cancelled) return;
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
    if (timberOpen) return;
    sceneRef.current?.updateTimber(null);
    if (!snapshot || sceneStatus !== "준비 완료" || !sceneRef.current) return;
    try {
      sceneRef.current.update(snapshot);
      setAppliedSnapshot(snapshot);
    } catch {
      setSceneStatus("3D 표시 정보 오류 — 전달 형식을 확인해 주세요");
    }
  }, [snapshot, sceneStatus, timberOpen]);
  useEffect(() => {
    if (
      !timberOpen ||
      !timberState ||
      sceneStatus !== "준비 완료" ||
      !sceneRef.current
    )
      return;
    const display = timberScene(timberState);
    sceneRef.current.update(display);
    sceneRef.current.updateTimber(timberState);
    setAppliedSnapshot(display);
  }, [timberOpen, timberState, sceneStatus]);

  const beginHomePlacement = useCallback(
    (
      confirm: (pose: HomePlacement) => void,
      feedback: (message: string, active: boolean) => void,
      kind?: BuildingKind,
    ) =>
      sceneRef.current
        ? sceneRef.current.beginHomePlacement(confirm, feedback, kind)
        : feedback("3D 장면을 준비하고 있습니다.", false),
    [],
  );
  const cancelHomePlacement = useCallback(
    () => sceneRef.current?.cancelHomePlacement(),
    [],
  );
  function advance() {
    setExampleClock(true);
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
    if (operation === "load") setExampleClock(true);
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

  useEffect(() => {
    const pause = () => {
      if (document.hidden)
        workerRef.current?.postMessage({
          type: "play-command",
          command: { type: "pause", paused: true },
        } satisfies GameCommand);
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);
  function commandPlay(command: PlayCommand) {
    if (playSaveBusy) return;
    setExampleClock(false);
    setPlayError(null);
    workerRef.current?.postMessage({
      type: "play-command",
      command,
    } satisfies GameCommand);
  }
  function accessPlaySave(operation: "save" | "load", previous = false) {
    if (!workerRef.current || pendingPlaySaveRef.current !== null) return;
    setPlaySaveFailure(null);
    setPlaySaveStatus("");
    try {
      const requestId = ++nextRequestRef.current;
      const command: GameCommand =
        operation === "save"
          ? { type: "request-play-save", requestId }
          : {
              type: "load-play",
              requestId,
              data: loadPlay(
                window.localStorage,
                previous ? "previous" : "current",
              ),
            };
      pendingPlaySaveRef.current = requestId;
      setPlaySaveBusy(true);
      if (operation === "load") setExampleClock(false);
      workerRef.current.postMessage(command);
    } catch (error) {
      setPlaySaveFailure(playSaveError(error));
    }
  }
  const shownDay = timberOpen
    ? (timberState?.world.day ?? 1)
    : exampleClock
      ? state?.day
      : (playState?.day ?? state?.day);
  const saveDisabled = !state || !snapshot || workerError !== null || saveBusy;

  const resident = appliedSnapshot?.entities.find(
    (entity) => entity.kind === "resident",
  );

  const selectedEntity =
    appliedSnapshot?.entities.find(
      (entity) => entity.id === selectedId && entity.visible,
    ) ?? null;
  const hasPanels = saveOpen || toolsOpen || selectedEntity !== null;

  function clearSelection() {
    sceneRef.current?.select(null);
    canvasRef.current?.focus();
  }

  return (
    <main className="play-shell">
      <header className="play-header">
        <div className="play-brand">
          <p className="eyebrow">3D 생존 · 도시 경영</p>
          <h1>DYNOSTY</h1>
        </div>
        <div className="play-time" aria-live="polite">
          <span>
            {timberOpen
              ? "조달 체험 시간"
              : exampleClock
                ? "연결 예제 시간"
                : "게임 시간"}
          </span>
          <strong>{shownDay ? `${shownDay}일차` : "계산 준비 중"}</strong>
        </div>
        <nav className="play-menu" aria-label="게임 메뉴">
          <button
            ref={saveMenuRef}
            type="button"
            aria-expanded={saveOpen}
            aria-controls={savePanelId}
            onClick={() => setSaveOpen(!saveOpen)}
          >
            저장
          </button>
          <SettingsMenu />
          <button
            ref={toolsMenuRef}
            type="button"
            className="quiet-button"
            aria-expanded={toolsOpen}
            aria-controls={toolsPanelId}
            onClick={() => setToolsOpen(!toolsOpen)}
          >
            개발 도구
          </button>
        </nav>
      </header>
      <div className="play-status">
        {!timberOpen ? (
          <button
            type="button"
            className="timber-entry-link"
            disabled={sceneStatus !== "준비 완료"}
            onClick={() => {
              if (!playState?.paused)
                commandPlay({ type: "pause", paused: true });
              setTimberOpen(true);
            }}
          >
            마른 목재20 조달 체험하기
          </button>
        ) : (
          <p>마른 목재20 · 조달 체험판</p>
        )}
        <span data-testid="play-scene-status">3D {sceneStatus}</span>
      </div>
      {workerError ? <p role="alert">{workerError}</p> : null}
      <div>
        <PlayPanel
          compact={timberOpen}
          state={
            timberOpen && timberState
              ? {
                  ...timberState.world,
                  resources: {
                    ...timberState.world.resources,
                    RES_WOOD:
                      timberState.world.resources.RES_WOOD -
                      timberState.reservedWood * AMOUNT_SCALE,
                  },
                }
              : playState
          }
          error={playError}
          busy={playSaveBusy}
          onCommand={commandPlay}
        />
        {timberOpen ? (
          <p className="hint">
            공동 재고 · 운송 중·검사 대기·격리 물량은 사용 가능 재고에서
            제외합니다.
          </p>
        ) : null}
      </div>
      <div
        className={`play-workspace${hasPanels || timberOpen ? " has-tools" : ""}`}
      >
        <section aria-label="3D 개발 장면" className="play-scene">
          <div className="scene-heading">
            <h2>{timberOpen ? "복홀 구릉지" : "3D 장면"}</h2>
            <span className="prototype-label">복홀 · 개발 모델</span>
          </div>
          {assetWarning ? (
            <p role="alert" className="hint model-warning">
              {assetWarning}
            </p>
          ) : null}
          <canvas
            ref={canvasRef}
            aria-label="바닥과 건물이 있는 3D 예제. 마우스로 회전하고 확대할 수 있습니다."
            tabIndex={0}
          />
          {buildingHover ? (
            <div
              role="tooltip"
              className="building-health-tooltip"
              style={{
                position: "fixed",
                left: buildingHover.x,
                top: buildingHover.y,
                pointerEvents: "none",
                zIndex: 50,
              }}
            >
              <span>
                {buildingHover.name}
                {buildingHover.health !== undefined
                  ? ` · ${buildingHover.health}/100`
                  : ""}
              </span>
              {buildingHover.health !== undefined ? (
                <progress
                  max={100}
                  value={buildingHover.health}
                  aria-label={`${buildingHover.name} 체력`}
                />
              ) : null}
              {buildingHover.details ? (
                <span>{buildingHover.details}</span>
              ) : null}
            </div>
          ) : null}
          <div className="scene-footer">
            <p>
              {timberOpen && !toolsOpen
                ? "업무는 자동 배정 · 왼쪽 드래그 회전 · 오른쪽 드래그 이동 · 휠 확대"
                : "클릭으로 선택 · 마우스로 회전 · 휠로 확대"}
            </p>
            <span>
              {timberOpen
                ? "주민은 자동 생활 · 건물에 마우스를 올리면 체력 표시"
                : "주민 외형은 트리케라톱스 임시 모델"}
            </span>
          </div>
          <fieldset className="selection-actions" aria-label="예제 대상 선택">
            <button
              type="button"
              className="quiet-button"
              onClick={() => sceneRef.current?.resetCamera()}
            >
              기본 시점
            </button>
            {appliedSnapshot?.entities
              .filter((entity) => entity.visible && (!timberOpen || toolsOpen))
              .map((entity) => (
                <button
                  key={entity.id}
                  type="button"
                  className="quiet-button"
                  aria-pressed={entity.id === selectedId}
                  onClick={() => sceneRef.current?.select(entity.id)}
                >
                  {entity.kind === "building"
                    ? "건물 예제 선택"
                    : timberOpen
                      ? `${(timberState?.residents.findIndex((r) => r.id === entity.id) ?? -1) + 1}번 주민 선택`
                      : "주민 예제 선택"}
                </button>
              ))}
          </fieldset>
        </section>

        <aside
          className={`workspace-tools${timberOpen ? " timber-tools" : ""}`}
          aria-label="작업 메뉴"
          hidden={!hasPanels && !timberOpen}
        >
          <TimberDemo
            active={timberOpen}
            selectedHospital={selectedHospital}
            world={playState}
            showDevTools={toolsOpen}
            saveOpen={saveOpen}
            onState={setTimberState}
            onHomePlacement={beginHomePlacement}
            onCancelHomePlacement={cancelHomePlacement}
            onOverview={() => sceneRef.current?.overview()}
            onView={(point, distance) =>
              sceneRef.current?.focus(point, distance)
            }
            onExit={(world) => {
              const requestId = ++nextRequestRef.current;
              pendingPlaySaveRef.current = requestId;
              setPlaySaveBusy(true);
              workerRef.current?.postMessage({
                type: "load-play",
                requestId,
                data: createPlaySave(world),
              } satisfies GameCommand);
              setTimberOpen(false);
            }}
          />
          <SelectionPanel
            entity={timberOpen && !toolsOpen ? null : selectedEntity}
            onClear={clearSelection}
          />
          <WorkspacePanel
            id={savePanelId}
            title="저장"
            open={saveOpen && !timberOpen}
            onClose={() => {
              setSaveOpen(false);
              saveMenuRef.current?.focus();
            }}
          >
            <PlaySavePanel
              busy={playSaveBusy}
              ready={playState !== null}
              status={playSaveStatus}
              error={playSaveFailure}
              onSave={() => accessPlaySave("save")}
              onLoad={(previous) => accessPlaySave("load", previous)}
            />
            <section aria-label="로컬 저장" className="panel">
              <h2>연결 확인용 예제 저장</h2>
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
            <SaveFilePanel />
          </WorkspacePanel>
          <WorkspacePanel
            id={toolsPanelId}
            title="개발 도구"
            open={toolsOpen}
            onClose={() => {
              setToolsOpen(false);
              toolsMenuRef.current?.focus();
            }}
          >
            <section aria-label="개발 환경 연결 상태" className="panel">
              <div className="media-actions">
                <button
                  type="button"
                  onClick={() => commandPlay({ type: "test-food", days: 0 })}
                >
                  식량 고갈 검사
                </button>
                <button
                  type="button"
                  onClick={() => commandPlay({ type: "test-food", days: 1 })}
                >
                  1일분 식량 복구
                </button>
              </div>
              <p className="hint">
                식량 검사 버튼은 개발용 재고 변경이며 생산·교역 규칙이 아닙니다.
              </p>
              <p>
                카메라 거리(m):{" "}
                <span data-testid="camera-distance">
                  {cameraInfo?.distance.toFixed(2) ?? "준비 중"}
                </span>{" "}
                · 각도(도):{" "}
                <span data-testid="camera-angle">
                  {cameraInfo?.angle.toFixed(2) ?? "준비 중"}
                </span>{" "}
                · 높이(m):{" "}
                <span data-testid="camera-height">
                  {cameraInfo?.height.toFixed(2) ?? "준비 중"}
                </span>
              </p>
              <p>
                온라인 서버: <strong role="status">{apiStatus}</strong>
              </p>
              <p>
                3D 화면: <strong>{sceneStatus}</strong>
              </p>
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

            <MediaPanel />
            <VideoPanel />
          </WorkspacePanel>
        </aside>
      </div>
    </main>
  );
}
