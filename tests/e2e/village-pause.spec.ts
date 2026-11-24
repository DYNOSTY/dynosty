import { expect, type Page, test } from "@playwright/test";
import {
  createTimberSave,
  createVillageGame,
} from "../../packages/game-core/dist/index.js";
import { readVillage } from "./read-village.js";

async function setHidden(page: Page, hidden: boolean) {
  await page.evaluate((value) => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => value,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (value ? "hidden" : "visible"),
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

test("불러온 저장은 일시정지로 시작하고 탭을 숨기면 마을 시간이 멈춘다", async ({
  page,
}) => {
  const running = { ...createVillageGame(), paused: false };
  await page.addInitScript(
    (save) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(save)),
    createTimberSave(running),
  );
  await page.goto("/");
  const read = () => page.evaluate(readVillage);
  const start = page.getByRole("button", { name: "게임 시작", exact: true });
  await expect(start).toBeVisible();
  await expect.poll(async () => (await read()).paused).toBe(true);
  const loaded = (await read()).elapsed;
  await page.waitForTimeout(2500);
  expect((await read()).elapsed).toBe(loaded);

  await start.click();
  await expect.poll(async () => (await read()).elapsed).toBeGreaterThan(loaded);
  await setHidden(page, true);
  await expect.poll(async () => (await read()).paused).toBe(true);
  const hidden = (await read()).elapsed;
  await page.waitForTimeout(2500);
  expect((await read()).elapsed).toBe(hidden);

  // Returning to the tab keeps the village paused until the player resumes.
  await setHidden(page, false);
  await expect(start).toBeVisible();
  await page.waitForTimeout(1500);
  expect((await read()).elapsed).toBe(hidden);
  await start.click();
  await expect.poll(async () => (await read()).elapsed).toBeGreaterThan(hidden);
});
