import {
  BOKHOL_FORESTS,
  BOKHOL_MINERALS,
  BOKHOL_WATERS,
  loggingSiteRules,
} from "@dynosty/game-core";
import { expect, test } from "vitest";
import { getInitialMistCircles } from "./fog.js";
import {
  circleContains,
  FOREST_CLEAR_RADIUS,
  INITIAL_FORESTS,
  INITIAL_MINERALS,
  RESOURCE_CLEAR_RADIUS,
  WORKPLACE_CLEAR_RADIUS,
} from "./mist-layout.js";
import { RESOURCE_SITES, resourceSiteReach } from "./resource-site-layout.js";
import { fogColorAtDaylight } from "./world.js";

test("복홀 자원과 가까운 숲만 처음부터 걷히고 먼 자원은 제외된다", () => {
  expect(INITIAL_MINERALS.map((s) => s.id)).toEqual([
    "coal-bokhol",
    "iron-bokhol",
    "stone-bokhol-west",
    "stone-bokhol-south",
  ]);
  expect(INITIAL_FORESTS.map((s) => s.id)).toEqual([
    "west",
    "central",
    "north",
    "east",
    "south",
    "ring-northwest",
    "ring-northeast",
    "ring-southwest",
    "ring-east",
  ]);
  const circles = getInitialMistCircles();
  const requested = [
    ...[...INITIAL_MINERALS, ...BOKHOL_WATERS, ...RESOURCE_SITES].map((s) => ({
      x: s.x,
      z: s.z,
      radius: RESOURCE_CLEAR_RADIUS,
    })),
    ...INITIAL_FORESTS.map((s) => ({
      x: s.x,
      z: s.z,
      radius: FOREST_CLEAR_RADIUS,
    })),
    ...[...INITIAL_MINERALS, ...INITIAL_FORESTS].flatMap((s) => {
      const rules = loggingSiteRules(s.id);
      return [rules.workshopPlot, rules.storagePlot].map((p) => ({
        ...p,
        radius: WORKPLACE_CLEAR_RADIUS,
      }));
    }),
  ];
  const expected = requested.filter(
    (circle, i) =>
      !requested.slice(0, i).some((other) => circleContains(other, circle)),
  );
  expect(circles).toHaveLength(expected.length);
  for (const site of [...INITIAL_MINERALS, ...BOKHOL_WATERS, ...RESOURCE_SITES])
    expect(
      circles.some((c) =>
        circleContains(c, { ...site, radius: RESOURCE_CLEAR_RADIUS }),
      ),
    ).toBe(true);
  for (const site of INITIAL_FORESTS)
    expect(
      circles.some((c) =>
        circleContains(c, { ...site, radius: FOREST_CLEAR_RADIUS }),
      ),
    ).toBe(true);
  for (const site of [
    ...BOKHOL_MINERALS.filter((s) => !s.id.includes("bokhol")),
    ...BOKHOL_FORESTS.filter((s) => Math.hypot(s.x, s.z) > 80),
  ])
    expect(circles.some((c) => circleContains(c, { ...site, radius: 0 }))).toBe(
      false,
    );
});

test("나무와 자원 터 모델, 건설할 작업장과 창고의 범위가 걷힌다", () => {
  const circles = getInitialMistCircles();
  for (const forest of INITIAL_FORESTS) {
    // 나무 중심의 난수 오프셋 ±0.8, ±1.1까지 포함한다.
    expect(Math.hypot(7.8, 10.1)).toBeLessThan(FOREST_CLEAR_RADIUS);
    expect(
      circles.some((c) =>
        circleContains(c, { ...forest, radius: FOREST_CLEAR_RADIUS }),
      ),
    ).toBe(true);
  }
  for (const site of RESOURCE_SITES)
    expect(
      circles.some((c) =>
        circleContains(c, {
          x: site.x,
          z: site.z,
          radius: resourceSiteReach(site, site),
        }),
      ),
    ).toBe(true);
  for (const site of [...INITIAL_MINERALS, ...INITIAL_FORESTS]) {
    const { workshopPlot, storagePlot } = loggingSiteRules(site.id);
    for (const plot of [workshopPlot, storagePlot])
      expect(
        circles.some((c) =>
          circleContains(c, { ...plot, radius: WORKPLACE_CLEAR_RADIUS }),
        ),
      ).toBe(true);
  }
  expect(WORKPLACE_CLEAR_RADIUS).toBeGreaterThan(Math.hypot(4.5, 3.5));
});

test("낮과 자정의 안개색은 원본 낮 색과 어두운 색이다", () => {
  const color = [0.6, 0.66, 0.77];
  expect(fogColorAtDaylight(color, 1)).toEqual(color);
  expect(fogColorAtDaylight(color, 0)).toEqual(
    color.map((v, i) => v * [0.3, 0.34, 0.5][i]!),
  );
});
