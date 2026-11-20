import {
  type TimberCommand,
  type TimberState,
  visitorOffer,
} from "@dynosty/game-core";
export const merchantCards = [
  [
    "plant",
    "풀",
    "백초 아범",
    "큰 상단은 귀족들 수레를 따라갔소. 난 이 길밖에 몰라서 또 왔지. 고른 어른 앉던 자리에 이 풀 한 단 놓아도 되겠소?",
    "풀 한 짐을 내겠소. 대신 물통을 채워 주겠소?",
  ],
  [
    "meat",
    "고기",
    "피돌이",
    "고깃간 문이 잠겼더군. 전에 내 짐 받던 이는 쥬신으로 갔소? 그럼 나리랑 흥정해야겠네. 이건 오늘 잡은 거요.",
    "고기를 나누겠소. 훈제할 목재와 바꿉시다.",
  ],
  [
    "fish",
    "어류",
    "은빛쇠",
    "첫물에 건진 놈이오. 어적께는 빈 소쿠리로 문을 지나니 애들이 날 보고도 뛰어나오지 않더이다. 오늘은 두드려 봐도 되겠소?",
    "잡은 물고기를 내겠소. 작살을 벼릴 철재가 필요하오.",
  ],
  [
    "wood",
    "목재",
    "거친손",
    "고른 어른은 널빤지 끝부터 만져 보셨지요. 고리 나리도 한번 보시겠습니까? 물 먹은 건 제 등에 다시 지고 가겠습니다.",
    "목재를 드리지요. 무뎌진 도끼를 고칠 철재를 주시겠습니까?",
  ],
  [
    "metal",
    "철재",
    "억쇠",
    "길목에선 군량 징발이라 하고 다리 위에선 통행세라 합디다. 끝까지 챙겨 온 쇠예요. 두드려 보고 값을 매겨 주시오.",
    "두드려 다듬은 철재가 있습니다. 화덕에 쓸 석탄과 바꾸지요.",
  ],
  [
    "water",
    "물",
    "물지게",
    "샘 어귀가 얼어붙어 한 바가지 긷는 데 반나절이었어요. 그래도 첫 바가지는 문 지키는 분 드려요. 밤새 거기 계셨지요?",
    "샘물을 길어 왔어요. 물지게를 고칠 목재가 있을까요?",
  ],
  [
    "ore",
    "철광석",
    "덕구",
    "이 자루는 제 동생이 골랐습니다. 흙덩이는 광석 값으로 안 받겠다 해서, 둘이 밤새 물에 씻었습니다.",
    "철광석을 내려놓겠습니다. 광부들이 먹을 어류를 주시겠습니까?",
  ],
  [
    "stone",
    "석재",
    "바우",
    "문턱이 내려앉았구려. 쥬신 가는 수레들이 자국은 깊이도 냈네. 여기 넓적돌부터 한번 대 봅시다.",
    "다듬은 석재를 내겠소. 돌수레 축에 쓸 목재가 필요하오.",
  ],
  [
    "coal",
    "석탄",
    "일식",
    "연기 나는 집을 세면서 왔습니다. 돌아갈 때 하나라도 더 피어 있으면 좋겠네요. 석탄 자루, 어디다 내려놓을까요?",
    "석탄을 싣고 왔습니다. 돌아가는 길에 먹을 고기와 바꾸시지요.",
  ],
] as const;
export function MerchantOffers({
  state,
  command,
  busy = false,
}: {
  state: TimberState;
  command: (c: TimberCommand) => void;
  busy?: boolean;
}) {
  const merchant = merchantCards[state.merchantItem!];
  if (!merchant) return null;
  return (
    <>
      <p>
        교역소{" "}
        {state.town.facilities.find((f) => f.kind === "trade")?.level ?? 1}레벨
        상인 · {merchant[2]}
      </p>
      {state.riskyMerchants?.includes(state.merchantItem!) && (
        <p>
          지난 납품에 규격 미달품이 있었습니다. 이번에는 값을 낮추거나 대량
          계약의 물량을 더 받을 수 있습니다.
        </p>
      )}
      {(["A", "B"] as const).map((option) => {
        const o = visitorOffer(state, option);
        return (
          <button
            type="button"
            disabled={busy}
            key={option}
            onClick={() =>
              command({
                type: "visit-decision",
                item: state.merchantItem!,
                day: state.world.day,
                option,
              })
            }
          >
            {option} · {merchantCards[o.paymentIndex]?.[1]} {o.cost}개로{" "}
            {merchant[1]} {o.quantity}개 계약
          </button>
        );
      })}
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          command({
            type: "visit-decision",
            item: state.merchantItem!,
            day: state.world.day,
            option: "decline",
          })
        }
      >
        이번 거래 거절
      </button>
    </>
  );
}
