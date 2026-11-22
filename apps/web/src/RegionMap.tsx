import {
  SCOUT_SITES,
  SETTLEMENTS,
  scoutRun,
  type TimberState,
} from "@dynosty/game-core";
import { useEffect, useRef } from "react";

const towns = [
  [63, 32],
  [17, 70],
  [83, 51],
  [50, 73],
  [75, 20],
];
const bokhol = { x: 33, y: 30 };
export function RegionMap({
  state,
  close,
}: {
  state: TimberState;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const entering = useRef(0);
  useEffect(() => {
    dialog.current?.showModal();
    entering.current = performance.now();
  }, []);
  const now = (state.world.day - 1) * 1440 + state.world.minute;
  return (
    <dialog
      ref={dialog}
      className="region-map"
      aria-label="복홀 주변 지도"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onWheel={(e) => {
        if (e.deltaY < 0 && performance.now() - entering.current > 300) close();
      }}
    >
      <header>
        <h2>복홀 주변 지도</h2>
        <button type="button" onClick={close}>
          복홀로 돌아가기
        </button>
      </header>
      <div className="region-sheet">
        <img
          src="/ui/sites/bokhol-region.webp"
          alt="산줄기와 나루, 고개 사이로 마을을 그린 수묵 지도"
        />
        <button
          className="region-place"
          type="button"
          style={{ left: bokhol.x + "%", top: bokhol.y + "%" }}
          onClick={close}
        >
          복홀
        </button>
        {SETTLEMENTS.map(
          (v, i) =>
            (state.campaign?.treaties.includes(i) ||
              state.scoutClues?.some((k) => k === "contact" + i)) && (
              <span
                className="region-place"
                key={v.name}
                style={{ left: towns[i]![0] + "%", top: towns[i]![1] + "%" }}
              >
                {v.name} ·{" "}
                {state.campaign?.treaties.includes(i)
                  ? "교역 중"
                  : "교역로 약도"}
              </span>
            ),
        )}
        {state.scoutClues?.includes("record") && (
          <p className="map-clue">정찰 기록 · 고려의 창고 인장이 찍힌 목간</p>
        )}
        {SCOUT_SITES.map((site) => {
          const run = scoutRun(state, site);
          if (!run || now >= run.due) return null;
          const encounter = state.scoutFinds?.[site.id];
          const half = Math.ceil(run.minutes / 2);
          const waiting =
            encounter?.decision === "waiting" && now >= encounter.due;
          const coming = encounter
            ? encounter.decision !== "waiting"
            : now >= run.start + half;
          const progress = Math.min(
            1,
            Math.max(
              0,
              coming ? (run.due - now) / half : (now - run.start) / half,
            ),
          );
          return (
            <span
              key={site.id}
              className="region-scout"
              style={{
                left: bokhol.x + site.x * 0.53 * progress + "%",
                top: bokhol.y - site.z * 0.42 * progress + "%",
              }}
            >
              {site.name} 정찰대 ·{" "}
              {waiting ? "발견 지점 대기" : coming ? "복귀 중" : "이동 중"}
            </span>
          );
        })}
      </div>
    </dialog>
  );
}
