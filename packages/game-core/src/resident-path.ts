export type GroundPoint = { x: number; z: number };
export type GroundObstacle = GroundPoint & {
  headingRadians?: number;
  halfWidth?: number;
  halfDepth?: number;
};

// shortcut: 현재 개발 건물의 바닥과 주민 여유 폭. 건물별 크기가 달라지면 충돌 외곽을 모델 정의에서 받는다.
const CLEARANCE = 1.75;

type Box = {
  point: GroundObstacle;
  cos: number;
  sin: number;
  halfWidth: number;
  halfDepth: number;
  reach: number;
};
// Every resident in the same minute walks around the same obstacle list, so the
// rotated boxes are prepared once per list instead of once per path request.
const prepared = new WeakMap<readonly GroundObstacle[], readonly Box[]>();
function boxesOf(buildings: readonly GroundObstacle[]): readonly Box[] {
  let boxes = prepared.get(buildings);
  if (!boxes || boxes.length !== buildings.length) {
    boxes = buildings.map((p) => ({
      point: p,
      cos: Math.cos(p.headingRadians ?? 0),
      sin: Math.sin(p.headingRadians ?? 0),
      halfWidth: p.halfWidth ?? CLEARANCE,
      halfDepth: p.halfDepth ?? CLEARANCE,
      // Conservative world-space extent for every rotation, including edge contact.
      reach: (p.halfWidth ?? CLEARANCE) + (p.halfDepth ?? CLEARANCE) + 1e-8,
    }));
    prepared.set(buildings, boxes);
  }
  return boxes;
}

export function residentPath(
  start: GroundPoint,
  goal: GroundPoint,
  buildings: readonly GroundObstacle[],
  narrow = true,
): GroundPoint[] {
  const boxes = boxesOf(buildings);
  const world = (x: number, z: number, b: Box) => ({
    x: b.point.x + x * b.cos + z * b.sin,
    z: b.point.z - x * b.sin + z * b.cos,
  });
  const inside = (p: GroundPoint) =>
    boxes.some((b) => {
      const dx = p.x - b.point.x,
        dz = p.z - b.point.z;
      if (Math.abs(dx) > b.reach || Math.abs(dz) > b.reach) return false;
      return (
        Math.abs(dx * b.cos - dz * b.sin) <= b.halfWidth &&
        Math.abs(dx * b.sin + dz * b.cos) <= b.halfDepth
      );
    });
  if (inside(start) || inside(goal)) return [];
  const intersects = (a: GroundPoint, b: GroundPoint, box: Box) => {
    const ax = a.x - box.point.x,
      az = a.z - box.point.z,
      bx = b.x - box.point.x,
      bz = b.z - box.point.z;
    if (
      (ax > box.reach && bx > box.reach) ||
      (ax < -box.reach && bx < -box.reach) ||
      (az > box.reach && bz > box.reach) ||
      (az < -box.reach && bz < -box.reach)
    )
      return false;
    const fromX = ax * box.cos - az * box.sin,
      fromZ = ax * box.sin + az * box.cos,
      toX = bx * box.cos - bz * box.sin,
      toZ = bx * box.sin + bz * box.cos;
    let enter = 0,
      leave = 1;
    for (let axis = 0; axis < 2; axis++) {
      const origin = axis ? fromZ : fromX,
        delta = axis ? toZ - fromZ : toX - fromX,
        clearance = axis ? box.halfDepth : box.halfWidth;
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
  };
  const blocked = (a: GroundPoint, b: GroundPoint) =>
    boxes.some((box) => intersects(a, b, box));
  // A shortest route around a subset remains shortest if every segment also clears the other buildings.
  if (narrow && boxes.length > 24) {
    const included = new Set<GroundObstacle>();
    let route = [goal];
    while (route.length) {
      const previous = included.size;
      let from = start;
      for (const to of route) {
        for (const box of boxes)
          if (!included.has(box.point) && intersects(from, to, box))
            included.add(box.point);
        from = to;
      }
      if (included.size === previous) return route;
      route = residentPath(
        start,
        goal,
        buildings.filter((b) => included.has(b)),
        false,
      );
    }
    return [];
  }
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
