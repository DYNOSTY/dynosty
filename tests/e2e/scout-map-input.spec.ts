import { expect, type Page, test } from "@playwright/test";

const canvas = (page: Page) => page.locator(".scene-viewport canvas");
const menuEntry = (page: Page) =>
  page.getByRole("button", { name: "정찰 거점 목록" });

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

const target = (page: Page) =>
  page.evaluate(() => {
    const { x, z } = (
      window as unknown as {
        __scene: { activeCamera: { target: { x: number; z: number } } };
      }
    ).__scene.activeCamera.target;
    return { x, z };
  });

test("모달은 진행 중인 가장자리 이동을 끊고 배경에서 다시 시작하지 않는다", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });
  await openScene(page, 800, 96);
  expect(await page.evaluate(() => navigator.webdriver)).toBe(false);
  const entry = menuEntry(page);
  const dialog = page.getByRole("dialog", { name: "정찰 거점 목록" });
  await expect(entry).toBeVisible();
  await entry.focus();
  const edge = { x: 2, y: 48 };
  const before = await target(page);
  const distanceFrom = async (start: { x: number; z: number }) => {
    const after = await target(page);
    return Math.hypot(after.x - start.x, after.z - start.z);
  };
  const afterDwell = () =>
    page.evaluate(async () => {
      const start = performance.now();
      // Observe actual render opportunities after the 250 ms edge dwell.
      do {
        await new Promise(requestAnimationFrame);
      } while (performance.now() - start < 450);
      await new Promise(requestAnimationFrame);
    });

  await page.mouse.move(edge.x, edge.y);
  await expect.poll(() => distanceFrom(before)).toBeGreaterThan(0.1);
  // Keyboard activation leaves the pointer dwelling at the edge.
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: /^정찰 거점 / }).first(),
  ).toBeFocused();
  const held = await target(page);
  await afterDwell();
  expect
    .soft(await distanceFrom(held), "이미 활성화된 가장자리 이동")
    .toBeLessThan(0.01);

  // Move off-edge, then onto the real modal backdrop to exercise window mousemove.
  await page.mouse.move(200, edge.y);
  await page.mouse.move(edge.x, edge.y + 1);
  const backdrop = await target(page);
  await afterDwell();
  expect
    .soft(await distanceFrom(backdrop), "모달 배경에서 가장자리 이동 재예약")
    .toBeLessThan(0.01);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(entry).toBeFocused();
  const closed = await target(page);
  await afterDwell();
  expect
    .soft(await distanceFrom(closed), "닫은 후 이전 가장자리 입력 재개")
    .toBeLessThan(0.01);
  await page.mouse.move(edge.x, edge.y);
  await expect.poll(() => distanceFrom(closed)).toBeGreaterThan(0.1);
});

type Point = { x: number; y: number };

async function expectPan(page: Page, start: Point, drag: () => Promise<void>) {
  expect(
    await canvas(page).evaluate(
      (el, { x, y }) => document.elementFromPoint(x, y) === el,
      start,
    ),
  ).toBe(true);
  const before = await target(page);
  await drag();
  await expect
    .poll(async () => {
      const after = await target(page);
      return Math.hypot(after.x - before.x, after.z - before.z);
    })
    .toBeGreaterThan(0.1);
}

const mouseDrag =
  (page: Page, { x, y }: Point) =>
  async () => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 90, y, { steps: 8 });
    await page.mouse.up();
  };

test("800×128 정찰 도크를 스크롤하고 선택해도 도크 옆 지도는 끌린다", async ({
  page,
}) => {
  await openScene(page, 800, 128);
  const dock = page.locator(".g-pins__sites.is-docked");
  await expect(dock.getByRole("button")).toHaveCount(5);
  await expect(menuEntry(page)).toBeHidden();
  const box = await dock.boundingBox();
  if (!box) throw new Error("정찰 도크 없음");
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.wheel(0, 60);
  await expect
    .poll(() => dock.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await dock
    .getByRole("button", { name: "정찰 거점 무너진 고려 집터" })
    .click();
  const panel = page.getByRole("region", { name: "정찰 · 미탐색 거점 패널" });
  await expect(panel).toContainText("30시간");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  const start = { x: 600, y: 90 }; // Former empty dock background.
  await expectPan(page, start, mouseDrag(page, start));
});

for (const width of [1280, 900]) {
  test(`${width}×720 일반 정찰 표식과 함께 지도를 마우스로 끌 수 있다`, async ({
    page,
  }) => {
    await openScene(page, width, 720);
    await expect(menuEntry(page)).toBeHidden();
    await expect(
      page.locator(".g-pins__sites").getByRole("button"),
    ).toHaveCount(5);
    const start = { x: width / 2, y: 420 };
    await expectPan(page, start, mouseDrag(page, start));
  });
}

test.describe("375×812 터치 지도", () => {
  test.use({ hasTouch: true });
  test("기존 모바일 화면에서 정찰 오버레이 없이 터치로 지도를 끌 수 있다", async ({
    page,
  }) => {
    await openScene(page, 375, 812);
    await expect(menuEntry(page)).toBeHidden();
    await expect(page.locator(".g-pins__sites")).toBeHidden();
    const box = await canvas(page).boundingBox();
    if (!box) throw new Error("지도 캔버스 없음");
    const start = {
      x: Math.round(box.x + box.width / 2),
      y: Math.round(box.y + box.height / 2),
    };
    await expectPan(page, start, async () => {
      const cdp = await page.context().newCDPSession(page);
      try {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [start],
        });
        for (let step = 1; step <= 6; step++) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: start.x + step * 12, y: start.y }],
          });
        }
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
      } finally {
        await cdp.detach();
      }
    });
  });
});
