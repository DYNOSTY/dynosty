import { expect, type Locator, type Page, test } from "@playwright/test";

const gameMenu = (page: Page) =>
  page.getByRole("navigation", { name: "게임 메뉴" });
const entry = (page: Page) =>
  gameMenu(page).getByRole("button", { name: "정찰 거점 목록" });
const list = (page: Page) =>
  page.getByRole("dialog", { name: "정찰 거점 목록" });
const sitePanel = (page: Page) =>
  page.getByRole("region", { name: "정찰 · 미탐색 거점 패널" });

async function hits(button: Locator) {
  return button.evaluate((el) => {
    const { x, y, width, height } = el.getBoundingClientRect();
    const target = document.elementFromPoint(x + width / 2, y + height / 2);
    return {
      receivesPointer: el.contains(target),
      receiver:
        target?.closest("button")?.getAttribute("aria-label") ??
        target?.tagName,
      ancestry: target
        ? Array.from(
            (function* () {
              for (
                let node: Element | null = target;
                node && node !== document.body;
                node = node.parentElement
              ) {
                yield `${node.tagName}.${Array.from(node.classList).join(".")}`;
              }
            })(),
          )
        : [],
    };
  });
}

async function openShortScene(page: Page) {
  await page.setViewportSize({ width: 800, height: 96 });
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
    {
      timeout: 90_000,
    },
  );
}

test("닫힌 정찰 메뉴와 지도 표식 사이에서만 포커스를 넘긴다", async ({
  page,
}) => {
  await openShortScene(page);
  const tall = { width: 800, height: 300 };
  const short = { width: 800, height: 96 };
  const firstPin = page.locator(".g-pins__sites").getByRole("button").first();
  const otherPin = page.getByRole("button", {
    name: "정찰 거점 무너진 고려 집터",
  });
  const save = gameMenu(page).getByRole("button", { name: "저장" });

  await expect(entry(page)).toBeVisible();
  await entry(page).focus();
  await expect(list(page)).toBeHidden();
  await page.setViewportSize(tall);
  await expect(entry(page)).toBeHidden();
  await expect(firstPin).toBeVisible();
  await expect.soft(firstPin).toBeFocused({ timeout: 5_000 });

  await otherPin.focus();
  await expect(otherPin).toBeFocused();
  await page.setViewportSize(short);
  await expect(otherPin).toBeHidden();
  await expect(entry(page)).toBeVisible();
  await expect.soft(entry(page)).toBeFocused({ timeout: 5_000 });
  await expect(list(page)).toBeHidden();

  await save.focus();
  await page.setViewportSize(tall);
  await expect(entry(page)).toBeHidden();
  await expect(save).toBeFocused();
  await page.setViewportSize(short);
  await expect(entry(page)).toBeVisible();
  await expect(save).toBeFocused();
});

test("800×96에서 닫힌 정찰 목록이 기존 게임 버튼의 포인터 수신을 바꾸지 않는다", async ({
  page,
}, info) => {
  await openShortScene(page);
  await expect(entry(page)).toBeVisible();
  await expect(list(page)).toBeHidden();
  const buttons = ["게임 시작", "1일 진행", "새 게임"].map((name) =>
    page.getByRole("button", { name, exact: true }),
  );
  for (const button of buttons) await expect(button).toBeEnabled();
  const shown = await Promise.all(buttons.map(hits));
  // No-scout control: remove only scout UI, leaving the actual HUD untouched.
  await page.addStyleTag({
    content: ".g-pins, .g-scout-menu { display: none !important; }",
  });
  const absent = await Promise.all(buttons.map(hits));
  const report = JSON.stringify({ shown, absent }, null, 2);
  await info.attach("pointer-receivers", {
    body: report,
    contentType: "application/json",
  });
  console.log(`800×96 pointer receivers: ${report}`);
  expect(shown).toEqual(absent);
  for (const hit of shown)
    expect(hit.ancestry.join(" ")).not.toMatch(/g-pins|g-scout/);
});

test("공간 없는 800×96에서 메뉴로만 정찰 목록을 열고 크기를 복원한다", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openShortScene(page);
  await expect(entry(page)).toBeVisible();
  await expect(list(page)).toBeHidden();
  await expect(
    page.getByRole("button", { name: /^정찰 거점 (?!목록)/ }),
  ).toHaveCount(0);

  await gameMenu(page).getByRole("button", { name: "설정" }).focus();
  await page.keyboard.press("Tab");
  await expect(entry(page)).toBeFocused();
  await page.keyboard.press("Enter");
  const markers = list(page).getByRole("button", { name: /^정찰 거점 / });
  await expect(markers).toHaveCount(5);
  await expect(markers.first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(list(page)).toBeHidden();
  await expect(entry(page)).toBeFocused();

  await entry(page).click();
  await list(page)
    .getByRole("button", { name: "정찰 거점 무너진 고려 집터" })
    .click();
  await expect(sitePanel(page)).toContainText("30시간");
  await expect(list(page)).toBeHidden();
  await expect(
    sitePanel(page).getByRole("button", { name: /닫기/ }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sitePanel(page)).toBeHidden();
  await expect(entry(page)).toBeFocused();

  await entry(page).click();
  await list(page)
    .getByRole("button", { name: "정찰 거점 무너진 고려 집터" })
    .focus();
  await page.setViewportSize({ width: 800, height: 300 });
  await expect(list(page)).toBeHidden();
  await expect(entry(page)).toBeHidden();
  const pin = page.getByRole("button", { name: "정찰 거점 무너진 고려 집터" });
  await expect.poll(() => hits(pin)).toMatchObject({ receivesPointer: true });
  await expect(pin).toBeFocused();
  await pin.click();
  await expect(sitePanel(page)).toContainText("30시간");
});
