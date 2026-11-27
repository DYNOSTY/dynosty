import { BUILDING_RULES, type BuildingKind } from "@dynosty/game-core";
import type { ModelAsset, ModelPart } from "./model-assets.js";

// Architecture follows public/art/facilities; all tiers keep the reserved footprint and doorway.
export function facilityModel(
  kind: BuildingKind,
  level: 1 | 2 | 3 = 1,
): ModelAsset {
  const parts: ModelPart[] = [];
  const wood: [number, number, number] = [0.43, 0.28, 0.15],
    stone: [number, number, number] = [0.48, 0.47, 0.42],
    straw: [number, number, number] = [0.71, 0.57, 0.32],
    tile: [number, number, number] = [0.24, 0.29, 0.3];
  const add = (
    name: string,
    shape: ModelPart["shape"],
    size: ModelPart["size"],
    position: ModelPart["position"],
    color = wood,
    rotation: ModelPart["rotation"] = [0, 0, 0],
  ) => parts.push({ name, shape, size, position, color, rotation });
  const box = (
    name: string,
    size: ModelPart["size"],
    position: ModelPart["position"],
    color = wood,
    rotation: ModelPart["rotation"] = [0, 0, 0],
  ) => add(name, "box", size, position, color, rotation);
  const sphere = (
    name: string,
    size: ModelPart["size"],
    position: ModelPart["position"],
    color = straw,
  ) => add(name, "sphere", size, position, color);
  const roof = (
    id: string,
    x = 0,
    z = 0,
    width = 3.7,
    depth = 3.7,
    y = 1.35,
  ) => {
    for (const side of [-1, 1]) {
      box(
        `${id}-slope-${side}`,
        [width / 2 + 0.15, 0.16, depth],
        [x + (side * width) / 4, y, z],
        level === 1 ? straw : tile,
        [0, 0, -side * 0.28],
      );
      box(
        `${id}-eave-${side}`,
        [0.22, 0.12, depth + 0.12],
        [x + (side * width) / 2, y - 0.12, z],
        level === 1 ? straw : tile,
        [0, 0, side * 0.15],
      );
    }
    box(`${id}-ridge`, [0.18, 0.16, depth + 0.1], [x, y + 0.3, z], wood);
  };
  box("stone-plinth", [3.6, 0.22, 3.6], [0, -0.64, 0], stone);
  box(
    "wide-tail-clearance-ramp",
    [2.4, 0.13, 1.25],
    [0, -0.48, 2.1],
    wood,
    [0.13, 0, 0],
  );
  if (kind === "home") {
    sphere(
      "oval-nest-roof",
      [4, 0.9, 3.8],
      [0, 1.15, -0.05],
      level === 1 ? straw : tile,
    );
    for (const x of [-1.45, 1.45]) {
      box(
        `arched-side-${x}`,
        [0.24, 1.45, 2.9],
        [x, 0.03, -0.2],
        [0.68, 0.59, 0.43],
      );
      box(
        `paper-window-${x}`,
        [0.03, 0.65, 0.85],
        [x * 1.1, 0.3, -0.35],
        [0.88, 0.79, 0.56],
      );
      box(
        `window-lattice-${x}`,
        [0.05, 0.7, 0.06],
        [x * 1.11, 0.3, -0.35],
        wood,
      );
      box(
        `window-crossbar-${x}`,
        [0.05, 0.06, 0.9],
        [x * 1.11, 0.3, -0.35],
        wood,
      );
    }
    box(
      "rear-insulation",
      [2.8, 1.2, 0.18],
      [0, -0.05, -1.45],
      [0.68, 0.59, 0.43],
    );
    for (let i = 0; i < 5; i++) {
      const angle = ((i + 0.5) * Math.PI) / 5;
      box(
        `frill-arch-beam-${i}`,
        [0.75, 0.14, 0.2],
        [Math.cos(angle) * 1.45, 0.65 + Math.sin(angle) * 0.7, 1.4],
        wood,
        [0, 0, angle + Math.PI / 2],
      );
    }
    for (let i = 0; i < level + 1; i++) {
      const x = i % 2 ? 0.75 : -0.75,
        z = -0.8 + Math.floor(i / 2) * 1.2;
      sphere(`straw-sleep-hollow-${i}`, [1.15, 0.23, 0.95], [x, -0.35, z]);
      sphere(
        `sleep-recess-${i}`,
        [0.78, 0.12, 0.66],
        [x, -0.24, z],
        [0.46, 0.34, 0.19],
      );
    }
    box("ondol-flue", [0.3, 1.8, 0.3], [1.45, 0.15, -1.35], stone);
    roof("entrance-pavilion", 0, 0.7, 3.65, 1.8, 1.5);
    if (level === 3)
      for (const x of [-1.1, 1.1])
        roof(`court-wing-${x}`, x, -0.7, 1.5, 2, 1.5);
  } else {
    const tall = kind === "workshop" || kind === "logging" || kind === "scout";
    for (const x of [-1.5, 1.5])
      for (const z of [-1.5, 1.5])
        box(
          `post-${x}-${z}`,
          [0.18, tall ? 2.3 : 1.8, 0.18],
          [x, tall ? 0.45 : 0.2, z],
        );
    roof("main", 0, 0, 3.8, 3.8, tall ? 1.75 : 1.35);
    if (level >= 2) roof("front-wing", 0, 1.1, 3.5, 1.3, tall ? 1.35 : 1.1);
    if (level === 3) roof("high-bay", 0, -0.35, 2.2, 2.8, tall ? 2.2 : 1.85);
    if (!["fishery", "ranch", "scout"].includes(kind))
      box("back-wall", [3, 1.2, 0.14], [0, -0.05, -1.5], [0.68, 0.59, 0.43]);
    if (kind === "restaurant") {
      for (let i = 0; i < level + 1; i++)
        box(
          `low-dining-trough-${i}`,
          [2.3, 0.22, 0.42],
          [0, -0.15, -0.9 + i * 0.7],
          wood,
        );
      for (const [i, color] of [
        [0, [0.32, 0.52, 0.2]],
        [1, [0.59, 0.29, 0.23]],
        [2, [0.35, 0.56, 0.65]],
      ] as const)
        sphere(
          `diet-serving-bowl-${i}`,
          [0.65, 0.28, 0.65],
          [-0.95 + i * 0.95, 0, 1.4],
          [...color],
        );
      add(
        "large-cauldron",
        "cylinder",
        [0.72, 0.6, 0.82],
        [1.25, -0.1, -1],
        [0.18, 0.2, 0.2],
      );
    } else if (kind === "hospital") {
      for (let i = 0; i < level + 1; i++) {
        const x = i % 2 ? 0.8 : -0.8,
          z = -0.75 + Math.floor(i / 2) * 1.5;
        sphere(`recovery-nest-${i}`, [1.1, 0.2, 1.2], [x, -0.35, z]);
        box(
          `ward-blanket-${i}`,
          [0.85, 0.13, 0.85],
          [x, -0.2, z],
          [0.49, 0.61, 0.43],
        );
      }
      box(
        "herbal-ward-banner",
        [0.65, 0.75, 0.06],
        [0, 0.65, 1.6],
        [0.32, 0.5, 0.35],
      );
    } else if (kind === "workshop") {
      box("research-table", [2.4, 0.25, 1.25], [0, 0.05, 0], wood);
      box("large-scroll", [1.5, 0.05, 0.9], [0, 0.2, 0], [0.89, 0.84, 0.68]);
      for (const x of [-1.05, 1.05])
        add(
          `scroll-roller-${x}`,
          "cylinder",
          [0.2, 0.95, 0.2],
          [x, 0.3, 0],
          wood,
          [Math.PI / 2, 0, 0],
        );
      add(
        "observation-sight",
        "cylinder",
        [0.18, 1.35, 0.18],
        [1.25, 1.9, -1.2],
        [0.68, 0.49, 0.22],
        [0, 0, 1],
      );
    } else if (kind === "waterworks") {
      box("intake-trough", [2.8, 0.3, 0.7], [0, -0.3, 1.65], stone);
      box(
        "basin-water",
        [2.5, 0.08, 0.5],
        [0, -0.12, 1.65],
        [0.22, 0.47, 0.53],
      );
      box(
        "lifting-beam",
        [1.8, 0.13, 0.17],
        [-0.65, 0.85, 1.4],
        wood,
        [0, 0, 0.28],
      );
      if (level >= 2)
        for (let i = 0; i < 8; i++)
          box(`wheel-spoke-${i}`, [1.7, 0.13, 0.2], [1.65, 0.15, 1.65], wood, [
            0,
            0,
            (i * Math.PI) / 8,
          ]);
      if (level === 3) {
        box("raised-cistern", [1.55, 1.8, 1.2], [-1, 0.4, 0.5], stone);
        box("covered-aqueduct", [0.42, 0.3, 2.7], [-1, 1, 1.25], wood);
      }
    } else if (kind === "fishery") {
      box("shore-pier", [3.6, 0.14, 0.8], [0, -0.5, 1.8], wood);
      for (let i = 0; i < level + 1; i++) {
        box(
          `fish-bin-${i}`,
          [0.6, 0.35, 0.55],
          [-1.05 + i * 0.65, -0.28, 0.8],
          wood,
        );
        sphere(
          `silver-catch-${i}`,
          [0.42, 0.15, 0.2],
          [-1.05 + i * 0.65, -0.06, 0.8],
          [0.52, 0.68, 0.71],
        );
        box(
          `net-pole-${i}`,
          [0.1, 1.4, 0.1],
          [-1.4 + i * 0.8, 0.05, -1.2],
          wood,
        );
      }
      add("net-winch", "cylinder", [0.65, 1.0, 0.65], [1.25, 0.2, 0], wood, [
        0,
        0,
        Math.PI / 2,
      ]);
    } else if (kind === "farm") {
      for (let i = 0; i < 6; i++) {
        box(
          `raised-soil-${i}`,
          [0.8, 0.18, 0.65],
          [((i % 3) - 1) * 1, -0.35, Math.floor(i / 3) * 1.1 - 0.55],
          [0.34, 0.26, 0.16],
        );
        sphere(
          `sprout-${i}`,
          [0.48, 0.5, 0.45],
          [((i % 3) - 1) * 1, 0, Math.floor(i / 3) * 1.1 - 0.55],
          [0.32, 0.53, 0.22],
        );
      }
      box(
        "warm-transparent-cover",
        [3.2, 0.1, 2.9],
        [0, 0.85, 0],
        [0.58, 0.72, 0.66],
        [0.15, 0, 0],
      );
    } else if (kind === "ranch") {
      for (const x of [-1.6, 1.6])
        box(`broad-fence-${x}`, [0.12, 0.65, 3.1], [x, -0.15, 0], wood);
      for (let i = 0; i < level + 1; i++) {
        const x = i % 2 ? 0.7 : -0.7,
          z = -0.65 + Math.floor(i / 2);
        sphere(
          `livestock-${i}`,
          [0.65, 0.4, 0.8],
          [x, -0.2, z],
          [0.74, 0.69, 0.52],
        );
        sphere(
          `livestock-head-${i}`,
          [0.3, 0.25, 0.4],
          [x, -0.05, z + 0.4],
          [0.55, 0.5, 0.34],
        );
      }
    } else if (kind === "logging" || kind === "storage") {
      for (let i = 0; i < level + 2; i++)
        add(
          `log-rack-${i}`,
          "cylinder",
          [0.32, 2.2, 0.32],
          [-1.15 + (i % 2) * 0.4, -0.25 + Math.floor(i / 2) * 0.32, -0.2],
          wood,
          [Math.PI / 2, 0, 0],
        );
      if (kind === "logging") {
        box("saw-frame", [0.14, 1.5, 1.7], [0.7, 0.1, 0], wood);
        box("saw-blade", [0.06, 0.15, 1.5], [0.7, 0.4, 0], [0.62, 0.64, 0.62]);
      } else
        for (let i = 0; i < level + 1; i++)
          box(
            `resource-bin-${i}`,
            [0.65, 0.65, 0.75],
            [0.25 + (i % 2) * 0.8, -0.2, -0.7 + Math.floor(i / 2) * 1.1],
            straw,
          );
    } else if (["coal", "iron", "quarry"].includes(kind)) {
      const ore: [number, number, number] =
        kind === "coal"
          ? [0.13, 0.16, 0.17]
          : kind === "iron"
            ? [0.51, 0.32, 0.21]
            : [0.58, 0.58, 0.52];
      for (let i = 0; i < level + 2; i++)
        sphere(
          `raw-ore-${i}`,
          [0.7, 0.55, 0.65],
          [((i % 3) - 1) * 0.8, -0.25, Math.floor(i / 3) * 0.8 - 0.3],
          ore,
        );
      for (const x of [-1.1, 1.1])
        box(`extraction-frame-${x}`, [0.2, 1.7, 0.2], [x, 0.25, 0.8], wood);
      box("heavy-lift-beam", [2.7, 0.22, 0.22], [0, 1.15, 0.8], wood);
      if (kind === "quarry")
        box("cut-stone-block", [1.1, 0.55, 0.7], [0, -0.22, 1.3], stone);
    } else if (kind === "scout") {
      box("lookout-deck", [3.1, 0.2, 2.8], [0, 0.45, 0], wood);
      box("route-map", [1.2, 0.06, 0.8], [0, 0.7, 0], [0.86, 0.8, 0.61]);
      box(
        "lookout-flag",
        [0.8, 0.55, 0.08],
        [1.25, 1.7, 0],
        [0.42, 0.53, 0.35],
      );
    } else if (kind === "trade") {
      for (let i = 0; i < level + 1; i++)
        box(
          `barter-crate-${i}`,
          [0.7, 0.65, 0.7],
          [i % 2 ? 0.9 : -0.9, -0.2, -0.8 + Math.floor(i / 2) * 1.3],
          straw,
        );
      box("trade-counter", [2.7, 0.25, 0.65], [0, 0, 1.1], wood);
      box("cloth-banner", [1.4, 0.6, 0.06], [0, 0.9, 1.6], [0.37, 0.53, 0.49]);
    }
  }
  return {
    format: "dynosty-model",
    version: 1,
    id: `facility-${kind}-${level}`,
    kind: "building",
    name: BUILDING_RULES[kind].name,
    units: "meter",
    origin: "자체 제작 · 공룡 마을 단계별 설계 삽화 기반",
    parts,
  };
}
