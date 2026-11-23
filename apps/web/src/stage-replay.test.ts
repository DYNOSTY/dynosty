import { createTimberSave } from "@dynosty/game-core";
import { expect, it } from "vitest";
import { standardMissionStart } from "./stage-replay.js";

it.each(["opening", "roads", "capital", "arrival", "summit"])(
  "시작 기록이 없는 미션은 기본 장면 %s에서 시작한다",
  (beat) => {
    const stage =
      ["opening", "roads", "capital", "arrival", "summit"].indexOf(beat) + 1;
    const { state } = createTimberSave(standardMissionStart(stage));
    expect(state.chapter ?? 1).toBe(stage);
    expect(state.campaign?.beat).toBe(beat);
    expect(state.campaign?.ending).toBeNull();
  },
);
