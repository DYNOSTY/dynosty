import { expect, type Page, test } from "@playwright/test";
import { clickExample } from "./scene-picking.js";

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
  await button(page, "일손 배치·배급 체험하기").click();
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
  await button(page, "생존 예제로 돌아가기").click();
  await expect.poll(() => islandVisible(page)).toBe(true);
  expect(
    await canvas?.evaluate((c) => c === document.querySelector("canvas")),
  ).toBe(true);
  await expect(page.locator(".site-markers")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("정찰 시안은 발견 표시를 갱신하고 게임 불러오기·새 게임에서 일관되게 초기화한다", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await button(page, "정찰 거점 갈대나루").click();
  await expect(
    page.getByRole("region", { name: "정찰 · 미탐색 거점 패널" }),
  ).toContainText("저장되지 않으며 인원·식량 재고에 반영하지 않습니다");
  const food = await page.getByTestId("resource-RES_PLANT").textContent();
  await button(page, "정찰대 보내기").click();
  const face = page
    .getByRole("group", { name: "파견 중인 정찰대" })
    .getByRole("button", { name: /갈대나루 정찰 중/ });
  await expect(
    page.getByRole("button", { name: /갈대나루 정찰 중/ }),
  ).toHaveCount(1);
  const bounds = await face.boundingBox();
  const consoleBounds = await page.locator(".g-console").boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(consoleBounds!.y);
  expect(bounds!.x).toBeGreaterThan(
    consoleBounds!.x + consoleBounds!.width * 0.8,
  );
  const detail = face.locator(".g-scout-detail");
  await expect(detail).toBeHidden();
  await face.hover();
  await expect(detail).toBeVisible();
  await expect(detail).toHaveText(/갈대나루 정찰 중 · \d+시간 남음/);
  await expect(page.getByTestId("play-population")).toHaveText("주민 60명");
  await expect(page.getByTestId("resource-RES_PLANT")).toHaveText(food ?? "");
  await button(page, "1일 진행").click();
  await button(page, "1일 진행").click();
  await expect(
    page.getByRole("region", { name: "의뢰", exact: true }),
  ).toContainText("갈대나루 발견");
  await button(page, "저장").click();
  await button(page, "게임 저장").click();
  await expect(page.getByTestId("play-save-status")).toContainText(
    "저장했습니다",
  );
  await button(page, "게임 불러오기").click();
  await expect(page.getByTestId("play-save-status")).toContainText(
    "불러왔습니다",
  );
  await button(page, "저장 닫기").click();
  await expect(
    page.getByRole("region", { name: "의뢰", exact: true }),
  ).toContainText("0 / 5");
  await button(page, "정찰 거점 갈대나루").click();
  await button(page, "정찰대 보내기").click();
  await button(page, "새 게임").click();
  await button(page, "새 게임 시작").click();
  await expect(
    page.getByRole("region", { name: "의뢰", exact: true }),
  ).not.toContainText("정찰 중");
  expect(errors).toEqual([]);
});

test("찬님 GLB 일부 요청 실패를 안내하며 대체 모델·선택과 게임 상태를 유지한다", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/models/buildings/BLD_NEST.glb", (r) =>
    r.fulfill({ status: 404, body: "missing" }),
  );
  await ready(page);
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
  await clickExample(page, "building");
  await expect(
    page.getByRole("region", { name: "선택 정보", exact: true }),
  ).toContainText("복홀 방 게시판");
  await expect(page.getByTestId("play-population")).toHaveText("주민 60명");
  expect(errors).toEqual([]);
});
