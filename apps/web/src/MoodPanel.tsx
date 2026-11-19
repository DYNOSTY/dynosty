import type { CSSProperties } from "react";

// 민심 칸 (기획서 시나리오 1.3 낙관·비관 — 프로스트펑크 희망·불만 두 막대 구조)
// 사용자 11/19: 천사·악마를 그대로 넣지 말고 그 "느낌"으로 —
// 낙관 = 한지에 스며드는 햇빛(빛 결이 흐르고, 높을수록 빛 알갱이가 위로 피어오름)
// 비관 = 번지는 먹(먹에 핏빛이 섞여 퍼지고, 90 추방에 가까울수록 먹이 막대 밖으로 배어 나와 흘러내림)
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
        <img className="mood__icon" src="/ui/kit/mood_hope.png" alt="" />
        <span className="mood__name">낙관</span>
        <span className="mood__bar" aria-hidden="true">
          <i style={{ width: `${o}%` }}>
            <span className="mood__motes" />
          </i>
        </span>
        <b>{o}</b>
      </div>
      <div
        className={`mood__row is-despair${level}`}
        style={{ "--v": dread } as CSSProperties}
      >
        <img className="mood__icon" src="/ui/kit/mood_despair.png" alt="" />
        <span className="mood__name">비관</span>
        <span className="mood__bar" aria-hidden="true">
          <i style={{ width: `${p}%` }}>
            <span className="mood__drip" />
          </i>
          {p >= 75 ? <em>{p >= 85 ? "추방 직전" : "추방 위기"}</em> : null}
        </span>
        <b>{p}</b>
      </div>
    </section>
  );
}
