import type { TimberState } from "../../packages/game-core/dist/index.js";

// Playwright runs this function inside the browser.
export function readVillage(key = "dynosty.village.resume"): TimberState {
  const raw = localStorage.getItem(key);
  if (raw === null) throw Error("저장 기록이 없습니다. " + key);
  return JSON.parse(raw).state;
}
