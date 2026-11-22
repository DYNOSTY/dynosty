import {
  inColdSnap,
  type PlayState,
  type Weather,
  winterReport,
} from "@dynosty/game-core";
import type { CSSProperties } from "react";

// 시계(사용자 11/19 2차): 원은 하늘만 — 해·달이 지평선 위 호를 따라 원 안에서만 움직이고(지나온 길은 밝게),
// 테두리가 그 시의 십이간지 (말은 테 위에 서고, 뱀은 테를 감고). 옆 글 상자에 시 · 절기 · 날씨 · 기온 · 내일.
// 그림: 코덱스 생성 — 테 12장은 tools/ring-normalize.mjs로 구멍 중심·크기를 맞춤 (public/ui/time/ring_*.webp)
const SICHEN = [
  ["자시", "子時", "rat", "쥐"],
  ["축시", "丑時", "ox", "소"],
  ["인시", "寅時", "tiger", "범"],
  ["묘시", "卯時", "rabbit", "토끼"],
  ["진시", "辰時", "dragon", "용"],
  ["사시", "巳時", "snake", "뱀"],
  ["오시", "午時", "horse", "말"],
  ["미시", "未時", "sheep", "양"],
  ["신시", "申時", "monkey", "원숭이"],
  ["유시", "酉時", "rooster", "닭"],
  ["술시", "戌時", "dog", "개"],
  ["해시", "亥時", "pig", "돼지"],
] as const;
/** 자시 = 23~01시: (시+1)/2 */
export function sichenOf(minute: number) {
  const h = Math.floor(minute / 60);
  const i = Math.floor(((h + 1) % 24) / 2);
  const [name, hanja, art, animal] = SICHEN[i] as (typeof SICHEN)[0];
  const from = (i * 2 + 23) % 24;
  return { i, name, hanja, art, animal, from, to: (from + 2) % 24 };
}
// 하늘: 해 높이에 따라 네 장(밤·새벽·낮·노을)을 시간 비율로 겹쳐 서서히 바뀜 (사용자 11/19 3차)
const SKY_KEYS: Array<[number, string]> = [
  [0, "night"],
  [4.5, "night"],
  [6, "dawn"],
  [8, "day"],
  [16, "day"],
  [18, "dusk"],
  [19.5, "night"],
  [24, "night"],
];
export function skyBlend(h: number) {
  const i = SKY_KEYS.findIndex(
    ([k], n) => h >= k && h < (SKY_KEYS[n + 1]?.[0] ?? 25),
  );
  const [h0, a] = SKY_KEYS[i] ?? [0, "night"];
  const [h1, b] = SKY_KEYS[i + 1] ?? [24, "night"];
  return { a, b, t: a === b ? 0 : (h - h0) / (h1 - h0) };
}
export const WEATHER_ICON: Record<Weather, string> = {
  맑음: "clear",
  흐림: "cloudy",
  눈: "snow",
  눈보라: "blizzard",
  한파: "coldsnap",
};

/** 해·달 길: 지평선(cy) 위 반원. 원(반지름 50) 안에 다 들어오게 r 32, 지평선은 하늘 그림의 산 능선 높이 */
const ARC = { cx: 50, cy: 72, r: 32 };

export function SeasonDial({ state }: { state: PlayState | null }) {
  if (!state) return null;
  const r = winterReport(
    state.winter,
    state.day,
    state.minute,
    state.citizens,
    inColdSnap(state),
  );
  const t = sichenOf(state.minute);
  const hour = state.minute / 60;
  // 해는 6시 왼쪽 지평선 → 12시 꼭대기 → 18시 오른쪽, 밤엔 달이 같은 길 (원 안 좌표 0~100)
  const isDay = hour >= 6 && hour < 18;
  const frac = (isDay ? hour - 6 : (hour + 6) % 24) / 12;
  const sky = skyBlend(hour);
  const orb = {
    x: ARC.cx - Math.cos(frac * Math.PI) * ARC.r,
    y: ARC.cy - Math.sin(frac * Math.PI) * ARC.r,
  };
  return (
    <section
      className="g-season"
      aria-label="절기와 날씨"
      data-testid="season-dial"
    >
      <div className="g-season__dial g-time">
        <div className="g-time__sky">
          <img src={`/ui/time/sky_${sky.a}.webp`} alt="" />
          {sky.t > 0 ? (
            <img
              src={`/ui/time/sky_${sky.b}.webp`}
              alt=""
              style={{ opacity: sky.t }}
            />
          ) : null}
          {/* 구름: 느리게 흘러감, 해·달은 구름 위에 그려 가리지 않게 */}
          <span
            className={`g-time__clouds${isDay ? "" : " is-night"}`}
            aria-hidden="true"
          />
          <span
            className={`g-time__orb ${isDay ? "is-sun" : "is-moon"}`}
            style={
              {
                left: `${orb.x}%`,
                top: `${orb.y}%`,
                // 해 높이(0 지평선 ~ 1 꼭대기): 낮을수록 붉고, 높을수록 금빛
                "--alt": Math.sin(frac * Math.PI).toFixed(3),
              } as CSSProperties
            }
            aria-hidden="true"
          />
        </div>
        <img
          className="g-time__ring"
          src={`/ui/time/ring_${t.art}.webp`}
          alt={`${t.animal} — ${t.name}`}
        />
      </div>
      <div className="g-season__text">
        <p className="g-season__term">
          <b data-testid="time-sichen">{t.name}</b>
          <span lang="zh-Hant">{t.hanja}</span>
          <small>
            {String(t.from).padStart(2, "0")}~{String(t.to).padStart(2, "0")}시
          </small>
        </p>
        <p className="g-time__term">
          <span data-testid="season-term">{r.term.name}</span>
          <span lang="zh-Hant"> {r.term.hanja}</span> · {r.term.season} ·{" "}
          {state.day}일째
        </p>
        <p className="g-season__now">
          <img
            src={`/ui/season/weather_${WEATHER_ICON[r.weather]}.png`}
            alt=""
            width={36}
            height={36}
          />
          <span data-testid="season-weather">{r.weather}</span>
          <strong data-testid="season-temp">
            {r.temp > 0 ? `+${r.temp}` : r.temp}°
          </strong>
        </p>
      </div>
    </section>
  );
}
