import { expect, it } from "vitest";
import { loggingWorkplace } from "./logging.js";
import { createVillageGame, timberScene } from "./timber.js";
import type { Facility } from "./town.js";

it("주민 일터에 맞는 지게와 퇴근 짐을 표시한다", () => {
  const base = createVillageGame();
  const facilities: Facility[] = (
    ["farm", "fishery", "restaurant"] as const
  ).map((kind) => ({
    id: kind,
    kind,
    position: { x: 10, z: 10 },
    headingRadians: 0,
    sourceId: null,
    level: 1,
    target: 1,
    progress: 0,
    yieldRemainder: 0,
    buffer: 0,
    delivered: 0,
    haul: null,
  }));
  const residents = base.residents.map((r, i) => ({
    ...r,
    workplaceId:
      [
        "logging",
        "facility:farm",
        "facility:fishery",
        "facility:restaurant",
        "logging:coal-west",
      ][i] ?? null,
    routine: "to-work" as const,
    insideHome: false,
    position: { x: 0, z: 0 },
  }));
  const state = { ...base, residents, town: { ...base.town, facilities } };
  const jiges = () =>
    timberScene(state)
      .entities.filter((e) => e.kind === "resident")
      .slice(0, 5)
      .map((e) => e.jige);
  expect(jiges()).toEqual([
    { kind: "wood", loaded: false },
    { kind: "plant", loaded: false },
    { kind: "fish", loaded: false },
    undefined,
    undefined,
  ]);
  const worker = residents[0];
  if (!worker) throw Error("주민 없음");
  const returning = {
    ...state,
    world: { ...state.world, minute: 18 * 60 },
    residents: residents.map((r) =>
      r.id === worker.id ? { ...r, routine: "home" as const } : r,
    ),
  };
  const sceneWorker = () =>
    timberScene(returning).entities.find((e) => e.id === worker.id);
  expect(sceneWorker()).toMatchObject({
    motion: "walking",
    jige: { kind: "wood", loaded: true },
  });
  const atWork = {
    ...returning,
    residents: returning.residents.map((r) =>
      r.id === worker.id
        ? { ...r, position: loggingWorkplace(returning, worker.id) }
        : r,
    ),
  };
  expect(
    timberScene(atWork).entities.find((e) => e.id === worker.id),
  ).toMatchObject({ jige: { loaded: false } });
});
