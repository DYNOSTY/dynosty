import type { InstantiatedEntries } from "@babylonjs/core/assetContainer";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import "@babylonjs/core/Meshes/instancedMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import "@babylonjs/core/Rendering/outlineRenderer";
import type { Scene } from "@babylonjs/core/scene";
import { addResidentInstance, residentLocal } from "./resident-crowd.js";
import { loadSceneAsset } from "./scene-assets.js";
import { seasonalModelUrl } from "./seasonal-model.js";
import type { GlbVisual } from "./village.js";
import type { Season } from "./world.js";

// Measured skinned rest-pose bounds. Winter clothing changes the extrema by
// less than 0.2 mm. Keep the same scale through crowd/detail and winter fallback.
const residentModels = {
  R02: { file: "R02_Triceratops", scale: 0.75, bottom: 0 },
  R03: { file: "R03_Velociraptor", scale: 1.65 / 2.34546, bottom: 0.01542 },
  SPINO: { file: "SPINO_Spinosaurus", scale: 2.35 / 2.64001, bottom: 0.03999 },
};

export function residentGlb(species: string, season: Season) {
  if (!Object.hasOwn(residentModels, species)) return null;
  const model = residentModels[species as keyof typeof residentModels];
  const url = seasonalModelUrl("residents", model.file, season === "winter");
  return {
    ...model,
    url,
    crowdUrl: url.replace("/residents/", "/residents/crowd/"),
  };
}

const outlineColor = new Color3(0.3, 0.9, 1);
const crowdLoads = new WeakMap<
  Scene,
  WeakMap<typeof loadSceneAsset, Map<string, ReturnType<typeof loadSceneAsset>>>
>();
function loadCrowd(scene: Scene, load: typeof loadSceneAsset, url: string) {
  let loaders = crowdLoads.get(scene);
  if (!loaders) {
    loaders = new WeakMap();
    crowdLoads.set(scene, loaders);
  }
  let urls = loaders.get(load);
  if (!urls) {
    urls = new Map();
    loaders.set(load, urls);
  }
  let pending = urls.get(url);
  if (!pending) {
    pending = load(scene, url);
    urls.set(url, pending);
    const owned = urls;
    void pending.catch(() => {
      if (owned.get(url) === pending) owned.delete(url);
    });
  }
  return pending;
}
function outline(mesh: AbstractMesh) {
  mesh.outlineColor = outlineColor;
  mesh.outlineWidth = 0.025;
  mesh.renderOutline = true;
}

export async function createResidentVisual(
  scene: Scene,
  parent: TransformNode,
  offsetY: number,
  species: string,
  season: Season,
  shadow: (
    at: TransformNode,
    radius: number,
    depth: number,
  ) => AbstractMesh | null,
  load = loadSceneAsset,
  shadowSource?: Mesh,
): Promise<GlbVisual> {
  const model = residentGlb(species, season);
  if (!model) throw Error("알 수 없는 주민 종입니다.");
  const loadSeason = async (
    variant: "crowdUrl" | "url",
    active: () => boolean,
  ) => {
    try {
      return await (variant === "crowdUrl"
        ? loadCrowd(scene, load, model[variant])
        : load(scene, model[variant]));
    } catch (error) {
      if (season !== "winter" || !active()) throw error;
      const fallback = residentGlb(species, "summer");
      if (!fallback) throw error;
      return variant === "crowdUrl"
        ? loadCrowd(scene, load, fallback[variant])
        : load(scene, fallback[variant]);
    }
  };
  const alive = () => !parent.isDisposed() && !scene.isDisposed;
  const asset = await loadSeason("crowdUrl", alive);
  if (!alive()) throw Error("종료한 대상입니다.");
  const source = asset.meshes.find(
    (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
  );
  if (!source) throw Error("군중 모델의 메시가 없습니다.");
  const node = new TransformNode(`${parent.name}:glb`, scene);
  node.parent = parent;
  const baseY = offsetY - model.bottom * model.scale;
  node.position.y = baseY;
  node.scaling.setAll(model.scale);
  // Include the GLTF loader's handedness root and any authored node transform.
  const orientation = new Quaternion();
  const sourceScale = new Vector3(),
    sourcePosition = new Vector3();
  source
    .computeWorldMatrix(true)
    .decompose(sourceScale, orientation, sourcePosition);
  let selected = false;
  const crowdLocal = new Matrix();
  const releaseCrowd = addResidentInstance(
    scene,
    source,
    {
      root: parent,
      visible: () => !selected,
      local: () =>
        residentLocal(node.scaling, node.rotation.z, node.position, crowdLocal),
    },
    true,
  );
  // Anchor the contact shadow to the ground, not the animated body pivot.
  const radius = 1.3 * model.scale,
    depth = 2 * model.scale;
  const blob = shadowSource ? null : shadow(parent, radius, depth);
  const shadowLocal = residentLocal(
    new Vector3(radius, 1, depth),
    0,
    new Vector3(radius * 0.25, 0.03 + offsetY, radius * 0.15),
    new Matrix(),
  );
  const releaseShadow = shadowSource
    ? addResidentInstance(
        scene,
        shadowSource,
        {
          root: parent,
          visible: () => true,
          local: () => shadowLocal,
        },
        false,
      )
    : null;
  if (blob) {
    blob.isPickable = false;
    blob.position.y += offsetY;
  }
  let proxy: Mesh | null = null,
    detail: InstantiatedEntries | null = null;
  let generation = 0,
    walking = false,
    disposed = false;
  let phase = (parent.uniqueId * 2.39996) % (2 * Math.PI);
  function play() {
    if (!detail) return;
    const clip = walking ? "Walk" : "Idle";
    for (const group of detail.animationGroups) {
      if (group.name.endsWith(clip)) group.start(true);
      else group.stop();
    }
  }
  function resetPose() {
    node.position.y = baseY;
    node.rotation.z = 0;
  }
  return {
    setOutline(value) {
      if (disposed || selected === value) return;
      selected = value;
      const request = ++generation;
      detail?.dispose();
      detail = null;
      proxy?.dispose();
      proxy = null;
      if (!value) return;
      // A private rigid copy provides immediate feedback, including on load failure.
      proxy = source.clone(`${parent.name}:selected`, node, true);
      proxy.position.copyFrom(sourcePosition);
      proxy.scaling.copyFrom(sourceScale);
      proxy.rotationQuaternion = orientation.clone();
      proxy.isPickable = true;
      outline(proxy);
      const current = () => !disposed && alive() && request === generation;
      void loadSeason("url", current)
        .then((asset) => {
          if (!current()) return; // Check BEFORE cloning a skeleton or animation group.
          detail = asset.instantiateModelsToScene(
            (name) => `${parent.name}:${name}`,
            false,
            { doNotInstantiate: true },
          );
          for (const root of detail.rootNodes) {
            root.parent = node;
            if (root instanceof Mesh) outline(root);
            for (const mesh of root.getChildMeshes()) outline(mesh);
          }
          proxy?.dispose();
          proxy = null;
          resetPose();
          play();
        })
        .catch(() => {
          /* Keep the individually outlined same-species proxy. */
        });
    },
    setMotion(value) {
      if (walking === (value === "walking")) return;
      walking = value === "walking";
      play();
    },
    animate(delta) {
      if (detail) return;
      const eye = scene.activeCamera?.globalPosition;
      const d2 = eye
        ? Vector3.DistanceSquared(
            parent.parent ? parent.absolutePosition : parent.position,
            eye,
          )
        : 0;
      // At overview distance retain path/heading, not subpixel bob and sway.
      if (d2 >= 85 * 85) {
        if (node.rotation.z || node.position.y !== baseY) resetPose();
        return;
      }
      phase += delta * (walking ? 9 : 2);
      const wave = Math.sin(phase);
      node.position.y = baseY + (walking ? Math.abs(wave) * 0.055 : 0);
      node.rotation.z = wave * (walking ? 0.045 : 0.009);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      releaseCrowd();
      releaseShadow?.();
      detail?.dispose();
      blob?.dispose();
      node.dispose();
    },
  };
}
