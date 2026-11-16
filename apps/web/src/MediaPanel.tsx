import { useEffect, useRef, useState } from "react";
import { useAudio } from "./AudioProvider.js";
import type { MediaChannel } from "./audio.js";

type AudioChannel = Exclude<MediaChannel, "video">;

const channels = ["bgm", "voice"] as const;
const labels = { bgm: "BGM", voice: "음성" };
type Selection = { url: string; name: string };
type TrackView = {
  name: string;
  phase: string;
  error: string | null;
  selected: boolean;
};
const initialView = (): TrackView => ({
  name: "선택한 파일 없음",
  phase: "대기",
  error: null,
  selected: false,
});

export function MediaPanel() {
  const { audioRef } = useAudio();
  const selections = useRef<Record<AudioChannel, Selection | null>>({
    bgm: null,
    voice: null,
  });
  const requests = useRef({ bgm: 0, voice: 0 });
  const [tracks, setTracks] = useState({
    bgm: initialView(),
    voice: initialView(),
  });

  function update(channel: AudioChannel, patch: Partial<TrackView>) {
    setTracks((current) => ({
      ...current,
      [channel]: { ...current[channel], ...patch },
    }));
  }

  useEffect(
    () => () => {
      for (const channel of channels) {
        requests.current[channel] += 1;
        audioRef.current?.stopMedia(channel);
        const selected = selections.current[channel];
        if (selected) URL.revokeObjectURL(selected.url);
      }
    },
    [audioRef],
  );

  function select(channel: AudioChannel, file: File | undefined) {
    if (!file) return;
    if (
      !file.type.startsWith("audio/") &&
      !/\.(wav|mp3|ogg|m4a|aac|flac|webm)$/i.test(file.name)
    ) {
      update(channel, { error: "재생할 음원 파일을 선택해 주세요." });
      return;
    }
    let url: string;
    try {
      url = URL.createObjectURL(file);
    } catch {
      update(channel, { error: "파일을 열지 못했습니다. 다시 선택해 주세요." });
      return;
    }
    requests.current[channel] += 1;
    audioRef.current?.stopMedia(channel);
    const previous = selections.current[channel];
    selections.current[channel] = { url, name: file.name };
    if (previous) URL.revokeObjectURL(previous.url);
    update(channel, {
      name: file.name,
      phase: "준비",
      error: null,
      selected: true,
    });
  }

  function stop(channel: AudioChannel) {
    requests.current[channel] += 1;
    audioRef.current?.stopMedia(channel);
    update(channel, { phase: "정지", error: null });
  }

  async function play(channel: AudioChannel) {
    const selection = selections.current[channel];
    const audio = audioRef.current;
    if (!selection || !audio) return;
    const request = ++requests.current[channel];
    let finished = false;
    update(channel, { phase: "재생 준비 중", error: null });
    const failed = () => {
      finished = true;
      if (requests.current[channel] === request)
        update(channel, {
          phase: "재생 실패",
          error:
            "음원을 재생하지 못했습니다. 파일 형식이나 브라우저 재생 권한을 확인해 주세요.",
        });
    };
    try {
      const started = await audio.playMedia(
        channel,
        selection.url,
        () => {
          finished = true;
          if (requests.current[channel] === request)
            update(channel, { phase: "재생 완료" });
        },
        failed,
      );
      if (!finished && requests.current[channel] === request)
        update(channel, { phase: started ? "재생 중" : "정지" });
    } catch {
      failed();
    }
  }

  return (
    <section className="panel" aria-label="BGM과 음성 재생">
      <h2>BGM과 음성</h2>
      <p className="hint">
        파일을 선택하고 재생을 눌러 주세요. BGM은 반복하고 음성은 한 번
        재생합니다.
      </p>
      <p className="hint">
        선택한 파일은 이 브라우저에서만 재생되며 서버에 업로드하지 않습니다.
        전체 음량과 소리 끄기는 설정 메뉴에서 조절합니다.
      </p>
      {channels.map((channel) => (
        <fieldset key={channel} className="media-track">
          <legend>{labels[channel]}</legend>
          <label>
            {labels[channel]} 파일
            <input
              type="file"
              accept="audio/*,.wav,.mp3,.ogg,.m4a,.aac,.flac,.webm"
              onChange={(event) => {
                select(channel, event.currentTarget.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <p>{tracks[channel].name}</p>
          <div className="media-actions">
            <button
              type="button"
              onClick={() => void play(channel)}
              disabled={
                !tracks[channel].selected ||
                tracks[channel].phase === "재생 준비 중"
              }
            >
              {labels[channel]} 재생
            </button>
            <button
              type="button"
              onClick={() => stop(channel)}
              disabled={!tracks[channel].selected}
            >
              {labels[channel]} 정지
            </button>
          </div>
          <p aria-live="polite" data-testid={`${channel}-status`}>
            {tracks[channel].phase}
          </p>
          {tracks[channel].error ? (
            <p role="alert">{tracks[channel].error}</p>
          ) : null}
        </fieldset>
      ))}
    </section>
  );
}
