import {
  type AudioSettings,
  defaultAudioSettings,
  effectiveVolume,
  parseAudioSettings,
} from "./settings.js";

// 공용 출력 음량 경계. 실제 음원은 추후 이 GainNode에 연결한다.
export function createAudioController(makeContext = () => new AudioContext()) {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let settings = defaultAudioSettings();
  let disposed = false;
  let request = 0;
  const voices = new Map<OscillatorNode, GainNode>();

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
      if (!context) {
        const created = makeContext();
        const output = created.createGain();
        output.gain.value = effectiveVolume(settings);
        output.connect(created.destination);
        master = output;
        context = created;
      }
      const active = context;
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
    stopPreview,
    dispose() {
      if (disposed) return;
      disposed = true;
      stopPreview();
      master?.disconnect();
      if (context && context.state !== "closed")
        void context.close().catch(() => {});
    },
  };
}
