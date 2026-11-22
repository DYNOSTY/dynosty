import { expect, test } from "@playwright/test";

const settingsKey = "dynosty.settings";
const gameKey = "dynosty.example.saves";

test("설정 메뉴에서 키보드로 바꾼 음량·음소거를 새로고침 후 복원한다", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(
    (key) => localStorage.setItem(key, "keep game save"),
    gameKey,
  );
  const opener = page.getByRole("button", { name: "설정", exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "설정" });
  const volume = dialog.getByRole("slider", { name: "전체 음량" });
  await expect(volume).toHaveValue("50");
  await volume.press("End");
  await dialog.getByRole("checkbox", { name: "소리 끄기" }).check();
  await expect(dialog.getByTestId("settings-save-status")).toHaveText(
    "설정을 저장했습니다.",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await page.reload();
  await opener.click();
  await expect(volume).toHaveValue("100");
  await expect(
    dialog.getByRole("checkbox", { name: "소리 끄기" }),
  ).toBeChecked();
  await expect(dialog.getByRole("button", { name: "확인음 듣기" })).toHaveCount(
    0,
  );
  expect(await page.evaluate((key) => localStorage.getItem(key), gameKey)).toBe(
    "keep game save",
  );
});

test("돌아보기 영상에 저장한 음량을 적용한다", async ({ page }) => {
  await page.addInitScript(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({ settingsVersion: 1, masterVolume: 25, muted: false }),
      ),
    settingsKey,
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /복홀의 첫 명령/ }),
  ).toBeVisible();
  await expect(page.getByTestId("play-scene-status")).toContainText(
    "준비 완료",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "나가기", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "메인 메뉴" });
  await page.evaluate(() =>
    localStorage.setItem("dynosty.film.opening", "seen"),
  );
  await menu.getByRole("button", { name: "돌아보기" }).click();
  await menu.getByRole("button", { name: "영상 보기" }).click();
  await expect(menu.locator("video")).toHaveJSProperty("volume", 0.25);
  await expect(menu.locator("video")).toHaveJSProperty("muted", false);
});

for (const raw of [
  "{broken",
  '{"settingsVersion":99,"masterVolume":90,"muted":false}',
]) {
  test(`손상·미지원 설정은 기본값으로 시작하고 읽기만으로 덮어쓰지 않는다: ${raw}`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
      key: settingsKey,
      value: raw,
    });
    await page.reload();
    await page.getByRole("button", { name: "설정", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const volume = dialog.getByRole("slider", { name: "전체 음량" });
    await expect(volume).toHaveValue("50");
    await expect(dialog.getByRole("alert")).toContainText("기본값");
    expect(
      await page.evaluate((key) => localStorage.getItem(key), settingsKey),
    ).toBe(raw);
    await volume.press("End");
    await expect(dialog.getByTestId("settings-save-status")).toHaveText(
      "설정을 저장했습니다.",
    );
    await expect(dialog.getByRole("alert")).not.toBeVisible();
  });
}

test("설정 쓰기 실패는 이번 실행에만 적용하고 이전 설정·게임 저장을 유지한다", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const volume = dialog.getByRole("slider", { name: "전체 음량" });
  await volume.press("End");
  const before = await page.evaluate(
    (key) => localStorage.getItem(key),
    settingsKey,
  );
  await page.evaluate(
    ({ key, game }) => {
      localStorage.setItem(game, "keep game save");
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (name === key)
          throw new DOMException("test quota", "QuotaExceededError");
        return original.call(this, name, value);
      };
    },
    { key: settingsKey, game: gameKey },
  );
  await volume.press("Home");
  await expect(volume).toHaveValue("0");
  await expect(dialog.getByTestId("settings-save-status")).toHaveText(
    "이번 실행에만 적용했습니다.",
  );
  await expect(dialog.getByRole("alert")).toContainText("저장하지 못했습니다");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), settingsKey),
  ).toBe(before);
  expect(await page.evaluate((key) => localStorage.getItem(key), gameKey)).toBe(
    "keep game save",
  );
  await page.reload();
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(volume).toHaveValue("100");
});

test("오디오를 사용할 수 없어도 안전한 안내 후 설정을 변경할 수 있다", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "AudioContext", {
      value: class {
        constructor() {
          throw new Error("test audio denied");
        }
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("slider", { name: "전체 음량" }).press("End");
  await expect(dialog.getByTestId("settings-save-status")).toHaveText(
    "설정을 저장했습니다.",
  );
});
