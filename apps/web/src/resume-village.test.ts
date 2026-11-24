import {
  createTimberSave,
  createVillageGame,
  type TimberState,
} from "@dynosty/game-core";
import { expect, it } from "vitest";
import { resumeVillage } from "./resume-village.js";

it("불러온 마을 저장은 저장 당시 진행 여부와 관계없이 일시정지로 시작한다", () => {
  const running: TimberState = { ...createVillageGame(), paused: false };
  const save = JSON.parse(JSON.stringify(createTimberSave(running)));
  expect(save.state.paused).toBe(false);
  const resumed = resumeVillage(save);
  expect(resumed.paused).toBe(true);
  expect(resumed.remainder).toBe(0);
  expect(resumed.elapsed).toBe(running.elapsed);
});
