import { isMechanical, upgradeCost } from "./development.js";
import { requireValue } from "./require-value.js";
import {
  applyAutomaticCitizenEvent,
  note,
  type TimberState,
} from "./timber.js";
import { BUILDING_RULES, payTown } from "./town.js";
import { assignHomes } from "./village-services.js";

export const mutantNames: Record<string, string> = {
  R02: "트리케라톱스",
  R03: "벨로키랍토르",
  SPINO: "스피노사우루스",
};
export function mutantStructure(s: TimberState, id: string) {
  const facility = s.town.facilities.find((f) => f.id === id);
  if (facility) return BUILDING_RULES[facility.kind];
  if (s.homes.some((h) => h.id === id)) return BUILDING_RULES.home;
  return undefined;
}
export function mutantRepairCost(s: TimberState, id: string) {
  const building = mutantStructure(s, id),
    damage = s.mutantDamage?.[id];
  if (!building || !damage) throw Error("수리할 손상이 없습니다.");
  const facility = s.town.facilities.find((f) => f.id === id);
  const level = facility?.level ?? s.homes.find((h) => h.id === id)?.level ?? 1;
  const costs = [
    building.cost,
    ...Array.from({ length: level - 1 }, (_, i) =>
      upgradeCost({ kind: facility?.kind ?? "home", level: i + 1 }),
    ),
  ];
  const price = costs.reduce(
    (total, cost) => total + Object.values(cost).reduce((a, b) => a + b, 0),
    0,
  );
  const units = Math.ceil((price * damage) / 100);
  const stone = Math.round(
    (units *
      (building.cost.RES_STONE ??
        building.cost.RES_METAL ??
        (building.cost.RES_WOOD ?? 0) / 5)) /
      Object.values(building.cost).reduce((a, b) => a + b, 0),
  );
  return { RES_WOOD: units - stone, RES_STONE: stone };
}
export function usableHomes(
  s: Pick<TimberState, "homes" | "mutantDamage" | "buildingHealth">,
  homes = s.homes,
) {
  return homes.filter(
    (h) =>
      s.mutantDamage?.[h.id] !== 100 &&
      (s.buildingHealth > 0 || h.id !== "example-building-1"),
  );
}
export function repairMutantDamage(s: TimberState, id: string) {
  const paid = payTown(s, mutantRepairCost(s, id));
  const damage = { ...s.mutantDamage };
  delete damage[id];
  const repaired = { ...paid, mutantDamage: damage };
  if (s.mutantDamage?.[id] === 100 && s.homes.some((h) => h.id === id))
    return note(
      {
        ...repaired,
        residents: assignHomes(
          s.residents,
          s.world.citizens,
          usableHomes(repaired),
        ),
      },
      "온돌 둥지를 다시 쓸 수 있습니다.",
    );
  return note(
    repaired,
    requireValue(mutantStructure(s, id), "수리할 건물").name +
      " 수리를 마쳤습니다.",
  );
}
function policeAvailable(s: TimberState) {
  return (
    s.campaign?.beat === "capital" ||
    s.residents.some(
      (r) =>
        r.workplaceId === "office" &&
        r.health === "healthy" &&
        !s.mutants?.some((m) => m.id === r.id),
    )
  );
}
export function mutantWound(s: TimberState, id: string, random: () => number) {
  if (random() >= 0.2) return s;
  if (s.mutants?.some((m) => m.id === id)) return s;
  return note(
    {
      ...s,
      mutants: [
        ...(s.mutants ?? []),
        { id, due: s.elapsed + (policeAvailable(s) ? 1 : 30) },
      ],
    },
    "달이: 상처를 싸매 주는데 눈이 새빨개졌어. 내 목소리도 못 알아들어. 옆집 새끼들부터 골목 밖으로 데려갈게!",
  );
}
export function containMutant(s: TimberState, id: string) {
  if (!s.mutants?.some((m) => m.id === id))
    throw Error("이미 끝난 출동입니다.");
  if (!policeAvailable(s))
    throw Error("관아에 순라 포졸을 먼저 배치해 주세요.");
  return note(
    { ...s, mutants: s.mutants.filter((m) => m.id !== id) },
    "포졸: 골목을 비웠습니다. 다친 분은 별채에 모셨으니 의원을 불러 주십시오.",
  );
}
export function advanceMutants(
  s: TimberState,
  random = Math.random,
): TimberState {
  for (const m of s.mutants ?? []) {
    if (!s.world.citizens.find((c) => c.id === m.id)?.alive) {
      s = { ...s, mutants: (s.mutants ?? []).filter((q) => q.id !== m.id) };
      continue;
    }
    const responding = policeAvailable(s);
    if (!responding && m.due > s.elapsed) continue;
    if (responding && random() >= 0.25) {
      s = containMutant(s, m.id);
      continue;
    }
    const targets = [...s.homes, ...s.town.facilities].filter(
      (f) => (s.mutantDamage?.[f.id] ?? 0) < 100,
    );
    const residents = s.residents.filter(
      (r) =>
        r.health === "healthy" &&
        !isMechanical(s, r.id) &&
        !s.mutants?.some((q) => q.id === r.id) &&
        !r.task?.startsWith("expedition:") &&
        !r.task?.startsWith("scout:") &&
        r.task !== "patrol-recovery",
    );
    if (residents.length && (!targets.length || random() < 0.5)) {
      const victim = residents[Math.floor(random() * residents.length)];
      if (!victim) continue;
      const key = "mutant-" + m.id + "-" + s.elapsed;
      s = applyAutomaticCitizenEvent(s, {
        id: key,
        type: "illness",
        citizenIds: [victim.id],
        severity: "major",
      });
      s = note(
        mutantWound(s, victim.id, random),
        "주민: 날 못 알아보더니 그대로 덮쳤어. 의원 좀 불러 줘!",
      );
    } else if (targets.length) {
      const target = targets[Math.floor(random() * targets.length)];
      if (!target) continue;
      const damage = Math.min(100, (s.mutantDamage?.[target.id] ?? 0) + 25);
      s = note(
        { ...s, mutantDamage: { ...s.mutantDamage, [target.id]: damage } },
        BUILDING_RULES["kind" in target ? target.kind : "home"].name +
          (damage === 100 ? "이 무너졌습니다." : " 기둥이 부러졌습니다."),
      );
      if (damage === 100 && s.homes.some((h) => h.id === target.id))
        s = {
          ...s,
          residents: assignHomes(s.residents, s.world.citizens, usableHomes(s)),
        };
    }
    // The attack may have injured the last available guard.
    if (policeAvailable(s)) {
      s = containMutant(s, m.id);
      continue;
    }
    s = {
      ...s,
      mutants: (s.mutants ?? []).map((q) =>
        q.id === m.id ? { ...q, due: s.elapsed + 30 } : q,
      ),
    };
  }
  return s;
}
