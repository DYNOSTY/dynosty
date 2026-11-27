import { expect, test } from "@playwright/test";
import {
  CONVOY_GOALS,
  campaignOf,
  createCapital,
  createTimberSave,
  createVillageGame,
  requireValue,
} from "../../packages/game-core/dist/index.js";
import { readScene } from "./campaign-scene.js";
import { advanceVillageDay } from "./read-village.js";

// 대사·삽화만 확인하는 캠페인 장면 검사. 검사 서버의 소프트웨어 3D 렌더가 대사 넘기기를
// 늦춰 시간 제한을 넘기거나 클릭이 밀리므로 이 파일은 WebGL을 끄고 돈다.
test.use({
  launchOptions: { args: ["--disable-webgl"] },
  storageState: { cookies: [], origins: [] },
});

test("5단계 컷씬과 성안 변종 없는 반란을 이어 본다", async ({ page }) => {
  const start = createVillageGame();
  const save = createTimberSave({
    ...start,
    chapter: 5,
    world: { ...start.world, pessimism: 85, optimism: 75 },
    campaign: { ...campaignOf(start), beat: "summit" },
  });
  await page.addInitScript(
    (data) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(data)),
    save,
  );
  const tracks: string[] = [];
  page.on("request", (req) => {
    if (req.url().endsWith(".ogg")) tracks.push(req.url());
  });
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName("두 그릇을 놓고");
  // A resumed summit starts at the meeting. The stage introduction plays on entry.
  await expect(dialog).toContainText("마지막 수레에 어린 것들이 타고 있어요");
  await dialog.getByRole("button", { name: /^다음 대사/ }).click();
  await expect(dialog).toContainText("사람이 늘어 물독부터 봐야겠어요");
  await expect(
    dialog.getByRole("region", { name: "두 왕자의 인사" }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: /^다음 대사/ }).click();
  const family = dialog.getByRole("img", { name: /포와 혜/ });
  await expect
    .poll(() => family.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(dialog).toContainText("포야, 혜야");
  await expect(
    dialog.getByRole("region", { name: "두 왕자의 인사" }),
  ).toContainText("혜라고 불러 주세요!");
  const advance = dialog.getByRole("button", { name: /^다음 대사/ });
  await advance.click();
  await advance.click();
  await expect(dialog).toContainText("두 분이 먼저 와서 발 좀 녹이실래요?");
  await advance.click();
  const memory = dialog.getByRole("img", {
    name: "도성 광장에 홀로 선 왕의 뒷모습",
  });
  await expect(memory).toBeVisible();
  await expect
    .poll(() => memory.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(dialog.locator("img")).toHaveCount(1);
  await expect(
    dialog.locator(
      ".campaign-speech, .campaign-advisory, .campaign-goal, video",
    ),
  ).toHaveCount(0);
  await advance.click();
  await expect(memory).toHaveCount(0);
  await expect(family).toBeVisible();
  await expect(dialog).toContainText("그날은 나도 아버지처럼 홀로 남겠다.");
  await readScene(page, "양녕 · 식단마다 하루 배급의 상한을 정한다");
  for (let day = 0; day < 5; day++) {
    if (day === 4)
      await page.evaluate(() => {
        Math.random = () => 0.99;
      });
    await advanceVillageDay(page);
    if (day === 1 || day === 2)
      await expect(
        page.getByText(
          /푸른 보자기 맨 아주머니를 봤어요|빈 창고 쪽으로 혼자|문틈으로 불빛이 새더라/,
        ),
      ).toHaveCount(0);
    if (day === 3)
      await expect(page.getByText(/관측패를 모두 맞춰/)).toBeVisible();
  }
  await expect(dialog).toHaveAccessibleName("혹한 닷새 전 · 배반자의 외침");
  await readScene(page, "양녕의 반란에 맞선다");
  await expect(dialog).toHaveAccessibleName("성문 빗장이 들리던 밤");
  await dialog.getByRole("button", { name: /^다음 대사/ }).click();
  await expect(dialog).toContainText("푸른 보자기를 맨 주민");
  await expect(dialog).toContainText("이쪽 빗장은 내가 들 테니");
  await dialog.getByRole("button", { name: /^다음 대사/ }).click();
  await expect(dialog).toContainText("어린 공룡들을 데리고 식당에 계세요.");
  await expect
    .poll(() =>
      dialog
        .getByRole("img", { name: /한 상에 앉은 충녕/ })
        .evaluate((el) => (el as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  const nextLine = dialog.getByRole("button", { name: /^다음 대사/ });
  await nextLine.click();
  await expect(dialog.locator("img.campaign-still")).toHaveAttribute(
    "src",
    "/story/campaign/gate.webp",
  );
  await nextLine.click();
  const judgment = dialog.getByRole("img", { name: /관아 계단 중앙의 고리/ });
  await expect
    .poll(() =>
      judgment.evaluate((el) => (el as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(dialog).toContainText("고개 들어라, 목진.");
  await nextLine.click();
  await expect(dialog).toContainText("아니다. 들지도 마라. 가치도 없다.");
  await readScene(page, "판결을 기록하고 마을로");

  await expect
    .poll(() => tracks.some((url) => url.endsWith("/13.ogg")))
    .toBe(true);
});

test("기한 1분 전 세 번째 행렬을 보내면 왕의 결말에서 남하 호송으로 이어진다", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const village = createVillageGame();
  const capital = createCapital({
    ...village,
    campaign: { ...campaignOf(village), beat: "roads" },
  });
  const save = createTimberSave({
    ...capital,
    paused: true,
    elapsed:
      requireValue(capital.campaign, "capital.campaign").since + 36 * 60 - 1,
    campaign: {
      ...campaignOf(capital),
      relief: "report",
      departures: 2,
      evacuees: 200,
      cargo: { ...CONVOY_GOALS },
    },
  });
  await page.addInitScript(
    (value) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(value)),
    save,
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "남문 · 피난 수레", exact: true })
    .first()
    .click();
  const carts = page.getByRole("region", { name: "남문 피난 수레" });
  const portrait = carts.getByRole("img", { name: /두 손자/ });
  await expect
    .poll(() =>
      portrait.evaluate((el) => (el as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(carts).toContainText("양녕의 세 아들이 마지막 행렬에 올랐다");
  await carts.getByRole("button", { name: "3차 수레 출발" }).click();
  const ending = page.getByRole("dialog", {
    name: "3단계 완료 · 남문에 남은 왕",
  });
  await expect(ending).toContainText("전하, 북문이 뚫렸습니다");
  const next = ending.getByRole("button", { name: /^다음 대사/ });
  await next.click();
  await expect(ending.locator(".campaign-speech")).toHaveCount(0);
  await expect(ending.locator("video")).toHaveAttribute("src", /ending-3\.mp4/);
  await readScene(page, "먼저 남하한 충녕의 소식");
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "두 번 접힌 봉서",
  );
  const letter = page.getByRole("dialog", { name: "두 번 접힌 봉서" });
  const advance = letter.getByRole("button", { name: /^다음 대사/ });
  for (const image of ["mokjin-night", "palace-letter", "road-letter"]) {
    const still = letter.locator("img.campaign-still");
    await expect(still).toHaveAttribute("src", `/story/campaign/${image}.webp`);
    await expect(still).toBeVisible();
    await expect
      .poll(() => still.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await expect(letter.locator("video")).toHaveCount(0);
    if (image === "road-letter") {
      await expect(letter.locator(".campaign-speech")).toContainText(
        "호위무사",
      );
      await expect(letter.locator(".campaign-speech")).toContainText(
        "공주마마, 복홀에 닿으면 그 봉서를 먼저 전할까요?",
      );
    } else {
      await expect(letter.locator(".campaign-speech")).toHaveCount(0);
    }
    await advance.click();
  }
  await expect(letter.locator(".campaign-speech")).toContainText(
    "아직은요. 그분을 먼저 만나 보고 싶어요.",
  );
  await readScene(page, "남하 호송에 동행할까요?");
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "길가에서 기다린 목진",
  );
});
