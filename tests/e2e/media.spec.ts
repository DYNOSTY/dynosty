import { expect, test } from "@playwright/test";
import { closeWorkspace, openWorkspace } from "./workspace.js";

// 테스트용 PCM WAV. 실제 BGM·대사 파일이나 네트워크 음원을 사용하지 않는다.
function wave(seconds = 1) {
  const rate = 8000;
  const samples = Math.round(rate * seconds);
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i += 1)
    buffer.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 1500),
      44 + i * 2,
    );
  return buffer;
}

type Probe = {
  contexts: AudioContext[];
  gains: GainNode[];
  elements: HTMLMediaElement[];
  revoked: string[];
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const probe = {
      contexts: [] as AudioContext[],
      gains: [] as GainNode[],
      elements: [] as HTMLMediaElement[],
      revoked: [] as string[],
    };
    const Base = window.AudioContext;
    class Observed extends Base {
      constructor(options?: AudioContextOptions) {
        super(options);
        probe.contexts.push(this);
      }
      override createGain() {
        const gain = super.createGain();
        probe.gains.push(gain);
        return gain;
      }
      override createMediaElementSource(element: HTMLMediaElement) {
        probe.elements.push(element);
        return super.createMediaElementSource(element);
      }
    }
    window.AudioContext = Observed;
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url) => {
      probe.revoked.push(url);
      revoke(url);
    };
    Object.assign(window, { mediaProbe: probe });
  });
});

test("BGM·음성을 함께 재생하고 복원된 음량·음소거와 정지를 각각 적용한다", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await openWorkspace(page);
  await page.evaluate(() => {
    localStorage.setItem(
      "dynosty.settings",
      JSON.stringify({ settingsVersion: 1, masterVolume: 35, muted: true }),
    );
    localStorage.setItem("dynosty.example.saves", "keep game save");
  });
  await page.reload();
  await openWorkspace(page);
  await page.getByLabel("BGM 파일", { exact: true }).setInputFiles({
    name: "bgm.wav",
    mimeType: "audio/wav",
    buffer: wave(0.2),
  });
  await page.getByLabel("음성 파일", { exact: true }).setInputFiles({
    name: "voice.wav",
    mimeType: "audio/wav",
    buffer: wave(10),
  });
  // 제출본은 타이틀 BGM이 공용 AudioContext 하나를 먼저 만들 수 있다.
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { mediaProbe: Probe }).mediaProbe.contexts.length,
    ),
  ).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "BGM 재생", exact: true }).click();
  await expect(page.getByTestId("bgm-status")).toHaveText("재생 중");
  await page.getByRole("button", { name: "음성 재생", exact: true }).click();
  await expect(page.getByTestId("voice-status")).toHaveText("재생 중");
  const output = () =>
    page.evaluate(() => {
      const p = (window as unknown as { mediaProbe: Probe }).mediaProbe;
      return {
        gain: p.gains[0]?.gain.value,
        contexts: p.contexts.length,
        loops: p.elements.map((e) => e.loop),
        paused: p.elements.map((e) => e.paused),
      };
    });
  await expect.poll(output).toEqual({
    gain: 0,
    contexts: 1,
    loops: [true, false],
    paused: [false, false],
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { mediaProbe: Probe }).mediaProbe.contexts[0]
            ?.currentTime ?? 0,
      ),
    )
    .toBeGreaterThan(0.6);
  await expect.poll(async () => (await output()).paused[0]).toBe(false);
  await closeWorkspace(page);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: "소리 끄기" }).uncheck();
  await expect.poll(async () => (await output()).gain).toBeCloseTo(0.35, 6);
  await dialog.getByRole("slider", { name: "전체 음량" }).press("End");
  await expect.poll(async () => (await output()).gain).toBe(1);
  await dialog.getByRole("checkbox", { name: "소리 끄기" }).check();
  await expect.poll(async () => (await output()).gain).toBe(0);
  await dialog.getByRole("button", { name: "설정 닫기" }).click();
  await openWorkspace(page);
  await expect.poll(async () => (await output()).paused[0]).toBe(false);
  await page.getByRole("button", { name: "음성 정지", exact: true }).click();
  await expect(page.getByTestId("voice-status")).toHaveText("정지");
  await expect.poll(async () => (await output()).paused).toEqual([false, true]);
  await page.getByRole("button", { name: "BGM 정지", exact: true }).click();
  await expect.poll(async () => (await output()).paused).toEqual([true, true]);
  expect(
    await page.evaluate(() => localStorage.getItem("dynosty.example.saves")),
  ).toBe("keep game save");
  expect(errors).toEqual([]);
});

test("음성 자연 종료와 BGM 파일 교체·참조 해제를 처리한다", async ({
  page,
}) => {
  await page.goto("/");
  await openWorkspace(page);
  const bgmFile = page.getByLabel("BGM 파일", { exact: true });
  await bgmFile.setInputFiles({
    name: "first.wav",
    mimeType: "audio/wav",
    buffer: wave(),
  });
  await page.getByRole("button", { name: "BGM 재생", exact: true }).click();
  await expect(page.getByTestId("bgm-status")).toHaveText("재생 중");
  const oldUrl = await page.evaluate(
    () =>
      (window as unknown as { mediaProbe: Probe }).mediaProbe.elements[0]?.src,
  );
  await bgmFile.setInputFiles({
    name: "second.wav",
    mimeType: "audio/wav",
    buffer: wave(),
  });
  await expect(page.getByTestId("bgm-status")).toHaveText("준비");
  expect(
    await page.evaluate(
      () => (window as unknown as { mediaProbe: Probe }).mediaProbe.revoked,
    ),
  ).toContain(oldUrl);
  await page.getByRole("button", { name: "BGM 재생", exact: true }).click();
  await expect(page.getByTestId("bgm-status")).toHaveText("재생 중");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { mediaProbe: Probe }).mediaProbe.elements.length,
    ),
  ).toBe(1);
  await page.getByLabel("음성 파일", { exact: true }).setInputFiles({
    name: "short.wav",
    mimeType: "audio/wav",
    buffer: wave(0.15),
  });
  await page.getByRole("button", { name: "음성 재생", exact: true }).click();
  await expect(page.getByTestId("voice-status")).toHaveText("재생 완료");
  await page.getByLabel("음성 파일", { exact: true }).setInputFiles({
    name: "wrong.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not audio"),
  });
  await expect(page.getByRole("alert")).toContainText("음원 파일");
  await expect(page.getByText("short.wav", { exact: true })).toBeVisible();
  await page.reload();
  await openWorkspace(page);
  await expect(
    page.getByRole("button", { name: "BGM 재생", exact: true }),
  ).toBeDisabled();
  // 제출본은 타이틀 BGM이 공용 AudioContext 하나를 먼저 만들 수 있다.
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { mediaProbe: Probe }).mediaProbe.contexts.length,
    ),
  ).toBeLessThanOrEqual(1);
});

test("손상된 음원과 재생 거부를 안내하고 새 파일로 다시 재생할 수 있다", async ({
  page,
}) => {
  await page.goto("/");
  await openWorkspace(page);
  const voice = page.getByLabel("음성 파일", { exact: true });
  const play = page.getByRole("button", { name: "음성 재생", exact: true });
  await voice.setInputFiles({
    name: "broken.wav",
    mimeType: "audio/wav",
    buffer: Buffer.from("not a wave"),
  });
  await play.click();
  await expect(page.getByTestId("voice-status")).toHaveText("재생 실패");
  await expect(page.getByRole("alert")).toContainText("재생하지 못했습니다");
  await voice.setInputFiles({
    name: "valid.wav",
    mimeType: "audio/wav",
    buffer: wave(2),
  });
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
  await expect(page.getByTestId("voice-status")).toHaveText("재생 실패");
  await play.click();
  await expect(page.getByTestId("voice-status")).toHaveText("재생 중");
  await expect(page.getByRole("alert")).not.toBeVisible();
});
