// 공통 의뢰 틀 (사용자 11/19 "공통의뢰틀 좋다. 상단 이미지만 각 항에 맞게") — 기획서 분류 ①번:
// 목표 한 줄 · 진행 · 남은 시간 · 실패하면 · 단추. 모든 의뢰가 같은 자리에 같은 칸.
// 정책·사건 선택(StoryChoice)과 중요 분기(인물 화면)는 따로 간다.
import type { ReactNode } from "react";

export type Quest = {
  id: string;
  kind: string;
  art: string;
  title: string;
  why: string;
  progress?:
    | {
        icon: string;
        now: number;
        goal: number;
        /** 정찰 길 (레퍼런스: 배너 사가 행렬 표식 · 프로스트펑크 예상 이동 시간) —
            마을에서 거점까지 길 위에 정찰대 표식이 간 만큼 나아감. 없으면 막대 하나 */
        route?: Array<{
          key: string;
          name: string;
          hours: number;
          state: "unknown" | "going" | "found";
          /** 가는 중: 0~1 간 만큼 */
          done: number;
          /** 가는 중: 남은 시간 */
          left: number;
        }>;
      }
    | undefined;
  meta: Array<[string, ReactNode]>;
  action?:
    | { label: string; onClick: () => void; disabled?: boolean }
    | undefined;
};

export function QuestCard({ q, onClose }: { q: Quest; onClose: () => void }) {
  const pct = q.progress
    ? Math.min(100, Math.round((q.progress.now / q.progress.goal) * 100))
    : 0;
  return (
    <article className="qc" aria-label={`의뢰 · ${q.title}`}>
      <div className="qc__art" style={{ backgroundImage: `url(${q.art})` }}>
        <span>{q.kind}</span>
      </div>
      <div className="qc__body">
        <h3>{q.title}</h3>
        <p className="qc__why">{q.why}</p>
        {q.progress ? (
          <div className="qc__row">
            <img src={q.progress.icon} alt="" />
            {q.progress.route ? (
              <span className="qc__label">찾은 거점</span>
            ) : (
              <span className="qc__bar" aria-hidden="true">
                <i style={{ width: `${pct}%` }} />
              </span>
            )}
            <b>
              {/* 정찰은 몇 곳을 찾아야 하는지 알려 주지 않음 (찾은 수만) */}
              {q.progress.route
                ? q.progress.now
                : `${q.progress.now} / ${q.progress.goal}`}
            </b>
          </div>
        ) : null}
        {q.progress?.route ? <Route stops={q.progress.route} /> : null}
        {q.meta.length ? (
          <dl className="qc__meta">
            {q.meta.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <div className="qc__btns">
          {q.action ? (
            <button
              type="button"
              className="qc__go"
              disabled={q.action.disabled}
              onClick={q.action.onClick}
            >
              {q.action.label}
            </button>
          ) : null}
          <button type="button" className="qc__close" onClick={onClose}>
            접기
          </button>
        </div>
      </div>
    </article>
  );
}

// 정찰 길 (레퍼런스: 배너 사가 — 길 위를 나아가는 행렬 표식 / 프로스트펑크 — 거점마다 예상 이동 시간).
// 거점마다 한 줄: 표식 · 이름 · 마을→거점 길(정찰대 표식이 간 만큼 나아감) · 남은 시간 또는 왕복 시간.
// 가까운 순. 여러 곳을 같이 보내도 줄이 달라 겹치지 않음.
type Stop = NonNullable<NonNullable<Quest["progress"]>["route"]>[number];
function Route({ stops }: { stops: Stop[] }) {
  const sorted = [...stops].sort((a, b) => a.hours - b.hours);
  return (
    <ul className="qc__route" aria-label="정찰 길">
      {sorted.map((s) => (
        <li key={s.key} className={`is-${s.state}`}>
          <img src={`/ui/kit/pin_${s.state}.webp`} alt="" />
          <span className="qc__name">
            {s.state === "unknown" ? "미탐색" : s.name}
          </span>
          <span className="qc__path" aria-hidden="true">
            <i
              style={{
                width: `${s.state === "found" ? 100 : Math.round(s.done * 100)}%`,
              }}
            />
            {s.state === "going" ? (
              <img
                className="qc__scout"
                src="/ui/cmd/residents.png"
                alt=""
                style={{ left: `${Math.round(s.done * 100)}%` }}
              />
            ) : null}
          </span>
          <small>
            {s.state === "going"
              ? `${s.left}시간 남음`
              : s.state === "found"
                ? "찾음"
                : `왕복 ${s.hours}시간`}
          </small>
        </li>
      ))}
    </ul>
  );
}
