import { expect, type Page, test } from "@playwright/test";
import {
  requireValue,
  type TimberCommand,
} from "../../packages/game-core/dist/index.js";
import { advanceVillageDay } from "./read-village.js";
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
async function villageCommand(page: Page, command: TimberCommand) {
  const worker = page.workers().find((w) => w.url().includes("timber.worker"));
  if (!worker) throw Error("마을 Worker가 없습니다.");
  await worker.evaluate(
    (cmd) =>
      self.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "command",
            id: crypto.randomUUID(),
            command: cmd,
          },
        }),
      ),
    command,
  );
}
async function saveMenu(page: Page) {
  if (!(await page.locator(".play-shell.is-procurement").count()))
    await page.getByRole("button", { name: "건설", exact: true }).click();
  const button = page.getByRole("button", { name: "저장", exact: true });
  if (
    !(await page
      .getByRole("button", { name: "진행 저장", exact: true })
      .isVisible())
  )
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
  for (const id of ["RES_PLANT", "RES_MEAT", "RES_FISH", "RES_COAL"])
    await expect(stock(page, id)).toHaveText("1,000");
  await villageCommand(page, { type: "build-restaurant" });
  await advanceVillageDay(page);
  await expect(page.getByTestId("play-clock")).toContainText("2일차");
  await villageCommand(page, { type: "set-restaurant-workers", count: 2 });
  const secondDay = await stock(page).innerText();
  await saveMenu(page);
  const save = page.getByRole("button", { name: "진행 저장", exact: true });
  await save.click();
  await expect(page.getByTestId("timber-save-status")).toContainText(
    "저장했습니다",
  );
  await advanceVillageDay(page);
  await expect(page.getByTestId("play-clock")).toContainText("3일차");
  const thirdDay = await stock(page).innerText();
  expect(Number(thirdDay.replaceAll(",", ""))).toBeLessThan(
    Number(secondDay.replaceAll(",", "")),
  );
  await save.click();
  await page
    .getByRole("button", { name: "이전 진행 불러오기", exact: true })
    .click();
  await expect(stock(page)).toHaveText(secondDay);
  await expect(page.getByTestId("play-clock")).toContainText("2일차");
  await page.reload();
  await expect(stock(page)).toHaveText(secondDay);
  await saveMenu(page);
  await page
    .getByRole("button", { name: "진행 불러오기", exact: true })
    .click();
  await expect(stock(page)).toHaveText(thirdDay);
  await expect(page.getByTestId("play-clock")).toContainText("3일차");
  expect(
    await page.evaluate(() => localStorage.getItem("dynosty.example.saves")),
  ).toBe("keep example");
});

test("실제 Worker 시간이 흐르고 일시정지·탭 비활성 뒤 수동 재개를 적용한다", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "게임 시작", exact: true }).click();
  await expect(page.getByTestId("play-clock")).not.toHaveText("1일차 · 00:00");
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  const clock = await page.getByTestId("play-clock").textContent();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("play-clock")).toHaveText(clock ?? "");
  await page.getByRole("button", { name: "게임 시작", exact: true }).click();
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
  await page
    .getByRole("button", { name: "식량 고갈 검사", exact: true })
    .click();
  await expect(page.getByTestId("food-warnings").locator("p")).toHaveCount(3);
  for (const id of ["RES_PLANT", "RES_MEAT", "RES_FISH"])
    await expect(stock(page, id)).toHaveText("0");
  await page
    .getByRole("button", { name: "식량 고갈 검사", exact: true })
    .click();
  await expect(page.getByTestId("food-warnings").locator("p")).toHaveCount(3);
  await page
    .getByRole("button", { name: "1일분 식량 복구", exact: true })
    .click();
  await expect(page.getByTestId("food-warnings")).toBeHidden();
  await expect(stock(page)).toHaveText("20");
  await expect(page.getByText("1일차", { exact: true })).toBeVisible();
});

test("게임 저장 실패·손상은 현재 게임과 기존 원문을 보존한다", async ({
  page,
}) => {
  await ready(page);
  await saveMenu(page);
  await page.getByRole("button", { name: "진행 저장", exact: true }).click();
  await expect(page.getByTestId("timber-save-status")).toHaveText(
    "마을 진행을 저장했습니다.",
  );
  const before = await page.evaluate(() =>
    localStorage.getItem("dynosty.timber.saves.v17"),
  );
  await advanceVillageDay(page);
  await saveMenu(page);
  await expect(stock(page)).toHaveText("1,000");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "dynosty.timber.saves.v17")
        throw new DOMException("quota", "QuotaExceededError");
      return original.call(this, k, v);
    };
    Object.assign(window, {
      restoreWrite: () => {
        Storage.prototype.setItem = original;
      },
    });
  });
  await page.getByRole("button", { name: "진행 저장", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /저장/ }),
  ).toContainText("유지");
  expect(
    await page.evaluate(() => localStorage.getItem("dynosty.timber.saves.v17")),
  ).toBe(before);
  await expect(stock(page)).toHaveText("1,000");
  await page.evaluate(() =>
    (window as unknown as { restoreWrite: () => void }).restoreWrite(),
  );
  await page.evaluate(() =>
    localStorage.setItem("dynosty.timber.saves.v17", "{broken"),
  );
  await page
    .getByRole("button", { name: "진행 불러오기", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: /저장/ }),
  ).toContainText("손상");
  await expect(stock(page)).toHaveText("1,000");
  expect(
    await page.evaluate(() => localStorage.getItem("dynosty.timber.saves.v17")),
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
  expect(loaded.some((x) => x.endsWith("BLD_NEST.glb"))).toBe(true);
  expect(loaded.some((x) => x.endsWith("R02_Triceratops.glb"))).toBe(true);
  const canvas = page.locator("canvas");
  const idle = await canvas.screenshot();
  await expect
    .poll(async () => (await canvas.screenshot()).equals(idle))
    .toBe(false);
  await tools(page);
  await page
    .getByRole("button", { name: "3D 연결 예제 바꾸기", exact: true })
    .click();
  await expect(page.getByTestId("scene-example-motion")).toHaveText(
    "걷기 표시",
  );
  const walk = await canvas.screenshot();
  await expect
    .poll(async () => (await canvas.screenshot()).equals(walk))
    .toBe(false);
  await page
    .getByRole("button", { name: "개발 도구 닫기", exact: true })
    .click();
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
  await page.getByRole("button", { name: "기본 시점", exact: true }).click();
  await expect(page.getByTestId("camera-distance")).toHaveText("56.00");
  await expect(page.getByTestId("camera-angle")).toHaveText("54.00");
  await clickExample(page, "building");
  await expect(
    page.getByRole("region", { name: "선택 정보", exact: true }),
  ).toContainText("복홀 방 게시판");
  expect(errors).toEqual([]);
});

test("대표 모델 요청 실패는 명확히 안내하고 대체 표시로 게임을 유지한다", async ({
  page,
}) => {
  await page.route("**/models/triceratops.json", (route) =>
    route.fulfill({ status: 404, body: "missing" }),
  );
  await ready(page);
  await expect(page.getByRole("alert")).toContainText("대표 모델");
  const beforeScroll = await page.evaluate(() => scrollY);
  await clickExample(page, "resident");
  expect(await page.evaluate(() => scrollY)).toBe(beforeScroll);
  await expect(
    page.getByRole("region", { name: "선택 정보", exact: true }),
  ).toContainText("주민 예제");
  await expect(page.getByTestId("play-population")).toHaveText("주민 60명");
});

test("저울 설명은 가리킬 때 나타나고 상단 재고는 같은 간격의 정수로 표시된다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1320, height: 880 });
  await ready(page);
  const hope = page.locator(".g-mood__v").first();
  await expect(hope).toBeHidden();
  await page.getByRole("button", { name: "희망과 절망 확인" }).hover();
  await expect(hope).toBeVisible();
  await page.getByRole("button", { name: "게임 시작", exact: true }).click();
  await expect(page.getByTestId("play-clock")).not.toHaveText("1일차 · 00:00");
  for (const n of await page.locator(".resource-card strong").allTextContents())
    expect(n).toMatch(/^[\d,]+$/);
  const cells = await page
    .locator(".resource-card")
    .evaluateAll((items) =>
      items.map((el) => el.getBoundingClientRect().width),
    );
  expect(Math.max(...cells) - Math.min(...cells)).toBeLessThan(1);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  await page.getByTestId("play-population").evaluate((el) => {
    el.textContent = "주민 9999명";
  });
  await page.locator(".resource-card strong").evaluateAll((items) => {
    for (const el of items) el.textContent = "99,999";
  });
  for (const width of [1100, 1320, 1920]) {
    await page.setViewportSize({ width, height: 880 });
    const fits = await page.locator(".resource-card").evaluateAll((items) =>
      items.every((el) => {
        const bounds = el.getBoundingClientRect();
        return [...el.querySelectorAll("img,strong")].every((child) => {
          const rect = child.getBoundingClientRect();
          return rect.left >= bounds.left && rect.right <= bounds.right;
        });
      }),
    );
    expect(fits).toBe(true);
    const summary = await page
      .locator(".settlement-heading p")
      .evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getBoundingClientRect().right;
      });
    expect(summary).toBeLessThan(
      requireValue(
        await page.locator(".g-top__frame img").nth(2).boundingBox(),
        "화면 위치",
      ).x,
    );
    const frame = page.locator(".g-top__frame img.grow");
    const left = requireValue(await frame.first().boundingBox(), "화면 위치");
    const right = requireValue(await frame.last().boundingBox(), "화면 위치");
    const plant = requireValue(
      await page.locator(".resource-card img").first().boundingBox(),
      "화면 위치",
    );
    const coal = requireValue(
      await page.getByTestId("resource-RES_COAL").boundingBox(),
      "화면 위치",
    );
    expect(plant.x).toBeGreaterThanOrEqual(left.x + 8);
    expect(coal.x + coal.width).toBeLessThanOrEqual(right.x + right.width - 8);
  }
  await expect(hope).toBeHidden();
});
