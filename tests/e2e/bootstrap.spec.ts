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

test("Worker의 표시 정보가 3D 객체 갱신까지 전달된다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const motion = page.getByTestId("scene-example-motion");
  await expect(motion).toHaveText("대기 표시");
  const canvas = page.locator("canvas");
  const initialImage = await canvas.screenshot();
  await page.getByRole("button", { name: "3D 연결 예제 바꾸기" }).click();
  await expect(motion).toHaveText("걷기 표시");
  // 표시 완료 알림뿐 아니라 실제 캔버스의 렌더링 결과도 달라져야 한다.
  await expect
    .poll(async () => (await canvas.screenshot()).equals(initialImage))
    .toBe(false);
  await expect(page.getByText("1일차", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "3D 연결 예제 바꾸기" }).click();
  await expect(motion).toHaveText("대기 표시");
  await page.reload();
  await expect(motion).toHaveText("대기 표시");
  expect(errors).toEqual([]);
});
