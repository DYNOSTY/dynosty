export type MarkerRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};
/** 같은 프레임의 앞선 표지를 피해 가장 가까운 세로 위치를 고른다. */
export function placeMarker(
  x: number,
  y: number,
  width: number,
  height: number,
  viewWidth: number,
  viewHeight: number,
  occupied: MarkerRect[],
): MarkerRect | null {
  if (width > viewWidth || height > viewHeight) return null;
  const left = Math.max(0, Math.min(viewWidth - width, x - width / 2)),
    ideal = y - height;
  const candidates = [
    Math.max(0, Math.min(viewHeight - height, ideal)),
    ...occupied.flatMap((r) => [r.top - height - 3, r.top + r.height + 3]),
  ]
    .filter((top) => top >= 0 && top + height <= viewHeight)
    .sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal));
  for (const top of candidates) {
    const r = { left, top, width, height };
    if (
      occupied.every(
        (b) =>
          r.left + r.width + 2 <= b.left ||
          b.left + b.width + 2 <= r.left ||
          r.top + r.height + 2 <= b.top ||
          b.top + b.height + 2 <= r.top,
      )
    )
      return r;
  }
  return null;
}
