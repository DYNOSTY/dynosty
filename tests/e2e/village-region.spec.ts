import { expect, test } from "@playwright/test";
import {
  actCampaign,
  advanceTimber,
  campaignOf,
  commandTimber,
  createTimberSave,
  createVillageGame,
  requireValue,
  SETTLEMENTS,
} from "../../packages/game-core/dist/index.js";
import { readVillage } from "./read-village.js";

test("마을 지도를 축소하면 교역 마을과 이동 중인 정찰대가 보이고 확대하면 복홀로 돌아온다", async ({
  page,
}) => {
  const sent = commandTimber(
    createVillageGame(),
    { type: "scout-sites", ids: ["reed"], explore: true },
    "test-scout",
  );
  await page.addInitScript(
    (save) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(save)),
    createTimberSave({
      ...sent,
      campaign: { ...campaignOf(sent), treaties: [0] },
    }),
  );
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
  );
  const canvas = page.getByLabel(
    "마을 전경. 건물을 선택하거나 WASD로 이동할 수 있습니다.",
  );
  await canvas.hover();
  const region = page.getByRole("dialog", { name: "복홀 주변 지도" });
  await expect
    .poll(async () => {
      if (!(await region.isVisible())) await page.mouse.wheel(0, 650);
      return region.isVisible();
    })
    .toBe(true);
  await expect(region.getByText("당성 · 교역 중")).toBeVisible();
  await expect(region.getByText("갈대나루 정찰대 · 이동 중")).toBeVisible();
  await expect(region.locator("img")).toHaveJSProperty("complete", true);
  await expect
    .poll(async () => {
      if (await region.isVisible()) await page.mouse.wheel(0, -400);
      return region.isVisible();
    })
    .toBe(false);
  await page.keyboard.press("m");
  await expect(region).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(region).toHaveCount(0);
});

for (const kind of ["hospital", "logging"] as const)
  test(
    (kind === "hospital" ? "병원" : "제재소") +
      " 건물을 누르면 해당 일터의 운영 인원만 바로 배치한다",
    async ({ page }) => {
      let s = createVillageGame();
      const position = { x: 12, z: 12 };
      s = commandTimber(
        s,
        { type: "plan-building", kind, position, headingRadians: 0 },
        "hospital",
      );
      for (let i = 0; i < 500 && !s.town.facilities.length; i++)
        s = advanceTimber(s, 1);
      const facility = requireValue(
        s.town.facilities.find((f) => f.kind === kind),
        "시나리오 대상",
      );
      expect(facility).toBeDefined();
      await page.addInitScript(
        (save) =>
          localStorage.setItem("dynosty.village.resume", JSON.stringify(save)),
        createTimberSave(s),
      );
      await page.goto("/");
      await expect(page.getByTestId("play-scene-status")).toHaveText(
        "3D 준비 완료",
      );
      const map = page.getByRole("button", {
        name: "지도: 누른 곳으로 시점 이동",
      });
      const bounds = requireValue(await map.boundingBox(), "화면 위치");
      await map.click({
        position: {
          x: bounds.width * (0.5 + position.x / 142),
          y: bounds.height * (0.5 - position.z / 142),
        },
      });
      const canvas = page.locator("canvas").first();
      const windowBox = requireValue(await canvas.boundingBox(), "화면 위치");
      const cx = windowBox.x + windowBox.width / 2,
        cy = windowBox.y + windowBox.height / 2;
      await page.mouse.click(cx, cy - 10);
      const staff = page.getByLabel(`${facility.id} 운영 인원`, {
        exact: true,
      });
      await expect(staff).toBeVisible({ timeout: 8000 });
      await staff.selectOption("1");
      await expect(staff).toHaveValue("1");
      if (kind === "hospital")
        await expect(
          page.getByRole("region", { name: "병원 치료 현황" }),
        ).toBeVisible();
      await expect(page.getByRole("region", { name: "조달 계약" })).toHaveCount(
        0,
      );
    },
  );

test("다섯째 미션의 복홀 주변 지도에 다섯 교역 마을이 표시된다", async ({
  page,
}) => {
  const village = createVillageGame();
  const final = actCampaign(
    {
      ...village,
      chapter: 4,
      campaign: {
        ...campaignOf(village),
        beat: "thaw",
        treaties: SETTLEMENTS.map((_, i) => i),
      },
    },
    { type: "campaign", beat: "thaw", action: "next" },
  );
  expect(final.chapter).toBe(5);
  await page.addInitScript(
    (save) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(save)),
    createTimberSave(final),
  );
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
  );
  const fold = page.getByRole("button", { name: "장면 접기" });
  if (await fold.isVisible()) await fold.click();
  await page.keyboard.press("m");
  const region = page.getByRole("dialog", { name: "복홀 주변 지도" });
  for (const town of SETTLEMENTS)
    await expect(
      region.getByText(`${town.name} · 교역 중`, { exact: true }),
    ).toBeVisible();
});

test("복홀에서 땅을 드래그해 회전하고 마우스 휠로 확대한다", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
  );
  const canvas = page.locator("canvas").first();
  const box = requireValue(await canvas.boundingBox(), "화면 위치");
  const x = box.x + box.width * 0.45,
    y = box.y + box.height * 0.45;
  const camera = () =>
    page.evaluate(() => {
      const cam = (
        window as unknown as {
          __scene: { activeCamera: { alpha: number; radius: number } };
        }
      ).__scene.activeCamera;
      return { alpha: cam.alpha, radius: cam.radius };
    });
  const before = await camera();
  await page.mouse.move(x, y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(x + 100, y + 15, { steps: 8 });
  await page.mouse.up({ button: "right" });
  await expect
    .poll(async () => Math.abs((await camera()).alpha - before.alpha))
    .toBeGreaterThan(0.015);
  await page.mouse.wheel(0, -300);
  await expect
    .poll(async () => (await camera()).radius)
    .toBeLessThan(before.radius - 0.1);
});

test("철광맥 표식에서 철광산의 건설 비용과 지면 미리보기를 확인한다", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
  );
  // Frame the northern seam, then perform selection and placement with the game controls.
  await page.evaluate(() => {
    const scene = (
      window as unknown as { __scene: import("@babylonjs/core/scene").Scene }
    ).__scene;
    const ore = scene.getTransformNodeByName("mineral-deposit:iron-bokhol");
    if (!ore) throw Error("mineral-deposit:iron-bokhol 모형이 없습니다.");
    const cam =
      scene.activeCamera as import("@babylonjs/core/Cameras/arcRotateCamera").ArcRotateCamera;
    cam.setTarget(ore.position.clone());
    cam.radius = 48;
  });
  const gridVisible = () =>
    page.evaluate(() => {
      const scene = (
        window as unknown as { __scene: import("@babylonjs/core/scene").Scene }
      ).__scene;
      const material = scene.getMaterialByName(
        "procurement-ground-material",
      ) as import("@babylonjs/core/Materials/standardMaterial").StandardMaterial;
      const texture = material.diffuseTexture;
      return (
        texture?.name === "construction-plots" &&
        texture.wrapU === 1 &&
        texture.wrapV === 1
      );
    });
  expect(await gridVisible()).toBe(false);
  await page.keyboard.press("b");
  await expect.poll(gridVisible).toBe(true);
  await page
    .getByRole("button", { name: "명령 접기", exact: true })
    .filter({ visible: true })
    .last()
    .click();
  await expect.poll(gridVisible).toBe(false);
  const pin = page.getByTitle(/복홀 북쪽 철광맥.*160.*인근 부지 보기/);
  await pin.click();
  const card = page.getByRole("button", { name: "철광산", exact: true });
  await card.hover();
  await expect(card).toHaveAccessibleDescription(/목재75.*철재30/);
  expect(
    await card.evaluate((el) => getComputedStyle(el, "::after").content),
  ).toMatch(/목재75/);
  const canvas = page.locator("canvas").first();
  const box = requireValue(await canvas.boundingBox(), "화면 위치");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const preview = () =>
    page.evaluate(() => {
      const scene = (
        window as unknown as { __scene: import("@babylonjs/core/scene").Scene }
      ).__scene;
      return {
        foot: scene.getMeshByName("home-placement-footprint")?.isEnabled(),
        ground: scene.getMeshByName("ground")?.isEnabled(),
        model: scene.getMeshByName("home-placement-preview")?.isEnabled(),
      };
    });
  await expect
    .poll(preview)
    .toEqual({ foot: true, model: true, ground: false });
  await expect(page.getByText(/철광산 · 배치 가능/).first()).toBeVisible();
  const site = await page.evaluate(() => {
    const scene = (
      window as unknown as { __scene: import("@babylonjs/core/scene").Scene }
    ).__scene;
    const mesh = scene.getMeshByName("home-placement-preview");
    if (!mesh) throw Error("건설 미리보기 모형이 없습니다.");
    const { x, z } = mesh.position;
    return { x, z };
  });
  expect(site.x % 2).toBeCloseTo(0);
  expect(site.z % 2).toBeCloseTo(0);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect
    .poll(() =>
      page.evaluate(readVillage).then((s) => {
        const orders = s.town.orders;
        return orders.find((order: { kind: string }) => order.kind === "iron")
          ?.position;
      }),
    )
    .toEqual(site);
});

test("복홀 첫날 건설창과 스페이스바가 시간을 멈추고 닫으면 같은 시점에서 이어간다", async ({
  page,
}) => {
  const s = createVillageGame(false, true);
  await page.addInitScript(
    (save) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(save)),
    createTimberSave(s),
  );
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
  );
  const hud = page.locator(".g-quests");
  await expect(hud).toContainText("공동 식당을 골라");
  await page.keyboard.press("Space");
  await expect
    .poll(() => page.evaluate(readVillage).then((s) => s.paused))
    .toBe(false);
  await page.keyboard.press("b");
  await expect(page.getByRole("region", { name: "건물 목록" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(readVillage).then((s) => s.paused))
    .toBe(true);
  await page.getByRole("button", { name: "명령 접기", exact: true }).click();
  await expect
    .poll(() => page.evaluate(readVillage).then((s) => s.paused))
    .toBe(false);
  await page.keyboard.press("Space");
  await expect
    .poll(() => page.evaluate(readVillage).then((s) => s.paused))
    .toBe(true);
});
