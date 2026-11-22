import { CAMPAIGN_RULES } from "@dynosty/game-core";
import { useState } from "react";

// 선택 화면 시안 (사용자 11/19, 프로스트펑크 사건 창 레퍼런스): 퀘스트 → 큰 화면 반으로 나눈 제안 A/B(그림 위주, 글 최소)
// 엔딩 분기는 제안하는 인물(공룡) 초상과 한마디 — 누구 말을 따를지. 시안: ?story=trade | ?story=ending. 게임에서는 사건이 뜰 때 App이 onPick을 넘겨 고른 쪽(가 = a, 나 = b)을 계산 쪽에 전함
// 그림: 시나리오 삽화(팀 자산) + 코덱스 생성 제안 그림 — public/ui/story
// 얻음·잃음 문구 = 시나리오기획서 4.1 정책표(P05) · 3.1 노선 비교표 그대로. 인물 대사는 자리표시(시나리오 확정본으로 교체)
// 엔딩 노선: 5단계에 한 번만 고르고 마지막 확인을 한 번 더 (온돌 UI v0.4 「최종 통치 노선」) — 반란·피살은 미리 알리지 않음
// 캠페인 사건(c-…): 그림이 아직 없는 사건은 글만 있는 칸으로 뜬다. 수치는 campaign.ts CAMPAIGN_RULES(임시 값)를 그대로 보여 줌
type Side = {
  img?: string;
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
  /** 없으면 고를 것 없이 알리기만 하는 사건 */
  sides?: [Side, Side];
};
const EV = CAMPAIGN_RULES.events;
const days = (minutes: number) =>
  minutes % 1440 === 0 ? `${minutes / 1440}일` : `${minutes / 60}시간`;
const STORIES: Record<string, Story> = {
  trade: {
    kicker: "끊어진 길을 잇다",
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
  "c-lost": {
    kicker: "복홀의 첫 명령",
    title: "세 번째 정찰대가 돌아오지 않았다",
    line: "고갯길에서 산적을 만났다는 말만 전해졌다.",
    questImg: "/ui/quests/scout.jpg",
    sides: [
      {
        title: "호위대를 보낸다",
        img: "/ui/gori/face6.png",
        gain: `유품과 보고서를 되찾는다 · 비관 ${EV.lost.a.pessimism}`,
        loss: `다녀오는 데 ${days(EV.lost.a.hold)}이 걸린다`,
        pick: "찾아오게 한다",
      },
      {
        title: "추모 기록만 남긴다",
        img: "/ui/gori/face4.png",
        gain: "더 잃는 이가 없다",
        loss: `남은 가족이 등을 돌린다 · 비관 +${EV.lost.b.pessimism}`,
        pick: "이름을 적어 둔다",
      },
    ],
  },
  "c-village": {
    kicker: "끊어진 길을 잇다",
    title: "이웃 마을이 먼저 도움을 청했다",
    line: "길이 끊긴 뒤로 서로를 믿지 못한다.",
    sides: [
      {
        title: "먼저 보낸다",
        img: "/ui/gori/face2.png",
        gain: `믿음이 돌아온다 · 낙관 +${EV.village.a.optimism}`,
        loss: `풀 ${-EV.village.a.resources.RES_PLANT}을 내준다`,
        pick: "식량을 실어 보낸다",
      },
      {
        title: "거래를 미룬다",
        img: "/ui/gori/face3.png",
        gain: "곳간을 지킨다",
        loss: `인심을 잃는다 · 비관 +${EV.village.b.pessimism}`,
        pick: "지켜본다",
      },
    ],
  },
  "c-letter": {
    kicker: "붕괴하는 왕도 한양",
    title: "충녕이 봉서를 펴 보였다",
    line: "왕명은 고리를 데려오거나 없애라는 것이었다. 충녕은 그 줄을 지우고 제 이름을 적었다. “따르지 않기로 한 것도 내 결정이다.”",
    questImg: "/ui/story/chungnyeong.jpg",
  },
  "c-refugee": {
    kicker: "충녕의 남하",
    title: "길에서 굶주린 이들을 만났다",
    line: "한양을 떠난 행렬이 복홀로 내려오는 길이다.",
    sides: [
      {
        title: "함께 간다",
        img: "/ui/gori/face6.png",
        gain: `일손과 의원을 얻는다 · 낙관 +${EV.refugee.a.optimism}`,
        loss: `풀·고기·어류를 ${-EV.refugee.a.resources.RES_PLANT}씩 나눈다`,
        pick: "행렬에 받아들인다",
      },
      {
        title: "나눠 주고 떠난다",
        img: "/ui/gori/face1.png",
        gain: "식량 부담이 적다",
        loss: `풀 ${-EV.refugee.b.resources.RES_PLANT} · 비관 +${EV.refugee.b.pessimism}`,
        pick: "조금 나눠 주고 간다",
      },
    ],
  },
  "c-identity": {
    kicker: "충녕의 남하",
    title: "길목을 막은 무리가 있다",
    line: "누구의 행렬인지 묻는다.",
    sides: [
      {
        title: "공주임을 밝힌다",
        img: "/ui/story/chungnyeong.jpg",
        gain: "곧바로 지나간다",
        loss: `쫓는 눈이 붙는다 · 비관 +${EV.identity.a.pessimism}`,
        pick: "이름을 댄다",
      },
      {
        title: "숨기고 돌아간다",
        img: "/ui/gori/face3.png",
        gain: "뒤를 밟히지 않는다",
        loss: `돌아가느라 ${days(EV.identity.b.hold)}이 늦는다`,
        pick: "다른 길로 간다",
      },
    ],
  },
  ending: {
    kicker: "누굴 위한 복홀인가",
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

// 노선 선택은 시안(ending)과 같은 화면을 씀
STORIES["c-route"] = STORIES.ending as Story;

export function StoryChoice({
  id,
  onPick,
}: {
  id: string;
  onPick?: (side: "a" | "b") => void;
}) {
  const story = STORIES[id];
  const [step, setStep] = useState<"quest" | "choose" | "done">(
    story?.questImg || !story?.sides ? "quest" : "choose",
  );
  const [picked, setPicked] = useState<string | null>(null);
  if (!story || step === "done") return null;
  const sides = story.sides;
  if (step === "quest" || !sides)
    return (
      <div className="story" role="dialog" aria-label={story.title}>
        <section className={`story-quest${story.questImg ? "" : " is-plain"}`}>
          {story.questImg ? <img src={story.questImg} alt="" /> : null}
          <div className="story-quest__text">
            <p className="story-kicker">{story.kicker}</p>
            <h2>{story.title}</h2>
            <p>{story.line}</p>
            <button
              type="button"
              className="story-next"
              onClick={() => {
                if (sides) return setStep("choose");
                setStep("done");
                onPick?.("a");
              }}
            >
              {sides ? "어떻게 할까" : "알겠다"}
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
        {story.questImg || !story.line ? null : <p>{story.line}</p>}
      </header>
      <div className="story-split">
        {sides.map((s, i) => (
          <button
            key={s.title}
            type="button"
            className={`story-side${picked === s.title ? " is-picked" : ""}${s.img ? "" : " is-plain"}`}
            onClick={() => {
              setPicked(s.title);
              if (!story.backdrop)
                window.setTimeout(() => {
                  setStep("done");
                  onPick?.(i === 0 ? "a" : "b");
                }, 700);
            }}
          >
            {s.img ? <img src={s.img} alt="" /> : null}
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
              onClick={() => {
                setStep("done");
                onPick?.(picked === sides[0].title ? "a" : "b");
              }}
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
