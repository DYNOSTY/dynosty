import { expect, it } from "vitest";
import { AMOUNT_SCALE } from "./play.js";
import { encounterReady } from "./scout-sites.js";
import { yardStock } from "./storage.js";
import {
  advanceTimber,
  commandTimber,
  createTimberSave,
  createVillageGame,
  gateRaid,
  parseTimberSave,
} from "./timber.js";
import { mealPlan } from "./village-services.js";

it("성문에 배치된 네 명이 보통 습격을 막고 첫 실패는 열 명을 잃는다", () => {
  const base = createVillageGame(false, true);
  const guarded = commandTimber(base, { type: "set-gate", count: 4 }, "post");
  const atNight = (s: typeof base) => ({
    ...s,
    world: { ...s.world, minute: 1260 },
  });
  const safe = gateRaid(atNight(guarded), () => 0);
  expect(safe.raid?.dead).toBe(0);
  const hit = gateRaid(atNight(base), () => 0);
  expect(hit.raid?.dead).toBe(10);
  expect(hit.raidFailures).toBe(1);
  expect(hit.nightFires?.length).toBeGreaterThan(0);
  expect(parseTimberSave(createTimberSave(hit)).state.nightFires).toEqual(
    hit.nightFires,
  );
});
it("제한 배급 한 끼가 허기 한도를 채우고 식량 조각만 있으면 차감하지 않는다", () => {
  const s = createVillageGame(false, true);
  const c = s.world.citizens.find((c) => c.species === "R02");
  if (!c) throw Error("초식 주민 없음");
  expect(mealPlan(c, "cap", 0, s.world.resources)).toMatchObject({
    amount: 25000,
    relief: 7200,
  });
  expect(
    mealPlan(c, "needs", 0, { ...s.world.resources, RES_PLANT: 1 }),
  ).toMatchObject({ amount: 0, foods: {} });
});
it("출문 뒤 복홀에 물 200이 남으며 창고가 없으면 모두 야적한다", () => {
  const s = createVillageGame(false, true);
  expect(s.world.resources.RES_WATER).toBe(200 * AMOUNT_SCALE);
  expect(yardStock(s, "RES_WATER")).toBe(200);
});
it("정찰 선택 중에는 시간을 대량 진행해도 시계가 멈춘다", () => {
  const base = createVillageGame(false, true);
  const s = commandTimber(
    base,
    { type: "scout-sites", ids: ["reed"], explore: true },
    "scout",
  );
  const run = s.scoutFinds?.reed;
  if (!run) throw Error("정찰 전갈 없음");
  let waited = s;
  for (let i = 0; i < 20 && !encounterReady(waited, "reed"); i++)
    waited = advanceTimber(waited, 60);
  expect(encounterReady(waited, "reed")).toBe(true);
  expect(advanceTimber(waited, 1440).elapsed).toBe(waited.elapsed);
  const answered = commandTimber(
    waited,
    { type: "scout-choice", site: "reed", take: false },
    "answer",
  );
  expect(advanceTimber(answered, 1).elapsed).toBe(answered.elapsed + 1);
});
