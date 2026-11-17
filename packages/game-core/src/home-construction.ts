import {
  type HomePlacement,
  homeWorkPosition,
  rotatedPoint,
} from "./home-placement.js";
import {
  type GroundObstacle,
  type GroundPoint,
  moveOnGround,
} from "./resident-path.js";
import { workplaceOpen } from "./resident-routine.js";
import type { TimberState } from "./timber.js";
import { assignHomes, VILLAGE_RULES } from "./village-services.js";

export interface HomeBuilder {
  readonly id: string | null;
  readonly amount: number;
  readonly phase: "collect" | "deliver" | "build";
  readonly source: GroundPoint;
  readonly workSlot?: number;
}
export function createHomeCrew(
  ids: readonly string[],
  slots: readonly number[] = [1, 0, 2],
): HomeBuilder[] {
  let remaining = 20;
  return ids.map((id, i) => {
    const amount = Math.ceil(remaining / (ids.length - i));
    remaining -= amount;
    return {
      id,
      workSlot: slots[i] ?? 1,
      amount,
      phase: "collect",
      source: { x: 4.5 + (i - (ids.length - 1) / 2) * 1.5, z: 0.6 },
    };
  });
}
export function builderWorkPosition(
  p: HomePlacement,
  index: number,
  count: number,
): GroundPoint {
  return rotatedPoint(p, (index - (count - 1) / 2) * 1.6, 2.4);
}
export function advanceHomeConstruction(
  s: TimberState,
  minutes: number,
  choose: (s: TimberState, site: GroundPoint, count: number) => string[],
  obstacles: readonly GroundObstacle[],
): TimberState {
  const b = s.construction;
  if (!b?.crew || minutes === 0) return s;
  if (!workplaceOpen(s.world.minute))
    return {
      ...s,
      construction: {
        ...b,
        startedAt: b.startedAt === null ? null : b.startedAt + minutes,
        finishAt: b.finishAt === null ? null : b.finishAt + minutes,
      },
    };
  const pose = {
    position: b.position,
    headingRadians: b.headingRadians ?? Math.PI,
  };
  let residents = [...s.residents];
  const crew = b.crew.map((original, index) => {
    let w = original,
      r = residents.find((r) => r.id === w.id);
    if (r?.health !== "healthy") {
      if (r && w.phase === "deliver")
        w = { ...w, phase: "collect", source: { ...r.position } };
      if (r)
        residents = residents.map((q) =>
          q.id === r?.id ? { ...q, task: null } : q,
        );
      const goal =
        w.phase === "collect"
          ? w.source
          : w.workSlot === undefined
            ? builderWorkPosition(pose, index, b.crew?.length ?? 1)
            : homeWorkPosition(pose, w.workSlot);
      const id = choose({ ...s, residents }, goal, 1)[0] ?? null;
      w = { ...w, id };
      r = residents.find((r) => r.id === id);
    }
    if (!r) return { ...w, id: null };
    const goal =
      w.phase === "collect"
        ? w.source
        : w.workSlot === undefined
          ? builderWorkPosition(pose, index, b.crew?.length ?? 1)
          : homeWorkPosition(pose, w.workSlot);
    const position = moveOnGround(r.position, goal, minutes, 2, obstacles);
    const arrived =
      Math.hypot(position.x - goal.x, position.z - goal.z) < 0.001;
    const nextPhase = arrived
      ? w.phase === "collect"
        ? "deliver"
        : "build"
      : w.phase;
    residents = residents.map((q) =>
      q.id === r?.id
        ? {
            ...q,
            position,
            task: "home-construction",
            nextWork: null,
            insideHome: false,
            diningSeat: null,
            eatingUntil: null,
            request: null,
            routine: "working",
          }
        : q,
    );
    return { ...w, phase: nextPhase } satisfies HomeBuilder;
  });
  const delivered = crew
    .filter((w) => w.phase === "build")
    .reduce((n, w) => n + w.amount, 0);
  const working = crew.some((w, index) => {
    const r = residents.find((r) => r.id === w.id),
      goal =
        w.workSlot === undefined
          ? builderWorkPosition(pose, index, crew.length)
          : homeWorkPosition(pose, w.workSlot);
    return (
      w.phase === "build" &&
      r?.health === "healthy" &&
      Math.hypot(r.position.x - goal.x, r.position.z - goal.z) < 0.01
    );
  });
  let next: TimberState = { ...s, residents, construction: { ...b, crew } };
  if (
    delivered === 20 &&
    !working &&
    b.finishAt !== null &&
    b.crew.some((w) =>
      s.residents.some((r) => r.id === w.id && r.health === "healthy"),
    )
  )
    return {
      ...next,
      construction: {
        ...b,
        crew,
        startedAt: (b.startedAt ?? s.elapsed) + minutes,
        finishAt: b.finishAt + minutes,
      },
    };
  if (delivered < 20 || !working)
    return {
      ...next,
      construction: { ...b, crew, startedAt: null, finishAt: null },
    };
  if (b.finishAt === null)
    return {
      ...next,
      construction: {
        ...b,
        crew,
        startedAt: s.elapsed,
        finishAt: s.elapsed + VILLAGE_RULES.constructionMinutes,
      },
    };
  if (s.elapsed < b.finishAt) return next;
  const home = {
    id: `dwelling-${s.homes.length + 1}`,
    position: { ...b.position },
    headingRadians: pose.headingRadians,
    capacity: VILLAGE_RULES.homeSpace,
  };
  const homes = [...s.homes, home];
  const habitable =
    s.buildingHealth > 0
      ? homes
      : homes.filter((h) => h.id !== "example-building-1");
  residents = assignHomes(
    residents.map((r) =>
      crew.some((w) => w.id === r.id)
        ? { ...r, task: null, routine: "idle" as const }
        : r,
    ),
    s.world.citizens,
    habitable,
  );
  next = {
    ...next,
    homes,
    residents,
    construction: null,
    world: {
      ...s.world,
      buildings: homes.map((h) => ({
        id: h.id,
        type: "ondol-nest",
        position: { ...h.position, y: 0 },
        headingRadians: h.headingRadians ?? Math.PI,
      })),
    },
    history: [
      ...s.history,
      {
        id: s.history.length,
        minute: s.elapsed,
        text: "온돌 둥지 완공. 빈 잠자리는 다음 주민을 위해 보존합니다.",
      },
    ],
  };
  return next;
}
