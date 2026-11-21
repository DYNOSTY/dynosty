import { expect, type Page, test } from "@playwright/test";

async function openScene(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
    {
      timeout: 90_000,
    },
  );
}

const inspectPins = (page: Page) =>
  page.locator(".g-pins .g-pin").evaluateAll((buttons) => {
    const overlap = (a: DOMRect, b: DOMRect) =>
      a.left < b.right &&
      b.left < a.right &&
      a.top < b.bottom &&
      b.top < a.bottom;
    const boxes = buttons.map((button) => button.getBoundingClientRect());
    const hud = Array.from(
      document.querySelectorAll(
        ".play-header, .g-quests, .g-console, .g-topcmd, .sc--medal",
      ),
    )
      .map((el) => ({ rect: el.getBoundingClientRect(), name: el.className }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0);
    return buttons.map((button, i) => {
      const box = boxes[i] as DOMRect;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      return {
        name: button.getAttribute("aria-label"),
        x,
        y,
        inViewport:
          box.width > 0 &&
          box.height > 0 &&
          box.left >= 0 &&
          box.right <= innerWidth &&
          box.top >= 0 &&
          box.bottom <= innerHeight,
        overlapsMarkers: boxes.flatMap((other, j) =>
          i !== j && overlap(box, other)
            ? [buttons[j]?.getAttribute("aria-label")]
            : [],
        ),
        overlapsHud: hud
          .filter(({ rect }) => overlap(box, rect))
          .map(({ name }) => name),
        receivesPointer: button.contains(document.elementFromPoint(x, y)),
      };
    });
  });

const panelFor = (page: Page) =>
  page.getByRole("region", { name: "정찰 · 미탐색 거점 패널" });

test("900×720에서 확대·이동한 솔그늘과 저장 메뉴가 겹치지 않는다", async ({
  page,
}) => {
  await openScene(page, 900, 720);
  // 실제 Babylon 카메라에 확대·이동 후의 시점을 재현한다.
  await page.evaluate(async () => {
    const { activeCamera: camera } = (
      window as unknown as {
        __scene: {
          activeCamera: {
            radius: number;
            target: { set(x: number, y: number, z: number): void };
          };
        };
      }
    ).__scene;
    camera.radius = 25;
    camera.target.set(32, 0, 12);
    // Camera transforms and tracked pin styles settle on separate frames.
    for (let frame = 0; frame < 4; frame++) {
      await new Promise<void>((done) => requestAnimationFrame(() => done()));
    }
  });
  const pine = (await inspectPins(page)).find(
    ({ name }) => name === "정찰 거점 솔그늘",
  );
  expect(pine).toMatchObject({ inViewport: true });
  if (!pine) throw new Error("솔그늘 표식 없음");
  expect(pine.overlapsHud, JSON.stringify(pine)).not.toContain("g-topcmd");
  expect(pine.receivesPointer).toBe(true);
  await page.mouse.click(pine.x, pine.y);
  const panel = panelFor(page);
  await expect(panel).toContainText("48시간 (시안 값)");
  await panel.getByRole("button", { name: /닫기/ }).click();
  await page
    .getByRole("navigation", { name: "게임 메뉴" })
    .getByRole("button", { name: /저장/ })
    .click();
  await expect(
    page.getByRole("region", { name: "저장 패널", exact: true }),
  ).toBeVisible();
});

test("800×300에서 정찰 표식 다섯 개가 서로 겹치지 않고 클릭된다", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openScene(page, 800, 300);
  await expect
    .poll(() => inspectPins(page))
    .toEqual(
      Array.from({ length: 5 }, () =>
        expect.objectContaining({
          inViewport: true,
          overlapsMarkers: [],
          overlapsHud: [],
          receivesPointer: true,
        }),
      ),
    );
  const panel = panelFor(page);
  const hours: Record<string, number> = {
    갈대나루: 36,
    솔그늘: 48,
    "옛 제철터": 60,
    "돌등 사냥막": 40,
    "무너진 고려 집터": 30,
  };
  for (const { name, x, y } of await inspectPins(page)) {
    if (!name) throw new Error("정찰 표식 이름 없음");
    await page.mouse.click(x, y);
    await expect(panel).toContainText(
      `${hours[name.replace("정찰 거점 ", "")]}시간`,
    );
    await panel.getByRole("button", { name: /닫기/ }).click();
  }
});
