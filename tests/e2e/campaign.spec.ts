import { expect, type Page, test } from "@playwright/test";
import {
  commandTimber,
  createTimberSave,
  createVillageGame,
  SCOUT_SITES,
} from "../../packages/game-core/dist/index.js";

test.use({ storageState: { cookies: [], origins: [] } });

async function readScene(page: Page, label: string) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const next = dialog.getByRole("button", { name: /^다음 대사/ });
  while (await next.count()) await next.click();
  await dialog.getByRole("button", { name: label, exact: true }).click();
}
test("출문을 눈으로 확인하고 장면을 접었다 돌아와도 재고가 중복 차감되지 않는다", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName("별이 진 뒤, 복홀");
  await expect(page.getByTestId("play-population")).toContainText("300");
  await expect(page.getByTestId("resource-RES_WOOD")).toHaveText("10,000");
  await readScene(page, "복홀 성문으로");
  await expect(dialog).toHaveAccessibleName("목진이 문을 열어 달라고 했다");
  await page.reload();
  await expect(dialog).toHaveAccessibleName("목진이 문을 열어 달라고 했다");
  await readScene(page, "성문을 열고 남은 장부 확인");
  await expect(page.getByTestId("play-population")).toContainText("60");
  await expect(page.getByTestId("resource-RES_WOOD")).toHaveText("1,000");
  await readScene(page, "남은 예순 명과 시작");
  await page.getByRole("button", { name: "주민의 청 듣기" }).click();
  await expect(dialog.locator(".patrol-portrait")).toBeVisible();
  await readScene(page, "어류 4를 내어 병상까지 배달");
  await expect(page.getByTestId("resource-RES_FISH")).toHaveText("996");
  await page.reload();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("resource-RES_FISH")).toHaveText("996");
});
test("함께 돌아온 정찰대는 보고별로 열리고 완료 뒤 다음 단계는 플레이어가 선택한다", async ({
  page,
}) => {
  const sent = commandTimber(
    createVillageGame(),
    { type: "scout-sites", ids: SCOUT_SITES.map((x) => x.id) },
    "send",
  );
  const save = createTimberSave({ ...sent, world: { ...sent.world, day: 4 } });
  await page.addInitScript((value) => {
    if (!localStorage.getItem("dynosty.village.resume"))
      localStorage.setItem("dynosty.village.resume", JSON.stringify(value));
  }, save);
  await page.goto("/");
  for (const x of SCOUT_SITES) {
    await expect(page.getByRole("dialog")).toHaveAccessibleName(
      x.name + " · 정찰 결과",
    );
    await readScene(
      page,
      x.id === "forge"
        ? "추가 파견을 멈추고 두 이름을 추모 장부에"
        : "보고를 장부에 적기",
    );
  }
  await page.getByRole("button", { name: "지금 단계에 머물기" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /1단계 · 복홀의 첫 명령/ }).click();
  await readScene(page, "2단계로 넘어갈까요? · 다섯 마을로");
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "끊어진 길을 잇다",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^다음 대사/ })
    .click();
  for (const name of ["당성", "압해", "한다사", "새금", "굴아화"]) {
    await expect(
      page
        .getByRole("dialog")
        .getByRole("button", { name: new RegExp("^" + name + " ·") }),
    ).toBeVisible();
  }
});
test("좁은 화면의 5단계 컷씬, 반란 대응과 충녕 시해를 이어 본다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const start = createVillageGame();
  const save = createTimberSave({
    ...start,
    chapter: 5,
    world: { ...start.world, pessimism: 55 },
    campaign: { ...start.campaign!, beat: "summit" },
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
  await expect
    .poll(() => dialog.locator("video").evaluate((v) => v.readyState))
    .toBeGreaterThan(1);
  const rect = await dialog.boundingBox();
  expect(rect?.width).toBeLessThanOrEqual(390);
  await readScene(page, "양녕 · 지휘권을 합치고 징발 허용");
  await expect(dialog).toHaveAccessibleName("곳간 앞에 내려놓은 일삯패");
  await readScene(page, "풀 12를 풀고 대표들과 함께 식사");
  await expect(dialog).toHaveAccessibleName("성문 빗장이 들리던 밤");
  await dialog.getByRole("button", { name: /^다음 대사/ }).click();
  await expect(dialog).toContainText("오늘은 목진 곁에 섰어");
  await dialog.getByRole("button", { name: /^다음 대사/ }).click();
  await expect(dialog).toContainText("충녕 마마가 돌아가셨어요");
  await expect
    .poll(() => tracks.some((url) => url.endsWith("/13.ogg")))
    .toBe(true);
});
