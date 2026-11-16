import { expect, test } from "@playwright/test";
import { clickExample, clickFloor, examplePoint } from "./scene-picking.js";

async function ready(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "건물 예제 선택", exact: true }),
  ).toBeVisible();
}

test("건물·주민을 실제 클릭해 테두리와 정보를 전환하고 빈 바닥에서 해제한다", async ({
  page,
}) => {
  const errors: string[] = [];
  let navigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations += 1;
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await page.evaluate(() =>
    localStorage.setItem("dynosty.example.saves", "keep saved data"),
  );
  // 패널 전환에 따른 장면 폭 변경 없이 실제 테두리 픽셀의 변화를 비교한다.
  await page.getByRole("button", { name: "저장", exact: true }).click();
  const canvas = page.locator("canvas");
  const before = await canvas.screenshot();
  await clickExample(page, "building");
  const info = page.getByRole("region", { name: "선택 정보", exact: true });
  await expect(info.getByText("건물 예제", { exact: false })).toBeVisible();
  await expect(info.getByText("기본 외형", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "건물 예제 선택", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => (await canvas.screenshot()).equals(before))
    .toBe(false);
  await clickExample(page, "resident");
  await expect(info.getByText("주민 예제", { exact: false })).toBeVisible();
  await expect(info.getByText("대기 표시", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "건물 예제 선택", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await clickFloor(page);
  await expect(info).toBeHidden();
  await expect
    .poll(async () => (await canvas.screenshot()).equals(before))
    .toBe(true);
  await expect(page.getByText("1일차", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("dynosty.example.saves")),
  ).toBe("keep saved data");
  expect(errors).toEqual([]);
  expect(navigations).toBe(1);
});

test("카메라 드래그·우클릭은 대상 선택이나 선택 해제로 처리하지 않는다", async ({
  page,
}) => {
  await ready(page);
  await clickExample(page, "building");
  const info = page.getByRole("region", { name: "선택 정보", exact: true });
  await expect(info).toContainText("건물 예제");
  const p = await examplePoint(page, "building");
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 90, p.y + 30, { steps: 12 });
  await page.mouse.up();
  await expect(info).toContainText("건물 예제");
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("캔버스 없음");
  await page.mouse.click(box.x + 10, box.y + 10, { button: "right" });
  await expect(info).toContainText("건물 예제");
});

test("장면 갱신·저장 복원·메뉴 토글 후에도 같은 대상의 최신 예제 정보를 표시한다", async ({
  page,
}) => {
  await ready(page);
  await clickExample(page, "resident");
  const info = page.getByRole("region", { name: "선택 정보", exact: true });
  await expect(info).toContainText("대기 표시");
  await page.getByRole("button", { name: "개발 도구", exact: true }).click();
  await page
    .getByRole("button", { name: "3D 연결 예제 바꾸기", exact: true })
    .click();
  await expect(info).toContainText("걷기 표시");
  await expect(info).toContainText("2, 0, 1");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await page.getByRole("button", { name: "예제 저장", exact: true }).click();
  await expect(page.getByTestId("local-save-status")).toHaveText(
    "예제를 저장했습니다.",
  );
  await page
    .getByRole("button", { name: "3D 연결 예제 바꾸기", exact: true })
    .click();
  await expect(info).toContainText("대기 표시");
  await page
    .getByRole("button", { name: "저장 불러오기", exact: true })
    .click();
  await expect(info).toContainText("걷기 표시");
  await page
    .getByRole("button", { name: "개발 도구 닫기", exact: true })
    .click();
  await page.getByRole("button", { name: "저장 닫기", exact: true }).click();
  await expect(info).toBeVisible();
  await page.reload();
  await expect(info).toBeHidden();
});

test.describe("좁은 터치 화면", () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 812 } });
  test("터치로 선택하고 키보드 버튼으로 전환·해제하며 가로 넘침 없이 표시한다", async ({
    page,
  }) => {
    await ready(page);
    const point = await examplePoint(page, "building");
    await page.touchscreen.tap(point.x, point.y);
    const info = page.getByRole("region", { name: "선택 정보", exact: true });
    await expect(info).toContainText("건물 예제");
    await page
      .getByRole("button", { name: "주민 예제 선택", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(info).toContainText("주민 예제");
    await page.getByRole("button", { name: "선택 해제", exact: true }).click();
    await expect(info).toBeHidden();
    await expect(page.locator("canvas")).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});
