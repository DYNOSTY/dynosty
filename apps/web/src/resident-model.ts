import type { ModelAsset, ModelPart } from "./model-assets.js";
export function residentModel(species: string): ModelAsset {
  const trice = species === "R02",
    spino = species === "SPINO";
  const parts: ModelPart[] = [];
  const skin: [number, number, number] = trice
    ? [0.53, 0.48, 0.36]
    : spino
      ? [0.46, 0.51, 0.43]
      : [0.59, 0.48, 0.34];
  const add = (
    name: string,
    shape: ModelPart["shape"],
    size: ModelPart["size"],
    position: ModelPart["position"],
    color = skin,
    rotation: ModelPart["rotation"] = [0, 0, 0],
    role?: ModelPart["role"],
    phase = 0,
  ) =>
    parts.push({
      name,
      shape,
      size: [size[0] * 1.5, size[1] * 1.5, size[2] * 1.5],
      position: [
        position[0] * 1.5,
        (position[1] + 0.5) * 1.5 - 0.5,
        position[2] * 1.5,
      ],
      color,
      rotation,
      ...(role ? { role, phase } : {}),
    });
  add(
    "body",
    "sphere",
    trice ? [1.0, 0.72, 1.45] : [0.55, 0.7, 1.1],
    [0, 0.05, -0.12],
    skin,
    [0, 0, 0],
    "body",
  );
  add(
    "indigo-work-cloth",
    "sphere",
    trice ? [1.03, 0.75, 1.0] : [0.58, 0.73, 0.72],
    [0, 0.05, -0.15],
    [0.23, 0.29, 0.35],
    [0, 0, 0],
    "body",
  );
  add(
    "flax-work-sash",
    "box",
    trice ? [1.05, 0.09, 0.2] : [0.62, 0.08, 0.2],
    [0, -0.05, 0.12],
    [0.71, 0.63, 0.46],
    [0, 0, 0],
    "body",
  );
  add(
    "head",
    "sphere",
    trice ? [0.76, 0.64, 0.76] : spino ? [0.38, 0.4, 0.7] : [0.42, 0.42, 0.55],
    [0, trice ? 0.18 : 0.48, 0.65],
    skin,
    [0, 0, 0],
    "head",
  );
  add(
    "snout",
    "sphere",
    trice ? [0.4, 0.35, 0.46] : spino ? [0.3, 0.22, 0.95] : [0.3, 0.22, 0.5],
    [0, trice ? 0.05 : 0.4, spino ? 1.15 : 0.95],
  );
  for (const x of [-0.29, 0.29])
    for (const front of trice ? [-0.55, 0.4] : [-0.3]) {
      add(
        `leg-${x}-${front}`,
        "cylinder",
        [trice ? 0.24 : 0.2, 0.55, trice ? 0.3 : 0.32],
        [x, -0.28, front],
        skin,
        [0, 0, 0],
        "leg",
        x < 0 ? 0 : Math.PI,
      );
      add(
        `foot-${x}-${front}`,
        "sphere",
        [0.26, 0.15, 0.48],
        [x, -0.5, front + 0.1],
      );
    }
  if (trice) {
    add("frill", "sphere", [1.05, 0.95, 0.18], [0, 0.37, 0.38]);
    for (const x of [-0.22, 0.22])
      add(
        `brow-horn-${x}`,
        "cylinder",
        [0.16, 0.52, 0],
        [x, 0.51, 0.87],
        [0.85, 0.82, 0.68],
        [0.85, 0, 0],
      );
    add(
      "nose-horn",
      "cylinder",
      [0.13, 0.27, 0],
      [0, 0.24, 1.13],
      [0.85, 0.82, 0.68],
      [0.5, 0, 0],
    );
  } else {
    for (const x of [-0.3, 0.3])
      add(
        `forearm-${x}`,
        "cylinder",
        [0.12, 0.42, 0.09],
        [x, 0.1, 0.42],
        skin,
        [0.8, 0, x < 0 ? 0.4 : -0.4],
      );
    if (spino)
      for (let i = 0; i < 5; i++)
        add(
          `back-sail-${i}`,
          "sphere",
          [0.13, 0.45 + Math.sin(((i + 1) / 6) * Math.PI) * 0.65, 0.28],
          [0, 0.65, -0.65 + i * 0.25],
          [0.51, 0.32, 0.22],
        );
    else
      for (const x of [-0.36, 0.36])
        add(
          `feather-wing-${x}`,
          "sphere",
          [0.14, 0.22, 0.72],
          [x, 0.25, 0.15],
          [0.41, 0.33, 0.24],
        );
  }
  add(
    "tail",
    "cylinder",
    [trice ? 0.24 : 0.29, trice ? 0.95 : 1.3, 0.02],
    [0, 0, -1.05],
    skin,
    [-Math.PI / 2, 0, 0],
    "tail",
  );
  for (const x of [trice ? -0.32 : -0.18, trice ? 0.32 : 0.18])
    add(
      `eye-${x}`,
      "sphere",
      [0.09, 0.09, 0.08],
      [x, trice ? 0.35 : 0.58, 0.85],
      [0.06, 0.07, 0.06],
    );
  return {
    format: "dynosty-model",
    version: 1,
    id: `resident-${species}`,
    kind: "resident",
    name: trice ? "트리케라톱스" : spino ? "스피노사우루스" : "벨로키랍토르",
    units: "meter",
    origin: "자체 제작 · 종별 골격과 실루엣 구분",
    parts,
  };
}
