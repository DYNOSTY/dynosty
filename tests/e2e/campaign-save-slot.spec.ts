import { expect, test } from "@playwright/test";
import {
  AMOUNT_SCALE,
  campaignOf,
  createPlayState,
  createTimberSave,
  createVillageGame,
} from "../../packages/game-core/dist/index.js";
import { readVillage } from "./read-village.js";

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
    campaign: { ...campaignOf(village), difficulty: "easy" },
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

  const menu = page.getByRole("dialog");
  const continueButton = menu.getByRole("button", { name: "이어하기" });
  await page.keyboard.press("Escape");
  await menu.getByRole("button", { name: "저장하기", exact: true }).click();
  await menu.getByRole("button", { name: /슬롯 2 · 빈 슬롯/ }).click();
  await expect(menu.getByRole("status")).toHaveText("슬롯 2에 저장했습니다.");
  await menu.getByRole("button", { name: "뒤로", exact: true }).click();
  await menu.getByRole("button", { name: "나가기" }).click();
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
      page.evaluate(readVillage, resumeKey).then((s) => s.campaign?.difficulty),
    )
    .toBe("easy");
});

test("처음 본 서막은 한 번만 재생하고 남은 주민의 장부는 새 게임을 확정할 때까지 보존한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const button = (name: string) =>
    page.getByRole("dialog").getByRole("button", { name, exact: true });
  await button("건너뛰기").click();
  await button("새로 시작").click();
  await button("시작하기").click();
  await button("건너뛰기").click();
  await button("대화 건너뛰기").click();
  await expect(page.locator(".scene-cinema .campaign-still")).toHaveAttribute(
    "src",
    /mokjin-exodus/,
  );
  await button("대화 건너뛰기").click();
  await expect(page.getByTestId("play-population")).toContainText("60명");
  await page.keyboard.press("Escape");
  await button("나가기").click();
  await button("새로 시작").click();
  await button("돌아가기").click();
  expect(await page.evaluate(readVillage).then((s) => s.campaign?.beat)).toBe(
    "after",
  );
  await button("새로 시작").click();
  await button("시작하기").click();
  await expect(
    page.getByRole("dialog", { name: "귀족들이 출문을 청했다" }),
  ).toBeVisible();
  await expect(page.locator("dialog[open] video")).toHaveCount(0);
});

test("돌아보기에서 서막 영상을 넘길 때 마을을 가린 채 다음 삽화를 연다", async ({
  page,
}) => {
  await page.addInitScript(() => {
    for (const id of ["opening", "one"])
      localStorage.setItem("dynosty.film." + id, "seen");
  });
  await page.goto("/");
  await page.getByRole("button", { name: "돌아보기", exact: true }).click();
  const gallery = page.getByRole("dialog", { name: "돌아보기" });
  await gallery.getByRole("button", { name: "영상 보기" }).click();
  await expect(gallery.locator("video")).toHaveAttribute(
    "src",
    /opening\.mp4$/,
  );
  await gallery.getByRole("button", { name: "다음 장면" }).click();
  await expect(gallery).toHaveCSS("opacity", "1");
  expect(
    await gallery.evaluate(
      (el) => getComputedStyle(el, "::backdrop").backgroundColor,
    ),
  ).toBe("rgb(18, 16, 14)");
  await expect(
    gallery.getByRole("img", { name: "복홀의 첫 명령", exact: true }),
  ).toBeVisible();
});

for (const [completed, song] of [
  [0, "Steps_Through_The_Frost.mp3"],
  [5, "Steps_Upon_the_Permafrost.mp3"],
] as const) {
  test("메뉴 배경 음악을 재생하고 반복한다 · " + song, async ({ page }) => {
    await page.addInitScript((stage) => {
      if (stage === 5) {
        localStorage.setItem("dynosty.completedChapter", "5");
        localStorage.setItem("dynosty.film.opening", "seen");
      }
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        if (this instanceof HTMLAudioElement)
          Object.assign(window, { titleAudio: this });
        return play.call(this);
      };
    }, completed);
    await page.goto("/");
    if (!completed)
      await page.getByRole("button", { name: "건너뛰기", exact: true }).click();
    const title = page.locator("dialog.bokhol-title");
    await expect(title).toHaveAttribute(
      "data-survived",
      String(completed === 5),
    );
    await title.getByRole("button", { name: "돌아보기" }).focus();
    await page.keyboard.press("Shift");
    await expect
      .poll(() =>
        page.evaluate((file) => {
          const audio = (window as unknown as { titleAudio?: HTMLAudioElement })
            .titleAudio;
          return (
            audio?.currentSrc.endsWith(file) &&
            audio.loop &&
            !audio.paused &&
            audio.currentTime > 0
          );
        }, song),
      )
      .toBe(true);
  });
}
