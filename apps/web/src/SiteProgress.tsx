import type { LaborState } from "@dynosty/game-core";
import { useMemo } from "react";
import { type SiteNotice, siteProgress } from "./site-progress.js";
import { SITE_NAMES, type SiteId, siteTime } from "./site-targets.js";
export function SiteProgress({
  state,
  notices,
  onDismiss,
  onSelect,
}: {
  state: LaborState;
  notices: SiteNotice[];
  onDismiss: () => void;
  onSelect: (id: SiteId) => void;
}) {
  const sites = useMemo(() => siteProgress(state), [state]);
  return (
    <section className="site-progress" aria-label="현장 작업 진행">
      <div className="site-progress-heading">
        <h3>현장 작업 진행</h3>
        <span>공유 {siteTime(state.elapsed)}</span>
      </div>
      <div className="site-progress-grid">
        {sites.map((site, i) => (
          <article key={site.id} data-testid={`progress-${site.id}`}>
            <h4>
              {i + 1} · {SITE_NAMES[site.id]}
            </h4>
            <strong>{site.status}</strong>
            {site.progress ? (
              <>
                <progress
                  aria-label={`${SITE_NAMES[site.id]} ${site.progress.label}`}
                  max={site.progress.max}
                  value={site.progress.value}
                />
                <p>
                  {site.progress.label} {site.progress.value}/
                  {site.progress.max}
                  {site.progress.unit}
                </p>
              </>
            ) : (
              <p>진행할 작업 없음</p>
            )}
            <p>담당 {site.crew}명</p>
            <p className="hint">{site.detail}</p>
            <p className="progress-reason">{site.reason}</p>
            <button
              type="button"
              className="quiet-button"
              disabled={
                site.id === "site-quarantine" &&
                state.timber.stock.quarantine === 0
              }
              onClick={() => onSelect(site.id)}
            >
              {" "}
              {SITE_NAMES[site.id]} 작업 보기
            </button>
          </article>
        ))}
      </div>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="site-notices"
      >
        {notices.length ? (
          <>
            <strong>현장 완료 알림</strong>
            <ul>
              {notices.map((n) => (
                <li key={n.id}>
                  {siteTime(n.minute)} · {n.text}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
      {notices.length ? (
        <button type="button" className="quiet-button" onClick={onDismiss}>
          완료 알림 닫기
        </button>
      ) : null}
    </section>
  );
}
