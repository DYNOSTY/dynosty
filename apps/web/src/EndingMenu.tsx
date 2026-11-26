import {
  CHAPTERS,
  type Difficulty,
  isDifficulty,
  type TimberState,
} from "@dynosty/game-core";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAudio } from "./AudioProvider.js";
import {
  CampaignFilm,
  fadeOut,
  filmSeen,
  rememberFilm,
} from "./CampaignFilm.js";
import { filmMusic } from "./campaign-scenes.js";
import { SettingsMenu } from "./SettingsMenu.js";
import {
  completedChapters,
  listSlots,
  loadSlot,
  replayStage,
  SAVE_SLOT_COUNT,
  writeSlot,
} from "./stage-replay.js";
import "./main-menu.css";

const films: [keyof typeof filmMusic, string][] = [
  ["opening", "서막"],
  ["one", "복홀의 첫 명령"],
  ["ending-1", "복홀의 성곽"],
  ["two", "2단계 · 정찰"],
  ["ending-2", "돌아온 수레 행렬"],
  ["three", "3단계 · 도성"],
  ["ending-3", "남문에 남은 왕"],
  ["escort", "충녕의 남하"],
  ["four", "4단계 · 공존"],
  ["ending-4", "복홀의 광장"],
  ["five", "5단계 · 혹한"],
  ["hope", "언덕 위의 두 공룡"],
  ["escape", "기계가 된 충녕"],
  ["mechanical-late", "뒤늦은 재회"],
  ["order", "양녕의 질서"],
  ["collapse", "과거의 편린"],
  ["king-palace-night", "도성의 마지막 밤"],
];

const galleryArt: Record<keyof typeof filmMusic, string> = {
  opening: "menu-bokhol",
  one: "mokjin-exodus",
  two: "patrol",
  three: "mission-3",
  escort: "road-letter",
  four: "mission-4",
  five: "royal-family",
  "ending-1": "end-1",
  "ending-2": "end-2b",
  "ending-3": "end-3b",
  "ending-4": "end-4",
  hope: "menu-bokhol-ending",
  escape: "awakening-reunion",
  "mechanical-late": "awakening-reunion",
  order: "yangnyeong-mokjin",
  collapse: "gori-exile",
  "king-palace-night": "king-palace-night",
};
export function EndingMenu({
  limit,
  resume,
  restart,
  replayIntro,
  state,
  exit,
  initialView = "menu",
}: {
  limit: number;
  resume: () => void;
  restart: () => void;
  replayIntro?: () => void;
  state: TimberState;
  exit?: () => void;
  initialView?: "menu" | "save" | "pause";
}) {
  const modal = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<
    "menu" | "pause" | "save" | "load" | "replay" | "films"
  >(initialView);
  const [replayMovie, setReplayMovie] = useState(0);
  const [slots, setSlots] = useState<Awaited<ReturnType<typeof listSlots>>>([]);
  const [film, setFilm] = useState<keyof typeof filmMusic | "">("");
  const unlockedFilms = films.filter(
    ([id]) => id === "opening" || filmSeen(id),
  );
  const [slide, setSlide] = useState(0);
  const exhibit = unlockedFilms[slide];
  const { setGalleryMusic } = useAudio();
  useEffect(() => {
    if (!film) return;
    setGalleryMusic(filmMusic[film]);
    return () => setGalleryMusic(null);
  }, [film, setGalleryMusic]);
  const [restartLevel, setRestartLevel] = useState<Difficulty>(
    state.campaign?.difficulty ?? "normal",
  );
  const [notice, setNotice] = useState("");
  const unlocked = completedChapters(limit);
  const [busy, setBusy] = useState(false);
  useLayoutEffect(() => {
    modal.current?.showModal();
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("dynosty.completedChapter", String(unlocked));
    } catch {
      setNotice("단계 완료 기록을 저장하지 못했습니다.");
    }
  }, [unlocked]);
  useEffect(() => {
    if (view === "save" || view === "load" || view === "menu")
      listSlots()
        .then(setSlots)
        .catch(() => setNotice("슬롯 목록을 열 수 없습니다."));
  }, [view]);
  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    setNotice("");
    try {
      await task();
    } catch {
      setNotice("저장 기록을 처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  const beginReplay = (stage: number) => {
    const intro = ["one", "two", "three", "four", "five"][stage - 1];
    if (stage === 1 || (intro && filmSeen(intro)))
      void run(() => replayStage(stage, restartLevel));
    else setReplayMovie(stage);
  };
  const id = ["one", "two", "three", "four", "five"][replayMovie - 1];
  const chapterTitle = CHAPTERS[replayMovie - 1];
  if (id && chapterTitle) {
    const finish = () =>
      fadeOut(modal.current, () => {
        rememberFilm(id);
        void run(() => replayStage(replayMovie, restartLevel));
        setReplayMovie(0);
      });
    return (
      <dialog
        ref={modal}
        className="film-screen"
        aria-label={chapterTitle}
        onCancel={(e) => {
          e.preventDefault();
          finish();
        }}
      >
        <CampaignFilm id={id} title={chapterTitle} finish={finish} />
      </dialog>
    );
  }
  return (
    <dialog
      ref={modal}
      className={
        view === "menu"
          ? "bokhol-title"
          : view === "films"
            ? "campaign-dialog film-gallery"
            : view === "pause"
              ? "campaign-dialog pause-menu"
              : "campaign-dialog"
      }
      data-view={view}
      data-survived={unlocked === CHAPTERS.length}
      aria-label={
        view === "pause"
          ? "일시정지"
          : view === "films"
            ? "돌아보기"
            : "메인 메뉴"
      }
      onCancel={(e) => {
        e.preventDefault();
        if (view === "menu") return;
        if (view === initialView) resume();
        else {
          setFilm("");
          setView(initialView);
        }
      }}
    >
      {view === "menu" ? (
        <>
          <h1>
            <img src="/art/dynosty-logo.webp" alt="Dynosty 재의 왕조" />
          </h1>
          {replayIntro && (
            <button
              type="button"
              className="replay-opening"
              onClick={replayIntro}
            >
              서막 다시 보기
            </button>
          )}
          <nav aria-label="메인 메뉴">
            <button type="button" onClick={restart}>
              새로 시작
            </button>
            {(slots.length > 0 ||
              !["opening", "finished"].includes(
                state.campaign?.beat ?? "",
              )) && (
              <button type="button" onClick={() => setView("load")}>
                이어하기
              </button>
            )}
            <button
              type="button"
              disabled={!unlocked && state.campaign?.beat === "opening"}
              onClick={() => setView("replay")}
            >
              다시하기
            </button>
            <button type="button" onClick={() => setView("films")}>
              돌아보기
            </button>
            <SettingsMenu className="bokhol-settings" />
          </nav>
        </>
      ) : view === "pause" ? (
        <>
          <h2>일시정지</h2>
          <footer>
            <button type="button" onClick={resume}>
              계속하기
            </button>
            <button type="button" onClick={() => setView("save")}>
              저장하기
            </button>
            <button type="button" onClick={() => setView("load")}>
              불러오기
            </button>
            <SettingsMenu />
            <button type="button" onClick={exit}>
              나가기
            </button>
          </footer>
        </>
      ) : (
        <>
          <header>
            <h2>
              {
                {
                  films: "돌아보기",
                  save: "저장하기",
                  load: "이어 하기",
                  replay: "다시 하기",
                }[view]
              }
            </h2>
          </header>
          <footer>
            {view === "load" &&
              initialView === "menu" &&
              !["opening", "finished"].includes(state.campaign?.beat ?? "") && (
                <button type="button" onClick={resume}>
                  현재 진행 이어하기
                </button>
              )}
            {view === "films" &&
              (exhibit ? (
                <>
                  {film === "king-palace-night" ? (
                    <img
                      className="gallery-preview"
                      src="/story/campaign/king-palace-night-half-speed.gif"
                      alt={exhibit[1]}
                    />
                  ) : film ? (
                    <CampaignFilm key={film} id={film} title={exhibit[1]} />
                  ) : (
                    <img
                      key={exhibit[0]}
                      className="gallery-preview"
                      src={`/story/campaign/${galleryArt[exhibit[0]]}.webp`}
                      alt={exhibit[1]}
                    />
                  )}
                  <section className="gallery-caption">
                    <h3>{exhibit[1]}</h3>
                    <button
                      type="button"
                      disabled={slide === 0}
                      onClick={() =>
                        fadeOut(
                          modal.current?.querySelector(
                            ".gallery-preview, .campaign-film",
                          ) ?? null,
                          () => {
                            setFilm("");
                            setSlide(slide - 1);
                          },
                        )
                      }
                    >
                      이전 장면
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        fadeOut(
                          modal.current?.querySelector(
                            ".gallery-preview, .campaign-film",
                          ) ?? null,
                          () => setFilm(film ? "" : exhibit[0]),
                        )
                      }
                    >
                      {film ? "삽화 보기" : "영상 보기"}
                    </button>
                    <button
                      type="button"
                      disabled={slide + 1 >= unlockedFilms.length}
                      onClick={() =>
                        fadeOut(
                          modal.current?.querySelector(
                            ".gallery-preview, .campaign-film",
                          ) ?? null,
                          () => {
                            setFilm("");
                            setSlide(slide + 1);
                          },
                        )
                      }
                    >
                      다음 장면
                    </button>
                  </section>
                </>
              ) : (
                <p>여정에서 만난 장면이 이곳에 남습니다.</p>
              ))}
            {view === "load" &&
              (!slots.length ? (
                <p>저장한 슬롯이 없습니다.</p>
              ) : (
                slots.map((slot) => (
                  <button
                    type="button"
                    key={slot.id}
                    disabled={busy}
                    onClick={() => run(() => loadSlot(slot.id))}
                  >
                    {slot.label}
                  </button>
                ))
              ))}
            {view === "save" &&
              Array.from({ length: SAVE_SLOT_COUNT }, (_, i) => i + 1).map(
                (id) => {
                  const slot = slots.find((s) => s.id === id);
                  return (
                    <button
                      type="button"
                      key={id}
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await writeSlot(id, state);
                          setSlots(await listSlots());
                          setNotice(`슬롯 ${id}에 저장했습니다.`);
                        })
                      }
                    >
                      {slot
                        ? slot.label + " · 덮어쓰기"
                        : `슬롯 ${id} · 빈 슬롯에 저장`}
                    </button>
                  );
                },
              )}
            {view === "replay" && (
              <>
                <label>
                  시작 난이도{" "}
                  <select
                    value={restartLevel}
                    onChange={(e) =>
                      setRestartLevel(
                        isDifficulty(e.target.value)
                          ? e.target.value
                          : "normal",
                      )
                    }
                  >
                    <option value="easy">쉬움</option>
                    <option value="normal">보통</option>
                    <option value="hard">어려움</option>
                  </select>
                </label>
                {state.campaign?.beat !== "finished" &&
                  (state.chapter ?? 1) > unlocked && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => beginReplay(state.chapter ?? 1)}
                    >
                      현재 {state.chapter ?? 1}단계 처음부터 시작
                    </button>
                  )}
              </>
            )}
            {view === "replay" &&
              CHAPTERS.slice(0, unlocked).map((name, i) => (
                <button
                  type="button"
                  key={name}
                  disabled={busy}
                  onClick={() => beginReplay(i + 1)}
                >
                  {i + 1}단계 · {name}
                </button>
              ))}
            {view === "replay" &&
              !unlocked &&
              state.campaign?.beat === "finished" && (
                <p>완료한 미션이 없습니다.</p>
              )}
            {
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (view === "films") {
                    fadeOut(
                      modal.current?.querySelector(
                        ".gallery-preview, .campaign-film",
                      ) ?? null,
                      () => {
                        setFilm("");
                        setView(initialView);
                      },
                    );
                    return;
                  }
                  setFilm("");
                  if (initialView === "save") resume();
                  else setView(initialView);
                  setNotice("");
                }}
              >
                뒤로
              </button>
            }
          </footer>
        </>
      )}
      <p role="status">{notice}</p>
    </dialog>
  );
}
