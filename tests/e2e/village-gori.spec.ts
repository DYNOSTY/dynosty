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
  // 고리는 키 약 1.25m라 마을 전체 시점에서는 몇 픽셀뿐이다. 플레이어처럼 가까이 당겨 본다.
  await page.evaluate(() => {
    const scene = (
      window as unknown as {
        __scene: {
          getTransformNodeById(id: string): {
            getAbsolutePosition(): unknown;
          } | null;
          activeCamera: { setTarget(p: unknown): void; radius: number };
        };
      }
    ).__scene;
    const node = scene.getTransformNodeById("gori");
    if (!node) throw Error("고리 노드가 없습니다.");
    scene.activeCamera.setTarget(node.getAbsolutePosition());
    scene.activeCamera.radius = 12;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: test.info().outputPath("gori-near.png") });
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
