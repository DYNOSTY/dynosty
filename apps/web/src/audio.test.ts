import { describe, expect, it, vi } from "vitest";
import { createAudioController } from "./audio.js";
import { defaultAudioSettings } from "./settings.js";

function fakeAudio(state = "running", resume = async () => {}) {
  const gains: {
    gain: {
      value: number;
      setValueAtTime: ReturnType<typeof vi.fn>;
      linearRampToValueAtTime: ReturnType<typeof vi.fn>;
    };
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  const oscillators: {
    frequency: { setValueAtTime: ReturnType<typeof vi.fn> };
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  }[] = [];
  const context = {
    state,
    currentTime: 0,
    destination: {},
    resume: vi.fn(resume),
    close: vi.fn(async () => {}),
    createGain: vi.fn(() => {
      const node = {
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      gains.push(node);
      return node;
    }),
    createOscillator: vi.fn(() => {
      const node = {
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as (() => void) | null,
      };
      oscillators.push(node);
      return node;
    }),
  };
  const factory = vi.fn(() => context as unknown as AudioContext);
  return { factory, context, gains, oscillators };
}

describe("공용 오디오 음량", () => {
  it("명시적 재생 전에는 오디오를 만들지 않고 음량·음소거를 출력에 적용한다", async () => {
    const fake = fakeAudio();
    const audio = createAudioController(fake.factory);
    const settings = { ...defaultAudioSettings(), masterVolume: 30 };
    audio.applySettings(settings);
    expect(fake.factory).not.toHaveBeenCalled();
    await audio.preview();
    expect(fake.gains[0]?.gain.value).toBe(0.3);
    expect(fake.gains[0]?.connect).toHaveBeenCalledWith(
      fake.context.destination,
    );
    expect(fake.oscillators[0]?.connect).toHaveBeenCalledWith(fake.gains[1]);
    expect(fake.gains[1]?.connect).toHaveBeenCalledWith(fake.gains[0]);
    audio.applySettings({ ...settings, muted: true });
    expect(fake.gains[0]?.gain.value).toBe(0);
    audio.applySettings(settings);
    expect(fake.gains[0]?.gain.value).toBe(0.3);
    await audio.preview();
    expect(fake.oscillators[0]?.disconnect).toHaveBeenCalled();
    audio.dispose();
    audio.dispose();
    expect(fake.oscillators[1]?.disconnect).toHaveBeenCalled();
    expect(fake.context.close).toHaveBeenCalledTimes(1);
  });

  it("재생 준비 중 창을 닫으면 뒤늦은 재생을 취소한다", async () => {
    let finish: (() => void) | undefined;
    const resumed = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const fake = fakeAudio("suspended", () => resumed);
    const audio = createAudioController(fake.factory);
    const pending = audio.preview();
    audio.stopPreview();
    finish?.();
    expect(await pending).toBe(false);
    expect(fake.context.createOscillator).not.toHaveBeenCalled();
    audio.dispose();
  });
});
