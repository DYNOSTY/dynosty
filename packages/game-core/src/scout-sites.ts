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

export function scoutRun(s: TimberState, site: ScoutSite) {
  const start = s.scoutDepartures?.[site.id];
  if (start === undefined) return undefined;
  // 이전 저장의 정찰대는 기존 왕복 일정을 유지한다.
  const minutes = s.scoutTripDurations?.[site.id] ?? scoutTripMinutes(site);
  return { start, minutes, due: start + minutes };
}
