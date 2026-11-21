import {
  BUILDING_RULES,
  CHAPTERS,
  campaignOf,
  canPay,
  capitalRoad,
  convoyReady,
  emergencyRation,
  foodWarnings,
  GAME_RULES,
  lostPatrol,
  minutesUntilCoup,
  recoveryCrew,
  returnedScouts,
  SCOUT_SITES,
  SETTLEMENTS,
  type TimberState,
} from "@dynosty/game-core";

export const PATROL_NAMES = ["돌쇠", "여울쇠", "덕순이", "길룡"] as const;
export const PATROL_REQUESTS = [
  "공자님, 어제 받은 풀은 항아리 바닥에 벌써 물이 고였습니다. 마른 것부터 먹이라 하셨지요? 오늘만큼은 젖은 단부터 풀게 해 주십시오.",
  "공자님, 물고기는 제가 잡을게요. 나루에 불 하나만 남겨 주세요. 밤배가 들어오다 얼음턱에 걸리면 여기선 손 흔드는 것도 안 보여요.",
  "공자님, 우리 애는 고기를 삼키질 못해요. 앞집 애는 풀을 못 먹고요. 둘이 그릇을 바꿨다고 장부에 두 번 받아 간 걸로 적지는 말아 주세요.",
  "공자님, 왼발을 접질렸어도 고삐는 잡습니다. 오늘 하루만 수레 위에서 일하게 해 주십시오. 제 줄을 아예 지워 버리진 마시고요.",
] as const;
type Choice = { action: string; label: string; disabled?: boolean };
type Line = [speaker: string, words: string];
const victoryQuotes: Line[] = [
  [
    "공자 · 『논어』 옹야",
    "어진 이는 자기가 서고자 하면 남도 서게 한다. — 己欲立而立人",
  ],
  [
    "맹자 · 『맹자』 공손추 하",
    "하늘이 준 때도 땅의 이로움만 못하고, 땅의 이로움도 서로 마음을 모으는 것만 못하다.",
  ],
  [
    "맹자 · 『맹자』 양혜왕 상",
    "내 집 어른을 공경하는 마음을 남의 집 어른에게까지 미치게 하고, 내 집 아이를 아끼는 마음을 남의 집 아이에게까지 미치게 하라.",
  ],
  ["맹자 · 『맹자』 공손추 하", "도를 따르는 이에게는 돕는 이가 많다."],
  [
    "맹자 · 『맹자』 진심 상",
    "제 식구를 사랑하는 마음이 백성에게 미치고, 백성을 어질게 대하는 마음이 뭇 생명에게 미친다.",
  ],
  [
    "붓다 · 『법구경』 제331게",
    "어려운 일이 닥쳤을 때 벗이 있다는 것은 기쁜 일이다.",
  ],
  [
    "붓다 · 『법구경』 제122게",
    "물방울이 떨어져 물독을 채우듯, 슬기로운 이는 조금씩 선을 쌓아 선으로 가득해진다.",
  ],
  ["붓다 · 『법구경』 제224게", "가진 것이 적어도 청하는 이에게 나누어 주라."],
  [
    "붓다 · 『법구경』 제223게",
    "성냄은 성내지 않음으로 이기고, 인색함은 베풂으로 이겨라.",
  ],
  [
    "붓다 · 『법구경』 제194게",
    "함께 수행하는 이들이 화목한 것은 기쁜 일이다.",
  ],
];
export interface ScenePage {
  key: string;
  title: string;
  music: string;
  clip?: string;
  resultQuote?: Line;
  nextStage?: number | "escort";
  frames?: { image: string; words: string }[];
  illustration?: string;
  laterIllustration?: { from: number; image: string; alt: string };
  lineIllustration?: { at: number; image: string; alt: string };
  lines: Line[];
  choices: Choice[];
  auto: boolean;
  goal: string;
}
export function gatheringRumor(s: TimberState): Line | undefined {
  if (s.campaign?.beat !== "forecast") return;
  const until = minutesUntilCoup(s);
  if (until <= 900)
    return [
      "영실",
      "관측패를 모두 맞춰 보았습니다. 닷새 뒤 혹한이 복홀에 닿습니다.",
    ];
  const { optimism, pessimism } = s.world;
  const capped = s.rationPolicy === "cap";
  if (pessimism > optimism || (capped && pessimism === optimism)) return;
  if (until <= 2340)
    return [
      "달이",
      "그 빈 창고 있지. 밤에 지나는데 문틈으로 불빛이 새더라. 안에서 내 발소리를 들었나 봐. 내가 문 앞을 지나자마자 불빛이 쏙 가려졌어.",
    ];
  if (until <= 3780)
    return [
      "나르미",
      capped
        ? "배급을 마치는데 아주머니가 제 소매를 잡으셨어요. 오늘 저녁엔 빈 창고 쪽으로 혼자 다니지 말래요. 이유는 안 알려 주셨어요."
        : "해 질 무렵에 푸른 보자기 맨 아주머니를 봤어요. 빈 창고 앞에서 뒤를 돌아보시더니, 뒤따라오던 이들한테 문을 잡아 주셨어요.",
    ];
}
export function moraleAdvice(s: TimberState): Line | undefined {
  const { pessimism, minute } = s.world;
  const limits = GAME_RULES.endings;
  if (s.campaign?.ending || pessimism < limits.concernPessimism) return;
  const day = minute >= 360 && minute < 1080;
  if (s.campaign?.beat === "capital") {
    const words =
      pessimism > limits.urgentPessimism
        ? "전하, 군량을 나르던 수레까지 멈췄습니다. 지금 배급령을 고쳐 주십시오."
        : pessimism > limits.warningPessimism
          ? "전하, 남문 교대에 응한 이가 없습니다. 성안의 청을 들어 주십시오."
          : "전하, 구호소 앞에 빈 그릇을 놓고 그냥 돌아가는 이들이 늘었습니다.";
    return [day ? "나르미" : "달이", words];
  }
  if (pessimism > limits.urgentPessimism)
    return day
      ? [
          "나르미",
          "고리야, 창고지기마저 열쇠를 내려놨어요. 지금 배급령을 고쳐 주세요. 제가 사람들과 여기서 기다릴게요.",
        ]
      : [
          "달이",
          "고리야, 문 좀 열어. 망을 보던 이들까지 빗장을 내려놓고 왔어. 날 밝을 때까지 기다릴 수 없어. 오늘 밤 배급령부터 바꾸자.",
        ];
  if (pessimism > limits.warningPessimism)
    return day
      ? [
          "나르미",
          "배식 줄에서 다툼이 났어요. 내일도 같은 집이 빈 그릇을 들고 돌아가면 제가 무슨 낯으로 줄을 세우겠어요? 오늘 그 집들 얘기를 들어 주세요.",
        ]
      : [
          "달이",
          "고리야, 교대 종이 울렸는데도 망루가 비었어. 사람들이 네 대답을 들을 때까지는 올라가지 않겠대. 나랑 지금 가 보자.",
        ];
  return day
    ? [
        "나르미",
        "고리야, 오늘은 누가 말을 꺼내려다 곁사람 눈치부터 보더라고요. 무슨 일인지 걱정돼요. 배식 끝날 때 저랑 잠깐 들러 주실래요?",
      ]
    : [
        "달이",
        "고리야, 우물가에서 늘 떠들던 이들이 오늘은 내가 가니까 입을 다물더라. 무슨 속앓이를 하는지 걱정돼.",
      ];
}

export function villageAdvice(
  s: TimberState,
  daylight: boolean,
  merchant?: string,
): string {
  const c = campaignOf(s);
  if (c.beat === "capital")
    return daylight
      ? "전하, 의원이 밤새 돌본 이들의 명부를 올렸습니다. 남문으로 올 짐수레도 장부와 대조하고 있습니다."
      : "전하, 성벽 아래서 울음소리가 납니다. 성안에서 붉은 눈을 봤다는 골목에는 벌써 포졸이 갔습니다.";
  if (merchant)
    return daylight
      ? `고리야, 교역소에 상인이 왔어요. ${merchant}의 짐을 같이 보실래요?`
      : `교역소에 불이 켜졌어. ${merchant}도 막 도착했대. 무얼 싣고 왔는지 보러 가자.`;
  const report = returnedScouts(s).find(([id]) => !c.reports.includes(id));
  if (c.beat === "patrol" && report) {
    if (report[0] === lostPatrol(s))
      return daylight
        ? "성문에서 급한 전갈이 왔어요. 셋째 조 소식이래요. 같이 들으러 가요."
        : "망을 보던 길룡이 왔어. 셋째 조 소식은 네게 먼저 전하겠대.";
    return daylight
      ? "정찰대가 막 돌아왔어요. 성문에서 기다린대요. 보고를 들어 보실래요?"
      : "정찰대가 돌아왔어. 짐도 내려놓기 전에 널 찾더라. 가서 얘길 들어 보자.";
  }
  if (s.mission === "register-policy" || (s.scoutVisitors ?? 0) > 0)
    return daylight
      ? "마을 입구에 새로 온 이들이 있어요. 성문 표식을 눌러 누구와 함께 왔는지 들어 보세요."
      : "성문 밖에서 사람 목소리가 나. 새로 온 이들인가 봐. 입구에 가서 만나 보자.";
  if (c.recoveryDue != null && c.recoveryDue > s.elapsed)
    return daylight
      ? "두 분이 썰매를 끌고 나갔어요. 돌아올 때까진 남은 일손으로 오늘 몫을 마련해야 해요."
      : "수습대가 돌아오면 성문에서 불러 줄게. 그동안은 여기 있는 이들끼리 일하자.";
  const { optimism, pessimism } = s.world;
  if (
    pessimism < GAME_RULES.endings.concernPessimism &&
    optimism >= 65 &&
    optimism - pessimism >= 25
  )
    return daylight
      ? "고리야, 네가 배식 줄에서 끝까지 얘길 들어 주셨잖아요. 오늘은 주민들이 먼저 곁에 자리를 내주네요. 잘하셨어요."
      : "오늘 사람들이 네 곁으로 의자를 당겨 앉더라. 고리야, 네가 한 일이야. 잘했어.";
  if (s.rebuilding && !s.restaurantBuilt)
    return daylight
      ? "솥은 제가 씻어 놓았어요. 건설에서 공동 식당 터부터 잡아 주세요."
      : "솥단지는 무사해. 공동 식당부터 다시 짓자.";
  if (
    s.rebuilding &&
    s.openingFight &&
    !s.town.facilities.some((f) => f.kind === "hospital")
  )
    return daylight
      ? "배식 줄에서 둘이 엉켜 넘어졌어요. 한 분은 발을 딛지도 못해요. 병원을 세워 돌봐 드려요."
      : "다친 둘을 내 방에 눕혔어. 상처를 돌볼 병원이 있어야겠어.";
  if (
    s.rebuilding &&
    s.homes.length <= 2 &&
    !s.town.orders.some((o) => o.kind === "home")
  )
    return daylight
      ? "오늘도 문밖에서 잘 분들이 있어요. 온돌 둥지를 더 지어 주세요."
      : "둘이 몸을 포개도 아랫목이 모자라. 둥지를 더 짓자.";
  if (
    s.rebuilding &&
    s.woodSpent > 0 &&
    !s.logging.built &&
    !s.loggingSites.some((site) => site.built) &&
    !s.town.facilities.some((f) => f.kind === "logging")
  )
    return daylight
      ? "식당과 둥지에 들보를 쓰고 나니 목재 더미가 줄었어요. 숲 가까이에 제재소를 지어 둘까요?"
      : "내일 쓸 재목도 켜야지. 숲가에 제재소를 세우자.";
  if (
    s.rebuilding &&
    s.openingFight &&
    s.town.facilities.some((f) => f.kind === "hospital") &&
    (s.chapter ?? 1) === 1
  )
    return daylight
      ? "식당과 병원, 제재소에는 일할 분이 있어야 해요. 공사를 마친 분들이 남아 일해요. 빈자리는 건물에서 채워 주세요."
      : "공사를 끝낸 이들이 그대로 일을 맡았어. 식당이며 병원이며 제재소에 빈자리가 없는지 봐 줘.";
  const shortage = foodWarnings(s.world)[0];
  if (shortage) {
    const kind = (
      { RES_PLANT: "farm", RES_MEAT: "ranch", RES_FISH: "fishery" } as const
    )[shortage.id];
    const building = BUILDING_RULES[kind].name;
    const advice = s.town.facilities.some((f) => f.kind === kind)
      ? `${building}에 일손이 모자라는지 살펴`
      : s.town.orders.some((o) => o.kind === kind)
        ? `${building} 공사가 어디까지 됐는지 살펴`
        : `건설에서 ${building} 지을 자리를 골라`;
    return daylight
      ? `오늘 쓸 ${shortage.name} 몫이 빠듯해요. ${advice}볼까요?`
      : `다음 끼니엔 ${shortage.name} 몫이 모자라겠어. ${advice}보자.`;
  }
  if (
    !s.restaurantBuilt &&
    s.construction?.kind !== "restaurant" &&
    !s.town.orders.some((o) => o.kind === "restaurant")
  )
    return daylight
      ? "그릇을 들고 선 분들이 앉을 데가 없어요. 아래 ‘건설’을 누르면 공동 식당이 있어요. 터를 잡아 볼까요?"
      : "저녁을 서서 먹는 집이 많아. 아래 ‘건설’에서 공동 식당을 골라 보자.";
  if (s.town.cold)
    return daylight
      ? "처마 고드름이 문턱에 닿았어요. 배식 줄을 불 가까이로 옮겨요."
      : "불이 꺼진 집부터 돌고 올게. 젖은 이불 덮고도 괜찮다는 집이 꼭 하나씩 있거든.";
  return daylight
    ? "아버님 지도에도 물길 너머는 비어 있어요. 오늘은 어느 길로 사람을 보내 볼까요?"
    : "등불이 하나둘 켜지네. 주민 명단을 펴 봐. 오늘 잘 곳을 찾은 이들부터 같이 짚어 보자.";
}

export function campaignPage(s: TimberState): ScenePage {
  const c = campaignOf(s),
    chapter = s.chapter ?? 1,
    age = s.elapsed - c.since,
    days = Math.floor(age / 1440);
  const found = returnedScouts(s);
  const quote =
    victoryQuotes[c.victoryQuotes?.[chapter - 1] ?? 0] ?? victoryQuotes[0]!;
  const page: ScenePage = {
    key: c.beat,
    title: CHAPTERS[chapter - 1]!,
    music: "01",
    lines: [],
    choices: [],
    auto: true,
    goal: "",
  };
  const line = (who: string, words: string) => page.lines.push([who, words]);
  const choice = (action: string, label: string, disabled = false) =>
    page.choices.push({ action, label, disabled });
  const complete = (next: string, action = "next") => {
    page.nextStage = chapter + 1;
    page.title = chapter + "단계 완료 · " + CHAPTERS[chapter - 1];
    page.goal = chapter + "단계 완료";
    if (chapter !== 3)
      page.frames =
        chapter === 1
          ? [
              {
                image: "end-1",
                words:
                  "달이야, 저기 좀 봐. 예전 장터만큼은 아니어도 오늘은 저녁 연기가 골목 끝까지 이어져. 고리가 다시 살린 마을이야.",
              },
            ]
          : chapter === 2
            ? [
                {
                  image: "end-2a",
                  words:
                    "첫 거래 때 서로 달리 쓰던 되를 정찰대원이 나란히 놓았다. 이번에는 양쪽 짐꾼이 같은 눈금에서 고개를 끄덕였다.",
                },
                {
                  image: "end-2b",
                  words:
                    "빈 수레를 끌고 나갔던 이들이 짐을 싣고 돌아왔다. 고리야, 저 환호 들려요? 닫힌 길을 다시 잇겠다는 약속을 지키셨어요.",
                },
              ]
            : [
                {
                  image: "end-4",
                  words:
                    "충녕이 풀 접시를 건네자 맞은편에서 따뜻한 생선 그릇이 돌아왔다. 영실과 고리, 나르미와 달이도 자리를 당겨 앉았다. 한 광장에서 저마다 먹을 것을 찾는 저녁을, 당신이 지켜냈습니다.",
                },
              ];
    choice(action, next);
  };
  switch (c.beat) {
    case "opening":
      page.nextStage = 1;
      page.title = "별이 진 뒤, 복홀";
      page.clip = "opening";
      page.music = "00";
      line(
        "나르미",
        "운석이 떨어지기 전엔 고려 강가에 장이 섰대요. 아버진 그때 들은 소리를 아직도 흉내 내셨어요. 빈 수레가 다리를 건너는 소리요.",
      );
      line(
        "달이",
        "지금 다리 건너오는 건 쥬신 전령이야. 고른 어른 방 앞에서부터 갓을 벗고 오더라. 고리야, 내가 곁에 있어 줄까?",
      );
      line("고리", "들어가자. 아버지 방에 불은 켜 두고.");
      page.goal =
        "난이도를 고르세요. 불안이 한계에 닿으면 보통은 하루 동안 수습할 수 있고, 어려움은 즉시 추방됩니다.";
      choice("next", "보통 · 복홀 성문으로");
      choice("hard", "어려움 · 복홀 성문으로");
      break;
    case "departure":
      page.title = "귀족들이 출문을 청했다";
      page.clip = "one";
      page.music = "09";
      page.goal = `출문 전 · 주민 ${s.residents.length}명 · 자원별 10,000`;
      line(
        "가솔을 이끄는 귀족",
        "상중에 하직을 고하오니 면목이 없소이다. 허나 고른 공을 시해한 자가 그 처소 문턱을 어찌 넘었는지, 아직 아무도 모르지 않소. 오늘 밤 우리 집 아이들의 문 앞에는 누가 서 주겠소?",
      );
      line(
        "고리",
        "내가 서겠소. 아버지의 인장을 받은 뜻이 그거요. 날이 밝을 때까지만 수레를 붙잡아 주시오.",
      );
      line(
        "노귀족",
        "공자님께서는 밤새 그 문을 지키실 분이오. 그래서 더 두렵소. 동문에서도 살려 달라 부르면, 어느 문을 비우실 테요?",
      );
      line(
        "가솔을 이끄는 귀족",
        "운석이 고려의 지붕을 앗아 갔을 때 단의 깃발 아래 든 집들은 족보라도 건졌소이다. 쥬신 조정에 문서를 올릴 길이 있을 적에 가겠소. 가솔과 사창의 짐을 내주시오.",
      );
      page.lineIllustration = {
        at: page.lines.length,
        image: "mokjin-exodus",
        alt: "고른 사후, 복홀을 떠나는 귀족들의 수레 사이로 걷는 목진",
      };
      line(
        "달이",
        "고리야, 저 수레 밑을 봐. 고른 어른이 겨울 몫이라고 적어 놓은 독까지 실었어.",
      );
      line(
        "고리",
        "문을 열어라. 수레마다 누가 타고 무엇을 가져가는지 적어 두어라. 남을 사람은 이리로 오시오. 여기서는 누구도 억지로 데려가지 못하오.",
      );
      line(
        "돌쇠",
        "공자님! 식당 처마에 불이 붙었습니다. 불씨가 둥지 지붕으로 넘어갑니다!",
      );
      choice("leave", "성문을 열고 남은 장부 확인");
      break;
    case "after":
      page.title = "마지막 수레가 나간 자리";
      page.goal = "출문 뒤 · 주민 60명 · 자원별 1,000";
      line(
        "나르미",
        "장부 끝까지 이름을 불렀어요. 예순 분이 대답했어요. 곳간도 칸마다 천씩 남았고요. 고리야, 그만 물동이 놓으세요. 손이 다 까졌어요.",
      );
      line(
        "돌쇠",
        "공자님, 문빗장을 다시 걸까요? 저잣거리의 큰 수레들은 벌써 귀족들의 뒤를 따라갔습니다.",
      );
      line(
        "고리",
        "작은 문은 열어 둡시다. 등짐 하나 진 장꾼이라도 추위에 밖에서 기다리게 할 순 없소.",
      );
      line(
        "달이",
        "큰 상단은 고른 어른의 인장을 보고 외상을 줬어. 내일부터는 우리 얼굴을 보고 거래할 사람을 한 명씩 다시 만나야 해.",
      );
      line(
        "달이",
        "고리야, 저 양팔저울을 봐. 네가 하는 일 하나하나에 저울이 움직여. 여기 남은 사람들 마음을 얻어 줘.",
      );
      line(
        "달이",
        "불 끄느라 네 얼굴도 온통 검댕이야. 이리 와, 좀 닦자. 새벽까지 물 나른 이들이 아직 여기 있어. 우리도 같이 다시 지으면 돼.",
      );
      line(
        "나르미",
        "식당 지붕이 내려앉았어요. 솥은 건졌으니 식당부터 다시 지어요. 오늘 저녁엔 다들 앉아서 따뜻한 걸 먹게요.",
      );
      line(
        "달이",
        "온돌에 불이 드는 둥지도 둘뿐이야. 오늘 밤 지붕 아래서 잘 자리도 같이 마련하자.",
      );
      choice("next", "남은 예순 명과 시작");
      break;
    case "patrol": {
      const id = found.find(([id]) => !c.reports.includes(id))?.[0];
      page.goal = `귀환 보고 ${c.reports.length} / 5`;
      if (!id) {
        page.auto = false;
        if (c.reports.length === 5) {
          page.key = "patrol-complete";
          page.auto = true;
          line(
            "나르미",
            "마지막 수레에서 내린 분이 고른 어른의 장부를 알아보셨어요. 귀족들을 따라갔다 돌아온 집이에요. 이번엔 우리가 이야기를 들으러 갈까요?",
          );
          complete("2단계로 넘어갈까요? · 다섯 마을로");
        } else {
          line(
            "고리",
            "나갈 때 적은 이름은 돌아왔을 때에도 불러다오. 빈자리가 있으면 내게 먼저 알려 주고.",
          );
          line(
            "여울쇠",
            "나루부터 둘러볼까요? 물이 흐르는 곳엔 짐승도 사람도 모이니까요.",
          );
          page.music = "05";
        }
        break;
      }
      const site = SCOUT_SITES.find((q) => q.id === id)!;
      const idx = c.patrolOrder.indexOf(id);
      page.key = "report-" + id;
      page.title = site.name + " · 정찰 결과";
      page.music =
        id === "reed"
          ? "06"
          : id === "forge"
            ? "07"
            : id === "hunt"
              ? "12"
              : "05";
      if (id === lostPatrol(s)) {
        page.illustration = "patrol-report";
        page.music = "12";
        line(
          "길룡",
          "밤새 눈이 들이쳤습니다. 둘이 끝내 눈을 뜨지 않더군요. 버드나무 아래 눕히고 돌을 얹어 뒀습니다. 다시 가면 찾을 수 있습니다.",
        );
        line(
          "달이",
          "썰매를 끌려면 둘은 가야 해. 둘이 돌아올 때까지는 여기 남은 이들끼리 일해야 하고.",
        );
        line(
          "고리",
          "길룡아, 손부터 녹여라. 그 집 식구들한테는 나도 함께 가마.",
        );
        choice(
          "recover",
          "주민 둘에게 고기 6을 들려 두 사람을 데려오기",
          !canPay(s, "RES_MEAT", 6) || recoveryCrew(s).length < 2,
        );
        choice("remember", "추가 파견을 멈추고 두 이름을 추모 장부에");
        break;
      }
      const who = PATROL_NAMES[Math.max(0, idx) % 4]!;
      const reports: Record<string, Line[]> = {
        reed: [
          [
            who,
            "나루 건너 마을에선 생선을 나무와 바꾸겠다 합니다. 돌아오는데 나룻배 밑에서 셋이 나왔습니다. 길을 떠돌다 불빛을 보고 배를 두드렸대요. 한 분은 발을 못 디뎌서 제가 업었습니다. 문간에서 기다립니다.",
          ],
          [
            "달이",
            "젖은 옷부터 갈아입혀. 받아들일지 결정하기 전에도 몸은 녹일 수 있잖아.",
          ],
        ],
        pine: [
          [
            who,
            "솔숲에 작은 솥이 걸려 있었습니다. 불씨는 꺼졌고 곁에 누운 두 분은 얼어 숨졌습니다. 가져온 건 솥 손잡이에 묶였던 이름표입니다.",
          ],
          [
            "고리",
            "적어 둡시다. 누가 이들을 찾아오거든 어느 나무 아래 모셨는지 알려줄 수 있게.",
          ],
        ],
        hunt: [
          [
            who,
            "해가 지자 숲에서 눈 둘이 벌겋게 빛났습니다. 사냥막 들보를 이마로 받아 꺾더군요. 바로 옆에 제 새끼가 울고 있는데도 돌아보질 않았습니다.",
          ],
          [
            "나르미",
            "운석이 떨어지기 전 장부에는 이런 얘기가 없어요. 아버님이 첫 기록 옆에 ‘변종’이라고 쓰셨네요. 오늘 밤 문지기에게도 알려야겠어요.",
          ],
        ],
        forge: [
          [
            who,
            "제철터 굴뚝에 연기가 납니다. 산적일까 봐 한참 기다렸지요. 마침내 대장장이 하나가 나와 풀 한 묶음에 쇠를 얼마나 주면 되느냐 묻더군요.",
          ],
          [
            "고리",
            "다음에는 빈손으로 보내지 맙시다. 저쪽에서 먼저 말을 건 용기도 적어 두시오.",
          ],
        ],
        record: [
          [
            who,
            "무너진 부엌 바닥에서 목간을 건졌습니다. 한쪽에 고려의 창고 인장, 다른 쪽엔 고른 어른 글씨가 있어요. 마른 땔감과 젖은 땔감을 따로 세셨더군요.",
          ],
          [
            "나르미",
            "이게 아버님의 장부였군요. 빈칸 하나를 두셨어요. 다음 겨울 몫은 우리가 적으라는 것처럼.",
          ],
        ],
      };
      page.lines = reports[id]!;
      if (c.reports.length === 4)
        line(
          "달이",
          "뒤따라온 수레도 우리 편이야. 귀족들을 따라 떠났던 집에서 이제야 돌아올 마음을 냈대.",
        );
      page.goal = site.find;
      choice("report:" + id, "보고를 장부에 적기");
      break;
    }
    case "roads": {
      page.music = "08";
      page.goal = `교섭 회복 ${c.treaties.length} / 5`;
      page.key = "roads-" + c.treaties.length;
      const receipt = c.treaties.at(-1);
      if (receipt !== undefined) {
        const replies: Line[] = [
          [
            "당성의 목수",
            "들보가 제자리에 앉았습니다. 우리 막내가 빈 수레를 끌고 맨 먼저 건넜소. 다음 짐부터는 물을 돌아가지 않아도 됩니다.",
          ],
          [
            "압해의 되장이",
            "들고 오신 추를 우리 저울에 달아 봤어요. 한 되씩 빈다던 곡식이 여기 있었네요. 짐꾼한테는 내가 직접 사과하겠습니다.",
          ],
          [
            "한다사의 솥지기",
            "갚을 날을 적는 칸이 비어 있기에 잘못 온 줄 알았습니다. 오늘 쑨 죽은 애들부터 먹였습니다. 그 말은 꼭 전해 주세요.",
          ],
          [
            "새금의 화부",
            "새 돌을 놓고 물 한 솥을 다 끓였습니다. 금 간 틈으로 물이 새지 않더군요. 이번엔 받았다고 제 손으로 찍습니다.",
          ],
          [
            "굴아화의 수레장이",
            "쇳덩이를 싣고 자갈길을 세 번이나 돌았소. 덜컹거려도 짐이 쏠리지 않았지. 다음 장에 내 수레로 가리다.",
          ],
        ];
        page.lines.push(replies[receipt]!);
      }
      if (c.treaties.length === 2) {
        page.clip = "two";
        page.title = "한 짐에 매달린 두 화물표";
        line(
          "달이",
          "끈 밑에 손 넣어 봐. 겉에는 군량 창고, 속에는 한다사 구휼소라고 적혔어. 사람들이 도둑으로 몬 짐꾼은 글을 읽지도 못해.",
        );
        line(
          "고리",
          "두 표를 포개서 보내시오. 잘못 받은 곳도, 못 받은 곳도 같이 보게.",
        );
      } else if (c.treaties.length === 5) {
        complete("3단계로 넘어갈까요? · 도성으로");
        page.lineIllustration = {
          at: page.lines.length,
          image: "mokjin-return",
          alt: "다친 목진이 정찰대원의 어깨에 기대 복홀 성문으로 돌아온다.",
        };
        line(
          "정찰대원",
          "공자님, 돌아오는 길에 바람 막으려고 수레바퀴 뒤에 웅크린 이를 봤습니다. 가까이 가 보니 목진 공이었습니다. 귀족들 나가던 날 함께 성문을 나섰다는데, 그 뒤론 가는 데마다 문전에서 쫓겨났답니다. 여기까지 저희가 부축해 왔습니다.",
        );
        line(
          "고리",
          "고생했소. 의원에 자리를 마련해 뒀으니 그리로 모셔 주시오.",
        );
        line(
          "의원",
          "이쪽에 누이세요. 발에 감은 천이 얼어붙었어요. 더운물부터 좀 주세요.",
        );
        break;
      } else if (!c.treaties.length) {
        line(
          "백초 아범",
          "예전엔 이 길로 수레가 열 대씩 다녔소. 이젠 내 지게 하나가 전부요. 공자님, 이번에는 받을 집 이름을 내 앞에서 적어 주시겠소?",
        );
        line(
          "나르미",
          "당성은 들보가 먼저고, 새금은 지난번 깨져 온 화덕돌을 기다려요. 먼저 지킬 수 있는 약속 하나를 골라요.",
        );
      }
      if (c.caravan)
        line(
          "달이",
          `${SETTLEMENTS[c.caravan.village]!.name}에 간 수레는 아직이야. 돌아오는 대로 여기서 짐꾼들한테 무슨 일이 있었는지 물어볼게.`,
        );
      for (const [i, v] of SETTLEMENTS.entries())
        if (!c.treaties.includes(i))
          choice(
            "send:" + i,
            `${v.name} · ${v.request} (${GAME_RULES.resources[v.resource].name} ${v.amount}, ${v.hours}시간)`,
            !!c.caravan || !canPay(s, v.resource, v.amount),
          );
      page.auto = !c.caravan;
      break;
    }
    case "capital": {
      page.title = "쥬신 왕의 어전 · 도성 남문";
      page.music = "10";
      if (c.relief && convoyReady(s)) {
        page.key = "capital-ready";
        page.nextStage = "escort";
        page.title = "3단계 완료 · 남문에 남은 왕";
        page.auto = true;
        page.goal = "3단계 완료";
        line(
          "수문장",
          "전하, 북문이 뚫렸습니다. 붉은 눈의 변종들이 문루를 무너뜨리자 서문으로 가는 길까지 끊겼습니다. 파수 종을 쳐도 대답하는 초소가 없습니다.",
        );
        page.frames = [
          { image: "end-3a", words: "" },
          { image: "end-3b", words: "" },
          { image: "end-3c", words: "" },
          {
            image: "end-3d",
            words:
              "끝내 왕의 등이 보이지 않았다. 당신이 남문을 지킨 그 짧은 동안, 아들과 백성은 다음 고개로 넘어갔습니다. 왕으로서 끝까지 책임을 다해 주셨습니다.",
          },
        ];
        choice("next", "먼저 남하한 충녕의 소식");
        break;
      }
      const road = capitalRoad(s);
      if (s.bokhol && !c.relief) {
        line(
          "호조 관리",
          "전하, 호적에 오른 백성이 꼭 천입니다. 남문에선 벌써 아침상을 물렸고, 동쪽 재배소에선 지난가을 갈무리한 종자가 싹을 틔웠습니다.",
        );
        line(
          "왕",
          "평소의 배급은 그대로 시행하라. 각 관아는 지금 손에 있는 것으로 어느 일까지 맡을 수 있는지 아뢰라.",
        );
      }
      page.goal = `남문 피난 명부 ${c.evacuees ?? 0}/200명 · 교역로 ${road === "closed" ? "두절" : road === "slow" ? "지연" : "통행 가능"} · 앓거나 다친 주민 ${s.residents.filter((r) => r.health !== "healthy" && r.health !== "dead").length}명 · 성안 변종 습격 부상 ${(s.world.citizenEvents ?? []).filter((id) => id.startsWith("mutant-") && Number(id.split("-").at(-1)) >= c.since).length}명`;
      line(
        "수문장",
        "전하, 북문 밖에서 변종이 성벽을 긁고 있습니다. 안에서도 하나가 눈을 붉히자 순라 돌던 포졸들이 그 골목으로 달려갔습니다.",
      );
      line(
        "왕",
        "포졸에게는 내 답을 기다리지 말라 일러라. 의원은 그사이 누가 다쳤는지 살피고, 동문과 서문에서는 마지막으로 들어온 수레가 언제였는지 알아보라.",
      );
      line(
        "호조 관리",
        "전하, 어제 땔감을 들인 집이 오늘 또 장작을 구합니다. 아랫목까지 식으니 새끼들이 잠을 못 잔다 합니다.",
      );
      if (!c.relief) {
        choice("report", "남문의 장부를 받아 도성을 살핀다");
      } else {
        page.auto = false;
        line(
          "의원",
          "성문에서 다친 이들을 돌보고 돌아오니 동상 입은 식구들이 처마 밑까지 줄을 섰습니다.",
        );
        line(
          "수문장",
          road === "closed"
            ? "전하, 고갯길이 막혔습니다. 마지막 수레도 돌아섰습니다."
            : road === "slow"
              ? "눈이 수레바퀴를 덮습니다. 해 뜰 때 보인 짐이 아직 고개를 못 넘었습니다."
              : "동문과 서문은 아직 열려 있습니다. 들어오는 짐부터 세겠습니다.",
        );
      }
      break;
    }
    case "seal":
      page.clip = "three";
      page.music = "12";
      page.title = "두 번 접힌 봉서";
      page.lineIllustration = {
        at: 0,
        image: "mokjin-night",
        alt: "밤중에 붕대를 감은 목진이 홀로 복홀의 작은 성문을 빠져나간다.",
      };
      line("", "");
      line(
        "호위병",
        "마마, 도성에서 가져온 봉서입니다. 복홀에 닿거든 이대로 전할까요?",
      );
      line(
        "충녕",
        "‘고려의 후손을 데려오라. 거역하면 처단하라.’ ……접어 두세요. 그분 얼굴 한 번 뵌 적이 없는데, 이런 것부터 내보일 순 없어요.",
      );
      choice("next", "남하 호송에 동행할까요?");
      break;
    case "escort":
      page.nextStage = 4;
      page.clip = "escort";
      page.music = "13";
      page.title = "길가에서 기다린 목진";
      line(
        "목진",
        "공주마마, 복홀에서 왔습니다. 부디 저를 곁에 두어 주십시오.",
      );
      line(
        "충녕",
        "복홀에서요? 우린 그리로 가는데, 어쩌다 반대편에서 오셨어요?",
      );
      line(
        "목진",
        "마마께서 이 길로 오신다기에…… 성안 사정이라면 제가 좀 압니다.",
      );
      line(
        "충녕",
        "그 발로 여기까지 오셨어요? 뒤에 자리가 있어요. 걸음이 더딘 이들과 같이 오세요.",
      );
      line("충녕", "오늘 저녁은 저분 몫도 한 그릇 더 떠 주세요.");
      line(
        "덕순이",
        "마마, 저희더러 따라오라 하시면 걸을 수는 있어요. 도중에 저 아이가 처져도 이름 한 번만 더 불러 주세요.",
      );
      choice(
        "invite",
        "식량 12 · 난민까지 열 명과 함께 남하",
        !canPay(s, "RES_PLANT", 12),
      );
      choice(
        "provisions",
        "식량 6 · 현지에 남기고 의원 일행 네 명 호송",
        !canPay(s, "RES_PLANT", 6),
      );
      break;
    case "arrival":
      page.music = "09";
      page.goal = `장영실 예보 · 혹한까지 ${Math.max(0, 15 - days)}일`;
      line(
        "장영실",
        "기둥에 노끈을 묶은 자리가 보이십니까? 어제 잰 얼음은 거기까지였습니다. 이만큼씩 언다면 보름 뒤엔 나루 바닥까지 붙습니다.",
      );
      line(
        "덕순이",
        c.memorial === "recover"
          ? "그때 찾아 주신 유품, 동생 주머니에 씨앗이 셋 있었어요. 그걸 심을 봄까지만 우리 몫도 헤아려 주세요."
          : "셋째 조 이름 적은 장부, 아직 있지요? 새로 온 집들 이름도 그 옆에 적어 주세요. 빈 곳으로 두긴 싫어요.",
      );
      line(
        "충녕",
        c.escort === "invite"
          ? "함께 온 아이들이 어느 솥 앞에 서야 할지 몰라요. 풀죽과 생선죽 솥에 다른 매듭을 달아 두면 어떨까요?"
          : "길에 남은 집이 마음에 걸립니다. 길이 열리는 대로 빈 솥부터 돌려받으러 가겠다고 약속했어요.",
      );
      break;
    case "winter":
      page.clip = "four";
      page.music = "11";
      page.title = "밤새 식지 않은 그릇";
      page.goal = `혹한 ${Math.min(15, days)} / 15일`;
      line(
        "여울쇠",
        "제 새끼가 풀죽 그릇을 온종일 안고 있어요. 먹을 수 있어서가 아니고, 손이 따뜻하니까요. 생선 솥에 남은 게 있습니까?",
      );
      line(
        "충녕",
        "제 그릇을 가져가세요. 그리고 내일은 큰 솥을 가운데 두고 작은 솥 둘을 함께 데워요. 먹는 것이 달라도 불은 나눠 쓸 수 있잖아요.",
      );
      line(
        "나르미",
        "역참 명부 마지막 장이에요. 쥬신에서 군량을 보냈다고 적힌 날, 그 역은 벌써 문을 닫았어요. 우릴 먹여 살렸다는 그 수레가 애초에 없었던 거예요.",
      );
      break;
    case "thaw":
      page.music = "04";
      line(
        "장영실",
        "오늘은 얼음이 늘지 않았습니다. 저기 보세요. 나루 밑으로 물이 한 줄 갑니다.",
      );
      complete("5단계로 넘어갈까요? · 성문 앞으로");
      break;
    case "summit":
      page.clip = "five";
      page.music = "14";
      page.title = "두 그릇을 놓고";
      page.goal = "복홀에 들어온 이들의 첫 배급";
      line(
        "나르미",
        "고리야, 성문 좀 더 열어 주세요. 마지막 수레에 어린 것들이 타고 있어요.",
      );
      line(
        "양녕",
        "포야, 혜야. 이제 내려와라. 내 아들들이다. 네 녀석도 봐 두어라. 셋 다 세 번째 행렬에 태웠는데, 이 문까지 온 건 둘뿐이다.",
      );
      line(
        "복홀의 기록",
        "쥬신의 왕자라는 말에 덕순이가 허리를 굽혔다. 고개를 들자 포와 혜가 똑같이 허리를 굽혀 답례했다. 저 어린 것들이 어디로 돌아가나. 덕순이는 목이 메어 한 번 더 절을 했다.",
      );
      line(
        "덕순이",
        "포 왕자님, 혜 왕자님. 이름 잘 들었어요. 난 덕순이에요. 우리 집 아랫목이 벌써 뜨끈한데, 두 분이 먼저 와서 발 좀 녹이실래요?",
      );
      line("", "");
      line(
        "양녕",
        "이 백성들은 나의 것이다. 그 같은 일이 또 벌어진다면 내 아들에게 이들을 맡기겠다. 그날은 나도 아버지처럼 홀로 남겠다.",
      );
      if (c.evacuees)
        line(
          "남문에서 온 짐꾼",
          `남문 명부 여기 있습니다. 오늘 이 문 안에 든 식구는 모두 ${Math.floor(c.evacuees * 0.6)}명입니다.`,
        );
      if (c.cargo) {
        line(
          "남문에서 온 짐꾼",
          "석탄 위에 생선 광주리를 얹었습니다. 아래부터 풀면 다 쏟아져요. 가죽끈은 제가 풀 테니, 광주리 좀 받아 주시겠습니까?",
        );
        line(
          "입고 장부",
          `목재 ${Math.floor((c.cargo.RES_WOOD ?? 0) * 0.3).toLocaleString("ko-KR")} · 고기 ${Math.floor((c.cargo.RES_MEAT ?? 0) * 0.3).toLocaleString("ko-KR")} · 어류 ${Math.floor((c.cargo.RES_FISH ?? 0) * 0.3).toLocaleString("ko-KR")} · 석탄 ${Math.floor((c.cargo.RES_COAL ?? 0) * 0.3).toLocaleString("ko-KR")}`,
        );
      }
      line(
        "양녕",
        "우리 스피노사우루스 집안은 물고기가 끊긴 겨울도 겪었다. 고기 솥이 사흘을 빈다고 치자. 다리가 부러진 자는 내일도 부역을 못 나간다. 그 살로 성벽을 지킬 열을 먹일 수 있다면, 나는 그리 명하겠다.",
      );
      line(
        "길룡",
        "그 다리 부러진 게 접니다. 제 몫을 줄인다기에 여기 왔는데, 이젠 제 몸이 누구 몫인지 정하는 겁니까?",
      );
      line(
        "충녕",
        "압해에선 고기를 말려 놓고도 땔감이 없어 떨고 있어요. 우리 들보를 조금 내주고 그 고기를 받아 오면 길룡 씨도 내일 아침을 먹습니다. 그만큼 우리 집 짓는 날이 늦어지겠지요. 제 처소부터 미루세요.",
      );
      line(
        "양녕",
        "그럼 오늘 밤 누가 성벽에 설지 네가 묻거라. 난 그 대답까지 들을 각오로 왔다.",
      );
      line(
        "고리",
        "다들 들었소. 내 이름으로 장부에 쓰겠소. 무슨 일이 생기든, 그 이름부터 찾으시오.",
      );
      choice("coexist", "충녕 · 먹는 것과 필요한 양에 맞춰 배급한다");
      choice("control", "양녕 · 식단마다 하루 배급의 상한을 정한다");
      break;
    case "forecast":
      page.auto = false;
      page.title =
        minutesUntilCoup(s) <= 900
          ? "영실이 가져온 혹한 예보"
          : "복홀의 저녁 배식";
      page.goal =
        minutesUntilCoup(s) <= 900
          ? "혹한 예보 · 닷새 뒤 도달"
          : "복홀의 배급과 성문을 살핀다";
      if (minutesUntilCoup(s) <= 900)
        line(
          "영실",
          "북쪽 세 관측소에서 보낸 패가 모두 왔습니다. 닷새 뒤엔 복홀 나루가 바닥까지 얼겠습니다. 이번엔 물살 센 여울도 버티지 못합니다.",
        );
      line(
        "덕순이",
        c.side === "control"
          ? "포가 제 몫을 반이나 남겼어요. 혜가 더 달랄까 봐요. 둘 다 같은 만큼 받는다고, 제 것도 식기 전에 먹으라고 했지요."
          : "포는 생선을 잘게 발라 주니 먹네요. 혜는 벌써 제 그릇을 비우고 포 것까지 발라 주겠다고 나섰어요.",
      );
      break;
    case "rally":
      page.illustration = "gate";
      page.music = "13";
      page.title = "혹한 닷새 전 · 배반자의 외침";
      line(
        "목진",
        c.coupGateRaided
          ? "지금이오! 성문에 붉은 눈이 들이닥쳤소. 어서 빗장을 드시오. 왕자 마마의 깃발 아래 서시오!"
          : "창고에서 나와 약조한 이들, 내 목소리 들리시오? 왕자 마마의 깃발을 보시오. 지금 빗장을 드시오!",
      );
      line(
        "양녕",
        "내 깃발을 세워라. 남문에서 나와 함께 온 자들은 이리 와라. 오늘부터 내가 창고 열쇠를 맡겠다.",
      );
      line(
        "길룡",
        c.side === "control"
          ? "공자님, 첫날 정한 몫이 제 몸엔 모자랍니다. 그 말씀 드리러 이 다리로 예까지 왔습니다. 그런데 왜 창고 열쇠 이야기가 나옵니까?"
          : "공자님, 어느 집에 뭐가 필요한지 적어 오라셨지요. 제 이웃들 몫도 적어 왔습니다. 이걸 왜 왕자 마마 쪽에 내야 합니까?",
      );
      line(
        "목진",
        "그 패를 내게 주시오. 쥬신 군막에 가면 일한 만큼은 받아낼 수 있소이다.",
      );
      line(
        "덕순이",
        "그 손 치우시오. 내 몫 달라는 말을 당신 좋으라고 한 줄 아시오? 공자님, 여기 우리랑 한 끼 앉아 주시겠어요?",
      );
      choice("resist", "양녕의 반란에 맞선다");
      choice("ally", "양녕의 반란에 동조한다");
      break;
    case "verdict":
      page.illustration = "gate";
      page.title = c.uprising
        ? "성문 빗장이 들리던 밤"
        : "안에서 문을 지킨 이들";
      page.music = c.uprising ? "13" : "14";
      line(
        "목진",
        c.coupGateRaided
          ? "성문에 붉은 눈이 붙은 걸 다들 보았지 않소! 지금이오, 빗장을 드시오!"
          : "거기 빗장 끝을 잡은 이, 날 보시오. 문을 열기로 했잖소. 왜들 가만히 서 있는 게요?",
      );
      if (c.uprising) {
        line(
          "푸른 보자기를 맨 주민",
          s.rationPolicy === "cap"
            ? "어제도 내 몫을 둘로 쪼개 새끼랑 나눴소. 오늘도 그만큼이라지. 이쪽 빗장은 내가 들 테니 그쪽 끝 좀 받으시오."
            : "새끼 몫까지 적어 냈는데 솥바닥만 긁다 왔소. 오늘도 빈 보자기 들고 돌아갈 순 없지. 자, 빗장 듭시다.",
        );
      } else {
        line(
          "푸른 보자기를 맨 주민",
          s.rationPolicy === "cap"
            ? "몫을 정했다기에 군졸들은 더 받는 줄 알았소. 어제 내 앞에 선 포졸도 같은 국자였어. 목진 공, 비키시오. 빗장 걸 거요."
            : "우리 막내가 뭘 먹을 수 있는지 물은 건 식당 솥지기가 처음이었소. 저 안에 지금도 우리 애가 있소. 빗장 이리 주시오. 내가 걸겠소.",
        );
      }
      if (c.uprising) {
        if (s.town.development.story.chungnyeong === "alive")
          page.lineIllustration = {
            at: page.lines.length,
            image: "chungnyeong-dining",
            alt: "복홀 식당에서 어린 공룡들과 한 상에 앉은 충녕",
          };
        if (s.town.development.story.route !== "dictatorship")
          line(
            "나르미",
            s.town.development.story.chungnyeong === "dead"
              ? "고리야, 의원이 오기도 전에 공주마마께서 돌아가셨어요. 성안에서 붕대를 감고 있던 이의 눈이 붉어졌어요. 마마께서 새끼를 밀어내시는 사이에 그이가 덮쳤어요. 길룡 씨가 손을 놓지 못해요."
              : "고리야, 공주마마께서는 무사하세요. 어린 공룡들을 데리고 식당에 계세요.",
          );
        line(
          "목진",
          "마마, 보셨지요? 제가 먼저 빗장을 들었습니다. 마마께서 오시면 다들 이리 올 줄 알았습니다. 저도 그 곁에 있게 해 주십시오.",
        );
        page.laterIllustration = {
          from: page.lines.length,
          image: "yangnyeong-mokjin",
          alt: "관아 계단 중앙의 고리가 목진을 노려보고, 곁에 선 양녕이 칼을 어깨에 걸쳤다.",
        };
        line("양녕", "고개 들어라, 목진.");
        line("양녕", "아니다. 들지도 마라. 가치도 없다.");
      }
      if (!c.uprising) {
        line(
          "목진",
          "마마, 안에서 문을 열 이들이 있었사옵니다. 저도 데려가 주십시오. 마마 곁에만 있으면…….",
        );
        page.laterIllustration = {
          from: page.lines.length,
          image: "yangnyeong-mokjin",
          alt: "관아 계단에서 양녕이 목진을 내려다본다.",
        };
        line(
          "양녕",
          "내 깃발만 보면 다들 빗장을 들 거라 여겼느냐. 어려 보인다고 제 주인을 버린 놈이 내가 약해 보이면 어찌할지 뻔하구나. 다들 잘 보아라.",
        );
      }
      if (s.town.development.story.route === "dictatorship") {
        line("양녕", "성문을 닫아라. 이 백성들은 나의 것이다.");
        line("포졸", "공주마마께서 돌아가셨습니다.");
      } else if (
        !c.uprising &&
        s.town.development.story.chungnyeong === "dead"
      ) {
        line(
          "나르미",
          "고리야, 공주마마께서 돌아가셨어요. 성안에서 변한 이가 마마를 덮쳤어요.",
        );
      }
      choice(
        "next",
        s.town.development.story.route === "mechanical"
          ? "판결을 기록하고 의원으로"
          : "판결을 기록하고 마을로",
      );
      break;
    case "vigil":
      page.auto = false;
      page.music = c.side === "control" ? "14" : "04";
      page.goal = "다가오는 혹한을 견딘다";
      if (s.town.development.story.chungnyeong === "alive") {
        line(
          "충녕",
          "오늘은 두 솥 모두 바닥이 보이네요. 안심해도 되는지 내일 같은 자리에서 다시 물어볼게요.",
        );
        line(
          "달이",
          s.world.pessimism > 30
            ? "오늘도 사람들이 빈 그릇을 들고 곳간 앞에 서 있어. 고리야, 봄 얘기는 조금 이른가 봐. 같이 내려갈래?"
            : "덕순이가 내일은 집에서 파를 좀 가져오겠대. 어제까지만 해도 제 그릇을 두 손에 꼭 쥐고 있던 이가 말이야.",
        );
      } else if (s.town.development.story.route === "dictatorship") {
        line("양녕", "성문의 열쇠를 가져와라.");
      } else if (s.town.development.story.chungnyeong === "dead") {
        page.title = "의원의 등잔";
        const completed = s.town.development.completed;
        line(
          "영실",
          completed.includes("R18")
            ? "공자님, 이제 마마를 모실 몸을 지어야 합니다. 연구소에서 메카2 연구를 이어가게 해 주십시오."
            : completed.includes("R17")
              ? "기록을 맞춰 보았습니다. 이제 연구소에서 의식 이전 장치를 만들 수 있습니다."
              : "공자님, 연구소에 옛 기록이 남아 있습니다. 유산 기록 대조부터 제게 맡겨 주십시오.",
        );
      } else {
        line("영실", "공자님, 의원에 함께 가 주시겠습니까?");
      }
      {
        const ration = emergencyRation(s);
        if (ration) {
          const trade = c.side === "coexist";
          page.goal = trade ? "압해의 식량 교환 제안" : "양녕의 비상 배급령";
          line(
            trade ? "나르미" : "양녕",
            trade
              ? "압해 수레가 왔어요. 마른 고기를 싣고 왔는데 돌아가는 길엔 땔감을 싣고 싶대요. 우리 몫의 나무를 내줄까요?"
              : "고기 장부를 보았다. 초식이든 우리처럼 고기를 먹는 혈족이든 예외는 없다. 주민 하나를 군량으로 돌리겠다. 네 녀석도 인장을 찍겠느냐?",
          );
          choice(
            `ration:${s.world.day}:${ration}`,
            trade
              ? "압해와 교환 · 목재 12를 내고 고기 8 받기"
              : "비상 배급령 집행 · 주민 1명 사망, 고기 8 확보",
          );
        } else if (c.emergencyDay === s.world.day) {
          line(
            "달이",
            c.side === "coexist"
              ? "고깃국 냄새가 나. 내일은 우리가 약속한 땔감이 저 집 아궁이에서도 타겠지."
              : "고기 솥 앞에 줄이 섰어. 그런데 아무도 그릇을 먼저 내밀질 않아. 어제까지 거기 서 있던 이가 누군지 다들 알거든.",
          );
        }
      }
      break;
    case "ending":
    case "finished": {
      const end = c.ending ?? "collapse";
      if (end === "collapse") page.illustration = "gori-exile";
      if (end !== "collapse")
        page.clip =
          end === "escape" && c.revivalPrepared === false
            ? "mechanical-late"
            : end;
      if (end !== "collapse") {
        line(
          "복홀의 기록",
          "긴 추위를 지나 다시 이웃의 이름을 부를 수 있게 되었습니다. 당신이 우리 곁을 지켜 준 덕입니다.",
        );
        page.resultQuote = quote;
      }
      page.key = c.beat + end;
      page.music = end === "hope" ? "A" : end === "escape" ? "B" : "C";
      page.goal = c.beat === "ending" ? "결말 확인" : "캠페인 종료";
      page.title =
        end === "hope"
          ? "이듬해, 복홀"
          : end === "escape"
            ? "복홀에 아침이 오면"
            : end === "order"
              ? "다시 열린 성문"
              : "아무도 깨우지 않는 아침";
      if (end === "hope") {
        line("충녕", "공자님, 손 좀 내어 주실래요?");
        line("고리", "네, 공주마마. ……내려갈 때도 이렇게 가도 될까요?");
        line("충녕", "저도 그 말을 하려던 참이었어요.");
      } else if (end === "escape") {
        line("고리", "공주마마?");
        line("충녕", "안.녕.하.세.요. 저.는. 충.녕.입.니.다.");
      } else if (end === "order") {
        line(
          "고리",
          "명부를 가져오시오. 오늘부터 왕자 마마의 인장이 찍힌 명만 받으시오.",
        );
      } else {
        line(
          "달이",
          "성문 열쇠를 받으러 온 건 군졸이 아니었어. 함께 줄을 서던 이웃들이었어. 고리야, 이제 내려놓자.",
        );
        line(
          "고리",
          "장부는 두고 가겠소. 죽은 이들의 이름까지 가져갈 권리는 내게 없소.",
        );
      }
      if (c.beat === "ending")
        choice(
          "finish",
          end === "collapse"
            ? "추방 기록 닫기"
            : "5단계 완료 · 마지막 장을 덮을까요?",
        );
      else page.auto = false;
      break;
    }
  }
  if (page.frames?.length) page.resultQuote = quote;
  return page;
}
