import { useEffect, useRef, useState } from "react";
import { useAudio } from "./AudioProvider.js";

export function VideoPanel() {
  const { audioRef } = useAudio();
  const videoRef = useRef<HTMLVideoElement>(null);
  const urlRef = useRef<string | null>(null);
  const requestRef = useRef(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [phase, setPhase] = useState("대기");
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      requestRef.current += 1;
      audioRef.current?.stopMedia("video");
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [audioRef],
  );

  function select(file: File | undefined) {
    if (!file) return;
    if (
      !file.type.startsWith("video/") &&
      !/\.(mp4|webm|ogv|mov|m4v)$/i.test(file.name)
    ) {
      setError("재생할 영상 파일을 선택해 주세요.");
      return;
    }
    let url: string;
    try {
      url = URL.createObjectURL(file);
    } catch {
      setError("영상 파일을 열지 못했습니다. 다시 선택해 주세요.");
      return;
    }
    requestRef.current += 1;
    audioRef.current?.stopMedia("video");
    const previous = urlRef.current;
    urlRef.current = url;
    if (previous) URL.revokeObjectURL(previous);
    setFileName(file.name);
    setPhase("준비");
    setError(null);
  }

  function stop() {
    requestRef.current += 1;
    audioRef.current?.stopMedia("video");
    setPhase("정지");
    setError(null);
  }

  async function play() {
    const url = urlRef.current;
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!url || !video || !audio) return;
    const request = ++requestRef.current;
    let finished = false;
    setPhase("재생 준비 중");
    setError(null);
    const failed = () => {
      finished = true;
      if (requestRef.current !== request) return;
      setPhase("재생 실패");
      setError(
        "영상을 재생하지 못했습니다. 파일 형식이나 브라우저 재생 권한을 확인해 주세요.",
      );
    };
    try {
      const started = await audio.playMedia(
        "video",
        url,
        () => {
          finished = true;
          if (requestRef.current === request) setPhase("재생 완료");
        },
        failed,
        video,
      );
      if (!finished && requestRef.current === request)
        setPhase(started ? "재생 중" : "정지");
    } catch {
      failed();
    }
  }

  return (
    <section className="panel" aria-label="영상 재생">
      <h2>영상</h2>
      <p className="hint">
        파일을 선택한 뒤 재생을 눌러 주세요. 영상 소리도 설정의 전체 음량과 소리
        끄기를 따릅니다.
      </p>
      <label>
        영상 파일
        <input
          className="video-file"
          type="file"
          accept="video/*,.mp4,.webm,.ogv,.mov,.m4v"
          onChange={(event) => {
            select(event.currentTarget.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
      </label>
      <p>{fileName ?? "선택한 파일 없음"}</p>
      {/* biome-ignore lint/a11y/useMediaCaption: 사용자 로컬 영상의 자막 가져오기는 별도 범위이며 빈 자막을 제공하지 않는다. */}
      <video
        ref={videoRef}
        className="video-player"
        aria-label="선택한 영상"
        playsInline
        preload="none"
      />
      <div className="media-actions">
        <button
          type="button"
          onClick={() => void play()}
          disabled={!fileName || phase === "재생 준비 중"}
        >
          영상 재생
        </button>
        <button type="button" onClick={stop} disabled={!fileName}>
          영상 정지
        </button>
      </div>
      <p aria-live="polite" data-testid="video-status">
        {phase}
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <p className="hint">
        파일은 서버에 업로드하지 않습니다. 새로고침 후에는 다시 선택해야 합니다.
        영상은 BGM·음성과 별도로 조작하며 자동 재생하지 않습니다.
      </p>
    </section>
  );
}
