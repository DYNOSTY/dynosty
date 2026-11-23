import {
  BOKHOL_FORESTS,
  BOKHOL_MAP,
  BOKHOL_MINERALS,
  BOKHOL_PRODUCTION_SITES,
  constructionPlot,
  type ProductionSiteId,
  productionSiteDefinition,
  sawmillHasForest,
} from "./bokhol.js";
import { residentShiftOpen, resourceRate } from "./development.js";
import { AMOUNT_SCALE, productionMultiplier } from "./play.js";
import type { GroundPoint } from "./resident-path.js";
import { isRecord } from "./save.js";
import type { TimberState } from "./timber.js";

// shortcut: 권역별 지정 부지와 시험 수치, 자유 배치·채취 범위 중첩을 구현할 때 교체한다.
export const LOGGING_RULES = {
  workshop: { x: -27, z: -8 },
  storage: { x: -24, z: 2 },
  pickup: { x: -24, z: -7 },
  maxWorkers: 4,
  forest: 120,
  treesPerForest: 32,
  workPerUnit: 10,
  buffer: 20,
  batch: 5,
  speed: 2,
  pullOffset: 3,
} as const;
export const HAUL_PHASE_NAMES = {
  pickup: "수레로 이동",
  outbound: "저장소로 운반",
  park: "수레 내려놓기",
  unload: "화물 하역",
  turn: "빈 수레 손잡이로 이동",
  inbound: "빈 수레 복귀",
  "park-home": "빈 수레 정리",
  release: "손잡이를 놓고 업무 종료",
};
export interface LoggingState {
  readonly siteId: ProductionSiteId;
  readonly built: boolean;
  readonly storageBuilt: boolean;
  readonly target: number;
  readonly remaining: number;
  readonly buffer: number;
  readonly progress: number;
  readonly delivered: number;
  readonly haul: {
    readonly workerId: string | null;
    readonly phase: keyof typeof HAUL_PHASE_NAMES;
    readonly cart: GroundPoint;
    readonly cargo: number;
    readonly wait: number;
    readonly relief: boolean;
  } | null;
}
export const createLogging = (
  siteId: ProductionSiteId = "west",
): LoggingState => ({
  siteId,
  built: false,
  storageBuilt: false,
  target: 0,
  remaining: productionSiteDefinition(siteId).initial,
  buffer: 0,
  progress: 0,
  delivered: 0,
  haul: null,
});
export const loggingSites = (s: TimberState): readonly LoggingState[] => [
  s.logging,
  ...s.loggingSites,
];
export const productionSites = (s: TimberState): readonly LoggingState[] => [
  ...loggingSites(s),
  ...s.mineralSites,
];
export function loggingSite(
  s: TimberState,
  id: ProductionSiteId = "west",
): LoggingState {
  const site = productionSites(s).find((l) => l.siteId === id);
  if (!site) throw new RangeError("알 수 없는 숲 권역입니다.");
  return site;
}
export function setLoggingSite(
  s: TimberState,
  site: LoggingState,
): TimberState {
  return site.siteId === "west"
    ? { ...s, logging: site }
    : BOKHOL_MINERALS.some((m) => m.id === site.siteId)
      ? {
          ...s,
          mineralSites: s.mineralSites.map((l) =>
            l.siteId === site.siteId ? site : l,
          ),
        }
      : {
          ...s,
          loggingSites: s.loggingSites.map((l) =>
            l.siteId === site.siteId ? site : l,
          ),
        };
}
export function loggingSiteRules(id: ProductionSiteId = "west") {
  const f = BOKHOL_PRODUCTION_SITES.find((f) => f.id === id);
  if (!f) throw new RangeError("알 수 없는 숲 권역입니다.");
  const workshopPlot = constructionPlot({ x: f.x + 13, z: f.z });
  const storagePlot = constructionPlot({ x: f.x + 13, z: f.z + 10 });
  return {
    ...LOGGING_RULES,
    workshopPlot,
    storagePlot,
    workshop: workshopPlot,
    storage: { x: storagePlot.x + 3, z: storagePlot.z },
    pickup: { x: workshopPlot.x + 3, z: workshopPlot.z + 1 },
  };
}
export const loggingWorkId = (id: ProductionSiteId) =>
  id === "west" ? "logging" : `logging:${id}`;
export const loggingHaulTask = (id: ProductionSiteId) =>
  id === "west" ? "logging-haul" : `logging-haul:${id}`;
function mapLogging(
  s: TimberState,
  run: (context: TimberState) => TimberState,
): TimberState {
  let next = s;
  for (const id of BOKHOL_PRODUCTION_SITES.map((f) => f.id)) {
    const result = run({ ...next, logging: loggingSite(next, id) });
    next = setLoggingSite(
      { ...next, world: result.world, residents: result.residents },
      result.logging,
    );
  }
  return next;
}
type Choose = (s: TimberState, site: GroundPoint, count: number) => string[];
const distance = (a: GroundPoint, b: GroundPoint) =>
  Math.hypot(a.x - b.x, a.z - b.z);
export function loggingWorkplace(s: TimberState, id: string): GroundPoint {
  const resident = s.residents.find((r) => r.id === id);
  const site =
    productionSites(s).find(
      (l) => loggingWorkId(l.siteId) === resident?.workplaceId,
    ) ?? s.logging;
  const rules = loggingSiteRules(site.siteId);
  const index = Math.max(
    0,
    s.residents
      .filter((r) => r.workplaceId === loggingWorkId(site.siteId))
      .findIndex((r) => r.id === id),
  );
  return {
    x: rules.workshop.x - 2 + (index % 2) * 3,
    z: rules.workshop.z + 1 - Math.floor(index / 2) * 3,
  };
}
export function loggingStaff(
  s: TimberState,
  siteId: ProductionSiteId = s.logging.siteId,
) {
  const assigned = s.residents.filter(
    (r) => r.workplaceId === loggingWorkId(siteId) && r.health === "healthy",
  );
  const working = assigned.filter(
    (r) =>
      residentShiftOpen(s, r.id) &&
      r.routine === "working" &&
      distance(r.position, loggingWorkplace(s, r.id)) < 0.01,
  );
  return { assigned: assigned.length, working: working.length };
}
export function staffLogging(s: TimberState, choose: Choose): TimberState {
  return mapLogging(s, (context) => staffOneLogging(context, choose));
}
function staffOneLogging(s: TimberState, choose: Choose): TimberState {
  const rules = loggingSiteRules(s.logging.siteId);
  const haul = s.logging.haul;
  if (
    haul?.workerId &&
    s.residents.find((r) => r.id === haul.workerId)?.health !== "healthy"
  ) {
    s = {
      ...s,
      logging: {
        ...s.logging,
        haul: { ...haul, workerId: null, relief: true },
      },
      residents: s.residents.map((r) =>
        r.id === haul.workerId ? { ...r, task: null } : r,
      ),
    };
  }
  let retained = 0;
  let next: TimberState = {
    ...s,
    residents: s.residents.map((r) =>
      r.workplaceId === loggingWorkId(s.logging.siteId) &&
      (r.health !== "healthy" || retained++ >= s.logging.target)
        ? { ...r, workplaceId: null }
        : r,
    ),
  };
  for (let i = loggingStaff(next).assigned; i < next.logging.target; i++) {
    const id = choose(next, rules.workshop, 1)[0];
    if (!id) break;
    next = {
      ...next,
      residents: next.residents.map((r) =>
        r.id === id
          ? {
              ...r,
              workplaceId: loggingWorkId(s.logging.siteId),
              insideHome: false,
              diningSeat: null,
            }
          : r,
      ),
    };
  }
  return next;
}
export function loggingHandle(l: LoggingState): GroundPoint {
  const h = l.haul;
  const cart = h?.cart ?? loggingSiteRules(l.siteId).pickup;
  const returning = h && ["turn", "inbound", "park-home"].includes(h.phase);
  return {
    x: cart.x,
    z: cart.z + (returning ? -1 : 1) * LOGGING_RULES.pullOffset,
  };
}
export function advanceLogging(input: TimberState, minutes: number) {
  if (!minutes) return input;
  return mapLogging(input, (s) => {
    const l = s.logging;
    const def = productionSiteDefinition(l.siteId);
    const working =
      l.built &&
      l.remaining > 0 &&
      (def.kind !== "forest" ||
        sawmillHasForest(loggingSiteRules(l.siteId).workshop))
        ? loggingStaff(s).working
        : 0;
    const work =
      Math.round(
        (l.progress +
          working *
            LOGGING_RULES.workPerUnit *
            minutes *
            resourceRate(s, def.resource) *
            productionMultiplier(s.campaign?.difficulty)) *
          1000,
      ) / 1000;
    const made = Math.min(
      l.remaining,
      Math.floor(work / LOGGING_RULES.workPerUnit),
    );
    const received = made + l.buffer + (l.haul?.cargo ?? 0);
    if (!received && !l.haul && !working) return s;
    return {
      ...s,
      world: received
        ? {
            ...s.world,
            resources: {
              ...s.world.resources,
              [def.resource]:
                s.world.resources[def.resource] + received * AMOUNT_SCALE,
            },
          }
        : s.world,
      residents: l.haul
        ? s.residents.map((r) =>
            r.id === l.haul?.workerId && r.task === loggingHaulTask(l.siteId)
              ? { ...r, task: null, routine: "idle" }
              : r,
          )
        : s.residents,
      logging: {
        ...l,
        remaining: l.remaining - made,
        delivered: l.delivered + received,
        buffer: 0,
        haul: null,
        progress: work % LOGGING_RULES.workPerUnit,
      },
    };
  });
}
export function loggingValid(s: TimberState): boolean {
  if (
    !Array.isArray(s.loggingSites) ||
    s.loggingSites.length !== BOKHOL_FORESTS.length - 1
  )
    return false;
  if (
    !Array.isArray(s.mineralSites) ||
    s.mineralSites.length !== BOKHOL_MINERALS.length
  )
    return false;
  const all = productionSites(s);
  if (
    all.some(
      (l, i) => !isRecord(l) || l.siteId !== BOKHOL_PRODUCTION_SITES[i]?.id,
    )
  )
    return false;
  if (
    s.residents.some(
      (r) =>
        (r.workplaceId?.startsWith("logging") &&
          !all.some((l) => loggingWorkId(l.siteId) === r.workplaceId)) ||
        (r.task?.startsWith("logging-haul") &&
          !all.some(
            (l) =>
              l.haul?.workerId === r.id && loggingHaulTask(l.siteId) === r.task,
          )),
    )
  )
    return false;
  const carriers = all.map((l) => l.haul?.workerId).filter((id) => id != null);
  if (new Set(carriers).size !== carriers.length) return false;
  return all.every((l) => oneLoggingValid({ ...s, logging: l }));
}
function oneLoggingValid(s: TimberState): boolean {
  const rules = loggingSiteRules(s.logging.siteId);
  const haulTask = loggingHaulTask(s.logging.siteId);
  const l = s.logging;
  const definition = productionSiteDefinition(l.siteId);
  const integer = (n: unknown, max: number) =>
    typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= max;
  const point = (p: unknown) =>
    isRecord(p) &&
    typeof p.x === "number" &&
    Number.isFinite(p.x) &&
    Math.abs(p.x) <= BOKHOL_MAP.coordinateLimit &&
    typeof p.z === "number" &&
    Number.isFinite(p.z) &&
    Math.abs(p.z) <= BOKHOL_MAP.coordinateLimit;
  if (
    !isRecord(l) ||
    typeof l.built !== "boolean" ||
    typeof l.storageBuilt !== "boolean" ||
    !integer(l.target, 4) ||
    !integer(l.remaining, definition.initial) ||
    !integer(l.buffer, 20) ||
    typeof l.progress !== "number" ||
    !Number.isFinite(l.progress) ||
    l.progress < 0 ||
    l.progress >= LOGGING_RULES.workPerUnit ||
    !integer(l.delivered, definition.initial)
  )
    return false;
  if (
    (!l.built &&
      (l.target ||
        l.remaining + (s.town.extracted[l.siteId] ?? 0) !==
          definition.initial ||
        l.buffer ||
        l.progress)) ||
    (!l.storageBuilt && l.haul)
  )
    return false;
  const staff = s.residents.filter(
    (r) => r.workplaceId === loggingWorkId(s.logging.siteId),
  );
  if (staff.length > l.target || (!l.built && staff.length)) return false;
  if (
    s.construction?.siteId === l.siteId &&
    ((s.construction?.kind === "logging" && l.built) ||
      (s.construction?.kind === "storage" && l.storageBuilt))
  )
    return false;
  const h = l.haul;
  if (
    h !== null &&
    (!isRecord(h) ||
      !Object.hasOwn(HAUL_PHASE_NAMES, h.phase) ||
      !point(h.cart) ||
      !integer(h.cargo, 5) ||
      !integer(h.wait, 3) ||
      typeof h.relief !== "boolean" ||
      (h.workerId !== null &&
        (typeof h.workerId !== "string" ||
          !s.residents.some((r) => r.id === h.workerId) ||
          s.workerIds.includes(h.workerId) ||
          staff.some((r) => r.id === h.workerId))))
  )
    return false;
  if (
    h &&
    (h.cart.x !== rules.pickup.x ||
      h.cart.z < rules.pickup.z ||
      h.cart.z > rules.storage.z ||
      (["pickup", "park-home", "release"].includes(h.phase) &&
        h.cart.z !== rules.pickup.z) ||
      (["park", "unload", "turn"].includes(h.phase) &&
        h.cart.z !== rules.storage.z) ||
      (h.workerId !== null &&
        s.residents.some(
          (r) =>
            r.id === h.workerId &&
            (r.workplaceId !== null ||
              r.nextWork !== null ||
              (r.health === "healthy" && r.task !== haulTask)),
        )))
  )
    return false;
  if (
    h &&
    (["turn", "inbound", "park-home", "release"].includes(h.phase)
      ? h.cargo !== 0
      : h.cargo < 1)
  )
    return false;
  if (s.residents.some((r) => r.task === haulTask && r.id !== h?.workerId))
    return false;
  return (
    l.remaining +
      (s.town.extracted[l.siteId] ?? 0) +
      l.buffer +
      (h?.cargo ?? 0) +
      l.delivered ===
    definition.initial
  );
}
