import { AMOUNT_SCALE, type PlayState, winterReport } from "@dynosty/game-core";

// 온돌을 누르면: 구들 축열(기획 v0.4 「선택한 온돌 둥지 · 구들 축열 65%」) · 하루 석탄 · 남은 날
export function OndolStatus({ state }: { state: PlayState }) {
  const r = winterReport(state.winter, state.day, state.minute, state.citizens);
  const nest = r.zones.find((z) => z.id === "nest");
  const coal = state.resources.RES_COAL / AMOUNT_SCALE;
  const wood = state.resources.RES_WOOD / AMOUNT_SCALE;
  const days = r.coalPerDay > 0 ? coal / r.coalPerDay : 0;
  const woodDays = r.coalPerDay > 0 ? wood / (r.coalPerDay * 3) : 0;
  return (
    <p className="g-sel__ondol" data-testid="ondol-status">
      <span>
        구들 축열 <b>{nest?.storage ?? 0}%</b>
        {nest?.firing ? " · 불 때는 중" : " · 쉬는 중"}
      </span>
      <span>
        화력 <b>{nest?.heat}</b> · 하루 석탄 <b>{r.coalPerDay.toFixed(1)}</b>
      </span>
      <span>
        {coal > 0
          ? `석탄 ${days.toFixed(1)}일치 남음`
          : `석탄 없음 · 목재로 ${woodDays.toFixed(1)}일`}
      </span>
    </p>
  );
}
