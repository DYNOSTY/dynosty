import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { openWorkspace } from "./workspace.js";
import { press, reveal } from "./labor-tabs.js";

const key = "dynosty.example.saves";
const fileValue = {
  format: "dynosty-example",
  saveVersion: 1,
  game: { schemaVersion: 1, day: 9 },
  sceneExampleUpdated: true,
};

async function seed(page: Page) {
  await page.goto("/");
  await openWorkspace(page);
  await page.getByRole("button", { name: "하루 진행" }).click();
  await page.getByRole("button", { name: "3D 연결 예제 바꾸기" }).click();
  await press(page, "예제 저장");
  await expect(page.getByTestId("local-save-status")).toHaveText(
    "예제를 저장했습니다.",
  );
  await page.getByRole("button", { name: "하루 진행" }).click();
  await page.getByRole("button", { name: "3D 연결 예제 바꾸기" }).click();
  await press(page, "예제 저장");
  await expect(page.getByTestId("local-save-status")).toHaveText(
    "예제를 저장했습니다.",
  );
  await page.getByRole("button", { name: "하루 진행" }).click();
  await expect(page.getByText("4일차", { exact: true })).toBeVisible();
}

async function choose(page: Page, value = fileValue) {
  await page.getByLabel("가져올 저장 파일", { exact: true }).setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(value)),
  });
  await expect(page.getByTestId("save-file-preview")).toContainText(
    `${value.game.day}일차`,
  );
}

test("최근·직전 저장을 실제 파일로 내보내고 가져오기 확정 후 복원한다", async ({
  page,
}, info) => {
  await seed(page);
  await page.evaluate(() =>
    localStorage.setItem("dynosty.settings", "keep settings"),
  );
  const before = await page.evaluate((key) => localStorage.getItem(key), key);
  const [current] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "최근 저장 내보내기", exact: true })
      .click(),
  ]);
  const currentPath = info.outputPath(current.suggestedFilename());
  await current.saveAs(currentPath);
  expect(JSON.parse(readFileSync(currentPath, "utf8"))).toEqual({
    ...fileValue,
    game: { schemaVersion: 1, day: 3 },
    sceneExampleUpdated: false,
  });
  const [previous] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "이전 저장 내보내기", exact: true })
      .click(),
  ]);
  const previousPath = info.outputPath(previous.suggestedFilename());
  await previous.saveAs(previousPath);
  expect(JSON.parse(readFileSync(previousPath, "utf8"))).toEqual({
    ...fileValue,
    game: { schemaVersion: 1, day: 2 },
  });
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
    before,
  );
  await page
    .getByLabel("가져올 저장 파일", { exact: true })
    .setInputFiles(previousPath);
  await expect(page.getByTestId("save-file-preview")).toHaveText(
    "2일차 · 걷기 표시",
  );
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
    before,
  );
  await press(page, "파일 가져오기");
  await expect(page.getByTestId("save-file-status")).toContainText(
    "파일을 가져왔습니다",
  );
  await expect(
    page.getByRole("button", { name: "파일 가져오기", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("4일차", { exact: true })).toBeVisible();
  await expect(page.getByTestId("scene-example-motion")).toHaveText(
    "대기 표시",
  );
  const archive = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
    key,
  );
  expect(archive.current.game.day).toBe(2);
  expect(archive.previous.game.day).toBe(3);
  await press(page, "저장 불러오기");
  await expect(page.getByText("2일차", { exact: true })).toBeVisible();
  await expect(page.getByTestId("scene-example-motion")).toHaveText(
    "걷기 표시",
  );
  await page.getByRole("button", { name: "하루 진행" }).click();
  await expect(page.getByText("3일차", { exact: true })).toBeVisible();
  await press(page, "이전 저장 불러오기");
  await expect(page.getByTestId("scene-example-motion")).toHaveText(
    "대기 표시",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("dynosty.settings")),
  ).toBe("keep settings");
});

const invalid = [
  { name: "broken.json", raw: "{broken", message: "JSON" },
  {
    name: "future.json",
    raw: JSON.stringify({ ...fileValue, saveVersion: 99 }),
    message: "버전",
  },
  {
    name: "day.json",
    raw: JSON.stringify({ ...fileValue, game: { schemaVersion: 1, day: -1 } }),
    message: "날짜",
  },
  { name: "large.json", raw: " ".repeat(64 * 1024 + 1), message: "64KB" },
  { name: "wrong.txt", raw: JSON.stringify(fileValue), message: "JSON" },
];
for (const bad of invalid) {
  test(`잘못된 가져오기 파일(${bad.name})이 현재 상태와 두 저장을 바꾸지 않는다`, async ({
    page,
  }) => {
    await seed(page);
    const before = await page.evaluate((key) => localStorage.getItem(key), key);
    await page.getByLabel("가져올 저장 파일", { exact: true }).setInputFiles({
      name: bad.name,
      mimeType: "application/json",
      buffer: Buffer.from(bad.raw),
    });
    await expect(page.getByRole("alert")).toContainText(bad.message);
    await expect(
      page.getByRole("button", { name: "파일 가져오기", exact: true }),
    ).toBeDisabled();
    expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
      before,
    );
    await expect(page.getByText("4일차", { exact: true })).toBeVisible();
    await expect(page.getByTestId("scene-example-motion")).toHaveText(
      "대기 표시",
    );
  });
}

test("가져오기 쓰기 실패는 원문과 현재 상태를 유지하며 재시도 시 직전 저장을 보존한다", async ({
  page,
}) => {
  await seed(page);
  const before = await page.evaluate((key) => localStorage.getItem(key), key);
  await choose(page);
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    let failed = false;
    Storage.prototype.setItem = function (name, value) {
      if (name === key && !failed) {
        failed = true;
        throw new DOMException("test quota", "QuotaExceededError");
      }
      return original.call(this, name, value);
    };
  }, key);
  const button = page.getByRole("button", {
    name: "파일 가져오기",
    exact: true,
  });
  await button.click();
  await expect(page.getByRole("alert")).toContainText("여유 공간");
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
    before,
  );
  await expect(page.getByText("4일차", { exact: true })).toBeVisible();
  await button.click();
  await expect(page.getByTestId("save-file-status")).toContainText(
    "파일을 가져왔습니다",
  );
  const archive = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
    key,
  );
  expect(archive.current.game.day).toBe(9);
  expect(archive.previous.game.day).toBe(3);
});

test("파일 읽기 실패는 기존 기록을 보존한다", async ({ page }) => {
  await seed(page);
  const before = await page.evaluate((key) => localStorage.getItem(key), key);
  await page.evaluate(() => {
    File.prototype.text = async () => {
      throw new Error("test read denial");
    };
  });
  await page.getByLabel("가져올 저장 파일", { exact: true }).setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fileValue)),
  });
  await expect(page.getByRole("alert")).toContainText("읽지 못했습니다");
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
    before,
  );
  await expect(page.getByText("4일차", { exact: true })).toBeVisible();
});

test("기존 로컬 저장이 손상되었으면 유효한 가져오기 파일로도 자동 덮어쓰지 않는다", async ({
  page,
}) => {
  await seed(page);
  await page.evaluate((key) => localStorage.setItem(key, "{keep broken"), key);
  await choose(page);
  await press(page, "파일 가져오기");
  await expect(page.getByRole("alert")).toContainText("손상");
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
    "{keep broken",
  );
  await expect(page.getByText("4일차", { exact: true })).toBeVisible();
});
