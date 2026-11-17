import {
  commandLabor,
  createLaborState,
  LABOR_RULES,
  type LaborCommand,
  type LaborState,
} from "@dynosty/game-core";
import { expect, it } from "vitest";
import { siteCompletions, siteProgress } from "./site-progress.js";

function fixture() {
  let state = createLaborState(),
    n = 0;
  const step = (c: LaborCommand) => {
    const before = state;
    state = commandLabor(state, c, `hud-${++n}`);
    return siteCompletions(before, state);
  };
  const start = () => {
    for (const c of [
      { type: "choose", offer: "A" },
      { type: "contract" },
      { type: "depart" },
    ] as const)
      step({ type: "timber", command: c });
    step({ type: "next" });
    step({ type: "timber", command: { type: "inspect" } });
    step({ type: "next" });
    step({ type: "timber", command: { type: "receive" } });
  };
  return {
    step,
    start,
    get state() {
      return state;
    },
  };
}
const card = (s: LaborState, id: string) =>
  siteProgress(s).find((v) => v.id === id);
it("선택과 무관하게 세 현장을 파생하며 원본을 바꾸지 않는다", () => {
  const f = fixture(),
    raw = JSON.stringify(f.state);
  expect(siteProgress(f.state)).toHaveLength(3);
  expect(card(f.state, "site-ration")?.reason).toContain("8시간");
  expect(JSON.stringify(f.state)).toBe(raw);
  f.start();
  expect(card(f.state, "site-inspection")?.progress?.value).toBe(120);
  expect(card(f.state, "site-quarantine")?.reason).toContain("선택");
});
it("보완 인원 부족과 시간 일시정지를 구분하고 재배치 진행량을 보존한다", () => {
  const f = fixture();
  f.start();
  f.step({ type: "timber", command: { type: "repair" } });
  f.step({ type: "advance", minutes: 60 });
  expect(card(f.state, "site-quarantine")?.progress?.value).toBe(60);
  expect(card(f.state, "site-quarantine")?.reason).toContain("일시정지");
  f.step({ type: "move", worker: "crew-2", from: "repair", to: "prep" });
  expect(card(f.state, "site-quarantine")?.reason).toContain("1/2명");
  expect(card(f.state, "site-quarantine")?.progress?.value).toBe(60);
  expect(card(f.state, "site-ration")?.crew).toBe(1);
});
it("사건 경계마다 배급과 보완 완료를 실제 완료 시각으로 한 번씩 알린다", () => {
  const f = fixture();
  f.start();
  f.step({ type: "timber", command: { type: "repair" } });
  for (const worker of ["crew-3", "crew-4"] as const)
    f.step({ type: "assign", worker, job: "prep" });
  const notices = [
    ...f.step({ type: "advance", minutes: 240 }),
    ...f.step({ type: "next" }),
  ];
  expect(notices.map((n) => n.text)).toEqual([
    "배급소 · 배급 준비 완료",
    "격리품 · 현장 보완 완료",
  ]);
  expect(notices[0]?.minute).toBe(660);
  expect(card(f.state, "site-ration")?.progress?.value).toBe(
    LABOR_RULES.prepWork,
  );
  expect(card(f.state, "site-quarantine")?.progress?.value).toBe(240);
  expect(f.step({ type: "pause", paused: true })).toEqual([]);
});
it("교환 각 단계에서 재검수와 수령을 구분하고 완료를 중복 알리지 않는다", () => {
  const f = fixture();
  f.start();
  f.step({ type: "exchange-request" });
  expect(card(f.state, "site-quarantine")?.reason).toContain("출발");
  f.step({ type: "exchange-depart" });
  expect(card(f.state, "site-quarantine")?.crew).toBe(1);
  expect(card(f.state, "site-inspection")?.reason).toContain("도착 후");
  f.step({ type: "next" });
  f.step({ type: "next" });
  expect(card(f.state, "site-inspection")?.reason).toContain("시작");
  f.step({ type: "exchange-inspect" });
  expect(card(f.state, "site-inspection")?.progress?.value).toBe(0);
  expect(f.step({ type: "next" }).map((n) => n.text)).toContain(
    "검수대 · 교환품 재검수 완료",
  );
  expect(card(f.state, "site-quarantine")?.progress?.value).toBe(0);
  expect(f.step({ type: "exchange-receive" })).toHaveLength(1);
  expect(card(f.state, "site-quarantine")?.progress?.value).toBe(4);
  expect(f.step({ type: "pause", paused: true })).toEqual([]);
});
it("초기·복원·새 체험은 완료 전이를 만들지 않는다", () => {
  const f = fixture();
  f.start();
  f.step({ type: "timber", command: { type: "repair" } });
  const before = f.state;
  f.step({ type: "advance", minutes: 240 });
  expect(siteCompletions(null, f.state)).toEqual([]);
  expect(siteCompletions(before, f.state, true)).toEqual([]);
  expect(siteCompletions(f.state, createLaborState(), true)).toEqual([]);
});
