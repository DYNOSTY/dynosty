import { expect, type Page, test } from "@playwright/test";
import {
  commandTimber,
  createTimberSave,
  createVillageGame,
  SCOUT_SITES,
} from "../../packages/game-core/dist/index.js";
import { worldPoint } from "./scene-picking.js";

test.use({ storageState: { cookies: [], origins: [] } });

async function readScene(page: Page, label: string) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const next = dialog.getByRole("button", { name: /^다음 대사/ });
  const choice = dialog.getByRole("button", { name: label, exact: true });
  await expect(next.or(choice)).toBeVisible();
  while (!(await choice.isVisible())) {
    const current = dialog.getByRole("button", {
      name: (await next.textContent())?.trim(),
      exact: true,
    });
    await expect(current).toBeEnabled();
    await current.dispatchEvent("click");
    await expect(current).toHaveCount(0);
    await expect(next.or(choice)).toBeVisible();
  }
  await expect(choice).toBeEnabled();
  await choice.dispatchEvent("click");
}
test("출문 후 새로고침해도 난이도와 인구·재고가 보존된다 (WebGL 없이)", async ({
  page,
}) => {
  // Exercise the real UI, Worker and autosave without software 3D contention.
  await page.addInitScript(() => {
    const prototype = HTMLCanvasElement.prototype;
    prototype.getContext = new Proxy(prototype.getContext, {
      apply(target, canvas, args) {
        if (/webgl/i.test(String(args[0]))) return null;
        return Reflect.apply(target, canvas, args);
      },
    });
  });
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName("별이 진 뒤, 복홀");
  await expect(page.getByTestId("play-population")).toContainText("600");
  await expect(page.getByTestId("resource-RES_WOOD")).toHaveText("10,000");
  await readScene(page, "어려움 · 복홀 성문으로");
  await expect(dialog).toHaveAccessibleName("목진이 문을 열어 달라고 했다");
  await page.reload();
  await expect(dialog).toHaveAccessibleName("목진이 문을 열어 달라고 했다");
  await readScene(page, "성문을 열고 남은 장부 확인");
  await expect(page.getByTestId("play-population")).toContainText("60");
  await expect(page.getByTestId("resource-RES_WOOD")).toHaveText("1,000");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("dynosty.village.resume")!).state
          .campaign.difficulty,
    ),
  ).toBe("hard");
  await readScene(page, "남은 예순 명과 시작");
  await page.getByRole("button", { name: "관아 · 순라 배치" }).click();
  const office = page.getByRole("region", { name: "관아" });
  await office.getByRole("button", { name: "1단계 · 4명" }).click();
  await expect(office).toContainText("순라 포졸 4명");
  await page.getByRole("button", { name: "관아 · 순라 배치" }).click();
  await page.getByRole("button", { name: "주민의 청 듣기" }).click();
  await expect(dialog.locator(".patrol-portrait")).toBeVisible();
  await readScene(page, "어류 4를 내어 병상까지 배달");
  await expect(page.getByTestId("resource-RES_FISH")).toHaveText("996");
  await page.reload();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("play-population")).toContainText("60");
  await expect(page.getByTestId("resource-RES_WOOD")).toHaveText("1,000");
  await expect(page.getByTestId("resource-RES_FISH")).toHaveText("996");
});

test("출문 대화 중 실제 3D 장면에서 불길이 그려진다", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  // Start at the actual departure beat without replaying the prologue.
  const save = createTimberSave(
    commandTimber(
      createVillageGame(true),
      { type: "campaign", beat: "opening", action: "hard" },
      "visual-departure",
    ),
  );
  await page.addInitScript(
    (value) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(value)),
    save,
  );
  await page.goto("/");
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "목진이 문을 열어 달라고 했다",
  );
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
    { timeout: 60_000 },
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { __scene } = window as unknown as {
          __scene: {
            particleSystems: { name: string; getActiveCount(): number }[];
          };
        };
        return __scene.particleSystems
          .filter((system) => system.name.startsWith("처마 불길-"))
          .reduce((count, system) => count + system.getActiveCount(), 0);
      }),
    )
    .toBeGreaterThan(0);
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
test("밤에 달이가 배급령 변경을 재촉하고 주민 청을 거절하면 그 자리에서 추방된다", async ({
  page,
}) => {
  const start = createVillageGame();
  const save = createTimberSave({
    ...start,
    world: { ...start.world, minute: 1080, pessimism: 94 },
    campaign: { ...start.campaign!, difficulty: "hard" },
  });
  await page.addInitScript((value) => {
    if (!localStorage.getItem("dynosty.village.resume"))
      localStorage.setItem("dynosty.village.resume", JSON.stringify(value));
  }, save);
  await page.goto("/");
  const warning = page.locator(".campaign-advisory");
  await expect(warning).toContainText("달이");
  await expect(warning).toContainText("오늘 밤 배급령부터 바꾸자");
  await page.getByRole("button", { name: "주민의 청 듣기" }).click();
  await readScene(page, "오늘은 창고의 비축 유지");
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "아무도 깨우지 않는 아침",
  );
  await expect(warning).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "아무도 깨우지 않는 아침",
  );
});
test("3D 관아 선택과 해제가 순라 패널에 반영된다", async ({ page }) => {
  const save = createTimberSave(createVillageGame(false, true));
  await page.addInitScript(
    (value) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(value)),
    save,
  );
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
  );
  await page.getByRole("button", { name: "명령 열기", exact: true }).click();
  const office = page.getByRole("region", { name: "관아", exact: true });
  const selection = page.getByRole("region", {
    name: "선택 정보",
    exact: true,
  });
  const pickOffice = async (scroll = false) => {
    const point = await worldPoint(page, [0, 1.4, -14], scroll);
    await page.mouse.click(point.x, point.y);
    await expect(office).toBeVisible();
  };
  await pickOffice();
  await office.getByRole("button", { name: "1단계 · 4명" }).click();
  await expect(office).toContainText("순라 포졸 4명");
  await selection.getByRole("button", { name: "가까이 보기" }).click();
  await selection.getByRole("button", { name: "선택 해제" }).click();
  await expect(office).toHaveCount(0, { timeout: 5_000 });
  await pickOffice(true);
  await expect(office).toContainText("순라 포졸 4명");
});

test("어려움으로 저장된 5단계에서 지지가 사라지면 시간 진행 없이 추방된다", async ({
  page,
}) => {
  const s = createVillageGame();
  const save = createTimberSave({
    ...s,
    chapter: 5,
    campaign: { ...s.campaign!, beat: "vigil", difficulty: "hard" },
    world: { ...s.world, optimism: 0, pessimism: 20 },
  });
  await page.addInitScript(
    (value) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(value)),
    save,
  );
  await page.goto("/");
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "아무도 깨우지 않는 아침",
  );
});
test("옛 저장은 기본 보통 난이도로 남은 유예 시간을 이어간다", async ({
  page,
}) => {
  const s = createVillageGame();
  const save = createTimberSave({
    ...s,
    chapter: 5,
    campaign: { ...s.campaign!, beat: "vigil", pessimismExtremeSince: 0 },
    elapsed: 1439,
    world: { ...s.world, pessimism: 100 },
  });
  delete save.state.campaign!.difficulty;
  await page.addInitScript(
    (value) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(value)),
    save,
  );
  await page.goto("/");
  await expect(page.locator(".campaign-advisory")).toContainText("배급령");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "마을 하루 진행" }).click();
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "아무도 깨우지 않는 아침",
  );
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
