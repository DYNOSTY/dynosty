import { expect, test } from "@playwright/test";

const settingsKey = "dynosty.settings";
const gameKey = "dynosty.example.saves";

test("설정 메뉴에서 키보드로 바꾼 음량·음소거를 새로고침 후 복원한다", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(
    (key) => localStorage.setItem(key, "keep game save"),
    gameKey,
  );
  const opener = page.getByRole("button", { name: "설정", exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "설정" });
  const volume = dialog.getByRole("slider", { name: "전체 음량" });
  await expect(volume).toHaveValue("50");
  await volume.press("End");
  await dialog.getByRole("checkbox", { name: "소리 끄기" }).check();
  await expect(dialog.getByTestId("settings-save-status")).toHaveText(
    "설정을 저장했습니다.",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await page.reload();
  await opener.click();
  await expect(volume).toHaveValue("100");
  await expect(
    dialog.getByRole("checkbox", { name: "소리 끄기" }),
  ).toBeChecked();
  await expect(
    dialog.getByRole("button", { name: "확인음 듣기" }),
  ).toBeDisabled();
  expect(await page.evaluate((key) => localStorage.getItem(key), gameKey)).toBe(
    "keep game save",
  );
});

test("저장된 음량이 실제 오디오 출력에 적용되고 자동 재생하지 않는다", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({ settingsVersion: 1, masterVolume: 25, muted: false }),
    );
    const probe = {
      contexts: [] as AudioContext[],
      gains: [] as GainNode[],
      oscillators: 0,
    };
    const Base = window.AudioContext;
    class ObservedAudioContext extends Base {
      constructor(options?: AudioContextOptions) {
        super(options);
        probe.contexts.push(this);
      }
      override createGain() {
        const node = super.createGain();
        probe.gains.push(node);
        return node;
      }
      override createOscillator() {
        probe.oscillators += 1;
        return super.createOscillator();
      }
    }
    window.AudioContext = ObservedAudioContext;
    Object.assign(window, { settingsAudioProbe: probe });
  }, settingsKey);
  await page.goto("/");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const volume = dialog.getByRole("slider", { name: "전체 음량" });
  await expect(volume).toHaveValue("25");
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            settingsAudioProbe: { contexts: AudioContext[] };
          }
        ).settingsAudioProbe.contexts.length,
    ),
  ).toBe(0);
  await dialog.getByRole("button", { name: "확인음 듣기" }).click();
  await expect(dialog.getByTestId("audio-preview-status")).toHaveText(
    "확인음을 재생했습니다.",
  );
  const output = () =>
    page.evaluate(() => {
      const probe = (
        window as unknown as {
          settingsAudioProbe: {
            contexts: AudioContext[];
            gains: GainNode[];
            oscillators: number;
          };
        }
      ).settingsAudioProbe;
      return {
        state: probe.contexts[0]?.state,
        gain: probe.gains[0]?.gain.value,
        oscillators: probe.oscillators,
      };
    });
  await expect
    .poll(output)
    .toEqual({ state: "running", gain: 0.25, oscillators: 1 });
  const muted = dialog.getByRole("checkbox", { name: "소리 끄기" });
  await muted.check();
  await expect.poll(async () => (await output()).gain).toBe(0);
  await muted.uncheck();
  await expect.poll(async () => (await output()).gain).toBe(0.25);
  await volume.press("Home");
  await expect.poll(async () => (await output()).gain).toBe(0);
  await volume.press("End");
  await expect.poll(async () => (await output()).gain).toBe(1);
});

for (const raw of [
  "{broken",
  '{"settingsVersion":99,"masterVolume":90,"muted":false}',
]) {
  test(`손상·미지원 설정은 기본값으로 시작하고 읽기만으로 덮어쓰지 않는다: ${raw}`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
      key: settingsKey,
      value: raw,
    });
    await page.reload();
    await page.getByRole("button", { name: "설정", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const volume = dialog.getByRole("slider", { name: "전체 음량" });
    await expect(volume).toHaveValue("50");
    await expect(dialog.getByRole("alert")).toContainText("기본값");
    expect(
      await page.evaluate((key) => localStorage.getItem(key), settingsKey),
    ).toBe(raw);
    await volume.press("End");
    await expect(dialog.getByTestId("settings-save-status")).toHaveText(
      "설정을 저장했습니다.",
    );
    await expect(dialog.getByRole("alert")).not.toBeVisible();
  });
}

test("설정 쓰기 실패는 이번 실행에만 적용하고 이전 설정·게임 저장을 유지한다", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const volume = dialog.getByRole("slider", { name: "전체 음량" });
  await volume.press("End");
  const before = await page.evaluate(
    (key) => localStorage.getItem(key),
    settingsKey,
  );
  await page.evaluate(
    ({ key, game }) => {
      localStorage.setItem(game, "keep game save");
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (name === key)
          throw new DOMException("test quota", "QuotaExceededError");
        return original.call(this, name, value);
      };
    },
    { key: settingsKey, game: gameKey },
  );
  await volume.press("Home");
  await expect(volume).toHaveValue("0");
  await expect(dialog.getByTestId("settings-save-status")).toHaveText(
    "이번 실행에만 적용했습니다.",
  );
  await expect(dialog.getByRole("alert")).toContainText("저장하지 못했습니다");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), settingsKey),
  ).toBe(before);
  expect(await page.evaluate((key) => localStorage.getItem(key), gameKey)).toBe(
    "keep game save",
  );
  await page.reload();
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(volume).toHaveValue("100");
});

test("오디오를 사용할 수 없어도 안전한 안내 후 설정을 변경할 수 있다", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "AudioContext", {
      value: class {
        constructor() {
          throw new Error("test audio denied");
        }
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "확인음 듣기" }).click();
  await expect(dialog.getByTestId("audio-preview-status")).toContainText(
    "재생하지 못했습니다",
  );
  await dialog.getByRole("slider", { name: "전체 음량" }).press("End");
  await expect(dialog.getByTestId("settings-save-status")).toHaveText(
    "설정을 저장했습니다.",
  );
});
