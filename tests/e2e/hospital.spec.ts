import { expect, test } from "@playwright/test";
import {
  advanceTimber,
  commandTimber,
  createPlayState,
  createTimberSave,
  createTimberState,
} from "../../packages/game-core/dist/index.js";

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
  await button("마른 목재20 조달 체험하기").click();
  await expect(page.getByTestId("timber-clock")).toBeVisible();
  await page.locator("canvas").press("j");
  await button("진행 불러오기").click();
  await expect(page.getByTestId("timber-save-status")).toContainText(
    "불러왔습니다",
  );
  await page.locator("canvas").press("j");
  await page.getByText("완공 시설 1곳", { exact: true }).click();
  await button("현장 보기").click();
  const canvas = page.getByLabel(
    "바닥과 건물이 있는 3D 예제. 마우스로 회전하고 확대할 수 있습니다.",
    { exact: true },
  );
  const rect = await canvas.boundingBox();
  if (!rect) throw Error("3D 화면 없음");
  await canvas.click({
    position: { x: rect.width / 2, y: rect.height / 2 - 8 },
  });
  const ward = page.getByTestId("hospital-build-1");
  await expect(ward).toHaveAttribute("open", "");
  await expect(ward.getByRole("listitem")).toHaveCount(3);
  await expect(ward).toContainText("회복 719/720");
  await expect(ward).toContainText("중상");
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
  await button("개발 도구").click();
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
