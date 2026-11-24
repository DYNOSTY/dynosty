import { expect, it } from "vitest";
import legacySave from "./fixtures/timber-v18-stage1-save.json" with {
  type: "json",
};
import {
  commandTimber,
  createTimberSave,
  createVillageGame,
  parseTimberSave,
  TIMBER_RULES,
} from "./timber.js";

// The fixture was written by the pinned base 1d1c6ed's createTimberSave
// (stage-1 campaign, restaurant built and staffed, before the guided mission,
// bulletins, scout encounters, price versions, child labor or demolition).
it("v18 저장을 새 저장 버전으로 올리고 새 필드는 이전 의미의 기본값으로 읽는다", () => {
  expect(legacySave.state.version).toBe(18);
  expect(TIMBER_RULES.version).toBeGreaterThan(18);
  expect(createTimberSave(createVillageGame()).state.version).toBe(
    TIMBER_RULES.version,
  );
  const loaded = parseTimberSave(legacySave).state;
  expect(loaded.version).toBe(TIMBER_RULES.version);
  expect(loaded.bulletins).toBeUndefined();
  expect(loaded.scoutClues).toBeUndefined();
  expect(loaded.scoutFinds).toBeUndefined();
  expect(loaded.childLabor).toBeUndefined();
  expect(loaded.removedLandmarks).toBeUndefined();
  expect(loaded.homes.every((h) => h.priceVersion === undefined)).toBe(true);
  // An old save that already ran has issued its first ration order.
  expect(loaded.firstRationSet).toBe(true);
  expect(loaded.firstMissionDone).toBe(true);
  expect(loaded.rationPolicy).toBe(legacySave.state.rationPolicy);
  const again = parseTimberSave(createTimberSave(loaded)).state;
  expect(again).toEqual(loaded);
  // The migrated save keeps playing through the public command path.
  const next = commandTimber(
    loaded,
    { type: "scout-sites", ids: ["reed"], explore: true },
    "legacy-scout",
  );
  expect(next.scoutFinds?.reed?.decision).toBe("waiting");
  expect(parseTimberSave(createTimberSave(next)).state).toEqual(next);
});

it("새 게임은 첫 미션 안내 완료 표시 없이 시작한다", () => {
  const fresh = createVillageGame(false, true);
  expect(fresh.firstRationSet).toBeFalsy();
  expect(fresh.firstMissionDone).toBeUndefined();
  expect(parseTimberSave(createTimberSave(fresh)).state.firstMissionDone).toBe(
    undefined,
  );
});
