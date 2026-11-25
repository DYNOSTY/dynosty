import {
  BOKHOL_FORESTS,
  BOKHOL_MAP,
  BOKHOL_MINERALS,
  constructionPlot,
  inBokholForest,
} from "./bokhol.js";
import { findById } from "./lookup.js";
import {
  AMOUNT_SCALE,
  type Citizen,
  type FoodId,
  type ResourceId,
} from "./play.js";
import type { GroundPoint } from "./resident-path.js";
export type RationPolicy = "needs" | "cap";
export const VILLAGE_RULES = {
  maxRestaurantStaff: 6,
  homeSpace: 20,
  constructionWood: 50,
  constructionMinutes: 30,
  species: {
    R02: { food: "RES_PLANT", portion: 50000, space: 2 },
    R03: { food: "RES_MEAT", portion: 25000, space: 1 },
    SPINO: { food: "RES_FISH", portion: 50000, space: 2 },
  },
} as const;
const startingPlots: GroundPoint[] = [
  { x: -6, z: -2 },
  { x: -10, z: -8 },
  { x: -4, z: -10 },
  { x: 4, z: -10 },
  { x: 10, z: -4 },
  { x: 10, z: 6 },
  { x: -12, z: 12 },
  { x: -4, z: 14 },
  { x: 4, z: 14 },
  { x: 12, z: 14 },
  { x: -16, z: -4 },
  { x: 18, z: -6 },
  { x: -18, z: 6 },
  { x: -16, z: -14 },
  { x: -8, z: -16 },
  { x: 0, z: -16 },
  { x: 8, z: -16 },
  { x: 18, z: 4 },
];
// 주거 후보지와 초기 주민 배치에 쓰는 목록. 건설 격자는 지도 전체에 이어진다.
export const HOME_PLOTS: readonly GroundPoint[] = (() => {
  const plots = [
    ...startingPlots,
    { x: -40, z: -8 },
    { x: -40, z: 0 },
    ...BOKHOL_FORESTS.slice(1).map(constructionPlot),
  ];
  const candidates: GroundPoint[] = [];
  for (let x = -64; x <= 64; x += 8)
    for (let z = -64; z <= 64; z += 8) candidates.push({ x, z });
  candidates.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  for (const p of candidates) {
    if (plots.length >= BOKHOL_MAP.maxHomes) break;
    if (
      inBokholForest(p) ||
      BOKHOL_MINERALS.some((m) => Math.hypot(p.x - m.x, p.z - m.z) < 27) ||
      BOKHOL_FORESTS.some(
        (f) =>
          p.x >= f.x + 7 &&
          p.x <= f.x + 22 &&
          p.z >= f.z - 7 &&
          p.z <= f.z + 17,
      ) ||
      (p.x >= -33 && p.x <= -19 && p.z >= -14 && p.z <= 8) ||
      (p.x >= -13 && p.x <= 1 && p.z >= 1 && p.z <= 14) ||
      (p.x >= 0 && p.x <= 10 && p.z >= -2 && p.z <= 8) ||
      plots.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 7)
    )
      continue;
    plots.push(p);
  }
  return plots;
})();
export interface VillageHome {
  readonly id: string;
  readonly position: GroundPoint;
  readonly capacity: number;
  readonly priceVersion?: 2 | 3 | 4;
  readonly timberCost?: number;
  readonly level?: 1 | 2 | 3;
  readonly headingRadians?: number;
}
export function nextDwellingId(homes: readonly VillageHome[]) {
  let number = homes.length + 1;
  while (homes.some((h) => h.id === `dwelling-${number}`)) number++;
  return `dwelling-${number}`;
}
export const initialHomes = (): VillageHome[] =>
  HOME_PLOTS.slice(0, 6).map((position, i) => ({
    id: i === 0 ? "example-building-1" : `dwelling-${i + 1}`,
    position: { ...position },
    capacity: VILLAGE_RULES.homeSpace,
  }));
export function speciesRule(species: string) {
  const rule =
    VILLAGE_RULES.species[species as keyof typeof VILLAGE_RULES.species];
  if (!rule) throw new RangeError("지원하지 않는 주민 종류입니다.");
  return rule;
}
interface HousedResident {
  readonly id: string;
  readonly homeId: string | null;
  readonly home: GroundPoint | null;
  readonly insideHome: boolean;
  readonly homeSlot?: number | null;
}
export function assignHomes<T extends HousedResident>(
  residents: readonly T[],
  citizens: readonly Citizen[],
  homes: readonly VillageHome[],
): T[] {
  const occupied = new Map(homes.map((h) => [h.id, new Set<number>()]));
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  const entrance = (h: VillageHome) => ({
    x: round(h.position.x + Math.sin(h.headingRadians ?? Math.PI) * 2.2),
    z: round(h.position.z + Math.cos(h.headingRadians ?? Math.PI) * 2.2),
  });
  const fit = (h: VillageHome, space: number, slot: number) =>
    slot >= 0 &&
    slot + space <= h.capacity &&
    Array.from({ length: space }, (_, i) => slot + i).every(
      (i) => !occupied.get(h.id)?.has(i),
    );
  const reserve = (h: VillageHome, space: number, slot: number) => {
    for (let i = 0; i < space; i++) occupied.get(h.id)?.add(slot + i);
  };
  const retained = residents.map((r) => {
    const c = citizens.find((c) => c.id === r.id),
      h = homes.find((h) => h.id === r.homeId);
    if (!c) throw new RangeError("주민 등록이 없습니다.");
    const space = speciesRule(c.species).space;
    if (
      c.alive &&
      !c.mechanicalFrom &&
      h &&
      typeof r.homeSlot === "number" &&
      Number.isInteger(r.homeSlot) &&
      fit(h, space, r.homeSlot)
    ) {
      reserve(h, space, r.homeSlot);
      return { ...r, home: entrance(h) };
    }
    return {
      ...r,
      homeId: null,
      home: null,
      homeSlot: null,
      insideHome: false,
    };
  });
  return retained.map((r, index) => {
    const c = citizens.find((c) => c.id === r.id);
    if (!c?.alive || c.mechanicalFrom || r.homeId) return r;
    const previous = residents[index],
      space = speciesRule(c.species).space;
    const options = [...homes].sort(
      (a, b) =>
        Number(b.id === previous?.homeId) - Number(a.id === previous?.homeId) ||
        (occupied.get(a.id)?.size ?? 0) - (occupied.get(b.id)?.size ?? 0) ||
        a.id.localeCompare(b.id),
    );
    for (const h of options) {
      for (let slot = 0; slot + space <= h.capacity; slot++)
        if (fit(h, space, slot)) {
          reserve(h, space, slot);
          const home = entrance(h);
          return {
            ...r,
            homeId: h.id,
            homeSlot: slot,
            home,
            insideHome:
              previous?.insideHome === true &&
              previous.homeId === h.id &&
              previous.home?.x === home.x &&
              previous.home?.z === home.z,
          };
        }
    }
    return r;
  });
}
export function homeUsage(
  homeId: string,
  residents: readonly HousedResident[],
  citizens: readonly Citizen[],
): number {
  return residents
    .filter((r) => r.homeId === homeId)
    .reduce((sum, r) => {
      const c = findById(citizens, r.id);
      return sum + (c?.alive ? speciesRule(c.species).space : 0);
    }, 0);
}
export interface MealPlan {
  readonly amount: number;
  readonly foods: Readonly<Partial<Record<FoodId, number>>>;
  readonly relief: number;
}
export function mealPlan(
  citizen: Citizen,
  policy: RationPolicy,
  used: number,
  resources: Readonly<Record<ResourceId, number>>,
): MealPlan {
  if (citizen.mechanicalFrom) return { amount: 0, foods: {}, relief: 0 };
  const rule = speciesRule(citizen.species),
    portion = policy === "cap" ? 25000 : rule.portion;
  let remaining = Math.max(0, Math.min(portion, portion * 4 - used));
  const foods: Partial<Record<FoodId, number>> = {};
  const choices: FoodId[] =
    citizen.diet === "RES_PLANT"
      ? ["RES_PLANT"]
      : citizen.diet === "RES_MEAT"
        ? ["RES_MEAT", "RES_FISH"]
        : ["RES_FISH", "RES_MEAT"];
  for (const food of choices) {
    const amount = Math.min(remaining, resources[food]);
    if (amount > 0) foods[food] = amount;
    remaining -= amount;
  }
  if (remaining > 0 || portion * 4 - used < portion)
    return { amount: 0, foods: {}, relief: 0 };
  const amount = Object.values(foods).reduce((a, b) => a + b, 0);
  return { amount, foods, relief: 7200 };
}
export const rationLimit = (species: string, policy: RationPolicy) =>
  (policy === "cap" ? 25000 : speciesRule(species).portion) * 4;
export const formatRation = (amount: number) => String(amount / AMOUNT_SCALE);
