import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1366, height: 768 } });

test("정찰 표식이 겹치지 않고 각각의 거점을 연다", async ({ page }) => {
  test.slow();
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
    { timeout: 90_000 },
  );

  const pins = page.locator(".g-pins .g-pin");
  await expect(pins).toHaveCount(5);
  await expect
    .poll(
      async () => {
        const boxes = await pins.evaluateAll((elements) =>
          elements.map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              visible: rect.width > 0 && rect.height > 0,
            };
          }),
        );
        return (
          boxes.length === 5 &&
          boxes.every(
            (a, i) =>
              a.visible &&
              a.left >= 0 &&
              a.top >= 0 &&
              a.right <= 1366 &&
              a.bottom <= 768 &&
              boxes
                .slice(i + 1)
                .every(
                  (b) =>
                    a.right <= b.left ||
                    b.right <= a.left ||
                    a.bottom <= b.top ||
                    b.bottom <= a.top,
                ),
          )
        );
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  const panel = page.getByRole("region", { name: "정찰 · 미탐색 거점 패널" });
  await page
    .getByRole("button", { name: "정찰 거점 갈대나루", exact: true })
    .click();
  await expect(panel).toContainText("36시간");
  await panel
    .getByRole("button", { name: "정찰 · 미탐색 거점 닫기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "정찰 거점 돌등 사냥막", exact: true })
    .click();
  await expect(panel).toContainText("40시간");
});
