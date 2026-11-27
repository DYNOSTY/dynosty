import { expect, test } from "@playwright/test";

for (const season of ["winter", "summer"] as const) {
  test(`${season} village loads its models and preserves the example building`, async ({
    page,
  }) => {
    const loaded = new Set<string>();
    const errors: string[] = [];
    const missing: string[] = [];
    page.on("response", (response) => {
      const path = new URL(response.url()).pathname;
      if (response.ok()) loaded.add(path);
      // The dev server answers a missing file with the app page instead of a 404.
      if (
        path.startsWith("/models/") &&
        (!response.ok() ||
          response.headers()["content-type"]?.includes("text/html"))
      )
        missing.push(path);
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(season === "summer" ? "/?season=summer" : "/");
    await expect(page.getByTestId("play-scene-status")).toHaveText(
      "3D 준비 완료",
    );
    await expect(page.locator(".model-warning")).toHaveCount(0);
    const suffix = season === "winter" ? "_v2" : "";
    expect(loaded).toContain(`/models/buildings/BLD_OFFICE${suffix}.glb`);
    expect(loaded).toContain(`/models/residents/R02_Triceratops${suffix}.glb`);
    expect(loaded).toContain(`/models/buildings/BLD_NEST${suffix}.glb`);
    expect(missing).toEqual([]);
    const ondol = await page.evaluate(() => {
      const { __scene: scene } = window as unknown as {
        __scene: {
          getTransformNodeByName(name: string): {
            getDescendants(): { name: string }[];
          } | null;
          getLightByName(name: string): {
            parent: object;
            isEnabled(): boolean;
            includedOnlyMeshes: { isDescendantOf(node: object): boolean }[];
          } | null;
        };
      };
      const nest = scene.getTransformNodeByName("example-building-1:glb");
      const light = scene.getLightByName("representative-ondol-glow");
      return {
        snowCap:
          nest
            ?.getDescendants()
            .some((node) => node.name.includes("nest_snow_cap")) ?? false,
        enabled: light?.isEnabled() ?? false,
        scoped: !!(
          light &&
          nest &&
          light.parent === nest &&
          light.includedOnlyMeshes.length &&
          light.includedOnlyMeshes.every((mesh) => mesh.isDescendantOf(nest))
        ),
      };
    });
    expect(ondol).toEqual({
      snowCap: season === "winter",
      enabled: season === "winter",
      scoped: season === "winter",
    });
    const frost = await page.locator(".scene-viewport").evaluate((viewport) => {
      const style = getComputedStyle(viewport, "::after");
      return {
        image: style.backgroundImage,
        pointerEvents: style.pointerEvents,
      };
    });
    if (season === "winter") {
      expect(frost.image).toContain("frost_vignette.webp");
      expect(frost.pointerEvents).toBe("none");
      await expect
        .poll(() => loaded.has("/ui/kit/frost_vignette.webp"))
        .toBe(true);
    } else {
      expect(frost.image).not.toContain("frost_vignette.webp");
    }
    expect(errors).toEqual([]);
  });
}

test("winter village keeps a selectable office when its winter model is unavailable", async ({
  page,
}) => {
  await page.route("**/models/buildings/BLD_OFFICE_v2.glb", (route) =>
    route.fulfill({ status: 404 }),
  );
  const blocked = page.waitForResponse((response) =>
    response.url().endsWith("/models/buildings/BLD_OFFICE_v2.glb"),
  );
  const loaded = new Set<string>();
  page.on("response", (response) => {
    if (response.ok()) loaded.add(new URL(response.url()).pathname);
  });
  await page.goto("/");
  expect((await blocked).status()).toBe(404);
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
  );
  expect(loaded).toContain("/models/buildings/BLD_OFFICE.glb");
  const selectable = await page.evaluate(() => {
    const { __scene } = window as unknown as {
      __scene: {
        getTransformNodeByName(name: string): {
          getChildMeshes(): {
            isPickable: boolean;
            metadata?: { villageTarget?: string };
          }[];
        } | null;
      };
    };
    return __scene
      .getTransformNodeByName("BLD_OFFICE.glb")
      ?.getChildMeshes()
      .some(
        (mesh) =>
          mesh.isPickable &&
          mesh.metadata?.villageTarget?.startsWith("village:BLD_OFFICE:"),
      );
  });
  expect(selectable).toBe(true);
});
