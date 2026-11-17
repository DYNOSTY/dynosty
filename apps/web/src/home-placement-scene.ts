import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import {
  type BuildingKind,
  buildingIssue,
  HOME_PLACEMENT_RULES,
  type HomePlacement,
  homePlacementIssue,
  type TimberState,
} from "@dynosty/game-core";
import { facilityModel } from "./facility-model.js";
import {
  buildModel,
  type ModelAsset,
  type ModelVisual,
} from "./model-assets.js";

export function createHomePlacementVisual(
  scene: Scene,
  canvas: HTMLCanvasElement,
  ground: Mesh,
  state: () => TimberState | null,
  elevation: (x: number, z: number) => number,
) {
  const root = CreateBox("home-placement-preview", { size: 1.5 }, scene);
  const material = new StandardMaterial("home-placement-material", scene);
  material.specularColor = Color3.Black();
  root.isPickable = false;
  root.isVisible = false;
  root.material = material;
  const footprint = CreateBox(
    "home-placement-footprint",
    { width: 3.3, height: 0.03, depth: 3 },
    scene,
  );
  footprint.parent = root;
  footprint.position.y = -0.7;
  footprint.material = material;
  footprint.isPickable = false;
  material.alpha = 0.35;
  root.setEnabled(false);
  let visual: ModelVisual | null = null,
    active = false,
    pending = false,
    position: HomePlacement["position"] | null = null,
    heading = Math.PI;
  let kind: BuildingKind | null = null,
    homeAsset: ModelAsset | null = null;
  const issueFor = (s: TimberState, p: HomePlacement) =>
    kind ? buildingIssue(s, kind, p) : homePlacementIssue(s, p);
  let confirm: ((pose: HomePlacement) => void) | null = null,
    feedback: ((message: string, active: boolean) => void) | null = null;
  function update() {
    if (!active || !position) {
      root.setEnabled(false);
      return;
    }
    const s = state();
    if (!s) return;
    const issue = issueFor(s, { position, headingRadians: heading });
    const color = issue
      ? new Color3(0.95, 0.2, 0.15)
      : new Color3(0.35, 0.9, 0.45);
    root.setEnabled(true);
    root.position.set(
      position.x,
      elevation(position.x, position.z) + 0.75,
      position.z,
    );
    root.rotation.y = heading;
    material.diffuseColor = color;
    for (const m of visual?.meshes ?? []) {
      m.outlineColor = color;
      m.renderOutline = true;
    }
    feedback?.(
      `${pending ? "건설 명령 확인 중" : (issue ?? "배치 가능")} · 방향 ${Math.round((heading * 180) / Math.PI)}°`,
      true,
    );
  }
  function pointer(x: number, y: number) {
    if (!active || pending) return;
    const rect = canvas.getBoundingClientRect();
    const picked = scene.pick(
      (x * canvas.width) / rect.width,
      (y * canvas.height) / rect.height,
      (m) => m === ground,
    )?.pickedPoint;
    position = picked
      ? { x: Math.round(picked.x * 4) / 4, z: Math.round(picked.z * 4) / 4 }
      : null;
    update();
  }
  function cancel() {
    active = false;
    pending = false;
    position = null;
    root.setEnabled(false);
    feedback?.("건물 배치를 취소했습니다.", false);
  }
  const key = (event: KeyboardEvent) => {
    if (
      !active ||
      pending ||
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLTextAreaElement
    )
      return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      heading =
        (heading +
          (event.key === "ArrowLeft" ? -1 : 1) *
            HOME_PLACEMENT_RULES.rotationStep +
          Math.PI * 2) %
        (Math.PI * 2);
      heading =
        Math.round(heading / HOME_PLACEMENT_RULES.rotationStep) *
        HOME_PLACEMENT_RULES.rotationStep;
      if (heading >= Math.PI * 2) heading = 0;
      update();
    }
  };
  window.addEventListener("keydown", key, true);
  return {
    get active() {
      return active;
    },
    setModel(asset: ModelAsset) {
      homeAsset = asset;
      visual?.dispose();
      visual = buildModel(scene, root, material, asset);
      for (const m of visual.meshes) {
        m.isPickable = false;
        if (m.material) m.material.alpha = 0.65;
      }
    },
    begin(
      onConfirm: (p: HomePlacement) => void,
      onFeedback: (message: string, active: boolean) => void,
      buildingKind?: BuildingKind,
    ) {
      kind = buildingKind ?? null;
      if (homeAsset) {
        visual?.dispose();
        visual = buildModel(
          scene,
          root,
          material,
          kind && kind !== "home" ? facilityModel(kind) : homeAsset,
        );
        for (const m of visual.meshes) {
          m.isPickable = false;
          if (m.material) m.material.alpha = 0.65;
        }
      }
      if (!visual) {
        onFeedback(
          "둥지 모델을 준비하고 있습니다. 잠시 후 다시 선택해 주세요.",
          false,
        );
        return;
      }
      active = true;
      pending = false;
      position = null;
      heading = Math.PI;
      confirm = onConfirm;
      feedback = onFeedback;
      feedback(
        visual
          ? "지도 위로 커서를 옮겨 주세요. ←→ 회전 · 클릭 배치 · Esc 취소"
          : "건물 모델을 불러오는 중입니다.",
        true,
      );
    },
    pointer,
    refresh: update,
    leave() {
      if (active && !pending) {
        position = null;
        update();
      }
    },
    commit(x: number, y: number) {
      if (!active || pending || !visual) return;
      pointer(x, y);
      const s = state();
      if (!s || !position) return;
      if (issueFor(s, { position, headingRadians: heading })) {
        update();
        return;
      }
      pending = true;
      update();
      confirm?.({ position: { ...position }, headingRadians: heading });
    },
    cancel,
    dispose() {
      window.removeEventListener("keydown", key, true);
      visual?.dispose();
      root.dispose();
      material.dispose();
    },
  };
}
