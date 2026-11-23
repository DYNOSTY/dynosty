import {
  type BuildingKind,
  type TimberState,
  upgradeResearch,
} from "@dynosty/game-core";

export function facilityArt(kind: BuildingKind, state: TimberState | null) {
  const completed = state?.town.development.completed;
  const level =
    [3, 2].find((n) => {
      const research = upgradeResearch(kind, n);
      return research && completed?.includes(research);
    }) ?? 1;
  return `/art/facilities/${kind}-${level}.webp`;
}
