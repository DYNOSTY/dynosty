import {
  BOKHOL_FORESTS,
  BOKHOL_MAP,
  BOKHOL_MINERALS,
  bokholElevation,
} from "./bokhol.js";
import { loggingSiteRules, loggingSites, productionSites } from "./logging.js";
import { AMOUNT_SCALE } from "./play.js";
import {
  type GroundObstacle,
  type GroundPoint,
  residentPath,
} from "./resident-path.js";
import type { TimberState } from "./timber.js";

export interface HomePlacement {
  readonly position: GroundPoint;
  readonly headingRadians: number;
}
export const HOME_PLACEMENT_RULES = {
  halfWidth: 1.65,
  halfDepth: 1.5,
  rotationStep: Math.PI / 12,
  flatTolerance: 0.12,
  maxBuilders: 3,
} as const;
export const roundGround = (n: number) => Math.round(n * 1e6) / 1e6;
export const homeEntrance = (p: HomePlacement): GroundPoint => ({
  x: roundGround(p.position.x + Math.sin(p.headingRadians) * 2.2),
  z: roundGround(p.position.z + Math.cos(p.headingRadians) * 2.2),
});
export const homeWorkPosition = (p: HomePlacement, slot: number) =>
  rotatedPoint(p, (slot - 1) * 1.6, 2.4);
export function homeWorkSlots(s: TimberState, p: HomePlacement): number[] {
  const obstacles = [...s.homes.map(homeObstacle), { x: 4.5, z: 2.8 }];
  return [1, 0, 2].filter((slot) => {
    const q = homeWorkPosition(p, slot);
    return residentPath(q, q, obstacles).length > 0;
  });
}
export function rotatedPoint(
  p: HomePlacement,
  x: number,
  z: number,
): GroundPoint {
  return {
    x:
      p.position.x +
      x * Math.cos(p.headingRadians) +
      z * Math.sin(p.headingRadians),
    z:
      p.position.z -
      x * Math.sin(p.headingRadians) +
      z * Math.cos(p.headingRadians),
  };
}
type Rectangle = HomePlacement & { halfWidth: number; halfDepth: number };
export function rectanglesOverlap(a: Rectangle, b: Rectangle): boolean {
  const corners = (r: Rectangle) =>
    [-1, 1].flatMap((x) =>
      [-1, 1].map((z) => rotatedPoint(r, x * r.halfWidth, z * r.halfDepth)),
    );
  const ac = corners(a),
    bc = corners(b);
  for (const angle of [a.headingRadians, b.headingRadians])
    for (const [x, z] of [
      [Math.cos(angle), -Math.sin(angle)],
      [Math.sin(angle), Math.cos(angle)],
    ] as const) {
      const ap = ac.map((p) => p.x * x + p.z * z),
        bp = bc.map((p) => p.x * x + p.z * z);
      if (
        Math.max(...ap) < Math.min(...bp) ||
        Math.max(...bp) < Math.min(...ap)
      )
        return false;
    }
  return true;
}
export function pointInHome(
  p: GroundPoint,
  pose: HomePlacement,
  margin = 0,
): boolean {
  const dx = p.x - pose.position.x,
    dz = p.z - pose.position.z;
  return (
    Math.abs(
      dx * Math.cos(pose.headingRadians) - dz * Math.sin(pose.headingRadians),
    ) <=
      HOME_PLACEMENT_RULES.halfWidth + margin &&
    Math.abs(
      dx * Math.sin(pose.headingRadians) + dz * Math.cos(pose.headingRadians),
    ) <=
      HOME_PLACEMENT_RULES.halfDepth + margin
  );
}
export function homePlacementIssue(
  s: TimberState,
  p: HomePlacement,
): string | null {
  if (
    !p?.position ||
    ![p.position.x, p.position.z, p.headingRadians].every(Number.isFinite) ||
    p.headingRadians < 0 ||
    p.headingRadians >= Math.PI * 2
  )
    return "건물 위치와 방향을 확인해 주세요.";
  const rect = {
    ...p,
    halfWidth: HOME_PLACEMENT_RULES.halfWidth + 0.2,
    halfDepth: HOME_PLACEMENT_RULES.halfDepth + 0.2,
  };
  const samples = [
    { ...p.position },
    ...[-1, 0, 1].flatMap((x) =>
      [-1, 0, 1].map((z) =>
        rotatedPoint(p, x * rect.halfWidth, z * rect.halfDepth),
      ),
    ),
  ];
  if (
    samples.some(
      (q) =>
        Math.abs(q.x) > BOKHOL_MAP.coordinateLimit ||
        Math.abs(q.z) > BOKHOL_MAP.coordinateLimit,
    )
  )
    return "지도 밖에는 건설할 수 없어요.";
  if (s.construction) return "진행 중인 공사를 먼저 마쳐 주세요.";
  if (s.homes.length >= BOKHOL_MAP.maxHomes)
    return "현재 마을의 둥지 수 한도에 도달했어요.";
  if (
    s.homes.some((h) =>
      rectanglesOverlap(rect, {
        position: h.position,
        headingRadians: h.headingRadians ?? Math.PI,
        halfWidth: 1.85,
        halfDepth: 1.7,
      }),
    )
  )
    return "다른 건물과 겹치는 자리예요.";
  if (
    s.homes.some((h) =>
      pointInHome(
        homeEntrance({
          position: h.position,
          headingRadians: h.headingRadians ?? Math.PI,
        }),
        p,
        0.5,
      ),
    )
  )
    return "이웃 둥지의 출입구를 막는 자리예요.";
  const entrance = homeEntrance(p);
  if (
    !residentPath(entrance, entrance, s.homes.map(homeObstacle)).length ||
    !homeWorkSlots(s, p).length
  )
    return "둥지 입구와 공사할 공간을 비워 주세요.";
  const overlaps = (position: GroundPoint, w: number, d: number) =>
    rectanglesOverlap(rect, {
      position,
      headingRadians: 0,
      halfWidth: w,
      halfDepth: d,
    });
  if (
    overlaps({ x: 4.5, z: 2.8 }, 3, 3) ||
    (s.restaurantBuilt && overlaps({ x: -4.3, z: 6 }, 4.6, 5))
  )
    return "시설이나 자재 작업 공간과 겹쳐요.";
  for (const l of productionSites(s)) {
    const r = loggingSiteRules(l.siteId);
    if (
      (l.built && overlaps(r.workshop, 4.5, 3.5)) ||
      (l.storageBuilt &&
        overlaps({ x: r.storage.x - 3, z: r.storage.z }, 2.5, 3))
    )
      return "작업장이나 저장소와 겹쳐요.";
  }
  for (const f of BOKHOL_FORESTS)
    if (
      loggingSites(s).find((l) => l.siteId === f.id)?.remaining !== 0 &&
      overlaps(f, 9.5, 11.5)
    )
      return "아직 숲이 남아 있는 자리예요.";
  if (
    BOKHOL_MINERALS.some(
      (m) => Math.hypot(p.position.x - m.x, p.position.z - m.z) < 24,
    )
  )
    return "광맥과 채굴 구역에는 둥지를 지을 수 없어요.";
  const amounts = Object.fromEntries(
    loggingSites(s).map((l) => [l.siteId, l.remaining]),
  );
  const heights = samples.map((q) => bokholElevation(q.x, q.z, amounts));
  if (
    Math.max(...heights) - Math.min(...heights) >
    HOME_PLACEMENT_RULES.flatTolerance
  )
    return "건물 바닥 전체가 평평한 자리를 골라 주세요.";
  if (
    s.residents.some(
      (r) =>
        r.health !== "dead" && !r.insideHome && pointInHome(r.position, p, 0.6),
    )
  )
    return "주민이 있는 자리예요. 이동한 뒤 배치해 주세요.";
  if (
    s.world.resources.RES_WOOD - s.reservedWood * AMOUNT_SCALE <
    20 * AMOUNT_SCALE
  )
    return "건설에 필요한 공동 목재20이 부족해요.";
  return null;
}
export const homeObstacle = (h: {
  position: GroundPoint;
  headingRadians?: number;
}): GroundObstacle => ({
  ...h.position,
  headingRadians: h.headingRadians ?? Math.PI,
});
