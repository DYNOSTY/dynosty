import { LOGGING_RULES } from "@dynosty/game-core";

export const forestCounts = (remaining: number) => {
  const standing = Math.max(
    0,
    Math.min(
      LOGGING_RULES.treesPerForest,
      Math.ceil(
        (remaining * LOGGING_RULES.treesPerForest) / LOGGING_RULES.forest,
      ),
    ),
  );
  return { standing, stumps: LOGGING_RULES.treesPerForest - standing };
};
export const forestIsFar = (x: number, z: number) => Math.hypot(x, z) > 40;
export const forestDecorations = () =>
  [
    { kind: "TREE_FIR_YOUNG", x: -6, z: -8 },
    { kind: "TREE_SHRUB", x: 6, z: 8 },
    { kind: "TREE_PINE_FALLEN", x: -6, z: 8 },
    { kind: "TREE_SNAG", x: 6, z: -8 },
    { kind: "TREE_SNAG_B", x: 0, z: 8 },
  ] as const;
