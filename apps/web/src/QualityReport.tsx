import type { LaborState } from "@dynosty/game-core";
import { qualityView } from "./quality-view.js";
export function QualityReport({ state }: { state: LaborState }) {
  const v = qualityView(state);
  const rows = [
    [
      "원납품 검사",
      v.inspected
        ? `정상${v.normal}개 · 격리${v.wet}개`
        : "검사 전 · 결과 미확인",
    ],
    ["현장 보완 완료", `${v.repaired}개`],
    ["교환품 수령 완료", `${v.exchanged}개`],
    ["교환 처리 중·미수령", `${v.exchangePending}개`],
    ["현재 격리 물량", `${v.bins.quarantine}개`],
    [
      "사용 가능 / 배분 / 사용 확인",
      `${v.bins.available} / ${v.bins.allocated} / ${v.bins.used}개`,
    ],
    ["실제 철재 사용", `${v.spent}`],
    ["별도 예약 철재", `${v.reserved}`],
    ["잔여 철재 / 가용 철재", `${v.iron} / ${v.freeIron}`],
  ];
  return (
    <section className="quality-report" aria-label="조달 품질 처리 결과">
      <h3>조달·품질 처리 결과</h3>
      <dl>
        {rows.map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="hint">
        원납품 검사 결과는 최초 검사 기준입니다. 보완·교환 수령은 그 격리 물량의
        후속 처리이며 물량 합계에 다시 더하지 않습니다. 철재 예약은 실제 사용과
        별도입니다. 이 표는 현재 저장 상태에서 복원됩니다.
      </p>
    </section>
  );
}
