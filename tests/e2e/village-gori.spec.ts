import { expect, test } from "@playwright/test";
import {
  createTimberSave,
  createVillageGame,
} from "../../packages/game-core/dist/index.js";
import { clickNode } from "./scene-picking.js";
import { openCommandConsole } from "./workspace.js";

test("복홀에서 고리를 선택하면 정보와 초상이 보인다", async ({ page }) => {
  await page.addInitScript(
    (save) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(save)),
    createTimberSave(createVillageGame()),
  );
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
  );
  await openCommandConsole(page);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = (
          window as unknown as {
            __scene: {
              getTransformNodeById(
                id: string,
              ): { isEnabled(): boolean; getChildMeshes(): unknown[] } | null;
            };
          }
        ).__scene;
        const node = scene.getTransformNodeById("gori");
        return !!node?.isEnabled() && node.getChildMeshes().length > 0;
      }),
    )
    .toBe(true);
  await clickNode(page, "gori");
  const info = page.getByRole("region", { name: "선택 정보", exact: true });
  await expect(
    info.getByRole("heading", { name: "고리", exact: true }),
  ).toBeVisible();
  const portrait = info.locator('img[src^="/ui/gori/face"]');
  await expect(portrait).toBeVisible();
  await expect
    .poll(() => portrait.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await page.screenshot({ path: test.info().outputPath("gori.png") });
});
