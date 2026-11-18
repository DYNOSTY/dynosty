import {
  GAME_RULES,
  RESEARCH_CATALOG,
  RESEARCH_CONNECTED,
  type ResourceId,
  researchIssue,
  scoutSpeedRate,
  type TimberCommand,
  type TimberState,
  tradeRank,
} from "@dynosty/game-core";
import { useState } from "react";
export const OvertimeControl = ({
  state,
  target,
  command,
}: {
  state: TimberState;
  target: string;
  command: (c: TimberCommand) => void;
}) => (
  <label>
    {" "}
    <input
      type="checkbox"
      aria-label={`${target} 야근`}
      checked={
        state.world.minute < 1260 &&
        state.town.development.overtime.some(
          (p) => p.target === target && p.day === state.world.day && p.enabled,
        )
      }
      disabled={state.world.minute >= 1260}
      onChange={(e) =>
        command({ type: "set-overtime", target, enabled: e.target.checked })
      }
    />
    오늘 야근 18~21시
  </label>
);
export function DevelopmentPanel({
  state,
  command,
  showDevTools = false,
}: {
  state: TimberState;
  command: (c: TimberCommand) => void;
  showDevTools?: boolean;
}) {
  const [tech, setTech] = useState("TECH_TRAIL"),
    d = state.town.development;
  const visibleResearch = RESEARCH_CATALOG.filter(
    (entry) =>
      entry.category !== "story" ||
      showDevTools ||
      d.story.rebellion ||
      d.completed.includes(entry.id),
  );
  const selected = visibleResearch.some((entry) => entry.id === tech)
    ? tech
    : "TECH_TRAIL";
  const r = visibleResearch.find((entry) => entry.id === selected),
    issue = researchIssue(state, selected);
  const categories = {
    building: "건물별 개량",
    collection: "자원별 채집",
    storage: "저장 공간",
    movement: "정찰 이동",
    story: "후반 이야기",
    legacy: "기존 자료 · 연결 전",
  };
  const dead = state.world.citizens.filter(
    (c) =>
      !c.alive &&
      !c.mechanicalFrom &&
      !state.world.citizens.some((m) => m.mechanicalFrom === c.id),
  );
  return (
    <section className="village-service" aria-label="연구와 교역망">
      <h3>연구소 · 연구 · 교역망</h3>
      <p>
        교역망 {tradeRank(state)}/3 · 성공 {d.tradeCount}회 · 성공1회에2단계,
        누적3회에3단계로 넓어집니다.
      </p>
      <p>
        정찰 연구 배율×{scoutSpeedRate(state)} · 현재 정찰대에 적용되는
        속도입니다. 교역 이동 시간은 별도로 계산합니다.
      </p>
      <label>
        연구 기술{" "}
        <select
          aria-label="연구 기술"
          value={selected}
          onChange={(e) => setTech(e.target.value)}
        >
          {Object.entries(categories)
            .filter(([key]) =>
              visibleResearch.some((entry) => entry.category === key),
            )
            .map(([category, label]) => (
              <optgroup key={category} label={label}>
                {visibleResearch
                  .filter((r) => r.category === category)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {d.completed.includes(r.id)
                        ? " · 완료"
                        : !RESEARCH_CONNECTED.includes(r.id)
                          ? " · 연결 전"
                          : ""}
                    </option>
                  ))}
              </optgroup>
            ))}
        </select>
      </label>
      <p>
        {r
          ? Object.entries(r.cost)
              .map(([id, n]) => GAME_RULES.resources[id as ResourceId].name + n)
              .join(" · ")
          : ""}{" "}
        · 연구원 배치 필요 · 연구소마다 동시1건
      </p>
      <p>{r?.effect}</p>
      <p className="hint">
        연구원은 건설 메뉴의 ‘완공 시설’을 펼쳐 연구소별로 배치합니다.
      </p>
      <button
        type="button"
        disabled={!!issue}
        onClick={() => command({ type: "start-research", tech: selected })}
      >
        연구 시작
      </button>
      <p>
        {issue ?? "연구 시작 시 자재 확보 · 완료 후 개량은 별도로 지시합니다."}
      </p>
      <div data-testid="research-status">
        {d.research.length
          ? d.research.map((job) => {
              const active = RESEARCH_CATALOG.find((r) => r.id === job.tech);
              return (
                <p key={job.facility}>
                  {job.facility} · {active?.name} 연구 중 ·{" "}
                  {Math.floor(
                    (job.work / ((active?.workdays ?? 1) * 540 * 3)) * 100,
                  )}
                  %
                </p>
              );
            })
          : `완료 연구 ${d.completed.length}개`}
      </div>
      <p className="hint">
        새 공통 연구와 후반 기술의 비용·기간은 개발용입니다. 한 연구를 여러 번
        완료해 효과를 중첩할 수 없습니다.
      </p>
      <details>
        <summary>완료한 연구</summary>
        <ul>
          {d.completed.map((id) => (
            <li key={id}>
              {RESEARCH_CATALOG.find((r) => r.id === id)?.name ?? id}
            </li>
          ))}
        </ul>
      </details>
      {(showDevTools || d.story.rebellion) && (
        <p>
          후반 분기:{" "}
          {d.story.route === "flight"
            ? "반란 진압 · 날틀"
            : d.story.route === "mechanical"
              ? "충녕 시해 · 기계 부활"
              : d.story.route === "dictatorship"
                ? "양녕과의 독재"
                : d.story.rebellion
                  ? "반란 진행 중"
                  : "반란 전"}
        </p>
      )}
      {d.completed.includes("TECH_FLIGHT") ? (
        <figure>
          <img
            className="research-illustration"
            src="/story/flight-research-v1.png"
            width={1672}
            height={941}
            alt="완성된 날틀에 기뻐하는 충녕과 그 모습을 바라보는 고리"
            loading="lazy"
          />
          <figcaption>날틀 완성 · 정찰 이동 기본10배</figcaption>
        </figure>
      ) : null}
      {d.electrical.length > 0 ? (
        <figure>
          <img
            className="research-illustration"
            src="/story/electrical-coercion-v1.png"
            width={1672}
            height={941}
            alt="전기자극기로 강제 노동하는 주민들을 내려다보는 양녕과 고리"
            loading="lazy"
          />
          <figcaption>전기자극기 시행 · 지정 시설 작업량 기본200%</figcaption>
        </figure>
      ) : null}
      {d.completed.includes("TECH_MECHA2") ? (
        <div>
          <h4>메카 노동 개체 제작</h4>
          <p>
            충녕: 기계로 부활 · 사망자의 뼈는 한 번만 사용합니다. 메카는
            식량·수면·둥지가 필요 없습니다.
          </p>
          {dead.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => command({ type: "mechanize", source: c.id })}
            >
              주민 {state.world.citizens.findIndex((q) => q.id === c.id) + 1}의
              뼈로 메카 제작
            </button>
          ))}
          <p>
            활동 중 메카{" "}
            {
              state.world.citizens.filter((c) => c.alive && c.mechanicalFrom)
                .length
            }
            명 · 사용 가능한 사망자 {dead.length}명
          </p>
        </div>
      ) : null}
      <p>
        비관 {state.world.pessimism}/100 · 야근 부상 기록 {d.injuries.length}건
      </p>
      <p className="hint">
        야근은 지정 업무만 당일18~21시입니다. 수당·추가 식량은 없습니다. 개발용:
        실제 야근1시간에 비관+1, 부상 위험1%/인시. 일반 주민의 식사·귀가 규칙은
        유지합니다.
      </p>
      {showDevTools ? (
        <details>
          <summary>후반 사건 전달 검사</summary>
          <p>
            개발용 사건 입력입니다. 본편 전체 미션을 완료한 것으로 처리하지
            않습니다. 분기 확정 후 다른 노선으로 바꿀 수 없습니다.
          </p>
          <button
            type="button"
            disabled={d.story.rebellion}
            onClick={() =>
              command({ type: "story-event", event: "rebellion-started" })
            }
          >
            반란 발생 전달
          </button>
          <button
            type="button"
            disabled={!d.story.rebellion || d.story.route !== null}
            onClick={() =>
              command({ type: "story-event", event: "rebellion-suppressed" })
            }
          >
            반란 진압 전달
          </button>
          <button
            type="button"
            disabled={!d.story.rebellion || d.story.route !== null}
            onClick={() =>
              command({
                type: "story-event",
                event: "chungnyeong-assassinated",
              })
            }
          >
            충녕 시해 전달
          </button>
          <button
            type="button"
            disabled={!d.story.rebellion || d.story.route !== null}
            onClick={() =>
              command({ type: "story-event", event: "allied-yangnyeong" })
            }
          >
            양녕 협력 전달
          </button>
        </details>
      ) : null}
      <details>
        <summary>기존 자료의 미연결 연구</summary>
        <p>
          규격·훈연·경보 등 이전 자료 항목은 해당 기반 시스템 연결 전까지
          잠금입니다. 달이의 보관 상한 스킬은 별도 미연결 상태입니다. 현재 연구
          목록은 공통·후반 신규 규칙까지 포함합니다.
        </p>
      </details>
    </section>
  );
}
