import { expect, it } from "vitest";
import { encounterReady } from "./scout-sites.js";
import {
  advanceTimber,
  commandTimber,
  createVillageGame,
  parseTimberState,
} from "./timber.js";

it.each([true, false])(
  "발견한 주민은 귀환 후 한 번만 합류한다 · 수락 %s",
  (take) => {
    const initial = createVillageGame();
    const sent = commandTimber(
      initial,
      { type: "scout-sites", ids: ["reed"], explore: true },
      "send-reed",
    );
    const find = sent.scoutFinds!.reed!;
    const now = (sent.world.day - 1) * 1440 + sent.world.minute;
    const near = {
      ...sent,
      scoutTripDurations: { reed: 6 },
      scoutFinds: {
        reed: { ...find, kind: "survivors" as const, due: now + 3 },
      },
    };
    const camp = parseTimberState(advanceTimber(near, 5));
    expect(encounterReady(camp, "reed")).toBe(true);
    expect(camp.residents.length).toBe(initial.residents.length);
    const chosen = commandTimber(
      camp,
      { type: "scout-choice", site: "reed", take },
      "reply",
    );
    const travelling = advanceTimber(chosen, 2);
    expect(travelling.residents.length).toBe(initial.residents.length);
    const home = parseTimberState(advanceTimber(travelling, 1));
    expect(home.residents.length).toBe(
      initial.residents.length + (take ? 2 : 0),
    );
    expect(home.scoutFinds?.reed?.decision).toBe("home");
    expect(advanceTimber(home, 5).residents.length).toBe(home.residents.length);
  },
);
