import type { TimberState } from "@dynosty/game-core";

export function goriFace(state: TimberState | null): string {
  const ending = state?.campaign?.ending;
  const worried =
    state &&
    (state.world.pessimism >= 50 ||
      state.world.citizens.some((citizen) => !citizen.alive));
  const face = ending === "collapse" ? 4 : ending ? 6 : worried ? 3 : 1;
  return `/ui/gori/face${face}.webp`;
}
