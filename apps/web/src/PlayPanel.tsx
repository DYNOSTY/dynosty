import {
  AMOUNT_SCALE,
  foodWarnings,
  GAME_RULES,
  type PlayCommand,
  type PlayState,
  RESOURCE_IDS,
} from "@dynosty/game-core";
import { useState } from "react";

type Props = {
  state: PlayState | null;
  error: string | null;
  busy: boolean;
  onCommand: (command: PlayCommand) => void;
  compact?: boolean;
  day?: number | undefined;
  minute?: number | undefined;
};
export function PlayPanel({
  state,
  error,
  busy,
  onCommand,
  compact = false,
  day,
  minute,
}: Props) {
  const [confirm, setConfirm] = useState(false);
  if (!state)
    return (
      <section className="settlement-dashboard" aria-label="복홀 현황">
        <p role={error ? "alert" : undefined}>
          {error ?? "게임 기준을 불러오는 중입니다."}
        </p>
      </section>
    );
  const warnings = compact ? [] : foodWarnings(state);
  const minutes = minute ?? state.minute;
  const clock = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return (
    <section className="settlement-dashboard" aria-label="복홀 현황">
      <div className="settlement-heading">
        <div>
          <h2 className="settlement-title">복홀 현황</h2>
          <p>
            <span data-testid="play-population">
              주민 {state.citizens.filter((c) => c.alive).length}명
            </span>{" "}
            ·{" "}
            <span data-testid="play-clock">
              <span>{day ?? state.day}일차</span> · {clock}
            </span>
          </p>
        </div>
        <div className="play-controls" hidden={compact}>
          <button
            type="button"
            disabled={busy}
            onClick={() => onCommand({ type: "pause", paused: !state.paused })}
          >
            {state.paused ? "게임 시작" : "일시정지"}
          </button>
          <button
            type="button"
            className="quiet-button"
            disabled={busy}
            onClick={() => onCommand({ type: "advance-day" })}
          >
            1일 진행
          </button>
          <button
            type="button"
            className="quiet-button"
            disabled={busy}
            onClick={() => setConfirm(true)}
          >
            새 게임
          </button>
        </div>
      </div>
      {confirm ? (
        <div className="new-game-confirm">
          <p>현재 진행을 새 게임으로 바꿀까요? 기존 저장 기록은 유지됩니다.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onCommand({ type: "new-game" });
              setConfirm(false);
            }}
          >
            새 게임 시작
          </button>
          <button
            type="button"
            className="quiet-button"
            onClick={() => setConfirm(false)}
          >
            취소
          </button>
        </div>
      ) : null}
      <section className="resource-strip" aria-label="자원 재고">
        {RESOURCE_IDS.map((id) => (
          <div
            key={id}
            className="resource-card"
            title={`${GAME_RULES.resources[id].name} ${(state.resources[id] / AMOUNT_SCALE).toLocaleString("ko-KR", { maximumFractionDigits: 4 })}`}
          >
            <img
              className="resource-icon"
              src={`/ui/resources-3d/${id === "RES_IRON_ORE" ? "RES_METAL" : id === "RES_STONE" ? "RES_COAL" : id}.png`}
              alt=""
              width={32}
              height={32}
            />
            <span className="resource-label">
              {GAME_RULES.resources[id].name}
            </span>
            <strong data-testid={`resource-${id}`}>
              {(state.resources[id] / AMOUNT_SCALE).toLocaleString("ko-KR", {
                maximumFractionDigits: 4,
              })}
            </strong>
          </div>
        ))}
      </section>
      <p className="hint" data-testid="population-diets">
        {GAME_RULES.population
          .map(
            (p) =>
              `${p.name} ${state.citizens.filter((c) => c.alive && c.species === p.species).length}명(${GAME_RULES.resources[p.diet as keyof typeof GAME_RULES.resources].name})`,
          )
          .join(" · ")}
      </p>
      <p className="play-baseline-note" hidden={compact}>
        승인 개발 기준 v1 · {state.paused ? "일시정지" : "시간 진행 중"} · 1초 =
        게임 1분 · 탭을 벗어나면 일시정지
      </p>
      {warnings.length ? (
        <div className="food-warnings" role="alert" data-testid="food-warnings">
          {warnings.map((w) => (
            <p key={w.id}>
              {w.level === "empty" ? "긴급" : "부족 주의"} · {w.name}{" "}
              {w.level === "empty"
                ? "재고가 없습니다. 해당 식성 주민의 식량이 부족합니다."
                : "재고가 하루분 미만입니다."}
            </p>
          ))}
        </div>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
