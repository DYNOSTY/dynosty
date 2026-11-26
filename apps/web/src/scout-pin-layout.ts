import type { MarkerRect } from "./marker-layout.js";

/** 같은 x에서 아래쪽부터 빈 자리를 찾고, 없으면 위쪽을 찾는다. */
export function placeScoutPin(
  rect: MarkerRect,
  minTop: number,
  maxBottom: number,
  occupied: MarkerRect[],
): MarkerRect | null {
  const gap = 3;
  const maxTop = maxBottom - rect.height;
  if (maxTop < minTop) return null;
  const ideal = Math.max(minTop, Math.min(maxTop, rect.top));
  const candidates = [
    ideal,
    ...occupied.flatMap((other) => [
      other.top + other.height + gap,
      other.top - rect.height - gap,
    ]),
  ].filter((top) => top >= minTop && top <= maxTop);
  candidates.sort((a, b) => {
    const aAbove = a < ideal;
    const bAbove = b < ideal;
    return aAbove === bAbove
      ? Math.abs(a - ideal) - Math.abs(b - ideal)
      : aAbove
        ? 1
        : -1;
  });
  for (const top of candidates) {
    const candidate = { ...rect, top };
    if (
      occupied.every(
        (other) =>
          candidate.left + candidate.width + gap <= other.left ||
          other.left + other.width + gap <= candidate.left ||
          candidate.top + candidate.height + gap <= other.top ||
          other.top + other.height + gap <= candidate.top,
      )
    )
      return candidate;
  }
  return null;
}
