import { expect, type Page, test } from "@playwright/test";
import {
  RESOURCE_SITES,
  resourceSiteRect,
} from "../../apps/web/src/resource-site-layout.js";

type Box = { minX: number; maxX: number; minZ: number; maxZ: number };
type SiteView = {
  enabled: boolean;
  meshes: number;
  pickable: number;
  textured: boolean;
  box: Box | null;
};

function readSites(page: Page, ids: string[]) {
  return page.evaluate((ids) => {
    const scene = (
      window as unknown as { __scene: import("@babylonjs/core/scene").Scene }
    ).__scene;
    const out: Record<string, SiteView> = {};
    for (const id of ids) {
      const node = scene.getTransformNodeByName(`resource-site:${id}`);
      if (!node) continue;
      const meshes = node.getChildMeshes(false);
      let box: Box | null = null;
      for (const mesh of meshes) {
        mesh.computeWorldMatrix(true);
        const { minimumWorld: lo, maximumWorld: hi } =
          mesh.getBoundingInfo().boundingBox;
        box = box
          ? {
              minX: Math.min(box.minX, lo.x),
              maxX: Math.max(box.maxX, hi.x),
              minZ: Math.min(box.minZ, lo.z),
              maxZ: Math.max(box.maxZ, hi.z),
            }
          : { minX: lo.x, maxX: hi.x, minZ: lo.z, maxZ: hi.z };
      }
      out[id] = {
        enabled: node.isEnabled(),
        meshes: meshes.filter((m) => m.getTotalVertices() > 0).length,
        pickable: meshes.filter((m) => m.isPickable).length,
        textured: meshes.every(
          (m) =>
            !!m.material &&
            m.material.getActiveTextures().length > 0 &&
            m.material.getActiveTextures().every((t) => t.isReady()),
        ),
        box,
      };
    }
    return out;
  }, ids);
}

function depositRocks(page: Page, anchor: string) {
  return page.evaluate((anchor) => {
    const scene = (
      window as unknown as { __scene: import("@babylonjs/core/scene").Scene }
    ).__scene;
    const rocks = scene.meshes.filter(
      (m) => m.name === `deposit-rock:${anchor}`,
    );
    return {
      total: rocks.length,
      shown: rocks.filter((m) => m.isEnabled()).length,
      mouth: !!scene.getMeshByName(`mine-dark-mouth:${anchor}`)?.isEnabled(),
    };
  }, anchor);
}

test("복홀 지도의 광맥·물고기 못에 깎은 자원 터 여섯 곳이 선다", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
  );
  const ids = RESOURCE_SITES.map((s) => s.id);
  await expect
    .poll(async () => {
      const sites = await readSites(page, ids);
      return ids.filter(
        (id) =>
          sites[id]?.enabled && sites[id].meshes > 0 && sites[id].textured,
      );
    })
    .toEqual(ids);
  const sites = await readSites(page, ids);
  for (const site of RESOURCE_SITES) {
    const view = sites[site.id];
    expect(view?.pickable, site.id).toBe(0);
    // 실제로 그려진 범위가 배치 검사의 바닥 범위와 같은 자리·방향이다
    const want = resourceSiteRect(site);
    const got = view?.box;
    if (!got) throw new Error(`${site.id} 범위가 없습니다.`);
    for (const key of ["minX", "maxX", "minZ", "maxZ"] as const)
      expect(got[key], `${site.id}.${key}`).toBeCloseTo(want[key], 0);
  }
  for (const site of RESOURCE_SITES.filter((s) => s.replacesDeposit))
    await expect
      .poll(() => depositRocks(page, site.anchor))
      .toEqual({ total: 8, shown: 0, mouth: true });
  expect(errors).toEqual([]);
});

test("자원 터 모델을 못 읽으면 광맥 자리 표시용 바위가 그대로 남는다", async ({
  page,
}) => {
  await page.route("**/models/sites/SITE3_COAL.glb", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
  );
  await expect
    .poll(async () => (await readSites(page, ["iron"])).iron?.enabled)
    .toBe(true);
  expect(await readSites(page, ["coal"])).toEqual({});
  expect(await depositRocks(page, "coal-bokhol")).toEqual({
    total: 8,
    shown: 8,
    mouth: true,
  });
  await expect
    .poll(() => depositRocks(page, "iron-bokhol"))
    .toEqual({ total: 8, shown: 0, mouth: true });
});
