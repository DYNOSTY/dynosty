import { describe, expect, it, vi } from "vitest";
import { createAudioController } from "./audio.js";
import { defaultAudioSettings } from "./settings.js";

function environment() {
  const master = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
  const sources: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  const context = {
    state: "running",
    destination: {},
    createGain: () => master,
    createMediaElementSource: vi.fn(() => {
      const source = { connect: vi.fn(), disconnect: vi.fn() };
      sources.push(source);
      return source;
    }),
    close: vi.fn(async () => {}),
  };
  const elements: ReturnType<typeof media>[] = [];
  function media() {
    const element = {
      src: "",
      loop: false,
      volume: 1,
      muted: false,
      onended: null as (() => void) | null,
      onerror: null as (() => void) | null,
      play: vi.fn(async () => {}),
      pause: vi.fn(),
      load: vi.fn(),
      removeAttribute: vi.fn((name: string) => {
        if (name === "src") element.src = "";
      }),
    };
    return element;
  }
  const factory = vi.fn(() => context as unknown as AudioContext);
  const makeMedia = vi.fn(() => {
    const element = media();
    elements.push(element);
    return element as unknown as HTMLAudioElement;
  });
  return {
    audio: createAudioController(factory, makeMedia),
    factory,
    makeMedia,
    context,
    master,
    sources,
    elements,
  };
}

describe("BGM·음성 공용 출력", () => {
  it("두 채널을 함께 재생하고 같은 음량·음소거를 적용하며 따로 정지한다", async () => {
    const e = environment();
    e.audio.applySettings({ ...defaultAudioSettings(), masterVolume: 35 });
    expect(e.factory).not.toHaveBeenCalled();
    await e.audio.playMedia("bgm", "blob:bgm", vi.fn(), vi.fn());
    await e.audio.playMedia("voice", "blob:voice", vi.fn(), vi.fn());
    expect(e.factory).toHaveBeenCalledTimes(1);
    expect(e.elements[0]?.loop).toBe(true);
    expect(e.elements[1]?.loop).toBe(false);
    expect(e.sources[0]?.connect).toHaveBeenCalledWith(e.master);
    expect(e.sources[1]?.connect).toHaveBeenCalledWith(e.master);
    expect(e.master.gain.value).toBe(0.35);
    e.audio.applySettings({ ...defaultAudioSettings(), muted: true });
    expect(e.master.gain.value).toBe(0);
    e.audio.stopMedia("voice");
    expect(e.elements[1]?.pause).toHaveBeenCalled();
    expect(e.elements[0]?.pause).not.toHaveBeenCalled();
    await e.audio.playMedia("bgm", "blob:replacement", vi.fn(), vi.fn());
    expect(e.makeMedia).toHaveBeenCalledTimes(2);
    expect(e.context.createMediaElementSource).toHaveBeenCalledTimes(2);
    expect(e.elements[0]?.src).toBe("blob:replacement");
    e.audio.dispose();
    e.audio.dispose();
    expect(e.elements[0]?.src).toBe("");
    expect(e.elements[1]?.src).toBe("");
    expect(
      e.sources.every((source) => source.disconnect.mock.calls.length === 1),
    ).toBe(true);
    expect(e.context.close).toHaveBeenCalledTimes(1);
  });

  it("정지 뒤 늦은 재생 완료나 이전 파일 오류를 무시한다", async () => {
    const e = environment();
    const ended = vi.fn();
    const failed = vi.fn();
    await e.audio.playMedia("voice", "blob:first", ended, failed);
    const previousError = e.elements[0]?.onerror;
    let finish: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    e.elements[0]?.play.mockImplementationOnce(() => pending);
    const playing = e.audio.playMedia("voice", "blob:second", ended, failed);
    e.audio.stopMedia("voice");
    previousError?.();
    finish?.();
    expect(await playing).toBe(false);
    expect(ended).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
    e.elements[0]?.play.mockRejectedValueOnce(new Error("denied"));
    await expect(
      e.audio.playMedia("voice", "blob:third", ended, failed),
    ).rejects.toThrow();
    expect(e.elements[0]?.src).toBe("");
    e.audio.dispose();
  });

  it("재생 중 파일 오류를 알리고 해당 채널의 자원을 해제한다", async () => {
    const e = environment();
    const failed = vi.fn();
    await e.audio.playMedia("bgm", "blob:bad", vi.fn(), failed);
    e.elements[0]?.onerror?.();
    expect(failed).toHaveBeenCalledTimes(1);
    expect(e.elements[0]?.src).toBe("");
    expect(e.elements[0]?.pause).toHaveBeenCalled();
    e.audio.dispose();
  });
});
