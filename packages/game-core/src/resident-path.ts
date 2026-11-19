export type GroundPoint = { x: number; z: number };
export type GroundObstacle = GroundPoint & {
  headingRadians?: number;
  halfWidth?: number;
  halfDepth?: number;
};

// shortcut: 현재 개발 건물의 바닥과 주민 여유 폭. 건물별 크기가 달라지면 충돌 외곽을 모델 정의에서 받는다.
const CLEARANCE = 1.75;

export function residentPath(
  start: GroundPoint,
  goal: GroundPoint,
  buildings: readonly GroundObstacle[],
): GroundPoint[] {
  const boxes = buildings.map((p) => ({
    point: p,
    angle: p.headingRadians ?? 0,
  }));
  const local = (p: GroundPoint, b: (typeof boxes)[number]) => ({
    x:
      (p.x - b.point.x) * Math.cos(b.angle) -
      (p.z - b.point.z) * Math.sin(b.angle),
    z:
      (p.x - b.point.x) * Math.sin(b.angle) +
      (p.z - b.point.z) * Math.cos(b.angle),
  });
  const world = (x: number, z: number, b: (typeof boxes)[number]) => ({
    x: b.point.x + x * Math.cos(b.angle) + z * Math.sin(b.angle),
    z: b.point.z - x * Math.sin(b.angle) + z * Math.cos(b.angle),
  });
  const inside = (p: GroundPoint) =>
    boxes.some((b) => {
      const q = local(p, b);
      return (
        Math.abs(q.x) <= (b.point.halfWidth ?? CLEARANCE) &&
        Math.abs(q.z) <= (b.point.halfDepth ?? CLEARANCE)
      );
    });
  if (inside(start) || inside(goal)) return [];
  const blocked = (a: GroundPoint, b: GroundPoint) =>
    boxes.some((box) => {
      const from = local(a, box),
        to = local(b, box);
      let enter = 0,
        leave = 1;
      for (const [origin, delta, clearance] of [
        [from.x, to.x - from.x, box.point.halfWidth ?? CLEARANCE],
        [from.z, to.z - from.z, box.point.halfDepth ?? CLEARANCE],
      ] as const) {
        if (Math.abs(delta) < 1e-9) {
          if (origin < -clearance || origin > clearance) return false;
        } else {
          const t1 = (-clearance - origin) / delta,
            t2 = (clearance - origin) / delta;
          enter = Math.max(enter, Math.min(t1, t2));
          leave = Math.min(leave, Math.max(t1, t2));
          if (enter > leave) return false;
        }
      }
      return true;
    });
  if (!blocked(start, goal)) return [{ ...goal }];
  const nodes = [
    start,
    goal,
    ...boxes
      .flatMap((b) =>
        [-1, 1].flatMap((x) =>
          [-1, 1].map((z) =>
            world(
              x * ((b.point.halfWidth ?? CLEARANCE) + 0.05),
              z * ((b.point.halfDepth ?? CLEARANCE) + 0.05),
              b,
            ),
          ),
        ),
      )
      .filter((p) => !inside(p)),
  ];
  type RouteNode = {
    point: GroundPoint;
    distance: number;
    previous: RouteNode | null;
    visited: boolean;
  };
  const routes: RouteNode[] = nodes.map((point) => ({
    point,
    distance: point === start ? 0 : Infinity,
    previous: null,
    visited: false,
  }));
  while (true) {
    let current: RouteNode | null = null;
    for (const node of routes)
      if (!node.visited && (!current || node.distance < current.distance))
        current = node;
    if (!current || !Number.isFinite(current.distance)) return [];
    if (current.point === goal) {
      const path: GroundPoint[] = [];
      for (
        let node: RouteNode | null = current;
        node?.previous;
        node = node.previous
      )
        path.unshift({ ...node.point });
      return path;
    }
    current.visited = true;
    for (const node of routes) {
      if (node.visited || blocked(current.point, node.point)) continue;
      const candidate =
        current.distance +
        Math.hypot(
          node.point.x - current.point.x,
          node.point.z - current.point.z,
        );
      if (candidate < node.distance) {
        node.distance = candidate;
        node.previous = current;
      }
    }
  }
}

export function moveOnGround(
  from: GroundPoint,
  to: GroundPoint,
  minutes: number,
  speed: number,
  obstacles: readonly GroundObstacle[],
): GroundPoint {
  let position = { ...from },
    budget = minutes * speed;
  for (const point of residentPath(from, to, obstacles)) {
    const length = Math.hypot(point.x - position.x, point.z - position.z);
    if (length > budget)
      return {
        x: position.x + ((point.x - position.x) * budget) / length,
        z: position.z + ((point.z - position.z) * budget) / length,
      };
    position = { ...point };
    budget -= length;
  }
  return position;
}
