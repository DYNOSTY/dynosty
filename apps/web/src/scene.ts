import { fireBuildings, VILLAGE_LAYOUT } from "@dynosty/game-core";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { createHomePlacementVisual } from "./home-placement-scene.js";
import { createLegacyTimberVisual } from "./legacy-timber-scene.js";
import { terrainElevation } from "./terrain.js";
import "@babylonjs/core/Culling/ray";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateLineSystem } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateScreenshotUsingRenderTarget } from "@babylonjs/core/Misc/screenshotTools";
import { Scene } from "@babylonjs/core/scene";
import {
  BOKHOL_MAP,
  BUILDING_RULES,
  type BuildingKind,
  type GroundPoint,
  type HomePlacement,
  homeObstacle,
  homeUsage,
  type LaborState,
  laborStock,
  PLOT_STEP,
  productionSites,
  RESIDENT_REQUEST_TEXT,
  type SceneSnapshot,
  type TimberState,
  townObstacles,
} from "@dynosty/game-core";
import { createFog } from "./fog.js";
import { createLaborVisual } from "./labor-scene.js";
import { createLandmarks } from "./landmarks.js";
import { type MarkerRect, placeMarker } from "./marker-layout.js";
import { loadModelAssets, pickedNode } from "./model-assets.js";
import { createQualityVisual } from "./quality-scene.js";
import { createResourceSites } from "./resource-sites.js";
import { createSceneEntities } from "./scene-entities.js";
import { observeSceneClicks } from "./scene-input.js";
import { SCOUT_SITES } from "./scout-sites.js";
import { focusSiteCamera, resetSceneCamera } from "./site-camera.js";
import { createSiteSelection } from "./site-selection.js";
import { isSiteId, type SiteId } from "./site-targets.js";
import { SCENE_SIGNS } from "./site-zones.js";
import { createTimberVisual } from "./timber-scene.js";
import { createVillage, LAYOUT, type VillageTargetInfo } from "./village.js";
import { buildWorld, ISLAND_RADIUS } from "./world.js";
import { createZoneVisual } from "./zone-scene.js";

// B 레퍼런스(Dorfromantik)처럼 비스듬히 내려다보기: 수평에서 36° (beta는 수직에서 잰 각)
const CAMERA_BETA = ((90 - 36) * Math.PI) / 180;
const CAMERA_RADIUS = 56;
// 아래 콘솔이 화면 30%를 덮으므로 바라보는 점을 앞으로 당겨 섬을 위 칸 가운데에 둠
const CAMERA_TARGET = new Vector3(0, 0, -7);

import { createTownVisual } from "./town-scene.js";

export interface SceneController {
  villageInfo(id: string): VillageTargetInfo | undefined;
  update(snapshot: SceneSnapshot, showBoard?: boolean): void;
  select(id: string | null): void;
  focusSelected(): void;
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
  /** 게임 진행 중이면 주민이 걷고 굴뚝 연기가 남 */
  setRunning(running: boolean): void;
  /** 게임 시각(하루 안의 분) → 낮밤 */
  setClock(minute: number): void;
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
      due: number;
    }>,
  ): void;
  /** 게임 누적 시각(분) */
  setGameMinutes(total: number): void;
  /** 3D 지점들을 화면 좌표로 계속 알려 줌 (HTML 표식용) */
  trackPoints(
    points: Array<{ id: string; x: number; y: number; z: number }>,
    cb: (pos: Record<string, ScreenPoint>) => void,
  ): void;
  focus(position: GroundPoint, distance?: number): void;
  overview(topDown?: boolean): void;
  beginHomePlacement(
    confirm: (pose: HomePlacement) => void,
    feedback: (message: string, active: boolean) => void,
    kind?: BuildingKind,
    site?: HomePlacement["position"],
  ): void;
  setConstructionGrid(visible: boolean): void;
  cancelHomePlacement(): void;
  setSelectionEnabled(enabled: boolean): void;
  showPatrolMap(visible: boolean): void;
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

export type BuildingHover = {
  name: string;
  health?: number;
  details: string;
  x: number;
  y: number;
};
export function mountScene(
  canvas: HTMLCanvasElement,
  onSelectionChange: (id: string | null) => void,
  onAssetWarning: (message: string | null) => void = () => {},
  onCameraInfo: (info: CameraInfo) => void = () => {},
  onBuildingHover: (value: BuildingHover | null) => void = () => {},
  onFacilitySelect: (id: string | null) => void = () => {},
): SceneController {
  const engine = new Engine(canvas, true);
  const softwareRenderer = /swiftshader|llvmpipe|software/i.test(
    engine.getGlInfo().renderer,
  );
  if (softwareRenderer) engine.setHardwareScalingLevel(2);
  const scene = new Scene(engine);
  const camera = new ArcRotateCamera(
    "camera",
    -Math.PI / 2,
    CAMERA_BETA,
    CAMERA_RADIUS,
    CAMERA_TARGET.clone(),
    scene,
  );
  camera.attachControl(false, true, 1);
  camera.movement.input.inputMap.push({
    source: "pointer",
    button: 2,
    interaction: "rotate",
  });
  camera.lowerRadiusLimit = 4;
  camera.upperRadiusLimit = 140;
  camera.wheelDeltaPercentage = 0.01; // 휠 확대를 거리에 비례하게
  camera.lowerBetaLimit = 0.2;
  camera.upperBetaLimit = 1.35;
  // 시점 옮기기: 가운데 버튼 끌기(또는 Ctrl+왼쪽) · WASD. 땅과 나란히만 움직임
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
  canvas.dataset.season = season;
  const {
    shadow,
    setTime,
    glow,
    warmMat,
    followSnow,
    showPreviewTerrain,
    groundColor,
  } = buildWorld(
    scene,
    LAYOUT.map(([, x, z]) => [x, z] as [number, number]),
    season,
  );
  const worldRoot = new TransformNode("island-world", scene);
  for (const mesh of scene.meshes) if (!mesh.parent) mesh.parent = worldRoot;
  const previewVillage = new TransformNode("preview-village", scene);
  previewVillage.parent = worldRoot;
  const village = createVillage(
    scene,
    shadow,
    { glow, warmMat },
    previewVillage,
    season,
  );
  const fog = createFog(scene, SCOUT_SITES);
  const landmarks = createLandmarks(scene, SCOUT_SITES, glow, warmMat);
  // 깎은 자원 터 모델 (#47): 복홀 지도의 광맥·물고기 못에 앉힘. 마을 상태가 있을 때만 보임
  const resourceSites = createResourceSites(scene, worldRoot, () => {
    if (!disposed) onAssetWarning("자원 터 모델을 불러오지 못했습니다.");
  });
  for (const node of [...scene.meshes, ...scene.transformNodes])
    if (node !== worldRoot && !node.parent) node.parent = worldRoot;
  const demoGround = CreateGround(
    "procurement-ground",
    {
      width: BOKHOL_MAP.size,
      height: BOKHOL_MAP.size,
      subdivisions: 256,
      updatable: true,
    },
    scene,
  );
  const demoMaterial = new StandardMaterial(
    "procurement-ground-material",
    scene,
  );
  const vertices = demoGround.getVerticesData(VertexBuffer.PositionKind);
  if (!vertices) throw Error("지면 모형의 꼭짓점이 없습니다.");
  const groundColors = [];
  for (const [i, x] of vertices.entries()) {
    if (i % 3 !== 0) continue;
    const z = vertices[i + 2];
    if (z === undefined) throw Error("지면 좌표가 불완전합니다.");
    groundColors.push(...groundColor(x, z), 1);
  }
  demoGround.setVerticesData(VertexBuffer.ColorKind, groundColors);
  const plotTexture = new DynamicTexture("construction-plots", 64, scene, true);
  const ink = plotTexture.getContext();
  ink.fillStyle = "#ffffff";
  ink.fillRect(0, 0, 64, 64);
  ink.fillStyle = "#715d43";
  ink.fillRect(30, 0, 4, 64);
  ink.fillRect(0, 30, 64, 4);
  plotTexture.wrapU = plotTexture.wrapV = Texture.WRAP_ADDRESSMODE;
  plotTexture.uScale = plotTexture.vScale = BOKHOL_MAP.size / PLOT_STEP;
  plotTexture.update();
  demoGround.material = demoMaterial;
  demoGround.isPickable = true;
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
      village.mark(id?.startsWith("village:") ? id : null);
      selected = id;
      onSelectionChange(id);
    }
  };
  const ground = demoGround;
  let terrainKey = "";
  let elevation = terrainElevation(null);
  const updateGround = (s: TimberState | null, flat = false) => {
    elevation = flat ? () => 0 : terrainElevation(s);
    const key = JSON.stringify([
      flat,
      s
        ? productionSites(s).map((l) => [
            l.remaining === 0,
            l.built,
            l.storageBuilt,
          ])
        : null,
      s?.homes.map((h) => [h.position, h.headingRadians]),
      s?.town.facilities.map((f) => [f.position, f.headingRadians]),
      s?.town.orders.map((f) => [f.position, f.headingRadians]),
      s?.construction?.position,
      s?.construction?.headingRadians,
    ]);
    if (key === terrainKey) return false;
    terrainKey = key;
    const positions = ground.getVerticesData(VertexBuffer.PositionKind),
      indices = ground.getIndices();
    if (positions && indices) {
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i] ?? 0,
          z = positions[i + 2] ?? 0;
        positions[i + 1] = elevation(x, z);
      }
      const normals: number[] = [];
      VertexData.ComputeNormals(positions, indices, normals);
      ground.updateVerticesData(VertexBuffer.PositionKind, positions);
      ground.updateVerticesData(VertexBuffer.NormalKind, normals);
      ground.refreshBoundingInfo();
    }
    return true;
  };
  updateGround(null);
  const entities = createSceneEntities(
    scene,
    (id) => {
      if (id === null && isSiteId(selected)) return;
      if (id !== null) sites.select(null);
      publishSelection(id);
    },
    () => onAssetWarning("모델을 만들지 못해 연결 예제로 표시합니다."),
  );
  entities.setElevation(elevation);
  let timberVisual = createTimberVisual(scene);
  let legacyVisual: ReturnType<typeof createLegacyTimberVisual> | null = null;
  let laborVisual = createLaborVisual(scene);
  let qualityVisual = createQualityVisual(scene);
  let zoneVisual = createZoneVisual(scene);
  const onSiteSelection = (id: SiteId | null) => {
    if (id === null && !isSiteId(selected)) return;
    if (id !== null) entities.select(null);
    publishSelection(id);
  };
  let sites = createSiteSelection(scene, onSiteSelection);
  let cachedAssets: Parameters<typeof laborVisual.setModels>[0] = {};
  function disposeLaborLayers() {
    sites.select(null);
    sites.dispose();
    zoneVisual.dispose();
    qualityVisual.dispose();
    laborVisual.dispose();
  }
  function recreateLaborLayers() {
    laborVisual = createLaborVisual(scene);
    laborVisual.setModels(cachedAssets);
    qualityVisual = createQualityVisual(scene);
    zoneVisual = createZoneVisual(scene);
    sites = createSiteSelection(scene, onSiteSelection);
  }
  const select = (id: string | null) => {
    if (
      id === null ||
      id.startsWith("town:") ||
      id.startsWith("production:") ||
      village.targets.has(id)
    ) {
      entities.select(null);
      sites.select(null);
      publishSelection(id);
    } else if (isSiteId(id)) {
      entities.select(null);
      sites.select(id);
    } else {
      sites.select(null);
      entities.select(id);
    }
  };
  const townVisual = createTownVisual(scene);
  let villageState: TimberState | null = null;
  const homePreview = createHomePlacementVisual(
    scene,
    canvas,
    ground,
    () => villageState,
    (x, z) => elevation(x, z),
    village.entityVisual,
  );
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
      cachedAssets = assets;
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
  let selectionEnabled = true;
  let animationSpeed = 1;
  const stopPicking = observeSceneClicks(canvas, (x, y) => {
    if (!selectionEnabled) return;
    const picked = pickedNode(scene.pick(x, y));
    let hit = picked;
    while (hit) {
      const townId = hit.metadata?.townTarget as string | undefined;
      const villageId = hit.metadata?.villageTarget as string | undefined;
      const homeId = villageState?.homes.find(
        (home) => home.id === hit?.id,
      )?.id;
      const target = townId ?? villageId ?? homeId;
      if (target) {
        if (homePreview.active) homePreview.cancel();
        select(target);
        const facility = villageState?.town.facilities.find(
          (f) => "town:" + f.id === townId,
        );
        onFacilitySelect(
          facility?.id ?? villageId?.match(/^production:(.+)$/)?.[1] ?? null,
        );
        return;
      }
      hit = hit.parent as typeof hit;
    }
    // An unfinished foundation is flush with the terrain. Resolve clicks on its footprint as well.
    const groundPoint = scene.pick(x, y, (m) => m === ground)?.pickedPoint;
    const foundation =
      groundPoint &&
      villageState?.town.orders.find((o) => {
        const dx = groundPoint.x - o.position.x,
          dz = groundPoint.z - o.position.z;
        const cos = Math.cos(o.headingRadians),
          sin = Math.sin(o.headingRadians);
        return (
          Math.abs(dx * cos - dz * sin) <= 2 &&
          Math.abs(dx * sin + dz * cos) <= 2
        );
      });
    onFacilitySelect(null);
    if (foundation) {
      if (homePreview.active) homePreview.cancel();
      select("town:" + foundation.id);
      return;
    }
    if (homePreview.active) {
      homePreview.commit(x, y);
      return;
    }
    const site = sites.idForMesh(picked);
    if (site) select(site);
    else {
      if (selected?.startsWith("village:") || selected?.startsWith("town:"))
        select(null);
      sites.select(null);
      entities.selectMesh(picked);
    }
  });
  const hover = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    if (homePreview.active) {
      homePreview.pointer(event.clientX - rect.left, event.clientY - rect.top);
      onBuildingHover(null);
      return;
    }
    let mesh = pickedNode(
      scene.pick(event.clientX - rect.left, event.clientY - rect.top),
    );
    let name: string | null = null,
      health: number | undefined,
      details = "";
    while (mesh) {
      const home = villageState?.homes.find((h) => h.id === mesh?.id);
      if (home) {
        const index =
          villageState?.homes.findIndex((h) => h.id === home.id) ?? 0;
        name = index === 0 ? "온돌 둥지" : `온돌 둥지${index + 1}`;
        health = index === 0 ? (villageState?.buildingHealth ?? 100) : 100;
        details = `입주 ${villageState?.residents.filter((r) => r.homeId === home.id && r.health !== "dead").length ?? 0}명 · 공간 ${villageState ? homeUsage(home.id, villageState.residents, villageState.world.citizens) : 0}/${home.capacity}`;
        break;
      }
      if (mesh.id === "example-building-1") {
        name = "온돌 둥지";
        health = 100;
        break;
      }
      if (
        mesh.id === "resident-restaurant" ||
        mesh.id === "resident-meal-table"
      ) {
        name = "공동 식당";
        health = 100;
        details = "직원 배치와 영업시간에 따라 배급합니다.";
        break;
      }
      if (
        mesh.id.startsWith("logging-workshop") ||
        mesh.id.startsWith("logging-storage")
      ) {
        name = mesh.id.startsWith("logging-workshop")
          ? "자원 작업장"
          : "자원 저장소";
        details =
          name === "자원 작업장"
            ? "도착한 작업 인원만 자원을 생산합니다."
            : "화물을 내려놓으면 공동 재고에 반영합니다.";
        break;
      }
      const order = villageState?.town.orders.find(
        (o) => "town:" + o.id === mesh?.id,
      );
      if (order) {
        name = BUILDING_RULES[order.kind].name;
        details = "건설 현장 · 인부 " + order.crew.length + "명";
        break;
      }
      const facility = villageState?.town.facilities.find(
        (f) => `town:${f.id}` === mesh?.id,
      );
      if (facility) {
        name = BUILDING_RULES[facility.kind].name;
        health = 100;
        details =
          facility.kind === "hospital"
            ? "클릭하면 치료 중인 주민을 봅니다. 입원 중 자동 회복·퇴원합니다."
            : "운영 인원과 입지 조건에 따라 생산합니다.";
        break;
      }
      const resident = villageState?.residents.find((r) => r.id === mesh?.id);
      if (resident) {
        name = `주민 ${(villageState?.residents.findIndex((r) => r.id === resident.id) ?? 0) + 1}`;
        const job = villageState?.town.orders.find((o) =>
          o.crew.includes(resident.id),
        );
        details = job
          ? BUILDING_RULES[job.kind].name +
            " 공사 배정 · " +
            {
              waiting: "대기",
              collect: "자재 수령",
              deliver: "자재 운반",
              build: "시공",
            }[job.stage]
          : resident.request
            ? RESIDENT_REQUEST_TEXT[resident.request]
            : resident.workplaceId === "restaurant"
              ? "공동 식당 직원"
              : resident.workplaceId?.startsWith("logging")
                ? "자원 작업장 직원"
                : resident.task?.startsWith("logging-haul")
                  ? "자원 운반 담당"
                  : "마을 주민";
        break;
      }
      mesh = mesh.parent as typeof mesh;
    }
    onBuildingHover(
      name
        ? {
            name,
            ...(health === undefined ? {} : { health }),
            details,
            x: event.clientX + 12,
            y: event.clientY + 12,
          }
        : null,
    );
  };
  const clearHover = () => {
    onBuildingHover(null);
    homePreview.leave();
  };
  canvas.addEventListener("pointermove", hover);
  canvas.addEventListener("pointerleave", clearHover);
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
  let infoDirty = true,
    infoAt = 0;
  let clockTarget = 9 * 60,
    clockShown = 9 * 60;
  engine.runRenderLoop(() => {
    if (
      !assetsReady ||
      document.querySelector(
        ".film-screen:modal, .bokhol-title:modal, .mission-entry:modal",
      )
    )
      return;
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
    scene.fogEnd = Math.max(
      95,
      camera.radius * (season === "winter" ? 2.4 : 4),
    );
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
    const limit = demoActive ? BOKHOL_MAP.size / 2 : PAN_LIMIT;
    if (d > limit) {
      t.x *= limit / d;
      t.z *= limit / d;
    }
    t.y = demoActive ? elevation(t.x, t.z) : 0;
    const key = `${camera.radius.toFixed(2)}:${camera.beta.toFixed(3)}:${camera.alpha.toFixed(3)}:${t.x.toFixed(1)}:${t.z.toFixed(1)}`;
    trackTick = (trackTick + 1) % 15;
    const partyPts = village.partyPoints();
    if (
      onTrack &&
      (key !== cameraKey ||
        canvas.clientWidth !== lastW ||
        trackTick === 0 ||
        partyPts.some((p) => p.visible))
    ) {
      lastW = canvas.clientWidth;
      const w = canvas.clientWidth,
        h = canvas.clientHeight,
        vm = scene.getTransformMatrix(),
        vp = camera.viewport.toGlobal(w, h);
      const out: Record<string, ScreenPoint> = {};
      for (const pt of [...tracked, ...partyPts]) {
        const sp = Vector3.Project(
          new Vector3(
            pt.x,
            pt.y + (pt.id.startsWith("visitor-") ? elevation(pt.x, pt.z) : 0),
            pt.z,
          ),
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
      if (homePreview.active) homePreview.cameraMoved();
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
    const villageDelta =
      villageState?.paused && villageState.campaign?.beat !== "departure"
        ? 0
        : (engine.getDeltaTime() / 1000) * animationSpeed;
    entities.animate(
      villageDelta,
      villageState?.campaign?.beat === "departure",
    );
    if (legacyVisual) legacyVisual.animate(engine.getDeltaTime() / 1000);
    else timberVisual.animate(villageDelta);
    laborVisual.animate(engine.getDeltaTime() / 1000);
    scene.render();
    if (markerLayer) {
      const width = canvas.clientWidth,
        height = canvas.clientHeight;
      const viewport = camera.viewport.toGlobal(width, height);
      const occupied: MarkerRect[] = [];
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
          scene.getTransformMatrix(),
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
  let patrolMap: ReturnType<typeof CreateLineSystem> | undefined;
  function showPatrolMap(visible: boolean) {
    patrolMap?.dispose();
    patrolMap = undefined;
    if (!visible || !villageState) return;
    const points = [
      ...villageState.homes,
      ...villageState.town.facilities,
      ...villageState.town.orders,
    ].map((f) => f.position);
    const extent = Math.max(28, ...points.map((p) => Math.hypot(p.x, p.z) + 4));
    const point = (x: number, z: number) =>
      new Vector3(x, elevation(x, z) + 0.18, z);
    const lines = [
      Array.from({ length: 129 }, (_, i) =>
        point(
          extent * Math.cos((i * Math.PI) / 64),
          extent * Math.sin((i * Math.PI) / 64),
        ),
      ),
    ];
    for (let z = -extent + 2; z < extent; z += 2.5) {
      const half = Math.sqrt(extent * extent - z * z);
      lines.push(
        Array.from({ length: 45 }, (_, i) =>
          point(-half + (2 * half * i) / 44, z),
        ),
      );
    }
    patrolMap = CreateLineSystem("관아 순라 구역", { lines }, scene);
    patrolMap.color = new Color3(0.95, 0.68, 0.28);
    patrolMap.alpha = 0.64;
    patrolMap.isPickable = false;
  }
  return {
    ready,
    showPatrolMap,
    setConstructionGrid(visible) {
      demoMaterial.diffuseTexture = visible ? plotTexture : null;
    },
    beginHomePlacement: homePreview.begin,
    cancelHomePlacement: homePreview.cancel,
    updateTimber(state) {
      if (legacyVisual) {
        disposeLaborLayers();
        legacyVisual.dispose();
        legacyVisual = null;
        timberVisual = createTimberVisual(scene);
        recreateLaborLayers();
        camera.upperRadiusLimit = state ? 720 : 140;
      }
      const active = state !== null;
      camera.upperRadiusLimit = active ? 720 : 140;
      if (active !== demoActive) {
        demoActive = active;
        if (selected?.startsWith("village:") || selected?.startsWith("town:"))
          select(null);
        worldRoot.setEnabled(true);
        previewVillage.setEnabled(true);
        village.setPreviewResidentsVisible(!active);
        demoGround.setEnabled(active);
        showPreviewTerrain(!active);
        camera.upperRadiusLimit = active ? 720 : 140;
        if (softwareRenderer) engine.setHardwareScalingLevel(active ? 1 : 2);
        if (!active) resetWorldCamera();
      }
      if (state && !villageState) resetWorldCamera();
      const terrainChanged = updateGround(state);
      entities.setElevation(elevation);
      resourceSites.update(state, elevation, terrainChanged);
      const decree = state?.decree;
      const priorDecree = villageState?.decree;
      if (
        decree &&
        (decree.serial !== priorDecree?.serial ||
          decree.title !== priorDecree?.title)
      )
        village.postDecree(decree.title, !!villageState);
      if (!decree && priorDecree) village.clearDecree();
      village.setFireDamage(
        !!state?.rebuilding && !state.campaign?.openingLosses,
        state?.campaign?.beat === "departure",
        state?.removedLandmarks,
        state?.campaign?.beat === "departure" && state.campaign.openingLosses
          ? VILLAGE_LAYOUT.filter(([id]) =>
              state.campaign?.openingLosses?.includes(id),
            ).map(([id, x, z]) => ({ id, x, z }))
          : state?.nightFires?.flatMap((f) => {
              const b = fireBuildings(state).find((b) => b.id === f.id);
              return b ? [{ id: b.id, ...b.position }] : [];
            }),
        state?.raidFailures === 3,
      );
      villageState = state;
      animationSpeed = state?.speed ?? 1;
      entities.setObstacles(
        state
          ? [
              ...townObstacles(state),
              ...(state.construction?.kind === "home"
                ? [homeObstacle(state.construction)]
                : []),
            ]
          : [],
      );
      timberVisual.update(state);
      townVisual.update(state);
      if (!state) homePreview.cancel();
      else homePreview.refresh();
    },
    setSelectionEnabled(enabled) {
      selectionEnabled = enabled;
      if (!enabled) entities.select(null);
    },
    overview(topDown = false) {
      camera.inertialPanningX = 0;
      camera.inertialPanningY = 0;
      camera.inertialRadiusOffset = 0;
      camera.radius = 640;
      camera.beta = topDown ? 0.2 : 0.7;
      camera.setTarget(Vector3.Zero(), false, true, true);
    },
    focus(position, distance = 32) {
      camera.inertialPanningX = 0;
      camera.inertialPanningY = 0;
      camera.inertialRadiusOffset = 0;
      camera.beta = Math.PI / 3;
      camera.radius = Math.max(4, Math.min(720, distance));
      camera.setTarget(
        new Vector3(position.x, elevation(position.x, position.z), position.z),
        false,
        true,
        true,
      );
    },
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
    updateLabor(state) {
      if (state) {
        if (!legacyVisual) {
          disposeLaborLayers();
          timberVisual.dispose();
          legacyVisual = createLegacyTimberVisual(scene);
          recreateLaborLayers();
          camera.upperRadiusLimit = 48;
          resetSceneCamera(camera);
        }
        if (!demoActive) {
          worldRoot.setEnabled(false);
          demoGround.setEnabled(true);
          demoActive = true;
          resetSceneCamera(camera);
        }
        villageState = null;
        townVisual.update(null);
        homePreview.cancel();
        updateGround(null, true);
        entities.setElevation(() => 0);
        resourceSites.update(null, () => 0, false);
        entities.setObstacles([]);
        legacyVisual.update({ ...state.timber, stock: laborStock(state) });
      } else if (legacyVisual) {
        disposeLaborLayers();
        legacyVisual.dispose();
        legacyVisual = null;
        timberVisual = createTimberVisual(scene);
        recreateLaborLayers();
      }
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
    resetCamera() {
      if (demoActive) {
        resetSceneCamera(camera);
        camera.radius = 32;
      } else resetWorldCamera();
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
    setRunning(running: boolean) {
      runningNow = running;
      village.setRunning(running);
    },
    setClock(minute: number) {
      clockTarget = ((minute % 1440) + 1440) % 1440;
    },
    panTo(x: number, z: number) {
      const d = Math.hypot(x, z),
        k = d > PAN_LIMIT ? PAN_LIMIT / d : 1;
      camera.target.set(x * k, 0, z * k); // 각도·거리는 그대로 두고 바라보는 점만 옮김
    },
    villageInfo(id) {
      const order = villageState?.town.orders.find(
        (o) => "town:" + o.id === id,
      );
      if (order)
        return {
          name: BUILDING_RULES[order.kind].name,
          detail: "건설 현장 · 인부 " + order.crew.length + "명",
        };
      const facility = villageState?.town.facilities.find(
        (f) => "town:" + f.id === id,
      );
      if (facility)
        return {
          name: BUILDING_RULES[facility.kind].name,
          detail: "완공 시설 · " + facility.level + "단계",
        };
      return village.targets.get(id);
    },
    focusSelected() {
      const position =
        selected && village.targets.get(selected)?.buildingPosition;
      if (!position) return;
      camera.inertialPanningX = camera.inertialPanningY = 0;
      camera.inertialRadiusOffset = 0;
      camera.target.set(position.x, 1, position.z);
      camera.radius = 16;
    },
    update(snapshot, showBoard) {
      const exodus = snapshot.entities.some((e) => e.id === "departing-0");
      const visible = exodus
        ? snapshot.entities.filter(
            (e) =>
              !e.id.startsWith("departing-") || Number(e.id.slice(10)) < 32,
          )
        : snapshot.entities;
      entities.update({ ...snapshot, entities: visible }, showBoard);
    },
    select,
    dispose() {
      disposed = true;
      markerLayer = null;
      markerNodes = [];
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      abort.abort();
      observer.disconnect();
      stopPicking();
      disposeLaborLayers();
      timberVisual.dispose();
      legacyVisual?.dispose();
      canvas.removeEventListener("pointermove", hover);
      canvas.removeEventListener("pointerleave", clearHover);
      clearHover();
      homePreview.dispose();
      townVisual.dispose();
      entities.dispose();
      village.dispose();
      resourceSites.dispose();
      fog.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
