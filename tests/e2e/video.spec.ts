import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openWorkspace } from "./workspace.js";

const videoPath = fileURLToPath(
  new URL("./fixtures/test-video.webm", import.meta.url),
);
const audioPath = fileURLToPath(
  new URL("./fixtures/test-audio.wav", import.meta.url),
);
type Probe = {
  contexts: AudioContext[];
  gains: GainNode[];
  elements: HTMLMediaElement[];
  revoked: string[];
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const p = {
      contexts: [] as AudioContext[],
      gains: [] as GainNode[],
      elements: [] as HTMLMediaElement[],
      revoked: [] as string[],
    };
    const Base = window.AudioContext;
    class Observed extends Base {
      constructor(options?: AudioContextOptions) {
        super(options);
        p.contexts.push(this);
      }
      override createGain() {
        const gain = super.createGain();
        p.gains.push(gain);
        return gain;
      }
      override createMediaElementSource(element: HTMLMediaElement) {
        p.elements.push(element);
        return super.createMediaElementSource(element);
      }
    }
    window.AudioContext = Observed;
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url) => {
      p.revoked.push(url);
      revoke(url);
    };
    Object.assign(window, { videoProbe: p });
  });
});

test("영상 수동 재생·정지·자연 종료에 저장된 음량·음소거가 적용된다", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await openWorkspace(page);
  await page.evaluate(() => {
    localStorage.setItem(
      "dynosty.settings",
      JSON.stringify({ settingsVersion: 1, masterVolume: 25, muted: true }),
    );
    localStorage.setItem("dynosty.example.saves", "keep game save");
  });
  await page.reload();
  await openWorkspace(page);
  await page.getByLabel("영상 파일", { exact: true }).setInputFiles(videoPath);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { videoProbe: Probe }).videoProbe.contexts.length,
    ),
  ).toBe(0);
  const video = page.getByLabel("선택한 영상", { exact: true });
  await expect(video).toHaveJSProperty("paused", true);
  await page.getByRole("button", { name: "영상 재생", exact: true }).click();
  await expect(page.getByTestId("video-status")).toHaveText("재생 중");
  await expect(video).toHaveJSProperty("videoWidth", 64);
  await expect(video).toHaveJSProperty("videoHeight", 36);
  await expect
    .poll(() =>
      video.evaluate(
        (e: HTMLVideoElement) => e.getVideoPlaybackQuality().totalVideoFrames,
      ),
    )
    .toBeGreaterThan(0);
  const gain = () =>
    page.evaluate(
      () =>
        (window as unknown as { videoProbe: Probe }).videoProbe.gains[0]?.gain
          .value,
    );
  await expect.poll(gain).toBe(0);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: "소리 끄기" }).uncheck();
  await expect.poll(gain).toBe(0.25);
  await dialog.getByRole("slider", { name: "전체 음량" }).press("End");
  await expect.poll(gain).toBe(1);
  await dialog.getByRole("checkbox", { name: "소리 끄기" }).check();
  await expect.poll(gain).toBe(0);
  await dialog.getByRole("button", { name: "설정 닫기" }).click();
  await page.getByRole("button", { name: "영상 정지", exact: true }).click();
  await expect(page.getByTestId("video-status")).toHaveText("정지");
  await expect(video).toHaveJSProperty("paused", true);
  await expect(video).toHaveJSProperty("currentTime", 0);
  await page.getByRole("button", { name: "영상 재생", exact: true }).click();
  await expect(page.getByTestId("video-status")).toHaveText("재생 완료", {
    timeout: 12_000,
  });
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { videoProbe: Probe }).videoProbe.elements.length,
    ),
  ).toBe(1);
  expect(
    await page.evaluate(() => localStorage.getItem("dynosty.example.saves")),
  ).toBe("keep game save");
  expect(errors).toEqual([]);
});

test("영상 정지·파일 교체가 BGM을 멈추지 않고 이전 파일 참조를 해제한다", async ({
  page,
}) => {
  await page.goto("/");
  await openWorkspace(page);
  await page.getByLabel("BGM 파일", { exact: true }).setInputFiles(audioPath);
  await page.getByRole("button", { name: "BGM 재생", exact: true }).click();
  await expect(page.getByTestId("bgm-status")).toHaveText("재생 중");
  const input = page.getByLabel("영상 파일", { exact: true });
  await input.setInputFiles(videoPath);
  await page.getByRole("button", { name: "영상 재생", exact: true }).click();
  await expect(page.getByTestId("video-status")).toHaveText("재생 중");
  const url = await page
    .getByLabel("선택한 영상", { exact: true })
    .getAttribute("src");
  await input.setInputFiles({
    name: "replacement.webm",
    mimeType: "video/webm",
    buffer: readFileSync(videoPath),
  });
  await expect(page.getByTestId("video-status")).toHaveText("준비");
  expect(
    await page.evaluate(
      () => (window as unknown as { videoProbe: Probe }).videoProbe.revoked,
    ),
  ).toContain(url);
  await page.getByRole("button", { name: "영상 재생", exact: true }).click();
  await expect(page.getByTestId("video-status")).toHaveText("재생 중");
  await page.getByRole("button", { name: "영상 정지", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { videoProbe: Probe }).videoProbe.elements[0]
            ?.paused,
      ),
    )
    .toBe(false);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { videoProbe: Probe }).videoProbe.elements.length,
    ),
  ).toBe(2);
  await page.reload();
  await openWorkspace(page);
  await expect(
    page.getByRole("button", { name: "영상 재생", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { videoProbe: Probe }).videoProbe.contexts.length,
    ),
  ).toBe(0);
});

test("잘못된 영상과 재생 거부를 안내하고 올바른 파일로 복구한다", async ({
  page,
}) => {
  await page.goto("/");
  await openWorkspace(page);
  const input = page.getByLabel("영상 파일", { exact: true });
  const play = page.getByRole("button", { name: "영상 재생", exact: true });
  await input.setInputFiles(videoPath);
  await input.setInputFiles({
    name: "wrong.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("text"),
  });
  await expect(page.getByRole("alert")).toContainText("영상 파일");
  await expect(
    page.getByText("test-video.webm", { exact: true }),
  ).toBeVisible();
  await input.setInputFiles({
    name: "broken.webm",
    mimeType: "video/webm",
    buffer: Buffer.from("not video"),
  });
  await play.click();
  await expect(page.getByTestId("video-status")).toHaveText("재생 실패");
  await expect(page.getByRole("alert")).toContainText("재생하지 못했습니다");
  await input.setInputFiles(videoPath);
  await page.evaluate(() => {
    const original = HTMLMediaElement.prototype.play;
    let first = true;
    HTMLMediaElement.prototype.play = function () {
      if (first) {
        first = false;
        return Promise.reject(
          new DOMException("test denial", "NotAllowedError"),
        );
      }
      return original.call(this);
    };
  });
  await play.click();
  await expect(page.getByTestId("video-status")).toHaveText("재생 실패");
  await play.click();
  await expect(page.getByTestId("video-status")).toHaveText("재생 중");
  await expect(page.getByRole("alert")).not.toBeVisible();
});
