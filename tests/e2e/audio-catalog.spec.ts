import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { closeWorkspace, openWorkspace } from "./workspace.js";

const key = "dynosty.audio.catalog";
const shortWave = readFileSync(
  new URL("./fixtures/test-audio.wav", import.meta.url),
);
// FFmpeg WAV에는 LIST 청크도 있으므로 data 청크의 실제 위치를 사용한다.
const dataOffset = shortWave.indexOf(Buffer.from("data"));
if (dataOffset < 0) throw new Error("테스트 WAV의 data 청크가 없습니다.");
const headerSize = dataOffset + 8;
const longWave = Buffer.concat([
  shortWave.subarray(0, headerSize),
  ...Array.from({ length: 150 }, () => shortWave.subarray(headerSize)),
]);
longWave.writeUInt32LE(longWave.length - 8, 4);
longWave.writeUInt32LE(longWave.length - headerSize, dataOffset + 4);
const file = (name: string) => ({
  name,
  mimeType: "audio/wav",
  buffer: longWave,
});
const stored = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), key);
type Probe = {
  elements: HTMLMediaElement[];
  revoked: string[];
  gains: GainNode[];
};
const output = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as { catalogProbe: Probe }).catalogProbe;
    return {
      paused: p.elements.map((e) => e.paused),
      urls: p.elements.map((e) => e.src),
      revoked: p.revoked,
      gain: p.gains[0]?.gain.value,
    };
  });
async function register(
  page: Page,
  kind: string,
  name: string,
  fileName: string,
) {
  await page
    .getByLabel(`${kind} 파일`, { exact: true })
    .setInputFiles(file(fileName));
  await page.getByLabel(`${kind} 이름`, { exact: true }).fill(name);
  await page
    .getByRole("button", { name: `${kind} 목록 추가`, exact: true })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const probe: Probe = { elements: [], revoked: [], gains: [] };
    const Base = window.AudioContext;
    class Observed extends Base {
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
    Object.assign(window, { catalogProbe: probe });
  });
});

test("이름 변경은 재생을 유지하고 여러 음원의 연결을 전환하며 새로고침 뒤 재연결한다", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await openWorkspace(page);
  await register(page, "BGM", "아침", "morning.wav");
  const morningId = await page.getByLabel("BGM 음원 목록").inputValue();
  await page.getByRole("button", { name: "BGM 재생", exact: true }).click();
  await expect(page.getByTestId("bgm-status")).toHaveText("재생 중");
  const first = (await output(page)).urls[0];
  await page.getByLabel("BGM 이름", { exact: true }).fill("새벽");
  await page
    .getByRole("button", { name: "BGM 이름 변경", exact: true })
    .click();
  expect((await output(page)).paused).toEqual([false]);
  expect((await output(page)).urls[0]).toBe(first);
  await expect(page.getByLabel("BGM 음원 목록")).toHaveValue(morningId);
  await page.getByLabel("BGM 음원 목록").selectOption("");
  await register(page, "BGM", "저녁", "evening.wav");
  const eveningId = await page.getByLabel("BGM 음원 목록").inputValue();
  await page.getByLabel("BGM 음원 목록").selectOption(morningId);
  await expect(page.getByText("morning.wav", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "BGM 재생", exact: true }).click();
  await expect(page.getByTestId("bgm-status")).toHaveText("재생 중");
  await page.getByLabel("BGM 음원 목록").selectOption(eveningId);
  await expect(page.getByText("evening.wav", { exact: true })).toBeVisible();
  expect((await output(page)).paused).toEqual([true]);
  const before = await stored(page);
  expect(before).not.toContain("blob:");
  await page.reload();
  await openWorkspace(page);
  expect(await stored(page)).toBe(before);
  await expect(page.getByLabel("BGM 음원 목록").locator("option")).toHaveText([
    "파일 직접 선택",
    "새벽 (파일 연결 필요)",
    "저녁 (파일 연결 필요)",
  ]);
  await page.getByLabel("BGM 음원 목록").selectOption(morningId);
  await expect(
    page.getByRole("button", { name: "BGM 재생", exact: true }),
  ).toBeDisabled();
  await expect(page.getByTestId("bgm-status")).toHaveText("파일 연결 필요");
  await page.getByLabel("BGM 이름", { exact: true }).fill("추후 BGM");
  await page
    .getByRole("button", { name: "BGM 목록 추가", exact: true })
    .click();
  await expect(
    page
      .getByRole("group", { name: "BGM", exact: true })
      .getByText("선택한 파일 없음", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("BGM 음원 목록").selectOption(morningId);
  await page
    .getByLabel("BGM 파일", { exact: true })
    .setInputFiles(file("new-morning.wav"));
  expect((await output(page)).paused).not.toContain(false);
  await page.getByRole("button", { name: "BGM 재생", exact: true }).click();
  await expect.poll(async () => (await output(page)).paused).toContain(false);
  await expect(page.getByTestId("bgm-status")).toHaveText("재생 중");
  expect(JSON.parse((await stored(page)) ?? "{}").entries[0]).toMatchObject({
    id: morningId,
    name: "새벽",
    fileName: "new-morning.wav",
  });
  expect(errors).toEqual([]);
});

test("종류별 이름 검사와 제거를 처리하고 다른 채널·게임 저장·음량 설정을 보존한다", async ({
  page,
}) => {
  await page.goto("/");
  await openWorkspace(page);
  await page.evaluate(() => {
    localStorage.setItem(
      "dynosty.settings",
      JSON.stringify({ settingsVersion: 1, masterVolume: 35, muted: true }),
    );
    localStorage.setItem("dynosty.example.saves", "keep game saves");
  });
  await page.reload();
  await openWorkspace(page);
  await register(page, "BGM", "공통", "bgm.wav");
  await register(page, "음성", "공통", "voice.wav");
  for (const kind of ["BGM", "음성"])
    await page
      .getByRole("button", { name: `${kind} 재생`, exact: true })
      .click();
  await expect(page.getByTestId("voice-status")).toHaveText("재생 중");
  expect((await output(page)).paused).toEqual([false, false]);
  expect((await output(page)).gain).toBe(0);
  const before = await stored(page);
  await page
    .getByRole("button", { name: "BGM 목록 추가", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "BGM과 음성 재생", exact: true })
      .getByRole("alert"),
  ).toContainText("중복");
  expect(await stored(page)).toBe(before);
  await page.getByLabel("BGM 이름", { exact: true }).fill(" ");
  await page
    .getByRole("button", { name: "BGM 이름 변경", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "BGM과 음성 재생", exact: true })
      .getByRole("alert"),
  ).toContainText("1~80자");
  expect(await stored(page)).toBe(before);
  const bgmUrl = (await output(page)).urls[0];
  await page
    .getByRole("button", { name: "BGM 목록에서 제거", exact: true })
    .click();
  expect((await output(page)).paused).toEqual([true, false]);
  expect((await output(page)).revoked).toContain(bgmUrl);
  await expect(
    page.getByRole("button", { name: "BGM 재생", exact: true }),
  ).toBeDisabled();
  expect(JSON.parse((await stored(page)) ?? "{}").entries).toHaveLength(1);
  await closeWorkspace(page);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("checkbox", { name: "소리 끄기" })
    .uncheck();
  await expect.poll(async () => (await output(page)).gain).toBeCloseTo(0.35, 6);
  expect(
    await page.evaluate(() => localStorage.getItem("dynosty.example.saves")),
  ).toBe("keep game saves");
});

test("목록 저장 실패 시 기존 목록·연결·재생을 보존하고 다시 저장한다", async ({
  page,
}) => {
  await page.goto("/");
  await openWorkspace(page);
  await register(page, "BGM", "아침", "old.wav");
  const id = await page.getByLabel("BGM 음원 목록").inputValue();
  await page.getByRole("button", { name: "BGM 재생", exact: true }).click();
  await expect(page.getByTestId("bgm-status")).toHaveText("재생 중");
  const before = await stored(page);
  const url = (await output(page)).urls[0];
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "dynosty.audio.catalog")
        throw new DOMException("quota", "QuotaExceededError");
      original.call(this, key, value);
    };
    Object.assign(window, {
      restoreCatalogWrite: () => {
        Storage.prototype.setItem = original;
      },
    });
  });
  await page
    .getByLabel("BGM 파일", { exact: true })
    .setInputFiles(file("replacement.wav"));
  await expect(
    page
      .getByRole("region", { name: "BGM과 음성 재생", exact: true })
      .getByRole("alert"),
  ).toContainText("기존 목록과 파일 연결은 유지");
  expect(await stored(page)).toBe(before);
  expect((await output(page)).urls[0]).toBe(url);
  expect((await output(page)).paused).toEqual([false]);
  await expect(page.getByText("old.wav", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "BGM 목록에서 제거", exact: true })
    .click();
  expect(await stored(page)).toBe(before);
  await expect(page.getByLabel("BGM 음원 목록")).toHaveValue(id);
  await page.getByLabel("BGM 음원 목록").selectOption("");
  await page.getByLabel("BGM 음원 목록").selectOption(id);
  await expect(page.getByText("old.wav", { exact: true })).toBeVisible();
  await page.evaluate(() =>
    (
      window as unknown as { restoreCatalogWrite: () => void }
    ).restoreCatalogWrite(),
  );
  await page
    .getByLabel("BGM 파일", { exact: true })
    .setInputFiles(file("replacement.wav"));
  await expect(
    page
      .getByRole("region", { name: "BGM과 음성 재생", exact: true })
      .getByRole("alert"),
  ).not.toBeVisible();
  await expect(
    page.getByText("replacement.wav", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "BGM 재생", exact: true }).click();
  await expect(page.getByTestId("bgm-status")).toHaveText("재생 중");
});

test("손상된 목록을 덮어쓰지 않고 직접 재생과 미연결 항목 등록을 지원한다", async ({
  page,
}) => {
  await page.goto("/");
  await openWorkspace(page);
  await page.getByLabel("음성 이름", { exact: true }).fill("추후 녹음");
  await page
    .getByRole("button", { name: "음성 목록 추가", exact: true })
    .click();
  await expect(page.getByTestId("voice-status")).toHaveText("파일 연결 필요");
  expect(
    JSON.parse((await stored(page)) ?? "{}").entries[0].fileName,
  ).toBeNull();
  await page.evaluate((key) => localStorage.setItem(key, "{broken"), key);
  await page.reload();
  await openWorkspace(page);
  await expect(
    page
      .getByRole("region", { name: "BGM과 음성 재생", exact: true })
      .getByRole("alert"),
  ).toContainText("읽지 못했습니다");
  await register(page, "BGM", "새 음원", "local.wav");
  await expect(
    page
      .getByRole("region", { name: "BGM과 음성 재생", exact: true })
      .getByRole("alert"),
  ).toContainText("덮어쓰지 않았습니다");
  expect(await stored(page)).toBe("{broken");
  await page.getByRole("button", { name: "BGM 재생", exact: true }).click();
  await expect(page.getByTestId("bgm-status")).toHaveText("재생 중");
});
