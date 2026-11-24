import { expect, type Page, test } from "@playwright/test";
import {
  createTimberSave,
  createVillageGame,
  payTown,
  requireValue,
} from "../../packages/game-core/dist/index.js";
import { advanceVillageDay } from "./read-village.js";
import { clickExample } from "./scene-picking.js";
import { openLaborPanel } from "./workspace.js";

type SceneMesh = {
  isVisible: boolean;
  isEnabled(): boolean;
  getChildMeshes(): SceneMesh[];
};

const button = (p: Page, name: string) =>
  p.getByRole("button", { name, exact: true });
async function ready(p: Page) {
  await p.goto("/");
  await expect(p.getByTestId("play-scene-status")).toHaveText("3D 준비 완료", {
    timeout: 90_000,
  });
}
async function islandVisible(p: Page) {
  return p.evaluate(() =>
    (
      window as unknown as {
        __scene: {
          getTransformNodeByName(name: string): { isEnabled(): boolean } | null;
        };
      }
    ).__scene
      .getTransformNodeByName("island-world")
      ?.isEnabled(),
  );
}

test("새 HUD와 실제 GLB 마을에서 조달 현장으로 전환하고 같은 마을·캔버스로 돌아온다", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await expect(page.getByRole("region", { name: "명령 콘솔" })).toBeVisible();
  await expect.poll(() => islandVisible(page)).toBe(true);
  const renderer = await page.evaluate(() => {
    const scene = (
      window as unknown as {
        __scene: {
          getMeshById(id: string): SceneMesh | null;
          getEngine(): {
            getGlInfo(): unknown;
            getHardwareScalingLevel(): number;
          };
          getTransformNodeByName(
            name: string,
          ): { getChildMeshes(): unknown[] } | null;
        };
      }
    ).__scene;
    return {
      gl: scene.getEngine().getGlInfo(),
      scaling: scene.getEngine().getHardwareScalingLevel(),
      villageMeshes:
        scene.getTransformNodeByName("BLD_OFFICE.glb")?.getChildMeshes()
          .length ?? 0,
      representativeMeshes:
        scene.getMeshById("example-building-1")?.getChildMeshes().length ?? 0,
    };
  });
  expect(renderer.villageMeshes).toBeGreaterThan(0);
  expect(renderer.representativeMeshes).toBeGreaterThan(0);
  await info.attach("renderer", {
    body: JSON.stringify(renderer),
    contentType: "application/json",
  });
  const canvas = await page.locator("canvas").elementHandle();
  await page.screenshot({ path: info.outputPath("integrated-hud.png") });
  await button(page, "조달").click();
  await openLaborPanel(page);
  await expect.poll(() => islandVisible(page)).toBe(false);
  await expect(
    page.getByRole("region", { name: "첫 플레이 안내" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "공급 제안 비교", exact: true }),
  ).toBeVisible();
  await page.locator("canvas").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("integrated-procurement.png"),
  });
  await button(page, "마을로 돌아가기").click();
  await expect.poll(() => islandVisible(page)).toBe(true);
  expect(
    await canvas?.evaluate((c) => c === document.querySelector("canvas")),
  ).toBe(true);
  await expect(page.locator(".site-markers")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("지도에 연구가 적용된 정찰 왕복 시간과 귀환을 표시한다", async ({
  page,
}) => {
  const village = payTown(createVillageGame(), { RES_WOOD: 8, RES_METAL: 2 });
  const save = createTimberSave({
    ...village,
    town: {
      ...village.town,
      development: { ...village.town.development, completed: ["TECH_TRAIL"] },
    },
  });
  await page.addInitScript((value) => {
    localStorage.setItem("dynosty.village.resume", JSON.stringify(value));
  }, save);
  await ready(page);
  await button(page, "정찰 거점 갈대나루").click();
  const panel = page.getByRole("region", { name: "정찰 · 미탐색 거점 패널" });
  await expect(panel).toContainText("24시간", { timeout: 5000 });
  await button(page, "정찰대 보내기").click();
  await expect(
    page.getByRole("button", { name: "갈대나루 정찰 중 · 12시간 남음" }),
  ).toBeVisible();
  await advanceVillageDay(page);
  await page.getByRole("button", { name: "남겨 두고 정찰을 마친다" }).click();
  await advanceVillageDay(page);
  await expect(
    page.getByRole("region", { name: "의뢰", exact: true }),
  ).toContainText("갈대나루 발견");
  await expect(
    page.getByRole("dialog", { name: "갈대나루 · 정찰 결과" }),
  ).toBeVisible();
});

test("정찰 진행과 발견을 새로고침으로 복원하고 새 게임에서는 초기화한다", {
  tag: "@smoke",
}, async ({ page }) => {
  // Three full 3D loads share this test's budget on software-rendered CI.
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await button(page, "정찰 거점 갈대나루").click();
  await expect(
    page.getByRole("region", { name: "정찰 · 미탐색 거점 패널" }),
  ).toContainText("파견 기록은 마을과 함께 자동 저장됩니다");
  const food = await page.getByTestId("resource-RES_PLANT").textContent();
  await button(page, "정찰대 보내기").click();
  const face = page
    .getByRole("region", { name: "파견 중인 정찰대" })
    .getByRole("button", { name: /갈대나루 정찰 중/ });
  await expect(
    page.getByRole("button", { name: /갈대나루 정찰 중/ }),
  ).toHaveCount(1);
  const bounds = requireValue(await face.boundingBox(), "화면 위치");
  const consoleBounds = requireValue(
    await page.locator(".g-console").boundingBox(),
    "화면 위치",
  );
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(consoleBounds.y);
  expect(bounds.x).toBeGreaterThan(consoleBounds.x + consoleBounds.width * 0.8);
  const detail = face.locator(".g-scout-detail");
  await expect(detail).toBeHidden();
  await face.hover();
  await expect(detail).toBeVisible();
  await expect(detail).toHaveText(/갈대나루 정찰 중 · \d+시간 남음/);
  await expect(page.getByTestId("play-population")).toHaveText("주민 60명");
  await expect(page.getByTestId("resource-RES_PLANT")).toHaveText(food ?? "");
  await ready(page);
  await expect(face).toBeVisible();
  await advanceVillageDay(page);
  await page.getByRole("button", { name: "남겨 두고 정찰을 마친다" }).click();
  await advanceVillageDay(page);
  await expect(
    page.getByRole("region", { name: "의뢰", exact: true }),
  ).toContainText("갈대나루 발견");
  await ready(page);
  await expect(
    page.getByRole("region", { name: "의뢰", exact: true }),
  ).toContainText("갈대나루 발견");
  const report = page.getByRole("dialog", { name: "갈대나루 · 정찰 결과" });
  await expect(report).toBeVisible();
  await report.getByRole("button", { name: "장면 접기" }).click();
  await expect(report).toBeHidden();
  await button(page, "새 게임").click();
  await button(page, "새 게임 시작").click();
  await expect(
    page.getByRole("dialog", { name: "미션 시작 준비" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "의뢰", exact: true }),
  ).not.toContainText("갈대나루 발견");
  await expect(face).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("찬님 GLB 일부 요청 실패를 안내하며 대체 모델·선택과 게임 상태를 유지한다", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const nestGlb = "**/models/buildings/BLD_NEST.glb";
  await page.route(nestGlb, (r) => r.fulfill({ status: 404, body: "missing" }));
  const [response] = await Promise.all([
    page.waitForResponse(nestGlb, { timeout: 90_000 }),
    ready(page),
  ]);
  expect(response.status()).toBe(404);
  await expect(page.getByRole("alert")).toContainText("모델");
  const fallback = await page.evaluate(() => {
    const scene = (
      window as unknown as {
        __scene: {
          getTransformNodeByName(name: string): unknown;
          getMeshById(id: string): SceneMesh | null;
        };
      }
    ).__scene;
    const object = scene.getMeshById("example-building-1");
    return {
      glb: Boolean(scene.getTransformNodeByName("example-building-1:glb")),
      meshes: object
        ? [object, ...object.getChildMeshes()].filter(
            (m) => m.isVisible && m.isEnabled(),
          ).length
        : 0,
    };
  });
  expect(fallback.glb).toBe(false);
  expect(fallback.meshes).toBeGreaterThan(0);
  // 캔버스에서 직접 선택한 뒤 접혀 있는 명령 콘솔에서 결과를 확인한다.
  await clickExample(page, "building");
  await button(page, "명령 열기").click();
  const selection = page.getByRole("region", {
    name: "선택 정보",
    exact: true,
  });
  await expect(
    selection.getByRole("heading", {
      name: "건물 예제 · 온돌 둥지",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByTestId("play-population")).toHaveText("주민 60명");
  expect(errors).toEqual([]);
});
