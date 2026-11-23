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
import { type ReactNode, useState } from "react";
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
  const [tech, setTech] = useState("UPGRADE_HOME_2"),
    d = state.town.development;
  const visibleResearch = RESEARCH_CATALOG.filter(
    (entry) =>
      (showDevTools || RESEARCH_CONNECTED.includes(entry.id)) &&
      (entry.category !== "story" ||
        (entry.id === "R17" && (state.chapter ?? 1) >= 4) ||
        showDevTools ||
        d.story.rebellion ||
        d.completed.includes(entry.id)),
  );
  const [branch, setBranch] = useState("building");
  const group = visibleResearch.filter((entry) => entry.category === branch);
  const incomplete = visibleResearch.filter(
    (entry) => !d.completed.includes(entry.id),
  );
  const selected =
    group.find((entry) => entry.id === tech)?.id ??
    group.find((entry) => !d.completed.includes(entry.id))?.id ??
    group[0]?.id ??
    "";

  const r = visibleResearch.find((entry) => entry.id === selected),
    issue = selected
      ? researchIssue(state, selected)
      : "모든 연구가 완료되었습니다.";
  const categories = {
    building: "건물별 개량",
    collection: "자원별 채집",
    storage: "저장 공간",
    movement: "정찰 이동",
    story: "후반 이야기",
    legacy: "기존 자료 · 연결 전",
  };
  function twig(entry: (typeof group)[number]): ReactNode {
    const children = group.filter(
      (child) =>
        child.requires.find((id) => group.some((node) => node.id === id)) ===
        entry.id,
    );
    const done = d.completed.includes(entry.id);
    const reason = done ? "연구 완료" : researchIssue(state, entry.id);
    const prerequisites = entry.requires.map(
      (id) => RESEARCH_CATALOG.find((node) => node.id === id)?.name ?? id,
    );
    const price = Object.entries(entry.cost)
      .map(([id, n]) => GAME_RULES.resources[id as ResourceId].name + " " + n)
      .join(" · ");
    const image =
      entry.category === "building" && entry.level > 0
        ? `/art/facilities/${entry.target}-${entry.level}.webp`
        : `/ui/cmd/${branch === "movement" ? "map" : "research"}.png`;
    const detail = [
      entry.effect,
      price,
      prerequisites.length ? "선행 연구 · " + prerequisites.join(", ") : "",
      reason,
    ]
      .filter(Boolean)
      .join("\n");
    return (
      <li key={entry.id}>
        <button
          type="button"
          title={detail}
          data-available={!reason}
          aria-pressed={entry.id === selected}
          onClick={() => {
            setTech(entry.id);
          }}
        >
          <img alt="" src={image} />
          <span>{entry.name.replace(/ (개량 )?연구$/, "")}</span>
          {done && <small>완료</small>}
        </button>
        {children.length > 0 && <ul>{children.map(twig)}</ul>}
      </li>
    );
  }
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
      <section className="research-tree" aria-label="연구 도감">
        <nav aria-label="연구 분야">
          {Object.entries(categories)
            .filter(([id]) =>
              visibleResearch.some((entry) => entry.category === id),
            )
            .map(([id, name]) => (
              <button
                key={id}
                type="button"
                aria-pressed={branch === id}
                onClick={() => {
                  setBranch(id);
                  const first = incomplete.find((e) => e.category === id);
                  if (first) setTech(first.id);
                }}
              >
                {name}
              </button>
            ))}
        </nav>
        <ul aria-label={categories[branch as keyof typeof categories]}>
          {group
            .filter(
              (entry) =>
                !entry.requires.some((id) =>
                  group.some((node) => node.id === id),
                ),
            )
            .map(twig)}
        </ul>
      </section>
      <article className="research-folio" aria-label="선택한 기술">
        {r && (
          <>
            <small>{categories[r.category as keyof typeof categories]}</small>
            <h4>{r.name}</h4>
            <p>
              선행 기술 ·{" "}
              {r.requires
                .map(
                  (id) =>
                    RESEARCH_CATALOG.find((node) => node.id === id)?.name ?? id,
                )
                .join(", ") || "첫 연구"}
            </p>
            <p>소요 · 연구원 3명 기준 {r.workdays}일</p>
            <p>
              이어지는 기술 ·{" "}
              {visibleResearch
                .filter((node) => node.requires.includes(r.id))
                .map((node) => node.name)
                .join(", ") || "최종 연구"}
            </p>
          </>
        )}
        <label>
          연구 기술{" "}
          <select
            aria-label="연구 기술"
            value={selected}
            onChange={(e) => {
              const node = visibleResearch.find(
                (item) => item.id === e.target.value,
              );
              if (node) {
                setTech(node.id);
                setBranch(node.category);
              }
            }}
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
                      <option
                        key={r.id}
                        value={r.id}
                        disabled={d.completed.includes(r.id)}
                      >
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
                .map(
                  ([id, n]) => GAME_RULES.resources[id as ResourceId].name + n,
                )
                .join(" · ")
            : ""}{" "}
          · 연구원 배치 필요 · 연구소마다 동시1건
        </p>
        <p>{r?.effect}</p>
        {r?.id === "UPGRADE_HOSPITAL_2" && (
          <p>
            병원을 개량하면 경상 회복 시간이 12시간에서 8시간으로 줄어듭니다.
            도성 관아에서는 운영 가능한 2단계 병원과 식당이 있으면 병상 배식을
            반포할 수 있습니다.
          </p>
        )}
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
          {issue ??
            "연구 시작 시 자재 확보 · 완료 후 개량은 별도로 지시합니다."}
        </p>
      </article>
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
      <p>야근 부상 기록 {d.injuries.length}건</p>
      <p className="hint">
        저녁 여섯 시부터 아홉 시까지 지정된 일터에서만 야근합니다. 수당·추가
        식량은 없습니다. 일터에 그날 처음 야근을 지시하면 희망이 5 내려가고
        절망이 5 오릅니다. 늦게까지 남은 일꾼은 다칠 수 있습니다.
      </p>
      {showDevTools && !state.campaign ? (
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
