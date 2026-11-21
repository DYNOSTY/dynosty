import { expect, test } from "@playwright/test";
import { clickExample } from "./scene-picking.js";

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 900, height: 720 },
]) {
  test(`${viewport.width}px에서 정찰 거점 표식이 가려지지 않고 사냥막을 열 수 있다`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("play-scene-status")).toHaveText(
      "3D 준비 완료",
      {
        timeout: 90_000,
      },
    );
    const markers = page.locator(".g-pins .g-pin");
    await expect(markers).toHaveCount(5);
    const inspect = () =>
      markers.evaluateAll((buttons) =>
        buttons.map((button) => {
          const rect = button.getBoundingClientRect();
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          const hit = document.elementFromPoint(x, y);
          return {
            name: button.getAttribute("aria-label"),
            x,
            y,
            receivesPointer: button.contains(hit),
            receiver:
              hit?.closest(".sc--medal, .g-console, .g-pin, .g-quests")
                ?.className ??
              hit?.tagName ??
              null,
          };
        }),
      );
    await clickExample(page, "building");
    await expect(
      page.getByRole("region", { name: "선택 정보", exact: true }),
    ).toContainText("온돌");
    await expect
      .poll(inspect, { timeout: 10_000 })
      .toEqual(
        Array.from({ length: 5 }, () =>
          expect.objectContaining({ receivesPointer: true }),
        ),
      );
    const hunt = (await inspect()).find(
      ({ name }) => name === "정찰 거점 돌등 사냥막",
    );
    if (!hunt) throw new Error("돌등 사냥막 표식 없음");
    await page.mouse.click(hunt.x, hunt.y);
    const panel = page.getByRole("region", { name: "정찰 · 미탐색 거점 패널" });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("40시간 (시안 값)");
    await panel.getByRole("button", { name: /닫기/ }).click();
    const selection = page.getByRole("region", {
      name: "선택 정보",
      exact: true,
    });
    await selection.getByRole("button", { name: "선택 해제" }).click();
    await expect(selection).toBeHidden();
  });
}
