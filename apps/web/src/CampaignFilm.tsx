import { useEffect, useRef, useState } from "react";
import { useAudio } from "./AudioProvider.js";

export function fadeOut(element: HTMLElement | null, next: () => void) {
  if (!element || matchMedia("(prefers-reduced-motion: reduce)").matches)
    return next();
  if (element.dataset.leaving) return;
  element.dataset.leaving = "true";
  const animation = element.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: 650,
    easing: "ease-in-out",
  });
  animation.onfinish = () => {
    delete element.dataset.leaving;
    next();
  };
}

const viewed = new Set<string>();
export function filmSeen(id: string) {
  try {
    return (
      viewed.has(id) || localStorage.getItem(`dynosty.film.${id}`) === "seen"
    );
  } catch {
    return viewed.has(id);
  }
}
export function rememberFilm(id: string) {
  viewed.add(id);
  try {
    localStorage.setItem(`dynosty.film.${id}`, "seen");
  } catch {
    /* Session memory still works. */
  }
}
export function CampaignFilm({
  id,
  title,
  finish,
}: {
  id: string;
  title: string;
  finish?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const { settings, setFilmHasAudio } = useAudio();
  const narrated = [
    "opening",
    "one",
    "two",
    "three",
    "escort",
    "four",
    "five",
    "hope",
    "escape",
    "order",
  ].includes(id);
  useEffect(() => {
    if (narrated) setFilmHasAudio(true);
    return () => {
      if (narrated) setFilmHasAudio(false);
    };
  }, [narrated, setFilmHasAudio]);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (video) video.volume = settings.masterVolume / 100;
  }, [settings.masterVolume]);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let active = true;
    video.play().catch(() => {
      if (active && video.paused) setBlocked(true);
    });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="campaign-film" aria-label={title}>
      <video
        ref={ref}
        src={`/story/campaign/${id}.mp4`}
        aria-label={title}
        muted={settings.muted}
        controls
        playsInline
        onPlay={() => {
          setBlocked(false);
          if (!finish) rememberFilm(id);
        }}
        onEnded={finish}
      />
      {blocked && (
        <button
          type="button"
          className="film-play"
          onClick={() => {
            void ref.current?.play().catch(() => setBlocked(true));
          }}
        >
          영상 재생
        </button>
      )}
      {finish && (
        <button type="button" className="film-skip" onClick={finish}>
          건너뛰기
        </button>
      )}
    </section>
  );
}
