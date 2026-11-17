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
import { type MarkerRect, placeMarker } from "./marker-layout.js";
import { loadModelAssets } from "./model-assets.js";
import { createQualityVisual } from "./quality-scene.js";
import { createSceneEntities } from "./scene-entities.js";
import { observeSceneClicks } from "./scene-input.js";
import { focusSiteCamera, resetSceneCamera } from "./site-camera.js";
import { createSiteSelection } from "./site-selection.js";
import { isSiteId, type SiteId } from "./site-targets.js";
import { SCENE_SIGNS } from "./site-zones.js";
import { createTimberVisual } from "./timber-scene.js";
import { createZoneVisual } from "./zone-scene.js";

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
  const zoneVisual = createZoneVisual(scene);
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
  let markerNodes: {
    id: string;
    node: HTMLElement;
    point: Vector3;
    track?: string;
    height?: number;
    measured?: { key: string; width: number; height: number };
  }[] = [];
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
    updateTimber: timberVisual.update,
    updateLabor(state) {
      if (!state && markerState) resetSceneCamera(camera);
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
      resetSceneCamera(camera);
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
      sites.dispose();
      zoneVisual.dispose();
      qualityVisual.dispose();
      timberVisual.dispose();
      laborVisual.dispose();
      entities.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
