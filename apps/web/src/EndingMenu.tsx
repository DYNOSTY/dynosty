import { CHAPTERS, type TimberState } from "@dynosty/game-core";
import { useEffect, useRef, useState } from "react";
import { listSlots, loadSlot, replayStage, writeSlot } from "./stage-replay.js";

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
  const [view, setView] = useState<"menu" | "save" | "load" | "replay">(
    initialView,
  );
  const [slots, setSlots] = useState<Awaited<ReturnType<typeof listSlots>>>([]);
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
      className="campaign-dialog"
      aria-label="메인 메뉴"
      onCancel={resume}
    >
      <header>
        <h2>
          {
            {
              menu: "메인 메뉴",
              save: "저장하기",
              load: "이어 하기",
              replay: "다시 하기",
            }[view]
          }
        </h2>
      </header>
      <footer>
        {view === "menu" && (
          <>
            <button onClick={restart}>새로 시작</button>
            <button onClick={() => setView("load")}>이어 하기</button>
            <button onClick={() => setView("replay")}>다시 하기</button>
            {state.campaign?.beat !== "finished" && (
              <button onClick={() => setView("save")}>저장하기</button>
            )}
            <button onClick={resume}>마을 보기</button>
          </>
        )}
        {view === "load" &&
          (!slots.length ? (
            <p>저장한 슬롯이 없습니다.</p>
          ) : (
            slots.map((slot) => (
              <button
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
        {view === "replay" &&
          CHAPTERS.slice(0, unlocked).map((name, i) => (
            <button
              key={name}
              disabled={busy}
              onClick={() => run(() => replayStage(i + 1))}
            >
              {i + 1}단계 · {name}
            </button>
          ))}
        {view === "replay" && !unlocked && <p>완료한 미션이 없습니다.</p>}
        {view !== "menu" && (
          <button
            disabled={busy}
            onClick={() => {
              setView("menu");
              setNotice("");
            }}
          >
            뒤로
          </button>
        )}
      </footer>
      <p role="status">{notice}</p>
    </dialog>
  );
}
