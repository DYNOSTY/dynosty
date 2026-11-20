import { expect, test } from "@playwright/test";
import {
  commandTimber,
  createTimberSave,
  createVillageGame,
} from "../../packages/game-core/dist/index.js";

type Point = { x: number; z: number };
type SceneMesh = {
  name: string;
  isVisible: boolean;
  isEnabled(): boolean;
  getAbsolutePosition(): Point;
  getTotalVertices(): number;
  material?: { getActiveTextures(): { isReady(): boolean }[] };
};
declare global {
  interface Window {
    __scene: {
      getMeshById(id: string): SceneMesh | null;
      getTransformNodeByName(name: string): { isEnabled(): boolean } | null;
      meshes: SceneMesh[];
      particleSystems: {
        name: string;
        emitter: Point;
        getActiveCount(): number;
      }[];
      getTextureByName(name: string): {
        getContext(): CanvasRenderingContext2D;
      };
    };
  }
}

test.use({
  viewport: { width: 800, height: 600 },
  storageState: { cookies: [], origins: [] },
});

for (const restaurantBuilt of [true, false]) {
  test(`출문 3D 불길은 실제 피해 시설에만 붙는다 (${restaurantBuilt ? "식당 있음" : "기존 저장에 식당 없음"})`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const departure = commandTimber(
      { ...createVillageGame(true), restaurantBuilt },
      { type: "campaign", beat: "opening", action: "hard" },
      "visual-departure",
    );
    const aftermath = commandTimber(
      departure,
      { type: "campaign", beat: "departure", action: "leave" },
      "visual-aftermath",
    );
    const burnedIds = departure.homes
      .filter((home) => !aftermath.homes.some(({ id }) => id === home.id))
      .map(({ id }) => id);
    expect(burnedIds.length).toBeGreaterThan(0);
    await page.addInitScript(
      (save) =>
        localStorage.setItem("dynosty.village.resume", JSON.stringify(save)),
      createTimberSave(departure),
    );
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("play-scene-status")).toHaveText(
      "3D 준비 완료",
      { timeout: 70_000 },
    );
    await page
      .getByRole("button", { name: "장면 접기" })
      .dispatchEvent("click");
    await expect
      .poll(
        () =>
          page.evaluate(
            ({ ids, restaurantBuilt }) => {
              const scene = window.__scene;
              const position = ({ x, z }: Point) =>
                `${x.toFixed(2)},${z.toFixed(2)}`;
              const expected = [
                ...(restaurantBuilt ? ["resident-restaurant"] : []),
                ...ids,
              ]
                .map((id) => {
                  const mesh = scene.getMeshById(id);
                  return mesh?.isEnabled()
                    ? position(mesh.getAbsolutePosition())
                    : `missing:${id}`;
                })
                .sort();
              const actual = scene.particleSystems
                .filter(
                  (p) =>
                    p.name.startsWith("처마 불길-") && p.getActiveCount() > 0,
                )
                .map((p) => position(p.emitter))
                .sort();
              return JSON.stringify(actual) === JSON.stringify(expected)
                ? []
                : { actual, expected };
            },
            { ids: burnedIds, restaurantBuilt },
          ),
        { timeout: 20_000 },
      )
      .toEqual([]);
  });
}

test("출문 뒤에는 병원과 공방이 남는다", async ({ page }) => {
  const departure = commandTimber(
    createVillageGame(true),
    { type: "campaign", beat: "opening", action: "hard" },
    "visual-departure",
  );
  const aftermath = commandTimber(
    departure,
    { type: "campaign", beat: "departure", action: "leave" },
    "visual-aftermath",
  );
  expect(aftermath.rebuilding).toBe(true);
  await page.addInitScript(
    (save) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(save)),
    createTimberSave(aftermath),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
    { timeout: 70_000 },
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = window.__scene;
        return {
          restaurant: scene.getMeshById("resident-restaurant")?.isEnabled(),
          clinic: scene.getTransformNodeByName("BLD_CLINIC.glb")?.isEnabled(),
          workshop: scene
            .getTransformNodeByName("BLD_WORKSHOP.glb")
            ?.isEnabled(),
        };
      }),
    )
    .toEqual({ restaurant: false, clinic: true, workshop: true });
});

test("같은 번호의 다른 저장을 불러오면 3D 법령 게시문이 바뀐다", async ({
  page,
}) => {
  const base = createVillageGame(false, true);
  const prior = createTimberSave(
    commandTimber(
      base,
      { type: "set-ration-policy", policy: "cap" },
      "visual-cap",
    ),
  );
  const current = createTimberSave(
    commandTimber(
      { ...base, rationPolicy: "cap" },
      { type: "set-ration-policy", policy: "needs" },
      "visual-needs",
    ),
  );
  const priorDecree = prior.state.decree;
  const currentDecree = current.state.decree;
  if (!priorDecree || !currentDecree)
    throw new Error("법령이 없는 테스트 저장");
  expect(priorDecree.serial).toBe(1);
  expect(currentDecree.serial).toBe(1);
  expect(priorDecree.title).not.toBe(currentDecree.title);
  await page.addInitScript(
    ({ prior, current }) => {
      localStorage.setItem("dynosty.village.resume", JSON.stringify(prior));
      localStorage.setItem(
        "dynosty.timber.saves.v17",
        JSON.stringify({
          format: "dynosty-timber-archive",
          storageVersion: 1,
          current,
          previous: prior,
        }),
      );
    },
    { prior, current },
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
    { timeout: 70_000 },
  );
  const board = page.locator(".office-decree strong");
  await expect(board).toContainText(priorDecree.title);
  const texture = () =>
    page.evaluate(() =>
      window.__scene
        .getTextureByName("법령 글씨")
        .getContext()
        .canvas.toDataURL(),
    );
  const before = await texture();
  await page
    .getByRole("button", { name: "마른 목재20 조달 체험하기" })
    .dispatchEvent("click");
  await page.keyboard.press("j");
  await page
    .getByRole("button", { name: "진행 불러오기", exact: true })
    .dispatchEvent("click");
  await expect(board).toContainText(currentDecree.title);
  await expect.poll(async () => (await texture()) !== before).toBe(true);
});

test("기본 겨울 3D 관아에도 복홀 관아 현판이 보인다", async ({ page }) => {
  const winterOffice = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/BLD_OFFICE_v2.glb") &&
      response.ok(),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await winterOffice;
  await expect(page.locator("canvas[data-season]")).toHaveAttribute(
    "data-season",
    "winter",
  );
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
    { timeout: 70_000 },
  );
  expect(
    await page.evaluate(() =>
      window.__scene.meshes.some(
        (mesh) =>
          mesh.name.includes("복홀 관아 현판") &&
          mesh.isEnabled() &&
          mesh.isVisible &&
          mesh.getTotalVertices() > 0 &&
          mesh.material
            ?.getActiveTextures()
            .some((texture) => texture.isReady()),
      ),
    ),
  ).toBe(true);
});
