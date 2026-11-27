import type { InstantiatedEntries } from "@babylonjs/core/assetContainer";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import "@babylonjs/core/Meshes/instancedMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import "@babylonjs/core/Rendering/outlineRenderer";
import type { Scene } from "@babylonjs/core/scene";
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
): Promise<GlbVisual> {
  const model = residentGlb(species, season);
  if (!model) throw Error("알 수 없는 주민 종입니다.");
  const loadSeason = async (
    variant: "crowdUrl" | "url",
    active: () => boolean,
  ) => {
    try {
      return await load(scene, model[variant]);
    } catch (error) {
      if (season !== "winter" || !active()) throw error;
      const fallback = residentGlb(species, "summer");
      if (!fallback) throw error;
      return load(scene, fallback[variant]);
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
  const crowd = source.createInstance(`${parent.name}:crowd`);
  crowd.parent = node;
  // Include the GLTF loader's handedness root and any authored node transform.
  const orientation = new Quaternion();
  crowd.rotationQuaternion = orientation;
  source
    .computeWorldMatrix(true)
    .decompose(crowd.scaling, crowd.rotationQuaternion, crowd.position);
  crowd.isPickable = true;
  // Anchor the contact shadow to the ground, not the animated body pivot.
  const blob = shadow(parent, 1.3 * model.scale, 2 * model.scale);
  if (blob) {
    blob.isPickable = false;
    blob.position.y += offsetY;
  }
  let proxy: Mesh | null = null,
    detail: InstantiatedEntries | null = null;
  let generation = 0,
    selected = false,
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
      crowd.setEnabled(!value);
      if (!value) return;
      // A private rigid copy provides immediate feedback, including on load failure.
      proxy = source.clone(`${parent.name}:selected`, node, true);
      proxy.position.copyFrom(crowd.position);
      proxy.scaling.copyFrom(crowd.scaling);
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
      detail?.dispose();
      blob?.dispose();
      node.dispose();
    },
  };
}
