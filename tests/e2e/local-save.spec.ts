import { expect, type Page, test } from "@playwright/test";
import { openWorkspace } from "./workspace.js";

const saveKey = "dynosty.example.saves";

async function ready(page: Page) {
  await page.goto("/?worker-test");
  await openWorkspace(page);
  await expect(page.getByTestId("scene-example-motion")).toHaveText(
    "대기 표시",
  );
}

async function save(page: Page) {
  await page.getByRole("button", { name: "예제 저장", exact: true }).click();
  await expect(page.getByTestId("local-save-status")).toHaveText(
    "예제를 저장했습니다.",
  );
}

test("날짜·3D 상태와 직전 저장을 복원하고 새로고침해도 저장을 보존한다", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  await page
    .getByRole("button", { name: "Worker 날짜 전환", exact: true })
    .click();
  await page.getByRole("button", { name: "3D 연결 예제 바꾸기" }).click();
  await save(page); // 2일차, 걷기 표시
  await page
    .getByRole("button", { name: "Worker 날짜 전환", exact: true })
    .click();
  await page.getByRole("button", { name: "3D 연결 예제 바꾸기" }).click();
  await save(page); // 3일차, 대기 표시
  const before = await page.evaluate(
    (key) => localStorage.getItem(key),
    saveKey,
  );
  await page
    .getByRole("button", { name: "Worker 날짜 전환", exact: true })
    .click();
  await page.getByRole("button", { name: "3D 연결 예제 바꾸기" }).click();
  await page
    .getByRole("button", { name: "저장 불러오기", exact: true })
    .click();
  await expect(page.getByText("3일차", { exact: true })).toBeVisible();
  await expect(page.getByTestId("scene-example-motion")).toHaveText(
    "대기 표시",
  );
  await page
    .getByRole("button", { name: "Worker 날짜 전환", exact: true })
    .click();
  await expect(page.getByText("4일차", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "이전 저장 불러오기", exact: true })
    .click();
  await expect(page.getByText("2일차", { exact: true })).toBeVisible();
  await expect(page.getByTestId("scene-example-motion")).toHaveText(
    "걷기 표시",
  );
  await page.getByRole("button", { name: "3D 연결 예제 바꾸기" }).click();
  await expect(page.getByTestId("scene-example-motion")).toHaveText(
    "대기 표시",
  );
  await page.reload();
  await openWorkspace(page);
  await expect(page.getByText("1일차", { exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), saveKey)).toBe(
    before,
  );
  await page
    .getByRole("button", { name: "저장 불러오기", exact: true })
    .click();
  await expect(page.getByText("3일차", { exact: true })).toBeVisible();
  await expect(page.getByTestId("scene-example-motion")).toHaveText(
    "대기 표시",
  );
  expect(errors).toEqual([]);
});

for (const damage of ["json", "version", "day"] as const) {
  test(`잘못된 저장(${damage})을 거부하고 현재 상태와 원본 기록을 보존한다`, async ({
    page,
  }) => {
    await ready(page);
    await page
      .getByRole("button", { name: "Worker 날짜 전환", exact: true })
      .click();
    await page.getByRole("button", { name: "3D 연결 예제 바꾸기" }).click();
    await save(page);
    const corrupted = await page.evaluate(
      ({ key, mode }) => {
        const archive = JSON.parse(localStorage.getItem(key) ?? "null");
        if (mode === "version") archive.current.saveVersion = 99;
        if (mode === "day") archive.current.game.day = -1;
        const raw = mode === "json" ? "{broken" : JSON.stringify(archive);
        localStorage.setItem(key, raw);
        return raw;
      },
      { key: saveKey, mode: damage },
    );
    await page
      .getByRole("button", { name: "저장 불러오기", exact: true })
      .click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText("2일차", { exact: true })).toBeVisible();
    await expect(page.getByTestId("scene-example-motion")).toHaveText(
      "걷기 표시",
    );
    await page.getByRole("button", { name: "예제 저장", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    expect(
      await page.evaluate((key) => localStorage.getItem(key), saveKey),
    ).toBe(corrupted);
    await page
      .getByRole("button", { name: "Worker 날짜 전환", exact: true })
      .click();
    await expect(page.getByText("3일차", { exact: true })).toBeVisible();
  });
}

test("브라우저 쓰기 실패 후에도 최근·직전 저장을 모두 불러올 수 있다", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByRole("button", { name: "Worker 날짜 전환", exact: true })
    .click();
  await save(page);
  await page
    .getByRole("button", { name: "Worker 날짜 전환", exact: true })
    .click();
  await save(page);
  const before = await page.evaluate(
    (key) => localStorage.getItem(key),
    saveKey,
  );
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException("test quota", "QuotaExceededError");
      return original.call(this, name, value);
    };
  }, saveKey);
  await page
    .getByRole("button", { name: "Worker 날짜 전환", exact: true })
    .click();
  await page.getByRole("button", { name: "예제 저장", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("여유 공간");
  await expect(page.getByText("4일차", { exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), saveKey)).toBe(
    before,
  );
  await page
    .getByRole("button", { name: "저장 불러오기", exact: true })
    .click();
  await expect(page.getByText("3일차", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "이전 저장 불러오기", exact: true })
    .click();
  await expect(page.getByText("2일차", { exact: true })).toBeVisible();
});
