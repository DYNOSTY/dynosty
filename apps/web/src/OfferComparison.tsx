import {
  EXCHANGE_RULES,
  type LaborState,
  LEGACY_TIMBER_RULES as TIMBER_RULES,
  type TimberOffer,
} from "@dynosty/game-core";
import { qualityView } from "./quality-view.js";
export function OfferComparison({
  state,
  busy,
  onChoose,
}: {
  state: LaborState;
  busy: boolean;
  onChoose: (offer: TimberOffer) => void;
}) {
  const v = qualityView(state);
  return (
    <section
      id="labor-offer-actions"
      tabIndex={-1}
      className="quality-offers"
      aria-label="공급 제안 비교"
    >
      <h4>공급 제안 비교</h4>
      <section className="quality-table-scroll" aria-label="공급 조건 비교표">
        <table>
          <caption>기존 체험용 고정 조건 · 운송 시간은 출발 기준</caption>
          <thead>
            <tr>
              <th scope="col">조건</th>
              <th scope="col">
                공급 A{state.timber.offer === "A" ? " · 선택됨" : ""}
              </th>
              <th scope="col">
                공급 B{state.timber.offer === "B" ? " · 선택됨" : ""}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">철재 비용</th>
              {(["A", "B"] as const).map((o) => (
                <td key={o}>{TIMBER_RULES.offers[o].cost}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">운송 / 검사</th>
              {(["A", "B"] as const).map((o) => (
                <td key={o}>
                  {TIMBER_RULES.offers[o].travel / 60}시간 /{" "}
                  {TIMBER_RULES.inspectionMinutes / 60}시간
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">체험의 고정 품질 조건</th>
              {(["A", "B"] as const).map((o) => (
                <td key={o}>
                  정상{TIMBER_RULES.requested - TIMBER_RULES.offers[o].wet} ·
                  젖은{TIMBER_RULES.offers[o].wet}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">선택 시 고려할 점</th>
              <td>
                초기 비용 절약 · 보완{TIMBER_RULES.repairWorkers}명·
                {TIMBER_RULES.repairMinutes / 60}시간 또는 교환
              </td>
              <td>초기 비용 증가 · 보완 불필요</td>
            </tr>
            <tr>
              <th scope="row">제안 선택</th>
              {(["A", "B"] as const).map((o) => (
                <td key={o}>
                  <button
                    type="button"
                    aria-pressed={state.timber.offer === o}
                    disabled={busy || state.timber.phase !== "select"}
                    onClick={() => onChoose(o)}
                  >
                    확장 제안 {o} 선택
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </section>
      <p data-testid="offer-observed">
        {state.timber.offer
          ? `선택: 공급 ${state.timber.offer} · ${v.inspected ? `원납품 검사 확인: 정상${v.normal}·격리${v.wet}` : "원납품 품질은 검사 후 확인됩니다."}`
          : "제안을 선택한 뒤 약정해 주세요."}
      </p>
      <p className="hint">
        A의 공급처 교환은 추가 철재{EXCHANGE_RULES.extraIron}이 필요합니다. 위
        조건은 본편 품질 보증·무작위 불량률을 확정하지 않습니다.
      </p>
    </section>
  );
}
