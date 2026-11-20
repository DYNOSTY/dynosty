import { writeFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { PNG } from "pngjs";
import { SITE_POINTS, type SiteId } from "../../apps/web/src/site-targets.js";
import { press, reveal } from "./labor-tabs.js";
import { clickFloor, cyanEdgePixels, worldPoint } from "./scene-picking.js";

const b = (p: Page, n: string) =>
  p.getByRole("button", { name: n, exact: true });
async function enter(p: Page) {
  await p.goto("/");
  await press(p, "마른 목재20 조달 체험하기");
  await press(p, "일손 배치·배급 체험하기");
  await expect(p.getByTestId("labor-clock")).toContainText("0시간 0분");
}
async function clickSite(p: Page, id: SiteId) {
  const point = await worldPoint(p, SITE_POINTS[id]);
  await p.mouse.click(point.x, point.y);
}
async function advanceLaborFromHud(p: Page) {
  const name = "일손 1시간 진행";
  await reveal(p, name);
  const button = b(p, name).first();
  await expect(button).toBeEnabled();
  const { x, y, receivesPointer } = await button.evaluate((el) => {
    el.scrollIntoView({ block: "nearest", behavior: "instant" });
    const rect = el.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    return {
      x,
      y,
      receivesPointer: el.contains(document.elementFromPoint(x, y)),
    };
  });
  expect(receivesPointer, "HUD 진행 단추에 실제 포인터가 닿아야 한다").toBe(
    true,
  );
  await p.mouse.click(x, y);
  await expect(p.getByTestId("labor-clock")).toContainText("1시간 0분");
}
async function initial(p: Page) {
  await enter(p);
  for (const n of [
    "확장 제안 A 선택",
    "확장 약정하기",
    "확장 수레 출발",
    "다음 일손 사건까지",
  ])
    await press(p, n);
  await clickSite(p, "site-inspection");
  await press(p, "현장 전량 검사 시작");
  await press(p, "현장 다음 사건까지");
  await press(p, "현장 정상분 16 수령");
}
test("1280px 검수대·배급소 실제 클릭으로 정보·단일 선택·바닥 해제와 HUD 조작을 확인한다", async ({
  page: p,
}) => {
  await p.setViewportSize({ width: 1280, height: 720 });
  await enter(p);
  await clickSite(p, "site-inspection");
  await expect(p.getByTestId("site-name")).toHaveText("검수대");
  await reveal(p, "검수대 선택");
  await expect(b(p, "검수대 선택")).toHaveAttribute("aria-pressed", "true");
  await clickSite(p, "site-ration");
  await expect(p.getByTestId("site-name")).toHaveText("배급소");
  await reveal(p, "검수대 선택");
  await expect(b(p, "검수대 선택")).toHaveAttribute("aria-pressed", "false");
  await reveal(p, "현장 일손 1 배급 준비로 보내기");
  await expect(b(p, "현장 일손 1 배급 준비로 보내기")).toBeDisabled();
  await press(p, "건물 예제 선택");
  await expect(p.getByTestId("site-name")).toHaveCount(0);
  await reveal(p, "건물 예제 선택");
  await expect(b(p, "건물 예제 선택")).toHaveAttribute("aria-pressed", "true");
  await clickSite(p, "site-inspection");
  await expect(p.getByTestId("site-name")).toHaveText("검수대");
  await reveal(p, "건물 예제 선택");
  await expect(b(p, "건물 예제 선택")).toHaveAttribute("aria-pressed", "false");
  await clickFloor(p);
  await expect(p.getByTestId("site-name")).toHaveCount(0);
  await reveal(p, "검수대 선택");
  await expect(b(p, "검수대 선택")).toHaveAttribute("aria-pressed", "false");
  await advanceLaborFromHud(p);
});
test("900px 검수대 윤곽선이 실제 클릭으로 표시되고 빈 바닥 클릭으로 사라진다", async ({
  page: p,
}, info) => {
  // NAS에서 같은 900px 장면의 무손실 캡처 진단에 사용한 시간 한도.
  test.setTimeout(210_000);
  await p.setViewportSize({ width: 900, height: 720 });
  await enter(p);
  const point = await worldPoint(p, SITE_POINTS["site-inspection"]);
  // 검수대 중심 근처의 모서리만 같은 화면 좌표에서 무손실 비교한다.
  const clip = {
    x: Math.round(point.x) - 24,
    y: Math.round(point.y) - 20,
    width: 48,
    height: 40,
  };
  const cdp = await p.context().newCDPSession(p);
  // 뷰포트 화면을 먼저 캡처하고 PNG에서 잘라 캡처 중 크기 변경을 피한다.
  const capture = async (name: string) => {
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "png",
    });
    const frame = PNG.sync.read(Buffer.from(data, "base64"));
    const crop = new PNG({ width: clip.width, height: clip.height });
    PNG.bitblt(frame, crop, clip.x, clip.y, clip.width, clip.height, 0, 0);
    const bytes = PNG.sync.write(crop);
    await writeFile(info.outputPath(`${name}.png`), bytes);
    return bytes;
  };
  // HUD 상태가 바뀌어도 직전 장면이 아직 합성 화면에 남아 있을 수 있다.
  const waitForSceneFrame = () =>
    p.locator("canvas").evaluate(
      () =>
        new Promise<void>((resolve) => {
          const { __scene } = window as unknown as {
            __scene: {
              onAfterRenderObservable: { addOnce(fn: () => void): void };
            };
          };
          __scene.onAfterRenderObservable.addOnce(() =>
            requestAnimationFrame(() => resolve()),
          );
        }),
    );
  const before = await capture("inspection-before");
  await p.mouse.click(point.x, point.y);
  await expect(p.getByTestId("site-name")).toHaveText("검수대");
  await waitForSceneFrame();
  let selected = before;
  await expect
    .poll(
      async () => {
        selected = await capture("inspection-selected");
        return cyanEdgePixels(before, selected).length;
      },
      {
        message: "실제 검수대 클릭 후 모서리에 청록색 윤곽선 표시",
        timeout: 60_000,
      },
    )
    .toBeGreaterThanOrEqual(8);

  await clickFloor(p);
  await expect(p.getByTestId("site-name")).toHaveCount(0);
  await waitForSceneFrame();
  await expect
    .poll(
      async () => {
        const cleared = await capture("inspection-cleared");
        const remaining = new Set(cyanEdgePixels(before, cleared));
        return cyanEdgePixels(before, selected).filter((i) => remaining.has(i))
          .length;
      },
      {
        message: "실제 빈 바닥 클릭 후 같은 모서리의 윤곽선 제거",
        timeout: 60_000,
      },
    )
    .toBe(0);
  await advanceLaborFromHud(p);
});
test("검수·격리품·배급소 현장 명령으로 교환과 배급을 완료하며 숨은 격리품 선택은 해제한다", async ({
  page: p,
}) => {
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await initial(p);
  await press(p, "확장 정상 목재 16 배분");
  await clickSite(p, "site-quarantine");
  await expect(p.getByTestId("site-name")).toHaveText("격리품");
  await expect(
    p.getByRole("region", { name: "격리품 현장 정보" }),
  ).toContainText("4개");
  await press(p, "현장 불량4 교환 요청");
  await press(p, "현장 교환 회수 출발");
  await expect(p.getByTestId("site-name")).toHaveCount(0);
  await reveal(p, "격리품 선택");
  await expect(b(p, "격리품 선택")).toBeDisabled();
  await clickSite(p, "site-ration");
  await reveal(p, "현장 일손 1 배급 준비로 보내기");
  await expect(b(p, "현장 일손 1 배급 준비로 보내기")).toBeDisabled();
  for (const n of [2, 3, 4])
    await press(p, `현장 일손 ${n} 배급 준비로 보내기`);
  await press(p, "현장 다음 사건까지");
  await press(p, "현장 다음 사건까지");
  await expect(p.getByTestId("site-status")).toContainText("완료 · 10시간 0분");
  await clickSite(p, "site-inspection");
  await press(p, "현장 다음 사건까지");
  await press(p, "현장 교환품4 재검수 시작");
  await expect(
    p.getByRole("region", { name: "검수대 현장 정보" }),
  ).toContainText("120분");
  await press(p, "현장 다음 사건까지");
  await press(p, "현장 합격 교환품4 수령");
  await expect(
    p.getByRole("region", { name: "검수대 현장 정보" }),
  ).toContainText("0개");
  await press(p, "확장 정상 목재 4 배분");
  await press(p, "확장 목재 사용 확인");
  await expect(p.getByTestId("labor-used")).toHaveText("20");
  await expect(p.getByTestId("labor-result")).toContainText("철재3 남음");
  expect(errors).toEqual([]);
});
test("현장 재배치는 보완 진행량을 보존하고 저장·새로고침 복원에서 선택만 해제한다", async ({
  page: p,
}) => {
  await initial(p);
  await clickSite(p, "site-quarantine");
  await press(p, "현장 보완 인원 배정");
  await press(p, "일손 1시간 진행");
  await clickSite(p, "site-ration");
  await press(p, "현장 일손 2 배급 준비로 보내기");
  await expect(p.getByTestId("labor-repair")).toContainText(
    "60/240분 · 배정 1/2명",
  );
  await press(p, "일손 체험 저장");
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "저장했습니다",
  );
  const save = await p.evaluate(() =>
    localStorage.getItem("dynosty.labor.saves"),
  );
  expect(save).not.toContain("site-preview");
  await p.reload();
  await press(p, "마른 목재20 조달 체험하기");
  await press(p, "일손 배치·배급 체험하기");
  await press(p, "일손 체험 불러오기");
  await expect(p.getByTestId("labor-clock")).toContainText("9시간 0분");
  await expect(p.getByTestId("site-name")).toHaveCount(0);
  await clickSite(p, "site-quarantine");
  await expect(
    p.getByRole("region", { name: "격리품 현장 정보" }),
  ).toContainText("60/240분");
  await reveal(p, "현장 불량4 교환 요청");
  await expect(b(p, "현장 불량4 교환 요청")).toBeDisabled();
  await clickSite(p, "site-ration");
  await expect(p.getByTestId("crew-2-job")).toHaveText("배급 준비");
  expect(
    await p.evaluate(() => localStorage.getItem("dynosty.labor.saves")),
  ).toBe(save);
});
test("손상 저장 불러오기 실패는 현재 선택·진행·원문을 보존한다", async ({
  page: p,
}) => {
  await initial(p);
  await clickSite(p, "site-quarantine");
  await press(p, "일손 체험 저장");
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "저장했습니다",
  );
  const raw = await p.evaluate(() => {
    const text = "{broken-site-save";
    localStorage.setItem("dynosty.labor.saves", text);
    return text;
  });
  await press(p, "일손 체험 불러오기");
  await expect(p.getByTestId("site-name")).toHaveText("격리품");
  await expect(p.getByRole("alert")).toContainText("손상");
  await reveal(p, "격리품 선택");
  await expect(b(p, "격리품 선택")).toHaveAttribute("aria-pressed", "true");
  expect(
    await p.evaluate(() => localStorage.getItem("dynosty.labor.saves")),
  ).toBe(raw);
  await expect(p.getByTestId("labor-clock")).toContainText("8시간 0분");
});
test("장소 전환은Worker를 초기화하지 않고 모드 종료·재시작에서는 선택이 남지 않는다", async ({
  page: p,
}) => {
  await initial(p);
  for (const id of [
    "site-inspection",
    "site-ration",
    "site-quarantine",
  ] as const)
    await clickSite(p, id);
  await expect(p.getByTestId("labor-clock")).toContainText("8시간 0분");
  await expect(p.getByTestId("labor-iron")).toContainText("철재 4");
  await press(p, "기존 목재 체험 보기");
  await expect(p.getByTestId("site-name")).toHaveCount(0);
  await reveal(p, "검수대 선택");
  await expect(b(p, "검수대 선택")).toHaveCount(0);
  await press(p, "일손 배치·배급 체험하기");
  await expect(p.getByTestId("labor-clock")).toContainText("8시간 0분");
  await clickSite(p, "site-inspection");
  await press(p, "일손 체험 다시 시작");
  await press(p, "새 일손 체험 확인");
  await expect(p.getByTestId("site-name")).toHaveCount(0);
  await expect(p.getByTestId("labor-clock")).toContainText("0시간 0분");
});
test("카메라 드래그는 장소 선택을 바꾸지 않고 바닥 클릭만 해제한다", async ({
  page: p,
}) => {
  await enter(p);
  await clickSite(p, "site-inspection");
  const box = await p.locator("canvas").boundingBox();
  if (!box) throw new Error("장면 없음");
  await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.8);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width * 0.5 + 80, box.y + box.height * 0.8, {
    steps: 6,
  });
  await p.mouse.up();
  await expect(p.getByTestId("site-name")).toHaveText("검수대");
  await press(p, "기본 시점");
  await clickFloor(p);
  await expect(p.getByTestId("site-name")).toHaveCount(0);
});
test.describe("작은 터치 화면", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });
  test("터치·키보드로 현장을 선택하고 해제하며 가로 넘침이 없다", async ({
    page: p,
  }) => {
    await enter(p);
    const point = await worldPoint(p, SITE_POINTS["site-inspection"]);
    await p.touchscreen.tap(point.x, point.y);
    await expect(p.getByTestId("site-name")).toHaveText("검수대");
    await b(p, "배급소 선택").focus();
    await p.keyboard.press("Enter");
    await expect(p.getByTestId("site-name")).toHaveText("배급소");
    expect(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await press(p, "현장 선택 해제");
    await expect(p.getByTestId("site-name")).toHaveCount(0);
    await expect(p.locator("canvas")).toBeFocused();
  });
});
