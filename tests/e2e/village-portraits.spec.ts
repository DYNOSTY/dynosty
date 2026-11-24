import { expect, test } from "@playwright/test";
import { clickExample, worldPoint } from "./scene-picking.js";
import { openCommandConsole } from "./workspace.js";

test("selecting a village building shows its portrait without replacing the existing selection flow", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
  );
  await openCommandConsole(page);
  const selection = page.getByRole("region", {
    name: "선택 정보",
    exact: true,
  });
  await expect(selection).toHaveCount(0);

  const office = await worldPoint(page, [0, 1.4, -14], false);
  await page.mouse.click(office.x, office.y);
  await expect(selection.getByRole("heading", { name: "관아" })).toBeVisible();
  await expect(selection).toContainText("복홀 · 마을 시설");
  const portrait = selection.locator('img[src="/ui/buildings/BLD_OFFICE.jpg"]');
  await expect(portrait).toHaveAttribute("alt", "");
  await expect
    .poll(() => portrait.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(
    selection.getByRole("button", { name: /^(가까이 보기|선택 해제)$/ }),
  ).toHaveText(["가까이 보기", "선택 해제"], { timeout: 5_000 });
  const camera = () =>
    page.evaluate(() => {
      const { activeCamera } = (
        window as unknown as {
          __scene: {
            activeCamera: {
              radius: number;
              target: { x: number; z: number };
            };
          };
        }
      ).__scene;
      return {
        radius: activeCamera.radius,
        x: activeCamera.target.x,
        z: activeCamera.target.z,
      };
    });
  const before = await camera();
  await selection.getByRole("button", { name: "가까이 보기" }).click();
  await expect
    .poll(async () => {
      const { radius, x, z } = await camera();
      return radius < before.radius && Math.hypot(x, z + 14) < 0.5;
    })
    .toBe(true);
  await expect(selection.getByRole("heading", { name: "관아" })).toBeVisible();
  await selection.getByRole("button", { name: "선택 해제" }).click();
  await expect(selection).toHaveCount(0);
  const canvas = page.locator("canvas");
  await expect(canvas).toBeFocused();
  await page.getByRole("button", { name: "시점을 가운데로" }).click();
  await clickExample(page, "building");
  await expect(
    selection.getByRole("heading", { name: "건물 예제 · 온돌 둥지" }),
  ).toBeVisible();
  await expect(selection.locator("img")).toHaveCount(0);
  await expect(
    selection.getByRole("button", { name: "가까이 보기" }),
  ).toHaveCount(0);
  await expect(selection.getByRole("button", { name: "선택 해제" })).toHaveText(
    "×",
  );
});

test("a missing building portrait leaves its selection text usable", async ({
  page,
}) => {
  await page.route("**/ui/buildings/BLD_OFFICE.jpg", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.goto("/?season=summer");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
  );
  await openCommandConsole(page);
  const office = await worldPoint(page, [0, 1.4, -14]);
  const blocked = page.waitForResponse((response) =>
    response.url().endsWith("/ui/buildings/BLD_OFFICE.jpg"),
  );
  await page.mouse.click(office.x, office.y);
  expect((await blocked).status()).toBe(404);
  const selection = page.getByRole("region", {
    name: "선택 정보",
    exact: true,
  });
  await expect(selection.getByRole("heading", { name: "관아" })).toBeVisible();
  await expect(selection).toContainText("복홀 · 마을 시설");
  await expect(selection.locator("img")).toHaveAttribute("hidden", "");
});
