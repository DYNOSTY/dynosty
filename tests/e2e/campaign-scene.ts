import { expect, type Page } from "@playwright/test";

export async function readScene(page: Page, label: string) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const next = dialog.getByRole("button", { name: /^다음 대사/ });
  const choice = dialog.getByRole("button", { name: label, exact: true });
  const action = next.or(choice).first();
  for (;;) {
    await expect(action).toBeVisible();
    const previous = (await action.textContent()) ?? "";
    if (previous.trim() === label) {
      await choice.click();
      break;
    }
    await next.click();
    await expect.poll(() => next.allTextContents()).not.toContain(previous);
  }
  await expect(choice).toBeHidden();
  const start = page
    .getByRole("dialog", { name: "미션 시작 준비" })
    .getByRole("button", { name: "시작하기" });
  if (await start.isVisible()) {
    await expect(
      dialog.getByRole("button", { name: "돌아가기" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "난이도 설정" }).click();
    await expect(dialog.getByRole("combobox")).toBeVisible();
    await start.click();
    const skip = page.locator("dialog.film-screen .film-skip");
    if (await skip.isVisible()) await skip.click();
  }
}
