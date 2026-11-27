import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  clickExample,
  examplePoint,
  outlinePixels,
  worldPoint,
} from "./scene-picking.js";

// 복홀 방 게시판은 마을 장면의 (0, 0, 4)에 서고(App.tsx), 게시판 판은 바닥 위 약 1.87m다.
const BOARD: [number, number, number] = [0, 1.87, 4];
// 관아는 측량된 터(0, -16)에 있다(game-core bokhol.ts).
const OFFICE: [number, number, number] = [0, 1.4, -16];

async function clickBoard(page: Page) {
  const point = await worldPoint(page, BOARD, false);
  await page.mouse.click(point.x, point.y);
}

// 마당은 주민·집으로 붐빈다. 실제 카메라 광선이 맨땅에 닿고 콘솔 위에 보이는 지점을 골라 누른다.
async function clickEmptyGround(page: Page) {
  const bar = await page.locator(".g-console").boundingBox();
  for (const world of [
    [8, 0, -12],
    [-16, 0, -8],
    [14, 0, 4],
    [10, 0, 10],
    [20, 0, -6],
  ] as const) {
    const point = await worldPoint(page, world, false);
    if (bar && point.y >= bar.y) continue;
    const ground = await page.locator("canvas").evaluate((el, { x, y }) => {
      const r = el.getBoundingClientRect();
      const scene = (
        window as unknown as {
          __scene: {
            pick(x: number, y: number): { pickedMesh: { id: string } | null };
          };
        }
      ).__scene;
      return (
        scene.pick(x - r.x, y - r.y).pickedMesh?.id === "procurement-ground"
      );
    }, point);
    if (!ground) continue;
    await page.mouse.click(point.x, point.y);
    return;
  }
  throw new Error("누를 빈 바닥이 없습니다.");
}

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = (
          window as unknown as {
            __scene: {
              getMeshById(name: string): { getChildMeshes(): unknown[] } | null;
            };
          }
        ).__scene;
        return (
          scene.getMeshById("example-building-1")?.getChildMeshes().length ?? 0
        );
      }),
    )
    .toBeGreaterThan(0);
}

test("건물·주민을 실제 클릭해 테두리와 정보를 전환하고 빈 바닥에서 해제한다", async ({
  page,
}) => {
  // Usually 80–90 s on hosted runners; slow runners exceeded the 120 s limit.
  test.slow();
  const errors: string[] = [];
  let navigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations += 1;
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await page.evaluate(() =>
    localStorage.setItem("dynosty.example.saves", "keep saved data"),
  );
  // 패널 전환에 따른 장면 폭 변경 없이 실제 테두리 픽셀의 변화를 비교한다.
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await page.getByRole("button", { name: "저장 닫기", exact: true }).click();
  const canvas = page.locator("canvas");
  expect(outlinePixels(await canvas.screenshot())).toBe(0);
  await clickBoard(page);
  const info = page.getByRole("region", { name: "선택 정보", exact: true });
  await expect(
    info.getByText("복홀 방 게시판", { exact: false }),
  ).toBeVisible();
  await expect(
    info.getByText("정책 시행 · 필요량에 따른 배급", { exact: true }),
  ).toBeVisible();
  // 예제 선택 버튼은 제출본에서 개발 도구 전용으로 숨어 있지만 선택 상태는 계속 따라간다.
  const pressed = page.locator(
    '[aria-label="예제 대상 선택"] button[aria-pressed="true"]',
  );
  await expect(pressed).toHaveText("건물 예제 선택");
  await expect
    .poll(async () => outlinePixels(await canvas.screenshot()))
    .toBeGreaterThan(20);
  await page.screenshot({
    path: test.info().outputPath("bokhol-notice-board.png"),
  });
  // 마을 주민은 예제 이름 대신 주민 이름(example-resident-1 = 돌쇠)으로 보인다.
  await clickExample(page, "resident");
  await expect(info.getByRole("heading", { name: "돌쇠" })).toBeVisible();
  await expect(info.getByText("주민", { exact: true })).toBeVisible();
  await expect(info.getByText("대기 표시", { exact: true })).toBeVisible();
  await expect(pressed).toHaveText("주민 예제 선택");
  await clickEmptyGround(page);
  await expect(info).toBeHidden();
  await expect
    .poll(async () => outlinePixels(await canvas.screenshot()))
    .toBe(0);
  await expect(page.getByText("1일차", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("dynosty.example.saves")),
  ).toBe("keep saved data");
  expect(errors).toEqual([]);
  expect(navigations).toBe(1);
});

test("카메라 드래그·우클릭은 대상 선택이나 선택 해제로 처리하지 않는다", async ({
  page,
}) => {
  await ready(page);
  await clickBoard(page);
  const info = page.getByRole("region", { name: "선택 정보", exact: true });
  await expect(info).toContainText("복홀 방 게시판");
  const p = await worldPoint(page, BOARD, false);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 90, p.y + 30, { steps: 12 });
  await page.mouse.up();
  await expect(info).toContainText("복홀 방 게시판");
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("캔버스 없음");
  await page.mouse.click(box.x + 10, box.y + 10, { button: "right" });
  await expect(info).toContainText("복홀 방 게시판");
});

test("장면 갱신·저장 복원·메뉴 토글 후에도 같은 대상의 최신 예제 정보를 표시한다", async ({
  page,
}) => {
  await ready(page);
  await clickExample(page, "resident");
  const info = page.getByRole("region", { name: "선택 정보", exact: true });
  await expect(info).toContainText("대기 표시");
  await page.getByRole("button", { name: "개발 도구", exact: true }).click();
  await page
    .getByRole("button", { name: "3D 연결 예제 바꾸기", exact: true })
    .click();
  await expect(info).toContainText("걷기 표시");
  await expect(info).toContainText("2, 0, 1");
  await page.getByRole("button", { name: "예제 저장", exact: true }).click();
  await expect(page.getByTestId("local-save-status")).toHaveText(
    "예제를 저장했습니다.",
  );
  await page
    .getByRole("button", { name: "3D 연결 예제 바꾸기", exact: true })
    .click();
  await expect(info).toContainText("대기 표시");
  await page
    .getByRole("button", { name: "저장 불러오기", exact: true })
    .click();
  await expect(info).toContainText("걷기 표시");
  await page
    .getByRole("button", { name: "개발 도구 닫기", exact: true })
    .click();
  await expect(info).toBeVisible();
  await page.reload();
  await expect(info).toBeHidden();
});

test("마당의 시설과 주민, 게시판을 눌러도 하단 콘솔이 움직이지 않는다", async ({
  page,
}) => {
  await ready(page);
  const panel = page.getByRole("region", { name: "선택 정보", exact: true });
  const consoleBox = () => page.locator(".g-console").boundingBox();
  const before = await consoleBox();
  // 관아(마을 시설)와 마을 주민(돌쇠)을 실제로 누른다.
  for (const [point, label] of [
    [() => worldPoint(page, OFFICE, false), "관아"],
    [() => examplePoint(page, "resident"), "돌쇠"],
  ] as const) {
    const { x, y } = await point();
    await page.mouse.click(x, y);
    await expect(panel).toContainText(label);
    expect(await consoleBox()).toEqual(before);
  }
  await clickBoard(page);
  await expect(panel).toContainText("복홀 방 게시판");
  expect(await consoleBox()).toEqual(before);
  await clickEmptyGround(page);
  // "복홀 본진" 제목은 844b96f에서 하단 대화로 바뀌어 사라졌다. 선택만 풀리고 콘솔은 그대로여야 한다.
  await expect(panel).toBeHidden();
  expect(await consoleBox()).toEqual(before);
});
