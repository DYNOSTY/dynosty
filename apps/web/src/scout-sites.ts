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
    find: "단서를 찾을 수 있는 옛 기록 (1단계)",
  },
];

export const SCOUT_CREW = 2;
export const SCOUT_GOAL = 5;

// 자원 터 (2026-11-21): 정찰로 찾아내 자원을 직접 얻는 곳. 모델은 tools/blender/site3d.py (부품으로 깎아 구운 입체)
// 지금은 모양을 게임 조명에서 보려고 처음부터 보이는 자리(숲 가장자리)에 고정으로 둠.
// 정찰로 찾아내기·판마다 무작위 배치는 다음 단계 (안쪽 고리 자원 터, 바깥 고리 교역 마을).
export const RESOURCE_SITES = [
  { id: "coal", name: "석탄 노두", file: "SITE3_COAL", x: -30, z: 10 },
  { id: "iron", name: "철광 노두", file: "SITE3_IRON", x: 27, z: 22 },
  { id: "spring", name: "얼지 않는 샘", file: "SITE3_SPRING", x: -12, z: 31 },
  { id: "store", name: "버려진 곳간", file: "SITE3_STORE", x: -14, z: -30 },
  { id: "fish", name: "얼음 낚시 못", file: "SITE3_FISH", x: 12, z: -33 },
  { id: "pine", name: "쓰러진 적송", file: "SITE3_PINE", x: 31, z: -10 },
] as const;
/** 터 둘레에서 나무를 비워 두는 반지름 */
const RESOURCE_SITE_CLEAR = 7.5;
/** 나무를 심지 않는 자리: 터 둘레와, 터 앞(기본 시점의 카메라 쪽 = -z)으로 난 트인 자리 — 처음 보는 각도에서 앞 나무가 터를 가리지 않게 */
export const nearResourceSite = (x: number, z: number) =>
  RESOURCE_SITES.some((s) => {
    const dx = x - s.x,
      dz = z - s.z;
    return (
      Math.hypot(dx, dz) < RESOURCE_SITE_CLEAR ||
      (Math.abs(dx) < RESOURCE_SITE_CLEAR * 0.8 &&
        dz < 0 &&
        dz > -RESOURCE_SITE_CLEAR * 2)
    );
  });
