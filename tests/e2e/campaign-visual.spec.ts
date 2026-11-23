import { expect, test } from "@playwright/test";

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
