import { expect, test } from "@playwright/test";

test("웹 프록시를 통해 실제 PostgreSQL 연결을 확인한다", async ({
  request,
}) => {
  const response = await request.get("/api/ready");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    status: "ok",
    database: "connected",
  });
});

test("브라우저에서 API·Worker·3D 연결을 확인한다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "DYNOSTY" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("연결 완료");
  await expect(page.getByText("준비 완료", { exact: true })).toBeVisible();
  await expect(page.getByText("1일차", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "하루 진행" }).click();
  await expect(page.getByText("2일차", { exact: true })).toBeVisible();
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  expect(
    await canvas.evaluate((element) => element.width > 0 && element.height > 0),
  ).toBe(true);
  expect(errors).toEqual([]);
});
