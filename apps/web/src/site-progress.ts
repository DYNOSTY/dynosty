import {
  countCrew,
  EXCHANGE_RULES,
  LABOR_RULES,
  type LaborState,
  laborStock,
  LEGACY_TIMBER_RULES as TIMBER_RULES,
} from "@dynosty/game-core";
import { SITE_NAMES, type SiteId } from "./site-targets.js";

export interface SiteProgressView {
  id: SiteId;
  status: string;
  crew: number;
  reason: string;
  detail: string;
  progress: { label: string; value: number; max: number; unit: string } | null;
}
const progress = (label: string, value: number, max: number, unit = "분") => ({
  label,
  value: Math.max(0, Math.min(value, max)),
  max,
  unit,
});
const clockReason = (s: LaborState) =>
  s.paused
    ? "자동 시간 일시정지 · 시간 진행 버튼으로 계속할 수 있습니다."
    : "진행 중";
export function siteProgress(s: LaborState): SiteProgressView[] {
  const t = s.timber,
    e = s.exchange,
    stock = laborStock(s);
  const inspection: SiteProgressView = {
    id: "site-inspection",
    status: "검사할 물량 없음",
    crew: 0,
    reason: "제안 선택·약정·운송 후 검사할 수 있습니다.",
    detail: `검사 대기 ${stock.waiting}개 · 합격 수령 전 ${stock.checked}개`,
    progress: null,
  };
  if (e.phase !== "none") {
    inspection.status = {
      reserved: "교환 회수 출발 대기",
      returning: "불량품 회수 중",
      delivering: "교환품 운송 중",
      arrived: "교환품 재검수 대기",
      inspecting: "교환품 재검수 중",
      checked: "교환품 재검수 완료",
      completed: "교환품 수령 완료",
    }[e.phase];
    inspection.reason =
      e.phase === "arrived"
        ? "현장에서 재검수를 시작해 주세요."
        : e.phase === "checked"
          ? "합격 교환품 수령 확인이 필요합니다."
          : e.phase === "completed"
            ? "검사·수령할 교환품 없음"
            : e.phase === "inspecting"
              ? clockReason(s)
              : "교환품 도착 후 재검수할 수 있습니다.";
    inspection.crew = ["arrived", "inspecting"].includes(e.phase)
      ? countCrew(s, "exchange")
      : 0;
    inspection.progress = progress(
      "재검수",
      e.phase === "inspecting"
        ? s.elapsed - (e.inspectionStart ?? s.elapsed)
        : ["checked", "completed"].includes(e.phase)
          ? EXCHANGE_RULES.inspectionMinutes
          : 0,
      EXCHANGE_RULES.inspectionMinutes,
    );
  } else if (
    [
      "arrived",
      "inspecting",
      "inspected",
      "received",
      "repairing",
      "ready",
      "completed",
    ].includes(t.phase)
  ) {
    const done = !["arrived", "inspecting"].includes(t.phase);
    inspection.status =
      t.phase === "arrived"
        ? "전량 검사 시작 대기"
        : t.phase === "inspecting"
          ? "전량 검사 중"
          : t.phase === "inspected"
            ? "전량 검사 완료"
            : "정상분 수령 완료";
    inspection.crew = ["arrived", "inspecting"].includes(t.phase)
      ? countCrew(s, "carrier")
      : 0;
    inspection.progress = progress(
      "전량 검사",
      done
        ? TIMBER_RULES.inspectionMinutes
        : t.phase === "inspecting"
          ? s.elapsed - ((t.due ?? s.elapsed) - TIMBER_RULES.inspectionMinutes)
          : 0,
      TIMBER_RULES.inspectionMinutes,
    );
    inspection.reason =
      t.phase === "arrived"
        ? "현장에서 전량 검사를 시작해 주세요."
        : t.phase === "inspecting"
          ? clockReason(s)
          : t.phase === "inspected"
            ? "정상분 수령 확인이 필요합니다."
            : "검사·수령할 원납품 없음";
  } else if (t.phase === "transport") {
    inspection.status = "원납품 운송 중";
    inspection.reason = "원납품이 도착해야 검사를 시작할 수 있습니다.";
  }
  const quarantine: SiteProgressView = {
    id: "site-quarantine",
    status: "격리품 없음",
    crew: countCrew(s, "repair"),
    reason: "처리할 격리 물량 없음",
    detail: `격리 ${stock.quarantine}개 · 보완 진행량은 재배치해도 보존됩니다.`,
    progress: null,
  };
  if (e.phase !== "none") {
    quarantine.status = {
      reserved: "공급처 교환 예약",
      returning: "불량품 회수 중",
      delivering: "교환품 재납품 중",
      arrived: "교환품 도착",
      inspecting: "교환품 재검수 중",
      checked: "합격 교환품 수령 대기",
      completed: "교환 수령 완료",
    }[e.phase];
    quarantine.crew = countCrew(s, "exchange");
    quarantine.progress = progress(
      "교환품 수령",
      e.phase === "completed" ? EXCHANGE_RULES.quantity : 0,
      EXCHANGE_RULES.quantity,
      "개",
    );
    quarantine.reason =
      e.phase === "reserved"
        ? "현장에서 교환 회수를 출발시켜 주세요."
        : e.phase === "arrived"
          ? "검수대에서 재검수가 필요합니다."
          : e.phase === "checked"
            ? "검수대에서 합격품 수령 확인이 필요합니다."
            : e.phase === "completed"
              ? "교환으로 격리 물량 처리 완료"
              : clockReason(s);
  } else if (s.repairProgress === LABOR_RULES.repairMinutes) {
    quarantine.status = "현장 보완 완료";
    quarantine.progress = progress(
      "현장 보완",
      s.repairProgress,
      LABOR_RULES.repairMinutes,
    );
    quarantine.reason = "격리 물량 보완 처리 완료";
  } else if (stock.quarantine > 0) {
    quarantine.status =
      t.phase === "repairing"
        ? "현장 보완 중"
        : s.repairProgress > 0
          ? "현장 보완 일시중단"
          : "불량품 처리 대기";
    quarantine.progress = progress(
      "현장 보완",
      s.repairProgress,
      LABOR_RULES.repairMinutes,
    );
    quarantine.reason =
      t.phase === "inspected"
        ? "검수대에서 정상분을 먼저 수령해 주세요."
        : t.phase !== "repairing" &&
            s.repairProgress === 0 &&
            quarantine.crew === 0
          ? "현장 보완 또는 공급처 교환을 선택해 주세요."
          : quarantine.crew < LABOR_RULES.repairWorkers
            ? `보완 인원 부족 · ${quarantine.crew}/${LABOR_RULES.repairWorkers}명, 진행량 보존`
            : clockReason(s);
  }
  const prep = countCrew(s, "prep");
  const ration: SiteProgressView = {
    id: "site-ration",
    status:
      s.prepCompletedAt !== null
        ? "배급 준비 완료"
        : s.elapsed < LABOR_RULES.prepOpensAt
          ? "배급 요청 전"
          : prep === 0
            ? "배급 인원 대기"
            : "배급 준비 중",
    crew: prep,
    detail:
      s.elapsed < LABOR_RULES.prepOpensAt
        ? "요청 전 · 대기무리 없음"
        : `대기 ${Math.ceil((LABOR_RULES.prepWork - s.prepProgress) / LABOR_RULES.workPerGroup)}무리`,
    progress: progress(
      "배급 준비",
      s.prepProgress,
      LABOR_RULES.prepWork,
      "인·분",
    ),
    reason:
      s.prepCompletedAt !== null
        ? "대기무리 준비 완료"
        : s.elapsed < LABOR_RULES.prepOpensAt
          ? `공유 ${LABOR_RULES.prepOpensAt / 60}시간에 요청 공개`
          : prep === 0
            ? "배급 준비 담당을 배치해 주세요. 운송·검수 예약자는 이동할 수 없습니다."
            : clockReason(s),
  };
  return [inspection, quarantine, ration];
}
export interface SiteNotice {
  id: string;
  text: string;
  minute: number;
}
export function siteCompletions(
  before: LaborState | null,
  next: LaborState,
  reset = false,
): SiteNotice[] {
  if (!before || reset) return [];
  const notices: SiteNotice[] = [];
  const add = (kind: string, text: string, minute = next.elapsed) =>
    notices.push({ id: `${kind}-${minute}`, text, minute });
  if (
    before.timber.phase === "inspecting" &&
    next.timber.phase !== "inspecting"
  )
    add(
      "inspection",
      `${SITE_NAMES["site-inspection"]} · 전량 검사 완료`,
      before.timber.due ?? next.elapsed,
    );
  if (
    before.repairProgress < LABOR_RULES.repairMinutes &&
    next.repairProgress === LABOR_RULES.repairMinutes
  )
    add("repair", "격리품 · 현장 보완 완료");
  if (before.prepCompletedAt === null && next.prepCompletedAt !== null)
    add("prep", "배급소 · 배급 준비 완료", next.prepCompletedAt);
  if (
    before.exchange.phase === "inspecting" &&
    ["checked", "completed"].includes(next.exchange.phase)
  )
    add("reinspection", "검수대 · 교환품 재검수 완료");
  if (
    before.exchange.phase === "checked" &&
    next.exchange.phase === "completed"
  )
    add(
      "receipt",
      `검수대 · 합격 교환품 ${EXCHANGE_RULES.quantity}개 수령 완료`,
    );
  return notices.sort((a, b) => a.minute - b.minute);
}
