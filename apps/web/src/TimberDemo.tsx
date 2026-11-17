import {
  type LaborState,
  TIMBER_RULES,
  type TimberCommand,
  type TimberOffer,
  type TimberState,
} from "@dynosty/game-core";
import { useEffect, useRef, useState } from "react";
import { Res } from "./GameHud.js";
import { LaborDemo } from "./LaborDemo.js";
import type { TimberRequest, TimberResponse } from "./timber-protocol.js";
import { loadTimber, saveTimber, timberSaveError } from "./timber-save.js";

const time = (m: number) => `${Math.floor(m / 60)}시간 ${m % 60}분`;
const phaseNames = {
  select: "공급 제안 비교",
  contracted: "약정·예약",
  transport: "수레 운송",
  arrived: "도착·검사 대기",
  inspecting: "전량 검사·검수",
  inspected: "정상분 수령",
  received: "불량분 보완",
  repairing: "건조·재검사",
  ready: "둥지 배분·사용 확인",
  completed: "사용 결과",
};
type Props = {
  active: boolean;
  onState: (state: TimberState) => void;
  onExit: () => void;
  onLaborState: (state: LaborState) => void;
  onLaborModeChange: (mode: boolean) => void;
};
export function TimberDemo({
  active,
  onState,
  onExit,
  onLaborState,
  onLaborModeChange,
}: Props) {
  const [laborMode, setLaborMode] = useState(false);
  useEffect(() => {
    onLaborModeChange(laborMode);
  }, [laborMode, onLaborModeChange]);
  const [state, setState] = useState<TimberState | null>(null),
    [error, setError] = useState<string | null>(null),
    [saveStatus, setSaveStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [restart, setRestart] = useState(false);
  const worker = useRef<Worker | null>(null),
    pending = useRef<number | null>(null),
    counter = useRef(0),
    session = useRef("");
  useEffect(() => {
    session.current = crypto.randomUUID();
    const w = new Worker(new URL("./timber.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = (e: MessageEvent<TimberResponse>) => {
      const m = e.data;
      if (m.type === "state") {
        setState(m.state);
        onState(m.state);
      } else if (m.type === "error") {
        setError(m.message);
        if (m.requestId === pending.current) {
          pending.current = null;
          setBusy(false);
        }
      } else if (m.requestId === pending.current) {
        try {
          if (m.type === "saved") {
            saveTimber(localStorage, m.save);
            setSaveStatus("체험판을 저장했습니다.");
          } else setSaveStatus("체험판을 불러왔습니다. 일시정지 상태입니다.");
        } catch (err) {
          setError(timberSaveError(err));
        } finally {
          pending.current = null;
          setBusy(false);
        }
      }
    };
    w.onerror = () => {
      setError(
        "체험판 계산 연결을 확인하지 못했습니다. 기존 저장은 유지됩니다.",
      );
      pending.current = null;
      setBusy(false);
    };
    return () => {
      w.terminate();
      worker.current = null;
      pending.current = null;
    };
  }, [onState]);
  function command(c: TimberCommand) {
    if (busy || !worker.current) return;
    setError(null);
    worker.current.postMessage({
      type: "command",
      id: `${session.current}-${++counter.current}`,
      command: c,
    } satisfies TimberRequest);
  }
  useEffect(() => {
    const pause = () => {
      if (document.hidden || !active || laborMode)
        worker.current?.postMessage({
          type: "command",
          id: `${session.current}-${++counter.current}`,
          command: { type: "pause", paused: true },
        } satisfies TimberRequest);
    };
    pause();
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, [active, laborMode]);
  function access(load: boolean, previous = false) {
    if (busy || !worker.current) return;
    setError(null);
    setSaveStatus("");
    try {
      const requestId = ++counter.current;
      const m: TimberRequest = load
        ? { type: "load", requestId, data: loadTimber(localStorage, previous) }
        : { type: "save", requestId };
      pending.current = requestId;
      setBusy(true);
      worker.current.postMessage(m);
    } catch (e) {
      pending.current = null;
      setBusy(false);
      setError(timberSaveError(e));
    }
  }
  const stock = state?.stock,
    selected = state?.offer ? TIMBER_RULES.offers[state.offer] : null;
  const classic = (
    <section
      hidden={!active || laborMode}
      className="timber-demo"
      aria-label="마른 목재20 체험판"
    >
      <div className="timber-heading">
        <div>
          <p className="eyebrow">조달 체험판 · 오늘 안에 둥지를 고치자</p>
          <h2 className="timber-title">마른 목재20, 필요한 곳까지</h2>
        </div>
        <button
          type="button"
          className="g-knob g-knob--close"
          aria-label="생존 예제로 돌아가기"
          title="닫기 (Esc)"
          onClick={() => {
            command({ type: "pause", paused: true });
            onExit();
          }}
        />
      </div>
      <button type="button" disabled={busy} onClick={() => setLaborMode(true)}>
        일손 배치·배급 체험하기
      </button>
      <p className="hint">
        비가 새는 둥지에 마른 목재20이 필요합니다. 사용 준비 기한은12시간입니다.
      </p>
      {!state ? (
        <p>체험판을 준비하고 있습니다.</p>
      ) : (
        <>
          <div className="timber-status">
            <span data-testid="timber-clock">
              경과 {time(state.elapsed)} / 기한12시간
            </span>
            <span data-testid="timber-iron">
              철재 보유{state.iron} · 예약{state.reservedIron} · 가용
              {state.iron - state.reservedIron}
            </span>
            <span data-testid="timber-workers">
              일손 가용{4 - state.workers}/4
            </span>
            <strong data-testid="timber-phase">
              {phaseNames[state.phase]}
            </strong>
          </div>
          {state.phase !== "select" ? (
            <div className="timber-controls">
              <button
                type="button"
                disabled={busy || state.phase === "completed"}
                onClick={() =>
                  command({ type: "pause", paused: !state.paused })
                }
              >
                <span className="toggle-label">{state.paused ? "체험 시간 시작" : "체험 일시정지"}</span>
              </button>
              <button
                type="button"
                disabled={busy || state.phase === "completed"}
                onClick={() => command({ type: "advance", minutes: 60 })}
              >
                1시간 진행
              </button>
              <button
                type="button"
                disabled={busy || state.due === null}
                onClick={() => command({ type: "next" })}
              >
                다음 작업 완료까지
              </button>
              <label>
                진행 속도{" "}
                <select
                  aria-label="체험 진행 속도"
                  value={state.speed}
                  disabled={busy}
                  onChange={(e) =>
                    command({
                      type: "speed",
                      speed: Number(e.target.value) as 1 | 3,
                    })
                  }
                >
                  <option value="1">1배</option>
                  <option value="3">3배</option>
                </select>
              </label>
              <span className="hint">
                {state.paused ? "일시정지" : "진행 중"} · 결정 지점과 탭 비활성
                시 정지
              </span>
            </div>
          ) : null}
          {state.elapsed > 720 && state.phase !== "completed" ? (
            <p className="timber-delay" role="alert">
              기한을 넘겼습니다. 주민은 임시 쉼터에서 기다립니다. 보완·배분을
              계속해 마칠 수 있습니다.
            </p>
          ) : null}
          {!["select", "contracted"].includes(state.phase) ? (
            <section className="timber-stock" aria-label="목재 처리 상태">
              {(
                [
                  ["waiting", "검사 대기"],
                  ["checked", "합격·수령 전"],
                  ["quarantine", "불량 격리"],
                  ["available", "사용 가능"],
                  ["allocated", "둥지 배분"],
                  ["used", "사용 확인"],
                ] as const
              ).map(([k, label]) => (
                <div key={k}>
                  <span className="timber-stock-label">{label}</span>
                  <strong
                    className="timber-stock-value"
                    data-testid={`timber-${k}`}
                  >
                    {stock?.[k]}
                  </strong>
                </div>
              ))}
            </section>
          ) : null}
          {state.phase === "select" ? (
            <>
              <p>
                목표: 마른 목재20을 둥지에 배분하고 사용 준비를 확인하세요.
                가격뿐 아니라 보완에 쓸 일손도 비교하세요.
              </p>
              <div className="timber-offers">
                {(["A", "B"] as TimberOffer[]).map((id) => {
                  const o = TIMBER_RULES.offers[id];
                  return (
                    <article
                      className={
                        state.offer === id
                          ? "timber-offer selected"
                          : "timber-offer"
                      }
                      key={id}
                    >
                      <h3>
                        제안 {id} ·{" "}
                        {id === "A" ? "저렴한 자재" : "규격 적합 자재"}
                      </h3>
                      {/* 거래: 내는 것 ⇄ 받는 것 · 도착까지 */}
                      <p className="offer-trade">
                        <Res id="RES_METAL" n={o.cost} label={`철재 ${o.cost}`} />
                        <span aria-hidden="true">⇄</span>
                        <Res id="RES_WOOD" n={20} label="목재 20" />
                        <span className="offer-time">{o.travel / 60}시간</span>
                      </p>
                      <p className={`offer-tag${id === "A" ? " is-warn" : " is-ok"}`}>
                        {id === "A" ? "포장 훼손 · 젖은 목재 4" : "규격 적합"}
                      </p>
                      <dl className="offer-facts">
                        <dt>검사</dt>
                        <dd>{id === "A" ? "2시간 + 재검사 4시간 (2명)" : "2시간"}</dd>
                        <dt>남는 철</dt>
                        <dd>
                          <Res id="RES_METAL" n={8 - o.cost} label={`철재 ${8 - o.cost}`} />
                        </dd>
                      </dl>
                      <button
                        type="button"
                        aria-pressed={state.offer === id}
                        disabled={busy}
                        onClick={() => command({ type: "choose", offer: id })}
                      >
                        제안 {id} 선택
                      </button>
                    </article>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={busy || !state.offer}
                onClick={() => command({ type: "contract" })}
              >
                선택한 제안 약정하기
              </button>
            </>
          ) : null}
          <div className="timber-actions">
            {state.phase === "contracted" ? (
              <>
                <p>
                  철재{selected?.cost}와 운송·검사 일손1명을 예약했습니다.
                  출발하면 비용을 지불합니다.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => command({ type: "depart" })}
                >
                  수레 출발시키기
                </button>
                <button
                  type="button"
                  className="quiet-button"
                  disabled={busy}
                  onClick={() => command({ type: "cancel" })}
                >
                  출발 전 약정 취소
                </button>
              </>
            ) : null}
            {state.phase === "transport" ? (
              <p>
                목재20 운송 중 · 도착 예정 {time(state.due ?? 0)}. 수레가
                도착해도 검사 전에는 쓸 수 없습니다.
              </p>
            ) : null}
            {state.phase === "arrived" ? (
              <>
                <p>
                  목재20 도착. 약정한 규격·품질을 검사하고 수량·손상·수령을
                  확인합니다.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => command({ type: "inspect" })}
                >
                  전량 검사·검수 시작
                </button>
              </>
            ) : null}
            {state.phase === "inspecting" ? (
              <p>
                일손1명이 검사·검수 중 · 완료 예정 {time(state.due ?? 0)}. 대기
                물량은 아직 사용할 수 없습니다.
              </p>
            ) : null}
            {state.phase === "inspected" ? (
              <>
                <p>
                  정상{stock?.checked} · 불량 격리{stock?.quarantine}.
                  정상분부터 수령할 수 있습니다.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => command({ type: "receive" })}
                >
                  정상분 {stock?.checked} 받기
                </button>
              </>
            ) : null}
            {state.phase === "received" ? (
              <>
                <p>
                  젖은4는 사용할 수 없습니다. 일손2명으로 건조·재검사를
                  진행하세요.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => command({ type: "repair" })}
                >
                  젖은4 건조·재검사 시작
                </button>
              </>
            ) : null}
            {state.phase === "repairing" ? (
              <p>
                일손2명이 보완 중 · 완료 예정 {time(state.due ?? 0)}. 정상16은
                먼저 배분할 수 있습니다.
              </p>
            ) : null}
            {["received", "repairing", "ready"].includes(state.phase) ? (
              <button
                type="button"
                disabled={busy || !stock?.available}
                onClick={() => command({ type: "allocate" })}
              >
                사용 가능한 목재 {stock?.available} 둥지에 배분
              </button>
            ) : null}
            {state.phase === "ready" ? (
              <>
                <p>
                  둥지에 마른 목재20이 배분돼야 사용 준비를 확인할 수 있습니다.
                </p>
                <button
                  type="button"
                  disabled={busy || stock?.allocated !== 20}
                  onClick={() => command({ type: "use" })}
                >
                  지붕 보수·사용 확인
                </button>
              </>
            ) : null}
            {state.phase === "completed" ? (
              <div className="timber-result" data-testid="timber-result">
                <h3>
                  {state.elapsed <= 720
                    ? "약속한 목재가 제때 쓰였습니다"
                    : "늦었지만 둥지 보수 준비를 마쳤습니다"}
                </h3>
                <p>
                  제안{state.offer} · 정상 목재20 사용 확인 ·{" "}
                  {time(state.elapsed)} ·{" "}
                  {state.elapsed <= 720
                    ? "기한 충족"
                    : `${time(state.elapsed - 720)} 지연`}{" "}
                  · 철재{state.iron} 남음
                </p>
                <p>
                  {state.offer === "A"
                    ? "추가 철재를 아끼고 일손2명을4시간 보완에 배정했습니다."
                    : "철재를 더 쓰고 불량 보완에 쓸 일손을 아꼈습니다."}{" "}
                  창고 수령에서 끝내지 않고 주민이 쓸 곳까지 확인했습니다.
                </p>
                <p>
                  공공조달의 수요·품질·납기·이행을 바탕으로 만든 창작
                  체험입니다. 본편5단계 완성 구간은 아닙니다.
                </p>
              </div>
            ) : null}
          </div>
          <div className="timber-controls">
            <button type="button" disabled={busy} onClick={() => access(false)}>
              체험 저장
            </button>
            <button type="button" disabled={busy} onClick={() => access(true)}>
              체험 불러오기
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => access(true, true)}
            >
              이전 체험 불러오기
            </button>
            <button
              type="button"
              className="quiet-button"
              disabled={busy}
              onClick={() => setRestart(true)}
            >
              처음부터 다른 선택
            </button>
          </div>
          {restart ? (
            <div className="new-game-confirm">
              <p>현재 체험만 처음부터 다시 할까요? 기존 저장은 유지됩니다.</p>
              <button
                type="button"
                onClick={() => {
                  command({ type: "restart" });
                  setRestart(false);
                }}
              >
                새 체험 확인
              </button>
              <button type="button" onClick={() => setRestart(false)}>
                계속하기
              </button>
            </div>
          ) : null}
          <p aria-live="polite" data-testid="timber-save-status">
            {busy ? "저장 처리 중" : saveStatus}
          </p>
          <details>
            <summary>체험 규칙·미정 수치 구분</summary>
            <p>
              기존 정찰대 사건 이전 구간, 주민60명(성인45·아동15) 중 가용
              일손4명입니다. 생존 예제의 재고·시간은 별도로 보존합니다.
            </p>
            <p>
              문서 예시: 목재20·기한12시간·철재8·일손4·A/B 비용과 운송·검사·보완
              시간.
            </p>
            <p>
              체험 전용 개발 선택: 사용 가능 목재0 시작, 운송·검사 일손1,
              현실1초=게임1분과3배속, 목적지 추가 운송·공사는0시간으로
              단순화하고 사용 확인 때 결과를 표시합니다.
            </p>
            <p>
              본편 미정: 종별/연령별 영양량·초기 재고·시간 배율·기아 피해·표본
              검사·시설별 난방. 이번 체험에서 확정하지 않습니다.
            </p>
          </details>
          <details>
            <summary>조달 처리 기록</summary>
            <ol>
              {state.history.map((h) => (
                <li key={h.id}>
                  {time(h.minute)} · {h.text}
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
  return (
    <>
      <LaborDemo
        active={active && laborMode}
        onState={onLaborState}
        onExit={onExit}
        onClassic={() => setLaborMode(false)}
      />
      {classic}
    </>
  );
}
