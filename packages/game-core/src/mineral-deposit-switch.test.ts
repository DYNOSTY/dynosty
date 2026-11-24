import { expect, it, vi } from "vitest";
import { productionSites } from "./logging.js";
import { createPlayState } from "./play.js";
import { requireValue } from "./require-value.js";
import {
  advanceTimber,
  commandTimber,
  createTimberState,
  type TimberCommand,
  type TimberState,
} from "./timber.js";
import { buildingIssue, connectedDeposits } from "./town.js";

// 실제 지도에는 같은 종류의 광맥이 연결 반경 안에 붙어 있지 않다.
// 이웃 광맥으로 넘어가는 규칙만 확인하려고 한 광맥을 옆으로 옮긴다.
vi.mock("./bokhol.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./bokhol.js")>();
  const anchor = actual.BOKHOL_MINERALS.find(
    (m) => m.id === "stone-bokhol-south",
  );
  if (!anchor) throw Error("기준 광맥 없음");
  return {
    ...actual,
    BOKHOL_MINERALS: actual.BOKHOL_MINERALS.map((m) =>
      m.id === "stone-east" ? { ...m, x: anchor.x + 20, z: anchor.z } : m,
    ),
  };
});

let id = 0;
const cmd = (s: TimberState, c: TimberCommand) =>
  commandTimber(s, c, `deposit-${++id}`);
const remaining = (s: TimberState, siteId: string) =>
  requireValue(
    productionSites(s).find((l) => l.siteId === siteId),
    siteId,
  ).remaining;

it("채석장도 벌목처럼 고갈된 광맥 대신 연결된 이웃 광맥에서 계속 캔다", () => {
  const w = createPlayState();
  let s = createTimberState({
    ...w,
    minute: 540,
    resources: {
      ...w.resources,
      RES_WOOD: 3000000,
      RES_METAL: 3000000,
      RES_STONE: 3000000,
    },
  });
  const candidates = [];
  for (let x = -10; x <= 20; x += 2)
    for (let z = 30; z <= 66; z += 2) candidates.push({ x, z });
  const position = requireValue(
    candidates.find((p) => {
      const [first, second] = connectedDeposits(s, "quarry", p);
      return (
        first?.siteId === "stone-bokhol-south" &&
        second?.siteId === "stone-east" &&
        !buildingIssue(s, "quarry", { position: p, headingRadians: 0 })
      );
    }),
    "두 광맥에 닿는 채석장 자리",
  );
  s = cmd(s, {
    type: "plan-building",
    kind: "quarry",
    position,
    headingRadians: 0,
  });
  for (let i = 0; i < 500 && s.town.orders.length; i++) s = advanceTimber(s, 1);
  const quarry = requireValue(s.town.facilities[0], "채석장");
  expect(quarry.sourceId).toBe("stone-bokhol-south");
  s = cmd(s, { type: "facility-staff", id: quarry.id, count: 4 });
  const neighbour = remaining(s, "stone-east");
  const first = remaining(s, "stone-bokhol-south");
  // 첫 광맥이 이미 바닥난 이전 저장의 채석장.
  s = {
    ...s,
    mineralSites: s.mineralSites.map((l) =>
      l.siteId === "stone-bokhol-south" ? { ...l, remaining: 0 } : l,
    ),
    town: {
      ...s.town,
      extracted: {
        ...s.town.extracted,
        "stone-bokhol-south":
          (s.town.extracted["stone-bokhol-south"] ?? 0) + first,
      },
    },
  };
  s = advanceTimber(s, 1440);
  expect(s.town.facilities[0]?.sourceId).toBe("stone-east");
  expect(remaining(s, "stone-east")).toBeLessThan(neighbour);
  expect(remaining(s, "stone-bokhol-south")).toBe(0);
});
