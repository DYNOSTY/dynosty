import "@babylonjs/core/Culling/ray";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Scene } from "@babylonjs/core/scene";
import type {
  LaborState,
  SceneSnapshot,
  TimberState,
} from "@dynosty/game-core";
import { createLaborVisual } from "./labor-scene.js";
import { loadModelAssets } from "./model-assets.js";
import { createQualityVisual } from "./quality-scene.js";
import { createSceneEntities } from "./scene-entities.js";
import { observeSceneClicks } from "./scene-input.js";
import { createSiteSelection } from "./site-selection.js";
import {
  isSiteId,
  SITE_IDS,
  SITE_POINTS,
  type SiteId,
  siteAvailable,
} from "./site-targets.js";
import { createTimberVisual } from "./timber-scene.js";

export interface SceneController {
  update(snapshot: SceneSnapshot): void;
  select(id: string | null): void;
  dispose(): void;
  readonly ready: Promise<void>;
  resetCamera(): void;
  updateLabor(state: LaborState | null): void;
  setSiteMarkers(layer: HTMLDivElement | null): void;
  updateTimber(state: TimberState | null): void;
}

export function mountScene(
  canvas: HTMLCanvasElement,
  onSelectionChange: (id: string | null) => void,
  onAssetWarning: (message: string | null) => void = () => {},
  onCameraInfo: (info: {
    distance: number;
    angle: number;
    height: number;
  }) => void = () => {},
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
  camera.upperRadiusLimit = 48;
  camera.lowerBetaLimit = 0.2;
  camera.upperBetaLimit = 1.35;
  camera.panningSensibility = 0;
  camera.minZ = 0.1;
  new HemisphericLight("sun", new Vector3(0, 1, 0), scene);
  const ground = CreateGround(
    "ground",
    { width: 20, height: 20, subdivisions: 30, updatable: true },
    scene,
  );
  const elevation = (x: number, z: number) =>
    Math.max(0, Math.min(1, (Math.hypot(x, z) - 6) / 6)) *
    (Math.sin(x * 0.7) * Math.cos(z * 0.5) + 1) *
    0.4;
  const positions = ground.getVerticesData(VertexBuffer.PositionKind);
  const indices = ground.getIndices();
  if (positions && indices) {
    for (let i = 0; i < positions.length; i += 3)
      positions[i + 1] = elevation(positions[i] ?? 0, positions[i + 2] ?? 0);
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    ground.updateVerticesData(VertexBuffer.PositionKind, positions);
    ground.updateVerticesData(VertexBuffer.NormalKind, normals);
  }
  const bark = new StandardMaterial("tree-bark", scene);
  bark.diffuseColor = new Color3(0.31, 0.23, 0.15);
  const leaves = new StandardMaterial("tree-leaves", scene);
  leaves.diffuseColor = new Color3(0.19, 0.35, 0.24);
  for (const [i, [x, z]] of [
    [-7, -6],
    [7, -6],
    [-8, 5],
    [8, 6],
    [-5, 8],
  ].entries()) {
    if (x === undefined || z === undefined) continue;
    const y = elevation(x, z);
    const trunk = CreateCylinder(
      `tree-${i}-trunk`,
      { height: 0.9, diameter: 0.18, tessellation: 6 },
      scene,
    );
    trunk.position.set(x, y + 0.45, z);
    trunk.material = bark;
    trunk.isPickable = false;
    const top = CreateCylinder(
      `tree-${i}-top`,
      { height: 1.5, diameterBottom: 1, diameterTop: 0, tessellation: 6 },
      scene,
    );
    top.position.set(x, y + 1.2, z);
    top.material = leaves;
    top.isPickable = false;
  }
  const groundMaterial = new StandardMaterial("ground-material", scene);
  groundMaterial.diffuseColor = new Color3(0.28, 0.43, 0.28);
  ground.material = groundMaterial;
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
  const sites = createSiteSelection(scene, (id) => {
    if (id === null && !isSiteId(selected)) return;
    if (id !== null) entities.select(null);
    publishSelection(id);
  });
  const select = (id: string | null) => {
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
    const mesh = scene.pick(x, y)?.pickedMesh ?? null,
      site = sites.idForMesh(mesh);
    if (site) select(site);
    else {
      sites.select(null);
      entities.selectMesh(mesh);
    }
  });
  const observer = new ResizeObserver(() => engine.resize());
  observer.observe(canvas);
  let markerLayer: HTMLDivElement | null = null;
  let markerState: LaborState | null = null;
  let markerNodes: { id: SiteId; node: HTMLElement; point: Vector3 }[] = [];
  const markerIdentity = Matrix.Identity();
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
    entities.animate(engine.getDeltaTime() / 1000);
    timberVisual.animate(engine.getDeltaTime() / 1000);
    laborVisual.animate(engine.getDeltaTime() / 1000);
    scene.render();
    if (markerLayer) {
      const width = canvas.clientWidth,
        height = canvas.clientHeight;
      const viewport = camera.viewport.toGlobal(width, height);
      for (const { id, node, point } of markerNodes) {
        const p = Vector3.Project(
          point,
          markerIdentity,
          scene.getTransformMatrix(),
          viewport,
        );
        const visible =
          markerState &&
          siteAvailable(markerState, id) &&
          p.z >= 0 &&
          p.z <= 1 &&
          p.x >= 0 &&
          p.x <= width &&
          p.y >= 0 &&
          p.y <= height;
        if (node.hidden === Boolean(visible)) node.hidden = !visible;
        if (visible) {
          const transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
          if (node.style.transform !== transform)
            node.style.transform = transform;
        }
      }
    }
  });
  return {
    ready,
    setSiteMarkers(layer) {
      markerLayer = layer;
      markerNodes = layer
        ? SITE_IDS.flatMap((id) => {
            const node = layer.querySelector<HTMLElement>(
              `[data-site-marker="${id}"]`,
            );
            const [x, y, z] = SITE_POINTS[id];
            return node
              ? [{ id, node, point: new Vector3(x, y + 0.8, z) }]
              : [];
          })
        : [];
    },
    updateTimber: timberVisual.update,
    updateLabor(state) {
      markerState = state;
      laborVisual.update(state);
      qualityVisual.update(state);
      sites.update(state);
    },
    resetCamera() {
      camera.alpha = -Math.PI / 2;
      camera.beta = Math.PI / 3;
      camera.radius = 12;
      camera.setTarget(Vector3.Zero());
      camera.inertialAlphaOffset = 0;
      camera.inertialBetaOffset = 0;
      camera.inertialRadiusOffset = 0;
    },
    update: entities.update,
    select,
    dispose() {
      disposed = true;
      markerLayer = null;
      markerNodes = [];
      abort.abort();
      observer.disconnect();
      stopPicking();
      qualityVisual.dispose();
      timberVisual.dispose();
      sites.dispose();
      laborVisual.dispose();
      entities.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
