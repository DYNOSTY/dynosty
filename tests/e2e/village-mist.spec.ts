import { expect, test } from "@playwright/test";
import {
  advanceTimber,
  createTimberSave,
  createVillageGame,
} from "../../packages/game-core/dist/index.js";

test.use({ viewport: { width: 1366, height: 768 } });

for (const time of ["day", "night"] as const) {
  test(`기본 마을의 넓은 시점 안개 (${time})`, async ({ page }, info) => {
    test.slow();
    const initial = createVillageGame();
    const state =
      time === "night"
        ? advanceTimber(initial, (1440 - initial.world.minute) % 1440)
        : initial;
    if (time === "night") expect(state.world.minute).toBe(0);
    await page.addInitScript((save) => {
      localStorage.setItem("dynosty.village.resume", JSON.stringify(save));
    }, createTimberSave(state));
    await page.goto("/");
    await expect(page.getByTestId("play-scene-status")).toHaveText(
      "3D 준비 완료",
      { timeout: 90_000 },
    );
    await expect
      .poll(() =>
        page.evaluate(() => {
          const scene = (
            window as unknown as {
              __scene: import("@babylonjs/core/scene").Scene;
            }
          ).__scene;
          return !!scene
            ?.getMeshByName("ground")
            ?.material?.pluginManager?.getPlugin("DynostyMist");
        }),
      )
      .toBe(true);
    await page.evaluate(() => {
      const scene = (
        window as unknown as { __scene: import("@babylonjs/core/scene").Scene }
      ).__scene;
      const camera =
        scene.activeCamera as import("@babylonjs/core/Cameras/arcRotateCamera").ArcRotateCamera;
      camera.radius = 140;
      camera.beta = 0.9;
    });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const scene = (
            window as unknown as {
              __scene: import("@babylonjs/core/scene").Scene;
            }
          ).__scene;
          return scene.fogColor.r;
        }),
      )
      .toBeLessThan(time === "night" ? 0.2 : 0.61);
    if (time === "day")
      await expect
        .poll(() =>
          page.evaluate(() => {
            const scene = (
              window as unknown as {
                __scene: import("@babylonjs/core/scene").Scene;
              }
            ).__scene;
            return scene.fogColor.r;
          }),
        )
        .toBeGreaterThan(0.59);
    await page.screenshot({ path: info.outputPath(`mist-wide-${time}.png`) });
  });
}
