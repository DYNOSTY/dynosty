import { expect, type Page, test } from "@playwright/test";

async function enter(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "마른 목재20 조달 체험하기", exact: true })
    .click();
  await expect(page.getByTestId("timber-phase")).toHaveText("공급 제안 비교");
}
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
async function delivery(page: Page, offer = "A") {
  await button(page, `제안 ${offer} 선택`).click();
  await button(page, "선택한 제안 약정하기").click();
  await expect(page.getByTestId("timber-iron")).toContainText(
    `예약${offer === "A" ? 4 : 6}`,
  );
  await button(page, "수레 출발시키기").click();
  await expect(page.getByTestId("timber-available")).toHaveText("0");
  await button(page, "다음 작업 완료까지").click();
  await expect(page.getByTestId("timber-waiting")).toHaveText("20");
  await button(page, "전량 검사·검수 시작").click();
  await button(page, "다음 작업 완료까지").click();
  await button(page, `정상분 ${offer === "A" ? 16 : 20} 받기`).click();
}
test("A의16+4 흐름은 검사·보완·배분·실제 사용까지12시간에 완료한다", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page);
  await delivery(page);
  await expect(page.getByTestId("timber-quarantine")).toHaveText("4");
  await button(page, "사용 가능한 목재 16 둥지에 배분").click();
  await expect(page.getByTestId("timber-allocated")).toHaveText("16");
  await button(page, "젖은4 건조·재검사 시작").click();
  await expect(page.getByTestId("timber-workers")).toHaveText("일손 가용2/4");
  await button(page, "다음 작업 완료까지").click();
  await expect(page.getByTestId("timber-clock")).toHaveText(
    "경과 12시간 0분 / 기한12시간",
  );
  await expect(page.getByTestId("timber-quarantine")).toHaveText("0");
  await button(page, "사용 가능한 목재 4 둥지에 배분").click();
  await button(page, "지붕 보수·사용 확인").click();
  await expect(page.getByTestId("timber-result")).toContainText("기한 충족");
  await expect(page.getByTestId("timber-used")).toHaveText("20");
  await expect(page.getByTestId("timber-result")).toContainText("철재4 남음");
  expect(errors).toEqual([]);
});
test("B는 보완 없이20을 사용하고 다른 제안으로 재도전해도 기존 생존 상태를 보존한다", async ({
  page,
}) => {
  await enter(page);
  await delivery(page, "B");
  await expect(page.getByTestId("timber-available")).toHaveText("20");
  await expect(page.getByTestId("timber-quarantine")).toHaveText("0");
  await button(page, "사용 가능한 목재 20 둥지에 배분").click();
  await button(page, "지붕 보수·사용 확인").click();
  await expect(page.getByTestId("timber-result")).toContainText("철재2 남음");
  await button(page, "처음부터 다른 선택").click();
  await button(page, "새 체험 확인").click();
  await expect(page.getByTestId("timber-iron")).toHaveText(
    "철재 보유8 · 예약0 · 가용8",
  );
  await button(page, "생존 예제로 돌아가기").click();
  await expect(page.getByTestId("resource-RES_WOOD")).toHaveText("120");
  await expect(page.getByTestId("resource-RES_METAL")).toHaveText("40");
  await expect(page.getByTestId("play-clock")).toHaveText("생존 1일 · 00:00");
});
test("보완 중 저장·새로고침 복원과 이전 저장은 품질·예약·시각을 유지한다", async ({
  page,
}) => {
  await enter(page);
  await delivery(page);
  await button(page, "체험 저장").click();
  await expect(page.getByTestId("timber-save-status")).toHaveText(
    "체험판을 저장했습니다.",
  );
  await button(page, "젖은4 건조·재검사 시작").click();
  await button(page, "1시간 진행").click();
  await button(page, "체험 저장").click();
  await expect(page.getByTestId("timber-save-status")).toHaveText(
    "체험판을 저장했습니다.",
  );
  await page.reload();
  await button(page, "마른 목재20 조달 체험하기").click();
  await button(page, "체험 불러오기").click();
  await expect(page.getByTestId("timber-phase")).toHaveText("건조·재검사");
  await expect(page.getByTestId("timber-clock")).toContainText("9시간 0분");
  await expect(button(page, "체험 시간 시작")).toBeVisible();
  await expect(page.getByTestId("timber-quarantine")).toHaveText("4");
  await button(page, "이전 체험 불러오기").click();
  await expect(page.getByTestId("timber-phase")).toHaveText("불량분 보완");
  await expect(page.getByTestId("timber-clock")).toContainText("8시간 0분");
});
test("손상·저장 쓰기 실패는 현재 진행과 기존 원문을 덮어쓰지 않는다", async ({
  page,
}) => {
  await enter(page);
  await page.evaluate(() =>
    localStorage.setItem("dynosty.timber.saves", "{broken"),
  );
  await button(page, "체험 불러오기").click();
  await expect(page.getByRole("alert")).toContainText("손상");
  await button(page, "체험 저장").click();
  expect(
    await page.evaluate(() => localStorage.getItem("dynosty.timber.saves")),
  ).toBe("{broken");
  await page.evaluate(() => localStorage.removeItem("dynosty.timber.saves"));
  await button(page, "체험 저장").click();
  await expect(page.getByTestId("timber-save-status")).toHaveText(
    "체험판을 저장했습니다.",
  );
  const raw = await page.evaluate(() =>
    localStorage.getItem("dynosty.timber.saves"),
  );
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
  });
  await button(page, "제안 B 선택").click();
  await button(page, "체험 저장").click();
  await expect(page.getByRole("alert")).toContainText("현재 진행");
  expect(
    await page.evaluate(() => localStorage.getItem("dynosty.timber.saves")),
  ).toBe(raw);
  await expect(page.getByTestId("timber-phase")).toHaveText("공급 제안 비교");
});
test("체험 시간·3배속과 비활성 신호·나가기 정지, 지연 후 복구를 실제 Worker로 확인한다", async ({
  page,
}) => {
  await enter(page);
  await button(page, "제안 B 선택").click();
  await button(page, "선택한 제안 약정하기").click();
  await button(page, "수레 출발시키기").click();
  await button(page, "체험 시간 시작").click();
  await expect(page.getByTestId("timber-clock")).not.toHaveText(
    "경과 0시간 0분 / 기한12시간",
  );
  await button(page, "체험 일시정지").click();
  await page.getByLabel("체험 진행 속도").selectOption("3");
  await button(page, "체험 시간 시작").click();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(button(page, "체험 시간 시작")).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const stopped = await page.getByTestId("timber-clock").textContent();
  await page.waitForTimeout(1100);
  await expect(page.getByTestId("timber-clock")).toHaveText(stopped as string);
  await button(page, "생존 예제로 돌아가기").click();
  await page.waitForTimeout(1100);
  await button(page, "마른 목재20 조달 체험하기").click();
  await expect(page.getByTestId("timber-clock")).toHaveText(stopped as string);
  await button(page, "처음부터 다른 선택").click();
  await button(page, "새 체험 확인").click();
  await delivery(page, "B");
  await button(page, "1시간 진행").click();
  await expect(page.getByRole("alert")).toContainText("임시 쉼터");
  await button(page, "사용 가능한 목재 20 둥지에 배분").click();
  await button(page, "지붕 보수·사용 확인").click();
  await expect(page.getByTestId("timber-result")).toContainText("지연");
});
test("좁은 화면에서 키보드로 두 제안을 비교하고 가로 넘침 없이 체험한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await enter(page);
  await button(page, "제안 A 선택").focus();
  await page.keyboard.press("Enter");
  await expect(button(page, "제안 A 선택")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await button(page, "선택한 제안 약정하기").click();
  await expect(page.getByTestId("timber-iron")).toContainText("예약4");
  await button(page, "출발 전 약정 취소").click();
  await expect(page.getByTestId("timber-iron")).toContainText("예약0");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("손상된 보완 종료 시각은 로드 전에 거부하고 현재 작업·저장 원본을 보존한다", async ({
  page,
}) => {
  await enter(page);
  await delivery(page);
  await button(page, "젖은4 건조·재검사 시작").click();
  await button(page, "체험 저장").click();
  await expect(page.getByTestId("timber-save-status")).toHaveText(
    "체험판을 저장했습니다.",
  );
  const corrupt = await page.evaluate(() => {
    const raw = localStorage.getItem("dynosty.timber.saves");
    if (!raw) throw new Error("저장 없음");
    const v = JSON.parse(raw);
    v.current.state.due = v.current.state.elapsed + 1;
    const text = JSON.stringify(v);
    localStorage.setItem("dynosty.timber.saves", text);
    return text;
  });
  await button(page, "체험 불러오기").click();
  await expect(page.getByRole("alert")).toContainText("작업 종료 시각");
  await expect(page.getByTestId("timber-phase")).toHaveText("건조·재검사");
  await button(page, "다음 작업 완료까지").click();
  await expect(page.getByTestId("timber-clock")).toContainText("12시간 0분");
  await expect(page.getByTestId("timber-available")).toHaveText("20");
  expect(
    await page.evaluate(() => localStorage.getItem("dynosty.timber.saves")),
  ).toBe(corrupt);
});
