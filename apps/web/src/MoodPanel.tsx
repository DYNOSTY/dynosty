import type { CSSProperties } from "react";

// 민심 칸 (기획서 시나리오 1.3 낙관·비관 — 프로스트펑크 희망·불만 두 막대 구조)
// 사용자 11/19: 천사·악마를 그대로 넣지 말고 그 "느낌"으로 —
// 사용자 11/20: 막대는 얇게 —
// 낙관 = 빛(높을수록 아우라가 막대 밖으로 넘쳐 파도처럼 일렁임)
// 비관 = 잿더미(무겁게 가라앉아 막대 바닥의 재가 느리게 움직이고, 위쪽으로는 불씨 기운이 돌며 불씨가 날림)
// 색만으로 알리지 않게 75부터 "추방 위기", 85부터 "추방 직전" 글자도 띄움.
export function MoodPanel({
  optimism,
  pessimism,
}: {
  optimism: number;
  pessimism: number;
}) {
  const o = Math.max(0, Math.min(100, optimism));
  const p = Math.max(0, Math.min(100, pessimism));
  const dread = Math.min(1, p / 90); // 비관은 90이 끝(추방)
  const level = p >= 85 ? " is-critical" : p >= 75 ? " is-danger" : "";
  return (
    <section
      className={`mood${level}`}
      style={{ "--dread": dread } as CSSProperties}
      aria-label={`민심: 낙관 ${o}, 비관 ${p}${p >= 75 ? " — 추방 위기" : ""}`}
    >
      <div
        className={`mood__row is-hope${o >= 70 ? " is-bright" : ""}`}
        style={{ "--v": o / 100 } as CSSProperties}
      >
        <img className="mood__icon" src="/ui/kit/mood_hope.webp" alt="" />
        <span className="mood__name">낙관</span>
        <span className="mood__bar" aria-hidden="true">
          <i style={{ width: `${o}%` }}>
            <span className="mood__wave" />
          </i>
        </span>
        <b>{o}</b>
      </div>
      <div
        className={`mood__row is-despair${level}`}
        style={{ "--v": dread } as CSSProperties}
      >
        <img className="mood__icon" src="/ui/kit/mood_despair.webp" alt="" />
        <span className="mood__name">비관</span>
        <span className="mood__bar" aria-hidden="true">
          <i style={{ width: `${p}%` }}>
            <span className="mood__sparks" />
            <span className="mood__ash">
              <i />
            </span>
          </i>
          {p >= 75 ? <em>{p >= 85 ? "추방 직전" : "추방 위기"}</em> : null}
        </span>
        <b>{p}</b>
      </div>
    </section>
  );
}
