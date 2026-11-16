import {
  type AudioSettings,
  defaultAudioSettings,
  effectiveVolume,
  parseAudioSettings,
} from "./settings.js";

export type MediaChannel = "bgm" | "voice";

// 확인음·BGM·음성을 같은 출력 음량으로 제어한다.
export function createAudioController(
  makeContext = () => new AudioContext(),
  makeMedia = () => new Audio(),
) {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let settings = defaultAudioSettings();
  let disposed = false;
  let request = 0;
  const voices = new Map<OscillatorNode, GainNode>();
  const tracks = new Map<
    MediaChannel,
    { element: HTMLAudioElement; source: MediaElementAudioSourceNode }
  >();
  const generations = { bgm: 0, voice: 0 };

  function ensureContext() {
    if (!context) {
      const created = makeContext();
      const output = created.createGain();
      output.gain.value = effectiveVolume(settings);
      output.connect(created.destination);
      master = output;
      context = created;
    }
    return context;
  }

  function stopMedia(channel: MediaChannel) {
    generations[channel] += 1;
    const track = tracks.get(channel);
    if (!track) return;
    track.element.onended = null;
    track.element.onerror = null;
    track.element.pause();
    track.element.removeAttribute("src");
    track.element.load();
  }

  function stopPreview() {
    request += 1;
    for (const [oscillator, envelope] of voices) {
      oscillator.onended = null;
      oscillator.stop();
      oscillator.disconnect();
      envelope.disconnect();
    }
    voices.clear();
  }

  return {
    applySettings(value: AudioSettings) {
      settings = parseAudioSettings(value);
      if (master) master.gain.value = effectiveVolume(settings);
    },
    async preview(): Promise<boolean> {
      if (disposed) return false;
      stopPreview();
      const currentRequest = request;
      const active = ensureContext();
      if (active.state === "suspended") await active.resume();
      if (disposed || currentRequest !== request || !master) return false;
      const oscillator = active.createOscillator();
      const envelope = active.createGain();
      const now = active.currentTime;
      oscillator.frequency.setValueAtTime(440, now);
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(0.12, now + 0.02);
      envelope.gain.linearRampToValueAtTime(0, now + 0.45);
      oscillator.connect(envelope);
      envelope.connect(master);
      voices.set(oscillator, envelope);
      oscillator.onended = () => {
        oscillator.disconnect();
        envelope.disconnect();
        voices.delete(oscillator);
      };
      oscillator.start(now);
      oscillator.stop(now + 0.45);
      return true;
    },
    async playMedia(
      channel: MediaChannel,
      url: string,
      onEnded: () => void,
      onError: () => void,
    ): Promise<boolean> {
      if (disposed) return false;
      stopMedia(channel);
      const generation = generations[channel];
      const active = ensureContext();
      let track = tracks.get(channel);
      if (!track) {
        const element = makeMedia();
        const source = active.createMediaElementSource(element);
        if (!master) throw new Error("오디오 출력을 준비하지 못했습니다.");
        source.connect(master);
        track = { element, source };
        tracks.set(channel, track);
      }
      const element = track.element;
      element.loop = channel === "bgm";
      element.volume = 1;
      element.muted = false;
      element.onended = () => {
        if (!disposed && generations[channel] === generation) onEnded();
      };
      element.onerror = () => {
        if (!disposed && generations[channel] === generation) {
          stopMedia(channel);
          onError();
        }
      };
      element.src = url;
      try {
        // 두 호출 모두 사용자의 재생 버튼 이벤트 안에서 시작한다.
        await Promise.all([
          active.state === "suspended" ? active.resume() : Promise.resolve(),
          element.play(),
        ]);
        return !disposed && generations[channel] === generation;
      } catch (error) {
        if (disposed || generations[channel] !== generation) return false;
        stopMedia(channel);
        throw error;
      }
    },
    stopMedia,
    stopPreview,
    dispose() {
      if (disposed) return;
      disposed = true;
      stopPreview();
      for (const channel of ["bgm", "voice"] as const) stopMedia(channel);
      for (const track of tracks.values()) track.source.disconnect();
      tracks.clear();
      master?.disconnect();
      if (context && context.state !== "closed")
        void context.close().catch(() => {});
    },
  };
}
