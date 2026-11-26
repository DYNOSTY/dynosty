import {
  BOKHOL_FORESTS,
  BOKHOL_MINERALS,
  BOKHOL_WATERS,
  loggingSiteRules,
} from "@dynosty/game-core";
import { RESOURCE_SITES } from "./resource-site-layout.js";

export type ClearCircle = Readonly<{ x: number; z: number; radius: number }>;
export const RESOURCE_CLEAR_RADIUS = 14;
export const FOREST_CLEAR_RADIUS = 13;
// 작업장 지붕과 창고의 바닥 투영을 감싸는 반경.
export const WORKPLACE_CLEAR_RADIUS = 6;

/** 가장자리 흔들림을 제외한, 완전히 걷힌 범위의 포함 여부. */
export function circleContains(outer: ClearCircle, inner: ClearCircle) {
  return (
    Math.hypot(outer.x - inner.x, outer.z - inner.z) + inner.radius <=
    outer.radius
  );
}

export const INITIAL_MINERALS = BOKHOL_MINERALS.filter((site) =>
  site.id.includes("bokhol"),
);
export const INITIAL_FORESTS = BOKHOL_FORESTS.filter(
  (site) => Math.hypot(site.x, site.z) <= 80,
);

/** 자원지와 실제 건설되는 작업장·창고를 감싼다. 같은 원과 이미 포함된 원은 빼 GPU 반복 횟수를 줄인다. */
export function initialClearCircles(): readonly ClearCircle[] {
  const circles: ClearCircle[] = [];
  const add = (circle: ClearCircle) => {
    if (!circles.some((existing) => circleContains(existing, circle)))
      circles.push(circle);
  };
  for (const site of [...INITIAL_MINERALS, ...BOKHOL_WATERS, ...RESOURCE_SITES])
    add({ x: site.x, z: site.z, radius: RESOURCE_CLEAR_RADIUS });
  for (const site of INITIAL_FORESTS)
    add({ x: site.x, z: site.z, radius: FOREST_CLEAR_RADIUS });
  for (const site of [...INITIAL_MINERALS, ...INITIAL_FORESTS]) {
    const rules = loggingSiteRules(site.id);
    for (const plot of [rules.workshopPlot, rules.storagePlot])
      add({ ...plot, radius: WORKPLACE_CLEAR_RADIUS });
  }
  return circles;
}
