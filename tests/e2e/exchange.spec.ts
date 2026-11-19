import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { choose, press, reveal, startTimber } from "./labor-tabs.js";

const b = (p: Page, n: string) =>
  p.getByRole("button", { name: n, exact: true });
async function enter(p: Page) {
  await p.goto("/");
  await startTimber(p);
  await press(p, "일손 배치·배급 체험하기");
  await expect(p.getByTestId("labor-clock")).toContainText("0시간 0분");
}
async function initial(p: Page) {
  await enter(p);
  for (const n of [
    "확장 제안 A 선택",
    "확장 약정하기",
    "확장 수레 출발",
    "다음 일손 사건까지",
    "확장 전량 검사 시작",
    "다음 일손 사건까지",
    "확장 정상분 16 받기",
  ])
    await press(p, n);
  await expect(p.getByTestId("exchange-phase")).toHaveText("처리 선택");
}
async function move(p: Page, n: number, job: string) {
  await choose(p, `일손 ${n} 배치`, job);
  await press(p, `일손 ${n} 배정`);
  await expect(p.getByTestId(`crew-${n}-job`)).toHaveText(
    job === "prep" ? "배급 준비" : "목재 보완",
  );
}
async function start(p: Page) {
  await initial(p);
  await press(p, "확장 정상 목재 16 배분");
  await press(p, "불량4 교환 요청");
  await expect(p.getByTestId("labor-iron")).toContainText(
    "철재 4 · 예약 1 · 가용 3",
  );
  await expect(p.getByLabel("일손 1 배치", { exact: true })).toBeDisabled();
  await press(p, "교환 회수 수레 출발");
  for (const n of [2, 3, 4]) await move(p, n, "prep");
}
async function phase(p: Page, name: string, counts: Record<string, string>) {
  await expect(p.getByTestId("exchange-phase")).toHaveText(name);
  await expect(p.getByTestId("labor-total")).toHaveText("물량 합계 20/20");
  for (const [k, v] of Object.entries(counts))
    await expect(p.getByTestId(`labor-${k}`)).toHaveText(v);
}
async function next(p: Page) {
  await press(p, "다음 일손 사건까지");
}
async function reload(p: Page) {
  await p.reload();
  await startTimber(p);
  await press(p, "일손 배치·배급 체험하기");
  await press(p, "일손 체험 불러오기");
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "불러왔습니다",
  );
}
test("불량4 회수·재납품·재검수·수령은 물량20을 보존하고 배급3명과 동시에 완료한다", async ({
  page: p,
}) => {
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await start(p);
  await phase(p, "불량품 회수 중", {
    quarantine: "0",
    transit: "4",
    allocated: "16",
    available: "0",
  });
  await expect(p.getByTestId("labor-iron")).toContainText("철재 3 · 예약 0");
  await next(p);
  await phase(p, "교환품 재납품 중", { transit: "4" });
  await expect(p.getByTestId("labor-clock")).toContainText("9시간 30분");
  await next(p);
  await expect(p.getByTestId("labor-prep")).toContainText("360/360");
  await expect(p.getByTestId("crew-1-job")).toHaveText("교환·재검수");
  await next(p);
  await phase(p, "재납품 도착 · 재검수 대기", {
    transit: "0",
    waiting: "4",
    available: "0",
  });
  await reveal(p, "확장 목재 사용 확인");
  await expect(b(p, "확장 목재 사용 확인")).toHaveCount(0);
  await press(p, "교환품4 재검수 시작");
  await next(p);
  await phase(p, "재검수 합격 · 수령 대기", {
    waiting: "0",
    checked: "4",
    available: "0",
  });
  await expect(p.getByTestId("crew-1-job")).toHaveText("대기");
  await press(p, "재검수 합격4 수령 확인");
  await phase(p, "교환품 수령 완료", {
    checked: "0",
    available: "4",
    allocated: "16",
  });
  await reveal(p, "재검수 합격4 수령 확인");
  await expect(b(p, "재검수 합격4 수령 확인")).toHaveCount(0);
  await press(p, "확장 정상 목재 4 배분");
  await press(p, "확장 목재 사용 확인");
  await expect(p.getByTestId("labor-used")).toHaveText("20");
  await expect(p.getByTestId("labor-result")).toContainText("철재3 남음");
  await expect(p.getByTestId("labor-result")).toContainText(
    "13시간 0분 · 60분 지연",
  );
  await expect(p.getByTestId("labor-result")).toContainText(
    "10시간 0분 · 기한 충족",
  );
  expect(errors).toEqual([]);
});
test("교환 예약 취소 후 현장 보완을 선택해 기존12h·배급11h 경로를 유지한다", async ({
  page: p,
}) => {
  await initial(p);
  await press(p, "불량4 교환 요청");
  await press(p, "교환 요청 취소");
  await expect(p.getByTestId("labor-iron")).toContainText("철재 4 · 예약 0");
  await expect(p.getByTestId("crew-1-job")).toHaveText("대기");
  await press(p, "빈 일손2명 목재 보완 배정");
  await reveal(p, "불량4 교환 요청");
  await expect(b(p, "불량4 교환 요청")).toBeDisabled();
  for (const n of [3, 4]) await move(p, n, "prep");
  await press(p, "일손 1시간 진행");
  await expect(p.getByTestId("labor-repair")).toContainText("60/240");
  await next(p);
  await next(p);
  await press(p, "확장 정상 목재 20 배분");
  await press(p, "확장 목재 사용 확인");
  await expect(p.getByTestId("labor-result")).toContainText("철재4 남음");
  await expect(p.getByTestId("labor-result")).toContainText(
    "12시간 0분 · 기한 충족",
  );
});
test("회수 도중·재검수 도중의 최신/이전 저장을 복원해 추가 비용 없이 남은 시간부터 진행한다", async ({
  page: p,
}) => {
  await start(p);
  await press(p, "일손 1시간 진행");
  await press(p, "일손 체험 저장");
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "저장했습니다",
  );
  await reload(p);
  await phase(p, "불량품 회수 중", { transit: "4", allocated: "16" });
  await expect(p.getByTestId("labor-clock")).toContainText("9시간 0분");
  await expect(p.getByTestId("labor-iron")).toContainText("철재 3");
  await next(p);
  await next(p);
  await next(p);
  await press(p, "교환품4 재검수 시작");
  await press(p, "일손 1시간 진행");
  await press(p, "일손 체험 저장");
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "저장했습니다",
  );
  await reload(p);
  await phase(p, "교환품 재검수 중", { waiting: "4", checked: "0" });
  await expect(p.getByTestId("labor-clock")).toContainText("12시간 0분");
  await expect(
    p.getByRole("progressbar", { name: "교환품 재검수 진행", exact: true }),
  ).toHaveAttribute("value", "60");
  await next(p);
  await expect(p.getByTestId("labor-clock")).toContainText("13시간 0분");
  await expect(p.getByTestId("labor-iron")).toContainText("철재 3");
  await press(p, "이전 일손 체험 불러오기");
  await phase(p, "불량품 회수 중", { transit: "4" });
  await expect(p.getByTestId("labor-clock")).toContainText("9시간 0분");
  await expect(p.getByTestId("crew-1-job")).toHaveText("교환·재검수");
});
test("실제v1 저장은 진행·담당과 기존 목재/생존 저장 원문을 유지하며 읽기 호환한다", async ({
  page: p,
}) => {
  const fixture = JSON.parse(
    readFileSync(
      new URL(
        "../../packages/game-core/src/fixtures/labor-v1-save.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await enter(p);
  const raw = JSON.stringify({
    format: "dynosty-labor-archive",
    storageVersion: 1,
    current: fixture,
    previous: null,
  });
  await p.evaluate((text) => {
    localStorage.setItem("dynosty.labor.saves", text);
    localStorage.setItem("dynosty.timber.saves", "old timber");
    localStorage.setItem("dynosty.play.saves", "old survival");
  }, raw);
  await press(p, "일손 체험 불러오기");
  await expect(p.getByTestId("labor-repair")).toContainText(
    "60/240분 · 배정 1/2명",
  );
  await expect(p.getByTestId("crew-2-job")).toHaveText("배급 준비");
  expect(
    await p.evaluate(() => localStorage.getItem("dynosty.labor.saves")),
  ).toBe(raw);
  await next(p);
  await expect(p.getByTestId("labor-clock")).toContainText("10시간 20분");
  await press(p, "일손 체험 저장");
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "저장했습니다",
  );
  const v = await p.evaluate(
    () => JSON.parse(localStorage.getItem("dynosty.labor.saves") ?? "").current,
  );
  expect(v.saveVersion).toBe(2);
  expect(v.state.repairProgress).toBe(60);
  expect(
    await p.evaluate(() => [
      localStorage.getItem("dynosty.timber.saves"),
      localStorage.getItem("dynosty.play.saves"),
    ]),
  ).toEqual(["old timber", "old survival"]);
});
for (const kind of [
  "missing-departure",
  "fake-receive",
  "out-of-range-end",
] as const)
  test(`손상 교환 저장(${kind})은 현재 진행과 저장 원문을 보존한다`, async ({
    page: p,
  }) => {
    await start(p);
    await press(p, "일손 체험 저장");
    await expect(p.getByTestId("labor-save-status")).toContainText(
      "저장했습니다",
    );
    const raw = await p.evaluate((k) => {
      const a = JSON.parse(localStorage.getItem("dynosty.labor.saves") ?? "");
      if (k === "missing-departure") a.current.state.exchange.departure = null;
      else if (k === "fake-receive") a.current.state.exchange.receivedAt = 480;
      else {
        const s = a.current.state;
        s.elapsed = 14300;
        s.timber.elapsed = 14300;
        s.exchange.requestedAt = 14200;
        s.exchange.departure = 14250;
      }
      const text = JSON.stringify(a);
      localStorage.setItem("dynosty.labor.saves", text);
      return text;
    }, kind);
    await press(p, "일손 체험 불러오기");
    await expect(p.getByRole("alert")).toContainText("교환 저장");
    await phase(p, "불량품 회수 중", { transit: "4", allocated: "16" });
    await press(p, "일손 체험 저장");
    await expect(p.getByRole("alert")).toContainText("교환 저장");
    expect(
      await p.evaluate(() => localStorage.getItem("dynosty.labor.saves")),
    ).toBe(raw);
    await press(p, "일손 1시간 진행");
    await expect(p.getByTestId("labor-clock")).toContainText("9시간 0분");
  });
test("교환 운송과 배급 준비는 실제 Worker 배속에서 함께 진행하고 비활성 신호에서 정지한다", async ({
  page: p,
}) => {
  await start(p);
  await choose(p, "일손 진행 속도", "3");
  await press(p, "일손 시간 시작");
  await expect(p.getByTestId("labor-clock")).not.toContainText("8시간 0분");
  await expect(p.getByTestId("labor-prep")).not.toContainText("0/360");
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
  await phase(p, "불량품 회수 중", { transit: "4" });
});
test("좁은 화면에서도 교환 요청·출발·담당 잠금이 가능하고 가로 넘침이 없다", async ({
  page: p,
}) => {
  await p.setViewportSize({ width: 375, height: 812 });
  await start(p);
  await phase(p, "불량품 회수 중", { transit: "4" });
  expect(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
});
