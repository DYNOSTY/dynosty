import { expect, it } from "vitest";
import {
  AMOUNT_SCALE,
  advancePlayMinutes,
  commandSiteCrew,
  createPlayState,
  parsePlayState,
  startBuilding,
} from "./play.js";
import {
  BUILD_RULES,
  CREW_SIZE,
  freeHands,
  PLOTS,
  START_BUILT,
  WORKFORCE,
} from "./works.js";

const S = AMOUNT_SCALE;
/** 새 게임을 그날 9시(일 시작)로 옮김 */
const at9 = () => {
  const s = createPlayState();
  return advancePlayMinutes(s, (9 * 60 - s.minute + 1440) % 1440);
};

it("처음에는 조달소·둥지 3동·강변 시설만 서 있다", () => {
  const types = createPlayState().works.built.map((p) => PLOTS[p]);
  expect(types.sort()).toEqual(
    [
      "BLD_FISHERY",
      "BLD_NEST",
      "BLD_NEST",
      "BLD_NEST",
      "BLD_OFFICE",
      "BLD_WATER",
    ].sort(),
  );
  expect(START_BUILT.length).toBe(6);
});

it("터에 일꾼을 보내면 일하는 시각에만 자원이 들어오고, 다 캐면 돌아온다", () => {
  let s = commandSiteCrew(at9(), "pine", true);
  expect(freeHands(s.works)).toBe(WORKFORCE - CREW_SIZE);
  const wood0 = s.resources.RES_WOOD;
  s = advancePlayMinutes(s, 540); // 9시~18시
  const day = s.resources.RES_WOOD - wood0;
  s = advancePlayMinutes(s, 600); // 밤
  const night = s.resources.RES_WOOD - wood0 - day;
  // 적송 15/일 + 벌목 12/일, 밤에는 난방으로 줄기만 함
  expect(day).toBeGreaterThan(20 * S);
  expect(night).toBeLessThanOrEqual(0);
  // 적송 한 그루 60: 닷새면 바닥나고 일꾼이 돌아옴
  s = advancePlayMinutes(s, 1440 * 5);
  expect(s.works.sites.pine.left).toBe(0);
  expect(s.works.sites.pine.crew).toBe(false);
  expect(() => commandSiteCrew(s, "pine", true)).toThrow();
});

it("일손이 모자라면 더 보낼 수 없다", () => {
  let s = at9();
  for (const site of [
    "coal",
    "iron",
    "spring",
    "store",
    "fish",
    "pine",
  ] as const)
    s = commandSiteCrew(s, site, true);
  expect(freeHands(s.works)).toBe(0);
  expect(() => startBuilding(s, 5)).toThrow();
  s = commandSiteCrew(s, "coal", false);
  expect(startBuilding(s, 5).works.building).toEqual([{ plot: 5, done: 0 }]);
});

it("건물은 자재를 바로 쓰고, 작업일만큼 일한 뒤에 선다", () => {
  const plot = PLOTS.indexOf("BLD_WAREHOUSE");
  const rule = BUILD_RULES.BLD_WAREHOUSE;
  const s0 = at9();
  let s = startBuilding(s0, plot);
  expect(s0.resources.RES_METAL - s.resources.RES_METAL).toBe(rule.metal * S);
  expect(s.works.built).not.toContain(plot);
  expect(() => startBuilding(s, plot)).toThrow(); // 같은 부지에 두 번 못 지음
  s = advancePlayMinutes(s, 539);
  expect(s.works.built).not.toContain(plot);
  s = advancePlayMinutes(s, 1);
  expect(s.works.built).toContain(plot);
  expect(s.works.building).toEqual([]);
  expect(() => startBuilding(s, plot)).toThrow(); // 이미 지은 곳
});

it("다 지은 채집막은 풀을 낸다", () => {
  const plot = PLOTS.indexOf("BLD_FORAGE");
  let s = advancePlayMinutes(startBuilding(at9(), plot), 540 + 900); // 반나절 공사 → 다음 날 9시
  const before = s.resources.RES_PLANT;
  s = advancePlayMinutes(s, 540);
  // 하루 20을 내고 초식 주민 20명이 그동안 7.5를 먹음
  expect(s.resources.RES_PLANT - before).toBeGreaterThan(10 * S);
});

it("일터가 없던 옛 저장은 다 지은 마을로 불러온다", () => {
  const { works: _works, ...old } = createPlayState();
  const loaded = parsePlayState(old);
  expect(loaded.works.built.length).toBe(PLOTS.length);
  expect(loaded.works.sites.coal.crew).toBe(false);
});
