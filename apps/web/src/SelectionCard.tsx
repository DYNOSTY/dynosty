import { AMOUNT_SCALE, type PlayState, winterReport } from "@dynosty/game-core";
import type { CSSProperties } from "react";
import type { BuildingAction, BuildingCommand } from "./buildings.js";
import { CmdFace } from "./GameHud.js";

// 건물을 눌렀을 때 띄우는 창 (2026-11-19 사용자 선택: 시안 B) — 문명 6처럼 오른쪽 아래 초상 + 요약,
// 위에 명령 아이콘 줄. 초상은 원이 아니라 모서리만 둥근 사각 (사용자: "사각 같이 꼭다리 둥글게")
// 노란 테두리는 뺌 (사용자 11/19 "테두리 지워 노란 테두리")

type Props = {
  id: string;
  name: string;
  role: string;
  commands: Array<{ slot: string; cmd: BuildingCommand | null }>;
  state: PlayState | null;
  onAction: (a: BuildingAction) => void;
  toggled: (a: BuildingAction | undefined) => boolean | undefined;
  disabled: (cmd: BuildingCommand) => boolean;
  /** 초상 그림 (없으면 건물 그림) — 주민은 /ui/residents/<종>.jpg */
  portrait?: string | undefined;
  /** 주민 종의 장단점 (기획서에 적힌 것만) */
  traits?: { gain: string; loss: string } | undefined;
};

// 구들 축열 = 온돌 단면 가로 띠(사용자 11/19 3차 "가로로 연출") — 왼쪽 아궁이 불이 고래를 따라
// 오른쪽 굴뚝까지 열이 번져 가는 만큼이 축열. 다 차면 굴뚝에서 연기가 남.
// 석탄 = 덩이 7개(한 덩이 = 하루치), 남은 만큼 채워짐.
const COAL_SLOTS = 7;
function OndolGauge({ state }: { state: PlayState }) {
  const r = winterReport(state.winter, state.day, state.minute, state.citizens);
  const nest = r.zones.find((z) => z.id === "nest");
  const coal = state.resources.RES_COAL / AMOUNT_SCALE;
  const days = r.coalPerDay > 0 ? coal / r.coalPerDay : 0;
  const storage = nest?.storage ?? 0;
  const vars = {
    "--heat": storage / 100,
    "--fire": nest?.firing ? 1 : 0,
  } as CSSProperties;
  return (
    <div className="sc-gauges">
      <div className="sc-head">
        <img src="/ui/season/heat_urgent.png" alt="" />
        <span>구들 축열</span>
        <b className={storage >= 70 ? "is-hot" : ""}>{storage}%</b>
      </div>
      <div
        className={`ondol-x${storage >= 70 ? " is-hot" : ""}${storage >= 95 ? " is-full" : ""}`}
        style={vars}
        aria-hidden="true"
      >
        <img className="ondol-x__strip" src="/ui/kit/ondol_strip.webp" alt="" />
        <span
          className="ondol-x__heat"
          style={{ width: `${storage * 0.9}%` }}
        />
        <span className="ondol-x__fire" />
        <span className="ondol-x__smoke" />
      </div>
      <div className="sc-head">
        <img src="/ui/resources/RES_COAL.png" alt="" />
        <span>석탄</span>
        <b className={days < 2 ? "is-low" : ""}>
          {coal > 0 ? `${days.toFixed(1)}일` : "없음"}
        </b>
      </div>
      <div
        className={`coal-x${days < 2 ? " is-low" : ""}`}
        title="한 덩이 = 하루치"
        aria-hidden="true"
      >
        {Array.from({ length: COAL_SLOTS }, (_, i) => {
          const f = Math.max(0, Math.min(1, days - i));
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: 고정 7칸
            <i key={i}>
              <img
                src="/ui/resources/RES_COAL.png"
                alt=""
                style={{ clipPath: `inset(0 ${100 - f * 100}% 0 0)` }}
              />
            </i>
          );
        })}
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

  return (
    <section className="sc sc--medal" aria-label="선택 정보">
      <div className="sc-medal__actions">
        {own.map((x) => button(x, false))}
        {focus ? button(focus, false) : null}
      </div>
      <div className="sc-medal__body">
        <img
          className="sc-medal__portrait"
          src={p.portrait ?? `/ui/buildings/${p.id}.jpg`}
          alt=""
        />
        <div className="sc-medal__text">
          <h2>{p.name}</h2>
          <p>{p.role}</p>
          {isOndol && p.state ? <OndolGauge state={p.state} /> : null}
          {p.traits ? (
            <span className="story-gl sc-traits">
              <span className="is-gain">
                <i>장점</i>
                {p.traits.gain}
              </span>
              <span className="is-loss">
                <i>단점</i>
                {p.traits.loss}
              </span>
            </span>
          ) : null}
        </div>
        {clear ? (
          <div className="sc-medal__close">{button(clear, false)}</div>
        ) : null}
      </div>
    </section>
  );
}
