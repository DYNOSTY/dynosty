import { expect, type Page, test } from "@playwright/test";
import { press } from "./labor-tabs.js";
import { clickExample } from "./scene-picking.js";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("play-population")).toHaveText("주민 60명");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
  );
}
const stock = (page: Page, id = "RES_PLANT") =>
  page.getByTestId(`resource-${id}`);
async function saveMenu(page: Page) {
  const button = page.getByRole("button", { name: "저장", exact: true });
  if ((await button.getAttribute("aria-expanded")) !== "true")
    await button.click();
}
async function tools(page: Page) {
  const button = page.getByRole("button", { name: "개발 도구", exact: true });
  if ((await button.getAttribute("aria-expanded")) !== "true")
    await button.click();
}

test("승인 초기 상태·식성별 소비와 실제 게임 최근/직전 저장·새로고침 복원", async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(() =>
    localStorage.setItem("dynosty.example.saves", "keep example"),
  );
  for (const id of ["RES_PLANT", "RES_MEAT", "RES_FISH"])
    await expect(stock(page, id)).toHaveText("120");
  await expect(stock(page, "RES_COAL")).toHaveText("60");
  await press(page, "1일 진행");
  await expect(page.getByText("2일차", { exact: true })).toBeVisible();
  for (const id of ["RES_PLANT", "RES_MEAT", "RES_FISH"])
    await expect(stock(page, id)).toHaveText("100");
  await saveMenu(page);
  await press(page, "게임 저장");
  await expect(page.getByTestId("play-save-status")).toHaveText(
    "게임을 저장했습니다.",
  );
  await press(page, "저장 닫기");
  await press(page, "1일 진행");
  await expect(stock(page)).toHaveText("80");
  await saveMenu(page);
  await press(page, "게임 저장");
  await expect(page.getByTestId("play-save-status")).toHaveText(
    "게임을 저장했습니다.",
  );
  await press(page, "이전 게임 불러오기");
  await expect(stock(page)).toHaveText("100");
  await expect(page.getByText("2일차", { exact: true })).toBeVisible();
  await page.reload();
  await expect(stock(page)).toHaveText("120");
  await saveMenu(page);
  await press(page, "게임 불러오기");
  await expect(stock(page)).toHaveText("80");
  await expect(page.getByText("3일차", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("dynosty.example.saves")),
  ).toBe("keep example");
});

test("실제 Worker 시간이 흐르고 일시정지·탭 비활성 뒤 수동 재개를 적용한다", async ({
  page,
}) => {
  await ready(page);
  await press(page, "게임 시작");
  await expect(page.getByTestId("play-clock")).not.toHaveText(
    "생존 1일 · 00:00",
  );
  await expect
    .poll(async () =>
      Number((await stock(page).textContent())?.replaceAll(",", "")),
    )
    .toBeLessThan(120);
  await press(page, "일시정지");
  const clock = await page.getByTestId("play-clock").textContent();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("play-clock")).toHaveText(clock ?? "");
  await press(page, "게임 시작");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByRole("button", { name: "게임 시작", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByRole("button", { name: "게임 시작", exact: true }),
  ).toBeVisible();
});

test("식량 고갈 경고는 식성별로 한 번 표시하고 1일분 보충 시 해제한다", async ({
  page,
}) => {
  await ready(page);
  await tools(page);
  await press(page, "식량 고갈 검사");
  await expect(page.getByTestId("food-warnings").locator("p")).toHaveCount(3);
  for (const id of ["RES_PLANT", "RES_MEAT", "RES_FISH"])
    await expect(stock(page, id)).toHaveText("0");
  await press(page, "식량 고갈 검사");
  await expect(page.getByTestId("food-warnings").locator("p")).toHaveCount(3);
  await press(page, "1일분 식량 복구");
  await expect(page.getByTestId("food-warnings")).toBeHidden();
  await expect(stock(page)).toHaveText("20");
  await expect(page.getByText("1일차", { exact: true })).toBeVisible();
});

test("게임 저장 실패·손상은 현재 게임과 기존 원문을 보존한다", async ({
  page,
}) => {
  await ready(page);
  await saveMenu(page);
  await press(page, "게임 저장");
  await expect(page.getByTestId("play-save-status")).toHaveText(
    "게임을 저장했습니다.",
  );
  const before = await page.evaluate(() =>
    localStorage.getItem("dynosty.play.saves"),
  );
  await press(page, "저장 닫기");
  await press(page, "1일 진행");
  await saveMenu(page);
  await expect(stock(page)).toHaveText("100");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "dynosty.play.saves")
        throw new DOMException("quota", "QuotaExceededError");
      return original.call(this, k, v);
    };
    Object.assign(window, {
      restoreWrite: () => {
        Storage.prototype.setItem = original;
      },
    });
  });
  await press(page, "게임 저장");
  await expect(
    page.getByRole("region", { name: "생존 게임 저장" }).getByRole("alert"),
  ).toContainText("기존 기록은 유지");
  expect(
    await page.evaluate(() => localStorage.getItem("dynosty.play.saves")),
  ).toBe(before);
  await expect(stock(page)).toHaveText("100");
  await page.evaluate(() =>
    (window as unknown as { restoreWrite: () => void }).restoreWrite(),
  );
  await page.evaluate(() =>
    localStorage.setItem("dynosty.play.saves", "{broken"),
  );
  await press(page, "게임 불러오기");
  await expect(
    page.getByRole("region", { name: "생존 게임 저장" }).getByRole("alert"),
  ).toContainText("손상");
  await expect(stock(page)).toHaveText("100");
  expect(
    await page.evaluate(() => localStorage.getItem("dynosty.play.saves")),
  ).toBe("{broken");
});

test("대표 모델 파일·대기/걷기 전환과 카메라 한계·기본 시점을 실제 장면에서 확인한다", async ({
  page,
}) => {
  // GLB 로딩·실제 렌더 캡처·반복 휠 조작을 소프트웨어 렌더러에서도 끝까지 확인한다.
  test.setTimeout(480_000);
  const loaded: string[] = [];
  const errors: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/models/") && r.status() === 200)
      loaded.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  expect(loaded.some((x) => x.endsWith("triceratops.json"))).toBe(true);
  expect(loaded.some((x) => x.endsWith("ondol-nest.json"))).toBe(true);
  // 블렌더로 깎은 판(_v2)을 먼저 씀
  expect(loaded.some((x) => /BLD_NEST(_v2)?.glb$/.test(x))).toBe(true);
  expect(loaded.some((x) => /R02_Triceratops(_v2)?.glb$/.test(x))).toBe(true);
  const canvas = page.locator("canvas");
  const idle = await canvas.screenshot();
  await expect
    .poll(async () => (await canvas.screenshot()).equals(idle))
    .toBe(false);
  await tools(page);
  await press(page, "3D 연결 예제 바꾸기");
  await expect(page.getByTestId("scene-example-motion")).toHaveText(
    "걷기 표시",
  );
  const walk = await canvas.screenshot();
  await expect
    .poll(async () => (await canvas.screenshot()).equals(walk))
    .toBe(false);
  await press(page, "개발 도구 닫기");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("캔버스 없음");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 500, {
    steps: 12,
  });
  await page.mouse.up();
  await expect
    .poll(async () =>
      Number(await page.getByTestId("camera-angle").textContent()),
    )
    .toBeLessThanOrEqual(77.36);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (const [delta, limit] of [
    [-10000, 4],
    [100000, 140],
  ] as const) {
    // 새 카메라는 휠 한 번의 변화를 제한한다. 실제 입력을 반복해 한계를 확인한다.
    await expect
      .poll(
        async () => {
          await page.mouse.wheel(0, delta);
          return Number(
            await page.getByTestId("camera-distance").textContent(),
          );
        },
        { timeout: 150_000, intervals: [100, 100, 200] },
      )
      .toBe(limit);
  }
  await expect
    .poll(async () =>
      Number(await page.getByTestId("camera-height").textContent()),
    )
    .toBeGreaterThan(0.8);
  await press(page, "기본 시점");
  await expect(page.getByTestId("camera-distance")).toHaveText("56.00");
  await expect(page.getByTestId("camera-angle")).toHaveText("54.00");
  await clickExample(page, "building");
  const info = page.getByRole("region", { name: "선택 정보", exact: true });
  await expect(
    info.getByRole("heading", { name: "온돌", exact: true }),
  ).toBeVisible();
  const heat = info.getByRole("button", { name: "화력 보통", exact: true });
  await expect(heat).toBeVisible();
  await expect(heat).toBeEnabled();
  expect(errors).toEqual([]);
});

test("대표 모델 요청 실패는 명확히 안내하고 대체 표시로 게임을 유지한다", async ({
  page,
}) => {
  let blockedWinterResident = false;
  await page.route("**/models/residents/R02_Triceratops_v2.glb", (route) => {
    blockedWinterResident = true;
    return route.fulfill({ status: 404, body: "missing" });
  });
  await ready(page);
  await expect.poll(() => blockedWinterResident).toBe(true);
  await expect(page.getByRole("alert")).toHaveText(
    "모델을 만들지 못해 연결 예제로 표시합니다.",
  );
  const resident = page.getByRole("button", {
    name: "주민 예제 선택",
    exact: true,
  });
  await resident.focus();
  const beforeScroll = await page.evaluate(() => scrollY);
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => scrollY)).toBe(beforeScroll);
  await expect(resident).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("region", { name: "선택 정보", exact: true }),
  ).toContainText("트리케라톱스");
  await expect(page.getByTestId("play-population")).toHaveText("주민 60명");
});
