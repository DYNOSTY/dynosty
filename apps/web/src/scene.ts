import "@babylonjs/core/Culling/ray";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateScreenshotUsingRenderTarget } from "@babylonjs/core/Misc/screenshotTools";
import { Scene } from "@babylonjs/core/scene";
import type {
  LaborState,
  SceneSnapshot,
  TimberState,
} from "@dynosty/game-core";
import { createFog } from "./fog.js";
import { createFuelYard } from "./fuelyard.js";
import { createLaborVisual } from "./labor-scene.js";
import { createLandmarks } from "./landmarks.js";
import { createLogging } from "./logging.js";
import { type MarkerRect, placeMarker } from "./marker-layout.js";
import { loadModelAssets } from "./model-assets.js";
import { createQualityVisual } from "./quality-scene.js";
import { createSceneEntities } from "./scene-entities.js";
import { observeSceneClicks } from "./scene-input.js";
import { SCOUT_SITES } from "./scout-sites.js";
import { focusSiteCamera, resetSceneCamera } from "./site-camera.js";
import { createSiteSelection } from "./site-selection.js";
import { isSiteId, type SiteId } from "./site-targets.js";
import { SCENE_SIGNS } from "./site-zones.js";
import { createTimberVisual } from "./timber-scene.js";
import { createVillage, LAYOUT } from "./village.js";
import { buildWorld, ISLAND_RADIUS } from "./world.js";
import { createZoneVisual } from "./zone-scene.js";

// B 레퍼런스(Dorfromantik)처럼 비스듬히 내려다보기: 수평에서 36° (beta는 수직에서 잰 각)
const CAMERA_BETA = ((90 - 36) * Math.PI) / 180;
const CAMERA_RADIUS = 56;
// 시야 고정 (2026-11-21 사용자: "기울기 지금 고정, 확대·축소랑 옆으로 이동만"):
// 확대는 가까이까지, 축소는 마을 둘레가 화면에 차는 데서 멈춤 — 맵 끝·안 가본 곳이 드러나지 않게.
// ⚠ 축소 한계와 이동 범위는 임시 값 (사용자가 로컬에서 보고 정함)
export const CAMERA_MIN_RADIUS = 4;
export const CAMERA_MAX_RADIUS = 72;
// 아래 콘솔이 화면 30%를 덮으므로 바라보는 점을 앞으로 당겨 섬을 위 칸 가운데에 둠
const CAMERA_TARGET = new Vector3(0, 0, -7);

export interface SceneController {
  update(snapshot: SceneSnapshot): void;
  select(id: string | null): void;
  focusSite(id: SiteId): boolean;
  dispose(): void;
  readonly ready: Promise<void>;
  resetCamera(): void;
  updateLabor(state: LaborState | null): void;
  setSiteMarkers(layer: HTMLDivElement | null): void;
  updateTimber(state: TimberState | null): void;
  /** 섬을 위에서 본 미니맵 그림(data URL) */
  minimap(): Promise<string | null>;
  /** 미니맵을 누른 곳으로 시점 이동 */
  panTo(x: number, z: number): void;
  /** 고른 건물 가까이 (선택 id 기준: bld:번호 · 건물 예제) */
  focusSelected(): void;
  /** 게임 진행 중이면 주민이 걷고 굴뚝 연기가 남 */
  setRunning(running: boolean): void;
  /** 게임 시각(하루 안의 분) → 낮밤 */
  setClock(minute: number): void;
  /** 절기·혹한(winter.ts) → 눈발·시야, 화력·축열 → 굴뚝 연기·온돌 열기 */
  setWinter(info: { weather: string; heat: number; storage: number }): void;
  /** 온돌 옆 연료 더미 (석탄·목재 개수) */
  setFuel(coal: number, wood: number): void;
  /** 정찰을 마친 거점: 먹 안개가 걷히고 모형이 솟음 */
  revealSite(id: string): void;
  resetScouting(): void;
  /** 진행 중인 정찰 (정찰대가 실제로 걸어감) */
  setScoutMissions(
    list: Array<{
      id: string;
      x: number;
      z: number;
      start: number;
      hours: number;
    }>,
  ): void;
  /** 게임 누적 시각(분) */
  setGameMinutes(total: number): void;
  /** 3D 지점들을 화면 좌표로 계속 알려 줌 (HTML 표식용) */
  trackPoints(
    points: Array<{ id: string; x: number; y: number; z: number }>,
    cb: (pos: Record<string, ScreenPoint>) => void,
  ): void;
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
const PAN_LIMIT = 36; // 시야 고정: 마을 둘레 안에서만 이동 (임시 값, 예전 58)

export function mountScene(
  canvas: HTMLCanvasElement,
  onSelectionChange: (id: string | null) => void,
  onAssetWarning: (message: string | null) => void = () => {},
  onCameraInfo: (info: CameraInfo) => void = () => {},
): SceneController {
  const engine = new Engine(canvas, true);
  const softwareRenderer = /swiftshader|llvmpipe|software/i.test(
    engine.getGlInfo().renderer,
  );
  if (softwareRenderer) engine.setHardwareScalingLevel(2);
  let lastRender = 0;
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
  // 돌리기·기울이기는 막음: 끌기는 어느 단추든 옆으로 이동, 휠 = 확대·축소.
  // (Babylon 9의 입력 연결표에서 "돌리기"로 이어진 끌기를 모두 "이동"으로 바꿈)
  for (const entry of camera.movement.input.inputMap)
    if (entry.source === "pointer" && entry.interaction === "rotate")
      entry.interaction = "pan";
  camera.lowerRadiusLimit = CAMERA_MIN_RADIUS;
  camera.upperRadiusLimit = CAMERA_MAX_RADIUS;
  camera.wheelDeltaPercentage = 0.01; // 휠 확대를 거리에 비례하게
  camera.lowerBetaLimit = 0.2;
  camera.upperBetaLimit = 1.35;
  // 시점 옮기기: 왼쪽 버튼 끌기 · WASD·방향키. 땅과 나란히만 움직임
  camera.panningSensibility = 75; // 끌기 이동 속도 (클수록 느림). 사용자 11/21 "휙휙 움직인다, 20% 감소" → 60에서 75로
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
  const {
    shadow,
    setTime,
    setWeather,
    visibility,
    glow,
    warmMat,
    followSnow,
    makePine,
    makeStump,
  } = buildWorld(
    scene,
    LAYOUT.map(([, x, z]) => [x, z] as [number, number]),
    season,
  );
  const worldRoot = new TransformNode("island-world", scene);
  for (const mesh of scene.meshes) if (!mesh.parent) mesh.parent = worldRoot;
  const village = createVillage(scene, shadow, { glow, warmMat }, worldRoot);
  // 나무가 곧 자원: 숲 가장자리 벌목터에서 찍고 쓰러뜨리는 연출
  // 온돌 옆 장작·석탄 더미 (재고만큼)
  const fuelYard = createFuelYard(scene, worldRoot);
  const logging = createLogging({
    scene,
    shadow,
    makePine,
    makeStump,
    worldRoot,
  });
  const fog = createFog(scene, SCOUT_SITES);
  const landmarks = createLandmarks(scene, SCOUT_SITES, glow, warmMat);
  for (const node of [...scene.meshes, ...scene.transformNodes])
    if (node !== worldRoot && !node.parent) node.parent = worldRoot;
  const demoGround = CreateGround(
    "procurement-ground",
    { width: 24, height: 24 },
    scene,
  );
  const demoMaterial = new StandardMaterial(
    "procurement-ground-material",
    scene,
  );
  demoMaterial.diffuseColor = new Color3(0.48, 0.57, 0.5);
  demoGround.material = demoMaterial;
  demoGround.isPickable = false;
  demoGround.setEnabled(false);
  // 게임 시각은 일꾼 계산이 보낼 때만 오므로, 사이는 1초=10분으로 이어 붙임
  let gameMin = 0,
    gameMinSync = 0;
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
  let selected: string | null = null;
  const publishSelection = (id: string | null) => {
    if (id !== selected) {
      selected = id;
      onSelectionChange(id);
    }
  };
  const entities = createSceneEntities(
    scene,
    (id) => {
      if (id === null && isSiteId(selected)) return;
      if (id !== null) sites.select(null);
      publishSelection(id);
    },
    () => onAssetWarning("모델을 만들지 못해 연결 예제로 표시합니다."),
  );
  const timberVisual = createTimberVisual(scene);
  const laborVisual = createLaborVisual(scene);
  const qualityVisual = createQualityVisual(scene);
  const zoneVisual = createZoneVisual(scene);
  const quarantineRoot = scene.getMeshByName("timber-quarantine");
  const quarantineParts = quarantineRoot
    ? [quarantineRoot, ...quarantineRoot.getChildMeshes(false)]
    : [];
  const sites = createSiteSelection(scene, (id) => {
    if (id === null && !isSiteId(selected)) return;
    if (id !== null) entities.select(null);
    publishSelection(id);
  });
  // 마을 건물은 "bld:번호"로 고름 (조달 현장·예제 대상과 같은 선택 줄)
  const selectBuilding = (i: number | null) => {
    village.highlight(i);
    if (i === null) return;
    sites.select(null);
    entities.select(null);
    publishSelection(`bld:${i}`);
  };
  const select = (id: string | null) => {
    const bld = id?.startsWith("bld:") ? Number(id.slice(4)) : null;
    if (bld !== null) return selectBuilding(bld);
    village.highlight(null);
    // 마을 건물 선택은 예제·현장 선택기가 모르는 값이라 여기서 직접 해제를 알림 (X·Esc·빈 바닥)
    if (id === null && selected?.startsWith("bld:")) publishSelection(null);
    if (isSiteId(id)) {
      entities.select(null);
      sites.select(id);
    } else {
      sites.select(null);
      entities.select(id);
    }
  };
  const abort = new AbortController();
  let disposed = false;
  let demoActive = false;
  const resetWorldCamera = () => {
    camera.alpha = -Math.PI / 2;
    camera.beta = CAMERA_BETA;
    camera.radius = CAMERA_RADIUS;
    camera.target.copyFrom(CAMERA_TARGET);
    camera.inertialAlphaOffset =
      camera.inertialBetaOffset =
      camera.inertialRadiusOffset =
        0;
    camera.inertialPanningX = camera.inertialPanningY = 0;
  };
  const modelsReady = loadModelAssets(abort.signal)
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
  let assetsReady = false;
  const ready = Promise.all([modelsReady, village.ready])
    .then(([, failures]) => {
      if (!disposed) {
        entities.setGlb(village.entityVisual);
        if (failures)
          onAssetWarning(
            "일부 마을 모델을 불러오지 못했습니다. 연결 예제로 표시합니다.",
          );
      }
    })
    .catch(() => {
      if (!disposed)
        onAssetWarning("마을 모델을 불러오지 못해 연결 예제로 표시합니다.");
    })
    .finally(() => {
      assetsReady = !disposed;
    });
  const stopPicking = observeSceneClicks(canvas, (x, y) => {
    // 가려진 주민 대신 화면에서 앞에 보이는 대상을 선택한다.
    const mesh = scene.pick(x, y)?.pickedMesh ?? null,
      site = sites.idForMesh(mesh),
      bld = village.buildingForMesh(mesh);
    if (site) select(site);
    else if (bld !== null) selectBuilding(bld);
    else {
      village.highlight(null);
      sites.select(null);
      entities.selectMesh(mesh);
    }
  });
  const observer = new ResizeObserver(() => engine.resize());
  observer.observe(canvas);
  let markerLayer: HTMLDivElement | null = null;
  let markerState: LaborState | null = null;
  let markerNodes: {
    id: string;
    node: HTMLElement;
    point: Vector3;
    track?: string;
    height?: number;
    measured?: { key: string; width: number; height: number };
  }[] = [];
  const markerIdentity = Matrix.Identity();
  const markerProjection = Vector3.Zero();
  const held = new Set<string>();
  const typing = (t: EventTarget | null) =>
    t instanceof HTMLElement && !!t.closest("input, select, textarea, dialog");
  const onKeyDown = (e: KeyboardEvent) => {
    if (!e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target))
      held.add(e.key.toLowerCase());
  };
  const onKeyUp = (e: KeyboardEvent) => held.delete(e.key.toLowerCase());
  // 화면 가장자리로 마우스를 보내면 그쪽으로 이동 (스타크래프트·롤 방식, 모서리는 대각선). 창 밖으로 나가면 멈춤.
  // 자동 시험에서는 끔 — 구석을 누르는 시험에서 화면이 저절로 흘러가지 않게
  // 단추·지도 같은 누를 것 위에서는 움직이지 않고, 가장자리에 0.25초 머물러야 움직임 — 단추를 누르러 가다 화면이 흘러가지 않게
  const EDGE = 24;
  const EDGE_DWELL = 250;
  let edge: [number, number] | null = null;
  let edgeSince = 0;
  const hasModal = () => document.querySelector("dialog:modal") !== null;
  const onEdgeMove = (e: MouseEvent) => {
    // The backdrop can still deliver mousemove to window.
    if (hasModal()) {
      edge = null;
      return;
    }
    const x = e.clientX < EDGE ? -1 : e.clientX > innerWidth - EDGE ? 1 : 0;
    const y = e.clientY < EDGE ? 1 : e.clientY > innerHeight - EDGE ? -1 : 0;
    const onControl =
      e.target instanceof Element &&
      !!e.target.closest(
        "button, a, input, select, textarea, [role=button], [role=dialog], .g-minimap",
      );
    if ((!x && !y) || onControl) {
      edge = null;
      return;
    }
    if (!edge || edge[0] !== x || edge[1] !== y) edgeSince = performance.now();
    edge = [x, y];
  };
  const offEdge = () => {
    edge = null;
  };
  const clearMovement = () => {
    held.clear();
    edge = null;
  };
  const onFocusIn = (e: FocusEvent) => {
    // Reset immediately when showModal moves focus, even between frames.
    if (e.target instanceof Element && e.target.closest("dialog:modal"))
      clearMovement();
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", clearMovement);
  document.addEventListener("focusin", onFocusIn);
  if (!navigator.webdriver) {
    window.addEventListener("mousemove", onEdgeMove);
    document.documentElement.addEventListener("mouseleave", offEdge);
  }
  let cameraKey = "";
  let lastW = 0;
  let lastH = 0;
  let trackTick = 0;
  let runningNow = false;
  let infoDirty = true,
    infoAt = 0;
  let clockTarget = 9 * 60,
    clockShown = 9 * 60;
  engine.runRenderLoop(() => {
    if (!assetsReady) return;
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
    // 낮밤은 게임 시각을 부드럽게 따라감 (자정 넘김 처리)
    let diff = clockTarget - clockShown;
    if (diff < -720) diff += 1440;
    if (diff > 720) diff -= 1440;
    clockShown = (clockShown + diff * Math.min(1, dt * 3) + 1440) % 1440;
    setTime(demoActive ? 16 * 60 : clockShown); // 조달 중엔 해가 낮은 오후 — 눈밭이 하얗게 날리지 않게
    village.animate(dt);
    logging.animate(dt);
    fog.animate(dt);
    landmarks.animate(dt);
    if (runningNow) gameMin = Math.min(gameMin + dt * 10, gameMinSync + 10);
    village.updateParties(gameMin);
    followSnow(camera.target.x, camera.target.z);
    // 눈보라 안개: 카메라 거리에 맞춰 (가까이선 또렷, 멀리선 끝만 흐림)
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogStart = Math.max(30, camera.radius * 0.8);
    scene.fogEnd = Math.max(
      95 * visibility(),
      camera.radius * (season === "winter" ? 2.4 : 4) * visibility(),
    );
    // WASD: 화면 기준 앞뒤·좌우로 이동 (멀리 볼수록 빠르게)
    const fwd = camera.target.subtract(camera.position);
    fwd.y = 0;
    fwd.normalize();
    const right = new Vector3(fwd.z, 0, -fwd.x);
    const v = Vector3.Zero();
    if ((held.size || edge) && hasModal()) clearMovement();
    if (held.has("w") || held.has("arrowup")) v.addInPlace(fwd);
    if (held.has("s") || held.has("arrowdown")) v.subtractInPlace(fwd);
    if (held.has("d") || held.has("arrowright")) v.addInPlace(right);
    if (held.has("a") || held.has("arrowleft")) v.subtractInPlace(right);
    // 가장자리 이동은 키보드보다 느리게 (1초에 화면 반쯤 — 휙 지나가지 않게)
    const byKeys = v.lengthSquared() > 0;
    if (!byKeys && edge && performance.now() - edgeSince >= EDGE_DWELL) {
      v.addInPlace(right.scale(edge[0]));
      v.addInPlace(fwd.scale(edge[1]));
    }
    if (v.lengthSquared() > 0)
      camera.target.addInPlace(
        v.normalize().scale(camera.radius * (byKeys ? 0.8 : 0.45) * dt),
      );
    // 옆으로 이동은 마을 둘레 안에서만 (마우스 끌기·키보드 모두)
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
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (
      onTrack &&
      (key !== cameraKey ||
        w !== lastW ||
        h !== lastH ||
        trackTick === 0 ||
        partyPts.some((p) => p.visible))
    ) {
      lastW = w;
      lastH = h;
      const vm = scene.getTransformMatrix();
      const vp = camera.viewport.toGlobal(w, h);
      const out: Record<string, ScreenPoint> = {};
      for (const pt of [...tracked, ...partyPts]) {
        const sp = Vector3.Project(
          new Vector3(pt.x, pt.y, pt.z),
          Matrix.Identity(),
          vm,
          vp,
        );
        const shown =
          !("visible" in pt) || (pt as { visible: boolean }).visible;
        out[pt.id] = {
          x: sp.x,
          y: sp.y,
          visible:
            shown &&
            sp.z > 0 &&
            sp.z < 1 &&
            sp.x > -40 &&
            sp.x < w + 40 &&
            sp.y > -40 &&
            sp.y < h + 40,
        };
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
    // 그래픽카드 없는 소프트웨어 렌더러는 한 장에 1초 이상 걸려 단추·글자까지 굳음
    // → 3D는 1초에 한 번만 다시 그리고, 나머지 화면(조작·시계)은 바로 반응하게
    if (!softwareRenderer || now - lastRender >= 1000) {
      lastRender = now;
      scene.render();
    }
    if (markerLayer) {
      const width = canvas.clientWidth,
        height = canvas.clientHeight;
      const viewport = camera.viewport.toGlobal(width, height);
      const occupied: MarkerRect[] = [];
      const transformMatrix = scene.getTransformMatrix();
      // 표지가 포인터는 통과시켜도 목재와 선택 윤곽선을 가릴 수 있다.
      // 선택 전후 같은 위치에 표지를 두도록 실제 격리 묶음의 투영 영역을 비워 둔다.
      if (markerState) {
        let left = width,
          top = height,
          right = 0,
          bottom = 0;
        for (const mesh of quarantineParts) {
          if (!mesh.isEnabled() || !mesh.isVisible) continue;
          for (const corner of mesh.getBoundingInfo().boundingBox
            .vectorsWorld) {
            const p = Vector3.ProjectToRef(
              corner,
              markerIdentity,
              transformMatrix,
              viewport,
              markerProjection,
            );
            if (p.z < 0 || p.z > 1) continue;
            left = Math.min(left, p.x);
            top = Math.min(top, p.y);
            right = Math.max(right, p.x);
            bottom = Math.max(bottom, p.y);
          }
        }
        if (left < right && top < bottom)
          occupied.push({
            left,
            top,
            width: right - left,
            height: bottom - top,
          });
      }
      for (const marker of markerNodes) {
        const { node, point, track, height: offset } = marker;
        const tracked = track ? scene.getMeshById(track) : null;
        if (tracked) {
          point.copyFrom(tracked.position);
          point.y += offset ?? 0;
        }
        if (
          (track && !tracked?.isEnabled()) ||
          (node.hasAttribute("data-transport-marker") &&
            !node.textContent?.trim())
        ) {
          node.hidden = true;
          continue;
        }
        const p = Vector3.Project(
          point,
          markerIdentity,
          transformMatrix,
          viewport,
        );
        const visible =
          markerState &&
          p.z >= 0 &&
          p.z <= 1 &&
          p.x >= 0 &&
          p.x <= width &&
          p.y >= 0 &&
          p.y <= height;
        if (node.hidden === Boolean(visible)) node.hidden = !visible;
        if (visible) {
          const key = `${width}:${node.textContent}`;
          if (marker.measured?.key !== key)
            marker.measured = {
              key,
              width: node.offsetWidth,
              height: node.offsetHeight,
            };
          const rect = placeMarker(
            p.x,
            p.y,
            marker.measured.width,
            marker.measured.height,
            width,
            height,
            occupied,
          );
          if (!rect) {
            node.hidden = true;
            continue;
          }
          occupied.push(rect);
          const transform = `translate(${rect.left}px, ${rect.top}px)`;
          if (node.style.transform !== transform)
            node.style.transform = transform;
          const below = rect.top + rect.height <= p.y;
          const line = `${Math.max(0, below ? p.y - rect.top - rect.height : rect.top - p.y)}px`;
          const lineX = `${Math.max(0, Math.min(rect.width, p.x - rect.left))}px`;
          if (node.style.getPropertyValue("--marker-line") !== line)
            node.style.setProperty("--marker-line", line);
          if (node.style.getPropertyValue("--marker-line-x") !== lineX)
            node.style.setProperty("--marker-line-x", lineX);
          const side = below ? "below" : "above";
          if (node.dataset.anchorSide !== side) node.dataset.anchorSide = side;
        }
      }
    }
  });
  return {
    ready,
    setSiteMarkers(layer) {
      markerLayer = layer;
      markerNodes = layer
        ? SCENE_SIGNS.flatMap(({ id, point }) => {
            const node = layer.querySelector<HTMLElement>(
              `[data-site-marker="${id}"]`,
            );
            const [x, y, z] = point;
            return node ? [{ id, node, point: new Vector3(x, y, z) }] : [];
          })
        : [];
      if (layer) {
        for (const id of ["crew-1", "crew-2", "crew-3", "crew-4"]) {
          const node = layer.querySelector<HTMLElement>(
            `[data-crew-marker="${id}"]`,
          );
          if (node)
            markerNodes.push({
              id,
              node,
              point: Vector3.Zero(),
              track: id,
              height: 1.15,
            });
        }
        const node = layer.querySelector<HTMLElement>(
          "[data-transport-marker]",
        );
        if (node)
          markerNodes.push({
            id: "cart",
            node,
            point: Vector3.Zero(),
            track:
              markerState && markerState.exchange.phase !== "none"
                ? "exchange-cart"
                : "timber-cart",
            height: 1,
          });
      }
    },
    updateTimber(state) {
      const active = state !== null;
      if (active !== demoActive) {
        demoActive = active;
        // 조달은 따로 떨어진 판이 아니라 섬 광장(온돌 둥지 둘레)에서 진행 — 세계가 이어지게
        camera.upperRadiusLimit = active ? 48 : CAMERA_MAX_RADIUS;
        resetWorldCamera();
        if (active) {
          camera.radius = 24;
          camera.target.set(2, 0, -1);
        }
      }
      timberVisual.update(state);
    },
    updateLabor(state) {
      markerState = state;
      const cartMarker = markerNodes.find((m) => m.id === "cart");
      if (cartMarker)
        cartMarker.track =
          state?.exchange.phase !== "none" ? "exchange-cart" : "timber-cart";
      laborVisual.update(state);
      qualityVisual.update(state);
      zoneVisual.update(state);
      sites.update(state);
    },
    focusSite(id) {
      select(id);
      if (selected !== id) return false;
      focusSiteCamera(camera, id);
      return true;
    },
    focusSelected() {
      const id = selected;
      const at = id?.startsWith("bld:")
        ? LAYOUT[Number(id.slice(4))]
        : id
          ? (["", 0, -1] as const)
          : null;
      if (!at) return;
      camera.target.set(at[1], 1, at[2]);
      camera.radius = 16;
    },
    resetCamera() {
      if (demoActive) resetSceneCamera(camera);
      else resetWorldCamera();
    },
    async minimap() {
      // 섬 전체를 바로 위에서 평행투영으로 한 번 찍음
      await village.ready;
      // RTT 준비가 주 화면을 멈출 수 있어 소프트웨어 환경과 미준비 장면은 대체 지도를 쓴다.
      if (disposed || softwareRenderer || !scene.isReady()) return null;
      const top = new ArcRotateCamera(
        "minimap-camera",
        -Math.PI / 2,
        0.0001,
        160,
        Vector3.Zero(),
        scene,
      );
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
        return await new Promise<string>((resolve, reject) => {
          CreateScreenshotUsingRenderTarget(
            engine,
            top,
            { width: 320, height: 320 },
            resolve,
            "image/png",
            1,
            false,
            undefined,
            false,
            false,
            true,
            undefined,
            undefined,
            undefined,
            5000,
            () => reject(new Error("미니맵 준비 시간이 초과되었습니다.")),
          );
        });
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
      if (site)
        void village.addLandmark(id, site.x, site.z).catch(() => {
          if (!disposed)
            onAssetWarning("정찰 거점 모델을 불러오지 못했습니다.");
        });
    },
    resetScouting() {
      fog.reset();
      landmarks.reset();
      village.resetScouting();
    },
    setScoutMissions(list) {
      void village.setMissions(list).catch(() => {
        if (!disposed) onAssetWarning("정찰대 모델을 불러오지 못했습니다.");
      });
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
    setFuel(coal, wood) {
      fuelYard.setStock(coal, wood);
    },
    setWinter({ weather, heat, storage }) {
      // 연료가 떨어져 구들이 식으면 연기·열기도 줄어듦
      const glowing = heat * (0.25 + 0.75 * Math.min(1, storage / 60));
      setWeather(weather, glowing);
      village.setHeat(glowing);
    },
    setRunning(running: boolean) {
      runningNow = running;
      village.setRunning(running);
      logging.setRunning(running);
    },
    setClock(minute: number) {
      clockTarget = ((minute % 1440) + 1440) % 1440;
    },
    panTo(x: number, z: number) {
      const d = Math.hypot(x, z),
        k = d > PAN_LIMIT ? PAN_LIMIT / d : 1;
      camera.target.set(x * k, 0, z * k); // 각도·거리는 그대로 두고 바라보는 점만 옮김
    },
    update: entities.update,
    select,
    dispose() {
      disposed = true;
      markerLayer = null;
      markerNodes = [];
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearMovement);
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("mousemove", onEdgeMove);
      document.documentElement.removeEventListener("mouseleave", offEdge);
      abort.abort();
      observer.disconnect();
      stopPicking();
      sites.dispose();
      zoneVisual.dispose();
      qualityVisual.dispose();
      timberVisual.dispose();
      laborVisual.dispose();
      entities.dispose();
      village.dispose();
      logging.dispose();
      fuelYard.dispose();
      fog.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
