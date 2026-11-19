import { expect, test } from "@playwright/test";
import { clickExample, worldPoint } from "./scene-picking.js";

test("selecting a village building shows its portrait without replacing the existing selection flow", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
  );
  await page.getByRole("button", { name: "명령 열기", exact: true }).click();
  const selection = page.getByRole("region", {
    name: "선택 정보",
    exact: true,
  });
  await expect(selection).toHaveCount(0);

  const office = await worldPoint(page, [0, 1.4, -14]);
  await page.mouse.click(office.x, office.y);
  await expect(selection.getByRole("heading", { name: "관아" })).toBeVisible();
  await expect(selection).toContainText("복홀 · 마을 시설");
  const portrait = selection.locator('img[src="/ui/buildings/BLD_OFFICE.jpg"]');
  await expect(portrait).toHaveAttribute("alt", "");
  await portrait.scrollIntoViewIfNeeded();
  await expect
    .poll(() => portrait.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(selection).toHaveCount(0);
  await page.locator("canvas").scrollIntoViewIfNeeded();
  await clickExample(page, "building");
  await expect(
    selection.getByRole("heading", { name: "건물 예제 · 온돌 둥지" }),
  ).toBeVisible();
  await expect(selection.locator("img")).toHaveCount(0);
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
  await page.getByRole("button", { name: "명령 열기", exact: true }).click();
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
