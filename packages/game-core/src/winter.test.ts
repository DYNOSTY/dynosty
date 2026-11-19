import { describe, expect, it } from "vitest";
import {
  AMOUNT_SCALE,
  advancePlayMinutes,
  createPlayState,
  parsePlayState,
} from "./play.js";
import {
  climateAt,
  coalDemandPerDay,
  createWinterState,
  OUTDOOR_WORKERS,
  setZoneHeat,
  stepWinter,
  termOf,
  weatherOf,
  winterReport,
} from "./winter.js";

const ids = Array.from({ length: 60 }, (_, i) => `c${i}`);
const people = ids.map((id) => ({ id, alive: true }));

describe("절기", () => {
  it("첫날은 한로, 절기 하나가 이틀, 닷새째 입동, 마흔여덟 날 뒤 다시 한로", () => {
    expect(termOf(1).name).toBe("한로");
    expect(termOf(2).name).toBe("한로");
    expect(termOf(5).name).toBe("입동");
    expect(termOf(5).season).toBe("겨울");
    expect(termOf(49).name).toBe("한로");
  });
  it("같은 씨앗·날짜면 날씨가 같고, 겨울엔 눈보라·한파가 나온다", () => {
    expect(weatherOf(1, 10)).toBe(weatherOf(1, 10));
    const winter = Array.from({ length: 200 }, (_, d) =>
      weatherOf(7, d * 48 + 12),
    );
    expect(winter).toContain("눈보라");
    expect(winter).toContain("한파");
  });
  it("새벽이 낮보다 춥고 대한이 대서보다 춥다", () => {
    const night = climateAt(3, 6, 4 * 60).temp;
    const noon = climateAt(3, 6, 14 * 60).temp;
    expect(night).toBeLessThan(noon);
    expect(termOf(15).name).toBe("대한");
    expect(termOf(39).name).toBe("대서");
    expect(termOf(15).base).toBeLessThan(termOf(39).base);
  });
});

describe("온돌 연료 (기획 v0.4 수치)", () => {
  it("모든 구역 보통이면 하루 석탄 8.9375 (보온 7.9375 + 식당 1)", () => {
    expect(coalDemandPerDay(createWinterState(ids))).toBeCloseTo(8.9375, 6);
  });
  it("화력 절약 0.6 · 긴급 1.4가 둥지 석탄에 곱해진다", () => {
    const w = createWinterState(ids);
    const nestNormal = 6 * 1 * (15 / 24);
    expect(coalDemandPerDay(setZoneHeat(w, "nest", "긴급"))).toBeCloseTo(
      8.9375 + nestNormal * 0.4,
      6,
    );
    expect(coalDemandPerDay(setZoneHeat(w, "nest", "절약"))).toBeCloseTo(
      8.9375 - nestNormal * 0.4,
      6,
    );
  });
  it("석탄이 없으면 목재를 석탄1=목재3으로 태우고 예약 목재는 남긴다", () => {
    const w = createWinterState(ids);
    const r = stepWinter({
      winter: w,
      day: 1,
      minute: 0,
      minutes: 60,
      coal: 0,
      wood: 1000 * AMOUNT_SCALE,
      reservedWood: 999 * AMOUNT_SCALE,
      scale: AMOUNT_SCALE,
      citizens: people,
    });
    expect(r.coalUsed).toBe(0);
    expect(r.woodUsed).toBeGreaterThan(0);
    expect(r.woodUsed).toBeLessThanOrEqual(1 * AMOUNT_SCALE);
    const full = stepWinter({
      winter: w,
      day: 1,
      minute: 0,
      minutes: 60,
      coal: 0,
      wood: 1000 * AMOUNT_SCALE,
      reservedWood: 0,
      scale: AMOUNT_SCALE,
      citizens: people,
    });
    // 00시: 둥지·쉼터·치료소 + 식당 = (6 + 2 + 0.5 + 1) / 24 석탄 → ×3 목재
    expect(full.woodUsed / AMOUNT_SCALE).toBeCloseTo(
      ((6 + 2 + 0.5 + 1) / 24) * 3,
      3,
    );
  });
  it("연료가 다 떨어져도 구들 온기는 한꺼번에가 아니라 서서히 식는다", () => {
    let w = createWinterState(ids);
    const before = w.zones.nest.storage;
    for (let h = 0; h < 3; h++)
      w = stepWinter({
        winter: w,
        day: 5,
        minute: h * 60,
        minutes: 60,
        coal: 0,
        wood: 0,
        reservedWood: 0,
        scale: AMOUNT_SCALE,
        citizens: people,
      }).winter;
    expect(w.zones.nest.storage).toBeLessThan(before);
    expect(w.zones.nest.storage).toBeGreaterThan(before - 20);
  });
});

describe("체온", () => {
  it("연료가 다 떨어지면 구들이 식고 주민 노출이 쌓여 피난·부상이 생긴다", () => {
    let state = createPlayState();
    state = {
      ...state,
      day: 11, // 동지
      resources: { ...state.resources, RES_COAL: 0, RES_WOOD: 0 },
    };
    for (let d = 0; d < 4; d++) state = advancePlayMinutes(state, 24 * 60);
    const r = winterReport(
      state.winter,
      state.day,
      state.minute,
      state.citizens,
    );
    expect(state.winter.zones.nest.storage).toBe(0);
    expect(
      r.people.exposed + r.people.injured + r.people.critical,
    ).toBeGreaterThan(20);
    expect(r.people.sheltering).toBeGreaterThan(0);
  });
  it("연료가 있으면 둥지에 머문 주민은 따뜻하고, 바깥 일꾼이 더 많이 언다", () => {
    let state = { ...createPlayState(), day: 11, minute: 8 * 60 };
    state = advancePlayMinutes(state, 9 * 60); // 17시, 하루 일 끝
    const worker = state.winter.bodies[state.citizens[0]?.id ?? ""];
    const home =
      state.winter.bodies[state.citizens[OUTDOOR_WORKERS + 5]?.id ?? ""];
    expect(home?.exposure).toBe(0);
    expect(worker?.exposure ?? 0).toBeGreaterThan(5);
  });
  it("석탄 소모가 자원에 반영되고 저장 → 불러오기 후 같은 결과", () => {
    const start = createPlayState();
    const a = advancePlayMinutes(start, 600);
    expect(a.resources.RES_COAL).toBeLessThan(start.resources.RES_COAL);
    const reloaded = parsePlayState(JSON.parse(JSON.stringify(a)));
    expect(advancePlayMinutes(reloaded, 600)).toEqual(
      advancePlayMinutes(a, 600),
    );
  });
  it("옛 저장(winter 없음)도 기본 겨울 상태로 열린다", () => {
    const { winter: _w, ...old } = createPlayState();
    const opened = parsePlayState(old);
    expect(opened.winter.zones.nest.storage).toBe(65);
  });
  it("10분씩 나눠 진행해도 한 번에 진행한 것과 연료가 같다", () => {
    const s = createPlayState();
    let step = s;
    for (let i = 0; i < 18; i++) step = advancePlayMinutes(step, 10);
    const once = advancePlayMinutes(s, 180);
    expect(
      Math.abs(step.resources.RES_COAL - once.resources.RES_COAL),
    ).toBeLessThanOrEqual(2);
  });
});
