import {
  commandLabor,
  createLaborState,
  type LaborCommand,
} from "@dynosty/game-core";
import { expect, it } from "vitest";
import { siteAvailable, siteView } from "./site-targets.js";

function fixture() {
  let state = createLaborState(),
    n = 0;
  const step = (c: LaborCommand) => {
    state = commandLabor(state, c, `info-${++n}`);
  };
  for (const c of [
    { type: "choose", offer: "A" },
    { type: "contract" },
    { type: "depart" },
  ] as const)
    step({ type: "timber", command: c });
  step({ type: "next" });
  return {
    step,
    get state() {
      return state;
    },
  };
}
function received() {
  const f = fixture();
  f.step({ type: "timber", command: { type: "inspect" } });
  f.step({ type: "next" });
  f.step({ type: "timber", command: { type: "receive" } });
  return f;
}
it("검수대 정보와 검사/수령 명령은 현재 상태에서 파생되고 미리보기는 원본을 바꾸지 않는다", () => {
  const f = fixture(),
    before = JSON.stringify(f.state),
    v = siteView(f.state, "site-inspection");
  expect(v.status).toContain("전량 검사 대기");
  expect(v.fields).toContainEqual({ label: "검사 대기", value: "20개" });
  const a = v.actions[0];
  expect(a?.disabled).toBe(false);
  expect(JSON.stringify(f.state)).toBe(before);
  if (!a) throw new Error("명령 없음");
  f.step(a.command);
  f.step({ type: "next" });
  const b = siteView(f.state, "site-inspection").actions[0];
  expect(b?.label).toContain("16");
  if (!b) throw new Error("명령 없음");
  f.step(b.command);
  expect(f.state.timber.stock.available).toBe(16);
});
it("격리품 보완/교환과 배급소 재배치는 같은 원장을 사용하고 진행량을 유지한다", () => {
  const f = received();
  let v = siteView(f.state, "site-quarantine");
  expect(v.actions.every((a) => !a.disabled)).toBe(true);
  const repair = v.actions.find((a) => a.key === "repair");
  if (!repair) throw new Error("명령 없음");
  f.step(repair.command);
  f.step({ type: "advance", minutes: 60 });
  v = siteView(f.state, "site-quarantine");
  expect(v.actions.find((a) => a.key === "exchange-request")?.disabled).toBe(
    true,
  );
  const row = siteView(f.state, "site-ration").crew.find(
    (c) => c.id === "crew-1",
  );
  if (!row) throw new Error("일손 없음");
  expect(row.send.disabled).toBe(false);
  f.step(row.send.command);
  expect(f.state.repairProgress).toBe(60);
  expect(f.state.timber.phase).toBe("received");
  expect(f.state.crew[0]?.job).toBe("prep");
});
it("교환 예약자는 배급소에서 재배치할 수 없고 취소/출발만 허용한다", () => {
  const f = received();
  f.step({ type: "exchange-request" });
  expect(siteView(f.state, "site-ration").crew[0]?.send.disabled).toBe(true);
  expect(
    siteView(f.state, "site-quarantine").actions.map((a) => a.key),
  ).toEqual(["exchange-depart", "exchange-cancel"]);
  f.step({ type: "exchange-depart" });
  expect(siteAvailable(f.state, "site-quarantine")).toBe(false);
  expect(siteAvailable(f.state, "site-inspection")).toBe(true);
});
it("배급 요청 전 배정 금지와 준비 완료 후 배정 금지를 기존 코어로 검사한다", () => {
  const s = createLaborState();
  expect(siteView(s, "site-ration").crew.every((c) => c.send.disabled)).toBe(
    true,
  );
  const f = received();
  for (const worker of ["crew-1", "crew-2", "crew-3", "crew-4"] as const)
    f.step({ type: "assign", worker, job: "prep" });
  f.step({ type: "next" });
  expect(
    siteView(f.state, "site-ration").crew.every((c) => c.send.disabled),
  ).toBe(true);
  expect(siteView(f.state, "site-ration").status).toContain("완료");
});
