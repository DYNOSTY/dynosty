import { AMOUNT_SCALE, type PlayState, winterReport } from "@dynosty/game-core";
import type { Ref } from "react";
import type { BuildingAction, BuildingCommand } from "./buildings.js";
import { CmdFace } from "./GameHud.js";

// 건물을 눌렀을 때 띄우는 창 — 레퍼런스별 시안 (2026-11-19, ?panel=a|b|c)
//  a 오른쪽 세로 카드: 프로스트펑크(건물 그림 머리·상태·일꾼·효과) + 어게인스트 더 스톰(오른쪽에 붙은 판)
//  b 오른쪽 아래 초상 메달: 문명 6(고른 대상 요약 메달 + 위쪽 명령 아이콘)
//  c 건물 옆 카드: 실록(고른 건물 바로 옆에 뜨는 작은 정보 창)
export type PanelVariant = "a" | "b" | "c";

type Props = {
  variant: PanelVariant;
  id: string;
  name: string;
  role: string;
  commands: Array<{ slot: string; cmd: BuildingCommand | null }>;
  state: PlayState | null;
  onAction: (a: BuildingAction) => void;
  toggled: (a: BuildingAction | undefined) => boolean | undefined;
  disabled: (cmd: BuildingCommand) => boolean;
  anchorRef?: Ref<HTMLDivElement>;
};

function OndolGauge({ state }: { state: PlayState }) {
  const r = winterReport(state.winter, state.day, state.minute, state.citizens);
  const nest = r.zones.find((z) => z.id === "nest");
  const coal = state.resources.RES_COAL / AMOUNT_SCALE;
  const days = r.coalPerDay > 0 ? coal / r.coalPerDay : 0;
  const storage = nest?.storage ?? 0;
  return (
    <div className="sc-gauges">
      <div className="sc-gauge">
        <span className="sc-gauge__label">구들 축열</span>
        <span className="sc-gauge__bar" aria-hidden="true">
          <i style={{ width: `${storage}%` }} />
        </span>
        <b>{storage}%</b>
      </div>
      <div className="sc-gauge">
        <span className="sc-gauge__label">석탄</span>
        <span className="sc-gauge__bar is-coal" aria-hidden="true">
          <i style={{ width: `${Math.min(100, (days / 7) * 100)}%` }} />
        </span>
        <b>{coal > 0 ? `${days.toFixed(1)}일` : "없음"}</b>
      </div>
      <p className="sc-note">
        {nest?.firing ? "불 때는 중" : "쉬는 중"} · 하루 석탄{" "}
        {r.coalPerDay.toFixed(1)}
      </p>
    </div>
  );
}

export function SelectionCard(p: Props) {
  const isOndol = p.id === "BLD_ONDOL";
  const actions = p.commands.flatMap(({ slot, cmd }) =>
    cmd ? [{ slot, cmd }] : [],
  );
  const own = actions.filter(
    ({ cmd }) => cmd.action !== "focus" && cmd.action !== "clear",
  );
  const focus = actions.find(({ cmd }) => cmd.action === "focus");
  const clear = actions.find(({ cmd }) => cmd.action === "clear");
  const button = (
    { slot, cmd }: { slot: string; cmd: BuildingCommand },
    withLabel: boolean,
  ) => (
    <button
      key={slot}
      type="button"
      className={`sc-btn${withLabel ? " has-label" : ""}`}
      aria-label={cmd.label}
      aria-pressed={p.toggled(cmd.action)}
      disabled={p.disabled(cmd)}
      title={cmd.action ? cmd.label : `${cmd.label} · 규칙 준비 중`}
      onClick={() => cmd.action && p.onAction(cmd.action)}
    >
      <CmdFace icon={cmd.icon} label={cmd.label} hotkey={cmd.hotkey ?? ""} />
      {withLabel ? <span className="sc-btn__text">{cmd.label}</span> : null}
    </button>
  );

  if (p.variant === "b")
    return (
      <section className="sc sc--medal" aria-label="선택 정보">
        <div className="sc-medal__actions">
          {own.map((a) => button(a, false))}
          {focus ? button(focus, false) : null}
        </div>
        <div className="sc-medal__body">
          <img
            className="sc-medal__portrait"
            src={`/ui/buildings/${p.id}.jpg`}
            alt=""
          />
          <div className="sc-medal__text">
            <h2>{p.name}</h2>
            <p>{p.role}</p>
            {isOndol && p.state ? <OndolGauge state={p.state} /> : null}
          </div>
          {clear ? (
            <div className="sc-medal__close">{button(clear, false)}</div>
          ) : null}
        </div>
      </section>
    );

  if (p.variant === "c")
    return (
      <section
        className="sc sc--float"
        aria-label="선택 정보"
        ref={p.anchorRef as Ref<HTMLElement>}
      >
        <header className="sc-float__head">
          <h2>{p.name}</h2>
          {clear ? button(clear, false) : null}
        </header>
        <p className="sc-float__role">{p.role}</p>
        {isOndol && p.state ? <OndolGauge state={p.state} /> : null}
        <div className="sc-float__actions">
          {own.map((a) => button(a, false))}
          {focus ? button(focus, false) : null}
        </div>
      </section>
    );

  return (
    <section className="sc sc--card" aria-label="선택 정보">
      <header className="sc-card__head">
        <img src={`/ui/buildings/${p.id}.jpg`} alt="" />
        <h2>{p.name}</h2>
        <div className="sc-card__corner">
          {focus ? button(focus, false) : null}
          {clear ? button(clear, false) : null}
        </div>
      </header>
      <p className="sc-card__role">{p.role}</p>
      {isOndol && p.state ? (
        <>
          <h3 className="sc-sub">구들</h3>
          <OndolGauge state={p.state} />
          <h3 className="sc-sub">화력</h3>
        </>
      ) : (
        <h3 className="sc-sub">할 일</h3>
      )}
      <div className="sc-card__actions">{own.map((a) => button(a, true))}</div>
    </section>
  );
}
