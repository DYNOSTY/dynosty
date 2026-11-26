import { expect, test } from "@playwright/test";
import {
  AMOUNT_SCALE,
  advanceTimber,
  commandTimber,
  createTimberSave,
  createVillageGame,
} from "../../packages/game-core/dist/index.js";

for (const wood of [20, 100]) {
  test(`운반 지게와 연료 재고 표시: 목재 ${wood}`, async ({ page }) => {
    let state = commandTimber(
      createVillageGame(),
      { type: "build-logging" },
      "jige-build",
    );
    for (let i = 0; i < 500 && !state.logging.built; i++)
      state = advanceTimber(state, 1);
    expect(state.logging.built).toBe(true);
    state = commandTimber(
      state,
      { type: "set-logging-workers", count: 1 },
      "jige-staff",
    );
    const workerId = state.residents.find(
      (r) => r.workplaceId === "logging",
    )?.id;
    expect(workerId).toBeTruthy();
    // 공동 재고 정산이 맞도록 시작 재고 기록도 같이 바꾼다.
    const save = createTimberSave({
      ...state,
      paused: true,
      initialWood:
        state.initialWood +
        wood * AMOUNT_SCALE -
        state.world.resources.RES_WOOD,
      initialMinerals: {
        ...state.initialMinerals,
        RES_COAL: 5 * AMOUNT_SCALE,
      },
      world: {
        ...state.world,
        resources: {
          ...state.world.resources,
          RES_WOOD: wood * AMOUNT_SCALE,
          RES_COAL: 5 * AMOUNT_SCALE,
        },
      },
    });
    await page.addInitScript(
      (value) =>
        localStorage.setItem("dynosty.village.resume", JSON.stringify(value)),
      save,
    );
    await page.goto("/");
    await expect(page.getByTestId("play-scene-status")).toHaveText(
      "3D 준비 완료",
    );
    await expect
      .poll(() =>
        page.evaluate((workerId) => {
          const scene = (window as any).__scene;
          return scene.transformNodes.some(
            (n: any) =>
              n.name.startsWith("jige-") &&
              n.isEnabled() &&
              n.parent?.id === workerId &&
              n.getChildMeshes().length > 0,
          );
        }, workerId),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const scene = (window as any).__scene;
          return ["FUEL_LOG", "FUEL_COAL_0", "FUEL_COAL_1", "FUEL_COAL_2"].map(
            (name) => scene.getMeshByName(`fuel-${name}`)?.thinInstanceCount,
          );
        }),
      )
      .toEqual([Math.ceil(wood / 4), 3, 3, 2]);
    await page.evaluate(() => {
      const scene = (window as any).__scene;
      const point = scene
        .getMeshByName("fuel-FUEL_LOG")
        .getAbsolutePosition()
        .clone();
      point.set(-22, 0, 8);
      scene.activeCamera.setTarget(point);
      scene.activeCamera.radius = 26;
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: test.info().outputPath("fuel-yard.png") });
    await page.evaluate((workerId) => {
      const scene = (window as any).__scene;
      const resident = scene.getMeshById(workerId);
      scene.activeCamera.setTarget(resident.getAbsolutePosition());
      scene.activeCamera.radius = 5;
      scene.activeCamera.beta = 1.1;
      // Babylon의 카메라 궤도에서 주민의 로컬 -z 방향을 바라본다.
      scene.activeCamera.alpha = -resident.rotation.y - Math.PI / 2;
    }, workerId);
    await page.waitForTimeout(500);
    await page.screenshot({ path: test.info().outputPath("jige.png") });
  });
}
