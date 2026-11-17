import type { CrewJob, LaborState } from "@dynosty/game-core";
export const CREW_BADGES: Record<CrewJob, string> = {
  idle: "○ 대기",
  carrier: "↔ 운송·검사",
  exchange: "⇄ 교환·재검수",
  repair: "＋ 보완",
  prep: "▰ 배급",
};
export function cartBadge(s: LaborState) {
  const e = s.exchange.phase;
  if (e === "returning") return "← 불량품 회수 4";
  if (e === "delivering") return "→ 교환품 재납품 4";
  if (e === "reserved") return "○ 회수 출발 대기";
  if (e !== "none" || s.timber.phase !== "transport") return null;
  return "→ 원납품 운송 20";
}
