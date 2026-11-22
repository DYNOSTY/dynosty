import {
  countCrew,
  EXCHANGE_RULES,
  exchangeDue,
  type LaborCommand,
  type LaborState,
  laborStock,
} from "@dynosty/game-core";

const time = (m: number) => `${Math.floor(m / 60)}시간 ${m % 60}분`;
const names = {
  none: "처리 선택",
  reserved: "교환 예약",
  returning: "불량품 회수 중",
  delivering: "교환품 재납품 중",
  arrived: "재납품 도착 · 재검수 대기",
  inspecting: "교환품 재검수 중",
  checked: "재검수 합격 · 수령 대기",
  completed: "교환품 수령 완료",
};
export function ExchangePanel({
  state,
  busy,
  onCommand,
}: {
  state: LaborState;
  busy: boolean;
  onCommand: (c: LaborCommand) => void;
}) {
  const e = state.exchange,
    t = state.timber,
    stock = laborStock(state),
    due = exchangeDue(e);
  if (
    t.offer !== "A" ||
    (e.phase === "none" && !["received", "repairing"].includes(t.phase))
  )
    return null;
  const canExchange =
    state.repairProgress === 0 && countCrew(state, "repair") === 0;
  return (
    <section className="exchange-panel" aria-label="불량4 처리 선택">
      <h3>
        불량4 · <span data-testid="exchange-phase">{names[e.phase]}</span>
      </h3>
      {e.phase === "none" ? (
        <>
          <p>
            정상16은 먼저 배분할 수 있습니다. 격리된4는 현장 보완 또는 공급처
            교환으로 처리하세요.
          </p>
          <div className="exchange-options">
            <article>
              <h4>현장 보완</h4>
              <p>
                추가 철재0 · 담당2명 · 활성4시간. 재배치하면 진행을 보존합니다.
              </p>
              <button
                type="button"
                disabled={busy || t.phase !== "received"}
                onClick={() =>
                  onCommand({ type: "timber", command: { type: "repair" } })
                }
              >
                빈 일손2명 목재 보완 배정
              </button>
            </article>
            <article>
              <h4>공급처 교환</h4>
              <p>
                추가 철재{EXCHANGE_RULES.extraIron} · 담당
                {EXCHANGE_RULES.workers}명 · 왕복3시간+재검수2시간.
              </p>
              <button
                type="button"
                disabled={busy || !canExchange}
                onClick={() => onCommand({ type: "exchange-request" })}
              >
                불량4 교환 요청
              </button>
            </article>
          </div>
          {!canExchange ? (
            <p className="hint">
              보완 담당을 대기로 옮기면 교환을 선택할 수 있습니다. 이미 보완한
              진행량이 있으면 이번 물량은 보완을 이어갑니다.
            </p>
          ) : null}
        </>
      ) : null}
      {e.phase === "reserved" ? (
        <>
          <p>철재1·담당1명 예약. 불량4는 아직 격리 장소에 있습니다.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => onCommand({ type: "exchange-depart" })}
          >
            교환 회수 수레 출발
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onCommand({ type: "exchange-cancel" })}
          >
            교환 요청 취소
          </button>
        </>
      ) : null}
      {e.phase === "returning" ? (
        <p>
          불량4를 공급처로 회수합니다. 도착 {time(due ?? 0)}. 출발 후 취소·담당
          재배치는 할 수 없습니다.
        </p>
      ) : null}
      {e.phase === "delivering" ? (
        <p>
          불량4 회수 완료. 정상 교환품4가 돌아옵니다. 재납품 도착{" "}
          {time(due ?? 0)}.
        </p>
      ) : null}
      {e.phase === "arrived" ? (
        <>
          <p>교환품4가 도착했지만 검사대기 상태입니다. 사용할 수 없습니다.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => onCommand({ type: "exchange-inspect" })}
          >
            교환품4 재검수 시작
          </button>
        </>
      ) : null}
      {e.phase === "inspecting" ? (
        <>
          <p>교환 담당1명이 전량 재검수합니다. 완료 {time(due ?? 0)}.</p>
          <progress
            aria-label="교환품 재검수 진행"
            max={EXCHANGE_RULES.inspectionMinutes}
            value={state.elapsed - (e.inspectionStart ?? state.elapsed)}
          />
        </>
      ) : null}
      {e.phase === "checked" ? (
        <>
          <p>
            교환품4가 합격했습니다. 담당자는 대기로 복귀했습니다. 수령을
            확인하세요.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => onCommand({ type: "exchange-receive" })}
          >
            재검수 합격4 수령 확인
          </button>
        </>
      ) : null}
      {e.phase === "completed" ? (
        <p>
          교환품4 수령 완료 · {time(e.receivedAt ?? 0)}. 정상 목재를 배분해 지붕
          보수를 마칠 수 있습니다.
        </p>
      ) : null}
      {e.phase !== "none" ? (
        <p data-testid="exchange-stock">
          격리 {stock.quarantine} · 교환 운송 {stock.transit} · 검사대기{" "}
          {stock.waiting} · 수령전 {stock.checked}
        </p>
      ) : null}
    </section>
  );
}
