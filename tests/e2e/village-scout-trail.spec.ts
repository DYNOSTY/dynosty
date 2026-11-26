import { expect, test } from "@playwright/test";
import {
  createTimberSave,
  createVillageGame,
} from "../../packages/game-core/dist/index.js";
import { advanceVillageMinutes } from "./read-village.js";

test.use({ viewport: { width: 1366, height: 768 } });

test("정찰대가 깃발을 들고 이동한 곳에 발자국을 남긴다", async ({
  page,
}, info) => {
  test.slow();
  await page.addInitScript((save) => {
    localStorage.setItem("dynosty.village.resume", JSON.stringify(save));
  }, createTimberSave(createVillageGame()));
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
    { timeout: 90_000 },
  );
  await page
    .getByRole("button", { name: "정찰 거점 갈대나루", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "정찰 · 미탐색 거점 패널" });
  await panel
    .getByRole("button", { name: "정찰대 보내기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /갈대나루 정찰 중/ }),
  ).toBeVisible();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const scene = (
            window as unknown as {
              __scene: import("@babylonjs/core/scene").Scene;
            }
          ).__scene;
          return !!scene.getMeshByName("scout-flag");
        }),
      { timeout: 90_000 },
    )
    .toBe(true);
  await advanceVillageMinutes(page, 10);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = (
          window as unknown as {
            __scene: import("@babylonjs/core/scene").Scene;
          }
        ).__scene;
        const flag = scene.getMeshByName("scout-flag");
        const trail = scene.meshes.find((mesh) =>
          mesh.name.startsWith("scout-trail-"),
        ) as import("@babylonjs/core/Meshes/mesh").Mesh | undefined;
        return (
          !!flag?.isEnabled() &&
          flag.isVisible &&
          !!trail?.isVisible &&
          trail.thinInstanceCount > 0
        );
      }),
    )
    .toBe(true);
  await page.evaluate(() => {
    const scene = (
      window as unknown as { __scene: import("@babylonjs/core/scene").Scene }
    ).__scene;
    const flag = scene.getMeshByName("scout-flag");
    const camera =
      scene.activeCamera as import("@babylonjs/core/Cameras/arcRotateCamera").ArcRotateCamera;
    if (!flag || !camera) throw new Error("정찰대 또는 카메라가 없습니다.");
    flag.computeWorldMatrix(true);
    camera.setTarget(flag.getAbsolutePosition());
    camera.radius = 18;
    // 숲 나무에 가리지 않게 위에서 내려다본다.
    camera.beta = 0.5;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: info.outputPath("scout-trail.png") });
});
