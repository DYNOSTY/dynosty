import {
  AMOUNT_SCALE,
  type Difficulty,
  evictionDelay,
  foodWarnings,
  GAME_RULES,
  type ResourceId,
} from "./play.js";
import { isRecord } from "./save.js";
import { SCOUT_CREW, SCOUT_SITES, scoutRun } from "./scout-sites.js";
import { storageRoom } from "./storage.js";
import { recordResearchStory } from "./story-research.js";
import {
  commandTimber,
  createVillageGame,
  note,
  type TimberState,
} from "./timber.js";
import { deposit, facilityResource, payTown } from "./town.js";

export const CHAPTERS = [
  "복홀의 첫 명령",
  "끊어진 길을 잇다",
  "붕괴하는 왕도 한양",
  "함께 견디는 보름 혹한",
  "누굴 위한 복홀인가",
] as const;
export const SETTLEMENTS = [
  {
    name: "당성",
    request: "끊어진 다리에 들보 보내기",
    resource: "RES_WOOD",
    amount: 12,
    hours: 12,
  },
  {
    name: "압해",
    request: "양쪽 되를 맞출 표준 추 보내기",
    resource: "RES_METAL",
    amount: 4,
    hours: 8,
  },
  {
    name: "한다사",
    request: "봄까지 갚지 않아도 될 풀 보내기",
    resource: "RES_PLANT",
    amount: 18,
    hours: 18,
  },
  {
    name: "새금",
    request: "금 간 화덕돌 교체하기",
    resource: "RES_STONE",
    amount: 8,
    hours: 12,
  },
  {
    name: "굴아화",
    request: "새 적재틀에 시험할 철 싣기",
    resource: "RES_IRON_ORE",
    amount: 6,
    hours: 16,
  },
] as const;
export const BEATS = [
  "opening",
  "departure",
  "after",
  "patrol",
  "roads",
  "capital",
  "seal",
  "escort",
  "arrival",
  "winter",
  "thaw",
  "summit",
  "rally",
  "verdict",
  "vigil",
  "ending",
  "finished",
] as const;
export type Beat = (typeof BEATS)[number];
export interface Campaign {
  beat: Beat;
  since: number;
  reports: string[];
  patrolOrder: string[];
  petitionDay: number;
  emergencyDay?: number;
  recoveryDue?: number | null;
  memorial: "recover" | "remember" | null;
  treaties: number[];
  caravan: { village: number; due: number } | null;
  relief: "ward" | "kitchen" | null;
  escort: "invite" | "provisions" | null;
  side: "coexist" | "control" | null;
  uprising: boolean;
  lastHigh: number;
  difficulty?: Difficulty;
  pessimismExtremeSince?: number | null;
  optimismZeroSince?: number | null;
  ending: "hope" | "escape" | "collapse" | null;
}
export function newCampaign(beat: Beat, since = 0): Campaign {
  return {
    beat,
    difficulty: "normal",
    since,
    reports: [],
    patrolOrder: [],
    petitionDay: 0,
    memorial: null,
    treaties: [],
    caravan: null,
    relief: null,
    escort: null,
    side: null,
    uprising: false,
    lastHigh: since,
    ending: null,
  };
}
export function campaignOf(s: TimberState): Campaign {
  if (s.campaign) return s.campaign;
  return {
    ...newCampaign(s.chapter === 2 ? "roads" : "patrol", s.elapsed),
    patrolOrder: Object.keys(s.scoutDepartures ?? {}),
    reports: returnedScouts(s).map(([id]) => id),
  };
}
export function campaignValid(c: unknown, elapsed: number) {
  if (!isRecord(c)) return false;
  const integer = (n: unknown, max: number) =>
    typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= max;
  const village = (n: unknown) => integer(n, SETTLEMENTS.length - 1);
  return (
    BEATS.includes(c.beat as Beat) &&
    (c.difficulty === undefined ||
      c.difficulty === "normal" ||
      c.difficulty === "hard") &&
    (c.recoveryDue == null || integer(c.recoveryDue, 144000000)) &&
    integer(c.since, elapsed) &&
    integer(c.lastHigh, elapsed) &&
    (c.pessimismExtremeSince == null ||
      integer(c.pessimismExtremeSince, elapsed)) &&
    (c.optimismZeroSince == null || integer(c.optimismZeroSince, elapsed)) &&
    integer(c.petitionDay, 100000) &&
    (c.emergencyDay === undefined || integer(c.emergencyDay, 100000)) &&
    Array.isArray(c.patrolOrder) &&
    new Set(c.patrolOrder).size === c.patrolOrder.length &&
    c.patrolOrder.every((id) => SCOUT_SITES.some((site) => site.id === id)) &&
    Array.isArray(c.reports) &&
    new Set(c.reports).size === c.reports.length &&
    c.reports.every((id) => SCOUT_SITES.some((site) => site.id === id)) &&
    Array.isArray(c.treaties) &&
    new Set(c.treaties).size === c.treaties.length &&
    c.treaties.every(village) &&
    (c.caravan === null ||
      (isRecord(c.caravan) &&
        village(c.caravan.village) &&
        !c.treaties.includes(c.caravan.village) &&
        integer(c.caravan.due, Number.MAX_SAFE_INTEGER))) &&
    [null, "recover", "remember"].includes(c.memorial as null) &&
    [null, "ward", "kitchen"].includes(c.relief as null) &&
    [null, "invite", "provisions"].includes(c.escort as null) &&
    [null, "coexist", "control"].includes(c.side as null) &&
    typeof c.uprising === "boolean" &&
    [null, "hope", "escape", "collapse"].includes(c.ending as null) &&
    ["ending", "finished"].includes(c.beat as string) === (c.ending !== null)
  );
}
export function returnedScouts(s: TimberState) {
  const now = (s.world.day - 1) * 1440 + s.world.minute;
  return Object.entries(s.scoutDepartures ?? {}).filter(([id]) => {
    const site = SCOUT_SITES.find((x) => x.id === id);
    const run = site && scoutRun(s, site);
    return run !== undefined && now >= run.due;
  });
}
function patrolCasualties(s: TimberState) {
  return s.world.citizens
    .filter((p) => p.alive && !p.mechanicalFrom)
    .slice(-2)
    .map((p) => p.id);
}
export function recoveryCrew(s: TimberState) {
  const casualties = patrolCasualties(s);
  const production = new Set(
    s.town.facilities
      .filter((f) => facilityResource(f))
      .map((f) => "facility:" + f.id),
  );
  const producer = (work: string | null) =>
    !!work && (work.startsWith("logging") || production.has(work));
  return s.residents
    .filter(
      (r) =>
        r.health === "healthy" &&
        !r.task &&
        !r.nextWork &&
        (producer(r.workplaceId) || !r.workplaceId) &&
        !s.workerIds.includes(r.id) &&
        !casualties.includes(r.id),
    )
    .sort(
      (a, b) =>
        Number(producer(b.workplaceId)) - Number(producer(a.workplaceId)),
    )
    .slice(0, SCOUT_CREW)
    .map((r) => r.id);
}
export function lostPatrol(s: TimberState) {
  return (s.campaign?.patrolOrder ?? Object.keys(s.scoutDepartures ?? {}))[2];
}
export function campaignOutcome(s: TimberState): Campaign["ending"] {
  const c = campaignOf(s);
  const delay = evictionDelay(c.difficulty);
  if (
    s.world.pessimism >= GAME_RULES.endings.evictionPessimism &&
    s.elapsed - (c.pessimismExtremeSince ?? s.elapsed) >= delay
  )
    return "collapse";
  if (s.chapter !== 5) return null;
  const people = s.world.citizens.filter((p) => !p.mechanicalFrom);
  const rules = GAME_RULES.endings;
  if (
    (s.world.optimism <= rules.evictionOptimism &&
      s.elapsed - (c.optimismZeroSince ?? s.elapsed) >= delay) ||
    people.filter((p) => !p.alive).length >=
      people.length * GAME_RULES.endings.deathFraction
  )
    return "collapse";
  if (
    c.beat !== "vigil" ||
    s.elapsed - c.since < GAME_RULES.campaign.stage5MinimumDays * 1440
  )
    return null;
  if (
    c.side === "coexist" &&
    s.world.pessimism <= 30 &&
    s.elapsed - Math.max(c.since, c.lastHigh) >= 10 * 1440
  )
    return "hope";
  if (
    c.side === "control" &&
    s.town.development.story.chungnyeong === "mechanical" &&
    s.town.development.completed.includes("R19")
  )
    return "escape";
  return null;
}
export function updateCampaign(s: TimberState): TimberState {
  let c = s.campaign;
  if (c?.recoveryDue != null && s.elapsed >= c.recoveryDue) {
    c = { ...c, recoveryDue: null };
    s = {
      ...note(
        s,
        "수습대가 두 사람을 모시고 돌아왔습니다. 파견된 주민들이 마을 일에 복귀합니다.",
      ),
      campaign: c,
      residents: s.residents.map((r) =>
        r.task === "patrol-recovery" ? { ...r, task: null } : r,
      ),
    };
  }
  if (!c || c.ending) return s;
  const rules = GAME_RULES.endings;
  const pessimismExtremeSince =
    s.world.pessimism >= rules.evictionPessimism
      ? (c.pessimismExtremeSince ?? s.elapsed)
      : null;
  const optimismZeroSince =
    s.chapter === 5 && s.world.optimism <= rules.evictionOptimism
      ? (c.optimismZeroSince ?? s.elapsed)
      : null;
  if (
    pessimismExtremeSince !== (c.pessimismExtremeSince ?? null) ||
    optimismZeroSince !== (c.optimismZeroSince ?? null)
  ) {
    c = { ...c, pessimismExtremeSince, optimismZeroSince };
    s = { ...s, campaign: c };
  }
  const ending = campaignOutcome(s);
  if (ending)
    return { ...s, paused: true, campaign: { ...c, beat: "ending", ending } };
  if (c.beat === "arrival" || c.beat === "winter") {
    const onset = c.beat === "arrival";
    const duration =
      (onset
        ? GAME_RULES.campaign.stage4PreparationDays
        : GAME_RULES.campaign.stage4ColdDays) * 1440;
    if (s.elapsed - c.since >= duration)
      return {
        ...s,
        town: { ...s.town, cold: onset },
        campaign: {
          ...c,
          beat: onset ? "winter" : "thaw",
          since: c.since + duration,
        },
      };
  }
  if (c.beat === "roads" && c.caravan && s.elapsed >= c.caravan.due)
    return {
      ...s,
      campaign: {
        ...c,
        treaties: [...c.treaties, c.caravan.village],
        caravan: null,
      },
    };
  if (
    s.chapter === 5 &&
    c.beat === "vigil" &&
    s.world.pessimism > 30 &&
    c.lastHigh !== s.elapsed
  )
    return { ...s, campaign: { ...c, lastHigh: s.elapsed } };
  return s;
}
export type CampaignCommand = { type: "campaign"; beat: Beat; action: string };
export function actCampaign(
  s: TimberState,
  command: CampaignCommand,
): TimberState {
  const c = campaignOf(s),
    action = command.action;
  if (command.beat !== c.beat) throw Error("이미 지난 장면입니다.");
  const change = (
    beat: Beat,
    patch: Partial<Campaign> = {},
    base = s,
  ): TimberState => ({
    ...base,
    campaign: {
      ...c,
      ...(beat === c.beat ? {} : { since: s.elapsed }),
      beat,
      ...patch,
    },
  });
  const pay = (resource: ResourceId, amount: number) =>
    payTown(s, { [resource]: amount });
  if (
    ["patrol", "roads", "capital", "arrival", "winter", "vigil"].includes(
      c.beat,
    ) &&
    c.petitionDay !== s.world.day &&
    (action === "share" || action === "reserve")
  ) {
    const base = action === "share" ? pay("RES_FISH", 4) : s;
    const adjustment = action === "share" ? -4 : 6;
    return change(
      c.beat,
      { petitionDay: s.world.day },
      {
        ...base,
        world: {
          ...base.world,
          pessimism: Math.min(100, Math.max(0, s.world.pessimism + adjustment)),
          optimism: Math.min(100, Math.max(0, s.world.optimism - adjustment)),
        },
      },
    );
  }
  switch (c.beat) {
    case "opening":
      if (action === "next" || action === "hard")
        return change("departure", {
          difficulty: action === "hard" ? "hard" : "normal",
        });
      break;
    case "departure":
      if (action === "leave")
        return {
          ...createVillageGame(false, true),
          processed: s.processed,
          campaign: { ...c, beat: "after" },
        };
      break;
    case "after":
      if (action === "next") return change("patrol");
      break;
    case "patrol": {
      const report = returnedScouts(s).find(
        ([id]) => !c.reports.includes(id),
      )?.[0];
      if (report && action === "report:" + report && report !== lostPatrol(s))
        return change(
          "patrol",
          { reports: [...c.reports, report] },
          report === "reed"
            ? { ...s, scoutVisitors: (s.scoutVisitors ?? 0) + 1 }
            : s,
        );
      if (
        report &&
        report === lostPatrol(s) &&
        ["recover", "remember"].includes(action)
      ) {
        const dead = patrolCasualties(s);
        const send = action === "recover";
        const crew = send ? recoveryCrew(s) : [];
        if (send && crew.length < SCOUT_CREW)
          throw Error("수습대에 나설 주민 두 명이 필요합니다.");
        const base = action === "recover" ? pay("RES_MEAT", 6) : s;
        const loss = dead.length
          ? commandTimber(
              base,
              {
                type: "citizen-event",
                event: { type: "death", id: "third-patrol", citizenIds: dead },
              },
              "campaign-third-patrol",
            )
          : base;
        return change(
          "patrol",
          {
            reports: [...c.reports, report],
            recoveryDue: send
              ? s.elapsed +
                scoutRun(s, SCOUT_SITES.find((site) => site.id === report)!)!
                  .minutes
              : null,
            memorial: action === "recover" ? "recover" : "remember",
          },
          {
            ...note(
              loss,
              send
                ? "주민 둘이 일손을 놓고 수습에 나섰습니다. 유족들이 성문에서 돌아올 이들을 기다립니다."
                : "추가 파견을 멈추고 두 이름을 추모 장부에 올렸습니다.",
            ),
            residents: loss.residents.map((r) =>
              crew.includes(r.id)
                ? {
                    ...r,
                    task: "patrol-recovery",
                    routine: "idle",
                    insideHome: false,
                    eatingUntil: null,
                    diningSeat: null,
                    request: null,
                  }
                : r,
            ),
            world: {
              ...loss.world,
              optimism: Math.min(100, loss.world.optimism + (send ? 1 : 0)),
              pessimism: Math.min(
                100,
                loss.world.pessimism + (!send && Math.random() < 0.5 ? 1 : 0),
              ),
            },
          },
        );
      }
      if (action === "next" && c.reports.length === SCOUT_SITES.length)
        return { ...change("roads"), chapter: 2 };
      break;
    }
    case "roads": {
      const i = SETTLEMENTS.findIndex((_, i) => action === "send:" + i),
        v = SETTLEMENTS[i];
      if (v && !c.caravan && !c.treaties.includes(i))
        return change(
          "roads",
          { caravan: { village: i, due: s.elapsed + v.hours * 60 } },
          pay(v.resource, v.amount),
        );
      if (action === "next" && c.treaties.length === 5)
        return { ...change("capital"), chapter: 3 };
      break;
    }
    case "capital":
      if (!c.relief && (action === "ward" || action === "kitchen"))
        return change(
          "capital",
          { relief: action },
          action === "ward" ? pay("RES_COAL", 12) : pay("RES_FISH", 12),
        );
      if (action === "next" && c.relief && s.elapsed - c.since >= 1440)
        return change("seal");
      break;
    case "seal":
      if (action === "next") return change("escort");
      break;
    case "escort":
      if (action === "invite" || action === "provisions") {
        const convoy = commandTimber(
          pay("RES_PLANT", action === "invite" ? 12 : 6),
          {
            type: "citizen-event",
            event: {
              type: "arrival",
              id: "southern-convoy",
              groups: [
                { species: "R02", count: action === "invite" ? 8 : 2 },
                { species: "R03", count: 2 },
              ],
            },
          },
          "campaign-convoy",
        );
        return { ...change("arrival", { escort: action }, convoy), chapter: 4 };
      }
      break;
    case "thaw":
      if (action === "next") return { ...change("summit"), chapter: 5 };
      break;
    case "summit":
      if (action === "coexist" || action === "control") {
        const uprising = s.world.pessimism > s.world.optimism;
        const base = recordResearchStory(
          { ...s, rationPolicy: action === "coexist" ? "needs" : "cap" },
          "rebellion-started",
        );
        return change(
          uprising ? "rally" : "verdict",
          { side: action, uprising, lastHigh: s.elapsed },
          base,
        );
      }
      break;
    case "rally":
      if (action === "listen" || action === "cordon") {
        const base = action === "listen" ? pay("RES_PLANT", 12) : s;
        return change(
          "verdict",
          { since: c.since },
          {
            ...base,
            world: {
              ...base.world,
              pessimism: Math.min(
                100,
                Math.max(0, s.world.pessimism + (action === "listen" ? -8 : 8)),
              ),
            },
          },
        );
      }
      break;
    case "verdict":
      if (action === "next") {
        const route = s.town.development.story.route;
        const base = route
          ? s
          : recordResearchStory(
              s,
              c.side === "control"
                ? "chungnyeong-assassinated"
                : "rebellion-suppressed",
            );
        return change("vigil", { since: c.since }, base);
      }
      break;
    case "vigil": {
      const ration = emergencyRation(s);
      if (!ration || action !== `ration:${s.world.day}:${ration}`) break;
      const trade = c.side === "coexist";
      const base = trade
        ? payTown(s, { RES_WOOD: 12 })
        : commandTimber(
            s,
            {
              type: "citizen-event",
              event: { type: "death", id: action, citizenIds: [ration] },
            },
            action,
          );
      const supplied = deposit(base, "RES_MEAT", 8);
      return {
        ...supplied,
        campaign: { ...supplied.campaign!, emergencyDay: s.world.day },
        world: {
          ...supplied.world,
          pessimism: Math.max(
            0,
            Math.min(100, supplied.world.pessimism + (trade ? -2 : 12)),
          ),
        },
      };
    }
    case "ending":
      if (action === "finish") return change("finished");
      break;
  }
  throw Error("아직 이 명령의 조건을 갖추지 못했습니다.");
}
export function emergencyRation(s: TimberState) {
  const c = s.campaign;
  if (
    c?.beat !== "vigil" ||
    !c.side ||
    c.emergencyDay === s.world.day ||
    !foodWarnings(s.world).some((w) => w.id === "RES_MEAT") ||
    storageRoom(s, "RES_MEAT") < 8
  )
    return;
  if (c.side === "coexist")
    return canPay(s, "RES_WOOD", 12) ? "trade" : undefined;
  const residents = s.world.citizens.filter(
    (p) => p.alive && !p.mechanicalFrom,
  );
  return (
    residents.find((p) => p.diet === "RES_MEAT" && p.health === "sick") ??
    residents.find((p) => p.diet === "RES_PLANT")
  )?.id;
}
export function canPay(s: TimberState, resource: ResourceId, units: number) {
  return (
    s.world.resources[resource] >=
    (units + (resource === "RES_WOOD" ? s.reservedWood : 0)) * AMOUNT_SCALE
  );
}
