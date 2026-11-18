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
  type LaborState,
  laborScene,
  TIMBER_RULES,
  type TimberState,
  timberScene,
} from "@dynosty/game-core";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  CmdButton,
  CmdFace,
  ConsoleFrame,
  FpsBadge,
  IconText,
  MoodScale,
  TopFrame,
} from "./GameHud.js";
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
import { QualityFlow } from "./QualityFlow.js";
import { SaveFilePanel } from "./SaveFilePanel.js";
import { SelectionPanel } from "./SelectionPanel.js";
import { SettingsMenu } from "./SettingsMenu.js";
import { SiteGuide } from "./SiteGuide.js";
import { SiteProgress } from "./SiteProgress.js";
import type {
  BuildingHover,
  CameraInfo,
  SceneController,
  ScreenPoint,
} from "./scene.js";
import { SCOUT_CREW, SCOUT_GOAL, SCOUT_SITES } from "./scout-sites.js";
import { type SiteNotice, siteCompletions } from "./site-progress.js";
import {
  isSiteId,
  SITE_IDS,
  SITE_NAMES,
  siteAvailable,
} from "./site-targets.js";
import { SCENE_SIGNS } from "./site-zones.js";
import { TimberDemo } from "./TimberDemo.js";
import { VideoPanel } from "./VideoPanel.js";
import { CREW_BADGES, cartBadge } from "./visual-badges.js";
import { WorkspacePanel } from "./WorkspacePanel.js";
import { elevation, MAP_SPAN } from "./world.js";

export function App() {
  const [laborOpen, setLaborOpen] = useState(false);
  const [laborState, setLaborState] = useState<LaborState | null>(null);
  const [siteNotices, setSiteNotices] = useState<SiteNotice[]>([]);
  const priorLabor = useRef<LaborState | null>(null);
  const markersRef = useRef<HTMLDivElement>(null);
  const receiveLabor = useCallback((next: LaborState, reset = false) => {
    const added = siteCompletions(priorLabor.current, next, reset);
    priorLabor.current = next;
    setLaborState(next);
    if (reset) setSiteNotices([]);
    else if (added.length)
      setSiteNotices((old) => [...old, ...added].slice(-4));
  }, []);
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
  const [villageSection, setVillageSection] = useState<{
    label: string;
  } | null>(null);
  const [villageExitRequest, setVillageExitRequest] = useState(0);
  const savePanelId = useId();
  const toolsPanelId = useId();
  const scoutPanelId = useId();
  // 정찰: 거점별 상태(출발한 게임 시각). 기획서 규칙이 게임 엔진에 들어오기 전까지 화면 쪽 시안
  const [scouts, setScouts] = useState<
    Record<string, { status: "going" | "found"; start: number }>
  >({});
  const [scoutOpen, setScoutOpen] = useState<string | null>(null);
  const pinRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const saveMenuRef = useRef<HTMLButtonElement>(null);
  const toolsMenuRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const asideRef = useRef<HTMLElement>(null);
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
  const [cameraInfo, setCameraInfo] = useState<CameraInfo | null>(null);
  const [minimap, setMinimap] = useState<string | null>(null);
  useEffect(() => {
    if (sceneStatus === "준비 완료")
      sceneRef.current?.setSelectionEnabled(
        !timberOpen || laborOpen || toolsOpen,
      );
  }, [timberOpen, laborOpen, toolsOpen, sceneStatus]);
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
          } else if (message.type === "play-loaded") {
            setPlaySaveStatus("게임을 불러왔습니다. 일시정지 상태입니다.");
            setScouts({});
            sceneRef.current?.resetScouting();
          } else setPlaySaveFailure(message.message);
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
        const controller = sceneRef.current;
        await controller.ready;
        if (cancelled) return;
        void controller
          .minimap()
          .then((map) => {
            if (!cancelled) setMinimap(map);
          })
          .catch(() => {});
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
    sceneRef.current?.updateLabor(null);
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
      laborOpen ||
      !timberState ||
      sceneStatus !== "준비 완료" ||
      !sceneRef.current
    )
      return;
    sceneRef.current.updateLabor(null);
    const display = timberScene(timberState);
    sceneRef.current.update(display);
    sceneRef.current.updateTimber(timberState);
    setAppliedSnapshot(display);
  }, [timberOpen, timberState, sceneStatus, laborOpen]);
  useEffect(() => {
    if (
      !timberOpen ||
      !laborOpen ||
      !laborState ||
      sceneStatus !== "준비 완료" ||
      !sceneRef.current
    )
      return;
    const display = laborScene();
    sceneRef.current.update(display);
    sceneRef.current.updateLabor(laborState);
    setAppliedSnapshot(display);
  }, [timberOpen, laborOpen, laborState, sceneStatus]);

  useEffect(() => {
    sceneRef.current?.setSiteMarkers(
      timberOpen && laborOpen && sceneStatus === "준비 완료"
        ? markersRef.current
        : null,
    );
    return () => sceneRef.current?.setSiteMarkers(null);
  }, [timberOpen, laborOpen, sceneStatus]);

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
    if (command.type === "new-game") {
      setScouts({});
      sceneRef.current?.resetScouting();
    }
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
    ? laborOpen
      ? Math.floor((laborState?.elapsed ?? 0) / 1440) + 1
      : (timberState?.world.day ?? 1)
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
  const hasPanels = saveOpen || toolsOpen || scoutOpen !== null;
  const clockWorld = timberOpen ? timberState?.world : playState;
  const clockMinute = clockWorld?.minute ?? 420;
  const clockDay = clockWorld?.day ?? 1;
  const daylight = clockMinute >= 360 && clockMinute < 1080;
  const gameMinutes = playState
    ? (playState.day - 1) * 1440 + playState.minute
    : 0;
  const scoutSite = SCOUT_SITES.find((site) => site.id === scoutOpen) ?? null;
  const foundCount = SCOUT_SITES.filter(
    (site) => scouts[site.id]?.status === "found",
  ).length;
  const leftHours = (id: string) => {
    const site = SCOUT_SITES.find((x) => x.id === id),
      run = scouts[id];
    return site && run
      ? Math.max(0, Math.ceil(site.hours - (gameMinutes - run.start) / 60))
      : 0;
  };

  // 게임 시작 → 주민이 걷고 연기가 남, 시각에 맞춰 낮밤
  const running = playState ? !playState.paused && !timberOpen : false;
  useEffect(() => {
    if (sceneStatus === "준비 완료") sceneRef.current?.setRunning(running);
  }, [running, sceneStatus]);
  const playMinute = playState?.minute;
  useEffect(() => {
    if (sceneStatus === "준비 완료" && playMinute !== undefined)
      sceneRef.current?.setClock(playMinute);
  }, [playMinute, sceneStatus]);
  useEffect(() => {
    if (!playState) return;
    const done = SCOUT_SITES.filter((site) => {
      const run = scouts[site.id];
      return (
        run?.status === "going" && gameMinutes - run.start >= site.hours * 60
      );
    });
    if (!done.length) return;
    setScouts((prev) => {
      const next = { ...prev };
      for (const site of done)
        next[site.id] = { status: "found", start: prev[site.id]?.start ?? 0 };
      return next;
    });
    for (const site of done) sceneRef.current?.revealSite(site.id);
  }, [gameMinutes, scouts, playState]);
  // 정찰대를 실제로 걷게: 진행 중 정찰 목록과 게임 시각을 장면에 넘김
  useEffect(() => {
    if (sceneStatus !== "준비 완료") return;
    sceneRef.current?.setScoutMissions(
      SCOUT_SITES.filter((site) => scouts[site.id]?.status === "going").map(
        (site) => ({
          id: site.id,
          x: site.x,
          z: site.z,
          start: scouts[site.id]?.start ?? 0,
          hours: site.hours,
        }),
      ),
    );
  }, [scouts, sceneStatus]);
  useEffect(() => {
    if (sceneStatus === "준비 완료")
      sceneRef.current?.setGameMinutes(gameMinutes);
  }, [gameMinutes, sceneStatus]);
  const villageVisible = timberOpen && !laborOpen;
  const gatePending =
    villageVisible &&
    (timberState?.mission === "register-policy" ||
      (timberState?.scoutVisitors ?? 0) > 0);
  const post =
    villageVisible && timberState?.merchantItem !== undefined
      ? timberState.town.facilities.find((f) => f.kind === "trade")
      : undefined;
  const postX = post?.position.x,
    postZ = post?.position.z;
  useEffect(() => {
    if (sceneStatus !== "준비 완료") return;
    sceneRef.current?.trackPoints(
      [
        ...SCOUT_SITES.map((site) => ({
          id: site.id,
          x: site.x,
          y: elevation(site.x, site.z) + 9.5,
          z: site.z,
        })),
        ...(gatePending
          ? [{ id: "visitor-gate", ...TIMBER_RULES.cartStart, y: 3 }]
          : []),
        ...(postX !== undefined && postZ !== undefined
          ? [{ id: "visitor-trade", x: postX, z: postZ, y: 5 }]
          : []),
      ],
      (pos: Record<string, ScreenPoint>) => {
        // 3D 화면 칸 (위 막대·아래 콘솔 사이)
        const W = window.innerWidth,
          H = window.innerHeight;
        const quests = document
          .querySelector(".g-quests")
          ?.getBoundingClientRect();
        for (const [id, pt] of Object.entries(pos)) {
          const el = pinRefs.current[id];
          if (!el) continue;
          if (id.startsWith("visitor-")) {
            el.hidden = !pt.visible;
            el.style.left = pt.x + "px";
            el.style.top = pt.y + "px";
            continue;
          }
          // 정찰 거점: 화면 밖이면 그 방향 가장자리에 화살표로 붙임 (RTS 방식)
          // 표식 상자가 통째로 들어오게 반 폭만큼 안쪽
          const hw = el.offsetWidth / 2 + 16;
          const x0 = hw,
            x1 = W - hw,
            y0 = 64 + 30,
            y1 = H - 190 - 24,
            cx = W / 2,
            cy = (y0 + y1) / 2;
          const inside = pt.x > x0 && pt.x < x1 && pt.y > y0 && pt.y < y1;
          const dx = pt.x - cx,
            dy = pt.y - cy;
          const t = inside
            ? 1
            : Math.min(
                dx ? (dx > 0 ? x1 - cx : x0 - cx) / dx : 1e9,
                dy ? (dy > 0 ? y1 - cy : y0 - cy) / dy : 1e9,
              );
          let x = cx + dx * t,
            y = cy + dy * t;
          // 오른쪽 위 의뢰 목록과 겹치면 목록 아래로
          if (
            !inside &&
            quests &&
            x + hw > quests.left &&
            y < quests.bottom + 16
          )
            y = quests.bottom + 24;
          el.style.left = `${x}px`;
          el.style.top = `${y}px`;
          el.classList.toggle("is-edge", !inside);
          el.style.setProperty("--dir", `${Math.atan2(dy, dx)}rad`);
        }
      },
    );
  }, [sceneStatus, gatePending, postX, postZ]);
  const timberReady = sceneStatus === "준비 완료";
  // 뜨는 창은 한 번에 하나: 새 창을 열면 나머지는 닫힘
  function closePopups() {
    setSaveOpen(false);
    setToolsOpen(false);
    setScoutOpen(null);
    if (timberOpen) setVillageExitRequest((request) => request + 1);
  }
  function openOnly(open: () => void) {
    closePopups();
    open();
  }
  function openTimber() {
    if (!timberReady) return;
    if (!playState?.paused) commandPlay({ type: "pause", paused: true });
    openOnly(() => setTimberOpen(true));
  }
  function scoutFace(site: (typeof SCOUT_SITES)[number]) {
    const detail = `${site.name} 정찰 중 · ${leftHours(site.id)}시간 남음`;
    return (
      <>
        <img src="/ui/cmd/residents.png" alt={detail} />
        <span aria-hidden="true" className="g-scout-detail">
          {detail}
        </span>
      </>
    );
  }
  function openVillageSection(section: string) {
    if (!timberOpen) openTimber();
    setVillageSection({ label: section });
  }
  function toggleAuxiliary(panel: "save" | "tools") {
    if (!timberOpen) {
      openOnly(() =>
        panel === "save" ? setSaveOpen(!saveOpen) : setToolsOpen(!toolsOpen),
      );
      return;
    }
    if (panel === "save") setSaveOpen(!saveOpen);
    else setToolsOpen(!toolsOpen);
  }
  // 명령 단축키: E 조달, J 저장, Esc 닫기 (입력 칸·대화상자 안에서는 무시)
  const timberOpenRef = useRef(timberOpen);
  timberOpenRef.current = timberOpen;
  const toggleAuxiliaryRef = useRef(toggleAuxiliary);
  toggleAuxiliaryRef.current = toggleAuxiliary;
  const openVillageRef = useRef(openVillageSection);
  openVillageRef.current = openVillageSection;
  const openTimberRef = useRef(openTimber);
  openTimberRef.current = openTimber;
  const closeRef = useRef(closePopups);
  closeRef.current = closePopups;
  const saveOpenRef = useRef(saveOpen);
  saveOpenRef.current = saveOpen;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (document.querySelector("dialog[open]")) return;
      const target = event.target;
      if (event.key === "Escape") {
        if (document.querySelector('[data-testid="home-placement-status"]'))
          return;
        closeRef.current();
        return;
      }
      if (
        target instanceof HTMLElement &&
        target.closest("input, select, textarea, dialog")
      )
        return;
      const key = event.key.toLowerCase();
      if (key === "e") openTimberRef.current();
      if (key === "b") openVillageRef.current("건설과 식량 수급");
      if (key === "u") openVillageRef.current("거주지");
      if (key === "t") openVillageRef.current("연구와 교역망");
      if (key === "j") {
        if (timberOpenRef.current) {
          toggleAuxiliaryRef.current("save");
          return;
        }
        const wasOpen = saveOpenRef.current;
        closeRef.current();
        setSaveOpen(!wasOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const clearSelection = useCallback(() => {
    sceneRef.current?.select(null);
    canvasRef.current?.focus();
  }, []);
  const showSite = useCallback((id: import("./site-targets.js").SiteId) => {
    if (!sceneRef.current?.focusSite(id)) return;
    asideRef.current?.scrollTo({ top: 0, behavior: "instant" });
    canvasRef.current?.scrollIntoView({ block: "center", behavior: "instant" });
    canvasRef.current?.focus({ preventScroll: true });
  }, []);
  const selectedSite =
    timberOpen && laborOpen && isSiteId(selectedId) ? selectedId : null;

  return (
    <main className={`play-shell${timberOpen ? " is-procurement" : ""}`}>
      <header className="play-header">
        <TopFrame />
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
      </header>
      <section className="g-quests" aria-label="의뢰">
        <h2>의뢰</h2>
        {/* 1단계 목표: 정찰 5곳 — 다섯 칸 */}
        <div className="g-quest">
          <img src="/ui/cmd/map.png" alt="" />
          <div className="g-quest__body">
            <span>1단계 목표 · 정찰</span>
            <span className="g-pips" aria-hidden="true">
              {SCOUT_SITES.map((site) => (
                <i
                  key={site.id}
                  className={
                    scouts[site.id]?.status === "found"
                      ? "on"
                      : scouts[site.id]
                        ? "half"
                        : ""
                  }
                />
              ))}
            </span>
          </div>
          <b>
            {foundCount} / {SCOUT_GOAL}
          </b>
        </div>
        {/* 발견한 거점: 교역 가능 */}
        {SCOUT_SITES.filter((site) => scouts[site.id]?.status === "found").map(
          (site) => (
            <button
              key={site.id}
              type="button"
              className="g-quest g-quest--btn is-found"
              onClick={() => openOnly(() => setScoutOpen(site.id))}
            >
              <img src="/ui/cmd/economy.png" alt="" />
              <span className="g-quest__body">
                <span>{site.name} 발견</span>
                <small>
                  <IconText
                    text={
                      site.find.split(" · ")[0]?.replace("교역: ", "") ?? ""
                    }
                  />
                </small>
              </span>
              <b>✓</b>
            </button>
          ),
        )}
        <div className="play-status">
          {!timberOpen ? (
            <button
              type="button"
              className="timber-entry-link"
              disabled={sceneStatus !== "준비 완료"}
              onClick={() => {
                openTimber();
              }}
            >
              마른 목재20 조달 체험하기
            </button>
          ) : (
            <p>마른 목재20 · 조달 체험판</p>
          )}
          <span data-testid="play-scene-status">3D {sceneStatus}</span>
        </div>
      </section>
      {/* 정찰 거점 표식 (3D 위치를 따라감) */}
      <div className="g-pins">
        {SCOUT_SITES.map((site) => {
          const st = scouts[site.id]?.status ?? "unknown";
          return (
            <button
              key={site.id}
              ref={(el) => {
                pinRefs.current[site.id] = el;
              }}
              type="button"
              className={`g-pin is-${st}`}
              style={{ left: -9999, top: -9999 }}
              onClick={() => openOnly(() => setScoutOpen(site.id))}
              aria-label={`정찰 거점 ${site.name}`}
            >
              <b className="g-pin__arrow" aria-hidden="true" />
              <i aria-hidden="true">
                {st === "found" ? "✓" : st === "going" ? "…" : "?"}
              </i>
              <span>{st === "unknown" ? "미탐색" : site.name}</span>
            </button>
          );
        })}
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
          <div className="scene-viewport">
            <canvas
              ref={canvasRef}
              aria-label="바닥과 건물이 있는 3D 예제. 마우스로 회전하고 확대할 수 있습니다."
              tabIndex={0}
            />
            {(
              [
                ["visitor-gate", gatePending, "입촌 요청", "다음 임무"],
                [
                  "visitor-trade",
                  Boolean(post),
                  "교역소 상인 방문",
                  "교역소 방문",
                ],
              ] as const
            ).map(
              ([id, show, label, section]) =>
                show && (
                  <button
                    type="button"
                    key={id}
                    hidden
                    className="village-visitor-marker"
                    aria-label={label}
                    title={label}
                    ref={(el) => {
                      pinRefs.current[id] = el;
                    }}
                    onClick={() => openVillageSection(section)}
                  >
                    !
                  </button>
                ),
            )}
            {timberOpen && laborOpen ? (
              <div className="site-markers" ref={markersRef} aria-hidden="true">
                {SCENE_SIGNS.map(({ id, label }) => (
                  <span
                    key={id}
                    className="site-marker"
                    data-site-marker={id}
                    hidden
                  >
                    {label}
                  </span>
                ))}
                {["crew-1", "crew-2", "crew-3", "crew-4"].map((id, i) => {
                  const job = laborState?.crew[i]?.job ?? "idle";
                  return (
                    <span
                      key={id}
                      className="crew-marker"
                      data-crew-marker={id}
                      data-job={job}
                      hidden
                    >
                      {i + 1} {CREW_BADGES[job]}
                    </span>
                  );
                })}
                <span className="transport-marker" data-transport-marker hidden>
                  {laborState ? cartBadge(laborState) : null}
                </span>
              </div>
            ) : null}
          </div>
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
            <p>클릭으로 선택 · 마우스로 회전 · 휠로 확대</p>
            <span>
              {timberOpen && laborOpen
                ? "검수대 · 격리품 · 배급소"
                : "대표 주민 1종 · 온돌 둥지"}
            </span>
          </div>
          {timberOpen && laborOpen && laborState ? (
            <>
              <SiteGuide state={laborState} onSelect={showSite} />
              <QualityFlow state={laborState} />{" "}
              <SiteProgress
                state={laborState}
                notices={siteNotices}
                onDismiss={() => setSiteNotices([])}
                onSelect={showSite}
              />
            </>
          ) : null}
          <fieldset className="selection-actions" aria-label="예제 대상 선택">
            <button
              type="button"
              className="quiet-button"
              onClick={() => sceneRef.current?.resetCamera()}
            >
              기본 시점
            </button>
            {appliedSnapshot?.entities
              .filter(
                (entity) =>
                  entity.visible && (!timberOpen || laborOpen || toolsOpen),
              )
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
          {timberOpen && laborOpen ? (
            <fieldset className="selection-actions" aria-label="현장 대상 선택">
              {SITE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="quiet-button"
                  aria-pressed={selectedSite === id}
                  disabled={!siteAvailable(laborState, id)}
                  onClick={() => sceneRef.current?.select(id)}
                >
                  {SITE_NAMES[id]} 선택
                </button>
              ))}
            </fieldset>
          ) : null}
        </section>

        <aside
          ref={asideRef}
          className={`workspace-tools${timberOpen ? " timber-tools" : ""}`}
          aria-label="작업 메뉴"
          hidden={!hasPanels && !timberOpen}
        >
          <TimberDemo
            active={timberOpen}
            exitRequest={villageExitRequest}
            focusSection={villageSection}
            selectedHospital={selectedHospital}
            world={playState}
            showDevTools={toolsOpen}
            saveOpen={saveOpen}
            onState={setTimberState}
            onLaborState={receiveLabor}
            onLaborModeChange={setLaborOpen}
            selectedSite={selectedSite}
            onClearSelection={clearSelection}
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
          <WorkspacePanel
            id={scoutPanelId}
            title={
              scoutSite
                ? `정찰 · ${scouts[scoutSite.id]?.status === "found" ? scoutSite.name : "미탐색 거점"}`
                : "정찰"
            }
            open={scoutOpen !== null}
            onClose={() => setScoutOpen(null)}
          >
            {scoutSite ? (
              <section className="panel g-scout">
                {/* 거점 그림: 발견 전에는 먹 안개, 발견하면 실제 풍경 */}
                <img
                  className="g-scout__art"
                  src={`/ui/sites/${scouts[scoutSite.id]?.status === "found" ? scoutSite.id : "unknown"}.jpg`}
                  alt=""
                />
                <dl className="g-scout__facts">
                  <dt>인원</dt>
                  <dd>일손 {SCOUT_CREW}명</dd>
                  <dt>식량</dt>
                  <dd>시안 · 식량 재고에 미반영</dd>
                  <dt>왕복 시간</dt>
                  <dd>
                    {scoutSite.hours}시간
                    {scoutSite.fromPlan ? "" : " (시안 값)"}
                  </dd>
                  <dt>상태</dt>
                  <dd>
                    {scouts[scoutSite.id]?.status === "found"
                      ? "발견함"
                      : scouts[scoutSite.id]?.status === "going"
                        ? `정찰 중 · ${leftHours(scoutSite.id)}시간 남음`
                        : "아직 가 보지 않음"}
                  </dd>
                </dl>
                {scouts[scoutSite.id]?.status === "found" ? (
                  <p className="g-scout__find">
                    <IconText text={scoutSite.find} />
                  </p>
                ) : null}
                <div className="g-scout__actions">
                  {scouts[scoutSite.id] ? null : (
                    <button
                      type="button"
                      disabled={!playState}
                      onClick={() => {
                        setScouts((prev) => ({
                          ...prev,
                          [scoutSite.id]: {
                            status: "going",
                            start: gameMinutes,
                          },
                        }));
                        setScoutOpen(null);
                      }}
                    >
                      정찰대 보내기
                    </button>
                  )}
                  {scouts[scoutSite.id]?.status === "going" ? (
                    <button
                      type="button"
                      className="quiet-button"
                      onClick={() =>
                        setScouts((prev) => {
                          const next = { ...prev };
                          delete next[scoutSite.id];
                          return next;
                        })
                      }
                    >
                      회항
                    </button>
                  ) : null}
                </div>
                <p className="hint">
                  정찰 시안은 저장되지 않으며 인원·식량 재고에 반영하지
                  않습니다. 게임 시간이 흘러야 돌아옵니다.
                </p>
              </section>
            ) : null}
          </WorkspacePanel>
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
            <MediaPanel />
            <VideoPanel />
          </WorkspacePanel>
        </aside>
      </div>
      {/* 뜨는 창 뒤 어두운 막: 누르면 닫힘 */}
      {hasPanels && !timberOpen ? (
        <div className="g-backdrop" aria-hidden="true" onClick={closePopups} />
      ) : null}
      <FpsBadge />
      <section
        className="village-clock"
        aria-label="마을 시간"
        data-testid="village-clock"
      >
        <span>
          {daylight ? "☀ 낮" : "☾ 밤"} · {clockDay}일차{" "}
          {String(Math.floor(clockMinute / 60)).padStart(2, "0")}:
          {String(clockMinute % 60).padStart(2, "0")}
        </span>
        <span>
          {clockMinute >= 540 && clockMinute < 1080
            ? "일과시간"
            : clockMinute >= 1080 && clockMinute < 1260
              ? "야근 지정 시설만 운영"
              : "휴식시간"}
        </span>
        <progress max={1440} value={clockMinute} aria-label="하루 시간" />
      </section>
      <section className="g-console" aria-label="명령 콘솔">
        <div
          className="g-scout-faces"
          role="group"
          aria-label="파견 중인 정찰대"
        >
          {SCOUT_SITES.filter(
            (site) => scouts[site.id]?.status === "going",
          ).map((site) => (
            <button
              key={site.id}
              type="button"
              className="g-scout-face"
              onClick={() => openOnly(() => setScoutOpen(site.id))}
            >
              {scoutFace(site)}
            </button>
          ))}
        </div>

        <ConsoleFrame />
        <div className="g-console__map">
          <button
            type="button"
            className="g-minimap"
            aria-label="지도: 누른 곳으로 시점 이동"
            onClick={(event) => {
              const r = event.currentTarget.getBoundingClientRect();
              const x = ((event.clientX - r.left) / r.width - 0.5) * MAP_SPAN;
              const z = (0.5 - (event.clientY - r.top) / r.height) * MAP_SPAN;
              sceneRef.current?.panTo(x, z);
            }}
          >
            {minimap ? <img src={minimap} alt="" /> : null}
            {cameraInfo ? (
              <span
                className="g-minimap__view"
                style={{
                  left: `${(cameraInfo.x / MAP_SPAN + 0.5) * 100}%`,
                  top: `${(0.5 - cameraInfo.z / MAP_SPAN) * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${cameraInfo.heading}rad)`,
                }}
              />
            ) : null}
          </button>
          <button
            type="button"
            className="g-home"
            title="가운데로 돌아가기"
            aria-label="시점을 가운데로"
            onClick={() => sceneRef.current?.resetCamera()}
          >
            ⌂
          </button>
          <button
            ref={toolsMenuRef}
            type="button"
            className="g-dev"
            aria-expanded={toolsOpen}
            aria-controls={toolsPanelId}
            onClick={() => toggleAuxiliary("tools")}
          >
            개발 도구
          </button>
        </div>
        <div className="g-console__info">
          {selectedEntity ? (
            <SelectionPanel entity={selectedEntity} onClear={clearSelection} />
          ) : (
            <div className="g-idle">
              <h2>복홀 본진</h2>
              <p>건물이나 주민을 누르면 이 자리에 정보가 나옵니다.</p>
            </div>
          )}
          <MoodScale hope={null} despair={null} />
        </div>
        <nav className="play-menu g-console__cmd" aria-label="게임 메뉴">
          <CmdButton
            icon="build"
            label="건설"
            hotkey="B"
            disabled={!timberReady}
            onClick={() => openVillageSection("건설과 식량 수급")}
          />
          <CmdButton
            icon="residents"
            label="주민"
            hotkey="U"
            disabled={!timberReady}
            onClick={() => openVillageSection("거주지")}
          />
          <CmdButton
            icon="research"
            label="연구"
            hotkey="T"
            disabled={!timberReady}
            onClick={() => openVillageSection("연구와 교역망")}
          />
          <CmdButton icon="policy" label="정책" hotkey="P" disabled />
          <CmdButton icon="map" label="지도" hotkey="M" disabled />
          <CmdButton
            icon="economy"
            label="조달"
            hotkey="E"
            disabled={!timberReady || timberOpen}
            onClick={openTimber}
          />
          <CmdButton icon="ondol" label="온돌" hotkey="H" disabled />
          <CmdButton
            buttonRef={saveMenuRef}
            icon="records"
            label="저장"
            hotkey="J"
            pressed={saveOpen}
            controls={savePanelId}
            onClick={() => toggleAuxiliary("save")}
          />
          <SettingsMenu className="g-cmd">
            <CmdFace icon="settings" label="설정" hotkey="Esc" />
          </SettingsMenu>
        </nav>
      </section>
    </main>
  );
}
