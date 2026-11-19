import type { LaborState } from "@dynosty/game-core";
import { qualityView, STOCK_KINDS, STOCK_LABELS } from "./quality-view.js";
import { ZONES } from "./site-zones.js";
export function QualityFlow({ state }: { state: LaborState }) {
  const v = qualityView(state);
  return (
    <section className="quality-flow" aria-label="품질별 물량 흐름">
      <h3>목재는 지금 어디에 있나요?</h3>
      <ul className="zone-legend" aria-label="현장 구역 안내">
        {ZONES.map((z) => (
          <li key={z.id}>
            {z.label} · {z.name}
          </li>
        ))}
      </ul>
      <div className="quality-bins">
        {STOCK_KINDS.map((k) => (
          <div
            key={`${k}-${v.bins[k]}`}
            className={`quality-bin bin-${k}${v.bins[k] > 0 ? " stocked" : ""}`}
            data-testid={`flow-${k}`}
          >
            <span>{STOCK_LABELS[k]}</span>
            <strong>{v.bins[k]}개</strong>
          </div>
        ))}
      </div>
      <p data-testid="flow-total">
        출발한 물량 합계 {v.total}/20개 · 운송·검사 대기·격리품은 바로 사용할 수
        없습니다.
      </p>
      <p className="hint">
        바닥과 받침의 회색은 검사 대기, 황금색은 정상 목재(검수대 위에서는 수령
        전), 파란색은 격리, 주황색은 배분입니다. 사용 확인된 목재는 더미에서
        사라지고 지붕에 반영됩니다. 이동 표시는 기존 재고의 위치 변경이며 게임
        시간을 추가하지 않습니다.
      </p>
    </section>
  );
}
