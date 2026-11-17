import {
  CREW_JOB_NAMES,
  type CrewId,
  type CrewJob,
  countCrew,
  type LaborCommand,
  type LaborState,
  laborFinished,
  laborIron,
  laborNextAt,
  laborReservedIron,
  laborStock,
  queueRemaining,
  TIMBER_RULES,
  type TimberCommand,
} from "@dynosty/game-core";
import { useEffect, useRef, useState } from "react";
import { ExchangePanel } from "./ExchangePanel.js";
import type { LaborRequest, LaborResponse } from "./labor-protocol.js";
import { laborSaveError, loadLabor, saveLabor } from "./labor-save.js";

const time = (m: number) => `${Math.floor(m / 60)}시간 ${m % 60}분`;
type Props = {
  active: boolean;
  onState: (s: LaborState) => void;
  onExit: () => void;
  onClassic: () => void;
};
function CrewRow({
  id,
  job,
  disabled,
  onMove,
}: {
  id: CrewId;
  job: CrewJob;
  disabled: boolean;
  onMove: (to: "idle" | "repair" | "prep") => void;
}) {
  const [to, setTo] = useState<"idle" | "repair" | "prep">("idle");
  const label = id.replace("crew-", "일손 ");
  return (
    <div className="crew-row">
      <strong>{label}</strong>
      <span data-testid={`${id}-job`}>{CREW_JOB_NAMES[job]}</span>
      <label className="crew-choice">
        <span className="sr-only">{label} 배치</span>
        <select
          aria-label={`${label} 배치`}
          value={to}
          disabled={disabled || job === "carrier" || job === "exchange"}
          onChange={(e) => setTo(e.target.value as typeof to)}
        >
          <option value="idle">대기</option>
          <option value="repair">목재 보완</option>
          <option value="prep">배급 준비</option>
        </select>
      </label>
      <button
        type="button"
        disabled={
          disabled || job === "carrier" || job === "exchange" || job === to
        }
        onClick={() => onMove(to)}
      >
        {label} {job === "idle" ? "배정" : "재배치"}
      </button>
    </div>
  );
}
export function LaborDemo({ active, onState, onExit, onClassic }: Props) {
  const [state, setState] = useState<LaborState | null>(null),
    [error, setError] = useState<string | null>(null),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  const worker = useRef<Worker | null>(null),
    pending = useRef<number | null>(null),
    counter = useRef(0),
    session = useRef("");
  useEffect(() => {
    session.current = crypto.randomUUID();
    const w = new Worker(new URL("./labor.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = (e: MessageEvent<LaborResponse>) => {
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
            saveLabor(localStorage, m.save);
            setStatus("일손 체험을 저장했습니다.");
          } else setStatus("일손 체험을 불러왔습니다. 일시정지 상태입니다.");
        } catch (err) {
          setError(laborSaveError(err));
        } finally {
          pending.current = null;
          setBusy(false);
        }
      }
    };
    w.onerror = () => {
      setError("일손 계산 연결을 확인하지 못했습니다. 기존 저장은 유지됩니다.");
      pending.current = null;
      setBusy(false);
    };
    return () => {
      w.terminate();
      worker.current = null;
      pending.current = null;
    };
  }, [onState]);
  useEffect(() => {
    const pause = () => {
      if (!active || document.hidden)
        worker.current?.postMessage({
          type: "command",
          id: `${session.current}-${++counter.current}`,
          command: { type: "pause", paused: true },
        } satisfies LaborRequest);
    };
    pause();
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, [active]);
  function command(c: LaborCommand) {
    if (busy || !worker.current) return;
    setError(null);
    worker.current.postMessage({
      type: "command",
      id: `${session.current}-${++counter.current}`,
      command: c,
    } satisfies LaborRequest);
  }
  const wood = (c: TimberCommand) => command({ type: "timber", command: c });
  function access(load: boolean, previous = false) {
    if (busy || !worker.current) return;
    setError(null);
    setStatus("");
    try {
      const requestId = ++counter.current,
        m: LaborRequest = load
          ? { type: "load", requestId, data: loadLabor(localStorage, previous) }
          : { type: "save", requestId };
      pending.current = requestId;
      setBusy(true);
      worker.current.postMessage(m);
    } catch (e) {
      pending.current = null;
      setBusy(false);
      setError(laborSaveError(e));
    }
  }
  if (!state)
    return (
      <section
        hidden={!active}
        className="timber-demo"
        aria-label="일손 배치·배급 체험판"
      >
        <p>공유 일손을 준비하고 있습니다.</p>
        {error ? <p role="alert">{error}</p> : null}
      </section>
    );
  const stock = laborStock(state),
    iron = laborIron(state),
    reservedIron = laborReservedIron(state);
  const t = state.timber,
    done = laborFinished(state),
    prep = countCrew(state, "prep"),
    repair = countCrew(state, "repair"),
    waiting = queueRemaining(state);
  const repairStatus =
    state.exchange.phase !== "none"
      ? state.exchange.phase === "completed"
        ? "교환으로 해소"
        : "공급처 교환 선택"
      : state.repairProgress === 240
        ? "완료"
        : t.stock.quarantine === 0
          ? "검사·수령 후 배치"
          : repair === 2
            ? "진행 중"
            : repair === 1
              ? "동료1명 필요 · 진행 보존"
              : "배정 대기 · 진행 보존";
  const prepStatus =
    state.elapsed < 480
      ? "8시간째 요청 열림"
      : state.prepProgress === 360
        ? "완료"
        : prep > 0
          ? "진행 중"
          : "일손 없어 정지";
  return (
    <section
      hidden={!active}
      className="timber-demo labor-demo"
      aria-label="일손 배치·배급 체험판"
    >
      <div className="timber-heading">
        <p className="eyebrow">조달 확장 체험 · 같은 일손으로 두 요청</p>
        <h2 className="timber-title">일손을 어디에 보낼까요?</h2>
      </div>
      <div className="timber-controls">
        <button
          type="button"
          className="quiet-button"
          onClick={() => {
            command({ type: "pause", paused: true });
            onExit();
          }}
        >
          생존 예제로 돌아가기
        </button>
        <button
          type="button"
          className="quiet-button"
          onClick={() => {
            command({ type: "pause", paused: true });
            onClassic();
          }}
        >
          기존 목재 체험 보기
        </button>
      </div>
      <div className="timber-status">
        <strong data-testid="labor-clock">
          공유 시간 {time(state.elapsed)}
        </strong>
        <span data-testid="labor-iron">
          철재 {iron} · 예약 {reservedIron} · 가용 {iron - reservedIron}
        </span>
        <span data-testid="labor-free">
          대기 일손 {countCrew(state, "idle")}/4
        </span>
      </div>
      <div className="timber-controls">
        <button
          type="button"
          disabled={busy || done}
          onClick={() => command({ type: "pause", paused: !state.paused })}
        >
          {state.paused ? "일손 시간 시작" : "일손 일시정지"}
        </button>
        <button
          type="button"
          disabled={busy || done}
          onClick={() => command({ type: "advance", minutes: 60 })}
        >
          일손 1시간 진행
        </button>
        <button
          type="button"
          disabled={busy || done || laborNextAt(state) === null}
          onClick={() => command({ type: "next" })}
        >
          다음 일손 사건까지
        </button>
        <label>
          속도{" "}
          <select
            aria-label="일손 진행 속도"
            disabled={busy}
            value={state.speed}
            onChange={(e) =>
              command({ type: "speed", speed: Number(e.target.value) as 1 | 3 })
            }
          >
            <option value="1">1배</option>
            <option value="3">3배</option>
          </select>
        </label>
        <span>{state.paused ? "일시정지" : "동시 진행 중"}</span>
      </div>
      <div className="labor-tasks">
        <section className="labor-task" aria-label="목재 보완 작업">
          <h3>목재 보완 · {repairStatus}</h3>
          <progress
            max={240}
            value={state.repairProgress}
            aria-label="목재 보완 진행"
          />
          <p data-testid="labor-repair">
            진행 {state.repairProgress}/240분 · 배정 {repair}/2명
          </p>
          <p>
            두 명이 모이면 진행합니다. 한 명을 옮기면 멈추고, 돌아오면 남은
            시간부터 이어갑니다.
          </p>
        </section>
        <section className="labor-task" aria-label="배급 준비 작업">
          <h3>배급 준비 · {prepStatus}</h3>
          <progress
            max={360}
            value={state.prepProgress}
            aria-label="배급 준비 진행"
          />
          <p data-testid="labor-prep">
            작업량 {state.prepProgress}/360 인·분 · 배정 {prep}명
          </p>
          <p data-testid="labor-queue">
            대기 {state.elapsed < 480 ? "요청 전" : `${waiting}무리`}
          </p>
          <p>
            기한10시간 ·{" "}
            {state.prepCompletedAt !== null
              ? `완료 ${time(state.prepCompletedAt)} · ${state.prepCompletedAt <= 600 ? "기한 충족" : `${state.prepCompletedAt - 600}분 지연`}`
              : state.elapsed >= 480 && prep > 0
                ? `남은 시간 약${Math.ceil((360 - state.prepProgress) / prep)}분`
                : "사람을 배치하면 대기 줄이 줄어듭니다."}
          </p>
        </section>
      </div>
      <fieldset className="crew-board">
        <legend>일손 배치 · 한 사람은 한 작업만</legend>
        {state.crew.map((c) => (
          <CrewRow
            key={c.id}
            id={c.id}
            job={c.job}
            disabled={busy || done}
            onMove={(to) => {
              if (c.job === "idle" && to !== "idle")
                command({ type: "assign", worker: c.id, job: to });
              else command({ type: "move", worker: c.id, from: c.job, to });
            }}
          />
        ))}
      </fieldset>
      <ExchangePanel state={state} busy={busy} onCommand={command} />
      <section aria-label="확장 체험 목재 요청">
        <h3>목재20 · 기한12시간</h3>
        <div className="labor-stock">
          {(
            [
              "waiting",
              "checked",
              "quarantine",
              "available",
              "allocated",
              "used",
              "transit",
            ] as const
          ).map((k, i) => (
            <span key={k}>
              {
                [
                  "검사대기",
                  "수령전",
                  "격리",
                  "사용가능",
                  "배분",
                  "사용확인",
                  "교환운송",
                ][i]
              }{" "}
              <strong data-testid={`labor-${k}`}>{stock[k]}</strong>
            </span>
          ))}
        </div>
        <p data-testid="labor-total">
          물량 합계 {Object.values(stock).reduce((a, b) => a + b, 0)}/20
        </p>
        {t.phase === "select" ? (
          <>
            <div className="timber-offers">
              {(["A", "B"] as const).map((offer) => (
                <article
                  className={
                    t.offer === offer ? "timber-offer selected" : "timber-offer"
                  }
                  key={offer}
                >
                  <h4>공급 {offer}</h4>
                  <p>
                    철재{TIMBER_RULES.offers[offer].cost} · 도착
                    {TIMBER_RULES.offers[offer].travel / 60}시간
                  </p>
                  <p>
                    {offer === "A"
                      ? "정상16·젖은4, 보완에2명·4시간"
                      : "정상20, 보완 일손을 아낌"}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    aria-pressed={t.offer === offer}
                    onClick={() => wood({ type: "choose", offer })}
                  >
                    확장 제안 {offer} 선택
                  </button>
                </article>
              ))}
            </div>
            <button
              type="button"
              disabled={busy || !t.offer}
              onClick={() => wood({ type: "contract" })}
            >
              확장 약정하기
            </button>
          </>
        ) : null}
        {t.phase === "contracted" ? (
          <>
            <p>운송·검사 담당1명이 예약됐습니다.</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => wood({ type: "depart" })}
            >
              확장 수레 출발
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => wood({ type: "cancel" })}
            >
              확장 약정 취소
            </button>
          </>
        ) : null}
        {t.phase === "transport" ? (
          <p>
            수레 이동 중 · 도착 {time(t.due ?? 0)}.8시간 요청을 먼저 처리할 수
            있습니다.
          </p>
        ) : null}
        {t.phase === "arrived" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => wood({ type: "inspect" })}
          >
            확장 전량 검사 시작
          </button>
        ) : null}
        {t.phase === "inspecting" ? (
          <p>검사·검수 중 · 완료 {time(t.due ?? 0)}</p>
        ) : null}
        {t.phase === "inspected" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => wood({ type: "receive" })}
          >
            확장 정상분 {t.stock.checked} 받기
          </button>
        ) : null}
        {["received", "repairing", "ready"].includes(t.phase) ? (
          <button
            type="button"
            disabled={busy || t.stock.available === 0}
            onClick={() => wood({ type: "allocate" })}
          >
            확장 정상 목재 {t.stock.available} 배분
          </button>
        ) : null}
        {t.phase === "ready" ? (
          <button
            type="button"
            disabled={busy || t.stock.allocated !== 20}
            onClick={() => wood({ type: "use" })}
          >
            확장 목재 사용 확인
          </button>
        ) : null}
        {t.phase === "completed" ? (
          <p>
            목재 사용 확인 완료 · {time(t.completedAt ?? 0)}
            {!done ? " · 남은 배급 준비를 계속하세요." : ""}
          </p>
        ) : null}
      </section>
      {done ? (
        <div className="timber-result" data-testid="labor-result">
          <h3>두 생활 요청을 마쳤습니다</h3>
          <p>
            공급{t.offer} · 철재{iron} 남음
          </p>
          <p>
            불량 처리:{" "}
            {state.exchange.phase === "completed"
              ? "공급처 교환·재검수 (추가 철재1)"
              : t.offer === "A"
                ? "현장 보완"
                : "불량 없음"}
          </p>
          <p>
            목재: {time(t.completedAt ?? 0)} ·{" "}
            {(t.completedAt ?? 0) <= 720
              ? "기한 충족"
              : `${(t.completedAt ?? 0) - 720}분 지연`}
          </p>
          <p>
            배급 준비: {time(state.prepCompletedAt ?? 0)} ·{" "}
            {(state.prepCompletedAt ?? 0) <= 600
              ? "기한 충족"
              : `${(state.prepCompletedAt ?? 0) - 600}분 지연`}
          </p>
          <p>
            가격·보완 일손·대기 해소가 서로 다른 결과로 이어졌습니다. 기존
            시나리오의 사건과 영상은 유지합니다.
          </p>
        </div>
      ) : null}
      <div className="timber-controls">
        <button type="button" disabled={busy} onClick={() => access(false)}>
          일손 체험 저장
        </button>
        <button type="button" disabled={busy} onClick={() => access(true)}>
          일손 체험 불러오기
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => access(true, true)}
        >
          이전 일손 체험 불러오기
        </button>
        <button
          type="button"
          className="quiet-button"
          disabled={busy}
          onClick={() => setConfirm(true)}
        >
          일손 체험 다시 시작
        </button>
      </div>
      {confirm ? (
        <div className="new-game-confirm">
          <p>이번 확장 체험만 처음부터 다시 할까요? 저장은 유지됩니다.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              command({ type: "restart" });
              setConfirm(false);
            }}
          >
            새 일손 체험 확인
          </button>
          <button type="button" onClick={() => setConfirm(false)}>
            계속 진행
          </button>
        </div>
      ) : null}
      <p aria-live="polite" data-testid="labor-save-status">
        {busy ? "일손 저장 처리 중" : status}
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <details>
        <summary>체험 전용 수치·본편 미정 구분</summary>
        <p>
          개발 선택: 일손4명, 배급 요청8시간 공개·10시간 기한,360인·분
          작업량(3명×2시간), 대기3무리. 목재 보완은 두 명이4시간 진행하며 중단
          시 진행을 보존합니다.
        </p>
        <p>
          교환은 추가 철재1·담당1명, 회수90분+재납품90분+재검수120분입니다.
          교환품4는 정상 고정이며 반품 책임·위약금·공급처 신뢰도·무작위 불량률은
          본편 미정입니다. 배치 전환은 게임 시간0분, 화면 이동은 표시용입니다.
          대기무리는 혼잡 표시이며 실제 먹이 소비·영양·기아를 계산하지 않습니다.
          본편의 영양량·시간 배율·배급 간격·사망 수치는 미정입니다.
        </p>
        <p>
          확장 체험 저장은 기존 목재·생존 저장과 별도이며, 기존 기록을 임의로
          변환하거나 덮어쓰지 않습니다.
        </p>
      </details>
      <details>
        <summary>일손 처리 기록</summary>
        <ol>
          {state.history.map((h) => (
            <li key={h.id}>
              {time(h.minute)} · {h.text}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
