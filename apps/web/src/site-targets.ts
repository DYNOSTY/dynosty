import {
  CREW_JOB_NAMES,
  commandLabor,
  countCrew,
  EXCHANGE_RULES,
  exchangeDue,
  LABOR_RULES,
  type LaborCommand,
  type LaborState,
  laborStock,
} from "@dynosty/game-core";
export const SITE_IDS = [
  "site-inspection",
  "site-quarantine",
  "site-ration",
] as const;
export type SiteId = (typeof SITE_IDS)[number];
export const SITE_NAMES = {
  "site-inspection": "검수대",
  "site-quarantine": "격리품",
  "site-ration": "배급소",
} as const;
export const SITE_POINTS = {
  "site-inspection": [3.4, 0.3, -3.7],
  "site-quarantine": [4.8, 0.175, -3.7],
  "site-ration": [3.8, 0.325, 0.2],
} as const;
export function isSiteId(id: string | null): id is SiteId {
  return SITE_IDS.includes(id as SiteId);
}
export function siteAvailable(s: LaborState | null, id: SiteId) {
  return (
    s !== null && (id !== "site-quarantine" || laborStock(s).quarantine > 0)
  );
}
export const siteTime = (m: number) => `${Math.floor(m / 60)}시간 ${m % 60}분`;
interface Candidate {
  key: string;
  label: string;
  command: LaborCommand;
}
export interface SiteAction extends Candidate {
  disabled: boolean;
  reason: string;
}
export function siteView(s: LaborState, id: SiteId) {
  const stock = laborStock(s),
    t = s.timber,
    e = s.exchange,
    used = new Set(s.processed);
  let n = 0;
  while (used.has(`site-preview-${n}`)) n++;
  const preview = (a: Candidate): SiteAction => {
    try {
      commandLabor(s, a.command, `site-preview-${n}`);
      return { ...a, disabled: false, reason: "" };
    } catch (err) {
      return {
        ...a,
        disabled: true,
        reason: err instanceof Error ? err.message : "현재 진행할 수 없습니다.",
      };
    }
  };
  const candidates: Candidate[] = [],
    fields: { label: string; value: string }[] = [];
  let status = "",
    hint = "",
    job: "repair" | "prep" | null = null;
  const assigned = (jobs: string[]) =>
    s.crew
      .filter((c) => jobs.includes(c.job))
      .map(
        (c) => `${c.id.replace("crew-", "일손 ")} · ${CREW_JOB_NAMES[c.job]}`,
      )
      .join(", ") || "없음";
  if (id === "site-inspection") {
    fields.push(
      { label: "검사 대기", value: `${stock.waiting}개` },
      { label: "합격·수령 전", value: `${stock.checked}개` },
      { label: "담당", value: assigned(["carrier", "exchange"]) },
    );
    if (e.phase === "arrived") {
      status = "교환품 재검수 대기";
      candidates.push({
        key: "exchange-inspect",
        label: "현장 교환품4 재검수 시작",
        command: { type: "exchange-inspect" },
      });
    } else if (e.phase === "inspecting") {
      status = "교환품 재검수 중";
      fields.push({
        label: "남은 검사",
        value: `${(exchangeDue(e) ?? s.elapsed) - s.elapsed}분`,
      });
    } else if (e.phase === "checked") {
      status = "교환품 합격 · 수령 확인 대기";
      candidates.push({
        key: "exchange-receive",
        label: "현장 합격 교환품4 수령",
        command: { type: "exchange-receive" },
      });
    } else if (t.phase === "arrived") {
      status = "원납품 전량 검사 대기";
      candidates.push({
        key: "inspect",
        label: "현장 전량 검사 시작",
        command: { type: "timber", command: { type: "inspect" } },
      });
    } else if (t.phase === "inspecting") {
      status = "원납품 검사 중";
      fields.push({
        label: "남은 검사",
        value: `${(t.due ?? s.elapsed) - s.elapsed}분`,
      });
    } else if (t.phase === "inspected") {
      status = "검사 완료 · 정상분 수령 대기";
      candidates.push({
        key: "receive",
        label: `현장 정상분 ${t.stock.checked} 수령`,
        command: { type: "timber", command: { type: "receive" } },
      });
    } else
      status = ["reserved", "returning", "delivering"].includes(e.phase)
        ? "교환품 도착 전"
        : "검사할 물량 없음";
    hint =
      "검사 완료 후에도 수령 확인을 해야 사용할 수 있습니다. 이동·운송 중인 물량은 검사대 재고에 합산하지 않습니다.";
  } else if (id === "site-quarantine") {
    status =
      e.phase === "reserved"
        ? "공급처 교환 예약"
        : t.phase === "repairing"
          ? "현장 보완 진행 중"
          : s.repairProgress > 0
            ? "현장 보완 진행 보존"
            : "불량품 사용 불가";
    fields.push(
      { label: "품질", value: "젖은 목재 · 사용 불가" },
      { label: "격리 수량", value: `${stock.quarantine}개` },
      {
        label: "보완 진행",
        value: `${s.repairProgress}/${LABOR_RULES.repairMinutes}분`,
      },
      { label: "담당", value: assigned(["repair", "exchange"]) },
    );
    if (e.phase === "reserved")
      candidates.push(
        {
          key: "exchange-depart",
          label: "현장 교환 회수 출발",
          command: { type: "exchange-depart" },
        },
        {
          key: "exchange-cancel",
          label: "현장 교환 예약 취소",
          command: { type: "exchange-cancel" },
        },
      );
    else if (
      e.phase === "none" &&
      ["received", "repairing"].includes(t.phase)
    ) {
      if (t.phase === "received")
        candidates.push({
          key: "repair",
          label: "현장 보완 인원 배정",
          command: { type: "timber", command: { type: "repair" } },
        });
      candidates.push({
        key: "exchange-request",
        label: "현장 불량4 교환 요청",
        command: { type: "exchange-request" },
      });
      job = "repair";
    }
    hint =
      t.phase === "inspected"
        ? "검수대에서 정상분을 먼저 수령하면 보완·교환을 선택할 수 있습니다."
        : `현장 보완 ${LABOR_RULES.repairWorkers}명·${siteTime(LABOR_RULES.repairMinutes)} / 교환 ${EXCHANGE_RULES.workers}명·왕복${siteTime(EXCHANGE_RULES.returnMinutes + EXCHANGE_RULES.redeliveryMinutes)}·재검수${siteTime(EXCHANGE_RULES.inspectionMinutes)}, 추가 철재${EXCHANGE_RULES.extraIron}. 모두 기존 체험 개발값입니다.`;
  } else {
    status =
      s.elapsed < LABOR_RULES.prepOpensAt
        ? "배급 준비 요청 전"
        : s.prepCompletedAt !== null
          ? `배급 준비 완료 · ${siteTime(s.prepCompletedAt)}`
          : countCrew(s, "prep") > 0
            ? "배급 준비 진행 중"
            : "배급 준비 담당 대기";
    fields.push(
      {
        label: "대기",
        value:
          s.elapsed < LABOR_RULES.prepOpensAt
            ? "요청 전"
            : `${Math.ceil((LABOR_RULES.prepWork - s.prepProgress) / LABOR_RULES.workPerGroup)}무리`,
      },
      {
        label: "준비 진행",
        value: `${s.prepProgress}/${LABOR_RULES.prepWork}인·분`,
      },
      { label: "담당", value: assigned(["prep"]) },
      {
        label: "공개 / 기한",
        value: `${siteTime(LABOR_RULES.prepOpensAt)} / ${siteTime(LABOR_RULES.prepDeadline)}`,
      },
    );
    job = "prep";
    hint =
      "기존 배급 준비 작업입니다. 운송·검수 예약자는 이동할 수 없고, 보완 담당을 옮기면 보완 진행량이 보존됩니다. 영양·식량 소비 규칙은 추가하지 않습니다.";
  }
  const targetJob = job;
  const crew = targetJob
    ? s.crew.map((c) => {
        const command: LaborCommand =
          c.job === "idle"
            ? { type: "assign", worker: c.id, job: targetJob }
            : { type: "move", worker: c.id, from: c.job, to: targetJob };
        return {
          id: c.id,
          current: CREW_JOB_NAMES[c.job],
          send: preview({
            key: `${c.id}-send`,
            label: `현장 ${c.id.replace("crew-", "일손 ")} ${CREW_JOB_NAMES[targetJob]}${targetJob === "repair" ? "으로" : "로"} 보내기`,
            command,
          }),
          release:
            c.job === targetJob
              ? preview({
                  key: `${c.id}-release`,
                  label: `현장 ${c.id.replace("crew-", "일손 ")} 대기로 복귀`,
                  command: {
                    type: "move",
                    worker: c.id,
                    from: c.job,
                    to: "idle",
                  },
                })
              : null,
        };
      })
    : [];
  return {
    name: SITE_NAMES[id],
    status,
    hint,
    fields,
    actions: candidates.map(preview),
    crew,
  };
}
