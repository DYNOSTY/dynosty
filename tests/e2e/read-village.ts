import type { Page } from "@playwright/test";
import type { TimberState } from "../../packages/game-core/dist/index.js";

// Playwright runs this function inside the browser.
export function readVillage(key = "dynosty.village.resume"): TimberState {
  const raw = localStorage.getItem(key);
  if (raw === null) throw Error(`저장 기록이 없습니다. ${key}`);
  return JSON.parse(raw).state;
}

// Long campaign scenarios move the simulation clock at the worker boundary.
export const advanceVillageDay = (page: Page) =>
  advanceVillageMinutes(page, 1440);
export async function advanceVillageMinutes(page: Page, minutes: number) {
  const worker = page.workers().find((w) => w.url().includes("timber.worker"));
  if (!worker) throw Error("마을 시계를 찾을 수 없습니다.");
  await worker.evaluate(
    (step) =>
      self.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "command",
            id: crypto.randomUUID(),
            command: { type: "advance", minutes: step },
          },
        }),
      ),
    minutes,
  );
}
