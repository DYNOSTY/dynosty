import { expect, test } from "@playwright/test";
import {
  AMOUNT_SCALE,
  createPlayState,
  createTimberSave,
  createVillageGame,
} from "../../packages/game-core/dist/index.js";

test.use({
  launchOptions: { args: ["--disable-webgl"] },
  storageState: { cookies: [], origins: [] },
});

test("이어하기로 저장 슬롯을 열면 첫 재고부터 저장한 고기 수량을 표시한다", async ({
  page,
}) => {
  const village = createVillageGame();
  const savedMeat = 347;
  const meatText = savedMeat.toLocaleString("ko-KR");
  const formatMeat = (amount: number) =>
    Math.floor(amount / AMOUNT_SCALE).toLocaleString("ko-KR");
  expect(meatText).not.toBe(formatMeat(createPlayState().resources.RES_MEAT));
  expect(meatText).not.toBe(formatMeat(village.world.resources.RES_MEAT));

  const slot = createTimberSave({
    ...village,
    campaign: { ...village.campaign!, difficulty: "easy" },
    paused: true,
    world: {
      ...village.world,
      resources: {
        ...village.world.resources,
        RES_MEAT: savedMeat * AMOUNT_SCALE,
      },
    },
  });
  const resumeKey = "dynosty.village.resume";
  await page.addInitScript(
    ({ key, save }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, save);
    },
    { key: resumeKey, save: JSON.stringify(slot) },
  );
  await page.goto("/");
  const meat = page.getByTestId("resource-RES_MEAT");
  await expect(meat).toHaveText(meatText);
  await expect(page.getByTestId("play-scene-status")).toContainText(
    "표시 실패",
  );

  const menu = page.getByRole("dialog", { name: "메인 메뉴" });
  const continueButton = menu.getByRole("button", { name: "이어하기" });
  await page.getByRole("button", { name: "나가기", exact: true }).click();
  await continueButton.click();
  await menu.getByRole("button", { name: "저장하기", exact: true }).click();
  await menu.getByRole("button", { name: /슬롯 2 · 빈 슬롯/ }).click();
  await expect(menu.getByRole("status")).toHaveText("슬롯 2에 저장했습니다.");
  await menu.getByRole("button", { name: "뒤로", exact: true }).click();
  await continueButton.click();

  // A different autosave makes it impossible to pass by merely reloading.
  await page.evaluate(({ key, save }) => localStorage.setItem(key, save), {
    key: resumeKey,
    save: JSON.stringify(createTimberSave(village)),
  });
  // Install in the next document before React or either worker can publish.
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const first = document.querySelector('[data-testid="resource-RES_MEAT"]');
      if (!first) return;
      document.documentElement.dataset.firstMeat = first.textContent ?? "";
      observer.disconnect();
    });
    observer.observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
  await menu.getByRole("button", { name: /^슬롯 2 · 1단계/ }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-first-meat",
    meatText,
  );
  await expect(meat).toHaveText(meatText);
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key)!).state.campaign.difficulty,
        resumeKey,
      ),
    )
    .toBe("easy");
});
