import { describe, expect, it } from "vitest";
import { AMOUNT_SCALE, createPlayState } from "./play.js";
import {
  advanceTimber,
  commandTimber,
  createTimberSave,
  createTimberState,
  nearestRepairResident,
  parseTimberSave,
  parseTimberState,
  TIMBER_RULES,
  type TimberCommand,
  type TimberOffer,
  type TimberState,
  tickTimber,
  timberCartPosition,
  timberScene,
} from "./timber.js";

function fixture(offer: TimberOffer = "A", world = createPlayState()) {
  let state = createTimberState(world),
    id = 0;
  const command = (c: TimberCommand) =>
    (state = commandTimber(state, c, `command-${++id}`));
  command({ type: "choose", offer });
  return {
    command,
    get state() {
      return state;
    },
  };
}
function finish(f: ReturnType<typeof fixture>) {
  while (f.state.due !== null) f.command({ type: "next" });
}
describe("자동 조달", () => {
  it("건조와 보수 인력도 업무가 끝나면 집으로 돌아간다", () => {
    const f = fixture("A");
    f.command({ type: "contract" });
    finish(f);
    expect(f.state.residents.some((r) => r.routine === "warmth")).toBe(true);
    f.command({ type: "advance", minutes: 18 * 60 - f.state.world.minute });
    f.command({ type: "advance", minutes: 20 });
    for (const r of f.state.residents) expect(r.position).toEqual(r.home);
    f.command({ type: "building-damage", cause: "fire", amount: 25 });
    f.command({ type: "use" });
    finish(f);
    expect(f.state.residents.every((r) => r.task === null)).toBe(true);
    f.command({ type: "advance", minutes: 20 });
    for (const r of f.state.residents) expect(r.position).toEqual(r.home);
  });
  it("다음 업무는 주민 선택 없이 예약하고 운송을 마친 뒤 그 장소로 인계한다", () => {
    const f = fixture("B");
    f.command({ type: "contract" });
    while (f.state.phase !== "returning") f.command({ type: "next" });
    let s: TimberState = {
      ...f.state,
      residents: f.state.residents.map((r) =>
        r.id === f.state.transportWorkerId
          ? r
          : { ...r, workplaceId: "workshop" },
      ),
    };
    s = advanceTimber(s, 1);
    const from = timberScene(s).entities.find(
      (e) => e.id === s.transportWorkerId,
    )?.position;
    s = commandTimber(
      s,
      { type: "queue-work", workId: "next-order", position: { x: 7, z: -4 } },
      "queue",
    );
    const after = timberScene(s).entities.find(
      (e) => e.id === s.transportWorkerId,
    )?.position;
    expect(after).toEqual(from);
    s = advanceTimber(s, 20);
    expect(s.residents.find((r) => r.id === s.transportWorkerId)).toMatchObject(
      { position: { x: 7, z: -4 }, task: "next-order", nextWork: null },
    );
    expect(s.world.resources.RES_WOOD).toBe(140 * AMOUNT_SCALE);
  });
  it("짐을 내린 주민은 빈 수레와 야적장을 가로지르지 않고 복귀한다", () => {
    const f = fixture("B");
    f.command({ type: "contract" });
    while (f.state.phase !== "returning") f.command({ type: "next" });
    for (let i = 0; i < 20 && f.state.phase === "returning"; i++) {
      const resident = timberScene(f.state).entities.find(
        (e) => e.id === f.state.transportWorkerId,
      );
      if (!resident) throw Error("운송 주민이 없습니다.");
      expect(
        Math.abs(resident.position.x - TIMBER_RULES.yard.x) <= 1.75 &&
          Math.abs(resident.position.z - TIMBER_RULES.yard.z) <= 1.75,
      ).toBe(false);
      f.command({ type: "advance", minutes: 1 });
    }
    expect(f.state.phase).toBe("ready");
  });
  it.each(["A", "B"] as const)(
    "계약%s만으로 운송·검수·복귀·공동 재고·다음 임무까지 진행한다",
    (offer) => {
      const f = fixture(offer),
        before = f.state.world.resources;
      f.command({ type: "contract" });
      expect(f.state.paused).toBe(false);
      expect(f.state.phase).toBe("approaching");
      expect(f.state.world.resources.RES_METAL).toBe(
        before.RES_METAL - TIMBER_RULES.offers[offer].cost * AMOUNT_SCALE,
      );
      finish(f);
      expect(f.state.phase).toBe("ready");
      expect(f.state.workerIds).toHaveLength(0);
      expect(f.state.world.resources.RES_WOOD).toBe(
        before.RES_WOOD + 20 * AMOUNT_SCALE,
      );
      expect(f.state.stock).toEqual({
        cart: 0,
        waiting: 0,
        quarantine: 0,
        available: 20,
        used: 0,
      });
      expect(f.state.mission).toBe("register-policy");
      expect(f.state.settledAt).not.toBeNull();
      expect(f.state.buildingHealth).toBe(100);
      expect(f.state.repairWorkerId).toBeNull();
      expect(f.state.world.resources.RES_PLANT).toBe(before.RES_PLANT);
    },
  );
  it("실제 시간만으로 완료하고 중복 입고하지 않는다", () => {
    let s = fixture("B").command({ type: "contract" });
    for (let i = 0; i < 90; i++) s = tickTimber(s, 1000);
    expect(s.settledAt).not.toBeNull();
    expect(s.world.resources.RES_WOOD).toBe(140 * AMOUNT_SCALE);
    const t = s.settledAt;
    s = advanceTimber(s, 60);
    expect(s.world.resources.RES_WOOD).toBe(140 * AMOUNT_SCALE);
    expect(s.settledAt).toBe(t);
  });
  it("부분 검수와 보완은 공동 재고에 한 번씩 반영한다", () => {
    const f = fixture();
    f.command({ type: "contract" });
    while (f.state.phase !== "unloading") f.command({ type: "next" });
    f.command({ type: "advance", minutes: 1 });
    expect(f.state.stock).toMatchObject({ cart: 14, waiting: 6, available: 0 });
    f.command({ type: "next" });
    expect(f.state.phase).toBe("inspecting");
    f.command({ type: "next" });
    expect(f.state.phase).toBe("returning");
    expect(f.state.stock).toMatchObject({ available: 16, quarantine: 4 });
    expect(f.state.world.resources.RES_WOOD).toBe(136 * AMOUNT_SCALE);
    finish(f);
    expect(f.state.world.resources.RES_WOOD).toBe(140 * AMOUNT_SCALE);
  });
  it("긴 시간 진행과 분할 진행의 결과가 같다", () => {
    const original = fixture().command({ type: "contract" });
    const one = advanceTimber(original, 90);
    let split = original;
    for (let i = 0; i < 90; i++) split = advanceTimber(split, 1);
    expect(split).toEqual(one);
  });
  it("중복 입력과 재계약이 비용·물량을 복제하지 않는다", () => {
    const f = fixture();
    const s = f.command({ type: "contract" });
    const id = s.processed.at(-1);
    if (!id) throw Error();
    expect(commandTimber(s, { type: "contract" }, id)).toEqual(s);
    expect(() => f.command({ type: "contract" })).toThrow();
  });
  it("비용 부족이나 근무 중인 주민은 부분 예약·지출하지 않는다", () => {
    const w = createPlayState(),
      poor = { ...w, resources: { ...w.resources, RES_METAL: 0 } },
      f = fixture("B", poor),
      old = f.state;
    expect(() => f.command({ type: "contract" })).toThrow("공동 철재");
    expect(f.state).toEqual(old);
    const s = fixture().state,
      busy = {
        ...s,
        residents: s.residents.map((r) => ({ ...r, workplaceId: "workshop" })),
      };
    expect(() => commandTimber(busy, { type: "contract" }, "busy")).toThrow(
      "유휴 주민",
    );
    expect(busy.world.resources.RES_METAL).toBe(w.resources.RES_METAL);
  });
  it("작업장 인력을 빼오지 않고 보완 인력을 기다린다", () => {
    const f = fixture();
    let s: TimberState = {
      ...f.state,
      residents: f.state.residents.map((r, i) => ({
        ...r,
        workplaceId: i === 3 ? null : "workshop",
      })),
    };
    s = commandTimber(s, { type: "contract" }, "start");
    s = advanceTimber(s, 90);
    expect(s.phase).toBe("waiting-labor");
    expect(s.workerIds).toHaveLength(0);
    expect(s.world.resources.RES_WOOD).toBe(136 * AMOUNT_SCALE);
  });
  it("수동 배분과 명령 없는 보수를 하지 않는다", () => {
    const f = fixture("B");
    f.command({ type: "contract" });
    finish(f);
    const wood = f.state.world.resources.RES_WOOD;
    f.command({ type: "advance", minutes: 20 });
    expect(f.state.buildingHealth).toBe(100);
    expect(f.state.stock.used).toBe(0);
    expect(() => f.command({ type: "use" })).toThrow("정상 건물");
    f.command({ type: "building-damage", cause: "fire", amount: 25 });
    f.command({ type: "advance", minutes: 10 });
    expect(f.state.buildingHealth).toBe(75);
    expect(f.state.workerIds).toHaveLength(0);
    f.command({ type: "use" });
    expect(f.state.repairWorkerId).not.toBeNull();
    expect(f.state.reservedWood).toBe(20);
    expect(f.state.world.resources.RES_WOOD).toBe(wood);
    finish(f);
    expect(f.state.buildingHealth).toBe(100);
    expect(f.state.world.resources.RES_WOOD).toBe(wood - 20 * AMOUNT_SCALE);
    f.command({ type: "building-damage", cause: "fire", amount: 25 });
    f.command({ type: "use" });
    finish(f);
    expect(f.state.world.resources.RES_WOOD).toBe(wood - 40 * AMOUNT_SCALE);
  });
  it("가까워도 배치·업무·통행 제한 주민을 제외한다", () => {
    const residents = [
      {
        id: "busy",
        position: { x: 0, z: -3.1 },
        workplaceId: "shop",
        task: null,
      },
      {
        id: "task",
        position: { x: 0.1, z: -3 },
        workplaceId: null,
        task: "construction",
      },
      {
        id: "blocked",
        position: { x: 0, z: -1 },
        workplaceId: null,
        task: null,
      },
      { id: "near", position: { x: 3, z: -5 }, workplaceId: null, task: null },
      { id: "far", position: { x: -4, z: -3 }, workplaceId: null, task: null },
    ];
    expect(
      nearestRepairResident(residents, { x: 0, z: -3 }, [TIMBER_RULES.house]),
    ).toBe("near");
  });
  it("P01 자동 전환과 정책 선택이 물자를 만들지 않는다", () => {
    const f = fixture("B");
    expect(() => f.command({ type: "set-policy", policy: "relief" })).toThrow();
    f.command({ type: "contract" });
    finish(f);
    const before = f.state.world.resources;
    f.command({ type: "set-policy", policy: "relief" });
    expect(f.state.policy).toBe("relief");
    expect(f.state.mission).toBe("village-orders");
    expect(f.state.world.resources).toEqual(before);
    expect(() =>
      f.command({ type: "set-policy", policy: "registry" }),
    ).toThrow();
  });
  it.each([
    "approaching",
    "transport",
    "parking",
    "releasing",
    "unloading",
    "inspecting",
    "returning",
    "drying-travel",
    "drying",
  ] as const)("%s 도중 저장·종료 시각 검사", (phase) => {
    const f = fixture();
    f.command({ type: "contract" });
    while (f.state.phase !== phase) f.command({ type: "next" });
    const save = createTimberSave(f.state);
    expect(parseTimberSave(JSON.parse(JSON.stringify(save))).state).toEqual(
      f.state,
    );
    expect(() =>
      parseTimberState({ ...f.state, due: (f.state.due ?? 0) + 1 }),
    ).toThrow("종료 시각");
  });
  it.each(["version", "stock", "ledger", "worker", "history", "mission"])(
    "손상 저장 거부: %s",
    (field) => {
      const f = fixture();
      f.command({ type: "contract" });
      const bad = JSON.parse(JSON.stringify(f.state));
      if (field === "version") bad.version = 5;
      if (field === "stock") bad.stock.cart = 21;
      if (field === "ledger") bad.world.resources.RES_WOOD++;
      if (field === "worker") bad.workerIds = ["missing"];
      if (field === "history") bad.history[0].id = 2;
      if (field === "mission") bad.mission = "register-policy";
      expect(() => parseTimberState(bad)).toThrow();
    },
  );
  it("정지·3배속·나머지·현실 지연 시간 제한", () => {
    const f = fixture();
    const original = f.command({ type: "contract" });
    f.command({ type: "pause", paused: true });
    expect(tickTimber(f.state, 1000)).toEqual(f.state);
    const s = { ...original, speed: 3 as const },
      a = tickTimber(s, 500),
      b = tickTimber(a, 500);
    expect(b.elapsed).toBe(3);
    expect(b.remainder).toBe(0);
    expect(tickTimber(s, 50000).elapsed).toBe(3);
  });
  it("짐이 야적장에 도착하며 주민은 그 앞에서 끈다", () => {
    const f = fixture("B");
    f.command({ type: "contract" });
    f.command({ type: "next" });
    f.command({ type: "next" });
    expect(timberCartPosition(f.state)).toEqual(TIMBER_RULES.yard);
    const worker = timberScene(f.state).entities.find(
      (e) => e.id === f.state.transportWorkerId,
    );
    expect(worker?.position.x).toBe(
      TIMBER_RULES.yard.x + TIMBER_RULES.pullOffset,
    );
    expect(worker?.position.z).toBe(TIMBER_RULES.yard.z);
  });
});

it("야적 식량은 저장을 이어 하루 지나면 줄고 저장소로 옮기면 보존된다", () => {
  const base = createTimberState();
  // Fish above the starting shared space (500) lies in the yard.
  const before = {
    ...base,
    elapsed: 1439,
    yardFoodSince: { RES_FISH: 0 },
    world: {
      ...base.world,
      resources: { ...base.world.resources, RES_FISH: 600 * AMOUNT_SCALE },
    },
  };
  const resumed = parseTimberSave(createTimberSave(before)).state;
  const exposed = advanceTimber(resumed, 1);
  // Two stores (1000) hold all of it.
  const protectedStock = advanceTimber(
    {
      ...resumed,
      coveredStock: { ...resumed.coveredStock, RES_FISH: 600 },
      logging: { ...resumed.logging, storageBuilt: true },
      loggingSites: resumed.loggingSites.map((site, i) =>
        i === 0 ? { ...site, storageBuilt: true } : site,
      ),
    },
    1,
  );
  expect(exposed.world.resources.RES_FISH).toBe(
    protectedStock.world.resources.RES_FISH - AMOUNT_SCALE,
  );
  expect(protectedStock.yardFoodSince?.RES_FISH).toBeUndefined();
  expect(exposed.yardFoodSince?.RES_FISH).toBe(1440);
});

it("야적장의 젖은 목재는 건조 후 돌아오고 저장소에서는 젖지 않는다", () => {
  const start = createTimberState();
  const thaw = (state: TimberState) =>
    commandTimber(
      commandTimber(state, { type: "cold-weather", cold: true }, "freeze"),
      { type: "cold-weather", cold: false },
      "thaw",
    );
  const wet = thaw(start);
  expect(wet.world.resources.RES_WOOD).toBe(
    start.world.resources.RES_WOOD - AMOUNT_SCALE,
  );
  expect(
    advanceTimber(parseTimberSave(createTimberSave(wet)).state, 60).world
      .resources.RES_WOOD,
  ).toBe(start.world.resources.RES_WOOD);
  const covered = thaw({
    ...start,
    logging: { ...start.logging, storageBuilt: true },
  });
  expect(covered.yardDryAt).toBeUndefined();
  expect(covered.world.resources.RES_WOOD).toBe(start.world.resources.RES_WOOD);
});

it("다섯 정찰의 귀환 전에는 2단계를 열 수 없고 귀환과 단계는 저장에 남는다", () => {
  const initial = createTimberState();
  const sent = commandTimber(
    initial,
    { type: "scout-sites", ids: ["reed", "pine", "forge", "hunt", "record"] },
    "scouts",
  );
  expect(() =>
    commandTimber(sent, { type: "begin-chapter-two" }, "early"),
  ).toThrow();
  const loaded = parseTimberSave(createTimberSave(sent)).state;
  expect(loaded.scoutDepartures).toEqual(sent.scoutDepartures);
  const later = {
    ...loaded,
    world: { ...loaded.world, day: loaded.world.day + 3 },
  };
  const next = commandTimber(later, { type: "begin-chapter-two" }, "return");
  expect(parseTimberSave(createTimberSave(next)).state.chapter).toBe(2);
});
