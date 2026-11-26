import { describe, expect, it, vi } from "vitest";
import { campaignOf } from "./campaign.js";
import { advanceMutants, mutantRepairCost, mutantWound } from "./mutants.js";
import { AMOUNT_SCALE } from "./play.js";
import { requireValue } from "./require-value.js";
import {
  advanceTimber,
  commandTimber,
  createTimberSave,
  createVillageGame,
  gateRaid,
  parseTimberSave,
} from "./timber.js";

function bitten(draw: number) {
  const initial = createVillageGame(false, true);
  const night = { ...initial, world: { ...initial.world, minute: 1260 } };
  const id = requireValue(night.residents[0], "부상 주민").id;
  const wounded = commandTimber(
    night,
    {
      type: "citizen-event",
      event: {
        id: "mutant-bite",
        type: "illness",
        severity: "major",
        citizenIds: [id],
      },
    },
    "record-bite",
  );
  return mutantWound(wounded, id, () => draw);
}
describe("변종 야습", () => {
  it("부상 판정 후 20% 경계에서만 변종이 되고, 사망자는 변하지 않는다", () => {
    expect(bitten(0.2).mutants).toBeUndefined();
    const s = bitten(0.19999);
    expect(s.residents.filter((r) => r.health === "sick")).toHaveLength(1);
    expect(s.mutants).toHaveLength(1);
    const fatal = gateRaid(
      {
        ...createVillageGame(false, true),
        world: {
          ...s.world,
          citizens: createVillageGame(false, true).world.citizens,
        },
      },
      () => 0,
    );
    expect(fatal.raid?.dead).toBe(10);
    expect(fatal.mutants).toBeUndefined();
  });
  it("도성에서는 포졸 배치를 기다리지 않고 변종을 진압한다", () => {
    const s = bitten(0);
    const city = {
      ...s,
      campaign: { ...campaignOf(s), beat: "capital" as const },
    };
    expect(advanceMutants(city, () => 0.99).mutants).toHaveLength(0);
    const hit = advanceMutants(
      city,
      vi
        .fn()
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0)
        .mockReturnValue(0.99),
    );
    expect(hit.mutants).toHaveLength(0);
    expect(
      hit.world.citizenEvents?.some((id) => id.startsWith("mutant-")),
    ).toBe(true);
  });
  it("마지막 순라 포졸이 다쳐도 시간이 흐르고 변종 사건은 남는다", () => {
    const assigned = commandTimber(
      bitten(0),
      { type: "set-guards", count: 4 },
      "guards",
    );
    const guards = assigned.residents.filter((r) => r.workplaceId === "office");
    const lastGuard = guards[3]!;
    const before = parseTimberSave(
      createTimberSave(
        commandTimber(
          assigned,
          {
            type: "citizen-event",
            event: {
              id: "wounded-guards",
              type: "illness",
              severity: "major",
              citizenIds: guards.slice(0, 3).map((r) => r.id),
            },
          },
          "wounded-guards",
        ),
      ),
    ).state;
    const healthy = before.residents.filter((r) => r.health === "healthy");
    expect(healthy.filter((r) => r.workplaceId === "office")).toEqual([
      lastGuard,
    ]);
    const roll = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(
        (healthy.findIndex((r) => r.id === lastGuard.id) + 0.5) /
          healthy.length,
      )
      .mockReturnValue(0.99);
    try {
      const next = commandTimber(
        before,
        { type: "advance", minutes: 1 },
        "tick",
      );
      expect(next.elapsed).toBe(before.elapsed + 1);
      expect(next.residents.find((r) => r.id === lastGuard.id)?.health).toBe(
        "sick",
      );
      expect(next.mutants).toEqual([
        { id: before.mutants![0]!.id, due: next.elapsed + 30 },
      ]);
    } finally {
      roll.mockRestore();
    }
  });
  it("출동, 미대응 시 주민 피해, 건물별 누적 손상과 자원 결제를 구별한다", () => {
    const s = bitten(0);
    const waiting = parseTimberSave(
      createTimberSave({ ...s, elapsed: 30 }),
    ).state;
    const responded = commandTimber(
      waiting,
      { type: "set-guards", count: 4 },
      "guards",
    );
    expect(
      commandTimber(
        responded,
        {
          type: "contain-mutant",
          resident: requireValue(
            requireValue(s.mutants, "s.mutants")[0],
            "s.mutants[0]",
          ).id,
        },
        "contain",
      ).mutants,
    ).toHaveLength(0);
    expect(
      advanceMutants(waiting, () => 0).residents.filter(
        (r) => r.health === "sick",
      ),
    ).toHaveLength(2);
    let hit = advanceMutants(waiting, () => 0.99);
    const id = requireValue(
      Object.keys(requireValue(hit.mutantDamage, "hit.mutantDamage"))[0],
      "Object.keys(hit.mutantDamage)[0]",
    );
    expect(hit.mutantDamage?.[id]).toBe(25);
    for (let i = 0; i < 3; i++)
      hit = advanceMutants({ ...hit, elapsed: hit.elapsed + 30 }, () => 0.99);
    expect(hit.mutantDamage?.[id]).toBe(100);
    expect(hit.residents.some((r) => r.homeId === id)).toBe(false);
    const cost = mutantRepairCost(hit, id);
    expect(cost.RES_WOOD + cost.RES_STONE).toBe(50);
    const repaired = commandTimber(
      hit,
      { type: "repair-mutant", building: id },
      "repair",
    );
    expect(repaired.mutantDamage?.[id]).toBeUndefined();
    expect(repaired.world.resources.RES_STONE).toBe(
      hit.world.resources.RES_STONE - cost.RES_STONE * AMOUNT_SCALE,
    );
    expect(() =>
      commandTimber(repaired, { type: "repair-mutant", building: id }, "again"),
    ).toThrow();
  });

  it("resolves a scheduled mutant attack with both ledgers full", () => {
    const s = bitten(0);
    const before = parseTimberSave(
      createTimberSave({
        ...s,
        elapsed: 29,
        processed: Array.from({ length: 1999 }, (_, i) => `command-${i}`),
        world: {
          ...s.world,
          citizenEvents: Array.from({ length: 2000 }, (_, i) => `event-${i}`),
        },
      }),
    ).state;
    const random = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValue(0.99);
    try {
      const after = parseTimberSave(
        createTimberSave(advanceTimber(before, 1)),
      ).state;
      expect(after.elapsed).toBe(30);
      expect(after.residents.filter((r) => r.health === "sick")).toHaveLength(
        2,
      );
      expect(after.mutants).toEqual([{ id: s.mutants?.[0]?.id, due: 60 }]);
      expect(after.processed).toEqual(before.processed);
      expect(after.world.citizenEvents).toEqual(before.world.citizenEvents);
    } finally {
      random.mockRestore();
    }
  });
});
