import { findById } from "./lookup.js";
import {
  applyCitizenEvent,
  incidentChance,
  productionMultiplier,
  type ResourceId,
} from "./play.js";
import catalog from "./research-catalog.json" with { type: "json" };
import { workplaceOpen } from "./resident-routine.js";
import {
  createResearchStory,
  type ResearchStory,
  storyResearchValid,
} from "./story-research.js";
import type { TimberState } from "./timber.js";
import {
  BUILDING_RULES,
  type BuildingOrder,
  buildingPower,
  type Facility,
  facilityDoor,
  facilityResource,
  originalBuildingCost,
  payTown,
  reconcileTownHealth,
} from "./town.js";

/** Advances the saved village random seed (32-bit LCG). */
export function nextVillageSeed(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}
export const RESEARCH_CATALOG = catalog;
export const RESEARCH_CONNECTED = catalog
  .filter((r) => r.connected)
  .map((r) => r.id);
export interface DevelopmentState {
  completed: string[];
  story: ResearchStory;
  electrical: string[];
  grandfathered: string[];
  research: { tech: string; facility: string; work: number }[];
  overtime: {
    target: string;
    day: number;
    minutes: number;
    enabled: boolean;
  }[];
  tradeCount: number;
  seed: number;
  injuries: { resident: string; minute: number }[];
}
export const createDevelopment = (): DevelopmentState => ({
  completed: [],
  story: createResearchStory(),
  electrical: [],
  grandfathered: [],
  research: [],
  overtime: [],
  tradeCount: 0,
  seed: 13746389,
  injuries: [],
});
export const tradeRank = (s: TimberState): 1 | 2 | 3 =>
  s.town.development.tradeCount >= 3
    ? 3
    : s.town.development.tradeCount >= 1
      ? 2
      : 1;
export const hasResearch = (s: TimberState, id: string) =>
  s.town.development.completed.includes(id);
export const levelProductionRate = (f: Facility) =>
  [1, 1.5, 2][f.level - 1] ?? 1;
export const resourceRate = (s: TimberState, resource: ResourceId) =>
  hasResearch(s, `GATHER_${resource}_2`)
    ? 2
    : hasResearch(s, `GATHER_${resource}_1`)
      ? 1.5
      : 1;
export const collectionRate = (s: TimberState, f: Facility) =>
  Math.max(
    levelProductionRate(f),
    facilityResource(f)
      ? resourceRate(s, facilityResource(f) as ResourceId)
      : 1,
    s.town.development.electrical.includes(f.id) ? 2 : 1,
  );
export const productionRate = (s: TimberState, f: Facility) =>
  productionMultiplier(s.campaign?.difficulty) *
  Math.min(
    2,
    Math.max(
      collectionRate(s, f),
      f.kind === "farm" && hasResearch(s, "TECH_CULTURE") ? 1.2 : 1,
    ),
  );
export const isMechanical = (s: TimberState, id: string) =>
  !!findById(s.world.citizens, id)?.mechanicalFrom;
export const upgradeResearch = (kind: string, level: number) =>
  catalog.find(
    (r) => r.category === "building" && r.target === kind && r.level === level,
  )?.id;
export function upgradeTarget(s: TimberState, id: string) {
  const f = s.town.facilities.find((f) => f.id === id);
  if (f) return f;
  const h = s.homes.find((h) => h.id === id);
  return h
    ? {
        ...h,
        kind: "home" as const,
        level: h.level ?? 1,
        sourceId: null,
        headingRadians: h.headingRadians ?? Math.PI,
      }
    : null;
}
export function upgradeIssue(s: TimberState, id: string): string | null {
  const f = upgradeTarget(s, id);
  if (!f || f.level >= 3) return "건물은3단계까지만 개량할 수 있어요.";
  if (s.town.orders.some((o) => o.upgradeTarget === id))
    return "이미 개량 대기 중입니다.";
  const research = upgradeResearch(f.kind, f.level + 1);
  if (
    !research ||
    (!hasResearch(s, research) &&
      !s.town.development.grandfathered.includes(`${id}:${f.level + 1}`))
  )
    return `${BUILDING_RULES[f.kind].name} ${f.level + 1}단계 개량 연구가 필요합니다.`;
  return null;
}
export function setElectricalWork(
  s: TimberState,
  id: string,
  enabled: boolean,
): TimberState {
  if (
    !hasResearch(s, "TECH_ELECTRICAL") ||
    s.town.development.story.route !== "dictatorship" ||
    typeof enabled !== "boolean" ||
    !s.town.facilities.some((f) => f.id === id && facilityResource(f))
  )
    throw Error(
      "독재 노선의 전기자극기 연구를 완료한 뒤 생산시설을 지정해 주세요.",
    );
  const electrical = s.town.development.electrical.filter(
    (target) => target !== id,
  );
  if (enabled) electrical.push(id);
  return {
    ...s,
    town: { ...s.town, development: { ...s.town.development, electrical } },
  };
}
export const scoutSpeedRate = (s: TimberState) =>
  hasResearch(s, "TECH_FLIGHT")
    ? 10
    : hasResearch(s, "TECH_SCOUT_SPEED_2")
      ? 2
      : hasResearch(s, "TECH_TRAIL")
        ? 1.5
        : 1;
export function townShiftOpen(s: TimberState, target: string): boolean {
  return (
    workplaceOpen(s.world.minute) ||
    (s.world.minute >= 1080 &&
      s.world.minute < 1260 &&
      s.town.development.overtime.some(
        (o) => o.target === target && o.day === s.world.day && o.enabled,
      ))
  );
}
export function residentShiftOpen(s: TimberState, id: string): boolean {
  const r = findById(s.residents, id);
  if (
    r?.workplaceId?.startsWith("facility:") &&
    s.mutantDamage?.[r.workplaceId.slice(9)] === 100
  )
    return false;
  const order = s.town.orders.find((o) => o.crew.includes(id));
  return (
    isMechanical(s, id) ||
    townShiftOpen(
      s,
      order?.id ?? r?.workplaceId?.replace("facility:", "") ?? "",
    )
  );
}
export function setOvertime(
  s: TimberState,
  target: string,
  enabled: boolean,
): TimberState {
  const facility = s.town.facilities.find((f) => f.id === target);
  if (
    typeof enabled !== "boolean" ||
    (!s.town.orders.some((o) => o.id === target) &&
      (!facility ||
        (!facilityResource(facility) && facility.kind !== "workshop")))
  )
    throw Error("야근을 지정할 공사·생산시설·기술 공방을 선택해 주세요.");
  if (enabled && s.world.minute >= 1260)
    throw Error("오늘 야근은21시에 끝났습니다. 다음 날 지정해 주세요.");
  const overtime = s.town.development.overtime.filter(
    (o) => o.target !== target && o.day === s.world.day,
  );
  const old = s.town.development.overtime.find(
    (o) => o.target === target && o.day === s.world.day,
  );
  overtime.push({
    ...old,
    target,
    day: s.world.day,
    minutes: old?.minutes ?? 0,
    enabled,
  });
  return {
    ...s,
    town: { ...s.town, development: { ...s.town.development, overtime } },
  };
}
export const orderWork = (o: BuildingOrder) =>
  BUILDING_RULES[o.kind].work *
  (o.upgradeTarget && o.upgradeLevel === 2 ? 0.75 : 1);
export function upgradeCost(f: {
  kind: keyof typeof BUILDING_RULES;
  level: number;
}) {
  return Object.fromEntries(
    Object.entries(originalBuildingCost(f.kind)).map(([r, n]) => [
      r,
      Math.ceil(n * (f.level === 1 ? 0.5 : 0.75)),
    ]),
  ) as Partial<Record<ResourceId, number>>;
}
export function upgradeFacility(s: TimberState, id: string): TimberState {
  const issue = upgradeIssue(s, id);
  if (issue) throw Error(issue);
  const f = upgradeTarget(s, id);
  if (!f) throw Error("개량할 건물이 없습니다.");
  if (s.town.orders.length >= 100) throw Error("건설 대기열 한도입니다.");
  const n = payTown(s, upgradeCost(f));
  const o: BuildingOrder = {
    id: `build-${n.town.nextId}`,
    kind: f.kind,
    sourceId: f.sourceId,
    position: f.position,
    headingRadians: f.headingRadians,
    stage: "waiting",
    crew: [],
    workDone: 0,
    upgradeTarget: id,
    upgradeLevel: (f.level + 1) as 2 | 3,
  };
  return {
    ...n,
    paused: false,
    town: {
      ...n.town,
      nextId: n.town.nextId + 1,
      orders: [...n.town.orders, o],
    },
  };
}
function storyResearchOpen(s: TimberState, id: string) {
  return (
    s.town.development.story.rebellion ||
    (id === "R17" && (s.chapter ?? 1) >= 4)
  );
}
export function researchIssue(s: TimberState, id: string): string | null {
  const r = catalog.find((r) => r.id === id);
  if (!r) return "연구 목록에 없는 기술입니다.";
  if (!RESEARCH_CONNECTED.includes(id))
    return r.scope === "extension"
      ? "확장 기술 · 본편 잠금"
      : "기반 시스템 연결 전 · 목록만 보존";
  if (hasResearch(s, id)) return "이미 완료한 연구입니다.";
  if (s.town.development.research.some((j) => j.tech === id))
    return "이미 진행 중인 연구입니다.";
  if (
    !s.town.facilities.some(
      (f) =>
        f.kind === "workshop" &&
        !s.town.development.research.some((j) => j.facility === f.id),
    )
  )
    return "빈 연구소가 필요합니다. 연구소마다 한 건씩 동시 연구할 수 있습니다.";
  if (r.requires.some((t) => !hasResearch(s, t)))
    return "선행 연구를 먼저 완료해 주세요.";
  if (r.category === "story") {
    const story = s.town.development.story;
    if (!storyResearchOpen(s, id))
      return "양녕의 반란 사건 이후 열리는 후반 연구입니다.";
    if (r.route && story.route !== r.route)
      return "선택한 이야기 분기에서는 연구할 수 없습니다.";
    if (r.id === "TECH_MECHA2" && story.chungnyeong !== "dead")
      return "충녕 시해 사건과 의식 이전 연구가 필요합니다.";
  }
  if (r.category !== "story" && r.tier > tradeRank(s))
    return "체험판에서는 교역망2단계가 되어야 열립니다.";
  if (!s.town.facilities.some((f) => f.kind === "workshop"))
    return "기술 공방을 먼저 지어 주세요.";
  return null;
}
export function startResearch(s: TimberState, id: string): TimberState {
  const issue = researchIssue(s, id);
  if (issue) throw Error(issue);
  const r = catalog.find((r) => r.id === id),
    f = s.town.facilities.find(
      (f) =>
        f.kind === "workshop" &&
        !s.town.development.research.some((j) => j.facility === f.id),
    );
  if (!r || !f) throw Error("연구 자료가 없습니다.");
  const n = payTown(s, r.cost as Partial<Record<ResourceId, number>>);
  return {
    ...n,
    paused: false,
    town: {
      ...n.town,
      development: {
        ...n.town.development,
        research: [
          ...s.town.development.research,
          { tech: id, facility: f.id, work: 0 },
        ],
      },
    },
  };
}
export function advanceDevelopment(
  input: TimberState,
  minutes: number,
): TimberState {
  let s = input;
  for (const job of input.town.development.research) {
    const d = s.town.development;
    const r = catalog.find((r) => r.id === job.tech),
      f = s.town.facilities.find((f) => f.id === job.facility);
    if (
      r &&
      f &&
      !s.town.orders.some(
        (o) => o.upgradeTarget === f.id && o.stage !== "waiting",
      )
    ) {
      const researchers = s.residents.filter(
        (q) =>
          q.workplaceId === `facility:${f.id}` &&
          q.health === "healthy" &&
          residentShiftOpen(s, q.id) &&
          q.routine === "working" &&
          Math.hypot(
            q.position.x - facilityDoor(f).x,
            q.position.z - facilityDoor(f).z,
          ) < 0.01,
      );
      const power =
        researchers.length > 0
          ? researchers.reduce((n, q) => n + buildingPower(s, q.id), 0)
          : 0;
      const work = job.work + power * minutes * levelProductionRate(f),
        done = work >= r.workdays * 540 * 3;
      s = {
        ...s,
        town: {
          ...s.town,
          development: {
            ...d,
            research: d.research.flatMap((j) =>
              j.facility !== job.facility
                ? [j]
                : done
                  ? []
                  : [{ ...job, work }],
            ),
            completed: done ? [...d.completed, r.id] : d.completed,
            story:
              done && r.id === "TECH_MECHA2"
                ? { ...d.story, chungnyeong: "mechanical" }
                : d.story,
          },
        },
      };
    }
  }
  if (s.world.minute < 1080 || s.world.minute >= 1260) return s;
  let seed = s.town.development.seed;
  const overtime = s.town.development.overtime.map((p) => {
    if (p.day !== s.world.day || !p.enabled) return p;
    const f = s.town.facilities.find((f) => f.id === p.target),
      o = s.town.orders.find((o) => o.id === p.target);
    if (
      f?.kind === "workshop" &&
      // Research may have completed during the interval being accounted for.
      !input.town.development.research.some((j) => j.facility === f.id)
    )
      return p;
    const actors = s.residents.filter(
      (r) =>
        r.health === "healthy" &&
        (f
          ? r.workplaceId === `facility:${f.id}` &&
            r.routine === "working" &&
            Math.hypot(
              r.position.x - facilityDoor(f).x,
              r.position.z - facilityDoor(f).z,
            ) < 0.01
          : o
            ? o.stage === "build" &&
              o.crew.includes(r.id) &&
              Math.hypot(
                r.position.x - facilityDoor(o).x,
                r.position.z - facilityDoor(o).z,
              ) < 0.01
            : false),
    );
    if (!actors.length) return p;
    const old = Math.floor(p.minutes / 60),
      total = p.minutes + minutes;
    s = {
      ...s,
      world: {
        ...s.world,
        pessimism: Math.min(
          100,
          s.world.pessimism + Math.floor(total / 60) - old,
        ),
      },
    };
    for (const actor of actors) {
      seed = nextVillageSeed(seed);
      // 시간당 부상 확률을 이번 작업 시간에 맞게 환산한다.
      if (
        seed / 4294967296 <
        1 - (1 - incidentChance(0.01, s.campaign?.difficulty)) ** (minutes / 60)
      ) {
        const world = applyCitizenEvent(s.world, {
          type: "illness",
          id: `overtime-${s.world.day}-${s.elapsed}-${actor.id}`,
          citizenIds: [actor.id],
        });
        s = reconcileTownHealth({
          ...s,
          world,
          residents: s.residents.map((r) =>
            r.id === actor.id
              ? {
                  ...r,
                  health: "sick",
                  task: null,
                  workplaceId: null,
                  nextWork: null,
                  insideHome: false,
                  eatingUntil: null,
                  diningSeat: null,
                }
              : r,
          ),
        });
        s = {
          ...s,
          town: {
            ...s.town,
            development: {
              ...s.town.development,
              injuries: [
                ...s.town.development.injuries,
                { resident: actor.id, minute: s.elapsed },
              ].slice(-200),
            },
          },
        };
      }
    }
    return { ...p, minutes: total };
  });
  return {
    ...s,
    town: { ...s.town, development: { ...s.town.development, seed, overtime } },
  };
}
export function developmentValid(s: TimberState): boolean {
  const d = s.town.development;
  if (
    !d ||
    !Array.isArray(d.grandfathered) ||
    d.grandfathered.length > 2000 ||
    d.grandfathered.some(
      (id) =>
        typeof id !== "string" ||
        !/^(build-\d+|dwelling-\d+|example-building-1):[23]$/.test(id),
    ) ||
    !Array.isArray(d.completed) ||
    new Set(d.completed).size !== d.completed.length ||
    d.completed.some((t) => !RESEARCH_CONNECTED.includes(t)) ||
    !Number.isSafeInteger(d.tradeCount) ||
    d.tradeCount < 0 ||
    d.tradeCount > 10000 ||
    !Number.isSafeInteger(d.seed) ||
    d.seed < 0 ||
    d.seed > 4294967295 ||
    !Array.isArray(d.overtime) ||
    d.overtime.length > 700 ||
    !Array.isArray(d.injuries) ||
    d.injuries.length > 200
  )
    return false;
  if (!storyResearchValid(s)) return false;
  for (const id of d.completed) {
    const r = catalog.find((r) => r.id === id);
    if (
      !r ||
      r.requires.some((p) => !d.completed.includes(p)) ||
      (r.category === "story" &&
        (!storyResearchOpen(s, r.id) || (r.route && r.route !== d.story.route)))
    )
      return false;
  }
  if (
    !Array.isArray(d.research) ||
    d.research.length > s.town.facilities.length ||
    new Set(d.research.map((j) => j?.tech)).size !== d.research.length ||
    new Set(d.research.map((j) => j?.facility)).size !== d.research.length
  )
    return false;
  for (const j of d.research) {
    if (!j || typeof j !== "object") return false;
    const r = catalog.find((r) => r.id === j.tech);
    if (
      !r ||
      !RESEARCH_CONNECTED.includes(r.id) ||
      (r.category === "story" &&
        (!storyResearchOpen(s, r.id) ||
          (r.route && r.route !== d.story.route))) ||
      d.completed.includes(r.id) ||
      r.requires.some((p) => !d.completed.includes(p)) ||
      !s.town.facilities.some(
        (f) => f.id === j.facility && f.kind === "workshop",
      ) ||
      !Number.isFinite(j.work) ||
      j.work < 0 ||
      j.work >= r.workdays * 540 * 3
    )
      return false;
  }
  if (d.overtime.some((p) => !p || typeof p !== "object")) return false;
  if (new Set(d.overtime.map((p) => p.target)).size !== d.overtime.length)
    return false;
  if (
    d.overtime.some(
      (p) =>
        !p ||
        typeof p.target !== "string" ||
        !Number.isInteger(p.day) ||
        p.day < 1 ||
        p.day > s.world.day ||
        typeof p.enabled !== "boolean" ||
        !Number.isFinite(p.minutes) ||
        p.minutes < 0 ||
        p.minutes > 180,
    )
  )
    return false;
  if (
    d.injuries.some(
      (i) =>
        !i ||
        !s.residents.some((r) => r.id === i.resident) ||
        !Number.isSafeInteger(i.minute) ||
        i.minute < 0 ||
        i.minute > s.elapsed,
    )
  )
    return false;
  if (
    s.town.facilities.some(
      (f) =>
        f.kind === "farm" &&
        ((f.level >= 2 && !d.completed.includes("TECH_SEED")) ||
          (f.level >= 3 && !d.completed.includes("TECH_CULTURE"))),
    )
  )
    return false;
  return (
    s.town.facilities.every(
      (f) => Number.isInteger(f.level) && f.level >= 1 && f.level <= 3,
    ) &&
    s.town.trips.every(
      (t) => Number.isInteger(t.rank) && t.rank >= 1 && t.rank <= tradeRank(s),
    )
  );
}
