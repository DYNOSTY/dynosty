import type { Page } from "@playwright/test";

// 기존 기능 검사는 실제 메뉴를 열어 같은 저장·개발 기능에 접근한다.
export async function openWorkspace(page: Page) {
  for (const name of ["저장", "개발 도구"]) {
    const button = page.getByRole("button", { name, exact: true });
    if ((await button.getAttribute("aria-expanded")) !== "true")
      await button.click();
  }
}
