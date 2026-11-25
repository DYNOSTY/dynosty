import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const wave = fileURLToPath(
  new URL("./fixtures/test-audio.wav", import.meta.url),
);

test("첫 화면의 중심에 실제 3D 장면을 표시하고 저장·개발 메뉴는 접어 둔다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
  );
  await expect(page.getByText("1일차", { exact: true })).toBeVisible();
  for (const name of ["저장", "개발 도구"]) {
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.getByRole("region", { name: `${name} 패널`, exact: true }),
    ).toBeHidden();
  }
  const canvas = page.locator("canvas");
  await expect(canvas).toBeInViewport({ ratio: 1 });
  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(1000);
  expect(box?.height).toBeGreaterThan(400);
  expect(await canvas.evaluate((e) => e.width > 0 && e.height > 0)).toBe(true);
  await expect(
    page.getByRole("button", { name: "하루 진행", exact: true }),
  ).toBeHidden();
});

test("메뉴를 여닫아도 장면·날짜를 유지하고 저장 메뉴에서 예제를 복원한다", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
  );
  const canvas = await page.locator("canvas").elementHandle();
  await page.getByRole("button", { name: "개발 도구", exact: true }).click();
  await page.getByRole("button", { name: "하루 진행", exact: true }).click();
  await page
    .getByRole("button", { name: "3D 연결 예제 바꾸기", exact: true })
    .click();
  await expect(page.getByTestId("scene-example-motion")).toHaveText(
    "걷기 표시",
  );
  await page
    .getByRole("button", { name: "개발 도구 닫기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "개발 도구", exact: true }),
  ).toBeFocused();
  // 제출본은 개발 도구를 연 동안에만 예제 날짜를 상단에 표시한다.
  await page.getByRole("button", { name: "개발 도구", exact: true }).click();
  await expect(page.getByText("2일차", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "예제 저장", exact: true }).click();
  await expect(page.getByTestId("local-save-status")).toHaveText(
    "예제를 저장했습니다.",
  );
  await page.getByRole("button", { name: "하루 진행", exact: true }).click();
  await expect(page.getByText("3일차", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "저장 불러오기", exact: true })
    .click();
  await expect(page.getByText("2일차", { exact: true })).toBeVisible();
  expect(
    await canvas?.evaluate((e) => e === document.querySelector("canvas")),
  ).toBe(true);
  await page
    .getByRole("button", { name: "개발 도구 닫기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "개발 도구", exact: true }),
  ).toBeFocused();
  expect(errors).toEqual([]);
});

test("개발 패널을 접어도 음원 파일 연결과 재생을 유지한다", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Base = window.AudioContext;
    const elements: HTMLMediaElement[] = [];
    class Observed extends Base {
      override createMediaElementSource(element: HTMLMediaElement) {
        elements.push(element);
        return super.createMediaElementSource(element);
      }
    }
    window.AudioContext = Observed;
    Object.assign(window, { layoutAudioElements: elements });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "개발 도구", exact: true }).click();
  await page.getByLabel("BGM 파일", { exact: true }).setInputFiles(wave);
  await page.getByLabel("BGM 이름", { exact: true }).fill("패널 유지 확인");
  await page
    .getByRole("button", { name: "BGM 목록 추가", exact: true })
    .click();
  const id = await page.getByLabel("BGM 음원 목록").inputValue();
  await page.getByRole("button", { name: "BGM 재생", exact: true }).click();
  await expect(page.getByTestId("bgm-status")).toHaveText("재생 중");
  await page
    .getByRole("button", { name: "개발 도구 닫기", exact: true })
    .click();
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { layoutAudioElements: HTMLMediaElement[] }
      ).layoutAudioElements.map((e) => e.paused),
    ),
  ).toEqual([false]);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("checkbox", { name: "소리 끄기" })
    .check();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "설정", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "개발 도구", exact: true }).click();
  await expect(page.getByLabel("BGM 음원 목록")).toHaveValue(id);
  await expect(page.getByTestId("bgm-status")).toHaveText("재생 중");
  await page.getByRole("button", { name: "BGM 정지", exact: true }).click();
});
