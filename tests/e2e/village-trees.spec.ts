import { expect, type Page, test } from "@playwright/test";
import {
  advanceTimber,
  commandTimber,
  createTimberSave,
  createVillageGame,
  loggingSite,
  parseTimberSave,
} from "../../packages/game-core/dist/index.js";

async function openVillage(
  page: Page,
  save: ReturnType<typeof createTimberSave>,
) {
  await page.addInitScript(
    (value) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(value)),
    save,
  );
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
    { timeout: 90_000 },
  );
}
async function counts(page: Page) {
  return page.evaluate(() => {
    const scene = (
      window as unknown as { __scene: import("@babylonjs/core/scene").Scene }
    ).__scene;
    const names = [
      "TREE_FIR",
      "TREE_FIR_B",
      "TREE_FIR_C",
      "TREE_PINE",
      "TREE_FIR_FAR",
      "TREE_PINE_FAR",
      "TREE_STUMP",
    ];
    return Object.fromEntries(
      names.map((name) => [
        name,
        (
          scene.getMeshByName(`forest-tree:${name}`) as
            | import("@babylonjs/core/Meshes/mesh").Mesh
            | null
        )?.thinInstanceCount ?? 0,
      ]),
    );
  });
}

test("복홀 숲은 공유 인스턴스를 사용하고 두 시점을 기록한다", async ({
  page,
}, info) => {
  await openVillage(page, createTimberSave(createVillageGame()));
  await expect
    .poll(async () =>
      Object.values(await counts(page)).reduce((a, b) => a + b, 0),
    )
    .toBe(13 * 32);
  expect((await counts(page)).TREE_STUMP).toBe(0);
  await page.waitForTimeout(5000);
  // biome-ignore lint/performance/useDomNodeTextContent: The prologue can hide this badge, changing rendered text relative to textContent.
  console.log("fps", await page.locator(".g-fps").innerText());
  await page.screenshot({ path: info.outputPath("village-default.png") });
  await page.evaluate(() => {
    const scene = (
      window as unknown as { __scene: import("@babylonjs/core/scene").Scene }
    ).__scene;
    const camera =
      scene.activeCamera as import("@babylonjs/core/Cameras/arcRotateCamera").ArcRotateCamera;
    camera.setTarget(
      new (
        camera.target
          .constructor as typeof import("@babylonjs/core/Maths/math.vector").Vector3
      )(-40, 0, -8),
    );
    camera.radius = 30;
  });
  await page.screenshot({ path: info.outputPath("forest-west.png") });
});

test("코어 명령으로 벌목한 숲에는 그루터기가 남는다", async ({ page }) => {
  let s = createVillageGame();
  s = commandTimber(
    s,
    { type: "build-logging", siteId: "west" },
    "trees-build",
  );
  s = advanceTimber(s, 160);
  s = commandTimber(
    s,
    { type: "set-logging-workers", siteId: "west", count: 4 },
    "trees-workers",
  );
  s = advanceTimber(s, 200);
  expect(loggingSite(s, "west").remaining).toBeLessThan(120);
  const save = createTimberSave(s);
  expect(
    loggingSite(parseTimberSave(save).state, "west").remaining,
  ).toBeLessThan(120);
  await openVillage(page, save);
  await expect
    .poll(async () => (await counts(page)).TREE_STUMP)
    .toBeGreaterThan(0);
  expect(Object.values(await counts(page)).reduce((a, b) => a + b, 0)).toBe(
    13 * 32,
  );
});
