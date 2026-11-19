import { useState } from "react";

// 선택 화면 시안 (사용자 11/19, 프로스트펑크 사건 창 레퍼런스): 퀘스트 → 큰 화면 반으로 나눈 제안 A/B(그림 위주, 글 최소)
// 엔딩 분기는 제안하는 인물(공룡) 초상과 한마디 — 누구 말을 따를지. 시안: ?story=trade | ?story=ending
// 그림: 시나리오 삽화(팀 자산) + 코덱스 생성 제안 그림 — public/ui/story
// 얻음·잃음 문구 = 시나리오기획서 4.1 정책표(P05) · 3.1 노선 비교표 그대로. 인물 대사는 자리표시(시나리오 확정본으로 교체)
// 엔딩 노선: 5단계에 한 번만 고르고 마지막 확인을 한 번 더 (온돌 UI v0.4 「최종 통치 노선」) — 반란·피살은 미리 알리지 않음
type Side = {
  img: string;
  title: string;
  gain: string;
  loss: string;
  quote?: string;
  pick: string;
};
type Story = {
  kicker: string;
  title: string;
  line: string;
  questImg?: string;
  backdrop?: string;
  sides: [Side, Side];
};
const STORIES: Record<string, Story> = {
  trade: {
    kicker: "2단계 · 끊어진 길을 잇다",
    title: "화성에서 목재 수레가 왔다",
    line: "젖은 목재가 섞였다는 말이 돈다.",
    questImg: "/ui/story/quest_trade.jpg",
    sides: [
      {
        img: "/ui/story/offer_full.webp?v=2",
        title: "전량 검수",
        gain: "불량 수령을 막는다",
        loss: "검수 인력이 묶이고 시간이 걸린다",
        pick: "모두 풀어 본다",
      },
      {
        img: "/ui/story/offer_sample.webp?v=2",
        title: "표본 검수",
        gain: "받아들이는 속도 +50%",
        loss: "불량이 섞이면 비관이 크게 오른다",
        pick: "몇 개만 보고 들인다",
      },
    ],
  },
  ending: {
    kicker: "5단계 · 누굴 위한 복홀인가",
    title: "복홀의 길을 정할 때다",
    line: "",
    backdrop: "/ui/story/ending_bg.jpg",
    sides: [
      {
        img: "/ui/story/chungnyeong.jpg",
        title: "충녕",
        quote: "가둬 지키는 성은 오래 못 갑니다. 함께 버팁시다.",
        gain: "비관이 줄고 낙관이 오른다",
        loss: "협의와 연구에 시간·물자가 많이 든다",
        pick: "충녕을 따른다",
      },
      {
        img: "/ui/story/yangnyeong.jpg",
        title: "양녕",
        quote: "혼란엔 질서가 먼저다. 내게 맡겨라.",
        gain: "강제 집행으로 자원을 빨리 모은다",
        loss: "비관이 치솟고 치안이 위태롭다",
        pick: "양녕을 따른다",
      },
    ],
  },
};

export function StoryChoice({ id }: { id: string }) {
  const story = STORIES[id];
  const [step, setStep] = useState<"quest" | "choose" | "done">(
    story?.questImg ? "quest" : "choose",
  );
  const [picked, setPicked] = useState<string | null>(null);
  if (!story || step === "done") return null;
  if (step === "quest")
    return (
      <div className="story" role="dialog" aria-label={story.title}>
        <section className="story-quest">
          <img src={story.questImg} alt="" />
          <div className="story-quest__text">
            <p className="story-kicker">{story.kicker}</p>
            <h2>{story.title}</h2>
            <p>{story.line}</p>
            <button
              type="button"
              className="story-next"
              onClick={() => setStep("choose")}
            >
              어떻게 할까
            </button>
          </div>
        </section>
      </div>
    );
  return (
    <div
      className={`story${story.backdrop ? " is-ending" : ""}`}
      role="dialog"
      aria-label={story.title}
      style={
        story.backdrop
          ? { backgroundImage: `url(${story.backdrop})` }
          : undefined
      }
    >
      <header className="story-head">
        <p className="story-kicker">{story.kicker}</p>
        <h2>{story.title}</h2>
      </header>
      <div className="story-split">
        {story.sides.map((s) => (
          <button
            key={s.title}
            type="button"
            className={`story-side${picked === s.title ? " is-picked" : ""}`}
            onClick={() => {
              setPicked(s.title);
              if (!story.backdrop)
                window.setTimeout(() => setStep("done"), 700);
            }}
          >
            <img src={s.img} alt="" />
            <span className="story-side__shade" aria-hidden="true" />
            <span className="story-side__body">
              <b>{s.title}</b>
              {s.quote ? <q>{s.quote}</q> : null}
              <span className="story-gl">
                <span className="is-gain">
                  <i>얻음</i>
                  {s.gain}
                </span>
                <span className="is-loss">
                  <i>잃음</i>
                  {s.loss}
                </span>
              </span>
              <span className="story-pick">{s.pick}</span>
            </span>
          </button>
        ))}
      </div>
      {story.backdrop && picked ? (
        <div
          className="story-confirm"
          role="alertdialog"
          aria-label="마지막 확인"
        >
          <p>
            <b>{picked}</b>의 길로 정합니다. 이 선택은 되돌릴 수 없습니다.
          </p>
          <div>
            <button
              type="button"
              className="story-next"
              onClick={() => setStep("done")}
            >
              정한다
            </button>
            <button
              type="button"
              className="story-back"
              onClick={() => setPicked(null)}
            >
              다시 생각한다
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
