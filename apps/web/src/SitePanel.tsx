import {
  type LaborCommand,
  type LaborState,
  laborFinished,
  laborNextAt,
} from "@dynosty/game-core";
import { useEffect, useMemo, useRef } from "react";
import {
  type SiteAction,
  type SiteId,
  siteAvailable,
  siteTime,
  siteView,
} from "./site-targets.js";
export function SitePanel({
  state,
  selected,
  busy,
  error,
  onCommand,
  onClear,
}: {
  state: LaborState;
  selected: SiteId;
  busy: boolean;
  error: string | null;
  onCommand: (c: LaborCommand) => void;
  onClear: () => void;
}) {
  const ref = useRef<HTMLElement>(null),
    view = useMemo(() => siteView(state, selected), [state, selected]);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest" });
  }, []);
  if (!siteAvailable(state, selected)) return null;
  const action = (a: SiteAction, showReason = true) => (
    <div className="site-action" key={a.key}>
      <button
        type="button"
        title={a.reason || undefined}
        disabled={busy || a.disabled}
        onClick={() => onCommand(a.command)}
      >
        {a.label}
      </button>
      {a.disabled && showReason ? <p className="hint">{a.reason}</p> : null}
    </div>
  );
  return (
    <section
      ref={ref}
      className="site-panel"
      aria-label={`${view.name} 현장 정보`}
    >
      <div className="site-heading">
        <h3 data-testid="site-name">{view.name}</h3>
        <button type="button" className="quiet-button" onClick={onClear}>
          현장 선택 해제
        </button>
      </div>
      <p data-testid="site-status" aria-live="polite">
        {view.status}
      </p>
      <dl>
        {view.fields.map((f) => (
          <div key={f.label}>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
      <p className="hint">{view.hint}</p>
      <div className="site-actions">{view.actions.map((a) => action(a))}</div>
      {view.crew.length ? (
        <fieldset className="site-crew">
          <legend>이 장소에 일손 배치</legend>
          {view.crew.map((c) => (
            <div key={c.id}>
              <strong>
                {c.id.replace("crew-", "일손 ")} · {c.current}
              </strong>
              {action(c.send, false)}
              {c.release ? action(c.release, false) : null}
            </div>
          ))}
        </fieldset>
      ) : null}
      <div className="site-controls">
        <span data-testid="site-clock">
          공유 시간 {siteTime(state.elapsed)}
        </span>
        <button
          type="button"
          disabled={busy || laborFinished(state) || laborNextAt(state) === null}
          onClick={() => onCommand({ type: "next" })}
        >
          현장 다음 사건까지
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <p className="hint">
        기존 체험 개발값을 사용합니다. 본편의 영양·기아·반품 책임·위약금·공급처
        신뢰도·불량률은 미정입니다.
      </p>
    </section>
  );
}
