import { loggingSiteRules, productionSites } from "./logging.js";
import { AMOUNT_SCALE, type ResourceId } from "./play.js";
import type { GroundPoint } from "./resident-path.js";
import type { TimberState } from "./timber.js";
import { moveOnGround } from "./resident-path.js";
import { workplaceOpen } from "./resident-routine.js";
import { facilityDoor } from "./town.js";

export const STORAGE_SPACE = [500, 1000, 2000] as const;
export function warehouseDoor(
  s: TimberState,
  from?: GroundPoint,
): GroundPoint | undefined {
  const doors = [
    ...s.town.facilities.filter((f) => f.kind === "storage").map(facilityDoor),
    ...productionSites(s)
      .filter((site) => site.storageBuilt)
      .map((site) => {
        const p = loggingSiteRules(site.siteId).storage;
        return { x: p.x, z: p.z + 3.2 };
      }),
  ];
  if (from)
    doors.sort(
      (a, b) =>
        Math.hypot(a.x - from.x, a.z - from.z) -
        Math.hypot(b.x - from.x, b.z - from.z),
    );
  return doors[0];
}
export function storageResearchLevel(s: TimberState): number {
  const completed = s.town.development.completed;
  return completed.includes("SPACE_3")
    ? 3
    : completed.includes("SPACE_2")
      ? 2
      : 1;
}
export function storageCapacity(s: TimberState): number {
  const rank = storageResearchLevel(s);
  const legacy = productionSites(s).filter((l) => l.storageBuilt).length;
  // The starting yard keeps its shared space (campaign 1500, otherwise 500)
  // until the built warehouses add up to more; overflow goes to the yard.
  return (
    legacy * (STORAGE_SPACE[rank - 1] ?? 500) +
    s.town.facilities
      .filter((f) => f.kind === "storage")
      .reduce(
        (n, f) => n + (STORAGE_SPACE[Math.max(f.level, rank) - 1] ?? 500),
        0,
      )
  );
}
export function yardStock(s: TimberState, resource: ResourceId) {
  return Math.max(
    0,
    s.world.resources[resource] / AMOUNT_SCALE -
      Math.min(storageCapacity(s), s.coveredStock?.[resource] ?? 0),
  );
}
export function advanceYardTransfer(
  s: TimberState,
  minutes: number,
): TimberState {
  const old = s.yardTransfer;
  const shop = s.town.facilities.find(
    (f) => f.kind === "trade" && s.mutantDamage?.[f.id] !== 100,
  );
  const worker =
    shop &&
    s.residents.find(
      (r) =>
        (!old || r.id === old.worker) &&
        r.workplaceId === "facility:" + shop.id &&
        r.health === "healthy" &&
        !r.task,
    );
  const door = warehouseDoor(s, worker?.position);
  if (
    !worker ||
    !door ||
    !workplaceOpen(s.world.minute) ||
    s.merchantRepair ||
    s.merchantItem !== undefined ||
    s.nightFires?.length
  )
    return old ? { ...s, yardTransfer: undefined } : s;
  const resource =
    old?.resource ??
    (Object.keys(s.world.resources) as ResourceId[]).find(
      (key) =>
        yardStock(s, key) >= 1 &&
        (s.coveredStock?.[key] ?? 0) < storageCapacity(s),
    );
  if (!resource) return s;
  const destination = old?.loaded ? door : { x: 4.5, z: 0.6 };
  const position = moveOnGround(worker.position, destination, minutes, 1, []);
  let transfer: TimberState["yardTransfer"] = {
    worker: worker.id,
    resource,
    loaded: old?.loaded ?? false,
  };
  let stock = s.coveredStock;
  if (
    Math.hypot(position.x - destination.x, position.z - destination.z) < 0.01
  ) {
    if (transfer.loaded) {
      const covered = stock?.[resource] ?? 0;
      stock = {
        ...stock,
        [resource]: Math.min(
          storageCapacity(s),
          s.world.resources[resource] / AMOUNT_SCALE,
          covered + 5,
        ),
      };
      transfer = undefined;
    } else transfer = { ...transfer, loaded: true };
  }
  return {
    ...s,
    coveredStock: stock,
    yardTransfer: transfer,
    residents: s.residents.map((r) =>
      r === worker
        ? {
            ...r,
            position,
            insideHome: false,
            routine: "working",
            diningSeat: null,
            eatingUntil: null,
          }
        : r,
    ),
  };
}
export function storageRoom(
  s: TimberState,
  resource: ResourceId,
  ownProcurement = false,
): number {
  const reserved =
    resource === "RES_WOOD" && !ownProcurement
      ? s.stock.cart + s.stock.waiting + s.stock.quarantine
      : 0;
  return Math.max(
    0,
    Math.floor(
      storageCapacity(s) -
        s.world.resources[resource] / AMOUNT_SCALE -
        reserved -
        (resource === "RES_WOOD" && s.yardDryAt ? 1 : 0),
    ),
  );
}
