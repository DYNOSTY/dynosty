// 일터 (2026-11-22): 자원 터에 일꾼을 보내 캐 오고, 빈 부지에 건물을 짓는다.
// 기준: Dev Lite v1.1 03_시스템/건물과연구.md · 자원경제.md · 06_data/catalogs/buildings.csv
//   - 건물 비용(나무·철)과 작업일은 기획서 표 그대로. 자재는 공사를 시작할 때 다 쓰고, 시작한 뒤에는 돌려주지 않는다.
//   - 공사 작업조는 일손 2명. 생산·공사가 일손을 나눠 쓴다 (같은 인원을 두 곳에 쓰지 않음).
//   - 기획서의 생산량은 배치정원 4명 기준 → 여기서는 한 조 2명이라 절반.
// 임시 값 (기획서에 없음 — 사용자 확정 전): 자원 터 여섯 곳의 생산량·남은 양, 석탄 생산, 쓸 수 있는 일손 12명.
import type { ResourceId } from "./play.js";

/** 일하는 시각 (벌목과 같음): 9시~18시, 하루 작업 540분 */
export const WORK_HOURS = { from: 9, to: 18 } as const;
export const WORKDAY_MINUTES = (WORK_HOURS.to - WORK_HOURS.from) * 60;
/** 한 조 */
export const CREW_SIZE = 2;
// ponytail: 터·공사에 쓸 수 있는 일손을 12명으로 고정 — 주민 수·부상·정찰대와 묶이는 일손 장부가 생기면 거기서 받는다
export const WORKFORCE = 12;

export const SITE_IDS = [
  "coal",
  "iron",
  "spring",
  "store",
  "fish",
  "pine",
] as const;
export type SiteId = (typeof SITE_IDS)[number];
/** 자원 터: 한 조(2명)가 하루에 가져오는 양, 처음 남은 양 (null = 마르지 않음) */
export const SITE_RULES: Record<
  SiteId,
  {
    readonly resource: ResourceId;
    readonly perDay: number;
    readonly stock: number | null;
  }
> = {
  coal: { resource: "RES_COAL", perDay: 8, stock: 240 }, // 온돌이 하루 8.9를 땜 — 한 조로는 조금 모자라게
  iron: { resource: "RES_METAL", perDay: 6, stock: 120 }, // 회수장 철 모드 12/일의 절반, 철 매장 100~120
  spring: { resource: "RES_WATER", perDay: 30, stock: null }, // 물레방 60/일의 절반
  store: { resource: "RES_PLANT", perDay: 20, stock: 80 }, // 버려진 곳간에 남은 곡식 — 금방 바닥남
  fish: { resource: "RES_FISH", perDay: 12, stock: null }, // 양식장 24/일의 절반
  pine: { resource: "RES_WOOD", perDay: 15, stock: 60 }, // 쓰러진 적송 한 그루
};

/** 건물: 나무·철 비용, 작업일, 다 지으면 하루에 내는 것 (한 조 기준 = 기획서의 절반) */
export const BUILD_RULES = {
  BLD_OFFICE: { wood: 0, metal: 0, workdays: 0 },
  BLD_NEST: { wood: 12, metal: 0, workdays: 1 },
  BLD_WATER: { wood: 18, metal: 4, workdays: 1, out: ["RES_WATER", 30] },
  BLD_FORAGE: { wood: 8, metal: 0, workdays: 0.5, out: ["RES_PLANT", 20] },
  // ponytail: 회수장은 나무 모드만 — 철 모드(12/일) 전환은 일꾼 배정 창이 생기면
  BLD_SALVAGE: { wood: 12, metal: 2, workdays: 0.5, out: ["RES_WOOD", 15] },
  // ponytail: 온상의 물·목재 투입과 '살아남은 종자' 연구 선행은 아직 안 봄 — 연구가 생기면 잠근다
  BLD_GREENHOUSE: { wood: 24, metal: 6, workdays: 1, out: ["RES_PLANT", 20] },
  BLD_FISHERY: { wood: 18, metal: 4, workdays: 1, out: ["RES_FISH", 12] },
  BLD_WAREHOUSE: { wood: 18, metal: 4, workdays: 1 },
  BLD_WORKSHOP: { wood: 16, metal: 6, workdays: 1 },
  // ⚠ 임시: 기획서에 고기 생산처가 없어 육식 주민 20명이 반드시 굶음 → 망루에서 사냥감을 잡아 오는 것으로 (팀 결정 필요)
  BLD_WATCH: { wood: 14, metal: 6, workdays: 1, out: ["RES_MEAT", 20] },
  BLD_GATE: { wood: 18, metal: 6, workdays: 1 },
  BLD_CLINIC: { wood: 16, metal: 4, workdays: 1 },
} as const satisfies Record<
  string,
  {
    wood: number;
    metal: number;
    workdays: number;
    out?: readonly [ResourceId, number];
  }
>;
export type BuildingType = keyof typeof BUILD_RULES;

/** 부지: 번호마다 지을 건물이 정해져 있다 (자리는 화면 쪽 layout.ts와 같은 순서) */
export const PLOTS: readonly BuildingType[] = [
  "BLD_OFFICE",
  "BLD_NEST",
  "BLD_NEST",
  "BLD_WAREHOUSE",
  "BLD_WORKSHOP",
  "BLD_FORAGE",
  "BLD_GREENHOUSE",
  "BLD_WATER",
  "BLD_FISHERY",
  "BLD_WATCH",
  "BLD_CLINIC",
  "BLD_SALVAGE",
  "BLD_GATE",
  "BLD_NEST",
  "BLD_NEST",
  "BLD_NEST",
  "BLD_NEST",
  "BLD_NEST",
  "BLD_NEST",
];
/** 처음부터 서 있는 것: 조달소 · 둥지 3동 · 강변 시설(정수 물레방·강물 양식장)
 *  (MIS_FIRST_NIGHT: "첫 화면은 이미 존재하는 둥지3동과 강변 시설", 조달소는 시작 시 완공) */
export const START_BUILT: readonly number[] = [0, 1, 2, 7, 8, 13];

export interface WorksState {
  readonly sites: Readonly<
    Record<
      SiteId,
      {
        readonly crew: boolean;
        /** 남은 양 (고정 소수점). null = 마르지 않음 */
        readonly left: number | null;
        readonly carry: number;
      }
    >
  >;
  /** 다 지은 부지 번호 */
  readonly built: readonly number[];
  /** 짓는 중: 부지 번호와 쌓인 작업 분 */
  readonly building: readonly {
    readonly plot: number;
    readonly done: number;
  }[];
  /** 건물 생산의 분자 이월 (부지 번호별) */
  readonly outCarry: Readonly<Record<number, number>>;
}

const bad = (): never => {
  throw new Error("일터 정보가 올바르지 않습니다.");
};
const int = (v: unknown, min: number, max: number): number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max
    ? v
    : bad();
const rec = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : bad();

export function createWorks(scale: number): WorksState {
  return {
    sites: Object.fromEntries(
      SITE_IDS.map((id) => {
        const stock = SITE_RULES[id].stock;
        return [
          id,
          {
            crew: false,
            left: stock === null ? null : stock * scale,
            carry: 0,
          },
        ];
      }),
    ) as WorksState["sites"],
    built: [...START_BUILT],
    building: [],
    outCarry: {},
  };
}

/** 저장에서 읽기. 일터가 없던 옛 저장은 건물이 다 서 있던 때라, 모든 부지를 다 지은 것으로 채운다 */
export function parseWorks(value: unknown, scale: number): WorksState {
  if (value === undefined)
    return { ...createWorks(scale), built: PLOTS.map((_, i) => i) };
  const v = rec(value);
  const s = rec(v.sites);
  const sites = Object.fromEntries(
    SITE_IDS.map((id) => {
      const one = rec(s[id]);
      const stock = SITE_RULES[id].stock;
      if (typeof one.crew !== "boolean") bad();
      if ((stock === null) !== (one.left === null)) bad();
      return [
        id,
        {
          crew: one.crew as boolean,
          left: stock === null ? null : int(one.left, 0, stock * scale),
          carry: int(one.carry, 0, Number.MAX_SAFE_INTEGER),
        },
      ];
    }),
  ) as WorksState["sites"];
  if (!Array.isArray(v.built) || !Array.isArray(v.building)) bad();
  const built = (v.built as unknown[]).map((p) => int(p, 0, PLOTS.length - 1));
  const building = (v.building as unknown[]).map((j) => {
    const job = rec(j);
    return {
      plot: int(job.plot, 0, PLOTS.length - 1),
      done: int(job.done, 0, 100_000),
    };
  });
  const seen = new Set([...built, ...building.map((j) => j.plot)]);
  if (seen.size !== built.length + building.length) bad();
  const carry = rec(v.outCarry);
  const outCarry: Record<number, number> = {};
  for (const [k, n] of Object.entries(carry))
    outCarry[int(Number(k), 0, PLOTS.length - 1)] = int(
      n,
      0,
      Number.MAX_SAFE_INTEGER,
    );
  return { sites, built, building, outCarry };
}

/** 지금 일터에 나가 있는 일손 */
export function busyHands(works: WorksState): number {
  return (
    CREW_SIZE *
    (SITE_IDS.filter((id) => works.sites[id].crew).length +
      works.building.length)
  );
}
export const freeHands = (works: WorksState) => WORKFORCE - busyHands(works);

/** 터에 일꾼을 보내거나 불러들임 */
export function setSiteCrew(
  works: WorksState,
  site: SiteId,
  on: boolean,
): WorksState {
  const now = works.sites[site];
  if (!now || now.crew === on) return works;
  if (on && (now.left === 0 || freeHands(works) < CREW_SIZE)) bad();
  return { ...works, sites: { ...works.sites, [site]: { ...now, crew: on } } };
}

/** 그 부지에 지금 공사를 시작할 수 있는지 (자재·일손·이미 지었는지) */
export function canBuild(
  works: WorksState,
  plot: number,
  wood: number,
  metal: number,
  scale: number,
): boolean {
  const type = PLOTS[plot];
  if (!type) return false;
  const rule = BUILD_RULES[type];
  return (
    !works.built.includes(plot) &&
    !works.building.some((j) => j.plot === plot) &&
    freeHands(works) >= CREW_SIZE &&
    wood >= rule.wood * scale &&
    metal >= rule.metal * scale
  );
}

/** 공사 시작: 자재는 호출한 쪽(play.ts)이 뺀다 */
export function startBuild(works: WorksState, plot: number): WorksState {
  return { ...works, building: [...works.building, { plot, done: 0 }] };
}

/** 공사에 드는 작업 분 */
export const buildMinutes = (plot: number) =>
  Math.round(
    BUILD_RULES[PLOTS[plot] as BuildingType].workdays * WORKDAY_MINUTES,
  );

/** 일하는 시각에 흐른 분만큼 진행. 돌려주는 gained = 그동안 들어온 자원 (고정 소수점) */
export function stepWorks(
  works: WorksState,
  minutes: number,
  scale: number,
): { works: WorksState; gained: Partial<Record<ResourceId, number>> } {
  const gained: Partial<Record<ResourceId, number>> = {};
  const add = (id: ResourceId, n: number) => {
    if (n > 0) gained[id] = (gained[id] ?? 0) + n;
  };
  const sites = { ...works.sites };
  for (const id of SITE_IDS) {
    const s = sites[id];
    if (!s.crew) continue;
    const rule = SITE_RULES[id];
    const n = rule.perDay * scale * minutes + s.carry;
    let got = Math.floor(n / WORKDAY_MINUTES);
    let left = s.left;
    if (left !== null) {
      got = Math.min(got, left);
      left -= got;
    }
    add(rule.resource, got);
    // 다 캐면 일꾼이 돌아온다
    sites[id] = {
      crew: left !== 0,
      left,
      carry: left === 0 ? 0 : n % WORKDAY_MINUTES,
    };
  }
  const outCarry = { ...works.outCarry };
  for (const plot of works.built) {
    const rule = BUILD_RULES[PLOTS[plot] as BuildingType];
    if (!("out" in rule)) continue;
    const n = rule.out[1] * scale * minutes + (outCarry[plot] ?? 0);
    add(rule.out[0], Math.floor(n / WORKDAY_MINUTES));
    outCarry[plot] = n % WORKDAY_MINUTES;
  }
  const built = [...works.built];
  const building: { plot: number; done: number }[] = [];
  for (const job of works.building) {
    const done = job.done + minutes;
    if (done >= buildMinutes(job.plot)) built.push(job.plot);
    else building.push({ plot: job.plot, done });
  }
  return { works: { sites, built, building, outCarry }, gained };
}
