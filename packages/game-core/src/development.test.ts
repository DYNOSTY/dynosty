import { expect, it } from "vitest";
import { newCampaign } from "./campaign.js";
import {
  advanceDevelopment,
  productionRate,
  RESEARCH_CATALOG,
  scoutSpeedRate,
  townShiftOpen,
  tradeRank,
} from "./development.js";
import { createPlayState } from "./play.js";
import {
  advanceTimber,
  commandTimber,
  createTimberSave,
  createTimberState,
  parseTimberSave,
  parseTimberState,
  type TimberCommand,
  type TimberState,
} from "./timber.js";
import type { BuildingKind } from "./town.js";
import { facilityDoor, payTown } from "./town.js";

const first = (s: TimberState) => {
  const f = s.town.facilities[0];
  if (!f) throw Error("시설 없음");
  return f;
};
let seq = 0;
const cmd = (s: TimberState, c: TimberCommand) =>
  commandTimber(s, c, `development-${++seq}`);
const start = (minute = 540) => {
  const w = createPlayState();
  return createTimberState({
    ...w,
    minute,
    resources: {
      ...w.resources,
      RES_WOOD: 50000000,
      RES_METAL: 5000000,
      RES_STONE: 5000000,
    },
  });
};
function build(s: TimberState, kind: BuildingKind, x = 12, z = 12) {
  s = cmd(s, {
    type: "plan-building",
    kind,
    position: { x, z },
    headingRadians: Math.PI,
  });
  for (let i = 0; i < 300 && s.town.orders.length; i++) s = advanceTimber(s, 1);
  expect(s.town.orders).toHaveLength(0);
  return s;
}
function staffed(s: TimberState, id: string, count = 2) {
  s = cmd(s, { type: "facility-staff", id, count });
  return advanceTimber(s, 30);
}
it("시설1~3단계 개량은 재료를 확보하고 공사하며 생산 배율만 바꾼다", () => {
  let s = build(start(), "fishery", 46, 32);
  expect(() => cmd(s, { type: "upgrade-facility", id: "build-1" })).toThrow(
    /연구/,
  );
  s = payTown(s, { RES_WOOD: 24, RES_METAL: 6 });
  s = {
    ...s,
    town: {
      ...s.town,
      development: {
        ...s.town.development,
        completed: ["UPGRADE_FISHERY_2", "UPGRADE_FISHERY_3"],
      },
    },
  };
  const initial = s.world.resources.RES_WOOD;
  expect(productionRate(s, first(s))).toBe(1);
  s = cmd(s, { type: "upgrade-facility", id: "build-1" });
  expect(s.world.resources.RES_WOOD).toBe(initial - 90000);
  expect(() => cmd(s, { type: "upgrade-facility", id: "build-1" })).toThrow();
  s = advanceTimber(s, 100);
  expect(s.town.facilities[0]?.level).toBe(2);
  expect(productionRate(s, first(s))).toBe(1.5);
  s = cmd(s, { type: "upgrade-facility", id: "build-1" });
  s = advanceTimber(s, 100);
  expect(s.town.facilities[0]?.level).toBe(3);
  expect(productionRate(s, first(s))).toBe(2);
  expect(() => cmd(s, { type: "upgrade-facility", id: "build-1" })).toThrow();
  expect(s.town.facilities).toHaveLength(1);
  expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
});
it("성공한 교역만 범위를 열고 출발한 파견의 단계·거래량을 보존한다", () => {
  let s = staffed(build(start(), "trade"), "build-1", 1);
  expect(tradeRank(s)).toBe(1);
  expect(() =>
    cmd(s, { type: "dispatch-food", id: "build-1", food: "RES_FISH", rank: 2 }),
  ).toThrow();
  s = cmd(s, {
    type: "dispatch-food",
    id: "build-1",
    food: "RES_FISH",
    rank: 1,
  });
  expect(tradeRank(s)).toBe(1);
  s = advanceTimber(s, 150);
  expect(tradeRank(s)).toBe(2);
  expect(s.town.received.RES_FISH).toBe(10);
  for (let n = 0; n < 2; n++) {
    s = cmd(s, {
      type: "dispatch-food",
      id: "build-1",
      food: "RES_FISH",
      rank: 1,
    });
    s = advanceTimber(s, 150);
  }
  expect(tradeRank(s)).toBe(3);
  s = cmd(s, {
    type: "dispatch-food",
    id: "build-1",
    food: "RES_FISH",
    rank: 3,
  });
  expect(s.town.trips[0]?.goal.x).toBe(220);
  expect(s.town.trips[0]?.rank).toBe(3);
  expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
}, 20000);
it("명시하지 않은 시설은 쉬고 지정 시설만18~21시에 일하며 수당·추가 배식은 없다", () => {
  let s = staffed(build(start(), "farm"), "build-1");
  s = advanceTimber(s, 1080 - s.world.minute);
  const food = { ...s.world.resources };
  s = cmd(s, { type: "set-overtime", target: "build-1", enabled: true });
  expect(s.world.resources).toEqual(food);
  expect(townShiftOpen(s, "build-1")).toBe(true);
  expect(townShiftOpen(s, "other")).toBe(false);
  const progress = s.town.facilities[0]?.delivered ?? 0;
  s = advanceTimber(s, 90);
  expect(s.town.facilities[0]?.delivered).toBeGreaterThan(progress);
  expect(s.world.pessimism).toBeGreaterThan(0);
  s = advanceTimber(s, 1260 - s.world.minute);
  expect(townShiftOpen(s, "build-1")).toBe(false);
  const buffer = s.town.facilities[0]?.buffer;
  s = advanceTimber(s, 10);
  expect(s.town.facilities[0]?.buffer).toBe(buffer);
}, 20000);
it("야근 중단/재지정은 누적 시간을 초기화하지 않고 다음 날 자동 연장되지 않는다", () => {
  let s = staffed(build(start(), "fishery", 46, 32), "build-1");
  s = advanceTimber(s, 1080 - s.world.minute);
  s = cmd(s, { type: "set-overtime", target: "build-1", enabled: true });
  s = advanceTimber(s, 30);
  const minutes = s.town.development.overtime[0]?.minutes;
  s = cmd(s, { type: "set-overtime", target: "build-1", enabled: false });
  expect(townShiftOpen(s, "build-1")).toBe(false);
  s = cmd(s, { type: "set-overtime", target: "build-1", enabled: true });
  expect(s.town.development.overtime[0]?.minutes).toBe(minutes);
  s = advanceTimber(s, 1440);
  expect(townShiftOpen(s, "build-1")).toBe(false);
}, 20000);
it("연구는 공방·선행·배치·현장 도착을 요구하고 완료 효과를 한 번 적용한다", () => {
  expect(() =>
    cmd(start(), { type: "start-research", tech: "TECH_TRAIL" }),
  ).toThrow();
  let s = build(start(), "workshop");
  s = cmd(s, { type: "start-research", tech: "TECH_TRAIL" });
  s = advanceTimber(s, 10);
  expect(s.town.development.research[0]?.work).toBe(0);
  s = staffed(s, "build-1", 1);
  expect(s.town.development.research[0]?.work).toBeGreaterThan(0);
  s = staffed(s, "build-1");
  expect(s.town.development.research[0]?.work).toBeGreaterThan(0);
  const r = RESEARCH_CATALOG.find((r) => r.id === "TECH_TRAIL");
  if (!r) throw Error("연구 자료 없음");
  s = {
    ...s,
    town: {
      ...s.town,
      development: {
        ...s.town.development,
        research: [
          {
            tech: r.id,
            facility: "build-1",
            work: r.workdays * 540 * 3 - 1,
          },
        ],
      },
    },
  };
  s = advanceTimber(s, 1);
  expect(s.town.development.completed).toEqual(["TECH_TRAIL"]);
  expect(s.town.development.research).toEqual([]);
  expect(() =>
    cmd(s, { type: "start-research", tech: "TECH_TRAIL" }),
  ).toThrow();
  expect(() =>
    cmd(s, { type: "start-research", tech: "TECH_MECHA" }),
  ).toThrow();
});
it("연구가 완료되는 마지막 야근 분도 정산하고 다음 분은 쉬게 한다", () => {
  let s = staffed(build(start(), "workshop"), "build-1");
  s = cmd(s, { type: "start-research", tech: "TECH_TRAIL" });
  s = { ...s, world: { ...s.world, minute: 1139 } };
  s = cmd(s, { type: "set-overtime", target: "build-1", enabled: true });
  const d = s.town.development;
  const r = RESEARCH_CATALOG.find((r) => r.id === "TECH_TRAIL");
  if (!r) throw Error("연구 자료 없음");
  const door = facilityDoor(first(s));
  s = {
    ...s,
    residents: s.residents.map((q) =>
      q.workplaceId === "facility:build-1"
        ? { ...q, position: door, routine: "working" }
        : q,
    ),
    town: {
      ...s.town,
      development: {
        ...d,
        research: [
          { tech: r.id, facility: "build-1", work: r.workdays * 1620 - 1 },
        ],
        overtime: d.overtime.map((p) => ({ ...p, minutes: 59 })),
      },
    },
  };
  const finished = advanceDevelopment(s, 1);
  expect(finished.town.development.completed).toContain(r.id);
  expect(finished.town.development.overtime[0]?.minutes).toBe(60);
  expect(finished.world.pessimism).toBe(s.world.pessimism + 1);
  expect(finished.town.development.seed).not.toBe(d.seed);
  const idle = advanceDevelopment(finished, 1);
  expect(idle.town.development.overtime[0]?.minutes).toBe(60);
  expect(idle.town.development.seed).toBe(finished.town.development.seed);
});
it("야근 부상은 공통 건강 사건으로 반영하며 저장·재개시 같은 난수 결과를 얻는다", () => {
  let s = staffed(build(start(), "farm"), "build-1");
  s = advanceTimber(s, 1080 - s.world.minute);
  s = cmd(s, { type: "set-overtime", target: "build-1", enabled: true });
  s = advanceTimber(s, 1);
  let seed = 0;
  while (
    ((Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296 >=
    1 - 0.99 ** (1 / 60)
  )
    seed++;
  s = {
    ...s,
    town: { ...s.town, development: { ...s.town.development, seed } },
  };
  const restored = parseTimberSave(createTimberSave(s)).state;
  const n = advanceTimber(s, 1);
  expect(n).toEqual(advanceTimber(restored, 1));
  expect(n.town.development.injuries.length).toBeGreaterThan(0);
  const injured = n.town.development.injuries[0]?.resident;
  expect(n.residents.find((r) => r.id === injured)?.health).toBe("sick");
  expect(n.world.citizens.find((r) => r.id === injured)?.health).toBe("sick");
}, 20000);
it("v14 시설은1단계로 변환하고 잘못된 단계·연구·난수 기록을 거부한다", () => {
  const s = build(start(), "fishery", 46, 32);
  const old = JSON.parse(JSON.stringify(s));
  old.version = 14;
  delete old.town.development;
  delete old.town.facilities[0].level;
  expect(parseTimberState(old).town.facilities[0]?.level).toBe(1);
  for (const field of ["level", "seed", "research", "overtime"]) {
    const bad = JSON.parse(JSON.stringify(s));
    if (field === "level") bad.town.facilities[0].level = 4;
    if (field === "seed") bad.town.development.seed = -1;
    if (field === "research") bad.town.development.completed = ["made-up"];
    if (field === "overtime") bad.town.development.overtime = [null];
    expect(() => parseTimberState(bad)).toThrow();
  }
});

it("야근을 명시한 대기 공사만 야간 유휴 인력을 배정하고 뒤 공사는 기다린다", () => {
  let s = cmd(start(1080), {
    type: "plan-building",
    kind: "home",
    position: { x: 12, z: 12 },
    headingRadians: Math.PI,
  });
  s = cmd(s, {
    type: "plan-building",
    kind: "storage",
    position: { x: 0, z: 16 },
    headingRadians: Math.PI,
  });
  s = cmd(s, { type: "set-overtime", target: "build-1", enabled: true });
  s = advanceTimber(s, 100);
  expect(s.homes).toHaveLength(7);
  expect(s.town.orders[0]?.id).toBe("build-2");
  expect(s.town.orders[0]?.workDone).toBe(0);
  expect(s.town.orders[0]?.crew).toHaveLength(0);
});
it("계단식 온상 연구는 같은 물 투입에서 실제 풀 산출만1.2배 늘린다", () => {
  let s = build(start(), "farm");
  const f = s.town.facilities[0];
  if (!f) throw Error("시설 없음");
  const worker = s.world.citizens.find((c) => c.species === "R03");
  if (!worker) throw Error("주민 없음");
  s = {
    ...s,
    town: {
      ...s.town,
      facilities: [{ ...f, target: 1, progress: 0, buffer: 0 }],
    },
    residents: s.residents.map((r) =>
      r.id === worker.id
        ? {
            ...r,
            position: facilityDoor(f),
            workplaceId: `facility:${f.id}`,
            insideHome: false,
            routine: "working",
          }
        : r,
    ),
  };
  const ordinary = advanceTimber(s, 150);
  let improved = payTown(s, { RES_WOOD: 26, RES_METAL: 6 });
  improved = {
    ...improved,
    town: {
      ...improved.town,
      development: {
        ...improved.town.development,
        completed: ["TECH_SEED", "TECH_CULTURE"],
        tradeCount: 1,
      },
    },
  };
  improved = advanceTimber(improved, 150);
  const total = (x: TimberState) => {
    const f = x.town.facilities[0];
    return (f?.delivered ?? 0) + (f?.buffer ?? 0) + (f?.haul?.cargo ?? 0);
  };
  expect(total(ordinary)).toBe(15);
  expect(total(improved)).toBe(18);
  expect(ordinary.town.spent.RES_WATER).toBe(improved.town.spent.RES_WATER);
});

it("최고 온상과 연구가 겹쳐도 생산2배를 넘지 않고 정찰2단계는1단계를 대체한다", () => {
  let s = build(start(), "farm");
  const f = first(s);
  const worker = s.world.citizens.find((c) => c.species === "R03");
  if (!worker) throw Error("주민 없음");
  s = payTown(s, { RES_WOOD: 58, RES_METAL: 9 });
  s = {
    ...s,
    town: {
      ...s.town,
      facilities: [{ ...f, level: 3, target: 1 }],
      development: {
        ...s.town.development,
        completed: ["TECH_SEED", "TECH_CULTURE"],
        tradeCount: 1,
      },
    },
    residents: s.residents.map((r) =>
      r.id === worker.id
        ? {
            ...r,
            position: facilityDoor(f),
            workplaceId: `facility:${f.id}`,
            routine: "working",
            insideHome: false,
          }
        : r,
    ),
  };
  expect(productionRate(s, first(s))).toBe(2);
  s = advanceTimber(s, 60);
  const produced = first(s);
  expect(
    produced.buffer + produced.delivered + (produced.haul?.cargo ?? 0),
  ).toBe(12);
  expect(scoutSpeedRate(s)).toBe(1);
  s = payTown(s, { RES_WOOD: 24, RES_METAL: 6 });
  s = {
    ...s,
    town: {
      ...s.town,
      development: {
        ...s.town.development,
        completed: [...s.town.development.completed, "TECH_TRAIL"],
      },
    },
  };
  expect(scoutSpeedRate(s)).toBe(1.5);
  s = {
    ...s,
    town: {
      ...s.town,
      development: {
        ...s.town.development,
        completed: [...s.town.development.completed, "TECH_SCOUT_SPEED_2"],
      },
    },
  };
  expect(scoutSpeedRate(s)).toBe(2);
  expect(parseTimberState(s)).toEqual(s);
});

it("같은 어장의 한 분 생산 진척이 난이도 배율을 따른다", () => {
  const base = staffed(build(start(), "fishery", 46, 32), "build-1", 1);
  const before = first(base).progress;
  const work = (difficulty: "easy" | "normal" | "hard") => {
    const state = advanceTimber(
      { ...base, campaign: { ...newCampaign("patrol"), difficulty } },
      1,
    );
    return (first(state).progress - before + 30) % 30;
  };
  const normal = work("normal");
  expect(normal).toBeGreaterThan(0);
  expect(work("easy")).toBeCloseTo(normal * 1.2);
  expect(work("hard")).toBeCloseTo(normal * 0.8);
});
