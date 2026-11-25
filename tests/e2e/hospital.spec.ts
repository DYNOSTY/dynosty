import { expect, test } from "@playwright/test";
import {
  advanceTimber,
  commandTimber,
  createPlayState,
  createTimberSave,
  createTimberState,
} from "../../packages/game-core/dist/index.js";
import { worldPoint } from "./scene-picking.js";

test("병원 클릭으로 주민별 회복을 보고 저장 후 야간 자동 퇴원한다", async ({
  page,
}) => {
  test.setTimeout(180_000);
  let s = createTimberState({ ...createPlayState(), minute: 540 });
  s = commandTimber(
    s,
    {
      type: "plan-building",
      kind: "hospital",
      position: { x: 12, z: 12 },
      headingRadians: Math.PI,
    },
    "hospital-build",
  );
  s = advanceTimber(s, 160);
  s = commandTimber(
    s,
    { type: "facility-staff", id: "build-1", count: 2 },
    "hospital-staff",
  );
  s = advanceTimber(s, 1);
  for (const [i, severity] of (
    ["minor", "major", "critical"] as const
  ).entries()) {
    const id = s.residents[i]?.id;
    if (!id) throw Error("주민 없음");
    s = commandTimber(
      s,
      {
        type: "citizen-event",
        event: {
          type: "illness",
          id: `hospital-injury-${i}`,
          citizenIds: [id],
          severity,
        },
      },
      `hospital-injury-${i}`,
    );
  }
  s = advanceTimber(s, 35);
  s = {
    ...s,
    paused: true,
    world: { ...s.world, minute: 1320 },
    town: {
      ...s.town,
      patients: s.town.patients.map((p) =>
        p.severity === "minor" ? { ...p, progress: 719 } : p,
      ),
    },
  };
  await page.goto("/");
  await page.evaluate(
    (save) =>
      localStorage.setItem(
        "dynosty.timber.saves.v17",
        JSON.stringify({
          format: "dynosty-timber-archive",
          storageVersion: 1,
          current: save,
          previous: null,
        }),
      ),
    createTimberSave(s),
  );
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
    { timeout: 90_000 },
  );
  await button("마른 목재 20 조달").click();
  await expect(page.getByTestId("timber-clock")).toBeVisible();
  await page.locator("canvas").press("j");
  await button("진행 불러오기").click();
  await expect(page.getByTestId("timber-save-status")).toContainText(
    "불러왔습니다",
  );
  await page.locator("canvas").press("j");
  // 제출본의 시설 관리 경로: 건설 → 시설 운영(완공 시설 장부가 펼쳐진 채 열린다).
  await button("건설").click();
  await button("시설 운영").click();
  await expect(page.getByText("완공 시설 1곳", { exact: true })).toBeVisible();
  await button("현장 보기").click();
  const canvas = page.locator("canvas");
  const rect = await canvas.boundingBox();
  if (!rect) throw Error("3D 화면 없음");
  // 실제 카메라 행렬로 병원(12, 12) 몸체를 화면 좌표로 옮겨 누른다.
  const hospital = await worldPoint(page, [12, 1.5, 12], false);
  await page.mouse.click(hospital.x, hospital.y);
  const ward = page.getByTestId("hospital-build-1");
  await expect(ward).toHaveAttribute("open", "");
  await expect(ward.getByRole("listitem")).toHaveCount(3);
  await expect(ward).toContainText("회복 719/720");
  await expect(ward).toContainText("중상");
  // 시설 운영 화면은 그 장부만 보여 준다. 저장·시간 조작은 개발 도구의 전체 장부에서 한다.
  const tools = button("개발 도구");
  if ((await tools.getAttribute("aria-expanded")) !== "true")
    await tools.click();
  await canvas.press("j");
  await button("진행 저장").click();
  await expect(page.getByTestId("timber-save-status")).toContainText(
    "저장했습니다",
  );
  await button("진행 불러오기").click();
  await expect(page.getByTestId("timber-save-status")).toContainText(
    "불러왔습니다",
  );
  await expect(ward).toContainText("회복 719/720");
  await canvas.press("j");
  const before = await page.getByTestId("timber-clock").textContent();
  await button("5분 진행").click();
  await expect(page.getByTestId("timber-clock")).not.toHaveText(before ?? "");
  await expect(ward.getByRole("listitem")).toHaveCount(2);
  await expect(ward).toContainText("/1440");
  await expect(ward).toContainText("/2880");
  await expect(
    ward.getByRole("listitem").filter({ hasText: "경상" }),
  ).toHaveCount(0);
});
