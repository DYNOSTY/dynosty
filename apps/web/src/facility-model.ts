import type { BuildingKind } from "@dynosty/game-core";
import { BUILDING_RULES } from "@dynosty/game-core";
import type { ModelAsset, ModelPart } from "./model-assets.js";

export function facilityModel(kind: BuildingKind): ModelAsset {
  const parts: ModelPart[] = [];
  const box = (
    name: string,
    size: [number, number, number],
    position: [number, number, number],
    color: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
  ) => parts.push({ name, shape: "box", size, position, color, rotation });
  box("foundation", [3.6, 0.2, 3.6], [0, -0.65, 0], [0.45, 0.43, 0.38]);
  for (const x of [-1.5, 1.5])
    for (const z of [-1.5, 1.5])
      box(`post${x}${z}`, [0.16, 1.8, 0.16], [x, 0.25, z], [0.4, 0.26, 0.13]);
  for (const x of [-0.9, 0.9])
    box(
      `tile${x}`,
      [2.2, 0.14, 4],
      [x, 1.35, 0],
      [0.23, 0.28, 0.29],
      [0, 0, x > 0 ? -0.27 : 0.27],
    );
  box("back-wall", [3, 1.25, 0.12], [0, 0.05, -1.5], [0.66, 0.59, 0.43]);
  if (kind === "hospital") {
    box("ward-wall", [3, 1.25, 0.12], [0, 0.05, 1.5], [0.85, 0.8, 0.65]);
    for (const x of [-0.85, 0.85]) {
      box(`bed${x}`, [0.9, 0.2, 1.6], [x, -0.3, 0], [0.92, 0.89, 0.78]);
      box(`pillow${x}`, [0.6, 0.15, 0.3], [x, -0.12, -0.55], [0.95, 0.95, 0.9]);
    }
    box("medical-sign", [0.65, 0.45, 0.08], [0, 0.55, 1.6], [0.35, 0.65, 0.48]);
  } else if (kind === "farm")
    for (const x of [-1, 0, 1])
      for (const z of [-1, 0, 1])
        box(
          `crop${x}${z}`,
          [0.35, 0.3, 0.35],
          [x, -0.35, z],
          [0.3, 0.55, 0.14],
        );
  else if (kind === "ranch") {
    for (const x of [-1.65, 1.65])
      box(`fence${x}`, [0.1, 0.5, 3.2], [x, -0.25, 0], [0.6, 0.4, 0.2]);
    for (const x of [-0.6, 0.6]) {
      box(
        `livestock${x}`,
        [0.65, 0.45, 0.9],
        [x, -0.25, 0.3],
        [0.85, 0.8, 0.65],
      );
      box(
        `animal-head${x}`,
        [0.35, 0.35, 0.4],
        [x, -0.1, 0.85],
        [0.52, 0.4, 0.28],
      );
    }
  } else if (kind === "fishery") {
    box("fish-box", [1, 0.45, 0.7], [0, -0.3, 1], [0.3, 0.55, 0.65]);
    box(
      "fishing-pole",
      [0.05, 2.5, 0.05],
      [1.5, 0.4, 1.5],
      [0.47, 0.29, 0.12],
      [0.6, 0, 0],
    );
  } else
    box(
      "supplies",
      [1.2, 0.6, 0.9],
      [0, -0.25, 0.6],
      kind === "quarry"
        ? [0.55, 0.56, 0.53]
        : kind === "coal"
          ? [0.12, 0.14, 0.16]
          : [0.72, 0.5, 0.25],
    );
  return {
    format: "dynosty-model",
    version: 1,
    id: `facility-${kind}`,
    kind: "building",
    name: BUILDING_RULES[kind].name,
    units: "meter",
    origin: "자체 제작 · 한국식 개발 모델",
    parts,
  };
}
