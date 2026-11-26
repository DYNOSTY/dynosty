import { expect, test } from "@playwright/test";
import { buildStage } from "../../apps/web/src/build-stage.js";
import {
  advanceTimber,
  commandTimber,
  createTimberSave,
  createVillageGame,
} from "../../packages/game-core/dist/index.js";

test("둥지 공사 진행에 따라 세 단계 모델을 표시한다", async ({
  page,
}, info) => {
  let state = commandTimber(
    createVillageGame(),
    { type: "build-home", position: { x: 12, z: 12 }, headingRadians: 0 },
    "build-stages-start",
  );
  const saves = new Map<number, ReturnType<typeof createTimberSave>>();
  for (
    let minute = 0;
    minute < 3000 && state.construction && saves.size < 3;
    minute++
  ) {
    const { startedAt, finishAt } = state.construction;
    const progress =
      startedAt === null || finishAt === null || finishAt <= startedAt
        ? 0
        : (state.elapsed - startedAt) / (finishAt - startedAt);
    const stage = buildStage(progress);
    if (!saves.has(stage)) {
      const paused = commandTimber(
        state,
        { type: "pause", paused: true },
        `build-stages-pause-${stage}`,
      );
      saves.set(stage, createTimberSave(paused));
    }
    state = advanceTimber(state, 1);
  }
  expect([...saves.keys()]).toEqual([1, 2, 3]);
  await page.addInitScript((entries) => {
    const stage = Number(new URL(location.href).searchParams.get("buildStage"));
    const save = entries.find(([n]) => n === stage)?.[1];
    if (save)
      localStorage.setItem("dynosty.village.resume", JSON.stringify(save));
  }, Array.from(saves.entries()));
  for (const stage of [1, 2, 3]) {
    await page.goto(`/?buildStage=${stage}`);
    await expect(page.getByTestId("play-scene-status")).toHaveText(
      "3D 준비 완료",
    );
    await expect
      .poll(() =>
        page.evaluate((n) => {
          const scene = (
            window as unknown as {
              __scene: import("@babylonjs/core/scene").Scene;
            }
          ).__scene;
          const node = scene.getTransformNodeByName(
            `village-construction:build-stage-${n}`,
          );
          return (
            !!node?.isEnabled() &&
            node.getChildMeshes().some((mesh) => mesh.getTotalVertices() > 0) &&
            [1, 2, 3].every(
              (other) =>
                other === n ||
                !scene
                  .getTransformNodeByName(
                    `village-construction:build-stage-${other}`,
                  )
                  ?.isEnabled(),
            )
          );
        }, stage),
      )
      .toBe(true);
    await page.evaluate(() => {
      const scene = (
        window as unknown as { __scene: import("@babylonjs/core/scene").Scene }
      ).__scene;
      const site = scene.getTransformNodeByName("village-construction");
      if (!site) throw Error("둥지 공사 터가 없습니다.");
      const camera =
        scene.activeCamera as import("@babylonjs/core/Cameras/arcRotateCamera").ArcRotateCamera;
      camera.setTarget(site.position.clone());
      camera.radius = 14;
    });
    await page.screenshot({
      path: info.outputPath(`build-stage-${stage}.png`),
    });
  }
  // 실제 공사 터 클릭 및 정보 창은 village-hud.spec.ts의 배치 검사에서 검증한다.
});
