// M1 화면 틀을 실제 게임에 끼우는 부품: 옻칠 위 막대·단청 콘솔 그림, 명령 칸, 저울
import { type ReactNode, useEffect, useState } from "react";

// 개발 모드에서만: 화면 왼쪽 위에 초당 장면 수 (버벅임을 직접 확인)
export function FpsBadge() {
  const [fps, setFps] = useState<number | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const id = window.setInterval(() => {
      const perf = (window as unknown as { __perf?: () => { fps: number } })
        .__perf;
      if (perf) setFps(perf().fps);
    }, 500);
    return () => window.clearInterval(id);
  }, []);
  if (!import.meta.env.DEV || fps === null) return null;
  return (
    <div className={`g-fps${fps < 30 ? " is-low" : ""}`} aria-hidden="true">
      {fps} fps
    </div>
  );
}

const TOP_GROW = new Set([3, 5]);
const TOP_INSET = new Set([1, 7]);
export function TopFrame() {
  return (
    <div className="g-top__frame" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <img
          // biome-ignore lint/suspicious/noArrayIndexKey: 고정된 9조각 그림
          key={i}
          src={`/ui/kit/topbar_${i}.webp`}
          alt=""
          className={TOP_GROW.has(i) ? "grow" : TOP_INSET.has(i) ? "inset" : ""}
        />
      ))}
    </div>
  );
}

export function ConsoleFrame() {
  return (
    <div className="g-console__frame" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <img
          key={i}
          src={`/ui/kit/console_${i}.webp`}
          alt=""
          className={i % 2 ? "grow" : ""}
        />
      ))}
    </div>
  );
}

type CmdProps = {
  icon: string;
  label: string;
  hotkey: string;
  onClick?: () => void;
  disabled?: boolean;
  pressed?: boolean;
  buttonRef?: React.Ref<HTMLButtonElement>;
  controls?: string;
};
// 기획서 화면정의: 못 쓰는 명령은 이유를 보여 준다
export function CmdButton({
  icon,
  label,
  hotkey,
  onClick,
  disabled,
  pressed,
  buttonRef,
  controls,
}: CmdProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="g-cmd"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      aria-expanded={pressed}
      aria-controls={controls}
      title={disabled ? `${label} · 규칙 준비 중` : `${label} (${hotkey})`}
    >
      <CmdFace icon={icon} label={label} hotkey={hotkey} />
    </button>
  );
}
export function CmdFace({
  icon,
  label,
  hotkey,
}: {
  icon: string;
  label: string;
  hotkey: string;
}): ReactNode {
  return (
    <>
      <img src={`/ui/cmd/${icon}.webp`} alt="" />
      <span>{label}</span>
      <span className="g-hotkey" aria-hidden="true">
        {hotkey}
      </span>
    </>
  );
}

// 희망·절망 저울. 값이 없으면 수평으로 두고 '규칙 준비 중'
export function MoodScale({
  hope,
  despair,
}: {
  hope: number | null;
  despair: number | null;
}) {
  const ready = hope !== null && despair !== null;
  const th = ready ? Math.max(-14, Math.min(14, (despair - hope) * 0.25)) : 0;
  const r = (th * Math.PI) / 180;
  const X = 560,
    Y = 215;
  const ring = (x: number, y: number) =>
    [
      x * Math.cos(r) - y * Math.sin(r),
      x * Math.sin(r) + y * Math.cos(r),
    ] as const;
  const [lx, ly] = ring(-360, 62),
    [rx, ry] = ring(358, 62);
  return (
    <figure
      className="g-mood"
      aria-label={
        ready ? `희망 ${hope}, 절망 ${despair}` : "희망·절망 규칙 준비 중"
      }
    >
      <div className="rig-box">
        <button
          type="button"
          className="mood-inspect"
          aria-label="희망과 절망 확인"
        />
        <span
          className="g-mood__v"
          style={{
            left: ((X + lx) / 1120) * 100 + "%",
            top: ((Y + ly + 480) / 930) * 100 + "%",
          }}
        >
          <small>희망</small>
          {ready && <b>{hope}</b>}
        </span>
        <span
          className="g-mood__v"
          style={{
            left: ((X + rx) / 1120) * 100 + "%",
            top: ((Y + ry + 480) / 930) * 100 + "%",
          }}
        >
          <small>절망</small>
          {ready && <b>{despair}</b>}
        </span>
        <div className="rig">
          <img
            src="/ui/kit/scale_post.webp"
            alt=""
            style={{ left: X - 240, top: Y - 205 }}
          />
          <img
            src="/ui/kit/scale_panL.webp"
            alt=""
            style={{ left: X + lx - 210, top: Y + ly - 30 }}
          />
          <img
            src="/ui/kit/scale_panR.webp"
            alt=""
            style={{ left: X + rx - 205, top: Y + ry - 30 }}
          />
          <img
            src="/ui/kit/scale_beam.webp"
            alt=""
            style={{
              left: X - 472,
              top: Y - 60,
              transformOrigin: "472px 60px",
              transform: `rotate(${th}deg)`,
            }}
          />
        </div>
      </div>

      {ready ? null : <figcaption>민심 규칙 준비 중</figcaption>}
    </figure>
  );
}

// 자원 이름+숫자 → 3D 아이콘+숫자 (예: "철재4 ↔ 목재20" → [철]4 ⇄ [나무]20)
const RES_BY_NAME: Record<string, string> = {
  풀: "RES_PLANT",
  고기: "RES_MEAT",
  어류: "RES_FISH",
  나무: "RES_WOOD",
  목재: "RES_WOOD",
  철재: "RES_METAL",
  철: "RES_METAL",
  물: "RES_WATER",
  석탄: "RES_COAL",
};
export function Res({
  id,
  n,
  label,
}: {
  id: string;
  n: number | string;
  label?: string;
}) {
  return (
    <span className="g-res" title={label}>
      <img src={`/ui/resources-3d/${id}.webp`} alt={label ?? ""} />
      <b>{n}</b>
    </span>
  );
}
export function IconText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const re = /(철재|목재|어류|고기|석탄|나무|풀|철|물)\s?(\d+)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const [all, name = "", num = ""] = m;
    if ((m.index ?? 0) > last)
      parts.push(text.slice(last, m.index).replace("↔", "⇄"));
    parts.push(
      <Res
        key={m.index}
        id={RES_BY_NAME[name] ?? "RES_WOOD"}
        n={num}
        label={`${name} ${num}`}
      />,
    );
    last = (m.index ?? 0) + all.length;
  }
  if (last < text.length) parts.push(text.slice(last).replace("↔", "⇄"));
  return <span className="g-icontext">{parts}</span>;
}
