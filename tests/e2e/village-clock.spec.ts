import { expect, test } from "@playwright/test";
import {
  advanceTimber,
  commandTimber,
  createTimberSave,
  createVillageGame,
} from "../../packages/game-core/dist/index.js";
import { readVillage } from "./read-village.js";

test("시간이 흐르는 동안 사건을 하나씩 처리하고 건설과 수동 일시정지를 구분한다", async ({
  page,
}) => {
  const state = createVillageGame();
  const save = createTimberSave({
    ...state,
    bulletins: [
      {
        key: "clock-first",
        title: "첫 번째 전갈",
        detail: "정찰대가 돌아왔습니다.",
        kind: "scout",
      },
      {
        key: "clock-second",
        title: "두 번째 전갈",
        detail: "관아에 방이 붙었습니다.",
        kind: "decree",
      },
    ],
  });
  await page.addInitScript(
    (data) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(data)),
    save,
  );
  await page.goto("/");
  const read = () => page.evaluate(readVillage);
  const issue = page.getByRole("region", { name: "마을 사건" });
  await expect(issue).toContainText("첫 번째 전갈");
  await issue.getByRole("button", { name: "확인" }).click();
  await expect(issue).toContainText("두 번째 전갈");
  await issue.getByRole("button", { name: "확인" }).click();
  await expect(
    page.getByRole("button", { name: /마을 하루 진행|도성 반나절 경영/ }),
  ).toHaveCount(0);
  const census = page.getByRole("button", { name: /유휴 일손/ });
  await census.click();
  await expect(page.getByText("지금 배치 가능한 일손")).toBeVisible();
  await expect(page.getByPlaceholder("이름 · 종 · 근무지")).toBeHidden();
  await census.click();
  // A loaded save waits for the player before the village clock runs.
  expect((await read()).paused).toBe(true);
  await page.getByRole("button", { name: "게임 시작", exact: true }).click();
  const before = (await read()).elapsed;
  await expect.poll(async () => (await read()).elapsed).toBeGreaterThan(before);
  await page.keyboard.press("b");
  await expect.poll(async () => (await read()).paused).toBe(true);
  await page.keyboard.press("b");
  await expect(page.getByRole("region", { name: "건물 목록" })).toBeHidden();
  await expect.poll(async () => (await read()).paused).toBe(false);
  await page.keyboard.press("Space");
  await expect.poll(async () => (await read()).paused).toBe(true);
  const stopped = (await read()).elapsed;
  await page.keyboard.press("b");
  await page.keyboard.press("b");
  await expect(page.getByRole("region", { name: "건물 목록" })).toBeHidden();
  expect((await read()).elapsed).toBe(stopped);
  expect((await read()).paused).toBe(true);
  await page.keyboard.press("Space");
  await expect
    .poll(async () => (await read()).elapsed)
    .toBeGreaterThan(stopped);
});

test("공사가 끝난 순간 하단에 완공 소식이 뜨고 자동으로 사라진다", async ({
  page,
}) => {
  let state = commandTimber(
    createVillageGame(),
    {
      type: "plan-building",
      kind: "farm",
      position: { x: 12, z: 12 },
      headingRadians: 0,
    },
    "plant",
  );
  for (let i = 0; i < 120; i++) {
    const next = advanceTimber(state, 1);
    if (!next.town.orders.length) break;
    state = next;
  }
  await page.addInitScript(
    (save) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(save)),
    createTimberSave(state),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "게임 시작", exact: true }).click();
  const line = page.locator(".village-completion-line");
  await expect(line).toHaveText("온상 재배소 건설 완료");
  await expect(line).toBeEmpty();
});

test("첫 필요량 배급 선택으로 관아의 방과 하단 발효 알림이 함께 뜬다", async ({
  page,
}) => {
  await page.addInitScript(
    (save) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(save)),
    createTimberSave(createVillageGame()),
  );
  await page.goto("/");
  await expect(page.getByRole("button", { name: /유휴 일손/ })).toBeVisible();
  await page.keyboard.press("p");
  await page.getByRole("button", { name: "필요량 배급", exact: true }).click();
  await expect(page.locator(".office-decree")).toContainText(
    "필요량에 따른 배급",
  );
  await expect(page.locator(".village-completion-line")).toHaveText(
    "필요량에 따른 배급 발효",
  );
  await expect(
    page.getByRole("button", { name: "필요량 배급 · 시행 중" }),
  ).toBeDisabled();
});
