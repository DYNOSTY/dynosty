import {
  EXCHANGE_RULES,
  LABOR_RULES,
  type LaborState,
  TIMBER_RULES,
} from "@dynosty/game-core";
import { siteProgress } from "./site-progress.js";
import type { SiteId } from "./site-targets.js";

const fraction = (elapsed: number, start: number, duration: number) =>
  Math.max(0, Math.min(1, (elapsed - start) / duration));
/** 기존 게임 시각으로 계산하는 표시. 별도 운송/하역 시계는 없다. */
export function transportView(s: LaborState) {
  const e = s.exchange,
    t = s.timber;
  if (e.phase === "returning" || e.phase === "delivering") {
    const returning = e.phase === "returning";
    const duration = returning
      ? EXCHANGE_RULES.returnMinutes
      : EXCHANGE_RULES.redeliveryMinutes;
    const start =
      (e.departure ?? s.elapsed) +
      (returning ? 0 : EXCHANGE_RULES.returnMinutes);
    const progress = fraction(s.elapsed, start, duration);
    return {
      label: returning ? "불량품 회수 운송" : "교환품 재납품 운송",
      progress,
      moving: true,
      quantity: EXCHANGE_RULES.quantity,
      x: returning ? 2 - 8 * progress : -6 + 8 * progress,
    };
  }
  if (e.phase !== "none")
    return {
      label:
        e.phase === "reserved"
          ? "불량품 회수 출발 대기"
          : e.phase === "completed"
            ? "교환품 하역·재검수·수령 완료"
            : "교환품 하역 완료 · 재검수·수령 확인",
      progress: e.phase === "reserved" ? 0 : 1,
      moving: false,
      quantity: e.phase === "reserved" ? EXCHANGE_RULES.quantity : 0,
      x: 2,
    };
  const progress =
    t.departure === null
      ? 0
      : fraction(
          t.elapsed,
          t.departure,
          t.offer ? TIMBER_RULES.offers[t.offer].travel : 1,
        );
  return {
    label:
      t.phase === "transport"
        ? "원납품 운송"
        : t.departure === null
          ? "원납품 출발 전"
          : "원납품 하역 완료",
    progress,
    moving: t.phase === "transport",
    quantity: t.phase === "transport" ? TIMBER_RULES.requested : 0,
    x: -6 + 8 * progress,
  };
}
export function crewActivity(s: LaborState, i: number) {
  const job = s.crew[i]?.job;
  if (job === "carrier")
    return s.timber.phase === "transport"
      ? "운송 중"
      : s.timber.phase === "inspecting"
        ? "검사 중"
        : "검사 대기";
  if (job === "exchange")
    return ["returning", "delivering"].includes(s.exchange.phase)
      ? "교환 운송 중"
      : s.exchange.phase === "inspecting"
        ? "재검수 중"
        : "교환 대기";
  if (job === "repair")
    return s.timber.phase === "repairing"
      ? "보완 중"
      : s.repairProgress >= LABOR_RULES.repairMinutes
        ? "보완 완료"
        : "보완 대기 · 인원/조건 확인";
  if (job === "prep")
    return s.prepCompletedAt !== null
      ? "배급 준비 완료"
      : s.elapsed < LABOR_RULES.prepOpensAt
        ? "배급 요청 대기"
        : "배급 준비 중";
  return "대기";
}
export type GuideStep = {
  action?: string;
  title: string;
  detail: string;
  site?: SiteId;
};
export function nextTimberStep(s: LaborState): GuideStep {
  const t = s.timber,
    e = s.exchange;
  if (t.phase === "completed")
    return {
      title: "목재 사용 확인 완료",
      detail: "목재20의 처리가 끝났습니다. 배급 준비도 확인해 주세요.",
    };
  if (e.phase !== "none" && e.phase !== "completed") {
    const inspection = ["arrived", "inspecting", "checked"].includes(e.phase);
    return {
      title: inspection ? "교환품 재검수·수령" : "불량품 교환·재납품",
      detail: siteProgress(s)[inspection ? 0 : 1]?.reason ?? "교환 진행 확인",
      site: inspection ? "site-inspection" : "site-quarantine",
    };
  }
  switch (t.phase) {
    case "select":
      return {
        title: "1 · 공급 제안 비교",
        action: t.offer ? "labor-contract-action" : "labor-offer-actions",
        detail:
          "공급 제안 비교에서 철재·도착·정상/격리 물량을 보고 확장 제안 A 또는 B를 선택하세요. 다음은 확장 약정하기입니다.",
      };
    case "contracted":
      return {
        title: "2 · 약정·출발",
        action: "labor-depart-action",
        detail:
          "확장 수레 출발을 누르세요. 운송 담당은 기존 규칙에 따라 예약됩니다.",
      };
    case "transport":
      return {
        title: "3 · 운송·하역",
        detail:
          "시간을 진행하면 수레가 도착합니다. 하역은 도착과 함께 표시되며 추가 시간이 들지 않습니다.",
      };
    case "arrived":
    case "inspecting":
    case "inspected":
      return {
        title: "4 · 전량 검사·정상분 수령",
        detail: siteProgress(s)[0]?.reason ?? "검수대 확인",
        site: "site-inspection",
      };
  }
  if (
    t.stock.quarantine > 0 &&
    (t.phase === "repairing" || s.repairProgress > 0)
  )
    return {
      title: "5 · 현장 보완 이어가기",
      detail: siteProgress(s)[1]?.reason ?? "보완 담당과 진행량을 확인하세요.",
      site: "site-quarantine",
    };
  if (t.stock.quarantine > 0)
    return {
      title: "5 · 불량품 처리",
      detail:
        "격리품에서 현장 보완 또는 공급처 교환을 선택하세요. 배급 준비와 동시에 진행할 수 있습니다.",
      site: "site-quarantine",
    };
  if (t.stock.available > 0)
    return {
      title: "6 · 정상 목재 배분",
      action: "labor-allocate-action",
      detail:
        "확장 정상 목재 배분으로 필요한 목재를 배분하세요. 일부 정상분은 불량품 처리 중에도 먼저 배분할 수 있습니다.",
    };
  return {
    title: "7 · 사용 확인",
    action: "labor-use-action",
    detail: "배분 목재가20개면 확장 목재 사용 확인을 누르세요.",
  };
}
