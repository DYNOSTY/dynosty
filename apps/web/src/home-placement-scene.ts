import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import {
  BUILDING_RULES,
  type BuildingKind,
  buildingIssue,
  constructionPlot,
  HOME_PLACEMENT_RULES,
  type HomePlacement,
  homePlacementIssue,
  requireValue,
  rotatedPoint,
  type TimberState,
} from "@dynosty/game-core";
import { facilityModel } from "./facility-model.js";
import { buildModel, type ModelVisual } from "./model-assets.js";
import type { GlbVisual } from "./village.js";

export function createHomePlacementVisual(
  scene: Scene,
  canvas: HTMLCanvasElement,
  ground: Mesh,
  state: () => TimberState | null,
  elevation: (x: number, z: number) => number,
  nestModel?: (
    kind: "building",
    parent: TransformNode,
    offset: number,
  ) => Promise<GlbVisual>,
) {
  const root = CreateBox("home-placement-preview", { size: 1.5 }, scene);
  const material = new StandardMaterial("home-placement-material", scene);
  material.specularColor = Color3.Black();
  root.isPickable = false;
  root.isVisible = false;
  root.material = material;
  const footprint = CreateGround(
    "home-placement-footprint",
    {
      width: 1,
      height: 1,
      subdivisions: 4,
      updatable: true,
    },
    scene,
  );
  const plane = requireValue(
    footprint.getVerticesData(VertexBuffer.PositionKind),
    "건설 부지 꼭짓점",
  );
  const corners = plane.slice();
  footprint.setEnabled(false);
  footprint.material = material;
  footprint.isPickable = false;
  material.alpha = 0.6;
  material.disableLighting = true;
  root.setEnabled(false);
  let visual: ModelVisual | null = null,
    active = false,
    pending = false,
    position: HomePlacement["position"] | null = null,
    heading = Math.PI;
  const nest = new TransformNode("placement-round-nest", scene);
  nest.parent = root;
  nest.setEnabled(false);
  let round: GlbVisual | null = null;
  function syncNest() {
    const show = !!round && active && (!kind || kind === "home");
    nest.setEnabled(show);
    for (const mesh of visual?.meshes ?? []) mesh.setEnabled(!show);
  }
  void nestModel?.("building", nest, -0.75)
    .then((model) => {
      if (nest.isDisposed()) {
        model.dispose();
        return;
      }
      round = model;
      for (const mesh of nest.getChildMeshes()) mesh.isPickable = false;
      syncNest();
    })
    .catch(() => {});
  let kind: BuildingKind | null = null;
  const issueFor = (s: TimberState, p: HomePlacement) =>
    kind ? buildingIssue(s, kind, p) : homePlacementIssue(s, p);
  let confirm: ((pose: HomePlacement) => void) | null = null,
    feedback: ((message: string, active: boolean) => void) | null = null;
  function update() {
    if (!active || !position) {
      root.setEnabled(false);
      footprint.setEnabled(false);
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
    material.emissiveColor = color;
    const width = kind ? 4.5 : 2 * (HOME_PLACEMENT_RULES.halfWidth + 0.2);
    const depth = kind ? 4.5 : 2 * (HOME_PLACEMENT_RULES.halfDepth + 0.2);
    for (let i = 0; i < plane.length; i += 3) {
      const dx = corners[i],
        dz = corners[i + 2];
      if (dx === undefined || dz === undefined)
        throw Error("건설 부지 좌표가 불완전합니다.");
      const { x, z } = rotatedPoint(
        { position, headingRadians: heading },
        dx * width,
        dz * depth,
      );
      plane[i] = x;
      plane[i + 1] = elevation(x, z) + 0.16;
      plane[i + 2] = z;
    }
    footprint.updateVerticesData(VertexBuffer.PositionKind, plane, true);
    footprint.setEnabled(true);
    for (const m of visual?.meshes ?? []) {
      m.outlineColor = color;
      m.renderOutline = true;
    }
    feedback?.(
      `${BUILDING_RULES[kind ?? "home"].name} · ${pending ? "건설 명령 확인 중" : (issue ?? "배치 가능")} · 방향 ${Math.round((heading * 180) / Math.PI)}°`,
      true,
    );
  }
  let cursor: { x: number; y: number } | null = null;
  function pointer(x: number, y: number) {
    if (!active || pending) return;
    cursor = { x, y };
    const picked = scene.pick(x, y, (m) => m === ground)?.pickedPoint;
    position = picked ? constructionPlot(picked) : null;
    update();
  }
  function cancel() {
    if (!active) return;
    active = false;
    cursor = null;
    pending = false;
    position = null;
    root.setEnabled(false);
    footprint.setEnabled(false);
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
    begin(
      onConfirm: (p: HomePlacement) => void,
      onFeedback: (message: string, active: boolean) => void,
      buildingKind?: BuildingKind,
      site?: HomePlacement["position"],
    ) {
      kind = buildingKind ?? null;
      canvas.focus({ preventScroll: true });
      visual?.dispose();
      visual = buildModel(scene, root, material, facilityModel(kind ?? "home"));
      for (const m of visual.meshes) {
        m.isPickable = false;
        if (m.material) m.material.alpha = 0.65;
      }
      active = true;
      syncNest();
      pending = false;
      cursor = null;
      position = site ? constructionPlot(site) : null;
      heading = Math.PI;
      confirm = onConfirm;
      feedback = onFeedback;
      update();
      if (!site) {
        feedback(
          "지도 위로 커서를 옮겨 주세요. ←→ 회전 · 클릭 배치 · Esc 취소",
          true,
        );
      }
    },
    pointer,
    refresh: update,
    cameraMoved() {
      if (cursor) pointer(cursor.x, cursor.y);
    },
    leave() {
      if (active && !pending) {
        cursor = null;
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
      round?.dispose();
      nest.dispose();
      footprint.dispose();
      root.dispose();
      material.dispose();
    },
  };
}
