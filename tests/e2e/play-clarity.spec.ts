import { expect, type Page, test } from "@playwright/test";
import {
  progressButton as b,
  enterProgress,
  receiveProgress,
} from "./progress-helpers.js";
import { clickFloor } from "./scene-picking.js";

async function horizontalOffset(p: Page, id: string) {
  const c = await p.locator("canvas").boundingBox(),
    m = await p.locator(`[data-site-marker="${id}"]`).boundingBox();
  if (!c || !m) throw Error("장소 표시 없음");
  return Math.abs(m.x + m.width / 2 - c.x - c.width / 2);
}
async function overlappingMarkers(p: Page) {
  return p
    .locator(".site-markers > span:not([hidden])")
    .evaluateAll((nodes) => {
      const rects = nodes.map((n) => ({
        text: n.textContent,
        r: n.getBoundingClientRect(),
      }));
      return rects.flatMap((a, i) =>
        rects
          .slice(i + 1)
          .filter(
            (b) =>
              a.r.left < b.r.right &&
              b.r.left < a.r.right &&
              a.r.top < b.r.bottom &&
              b.r.top < a.r.bottom,
          )
          .map((b) => `${a.text}/${b.text}`),
      );
    });
}
test("다음 조작 링크는 실제 공급·약정·출발로 이동하고 장소 보기는 카메라/포커스를 옮긴다", async ({
  page: p,
}) => {
  await enterProgress(p);
  await p
    .getByRole("link", { name: "목재 다음 조작으로 이동", exact: true })
    .click();
  await expect(
    p.getByRole("region", { name: "공급 제안 비교", exact: true }),
  ).toBeFocused();
  await b(p, "확장 제안 A 선택").click();
  await p
    .getByRole("link", { name: "목재 다음 조작으로 이동", exact: true })
    .click();
  await expect(b(p, "확장 약정하기")).toBeFocused();
  await p.keyboard.press("Enter");
  await p
    .getByRole("link", { name: "목재 다음 조작으로 이동", exact: true })
    .click();
  await expect(b(p, "확장 수레 출발")).toBeFocused();
  await p.keyboard.press("Enter");
  await p.locator("canvas").scrollIntoViewIfNeeded();
  await expect(p.locator("[data-transport-marker]")).toHaveText(
    "→ 원납품 운송 20",
  );
  await expect(p.locator('[data-crew-marker="crew-1"]')).toContainText(
    "운송·검사",
  );
  await expect.poll(() => overlappingMarkers(p)).toEqual([]);
  await b(p, "다음 일손 사건까지").click();
  await b(p, "목재 다음 작업 장소 보기").click();
  await expect(p.getByTestId("site-name")).toHaveText("검수대");
  await expect(p.locator("canvas")).toBeFocused();
  await expect
    .poll(() => horizontalOffset(p, "site-inspection"))
    .toBeLessThan(5);
  await expect(p.locator("canvas")).toBeInViewport({ ratio: 0.5 });
  await b(p, "기본 시점").click();
  await expect
    .poll(() => horizontalOffset(p, "site-inspection"))
    .toBeGreaterThan(30);
});
test("보완 역할 표지·먼저 배분 링크·장소 이동·빈 바닥·저장 복원을 유지한다", async ({
  page: p,
}) => {
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await receiveProgress(p);
  await p
    .getByRole("link", { name: "정상 목재 배분으로 이동", exact: true })
    .click();
  await expect(b(p, "확장 정상 목재 16 배분")).toBeFocused();
  await p.keyboard.press("Enter");
  await b(p, "목재 다음 작업 장소 보기").click();
  await expect
    .poll(() => horizontalOffset(p, "site-quarantine"))
    .toBeLessThan(5);
  await expect(p.getByTestId("site-name")).toBeInViewport({ ratio: 1 });
  await b(p, "현장 보완 인원 배정").click();
  await expect(p.locator('[data-crew-marker="crew-1"]')).toHaveAttribute(
    "data-job",
    "repair",
  );
  await expect(p.locator('[data-crew-marker="crew-1"]')).toContainText(
    "1 ＋ 보완",
  );
  await clickFloor(p);
  await expect(p.getByTestId("site-name")).toHaveCount(0);
  await b(p, "일손 체험 저장").click();
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "저장했습니다",
  );
  await p.reload();
  await b(p, "마른 목재20 조달 체험하기").click();
  await b(p, "일손 배치·배급 체험하기").click();
  await b(p, "일손 체험 불러오기").click();
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "불러왔습니다",
  );
  await expect(p.locator('[data-crew-marker="crew-1"]')).toHaveAttribute(
    "data-job",
    "repair",
  );
  await expect(p.getByTestId("flow-allocated")).toContainText("16개");
  expect(errors).toEqual([]);
});
for (const viewport of [
  { width: 1280, height: 720 },
  { width: 375, height: 812 },
]) {
  test(`${viewport.width}px 일손 현장으로 이동한 뒤 개발 도구 없이 대상을 선택하고 시점을 복귀한다`, async ({
    page: p,
  }) => {
    await p.setViewportSize(viewport);
    await p.goto("/");
    await b(p, "마른 목재20 조달 체험하기").click();
    const tools = b(p, "개발 도구");
    await tools.press("Enter");
    await b(p, "일손 배치·배급 체험하기").click();
    await tools.press("Enter");
    await expect(tools).toHaveAttribute("aria-expanded", "false");
    await b(p, "배급 준비 장소 보기").click();
    await expect(p.locator("canvas")).toBeFocused();
    await expect.poll(() => horizontalOffset(p, "site-ration")).toBeLessThan(5);

    const controls = p.getByRole("group", { name: "현장 대상 선택" });
    const inspection = controls.getByRole("button", { name: "검수대 선택" });
    const reset = b(p, "기본 시점");
    await expect(reset).toBeInViewport({ ratio: 1, timeout: 3000 });
    await expect(inspection).toBeInViewport({ ratio: 1, timeout: 3000 });
    await inspection.click();
    await expect(inspection).toHaveAttribute("aria-pressed", "true");
    await expect(p.getByTestId("site-name")).toHaveText("검수대");
    await reset.click();
    await expect
      .poll(() => horizontalOffset(p, "site-ration"))
      .toBeGreaterThan(30);
    await expect(inspection).toHaveAttribute("aria-pressed", "true");
    expect(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
test("375px 키보드 장소 이동·기본 복귀·기호 표지는 가로 넘침이나 클릭 가림이 없다", async ({
  page: p,
}) => {
  await p.setViewportSize({ width: 375, height: 812 });
  await receiveProgress(p);
  await b(p, "배급 준비 장소 보기").focus();
  await p.keyboard.press("Enter");
  await expect(p.locator("canvas")).toBeFocused();
  await expect.poll(() => horizontalOffset(p, "site-ration")).toBeLessThan(5);
  await expect(p.locator("canvas")).toBeInViewport({ ratio: 0.5 });
  await b(p, "기본 시점").click();
  await expect(p.locator('[data-site-marker="site-quarantine"]')).toContainText(
    "×",
  );
  await expect.poll(() => overlappingMarkers(p)).toEqual([]);
  expect(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
});
