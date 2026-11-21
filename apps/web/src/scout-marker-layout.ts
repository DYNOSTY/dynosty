type Bounds = { left: number; top: number; right: number; bottom: number };
type Pin = { x: number; y: number; width: number; height: number };

const gap = 8;
export const scoutPinAnchorY = 0.9;
const clamp = (n: number, low: number, high: number) =>
  Math.max(low, Math.min(n, high));
const intersects = (a: Bounds, b: Bounds) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

function placePins(
  pins: Pin[],
  view: Bounds,
  hud: Bounds[],
  preferred: boolean,
) {
  const occupied = [...hud];
  const positions = [];
  for (const { x, y, width, height } of pins) {
    const half = width / 2;
    const up = height * scoutPinAnchorY;
    const down = height - up;
    const x0 = view.left + half;
    const x1 = view.right - half;
    const y0 = Math.max(view.top + up, preferred ? 94 : 0);
    const y1 = Math.min(
      view.bottom - down,
      preferred ? view.bottom - 206 : view.bottom,
    );
    if (x0 > x1 || y0 > y1) return null;

    // Project to the edge before resolving collisions so off-screen sites retain direction.
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const dx = x - cx;
    const dy = y - cy;
    const t = Math.min(
      1,
      dx ? (x1 - x0) / 2 / Math.abs(dx) : 1,
      dy ? (y1 - y0) / 2 / Math.abs(dy) : 1,
    );
    const px = clamp(cx + dx * t, x0, x1);
    const py = clamp(cy + dy * t, y0, y1);
    const xs = [px, x0, x1];
    const ys = [py, y0, y1];
    for (const rect of occupied) {
      xs.push(rect.left - half - gap, rect.right + half + gap);
      ys.push(rect.top - down - gap, rect.bottom + up + gap);
    }
    let best: { x: number; y: number; box: Bounds } | undefined;
    let nearest = Infinity;
    for (const ix of xs) {
      if (ix < x0 || ix > x1) continue;
      for (const iy of ys) {
        if (iy < y0 || iy > y1) continue;
        const distance = (ix - px) ** 2 + (iy - py) ** 2;
        if (distance >= nearest) continue;
        const box = {
          left: ix - half,
          top: iy - up,
          right: ix + half,
          bottom: iy + down,
        };
        if (
          occupied.some((rect) =>
            intersects(rect, {
              left: box.left - gap + 0.01,
              right: box.right + gap - 0.01,
              top: box.top - gap + 0.01,
              bottom: box.bottom + gap - 0.01,
            }),
          )
        )
          continue;
        best = { x: ix, y: iy, box };
        nearest = distance;
      }
    }
    if (!best) return null;
    occupied.push(best.box);
    positions.push({
      x: best.x,
      y: best.y,
      edge: t < 1,
      direction: Math.atan2(dy, dx),
    });
  }
  return positions;
}

// Subtract HUD rectangles, retaining horizontal and vertical strips. Overlap
// between strips is fine: only one is used for the scrollable list.
function dockSpace(view: Bounds, hud: Bounds[]) {
  let free = [view];
  for (const hudRect of hud) {
    free = free.flatMap((rect) => {
      if (!intersects(rect, hudRect)) return [rect];
      return [
        { ...rect, right: hudRect.left },
        { ...rect, left: hudRect.right },
        { ...rect, bottom: hudRect.top },
        { ...rect, top: hudRect.bottom },
      ].filter((r) => r.left < r.right && r.top < r.bottom);
    });
  }
  const area = (r: Bounds) => (r.right - r.left) * (r.bottom - r.top);
  // Leave room to hit the controls and scroll, not just a positive sliver.
  const minDockSize = 32;
  return free
    .filter(
      (r) => r.right - r.left >= minDockSize && r.bottom - r.top >= minDockSize,
    )
    .sort((a, b) => area(b) - area(a))[0];
}

export function layoutScoutMarkers(
  pins: Pin[],
  width: number,
  height: number,
  hud: Bounds[],
) {
  const view = {
    left: gap,
    top: gap,
    right: width - gap,
    bottom: height - gap,
  };
  const positions =
    placePins(pins, view, hud, true) ?? placePins(pins, view, hud, false);
  if (positions) return { mode: "projected" as const, positions };
  const dock = dockSpace(view, hud);
  if (dock) return { mode: "docked" as const, dock };
  return { mode: "no-space" as const };
}
