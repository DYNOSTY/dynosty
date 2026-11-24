import { expect, it, vi } from "vitest";
import { requireValue } from "./require-value.js";
import { encounterReady } from "./scout-sites.js";
import {
  advanceTimber,
  commandTimber,
  createTimberSave,
  createVillageGame,
  parseTimberSave,
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
    const find = requireValue(
      requireValue(sent.scoutFinds, "sent.scoutFinds").reed,
      "sent.scoutFinds.reed",
    );
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

it("정찰 조우 결과는 저장된 마을 난수로 정해 같은 저장에서 다시 보내도 같다", () => {
  const initial = parseTimberSave(createTimberSave(createVillageGame())).state;
  const send = (s: typeof initial) =>
    commandTimber(
      s,
      { type: "scout-sites", ids: ["reed"], explore: true },
      "send-reed",
    );
  const random = vi.spyOn(Math, "random").mockImplementation(() => {
    throw Error("정찰 조우에 Math.random을 쓰면 안 됩니다.");
  });
  try {
    const first = send(initial);
    const again = send(parseTimberSave(createTimberSave(initial)).state);
    expect(first.scoutFinds?.reed?.kind).toBe(again.scoutFinds?.reed?.kind);
    expect(first.town.development.seed).not.toBe(initial.town.development.seed);
    const kinds = new Set(
      Array.from({ length: 40 }, (_, i) => {
        const seeded = {
          ...initial,
          town: {
            ...initial.town,
            development: { ...initial.town.development, seed: i * 99991 },
          },
        };
        return send(seeded).scoutFinds?.reed?.kind;
      }),
    );
    expect(kinds.size).toBeGreaterThan(1);
  } finally {
    random.mockRestore();
  }
});
