import { SETTLEMENTS } from "./campaign.js";
import { scoutSpeedRate } from "./development.js";
import type { TimberState } from "./timber.js";

// 정찰 거점 (기획서: BOKHOL Dev Lite 03_시스템/정찰과조달.md, 시나리오 1단계 '정찰 5회')
// 정찰대는 일손 2명과 왕복 식량을 싣고 출발한다.
export type ScoutSite = {
  id: string;
  name: string;
  x: number;
  z: number;
  /** 정찰 왕복(게임 시간) */
  hours: number;
  /** true면 기획서 값, false면 시안 값(기획서에 없음 → 기본배송 × 2) */
  fromPlan: boolean;
  find: string;
};

export const SCOUT_SITES: ScoutSite[] = [
  {
    id: "reed",
    name: "갈대나루",
    x: 36,
    z: -14,
    hours: 36,
    fromPlan: true,
    find: "교역: 어류 24 ↔ 나무 12 · 배송 18시간",
  },
  {
    id: "pine",
    name: "솔그늘",
    x: -36,
    z: 38,
    hours: 48,
    fromPlan: false,
    find: "교역: 풀 36 ↔ 철 6 · 나무 30 ↔ 어류 12 · 배송 24시간",
  },
  {
    id: "forge",
    name: "옛 제철터",
    x: -48,
    z: -18,
    hours: 60,
    fromPlan: false,
    find: "교역: 철 16 ↔ 풀 20 · 배송 30시간",
  },
  {
    id: "hunt",
    name: "돌등 사냥막",
    x: 52,
    z: 18,
    hours: 40,
    fromPlan: false,
    find: "교역: 고기 20 ↔ 철 4 · 배송 20시간",
  },
  {
    id: "record",
    name: "무너진 고려 집터",
    x: -20,
    z: -46,
    hours: 30,
    fromPlan: false,
    find: "고려의 창고 인장이 찍힌 목간",
  },
];

export const SCOUT_CREW = 2;
export const SCOUT_GOAL = 5;

export function scoutTripMinutes(site: ScoutSite, s?: TimberState) {
  return Math.ceil((site.hours * 60) / (s ? scoutSpeedRate(s) : 1));
}

export const SCOUT_FINDS = [
  "survivors",
  "wood",
  "fish",
  "coal",
  "record",
  "contact0",
  "contact1",
  "contact2",
  "contact3",
  "contact4",
] as const;
export type ScoutFind = {
  kind: (typeof SCOUT_FINDS)[number];
  decision: "waiting" | "take" | "pass" | "home";
  due: number;
};
export function scoutFinding(kind: ScoutFind["kind"]) {
  if (kind.startsWith("contact")) {
    const village = SETTLEMENTS[Number(kind.slice(-1))]!.name;
    return [
      village + "의 길잡이",
      village +
        "에서 왔다는 짐꾼이 눈에 덮인 샛길을 짚어 줍니다. 길을 그려 복홀에 전할까요?",
      "교역로 약도",
    ];
  }
  switch (kind) {
    case "survivors":
      return [
        "바람을 등진 가족",
        "수레 그늘에 웅크린 두 이가 먼저 어린 나뭇가지를 내밉니다. 함께 복홀로 가겠느냐고 물을까요?",
        "유민 2명",
      ];
    case "record":
      return [
        "눈 속의 고려 인장",
        "허물어진 곳간 문설주에서 고려의 창고 인장이 찍힌 목간을 찾았습니다.",
        "고려의 목간",
      ];
    case "wood":
      return [
        "눈 밑에 묻힌 통나무",
        "떠난 벌목꾼들이 마른 재목을 묶어 두었습니다.",
        "목재 12",
      ];
    case "fish":
      return [
        "나루의 마른 생선",
        "얼어붙은 나루에서 기름종이에 싸인 어물을 찾았습니다.",
        "어류 8",
      ];
    default:
      return [
        "꺼진 화덕의 석탄",
        "무너진 화덕 뒤에 마른 석탄 자루가 남았습니다.",
        "석탄 10",
      ];
  }
}
export function encounterReady(s: TimberState, id: string) {
  const run = s.scoutFinds?.[id];
  return (
    run?.decision === "waiting" &&
    (s.world.day - 1) * 1440 + s.world.minute >= run.due
  );
}
export function scoutRun(s: TimberState, site: ScoutSite) {
  const start = s.scoutDepartures?.[site.id];
  if (start === undefined) return undefined;
  // 이전 저장의 정찰대는 기존 왕복 일정을 유지한다.
  const minutes = s.scoutTripDurations?.[site.id] ?? scoutTripMinutes(site);
  const encounter = s.scoutFinds?.[site.id];
  const due = encounter
    ? encounter.decision === "waiting"
      ? Infinity
      : encounter.due
    : start + minutes;
  return { start, minutes, due };
}
