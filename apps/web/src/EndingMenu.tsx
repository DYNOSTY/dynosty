import { CHAPTERS, type TimberState } from "@dynosty/game-core";
import { useEffect, useRef, useState } from "react";
import { SettingsMenu } from "./SettingsMenu.js";
import { listSlots, loadSlot, replayStage, writeSlot } from "./stage-replay.js";
import "./main-menu.css";

const films: [string, string][] = [
  ["opening", "서막"],
  ["one", "1단계 · 복홀"],
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
];

export function EndingMenu({
  limit,
  resume,
  restart,
  state,
  initialView = "menu",
}: {
  limit: number;
  resume: () => void;
  restart: () => void;
  state: TimberState;
  initialView?: "menu" | "save";
}) {
  const modal = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<
    "menu" | "save" | "load" | "replay" | "films"
  >(initialView);
  const [slots, setSlots] = useState<Awaited<ReturnType<typeof listSlots>>>([]);
  const [film, setFilm] = useState("");
  const [restartLevel, setRestartLevel] = useState<"normal" | "hard">(
    state.campaign?.difficulty ?? "normal",
  );
  const [notice, setNotice] = useState("");
  const [unlocked, setUnlocked] = useState(limit);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    modal.current?.showModal();
    try {
      const key = "dynosty.completedChapter",
        old = Number(localStorage.getItem(key));
      const n =
        Number.isInteger(old) && old <= CHAPTERS.length
          ? Math.max(old, limit)
          : limit;
      localStorage.setItem(key, String(n));
      setUnlocked(n);
    } catch {
      setNotice("단계 완료 기록을 저장하지 못했습니다.");
    }
  }, [limit]);
  useEffect(() => {
    if (view === "save" || view === "load")
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
  return (
    <dialog
      ref={modal}
      className={view === "menu" ? "bokhol-title" : "campaign-dialog"}
      data-survived={unlocked === CHAPTERS.length}
      aria-label="메인 메뉴"
      onCancel={resume}
    >
      {view === "menu" ? (
        <>
          <h1>
            Dynosty<span>재의 왕조</span>
          </h1>
          <nav aria-label="메인 메뉴">
            <button type="button" onClick={() => setView("load")}>
              이어하기
            </button>
            <button type="button" onClick={() => setView("replay")}>
              다시하기
            </button>
            <button type="button" onClick={() => setView("films")}>
              돌아보기
            </button>
            <SettingsMenu className="bokhol-settings" />
          </nav>
          <button type="button" className="bokhol-return" onClick={resume}>
            마을 보기
          </button>
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
            {view === "load" && (
              <>
                <button type="button" onClick={restart}>
                  새로 시작
                </button>
                {state.campaign?.beat !== "finished" && (
                  <button type="button" onClick={() => setView("save")}>
                    저장하기
                  </button>
                )}
              </>
            )}
            {view === "films" &&
              (film ? (
                <>
                  <video
                    muted
                    key={film}
                    controls
                    autoPlay
                    playsInline
                    aria-label={films.find(([id]) => id === film)?.[1]}
                    style={{ width: "100%" }}
                    src={`/story/campaign/${film}.mp4`}
                  />
                  <button type="button" onClick={() => setFilm("")}>
                    컷씬 목록
                  </button>
                </>
              ) : (
                films.map(([id, label]) => (
                  <button type="button" key={id} onClick={() => setFilm(id)}>
                    {label}
                  </button>
                ))
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
              [1, 2, 3].map((id) => {
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
              })}
            {view === "replay" && (
              <>
                <label>
                  시작 난이도{" "}
                  <select
                    value={restartLevel}
                    onChange={(e) =>
                      setRestartLevel(
                        e.target.value === "hard" ? "hard" : "normal",
                      )
                    }
                  >
                    <option value="normal">보통</option>
                    <option value="hard">어려움</option>
                  </select>
                </label>
                {state.campaign?.beat !== "finished" &&
                  (state.chapter ?? 1) > unlocked && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(() => replayStage(state.chapter ?? 1, restartLevel))
                      }
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
                  onClick={() => run(() => replayStage(i + 1, restartLevel))}
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
                  setFilm("");
                  setView("menu");
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
