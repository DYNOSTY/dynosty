import { createHomePlacementVisual } from "./home-placement-scene.js";
import { terrainElevation } from "./terrain.js";
import "@babylonjs/core/Culling/ray";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Scene } from "@babylonjs/core/scene";
import {
  BOKHOL_MAP,
  BUILDING_RULES,
  type BuildingKind,
  type GroundPoint,
  type HomePlacement,
  homeObstacle,
  homeUsage,
  productionSites,
  RESIDENT_REQUEST_TEXT,
  type SceneSnapshot,
  type TimberState,
  townObstacles,
} from "@dynosty/game-core";
import { loadModelAssets } from "./model-assets.js";
import { createSceneEntities } from "./scene-entities.js";
import { observeSceneClicks } from "./scene-input.js";
import { createTimberVisual } from "./timber-scene.js";
import { createTownVisual } from "./town-scene.js";

export interface SceneController {
  update(snapshot: SceneSnapshot): void;
  select(id: string | null): void;
  dispose(): void;
  readonly ready: Promise<void>;
  resetCamera(): void;
  focus(position: GroundPoint, distance?: number): void;
  overview(): void;
  beginHomePlacement(
    confirm: (pose: HomePlacement) => void,
    feedback: (message: string, active: boolean) => void,
    kind?: BuildingKind,
  ): void;
  cancelHomePlacement(): void;
  updateTimber(state: TimberState | null): void;
  setSelectionEnabled(enabled: boolean): void;
}

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
  onCameraInfo: (info: {
    distance: number;
    angle: number;
    height: number;
  }) => void = () => {},
  onBuildingHover: (value: BuildingHover | null) => void = () => {},
  onHospitalSelect: (id: string | null) => void = () => {},
): SceneController {
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.08, 0.14, 0.12, 1);
  const camera = new ArcRotateCamera(
    "camera",
    -Math.PI / 2,
    Math.PI / 3,
    12,
    Vector3.Zero(),
    scene,
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 4;
  camera.upperRadiusLimit = 720;
  camera.lowerBetaLimit = 0.2;
  camera.upperBetaLimit = 1.35;
  camera.panningSensibility = 120;
  camera.minZ = 0.1;
  new HemisphericLight("sun", new Vector3(0, 1, 0), scene);
  const ground = CreateGround(
    "ground",
    {
      width: BOKHOL_MAP.size,
      height: BOKHOL_MAP.size,
      subdivisions: 256,
      updatable: true,
    },
    scene,
  );
  let terrainKey = "";
  let elevation = terrainElevation(null);
  const updateGround = (s: TimberState | null) => {
    elevation = terrainElevation(s);
    const key = JSON.stringify([
      s
        ? productionSites(s).map((l) => [
            l.remaining === 0,
            l.built,
            l.storageBuilt,
          ])
        : null,
      s?.homes.map((h) => h.position),
      s?.town.facilities.map((f) => f.position),
      s?.town.orders.map((f) => f.position),
      s?.construction?.position,
    ]);
    if (key === terrainKey) return;
    terrainKey = key;
    const positions = ground.getVerticesData(VertexBuffer.PositionKind),
      indices = ground.getIndices();
    if (positions && indices) {
      for (let i = 0; i < positions.length; i += 3)
        positions[i + 1] = elevation(positions[i] ?? 0, positions[i + 2] ?? 0);
      const normals: number[] = [];
      VertexData.ComputeNormals(positions, indices, normals);
      ground.updateVerticesData(VertexBuffer.PositionKind, positions);
      ground.updateVerticesData(VertexBuffer.NormalKind, normals);
      ground.refreshBoundingInfo();
    }
  };
  updateGround(null);
  const groundMaterial = new StandardMaterial("ground-material", scene);
  groundMaterial.diffuseColor = new Color3(0.28, 0.43, 0.28);
  groundMaterial.specularColor = Color3.Black();
  ground.material = groundMaterial;
  const entities = createSceneEntities(scene, onSelectionChange, () =>
    onAssetWarning("모델을 만들지 못해 연결 예제로 표시합니다."),
  );
  entities.setElevation(elevation);
  const timberVisual = createTimberVisual(scene);
  const townVisual = createTownVisual(scene);
  let villageState: TimberState | null = null;
  const homePreview = createHomePlacementVisual(
    scene,
    canvas,
    ground,
    () => villageState,
    (x, z) => elevation(x, z),
  );
  const abort = new AbortController();
  let disposed = false;
  const ready = loadModelAssets(abort.signal)
    .then(({ assets, failed }) => {
      if (disposed) return;
      entities.setModels(assets);
      if (assets.building) homePreview.setModel(assets.building);
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
  let selectionEnabled = true;
  let animationSpeed = 1;
  const stopPicking = observeSceneClicks(canvas, (x, y) => {
    if (homePreview.active) {
      homePreview.commit(x, y);
      return;
    }
    const picked = scene.pick(x, y)?.pickedMesh ?? null;
    let hospitalMesh = picked;
    while (hospitalMesh) {
      const hospital = villageState?.town.facilities.find(
        (f) => f.kind === "hospital" && `town:${f.id}` === hospitalMesh?.id,
      );
      if (hospital) {
        onHospitalSelect(hospital.id);
        return;
      }
      hospitalMesh = hospitalMesh.parent as typeof hospitalMesh;
    }
    onHospitalSelect(null);
    if (selectionEnabled) entities.selectMesh(picked);
  });
  const hover = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    if (homePreview.active) {
      homePreview.pointer(event.clientX - rect.left, event.clientY - rect.top);
      onBuildingHover(null);
      return;
    }
    let mesh = scene.pick(
      ((event.clientX - rect.left) * canvas.width) / rect.width,
      ((event.clientY - rect.top) * canvas.height) / rect.height,
    )?.pickedMesh;
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
        name = `주민 ${villageState?.residents.findIndex((r) => r.id === resident.id) ?? 0 + 1}`;
        details = resident.request
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
  let cameraKey = "";
  engine.runRenderLoop(() => {
    const key = `${camera.radius.toFixed(2)}:${camera.beta.toFixed(3)}:${camera.alpha.toFixed(3)}`;
    if (key !== cameraKey) {
      cameraKey = key;
      onCameraInfo({
        distance: camera.radius,
        angle: (camera.beta * 180) / Math.PI,
        height: camera.radius * Math.cos(camera.beta),
      });
    }
    entities.animate((engine.getDeltaTime() / 1000) * animationSpeed);
    timberVisual.animate((engine.getDeltaTime() / 1000) * animationSpeed);
    scene.render();
  });
  return {
    ready,
    beginHomePlacement: homePreview.begin,
    cancelHomePlacement: homePreview.cancel,
    updateTimber(state) {
      if (state && !villageState) {
        camera.radius = 32;
        camera.setTarget(Vector3.Zero(), false, true, true);
      }
      updateGround(state);
      entities.setElevation(elevation);
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
    overview() {
      camera.inertialPanningX = 0;
      camera.inertialPanningY = 0;
      camera.inertialRadiusOffset = 0;
      camera.radius = 640;
      camera.beta = 0.7;
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
    resetCamera() {
      camera.inertialPanningX = 0;
      camera.inertialPanningY = 0;
      camera.alpha = -Math.PI / 2;
      camera.beta = Math.PI / 3;
      camera.radius = 12;
      camera.setTarget(Vector3.Zero(), false, true, true);
      camera.inertialAlphaOffset = 0;
      camera.inertialBetaOffset = 0;
      camera.inertialRadiusOffset = 0;
    },
    update: entities.update,
    select: entities.select,
    dispose() {
      disposed = true;
      abort.abort();
      observer.disconnect();
      stopPicking();
      canvas.removeEventListener("pointermove", hover);
      canvas.removeEventListener("pointerleave", clearHover);
      clearHover();
      homePreview.dispose();
      timberVisual.dispose();
      townVisual.dispose();
      entities.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
