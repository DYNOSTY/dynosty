import { expect, it } from "vitest";
import { atHospital, hospitalBeds, recoveryRequired } from "./hospital.js";
import { createPlayState } from "./play.js";
import {
  advanceTimber,
  commandTimber,
  createTimberSave,
  createTimberState,
  parseTimberSave,
  parseTimberState,
  residentIndoors,
  type TimberCommand,
  type TimberState,
} from "./timber.js";

let seq = 0;
const cmd = (s: TimberState, c: TimberCommand) =>
  commandTimber(s, c, `hospital-test-${++seq}`);
const start = () => createTimberState({ ...createPlayState(), minute: 540 });
const ids = (s: TimberState, count = 1) =>
  s.residents.slice(0, count).map((r) => r.id);
function build(s = start()) {
  s = cmd(s, {
    type: "plan-building",
    kind: "hospital",
    position: { x: 12, z: 12 },
    headingRadians: Math.PI,
  });
  s = advanceTimber(s, 160);
  expect(s.town.facilities[0]?.kind).toBe("hospital");
  return s;
}
function injure(
  s: TimberState,
  count = 1,
  severity: "minor" | "major" | "critical" = "minor",
) {
  return cmd(s, {
    type: "citizen-event",
    event: {
      type: "illness",
      id: `injury-${++seq}`,
      citizenIds: ids(s, count),
      severity,
    },
  });
}
it("병원이 없으면 회복하지 않고 빈 병상이 생기면 가까운 병원으로 이동·입원한다", () => {
  let s = injure(start());
  s = advanceTimber(s, 80);
  expect(s.town.patients[0]).toMatchObject({ hospital: null, progress: 0 });
  s = build(s);
  s = advanceTimber(s, 1);
  const r = s.residents[0];
  expect(r?.health).toBe("sick");
  s = advanceTimber(s, 800);
  expect(s.town.patients).toHaveLength(0);
});
it("정원만 입원시키고 이동 중에는 회복하지 않으며 빈 병상을 기다린다", () => {
  let s = injure(build(), 9, "critical");
  s = advanceTimber(s, 1);
  expect(s.town.patients.filter((p) => p.hospital !== null)).toHaveLength(
    hospitalBeds(1),
  );
  expect(s.town.patients.every((p) => p.progress === 0)).toBe(true);
  s = advanceTimber(s, 40);
  expect(s.town.patients.filter((p) => p.hospital === null)).toHaveLength(4);
  const patient = s.residents[0];
  expect(patient && atHospital(s, patient)).toBe(true);
  expect(patient && residentIndoors(s, patient)).toBe(true);
  expect(patient?.workplaceId).toBeNull();
  expect(s.town.patients[0]?.progress).toBeGreaterThan(0);
});
it("부상 정도별 필요량만 다르고 야간에도 회복하여 자동 퇴원하고 공통 건강 상태를 갱신한다", () => {
  let s = build();
  const people = ids(s, 3);
  for (const [i, severity] of (
    ["minor", "major", "critical"] as const
  ).entries()) {
    s = cmd(s, {
      type: "citizen-event",
      event: {
        type: "illness",
        id: `severity-${++seq}`,
        citizenIds: [people[i] ?? ""],
        severity,
      },
    });
  }
  s = advanceTimber(s, 35);
  expect(s.town.patients.map(recoveryRequired)).toEqual([720, 1440, 2880]);
  s = {
    ...s,
    world: { ...s.world, minute: 1320 },
    town: {
      ...s.town,
      patients: s.town.patients.map((p) => ({
        ...p,
        progress: recoveryRequired(p) - 1,
      })),
    },
  };
  s = advanceTimber(s, 1);
  expect(s.town.patients).toHaveLength(0);
  for (const id of people) {
    expect(s.world.citizens.find((c) => c.id === id)?.health).toBe("healthy");
    expect(s.residents.find((r) => r.id === id)?.health).toBe("healthy");
  }
  expect(parseTimberSave(createTimberSave(s)).state).toEqual(s);
});
it("저장 후 회복량을 이어가고 같은 사건으로 초기화하지 않으며 사망 시 병상을 비운다", () => {
  let s = injure(build(), 1, "critical");
  s = advanceTimber(s, 40);
  const before = s.town.patients[0]?.progress ?? 0;
  const saved = createTimberSave(s);
  s = parseTimberSave(saved).state;
  const eventId =
    s.world.citizenEvents?.find((id) => id.startsWith("injury-")) ?? "";
  s = cmd(s, {
    type: "citizen-event",
    event: { type: "illness", id: eventId, citizenIds: ids(s) },
  });
  expect(s.town.patients[0]?.progress).toBe(before);
  expect(s.town.patients[0]?.severity).toBe("critical");
  s = cmd(s, {
    type: "citizen-event",
    event: { type: "death", id: `death-${++seq}`, citizenIds: ids(s) },
  });
  expect(s.town.patients).toHaveLength(0);
  expect(s.residents[0]?.health).toBe("dead");
  expect(advanceTimber(s, 300).residents[0]?.health).toBe("dead");
});
it("이전 저장의 치료 필요 주민을 보존하며 손상된 병상·회복량·중복 명부를 거절한다", () => {
  const s = injure(build(), 1, "major");
  const { patients: _patients, ...town } = s.town;
  const migrated = parseTimberState({ ...s, version: 15, town });
  expect(migrated.version).toBe(17);
  expect(migrated.town.patients[0]).toMatchObject({
    severity: "minor",
    progress: 0,
    hospital: null,
  });
  for (const patients of [
    [null],
    [...s.town.patients, ...s.town.patients],
    [{ ...s.town.patients[0], hospital: "missing" }],
    [{ ...s.town.patients[0], progress: -1 }],
    [{ ...s.town.patients[0], progress: 1440 }],
    [{ ...s.town.patients[0], severity: "unknown" }],
  ])
    expect(() =>
      parseTimberState({ ...s, town: { ...s.town, patients } }),
    ).toThrow();
  expect(() =>
    cmd(start(), {
      type: "citizen-event",
      event: {
        type: "illness",
        id: "bad",
        citizenIds: ids(s),
        severity: "unknown" as "minor",
      },
    }),
  ).toThrow();
});
