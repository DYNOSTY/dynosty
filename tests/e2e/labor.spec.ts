import { expect, type Page, test } from "@playwright/test";
import { choose, press, reveal } from "./labor-tabs.js";

const b = (p: Page, n: string) =>
  p.getByRole("button", { name: n, exact: true });
async function enter(p: Page) {
  await p.goto("/");
  await press(p, "마른 목재20 조달 체험하기");
  await press(p, "일손 배치·배급 체험하기");
  await expect(p.getByTestId("labor-clock")).toContainText("0시간 0분");
}
async function start(p: Page, offer = "A") {
  await press(p, `확장 제안 ${offer} 선택`);
  await press(p, "확장 약정하기");
  await expect(p.getByTestId("crew-1-job")).toHaveText("운송·검사");
  await expect(p.getByLabel("일손 1 배치", { exact: true })).toBeDisabled();
  await press(p, "확장 수레 출발");
}
async function move(p: Page, n: number, to: string) {
  const before = await p.getByTestId(`crew-${n}-job`).textContent();
  await choose(p, `일손 ${n} 배치`, to);
  await press(p, `일손 ${n} ${before === "대기" ? "배정" : "재배치"}`);
  await expect(p.getByTestId(`crew-${n}-job`)).toHaveText(
    to === "repair" ? "목재 보완" : to === "prep" ? "배급 준비" : "대기",
  );
}
async function prepareA(p: Page) {
  await start(p);
  await press(p, "다음 일손 사건까지");
  await press(p, "확장 전량 검사 시작");
  await press(p, "다음 일손 사건까지");
  await press(p, "확장 정상분 16 받기");
  await press(p, "빈 일손2명 목재 보완 배정");
  await expect(p.getByTestId("crew-1-job")).toHaveText("목재 보완");
  await move(p, 3, "prep");
  await move(p, 4, "prep");
}
test("A: 같은 시간에 목재·배급 작업이 진행되고 줄이 줄며 각각 완료한다", async ({
  page: p,
}) => {
  await enter(p);
  await prepareA(p);
  await press(p, "일손 1시간 진행");
  await expect(p.getByTestId("labor-repair")).toContainText("60/240");
  await expect(p.getByTestId("labor-prep")).toContainText("120/360");
  await expect(p.getByTestId("labor-queue")).toHaveText("대기 2무리");
  await press(p, "다음 일손 사건까지");
  await expect(p.getByTestId("labor-clock")).toContainText("11시간 0분");
  await expect(p.getByTestId("labor-repair")).toContainText("180/240");
  await expect(p.getByTestId("labor-queue")).toHaveText("대기 0무리");
  await press(p, "다음 일손 사건까지");
  await press(p, "확장 정상 목재 20 배분");
  await press(p, "확장 목재 사용 확인");
  await expect(p.getByTestId("labor-used")).toHaveText("20");
  await expect(p.getByTestId("labor-result")).toContainText("60분 지연");
});
test("재배치는 중복 없이 보완을 멈추고 저장·새로고침 후 남은 시간부터 이어간다", async ({
  page: p,
}) => {
  await enter(p);
  await prepareA(p);
  await press(p, "일손 1시간 진행");
  await move(p, 2, "prep");
  await press(p, "일손 체험 저장");
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "저장했습니다",
  );
  await p.reload();
  await press(p, "마른 목재20 조달 체험하기");
  await press(p, "일손 배치·배급 체험하기");
  await press(p, "일손 체험 불러오기");
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "불러왔습니다",
  );
  await expect(p.getByTestId("labor-repair")).toContainText(
    "60/240분 · 배정 1/2명",
  );
  await expect(p.getByTestId("labor-prep")).toContainText("120/360");
  await expect(p.getByTestId("crew-2-job")).toHaveText("배급 준비");
  await press(p, "다음 일손 사건까지");
  await expect(p.getByTestId("labor-clock")).toContainText("10시간 20분");
  await expect(p.getByTestId("labor-repair")).toContainText("60/240");
  await move(p, 2, "repair");
  await press(p, "다음 일손 사건까지");
  await expect(p.getByTestId("labor-clock")).toContainText("13시간 20분");
  await expect(p.getByTestId("labor-repair")).toContainText("240/240");
});
test("B: 운송 중 남은3명으로 배급을 정시에 끝내고 목재도12시간에 사용한다", async ({
  page: p,
}) => {
  await enter(p);
  await start(p, "B");
  await press(p, "다음 일손 사건까지");
  for (const n of [2, 3, 4]) await move(p, n, "prep");
  await press(p, "다음 일손 사건까지");
  await expect(p.getByTestId("labor-clock")).toContainText("10시간 0분");
  await expect(p.getByTestId("labor-queue")).toHaveText("대기 0무리");
  await press(p, "확장 전량 검사 시작");
  await press(p, "다음 일손 사건까지");
  await press(p, "확장 정상분 20 받기");
  await press(p, "확장 정상 목재 20 배분");
  await press(p, "확장 목재 사용 확인");
  await expect(p.getByTestId("labor-result")).toContainText("기한 충족");
  await expect(p.getByTestId("labor-iron")).toContainText("철재 2");
});
test("손상 저장 거부 시 현재 배정과 저장 원문을 모두 보존한다", async ({
  page: p,
}) => {
  await enter(p);
  await prepareA(p);
  await press(p, "일손 체험 저장");
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "저장했습니다",
  );
  const raw = await p.evaluate(() => {
    const a = JSON.parse(localStorage.getItem("dynosty.labor.saves") ?? "");
    a.current.state.crew[1].id = "crew-1";
    const text = JSON.stringify(a);
    localStorage.setItem("dynosty.labor.saves", text);
    return text;
  });
  await press(p, "일손 체험 불러오기");
  await expect(p.getByRole("alert")).toContainText("중복");
  await expect(p.getByTestId("crew-2-job")).toHaveText("목재 보완");
  await press(p, "일손 체험 저장");
  await expect(p.getByRole("alert")).toContainText("중복");
  expect(
    await p.evaluate(() => localStorage.getItem("dynosty.labor.saves")),
  ).toBe(raw);
  await press(p, "일손 1시간 진행");
  await expect(p.getByTestId("labor-repair")).toContainText("60/240");
});
test("기존 저장과 이전 일손 저장을 보존하고 다른 체험으로 나가면 멈춘다", async ({
  page: p,
}) => {
  await enter(p);
  await p.evaluate(() => {
    localStorage.setItem("dynosty.timber.saves", "keep timber");
    localStorage.setItem("dynosty.play.saves", "keep survival");
  });
  await press(p, "일손 체험 저장");
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "저장했습니다",
  );
  await press(p, "일손 1시간 진행");
  await press(p, "일손 체험 저장");
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "저장했습니다",
  );
  await press(p, "이전 일손 체험 불러오기");
  await expect(p.getByTestId("labor-clock")).toContainText("0시간 0분");
  await press(p, "일손 시간 시작");
  await press(p, "기존 목재 체험 보기");
  await p.waitForTimeout(1200);
  await press(p, "일손 배치·배급 체험하기");
  await reveal(p, "일손 시간 시작");
  await expect(b(p, "일손 시간 시작")).toBeVisible();
  const clock = await p.getByTestId("labor-clock").textContent();
  await p.waitForTimeout(1200);
  await expect(p.getByTestId("labor-clock")).toHaveText(clock ?? "");
  expect(
    await p.evaluate(() => [
      localStorage.getItem("dynosty.timber.saves"),
      localStorage.getItem("dynosty.play.saves"),
    ]),
  ).toEqual(["keep timber", "keep survival"]);
});
test("좁은 화면에서도 일손 배치 조작이 가능하고 가로 넘침이 없다", async ({
  page: p,
}) => {
  await p.setViewportSize({ width: 375, height: 812 });
  await enter(p);
  await prepareA(p);
  await move(p, 2, "prep");
  await expect(p.getByTestId("crew-2-job")).toHaveText("배급 준비");
  expect(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("일손 저장 쓰기 실패는 현재 진행과 최근·이전 저장을 보존한다", async ({
  page: p,
}) => {
  await enter(p);
  await prepareA(p);
  await press(p, "일손 체험 저장");
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "저장했습니다",
  );
  await press(p, "일손 1시간 진행");
  await press(p, "일손 체험 저장");
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "저장했습니다",
  );
  const raw = await p.evaluate(() =>
    localStorage.getItem("dynosty.labor.saves"),
  );
  await p.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "dynosty.labor.saves")
        throw new DOMException("quota", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await press(p, "일손 체험 저장");
  await expect(p.getByRole("alert")).toContainText("기존 원본은 유지");
  expect(
    await p.evaluate(() => localStorage.getItem("dynosty.labor.saves")),
  ).toBe(raw);
  await expect(p.getByTestId("labor-repair")).toContainText("60/240");
  await press(p, "일손 1시간 진행");
  await expect(p.getByTestId("labor-repair")).toContainText("120/240");
});
test("실제 Worker 배속과 비활성 신호는 일손 시간을 멈춘 뒤 명시적으로 재개한다", async ({
  page: p,
}) => {
  await enter(p);
  await choose(p, "일손 진행 속도", "3");
  await press(p, "일손 시간 시작");
  await expect(p.getByTestId("labor-clock")).not.toContainText("0시간 0분");
  await p.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await reveal(p, "일손 시간 시작");
  await expect(b(p, "일손 시간 시작")).toBeVisible();
  const clock = await p.getByTestId("labor-clock").textContent();
  await p.waitForTimeout(1200);
  await expect(p.getByTestId("labor-clock")).toHaveText(clock ?? "");
  await p.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await reveal(p, "일손 시간 시작");
  await expect(b(p, "일손 시간 시작")).toBeVisible();
  await press(p, "일손 시간 시작");
  await expect(p.getByTestId("labor-clock")).not.toHaveText(clock ?? "");
  await press(p, "일손 일시정지");
});
for (const kind of ["prep-at-open", "repair-paused"] as const) {
  test(`경과 시간상 불가능한 저장(${kind})을 거부하고 현재 진행·원문을 보존한다`, async ({
    page: p,
  }) => {
    await enter(p);
    await prepareA(p);
    if (kind === "repair-paused") await move(p, 2, "prep");
    await press(p, "일손 체험 저장");
    await expect(p.getByTestId("labor-save-status")).toContainText(
      "저장했습니다",
    );
    const raw = await p.evaluate((k) => {
      const a = JSON.parse(localStorage.getItem("dynosty.labor.saves") ?? "");
      if (k === "prep-at-open") a.current.state.prepProgress = 1;
      else a.current.state.repairProgress = 1;
      const text = JSON.stringify(a);
      localStorage.setItem("dynosty.labor.saves", text);
      return text;
    }, kind);
    await press(p, "일손 체험 불러오기");
    await expect(p.getByRole("alert")).toContainText("경과 시간");
    await expect(p.getByTestId("labor-clock")).toContainText("8시간 0분");
    await expect(p.getByTestId("labor-repair")).toContainText("0/240");
    await expect(p.getByTestId("labor-prep")).toContainText("0/360");
    await expect(p.getByTestId("crew-2-job")).toHaveText(
      kind === "prep-at-open" ? "목재 보완" : "배급 준비",
    );
    expect(
      await p.evaluate(() => localStorage.getItem("dynosty.labor.saves")),
    ).toBe(raw);
    await press(p, "일손 체험 저장");
    await expect(p.getByRole("alert")).toContainText("경과 시간");
    expect(
      await p.evaluate(() => localStorage.getItem("dynosty.labor.saves")),
    ).toBe(raw);
  });
}
