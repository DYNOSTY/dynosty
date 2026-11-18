import type { Locator, Page } from "@playwright/test";

// 일손 판은 탭(배치·요청·현장·품질·저장)으로 나뉘어 한 번에 한 덩어리만 보인다.
// 찾는 단추·칸이 안 보이면 탭을 차례로 열어 보이게 한 뒤 쓴다 (보이면 그대로).
const TABS = ["배치 탭", "요청 탭", "현장 탭", "품질 탭", "저장 탭"];

export async function showIn(p: Page, target: Locator) {
  if (await target.isVisible().catch(() => false)) return;
  for (const t of TABS) {
    const tab = p.getByRole("button", { name: t, exact: true });
    if (!(await tab.isVisible().catch(() => false))) return;
    await tab.click();
    if (await target.isVisible().catch(() => false)) return;
  }
}

export const reveal = (p: Page, name: string) =>
  showIn(p, p.getByRole("button", { name, exact: true }).first());

export async function press(p: Page, name: string) {
  await reveal(p, name);
  await p.getByRole("button", { name, exact: true }).first().click();
}

export async function choose(p: Page, label: string, value: string) {
  const select = p.getByLabel(label, { exact: true });
  await showIn(p, select);
  await select.selectOption(value);
}
