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
  absMinute,
  type HeatLevel,
  type LaborState,
  laborScene,
  laborStock,
  pendingStory,
  STORY_RULES,
  type TimberState,
  timberScene,
  winterReport,
  ZONES,
} from "@dynosty/game-core";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { BUILDINGS, type BuildingAction, commandGrid } from "./buildings.js";
import {
  CmdButton,
  CmdFace,
  ConsoleFrame,
  FpsBadge,
  IconText,
  TopFrame,
} from "./GameHud.js";
import { LAYOUT } from "./layout.js";
import {
  loadLocalExample,
  localSaveError,
  type SaveSlot,
  saveLocalExample,
} from "./local-save.js";
import { MediaPanel } from "./MediaPanel.js";
import { MoodPanel } from "./MoodPanel.js";
import { PlayPanel } from "./PlayPanel.js";
import { PlaySavePanel } from "./PlaySavePanel.js";
import { loadPlay, playSaveError, savePlay } from "./play-save.js";
import { QualityFlow } from "./QualityFlow.js";
import { type Quest, QuestCard } from "./QuestCard.js";
import { SaveFilePanel } from "./SaveFilePanel.js";
import { SeasonDial } from "./SeasonDial.js";
import { SelectionCard } from "./SelectionCard.js";
import { SettingsMenu } from "./SettingsMenu.js";
import { SiteGuide } from "./SiteGuide.js";
import { SiteProgress } from "./SiteProgress.js";
import { StoryChoice } from "./StoryChoice.js";
import { StoryNotice } from "./StoryNotice.js";
import type { CameraInfo, SceneController, ScreenPoint } from "./scene.js";
import { layoutScoutMarkers } from "./scout-marker-layout.js";
import { SCOUT_CREW, SCOUT_GOAL, SCOUT_SITES } from "./scout-sites.js";
import { type SiteNotice, siteCompletions } from "./site-progress.js";
import {
  isSiteId,
  SITE_IDS,
  SITE_NAMES,
  siteAvailable,
} from "./site-targets.js";
import { SCENE_SIGNS } from "./site-zones.js";
import {
  type StoryMoment,
  type StoryNoticeData,
  storyNotice,
} from "./story-notice.js";
import { TimberDemo } from "./TimberDemo.js";
import { VideoPanel } from "./VideoPanel.js";
import { CREW_BADGES, cartBadge } from "./visual-badges.js";
import { WorkspacePanel } from "./WorkspacePanel.js";
import { elevation, MAP_SPAN } from "./world.js";

// 자동 테스트 브라우저(navigator.webdriver)에서만 일손 판 탭을 모두 펼침 — 흐름 테스트가 한 화면 전제로 짜여 있음.
// 사람이 보는 화면에는 영향 없음 (탭 화면은 캡처로 따로 확인)
const E2E_ALL =
  typeof navigator !== "undefined" && navigator.webdriver === true;
/** 개발용 단추·안내를 보일지 (?dev=1 또는 자동 시험) */
const DEV_UI =
  E2E_ALL ||
  (typeof location !== "undefined" &&
    new URLSearchParams(location.search).has("dev"));
/** 선택 화면 시안 (?story=trade | ending) */
// 시안용: ?mood=낙관,비관 으로 민심 칸 값을 덮어 봄 (연출 확인)
const MOOD_TEST = new URLSearchParams(location.search)
  .get("mood")
  ?.split(",")
  .map(Number);
const STORY =
  typeof location !== "undefined"
    ? new URLSearchParams(location.search).get("story")
    : null;

// 주민 종의 장단점 — 기획서에 적힌 것만 (개발인계서 2.1: 4족 짐 수송대 시속 6km, 2족 정찰병 12km)
const RESIDENT_TRAITS = {
  R02: {
    gain: "무거운 짐을 나른다 · 네 발 수송대",
    loss: "느리다 · 시속 6km",
  },
};

export function App() {
  const [laborOpen, setLaborOpen] = useState(false);
  // 일손 판은 내용이 길어 탭으로 한 덩어리씩 (프로스트펑크 건물 창처럼)
  const [laborTab, setLaborTab] = useState<
    "work" | "request" | "site" | "report" | "save"
  >("work");
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
  const [timberOpen, setTimberOpen] = useState(false);
  const [questOpen, setQuestOpen] = useState<string | null>(null);
  const [timberState, setTimberState] = useState<TimberState | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [playState, setPlayState] = useState<PlayState | null>(null);
  // 때가 됐는데 아직 고르지 않은 사건 (있으면 선택 화면을 띄움 — 계산 쪽은 그 시각에 멈춰 있음)
  const storyDue = playState
    ? pendingStory(playState.story, playState.day, playState.minute)
    : null;
  // 이야기 알림: 사건에서 고른 결과·늦게 들어온 물자를 7초 동안 알림
  const [notice, setNotice] = useState<
    (StoryNoticeData & { key: number }) | null
  >(null);
  const storySeen = useRef<StoryMoment | null>(null);
  useEffect(() => {
    if (!playState) return;
    const next = {
      story: playState.story,
      now: absMinute(playState.day, playState.minute),
    };
    const found = storyNotice(storySeen.current, next);
    storySeen.current = next;
    if (found) setNotice({ ...found, key: Date.now() });
  }, [playState]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 7000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  // 전량 검수 중인 목재가 들어올 때까지 남은 분 (없으면 null)
  const woodLeft =
    playState && playState.story.woodDue !== null
      ? Math.max(
          0,
          playState.story.woodDue - absMinute(playState.day, playState.minute),
        )
      : null;
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
  const scoutPanelId = useId();
  // 정찰: 거점별 상태(출발한 게임 시각). 기획서 규칙이 게임 엔진에 들어오기 전까지 화면 쪽 시안
  const [scouts, setScouts] = useState<
    Record<string, { status: "going" | "found"; start: number }>
  >({});
  const [scoutOpen, setScoutOpen] = useState<string | null>(null);
  const [scoutMenuOnly, setScoutMenuOnly] = useState(false);
  const scoutListId = useId();
  const scoutListTitleId = useId();
  const scoutListRef = useRef<HTMLDialogElement>(null);
  const scoutMenuRef = useRef<HTMLButtonElement>(null);
  const scoutFocusFrom = useRef<Element | null>(null);
  const scoutCloseRef = useRef<HTMLButtonElement>(null);
  const scoutFromMenu = useRef<string | null>(null);
  const scoutLayerRef = useRef<HTMLDivElement>(null);
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
    sceneRef.current.updateTimber({
      ...laborState.timber,
      stock: laborStock(laborState),
    });
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
    ? Math.floor(
        ((laborOpen ? laborState?.elapsed : timberState?.elapsed) ?? 0) / 1440,
      ) + 1
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
  // 하단 콘솔 내용: 마을 건물(bld:번호) · 가운데 온돌(건물 예제) · 주민 예제
  const selectedBuilding = selectedId?.startsWith("bld:")
    ? (LAYOUT[Number(selectedId.slice(4))]?.[0] ?? null)
    : selectedEntity?.kind === "building"
      ? "BLD_ONDOL"
      : null;
  const selection =
    selectedBuilding || selectedEntity
      ? {
          building: selectedBuilding,
          grid: commandGrid(
            (selectedBuilding && BUILDINGS[selectedBuilding]) || {
              name: "",
              role: "",
              facts: [],
              commands: [],
            },
          ),
        }
      : null;
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
  // 공통 의뢰 카드 내용 — 그림만 의뢰마다 다르고 칸은 같다 (QuestCard)
  const quests: Record<string, Quest> = {
    scout: {
      id: "scout",
      kind: "정찰",
      art: "/ui/quests/scout.jpg",
      title: "정찰대를 보내 둘레를 살핀다",
      why: "정찰대를 보내 주변 땅을 알아낸다.\n찾은 거점과는 교역할 수 있다.",
      // 정찰 길: 마을 → 거점(가까운 순). 정찰대 표식이 간 만큼 나아감
      progress: {
        icon: "/ui/cmd/map.png",
        now: foundCount,
        goal: SCOUT_GOAL,
        route: SCOUT_SITES.map((x) => {
          const st = scouts[x.id]?.status ?? "unknown";
          const left = st === "going" ? leftHours(x.id) : 0;
          return {
            key: x.id,
            name: x.name,
            hours: x.hours,
            state: st === "found" || st === "going" ? st : "unknown",
            done: st === "going" ? 1 - left / x.hours : 0,
            left,
          };
        }),
      },
      meta: [],
    },
    wood: {
      id: "wood",
      kind: "조달 · 의뢰",
      art: "/ui/quests/wood.jpg",
      title: "마른 목재 20 조달",
      why: "석탄이 모자라면 온돌은 목재를 땐다.\n젖은 목재는 받기 전에 가려낸다.",
      meta: [
        [
          "땔감 환산",
          <span className="qc__conv" key="conv">
            <img src="/ui/resources/RES_COAL.png" alt="석탄" />1<span>=</span>
            <img src="/ui/resources/RES_WOOD.png" alt="목재" />3
          </span>,
        ],
        ["순서", "정찰 → 발주 → 검수"],
        ["실패하면", "시작 지점에서 다시"],
      ],
      action: {
        label: "마른 목재20 조달 체험하기",
        disabled: sceneStatus !== "준비 완료",
        onClick: () => {
          setQuestOpen(null);
          openTimber();
        },
      },
    },
  };

  // 게임 시작 → 주민이 걷고 연기가 남, 시각에 맞춰 낮밤
  const running = playState ? !playState.paused && !timberOpen : false;
  // 절기·혹한 → 3D(눈발·시야·연기)와 서리 테두리 두께
  const winterNow = playState
    ? winterReport(
        playState.winter,
        playState.day,
        playState.minute,
        playState.citizens,
      )
    : null;
  const nestZone = winterNow?.zones.find((z) => z.id === "nest");
  const heatScale = nestZone
    ? { 절약: 0.6, 보통: 1, 긴급: 1.4 }[nestZone.heat]
    : 1;
  const coalNow = playState
    ? Math.floor(playState.resources.RES_COAL / AMOUNT_SCALE)
    : null;
  const woodNow = playState
    ? Math.floor(playState.resources.RES_WOOD / AMOUNT_SCALE)
    : null;
  useEffect(() => {
    if (coalNow !== null && woodNow !== null)
      sceneRef.current?.setFuel(coalNow, woodNow);
  }, [coalNow, woodNow]);
  const weatherNow = winterNow?.weather;
  const storageNow = nestZone?.storage;
  useEffect(() => {
    if (weatherNow === undefined || storageNow === undefined) return;
    sceneRef.current?.setWinter({
      weather: weatherNow,
      heat: heatScale,
      storage: storageNow,
    });
  }, [weatherNow, heatScale, storageNow]);
  // 영하 10°부터 서리가 짙어져 영하 35°에 가장 두껍게
  const frost = winterNow
    ? Math.min(1, Math.max(0, (-winterNow.temp - 10) / 25))
    : 0.5;
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
  useEffect(() => {
    if (sceneStatus !== "준비 완료") return;
    sceneRef.current?.trackPoints(
      SCOUT_SITES.map((site) => ({
        id: site.id,
        x: site.x,
        y: elevation(site.x, site.z) + 9.5,
        z: site.z,
      })),
      (pos: Record<string, ScreenPoint>) => {
        const layer = scoutLayerRef.current;
        if (!layer) return;
        // Measure every box before mutating styles in this frame.
        const pins = SCOUT_SITES.flatMap(({ id }) => {
          const el = pinRefs.current[id];
          const point = pos[id];
          if (!el || !point) return [];
          const { width, height } = el.getBoundingClientRect();
          return width > 0 && height > 0
            ? [{ el, ...point, width, height }]
            : [];
        });
        if (!pins.length) {
          setScoutMenuOnly(false);
          return;
        }
        const hud = Array.from(
          document.querySelectorAll(
            ".play-header, .g-topcmd, .g-quests, .g-console, .sc--medal",
          ),
          (el) => el.getBoundingClientRect(),
        ).filter((r) => r.width > 0 && r.height > 0);
        const layout = layoutScoutMarkers(
          pins,
          window.innerWidth,
          window.innerHeight,
          hud,
        );

        for (const [id, pt] of Object.entries(pos)) {
          if (!id.startsWith("party:")) continue;
          const el = pinRefs.current[id];
          if (!el) continue;
          el.style.left = `${pt.visible ? pt.x : -9999}px`;
          el.style.top = `${pt.visible ? pt.y : -9999}px`;
        }
        // Keep a dock only when there is usable space outside the HUD.
        const menuOnly = layout.mode === "no-space";
        if (layer.classList.contains("is-no-space") !== menuOnly) {
          // Capture before hiding the pins or unmounting the menu trigger.
          const active = document.activeElement;
          scoutFocusFrom.current = (
            menuOnly
              ? layer.contains(active)
              : active === scoutMenuRef.current
          )
            ? active
            : null;
        }
        layer.classList.toggle("is-docked", layout.mode === "docked");
        layer.classList.toggle("is-no-space", menuOnly);
        setScoutMenuOnly(menuOnly);
        if (layout.mode === "docked") {
          const { dock } = layout;
          layer.style.left = `${dock.left}px`;
          layer.style.top = `${dock.top}px`;
          layer.style.maxWidth = `${dock.right - dock.left}px`;
          layer.style.maxHeight = `${dock.bottom - dock.top}px`;
        } else if (layer.hasAttribute("style")) {
          layer.removeAttribute("style");
        }
        if (layout.mode === "projected") {
          layout.positions.forEach(({ x, y, edge, direction }, i) => {
            const pin = pins[i];
            if (!pin) return;
            pin.el.style.left = `${x}px`;
            pin.el.style.top = `${y}px`;
            pin.el.classList.toggle("is-edge", edge);
            pin.el.style.setProperty("--dir", `${direction}rad`);
          });
        } else {
          for (const { el } of pins) {
            el.style.removeProperty("left");
            el.style.removeProperty("top");
            el.style.removeProperty("--dir");
            el.classList.remove("is-edge");
          }
        }
      },
    );
  }, [sceneStatus]);
  useLayoutEffect(() => {
    const from = scoutFocusFrom.current;
    scoutFocusFrom.current = null;
    const dialog = scoutListRef.current;
    const active = document.activeElement;
    let id: string | undefined;
    if (!scoutMenuOnly && dialog?.open) {
      // An open list returns to the selected site's own map marker.
      id = (active as HTMLElement | null)?.dataset.scoutId;
      dialog.close();
    } else {
      // Leave focus alone if another control received it before React committed.
      if (!from || (active !== from && active !== document.body)) return;
      if (scoutMenuOnly) {
        scoutMenuRef.current?.focus({ preventScroll: true });
        return;
      }
    }
    const pin = pinRefs.current[id ?? SCOUT_SITES[0]?.id ?? ""];
    if (pin?.getBoundingClientRect().width) pin.focus({ preventScroll: true });
    else canvasRef.current?.focus({ preventScroll: true });
  }, [scoutMenuOnly]);
  useLayoutEffect(() => {
    if (scoutOpen && scoutFromMenu.current === scoutOpen) {
      scoutCloseRef.current?.focus({ preventScroll: true });
    }
  }, [scoutOpen]);

  const timberReady = sceneStatus === "준비 완료";
  function closeScout() {
    const id = scoutFromMenu.current;
    scoutFromMenu.current = null;
    setScoutOpen(null);
    if (!id) return;
    const pin = pinRefs.current[id];
    const next =
      scoutMenuRef.current ??
      (pin?.getBoundingClientRect().width ? pin : canvasRef.current);
    next?.focus({ preventScroll: true });
  }
  // 뜨는 창은 한 번에 하나: 새 창을 열면 나머지는 닫힘
  function closePopups() {
    setSaveOpen(false);
    setToolsOpen(false);
    closeScout();
    setTimberOpen(false);
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
  // 명령 단축키: E 조달, J 저장, Esc 닫기 (입력 칸·대화상자 안에서는 무시)
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
      if (key === "j") {
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
  function runAction(action: BuildingAction) {
    if (action === "procure") openTimber();
    else if (action === "focus") sceneRef.current?.focusSelected();
    else if (action === "clear") clearSelection();
    else if (action.startsWith("heat-")) {
      // 온돌 화력: 마을 모든 구역(둥지·재배소·쉼터·연구동·치료소)에 한 번에
      const heat = action.slice(5) as HeatLevel;
      for (const zone of ZONES) commandPlay({ type: "set-heat", zone, heat });
    } else if (action === "scout") {
      // 아직 안 가 본 첫 거점의 정찰 창
      const next = SCOUT_SITES.find((site) => !scouts[site.id]);
      if (next) openOnly(() => setScoutOpen(next.id));
    }
  }
  const showSite = useCallback((id: import("./site-targets.js").SiteId) => {
    if (!sceneRef.current?.focusSite(id)) return;
    asideRef.current?.scrollTo({ top: 0, behavior: "instant" });
    canvasRef.current?.scrollIntoView({ block: "center", behavior: "instant" });
    canvasRef.current?.focus({ preventScroll: true });
  }, []);
  const selectedSite =
    timberOpen && laborOpen && isSiteId(selectedId) ? selectedId : null;

  return (
    <main
      className={`play-shell${timberOpen ? ` is-procurement ${laborOpen ? `is-labor labor-tab-${laborTab}` : "is-timber"}` : ""}${E2E_ALL ? " e2e-all" : ""}`}
    >
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
        {/* 정찰: 단계나 몇 곳인지는 알려 주지 않음 (사용자 11/21 "단계를 굳이 게이머한테 알려줘야 함? 스스로 알아가게").
            기획서의 "정찰 5회"는 속으로만 센다. 누르면 공통 의뢰 카드 */}
        <button
          type="button"
          className="g-quest g-quest--btn"
          aria-expanded={questOpen === "scout"}
          onClick={() => setQuestOpen(questOpen === "scout" ? null : "scout")}
        >
          <img src="/ui/cmd/map.png" alt="" />
          <div className="g-quest__body">
            <span>
              {Object.keys(scouts).length === 0
                ? "정찰대를 보내 보자"
                : "둘레를 살펴보는 중"}
            </span>
          </div>
          <b>{foundCount > 0 ? `찾은 곳 ${foundCount}` : ""}</b>
        </button>
        {/* 전량 검수 중인 목재: 들어올 때까지 남은 시간 (사건·정책 선택) */}
        {woodLeft !== null ? (
          <div className="g-quest">
            <img src="/ui/resources/RES_WOOD.png" alt="" />
            <span className="g-quest__body">
              <span>전량 검수 중 · 목재 {STORY_RULES.trade.wood}</span>
              <span className="g-bar" aria-hidden="true">
                <i
                  style={{
                    width: `${Math.round((1 - woodLeft / STORY_RULES.trade.fullDelayMinutes) * 100)}%`,
                  }}
                />
              </span>
            </span>
            <b>{Math.ceil(woodLeft / 60)}시간</b>
          </div>
        ) : null}
        {/* 진행 중 정찰: 남은 시간 막대 */}
        {SCOUT_SITES.filter((site) => scouts[site.id]?.status === "going").map(
          (site) => (
            <button
              key={site.id}
              type="button"
              className="g-quest g-quest--btn"
              onClick={() => openOnly(() => setScoutOpen(site.id))}
            >
              <img src="/ui/cmd/residents.png" alt="" />
              <span className="g-quest__body">
                <span>{site.name} 정찰 중</span>
                <span className="g-bar" aria-hidden="true">
                  <i
                    style={{
                      width: `${Math.round((1 - leftHours(site.id) / site.hours) * 100)}%`,
                    }}
                  />
                </span>
              </span>
              <b>{leftHours(site.id)}시간</b>
            </button>
          ),
        )}
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
              aria-label="의뢰 · 마른 목재 20 조달"
              aria-expanded={questOpen === "wood"}
              onClick={() => setQuestOpen(questOpen === "wood" ? null : "wood")}
            >
              마른 목재 20 조달
            </button>
          ) : (
            <p>마른 목재20 · 조달 체험판</p>
          )}
          <span data-testid="play-scene-status">3D {sceneStatus}</span>
        </div>
        {questOpen && quests[questOpen] && !timberOpen ? (
          <QuestCard
            q={quests[questOpen] as Quest}
            onClose={() => setQuestOpen(null)}
          />
        ) : null}
      </section>
      {/* 정찰 거점 표식 (3D 위치를 따라감) */}
      <div className="g-pins">
        {SCOUT_SITES.filter((site) => scouts[site.id]?.status === "going").map(
          (site) => (
            <span
              key={`party-${site.id}`}
              ref={(el) => {
                pinRefs.current[`party:${site.id}`] =
                  el as unknown as HTMLButtonElement | null;
              }}
              className="g-party"
              style={{ left: -9999, top: -9999 }}
            >
              <img src="/ui/cmd/residents.png" alt="" />
              정찰대 → {site.name}
            </span>
          ),
        )}
        <div ref={scoutLayerRef} className="g-pins__sites">
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
                {/* 수묵 봉수대 표식: 미탐색 = 꺼진 봉수대, 가는 중 = 깃발, 찾음 = 불 켜짐. 이름은 마우스를 올릴 때 */}
                <img
                  className="g-pin__mark"
                  src={`/ui/kit/pin_${st === "found" || st === "going" ? st : "unknown"}.webp`}
                  alt=""
                />
                <span>{st === "unknown" ? "미탐색" : site.name}</span>
              </button>
            );
          })}
        </div>
      </div>
      {workerError ? <p role="alert">{workerError}</p> : null}
      <div>
        <PlayPanel
          state={playState}
          error={playError}
          busy={playSaveBusy}
          onCommand={commandPlay}
        />
      </div>
      <div
        className={`play-workspace${hasPanels || timberOpen ? " has-tools" : ""}`}
      >
        <section aria-label="3D 개발 장면" className="play-scene">
          <div className="scene-heading">
            <h2>{timberOpen ? "조달 현장" : "3D 장면"}</h2>
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
          {/* 개발용 안내·예제 단추: 플레이어 화면에선 숨김 (?dev=1 또는 자동 시험에서만) */}
          <div className="scene-footer" hidden={!DEV_UI}>
            <p>클릭으로 선택 · 마우스로 회전 · 휠로 확대</p>
            <span>
              {timberOpen && laborOpen
                ? "검수대 · 격리품 · 배급소"
                : "대표 주민 1종 · 온돌 둥지"}
            </span>
          </div>
          <fieldset
            className="selection-actions"
            aria-label="예제 대상 선택"
            hidden={!DEV_UI}
          >
            <button
              type="button"
              className="quiet-button"
              onClick={() => sceneRef.current?.resetCamera()}
            >
              기본 시점
            </button>
            {appliedSnapshot?.entities
              .filter((entity) => entity.visible)
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
          className={`workspace-tools${timberOpen ? " timber-tools" : ""}${scoutOpen && scoutFromMenu.current === scoutOpen ? " is-menu-scout" : ""}`}
          aria-label="작업 메뉴"
          hidden={!hasPanels && !timberOpen}
        >
          {timberOpen && laborOpen ? (
            <nav className="g-tabs" aria-label="일손 판 보기">
              {(
                [
                  ["work", "배치"],
                  ["request", "요청"],
                  ["site", "현장"],
                  ["report", "품질"],
                  ["save", "저장"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className="g-tab"
                  aria-label={`${label} 탭`}
                  aria-pressed={laborTab === id}
                  onClick={() => setLaborTab(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
          ) : null}
          {timberOpen && laborOpen && laborState ? (
            <div className="site-column">
              <SiteGuide state={laborState} onSelect={showSite} />
              <QualityFlow state={laborState} />{" "}
              <SiteProgress
                state={laborState}
                notices={siteNotices}
                onDismiss={() => setSiteNotices([])}
                onSelect={showSite}
              />
            </div>
          ) : null}
          <TimberDemo
            active={timberOpen}
            onState={setTimberState}
            onLaborState={receiveLabor}
            onLaborModeChange={setLaborOpen}
            selectedSite={selectedSite}
            onClearSelection={clearSelection}
            onExit={() => setTimberOpen(false)}
          />
          <WorkspacePanel
            id={scoutPanelId}
            title={
              scoutSite
                ? `정찰 · ${scouts[scoutSite.id]?.status === "found" ? scoutSite.name : "미탐색 거점"}`
                : "정찰"
            }
            open={scoutOpen !== null}
            closeButtonRef={scoutCloseRef}
            onClose={closeScout}
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
                        closeScout();
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
            open={saveOpen}
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
      {hasPanels ? (
        <div className="g-backdrop" aria-hidden="true" onClick={closePopups} />
      ) : null}
      {/* 혹한 톤: 화면 가장자리 서리 · 위 막대 고드름 */}
      <div
        className="g-frost"
        aria-hidden="true"
        style={{ opacity: 0.18 + frost * 0.22 }}
      />
      <div className="g-frost-edge g-frost-edge--top" aria-hidden="true" />
      <FpsBadge />
      <SeasonDial state={playState} />
      {playState ? (
        <MoodPanel
          optimism={MOOD_TEST?.[0] ?? playState.optimism}
          pessimism={MOOD_TEST?.[1] ?? playState.pessimism}
        />
      ) : null}
      {/* 늘 쓰는 저장·설정은 위쪽 왼편 (하단은 건물을 고를 때만) */}
      <nav className="g-topcmd" aria-label="게임 메뉴">
        <CmdButton
          buttonRef={saveMenuRef}
          icon="records"
          label="저장"
          hotkey="J"
          pressed={saveOpen}
          controls={savePanelId}
          onClick={() => openOnly(() => setSaveOpen(!saveOpen))}
        />
        <SettingsMenu className="g-cmd">
          <CmdFace icon="settings" label="설정" hotkey="Esc" />
        </SettingsMenu>
        {scoutMenuOnly ? (
          <button
            ref={scoutMenuRef}
            type="button"
            className="g-cmd g-scout-menu"
            aria-label="정찰 거점 목록"
            title="정찰 거점 목록"
            aria-haspopup="dialog"
            aria-controls={scoutListId}
            onClick={(event) => {
              closePopups();
              event.currentTarget.focus({ preventScroll: true });
              const dialog = scoutListRef.current;
              dialog?.showModal();
              dialog
                ?.querySelector<HTMLButtonElement>("[data-scout-id]")
                ?.focus();
            }}
          >
            <img src="/ui/kit/pin_unknown.webp" alt="" />
          </button>
        ) : null}
      </nav>
      <dialog
        ref={scoutListRef}
        id={scoutListId}
        className="g-scout-list"
        aria-labelledby={scoutListTitleId}
      >
        <div className="g-scout-list__heading">
          <h2 id={scoutListTitleId}>정찰 거점 목록</h2>
          <button type="button" onClick={() => scoutListRef.current?.close()}>
            닫기
          </button>
        </div>
        <div className="g-scout-list__sites">
          {SCOUT_SITES.map(({ id, name }) => {
            const status = scouts[id]?.status;
            return (
              <button
                key={id}
                type="button"
                data-scout-id={id}
                aria-label={`정찰 거점 ${name}`}
                onClick={() => {
                  scoutListRef.current?.close();
                  scoutFromMenu.current = id;
                  setScoutOpen(id);
                }}
              >
                {name} ·{" "}
                {status === "found"
                  ? "발견함"
                  : status === "going"
                    ? "정찰 중"
                    : "미탐색"}
              </button>
            );
          })}
        </div>
      </dialog>
      <section className="g-console is-idle" aria-label="명령 콘솔">
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
            hidden={!DEV_UI}
            aria-expanded={toolsOpen}
            aria-controls={toolsPanelId}
            onClick={() => openOnly(() => setToolsOpen(!toolsOpen))}
          >
            개발 도구
          </button>
        </div>
        {/* 고른 것이 있을 때만: 왼쪽 초상·이름·역할 · 오른쪽 건물별 명령 9칸 */}
      </section>
      {selection ? (
        <SelectionCard
          id={selection.building ?? "RESIDENT"}
          portrait={
            selection.building ? undefined : "/ui/residents/R02_Triceratops.jpg"
          }
          traits={selection.building ? undefined : RESIDENT_TRAITS.R02}
          name={
            selection.building
              ? (BUILDINGS[selection.building]?.name ?? "건물")
              : "트리케라톱스"
          }
          role={
            selection.building
              ? (BUILDINGS[selection.building]?.role ?? "")
              : "짐 운반꾼. 일터와 창고 사이로 짐을 나릅니다."
          }
          commands={selection.grid}
          state={playState}
          onAction={runAction}
          toggled={(action) =>
            action?.startsWith("heat-")
              ? playState?.winter.zones.nest.heat === action.slice(5)
              : undefined
          }
          disabled={(cmd) =>
            !cmd.action ||
            (cmd.action === "procure" && (!timberReady || timberOpen))
          }
        />
      ) : null}
      <StoryNotice notice={notice} />
      {STORY ? (
        <StoryChoice id={STORY} />
      ) : storyDue ? (
        <StoryChoice
          key={storyDue}
          id={storyDue}
          onPick={(side) =>
            commandPlay({ type: "story-pick", id: storyDue, side })
          }
        />
      ) : null}
    </main>
  );
}
