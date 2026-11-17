import { CREW_JOB_NAMES, type LaborState } from "@dynosty/game-core";
import { useState } from "react";
import { crewActivity, nextTimberStep, transportView } from "./site-life.js";
import { siteProgress } from "./site-progress.js";
import { type SiteId, siteAvailable } from "./site-targets.js";
import { CREW_BADGES } from "./visual-badges.js";

export function SiteGuide({
  state,
  onSelect,
}: {
  state: LaborState;
  onSelect: (id: SiteId) => void;
}) {
  const [open, setOpen] = useState(true);
  const transport = transportView(state),
    step = nextTimberStep(state),
    ration = siteProgress(state)[2];
  return (
    <section className="site-guide" aria-label="첫 플레이 안내">
      <div className="site-progress-heading">
        <h3>지금 할 일</h3>
        <button
          type="button"
          className="quiet-button"
          aria-expanded={open}
          aria-controls="site-guide-details"
          onClick={() => setOpen(!open)}
        >
          {open ? "안내 접기" : "안내 펼치기"}
        </button>
      </div>
      <p data-testid="transport-status">
        {transport.label} · 운송 적재 {transport.quantity}개
      </p>
      <progress
        aria-label="현재 운송 진행"
        max={100}
        value={Math.round(transport.progress * 100)}
      />
      <p className="hint">
        표시는 기존 게임 시간 기준 ·{" "}
        {state.paused
          ? "자동 시간 일시정지, 시간 진행 버튼 사용 가능"
          : "자동 시간 진행 중"}
      </p>
      <div id="site-guide-details" hidden={!open}>
        <div className="site-guide-tasks">
          <article>
            <h4 data-testid="timber-next-step">{step.title}</h4>
            <p>{step.detail}</p>
            {step.site ? (
              <button
                type="button"
                className="quiet-button"
                disabled={!siteAvailable(state, step.site)}
                onClick={() => step.site && onSelect(step.site)}
              >
                목재 다음 작업 장소 보기
              </button>
            ) : null}
            {step.action ? (
              <a className="guide-action" href={`#${step.action}`}>
                목재 다음 조작으로 이동
              </a>
            ) : null}
            {state.timber.stock.available > 0 && step.site ? (
              <a className="guide-action" href="#labor-allocate-action">
                정상 목재 배분으로 이동
              </a>
            ) : null}
          </article>
          <article>
            <h4>함께 진행 · 배급 준비</h4>
            <p>
              {ration?.status} · {ration?.reason}
            </p>
            <button
              type="button"
              className="quiet-button"
              onClick={() => onSelect("site-ration")}
            >
              배급 준비 장소 보기
            </button>
          </article>
        </div>
        <ul className="crew-activity" aria-label="주민 담당과 동작">
          {state.crew.map((c, i) => (
            <li key={c.id}>
              <strong>
                일손 {i + 1} ·{" "}
                <span
                  className="crew-badge"
                  data-job={c.job}
                  aria-hidden="true"
                >
                  {CREW_BADGES[c.job]}
                </span>{" "}
                <span className="sr-only">{CREW_JOB_NAMES[c.job]}</span>
              </strong>
              <span>
                {crewActivity(state, i)}
                {crewActivity(state, i).endsWith("중") && state.paused
                  ? " · 자동 시간 일시정지"
                  : ""}
              </span>
            </li>
          ))}
        </ul>
        <p className="hint">
          작업 동작과 이동은 표시용입니다. 인원·진행량은 기존 작업 규칙으로
          계산하며, 새 운송·하역 시간이나 품질 수치를 추가하지 않습니다.
        </p>
      </div>
    </section>
  );
}
