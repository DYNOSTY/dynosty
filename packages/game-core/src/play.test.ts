import { describe, expect, it } from "vitest";
import {
  AMOUNT_SCALE,
  advancePlayMinutes,
  createPlaySave,
  createPlayScene,
  createPlayState,
  evaluateOutcome,
  FOOD_IDS,
  foodWarnings,
  GAME_RULES,
  type OutcomeFacts,
  parsePlaySave,
  parsePlayState,
  parseRules,
  setPlayPaused,
  supplyFood,
  tickPlay,
} from "./play.js";

const facts = (): OutcomeFacts => ({
  admitted: 60,
  dead: 0,
  pessimism: 20,
  optimism: 50,
  pessimismExtremeMinutes: 0,
  optimismZeroMinutes: 0,
  stage5Minutes: 0,
  lowPessimismMinutes: 0,
  route: null,
  clues: [],
  research: [],
  mech2: false,
});
describe("승인 개발 기준과 시작 상태", () => {
  it("9개 자원과 60명·독립 상태를 생성하고 추천 조합을 한 데이터에서 읽는다", () => {
    expect(Object.keys(GAME_RULES.resources)).toHaveLength(9);
    const a = createPlayState(),
      b = createPlayState();
    expect(a.citizens).toHaveLength(60);
    expect(a.citizens).not.toBe(b.citizens);
    expect(a.resources).not.toBe(b.resources);
    for (const id of FOOD_IDS)
      expect(a.citizens.filter((c) => c.diet === id)).toHaveLength(20);
    expect(GAME_RULES.fuel.noCoalWoodPerDay).toBe(26.8125);
    expect(
      GAME_RULES.campaign.stage4PreparationDays +
        GAME_RULES.campaign.stage4ColdDays,
    ).toBe(30);
  });
  it.each(["resource", "population", "clock", "failure", "fuel"])(
    "빠진 값과 잘못된 기준으로 새 게임을 만들지 않는다: %s",
    (key) => {
      const r = JSON.parse(JSON.stringify(GAME_RULES)) as typeof GAME_RULES;
      if (key === "resource") r.resources.RES_PLANT.initial = -1;
      if (key === "population") r.population = [];
      if (key === "clock") r.time.minutesPerRealSecond = 0;
      if (key === "failure") r.endings.deathFraction = 0.9;
      if (key === "fuel") r.fuel.noCoalWoodPerDay = 23.8125;
      expect(() => parseRules(r)).toThrow();
      expect(() => createPlayState(r)).toThrow();
    },
  );
});
describe("식성별 고정 정밀도 소비와 시간", () => {
  it.each(FOOD_IDS)("%s 식성만 있으면 그 식량만 소비한다", (diet) => {
    const initial = createPlayState();
    const only = {
      ...initial,
      citizens: initial.citizens.filter((c) => c.diet === diet),
    };
    const after = advancePlayMinutes(only, 1440);
    for (const food of FOOD_IDS)
      expect(after.resources[food]).toBe(
        initial.resources[food] - (food === diet ? 20 * AMOUNT_SCALE : 0),
      );
  });
  it("분할 진행과 한 번 진행의 날짜·재고·잔여 분자가 정확히 같다", () => {
    const initial = createPlayState();
    let split = initial;
    for (let i = 0; i < 1440; i++) split = advancePlayMinutes(split, 1);
    const one = advancePlayMinutes(initial, 1440);
    expect(split).toEqual(one);
    expect(one.day).toBe(2);
    expect(one.minute).toBe(initial.minute);
    for (const id of FOOD_IDS)
      expect(one.resources[id]).toBe(100 * AMOUNT_SCALE);
    expect(initial.resources.RES_PLANT).toBe(120 * AMOUNT_SCALE);
  });
  it("날짜 경계에서 한 번만 변경하고 식량을 음수·다른 식성 대체로 만들지 않는다", () => {
    const initial = createPlayState();
    const s = {
      ...initial,
      minute: 1439,
      resources: { ...initial.resources, RES_MEAT: 0 },
    };
    const next = advancePlayMinutes(s, 2);
    expect(next.day).toBe(2);
    expect(next.minute).toBe(1);
    expect(next.resources.RES_MEAT).toBe(0);
    expect(next.unmet.RES_MEAT).toBeGreaterThan(0);
    expect(next.resources.RES_PLANT).toBe(next.resources.RES_FISH);
    expect(() => advancePlayMinutes(s, -1)).toThrow();
    expect(() => advancePlayMinutes(s, 1.5)).toThrow();
  });
  it("일시정지·재개·지연 상한을 적용하고 소수 tick을 누락·중복하지 않는다", () => {
    const s = createPlayState();
    expect(tickPlay(s, 10000)).toEqual(s);
    const running = setPlayPaused(s, false);
    expect(tickPlay(running, 10000).minute).toBe(s.minute + 1);
    const half = tickPlay(running, 500);
    expect(half.minute).toBe(s.minute);
    expect(tickPlay(half, 500).minute).toBe(s.minute + 1);
    expect(setPlayPaused(half, true).tickRemainder).toBe(0);
    expect(tickPlay(setPlayPaused(half, true), 1000).minute).toBe(s.minute);
  });
  it("식성별 하루분 경고·고갈·보충 해제를 일관되게 계산한다", () => {
    const s = createPlayState();
    expect(foodWarnings(s)).toEqual([]);
    const low = {
      ...s,
      resources: {
        ...s.resources,
        RES_PLANT: 20 * AMOUNT_SCALE - 1,
        RES_MEAT: 0,
      },
    };
    expect(foodWarnings(low)).toEqual([
      { id: "RES_PLANT", name: "풀", level: "low" },
      { id: "RES_MEAT", name: "고기", level: "empty" },
    ]);
    expect(foodWarnings(supplyFood(low, 1))).toEqual([]);
  });
  it("저장 왕복과 기존 형식을 구분하고 손상된 주민·재고·버전을 거부한다", () => {
    const s = advancePlayMinutes(createPlayState(), 1439);
    expect(parsePlaySave(createPlaySave(s)).state).toEqual(s);
    expect(() =>
      parsePlaySave({
        format: "dynosty-example",
        saveVersion: 1,
        game: { day: 1 },
      }),
    ).toThrow();
    expect(() =>
      parsePlayState({ ...s, resources: { ...s.resources, RES_PLANT: NaN } }),
    ).toThrow();
    expect(() =>
      parsePlayState({ ...s, citizens: [s.citizens[0], s.citizens[0]] }),
    ).toThrow();
    expect(() =>
      parsePlaySave({ ...createPlaySave(s), rulesVersion: 2 }),
    ).toThrow();
  });
});
describe("승인된 실패·엔딩 판정", () => {
  it("24시간 극단 유지와 회복, 가입 인원 분모의 80% 사망을 구분한다", () => {
    expect(
      evaluateOutcome({
        ...facts(),
        pessimism: 100,
        pessimismExtremeMinutes: 1439,
      }),
    ).toBe("continue");
    expect(
      evaluateOutcome({
        ...facts(),
        pessimism: 100,
        pessimismExtremeMinutes: 1440,
      }),
    ).toBe("failure");
    expect(
      evaluateOutcome({
        ...facts(),
        pessimism: 99,
        pessimismExtremeMinutes: 1440,
      }),
    ).toBe("continue");
    expect(
      evaluateOutcome({ ...facts(), optimism: 0, optimismZeroMinutes: 1440 }),
    ).toBe("failure");
    expect(evaluateOutcome({ ...facts(), admitted: 100, dead: 79 })).toBe(
      "continue",
    );
    expect(evaluateOutcome({ ...facts(), admitted: 100, dead: 80 })).toBe(
      "failure",
    );
  });
  it("10일은 마감이 아니고 단서·연구·노선을 충족한 뒤 판정하며 실패가 우선한다", () => {
    const f = {
      ...facts(),
      stage5Minutes: 20 * 1440,
      lowPessimismMinutes: 10 * 1440,
      route: "coexist" as const,
      clues: ["C01", "C02", "C03", "C04"],
      research: ["R17", "R18"],
    };
    expect(evaluateOutcome({ ...f, research: [] })).toBe("continue");
    expect(evaluateOutcome(f)).toBe("ending-a");
    expect(
      evaluateOutcome({
        ...f,
        route: "yangnyeong",
        research: ["R17", "R18", "R19"],
        mech2: true,
      }),
    ).toBe("ending-b");
    expect(evaluateOutcome({ ...f, dead: 48 })).toBe("failure");
    expect(evaluateOutcome({ ...f, stage5Minutes: 10 * 1440 - 1 })).toBe(
      "continue",
    );
  });
});

describe("공용 초기 상태와 표시 식별값", () => {
  it("대표 주민과 건물의 실제 식별값·방향을 장면에 전달한다", () => {
    const state = createPlayState();
    const scene = createPlayScene(state);
    expect(scene.entities.find((e) => e.kind === "resident")?.id).toBe(
      state.citizens[0]?.id,
    );
    expect(scene.entities.find((e) => e.kind === "building")?.id).toBe(
      state.buildings[0]?.id,
    );
    expect(scene.entities[0]?.headingRadians).toBe(Math.PI);
    expect(
      createPlayScene(setPlayPaused(state, false)).entities.find(
        (e) => e.kind === "resident",
      ),
    ).toMatchObject({ motion: "walking" });
  });
  it("주민·건물 사이의 중복 식별값과 누락 건물 정보를 거부한다", () => {
    const s = createPlayState();
    expect(() =>
      parsePlayState({
        ...s,
        buildings: [{ ...s.buildings[0], id: s.citizens[0]?.id }],
      }),
    ).toThrow();
    expect(() => parsePlayState({ ...s, buildings: undefined })).toThrow();
  });
  it("이진 부동소수 표현 오차가 있는 4자리 수량은 허용하고 더 작은 단위는 거부한다", () => {
    const r = JSON.parse(JSON.stringify(GAME_RULES)) as typeof GAME_RULES;
    r.resources.RES_PLANT.initial = 0.0003;
    expect(createPlayState(r).resources.RES_PLANT).toBe(3);
    r.resources.RES_PLANT.initial = 0.00001;
    expect(() => parseRules(r)).toThrow();
  });
});
