import {
  DAYS_PER_TERM,
  type PlayState,
  type Weather,
  winterReport,
} from "@dynosty/game-core";

// 절기 시계(실록 모티브) + 기온·날씨·내일 예보. 24칸 테두리는 고정, 지금 절기 칸을 가리키는 바늘이 하루 동안 다음 칸으로 움직임.
// 그림: 코덱스 생성 (단청 24칸 테두리 · 계절 수묵화 4장 · 날씨 아이콘 5종) — public/ui/season
const SEASON_ART = {
  봄: "spring",
  여름: "summer",
  가을: "autumn",
  겨울: "winter",
} as const;
export const WEATHER_ICON: Record<Weather, string> = {
  맑음: "clear",
  흐림: "cloudy",
  눈: "snow",
  눈보라: "blizzard",
  한파: "coldsnap",
};
// 기획 v0.4 「날씨와 온돌」 칸의 말투: "맑을 듯합니다"
const TOMORROW: Record<Weather, string> = {
  맑음: "내일은 맑을 듯합니다",
  흐림: "내일은 흐릴 듯합니다",
  눈: "내일은 눈이 올 듯합니다",
  눈보라: "내일은 눈보라가 몰아칠 듯합니다",
  한파: "내일은 한파가 올 듯합니다 — 연료를 비축하세요",
};

export function SeasonDial({ state }: { state: PlayState | null }) {
  if (!state) return null;
  const r = winterReport(state.winter, state.day, state.minute, state.citizens);
  const inTerm =
    (((state.day - 1) % DAYS_PER_TERM) * 1440 + state.minute) /
    (DAYS_PER_TERM * 1440);
  const angle = (r.term.index + inTerm) * 15; // 한 칸 15°, 입춘이 맨 위
  const tomorrow = r.forecast[0];
  return (
    <section
      className="g-season"
      aria-label="절기와 날씨"
      data-testid="season-dial"
    >
      <div className="g-season__dial">
        <img
          className="g-season__paint"
          src={`/ui/season/season_${SEASON_ART[r.term.season]}.webp`}
          alt=""
        />
        <img
          className="g-season__ring"
          src="/ui/season/season_dial_ring.webp"
          alt=""
        />
        <span
          className="g-season__hand"
          style={{ transform: `rotate(${angle}deg)` }}
          aria-hidden="true"
        />
      </div>
      <div className="g-season__text">
        <p className="g-season__term">
          <b data-testid="season-term">{r.term.name}</b>
          <span lang="zh-Hant">{r.term.hanja}</span>
          <small>{r.term.season}</small>
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
        {tomorrow ? (
          <p className="g-season__next">
            {TOMORROW[tomorrow.weather]} (새벽 {tomorrow.low}°)
          </p>
        ) : null}
      </div>
    </section>
  );
}
