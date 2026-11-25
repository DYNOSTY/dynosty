import {
  advanceTimber,
  createVillageGame,
  parseTimberSave,
} from "@dynosty/game-core";
import { expect, it } from "vitest";
import {
  encodeVillageSnapshot,
  readWorkerSnapshot,
} from "./timber-protocol.js";

it("publishes the current HUD and the existing resume format from the same snapshot", () => {
  for (const state of [
    createVillageGame(true),
    advanceTimber(createVillageGame(false), 60),
  ]) {
    const raw = encodeVillageSnapshot(state);
    expect(raw).toBe(
      JSON.stringify({ format: "dynosty-timber", saveVersion: 1, state }),
    );
    expect(readWorkerSnapshot(raw)).toEqual(state);
    expect(parseTimberSave(JSON.parse(raw)).state.elapsed).toBe(state.elapsed);
  }
});
