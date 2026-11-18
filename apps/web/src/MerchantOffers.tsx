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
    "반갑소. 오는 길에 서리 맞기 전의 어린잎을 베어 왔소.",
    "풀 한 짐을 내겠소. 대신 물통을 채워 주겠소?",
  ],
  [
    "meat",
    "고기",
    "피돌이",
    "어서 오시오! 오늘 사냥감은 살이 제법 올랐소.",
    "고기를 나누겠소. 훈제할 목재와 바꿉시다.",
  ],
  [
    "fish",
    "어류",
    "은빛쇠",
    "아가미 빛 좀 보시오. 동틀 무렵 얼음 밑에서 건졌다오.",
    "잡은 물고기를 내겠소. 작살을 벼릴 철재가 필요하오.",
  ],
  [
    "wood",
    "목재",
    "거친손",
    "고리 나리, 결 한번 보시지요. 곧은 것끼리 묶어 왔습니다.",
    "목재를 드리지요. 무뎌진 도끼를 고칠 철재를 주시겠습니까?",
  ],
  [
    "metal",
    "철재",
    "억쇠",
    "반갑습니다. 쇳소리는 귀를 속이지 못하지요.",
    "두드려 다듬은 철재가 있습니다. 화덕에 쓸 석탄과 바꾸지요.",
  ],
  [
    "water",
    "물",
    "물지게",
    "먼 길 오느라 목마르셨지요? 바가지부터 받으세요.",
    "샘물을 길어 왔어요. 물지게를 고칠 목재가 있을까요?",
  ],
  [
    "ore",
    "철광석",
    "덕구",
    "손에 붉은 가루가 묻지요? 골짜기 광맥에서 막 캐 온 겁니다.",
    "철광석을 내려놓겠습니다. 광부들이 먹을 어류를 주시겠습니까?",
  ],
  [
    "stone",
    "석재",
    "바우",
    "문턱이 닳았구려. 발 디디기 좋은 넓적돌을 골라 왔소.",
    "다듬은 석재를 내겠소. 돌수레 축에 쓸 목재가 필요하오.",
  ],
  [
    "coal",
    "석탄",
    "일식",
    "하하, 내 얼굴부터 까맣지요? 오늘도 갱에서 곧장 왔습니다.",
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
