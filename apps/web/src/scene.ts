import "@babylonjs/core/Culling/ray";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import type {
  LaborState,
  SceneSnapshot,
  TimberState,
} from "@dynosty/game-core";
import { createLaborVisual } from "./labor-scene.js";
import { loadModelAssets } from "./model-assets.js";
import { createSceneEntities } from "./scene-entities.js";
import { observeSceneClicks } from "./scene-input.js";
import { createTimberVisual } from "./timber-scene.js";
import { createVillage, LAYOUT } from "./village.js";
import { buildWorld, ISLAND_RADIUS } from "./world.js";
import { createFog } from "./fog.js";
import { createLandmarks } from "./landmarks.js";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { SCOUT_SITES } from "./scout-sites.js";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { CreateScreenshotUsingRenderTargetAsync } from "@babylonjs/core/Misc/screenshotTools";

// B 레퍼런스(Dorfromantik)처럼 비스듬히 내려다보기: 수평에서 36° (beta는 수직에서 잰 각)
const CAMERA_BETA = ((90 - 36) * Math.PI) / 180;
const CAMERA_RADIUS = 56;
// 아래 콘솔이 화면 30%를 덮으므로 바라보는 점을 앞으로 당겨 섬을 위 칸 가운데에 둠
const CAMERA_TARGET = new Vector3(0, 0, -7);

export interface SceneController {
  update(snapshot: SceneSnapshot): void;
  select(id: string | null): void;
  dispose(): void;
  readonly ready: Promise<void>;
  resetCamera(): void;
  updateLabor(state: LaborState | null): void;
  updateTimber(state: TimberState | null): void;
  /** 섬을 위에서 본 미니맵 그림(data URL) */
  minimap(): Promise<string>;
  /** 미니맵을 누른 곳으로 시점 이동 */
  panTo(x: number, z: number): void;
  /** 게임 진행 중이면 주민이 걷고 굴뚝 연기가 남 */
  setRunning(running: boolean): void;
  /** 게임 시각(하루 안의 분) → 낮밤 */
  setClock(minute: number): void;
  /** 정찰을 마친 거점: 먹 안개가 걷히고 모형이 솟음 */
  revealSite(id: string): void;
  /** 진행 중인 정찰 (정찰대가 실제로 걸어감) */
  setScoutMissions(list: Array<{ id: string; x: number; z: number; start: number; hours: number }>): void;
  /** 게임 누적 시각(분) */
  setGameMinutes(total: number): void;
  /** 3D 지점들을 화면 좌표로 계속 알려 줌 (HTML 표식용) */
  trackPoints(points: Array<{ id: string; x: number; y: number; z: number }>, cb: (pos: Record<string, ScreenPoint>) => void): void;
}
export type ScreenPoint = { x: number; y: number; visible: boolean };
export type CameraInfo = {
  distance: number;
  angle: number;
  height: number;
  x: number;
  z: number;
  /** 화면 위쪽이 가리키는 방향(라디안, +Z가 0) */
  heading: number;
};
// 시점을 옮길 수 있는 범위(섬 반지름 안쪽)
const PAN_LIMIT = 58;

export function mountScene(
  canvas: HTMLCanvasElement,
  onSelectionChange: (id: string | null) => void,
  onAssetWarning: (message: string | null) => void = () => {},
  onCameraInfo: (info: CameraInfo) => void = () => {},
): SceneController {
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);
  const camera = new ArcRotateCamera(
    "camera",
    -Math.PI / 2,
    CAMERA_BETA,
    CAMERA_RADIUS,
    CAMERA_TARGET.clone(),
    scene,
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 4;
  camera.upperRadiusLimit = 140;
  camera.wheelDeltaPercentage = 0.01; // 휠 확대를 거리에 비례하게
  camera.lowerBetaLimit = 0.2;
  camera.upperBetaLimit = 1.35;
  // 시점 옮기기: 오른쪽 버튼 끌기(또는 Ctrl+왼쪽) · WASD. 땅과 나란히만 움직임
  camera.panningSensibility = 60;
  camera.panningAxis = new Vector3(1, 0, 1);
  camera.mapPanning = true;
  camera.panningInertia = 0.85;
  camera.minZ = 0.1;
  // 나무가 수천 그루라 마우스 이동마다 물체 판정을 하면 느려짐 (클릭 선택은 그대로)
  scene.skipPointerMovePicking = true;
  // M2: 떠 있는 섬 + 채색 수묵 하늘 + 건물 12종·주민 10종
  // 기본은 눈 덮인 겨울 섬(기획서 혹한). 비교용: ?season=summer
  const season =
    new URLSearchParams(location.search).get("season") === "summer"
      ? "summer"
      : "winter";
  const { shadow, setTime, glow, warmMat, followSnow } = buildWorld(
    scene,
    LAYOUT.map(([, x, z]) => [x, z] as [number, number]),
    season,
  );
  const village = createVillage(scene, shadow, { glow, warmMat });
  const fog = createFog(scene, SCOUT_SITES);
  const landmarks = createLandmarks(scene, SCOUT_SITES, glow, warmMat);
  // 게임 시각은 일꾼 계산이 보낼 때만 오므로, 사이는 1초=10분으로 이어 붙임
  let gameMin = 0, gameMinSync = 0;
  // 개발 중 성능 확인: 창이 가려져도 잴 수 있는 장면 계산 시간·그리기 호출 수
  if (import.meta.env.DEV) {
    const inst = new SceneInstrumentation(scene);
    inst.captureFrameTime = true;
    inst.captureRenderTime = true;
    Object.assign(window, {
      __scene: scene,
      __perf: () => ({
        fps: Math.round(engine.getFps()),
        frameMs: +inst.frameTimeCounter.lastSecAverage.toFixed(2),
        renderMs: +inst.renderTimeCounter.lastSecAverage.toFixed(2),
        drawCalls: inst.drawCallsCounter.current,
        activeMeshes: scene.getActiveMeshes().length,
      }),
    });
  }
  // 방향키는 카메라 회전 대신 화면 이동(WASD와 같게)
  camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
  let tracked: Array<{ id: string; x: number; y: number; z: number }> = [];
  let onTrack: ((pos: Record<string, ScreenPoint>) => void) | null = null;
  const entities = createSceneEntities(scene, onSelectionChange, () =>
    onAssetWarning("모델을 만들지 못해 연결 예제로 표시합니다."),
  );
  village.ready.then(() => {
    if (!disposed) entities.setGlb(village.entityVisual);
  });
  const timberVisual = createTimberVisual(scene);
  const laborVisual = createLaborVisual(scene);
  const abort = new AbortController();
  let disposed = false;
  const ready = loadModelAssets(abort.signal)
    .then(({ assets, failed }) => {
      if (disposed) return;
      entities.setModels(assets);
      laborVisual.setModels(assets);
      onAssetWarning(
        failed.length
          ? "대표 모델을 불러오지 못해 해당 대상을 연결 예제로 표시합니다."
          : null,
      );
    })
    .catch(() => {
      if (!disposed)
        onAssetWarning("대표 모델을 불러오지 못해 연결 예제로 표시합니다.");
    });
  const stopPicking = observeSceneClicks(canvas, (x, y) => {
    entities.selectMesh(scene.pick(x, y)?.pickedMesh ?? null);
  });
  const observer = new ResizeObserver(() => engine.resize());
  observer.observe(canvas);
  const held = new Set<string>();
  const typing = (t: EventTarget | null) =>
    t instanceof HTMLElement && !!t.closest("input, select, textarea, dialog");
  const onKeyDown = (e: KeyboardEvent) => {
    if (!e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target))
      held.add(e.key.toLowerCase());
  };
  const onKeyUp = (e: KeyboardEvent) => held.delete(e.key.toLowerCase());
  const onBlur = () => held.clear();
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  let cameraKey = "";
  let lastW = 0;
  let trackTick = 0;
  let runningNow = false;
  let infoDirty = true, infoAt = 0;
  let clockTarget = 9 * 60, clockShown = 9 * 60;
  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
    // 낮밤은 게임 시각을 부드럽게 따라감 (자정 넘김 처리)
    let diff = clockTarget - clockShown;
    if (diff < -720) diff += 1440;
    if (diff > 720) diff -= 1440;
    clockShown = (clockShown + diff * Math.min(1, dt * 3) + 1440) % 1440;
    setTime(clockShown);
    village.animate(dt);
    fog.animate(dt);
    landmarks.animate(dt);
    if (runningNow) gameMin = Math.min(gameMin + dt * 10, gameMinSync + 10);
    village.updateParties(gameMin);
    followSnow(camera.target.x, camera.target.z);
    // 눈보라 안개: 카메라 거리에 맞춰 (가까이선 또렷, 멀리선 끝만 흐림)
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogStart = Math.max(30, camera.radius * 0.8);
    scene.fogEnd = Math.max(95, camera.radius * (season === "winter" ? 2.4 : 4));
    // WASD: 화면 기준 앞뒤·좌우로 이동 (멀리 볼수록 빠르게)
    const fwd = camera.target.subtract(camera.position);
    fwd.y = 0;
    fwd.normalize();
    const right = new Vector3(fwd.z, 0, -fwd.x);
    const v = Vector3.Zero();
    if (held.has("w") || held.has("arrowup")) v.addInPlace(fwd);
    if (held.has("s") || held.has("arrowdown")) v.subtractInPlace(fwd);
    if (held.has("d") || held.has("arrowright")) v.addInPlace(right);
    if (held.has("a") || held.has("arrowleft")) v.subtractInPlace(right);
    if (v.lengthSquared() > 0)
      camera.target.addInPlace(v.normalize().scale(camera.radius * 0.8 * dt));
    // 섬 밖으로는 못 나감
    const t = camera.target;
    const d = Math.hypot(t.x, t.z);
    if (d > PAN_LIMIT) {
      t.x *= PAN_LIMIT / d;
      t.z *= PAN_LIMIT / d;
    }
    t.y = 0;
    const key = `${camera.radius.toFixed(2)}:${camera.beta.toFixed(3)}:${camera.alpha.toFixed(3)}:${t.x.toFixed(1)}:${t.z.toFixed(1)}`;
    trackTick = (trackTick + 1) % 15;
    const partyPts = village.partyPoints();
    if (onTrack && (key !== cameraKey || canvas.clientWidth !== lastW || trackTick === 0 || partyPts.some((p) => p.visible))) {
      lastW = canvas.clientWidth;
      const w = canvas.clientWidth, h = canvas.clientHeight, vm = scene.getTransformMatrix(), vp = camera.viewport.toGlobal(w, h);
      const out: Record<string, ScreenPoint> = {};
      for (const pt of [...tracked, ...partyPts]) {
        const sp = Vector3.Project(new Vector3(pt.x, pt.y, pt.z), Matrix.Identity(), vm, vp);
        const shown = !("visible" in pt) || (pt as { visible: boolean }).visible;
        out[pt.id] = { x: sp.x, y: sp.y, visible: shown && sp.z > 0 && sp.z < 1 && sp.x > -40 && sp.x < w + 40 && sp.y > -40 && sp.y < h + 40 };
      }
      onTrack(out);
    }
    // 카메라 정보(미니맵 화살표·개발 도구)는 초당 10번만 넘김 → 이동 중 화면 전체 다시 그리기 방지
    const now = performance.now();
    if (key !== cameraKey) {
      cameraKey = key;
      infoDirty = true;
    }
    if (infoDirty && now - infoAt >= 100) {
      infoDirty = false;
      infoAt = now;
      onCameraInfo({
        distance: camera.radius,
        angle: (camera.beta * 180) / Math.PI,
        height: camera.radius * Math.cos(camera.beta),
        x: t.x,
        z: t.z,
        heading: Math.atan2(fwd.x, fwd.z),
      });
    }
    entities.animate(engine.getDeltaTime() / 1000);
    timberVisual.animate(engine.getDeltaTime() / 1000);
    laborVisual.animate(engine.getDeltaTime() / 1000);
    scene.render();
  });
  return {
    ready,
    updateTimber: timberVisual.update,
    updateLabor: laborVisual.update,
    resetCamera() {
      camera.alpha = -Math.PI / 2;
      camera.beta = CAMERA_BETA;
      camera.radius = CAMERA_RADIUS;
      camera.target.copyFrom(CAMERA_TARGET); // setTarget은 각도를 다시 계산하므로 직접 옮김
      camera.inertialAlphaOffset = 0;
      camera.inertialBetaOffset = 0;
      camera.inertialRadiusOffset = 0;
    },
    async minimap() {
      // 섬 전체를 바로 위에서 평행투영으로 한 번 찍음
      await village.ready;
      await scene.whenReadyAsync();
      const top = new ArcRotateCamera("minimap-camera", -Math.PI / 2, 0.0001, 160, Vector3.Zero(), scene);
      top.maxZ = 400;
      top.mode = Camera.ORTHOGRAPHIC_CAMERA;
      top.orthoLeft = -ISLAND_RADIUS - 1;
      top.orthoRight = ISLAND_RADIUS + 1;
      top.orthoTop = ISLAND_RADIUS + 1;
      top.orthoBottom = -ISLAND_RADIUS - 1;
      const fog = scene.fogEnabled;
      scene.fogEnabled = false;
      setTime(12 * 60);
      try {
        return await CreateScreenshotUsingRenderTargetAsync(engine, top, { width: 320, height: 320 });
      } finally {
        scene.fogEnabled = fog;
        setTime(clockShown + 0.75);
        top.dispose();
      }
    },
    revealSite(id: string) {
      fog.reveal(id);
      landmarks.show(id);
      const site = SCOUT_SITES.find((s) => s.id === id);
      if (site) void village.addLandmark(id, site.x, site.z);
    },
    setScoutMissions(list) {
      void village.setMissions(list);
    },
    setGameMinutes(total: number) {
      gameMinSync = total;
      gameMin = total;
    },
    trackPoints(points, cb) {
      tracked = points;
      onTrack = cb;
      cameraKey = "";
    },
    setRunning(running: boolean) {
      runningNow = running;
      village.setRunning(running);
    },
    setClock(minute: number) {
      clockTarget = ((minute % 1440) + 1440) % 1440;
    },
    panTo(x: number, z: number) {
      const d = Math.hypot(x, z), k = d > PAN_LIMIT ? PAN_LIMIT / d : 1;
      camera.target.set(x * k, 0, z * k); // 각도·거리는 그대로 두고 바라보는 점만 옮김
    },
    update: entities.update,
    select: entities.select,
    dispose() {
      disposed = true;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      abort.abort();
      observer.disconnect();
      stopPicking();
      timberVisual.dispose();
      laborVisual.dispose();
      entities.dispose();
      village.dispose();
      fog.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
