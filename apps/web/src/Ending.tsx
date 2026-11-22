import type { Outcome } from "@dynosty/game-core";

// 엔딩 화면 (시나리오기획서 3.2 엔딩 3종): 판정이 나면 시간이 서고 이 화면이 뜬다.
// 글은 기획서의 엔딩 이름·부제·결과 그대로. 그림은 아직 한 장을 같이 씀 (엔딩별 그림은 추가 제작).
const TEXT: Record<Outcome, { name: string; sub: string; body: string }> = {
  "ending-a": {
    name: "공존과 수호",
    sub: "이듬해, 복홀",
    body: "고려룡과 쥬신 왕실, 이웃 마을 주민들이 대등한 관계를 맺고 복홀을 함께 사는 터로 일군다.",
  },
  "ending-b": {
    name: "통제와 탈출",
    sub: "뭍의 불빛이 멀어지고",
    body: "통제와 기계로 혹한을 넘겼다. 그러나 주민 일부와 기계가 된 이들은 배를 타고 복홀을 떠난다.",
  },
  failure: {
    name: "폭정과 몰락",
    sub: "아무도 깨우지 않는 아침",
    body: "주민들이 들고일어나 고리는 지휘권을 잃고 쫓겨난다. 주인 잃은 복홀은 혹한 속에서 무너진다.",
  },
};

export function Ending({
  outcome,
  day,
  onRestart,
}: {
  outcome: Outcome;
  day: number;
  onRestart: () => void;
}) {
  const t = TEXT[outcome];
  return (
    <div
      className={`story is-ending ending${outcome === "failure" ? " is-failure" : ""}`}
      role="dialog"
      aria-label={t.name}
      style={{ backgroundImage: "url(/ui/story/ending_bg.jpg)" }}
    >
      <section className="ending__card">
        <p className="story-kicker">{t.sub}</p>
        <h2>{t.name}</h2>
        <p>{t.body}</p>
        <p className="ending__days">{day}일을 버텼다</p>
        <button type="button" className="story-next" onClick={onRestart}>
          처음부터 다시
        </button>
      </section>
    </div>
  );
}
