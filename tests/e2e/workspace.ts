import type { Page } from "@playwright/test";

// 기존 기능 검사는 개발 도구 창(예제 저장·파일·음원 포함)을 열어 접근한다.
// 뜨는 창은 한 번에 하나라서 저장 창은 따로 열지 않는다.
export async function openWorkspace(page: Page) {
  const button = page.getByRole("button", { name: "개발 도구", exact: true });
  if ((await button.getAttribute("aria-expanded")) !== "true")
    await button.click();
}

// 새 HUD의 창을 닫고 배경 메뉴/장면으로 돌아가는 실제 사용자 경로.
export async function closeWorkspace(page: Page) {
  const close = page.getByRole("button", {
    name: "개발 도구 닫기",
    exact: true,
  });
  if (await close.isVisible()) await close.click();
}

export async function openLaborPanel(page: Page) {
  await openWorkspace(page);
  await page
    .getByRole("button", { name: "일손 배치·배급", exact: true })
    .click();
}
