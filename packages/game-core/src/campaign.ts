import { AMOUNT_SCALE, GAME_RULES, type ResourceId } from "./play.js";
import { isRecord } from "./save.js";
import { SCOUT_SITES } from "./scout-sites.js";
import { recordResearchStory } from "./story-research.js";
import {
  commandTimber,
  createVillageGame,
  type TimberState,
} from "./timber.js";
import { payTown } from "./town.js";

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
  memorial: "recover" | "remember" | null;
  treaties: number[];
  caravan: { village: number; due: number } | null;
  relief: "ward" | "kitchen" | null;
  escort: "invite" | "provisions" | null;
  side: "coexist" | "control" | null;
  uprising: boolean;
  lastHigh: number;
  pessimismExtremeSince?: number | null;
  optimismZeroSince?: number | null;
  ending: "hope" | "escape" | "collapse" | null;
}
export function newCampaign(beat: Beat, since = 0): Campaign {
  return {
    beat,
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
    integer(c.since, elapsed) &&
    integer(c.lastHigh, elapsed) &&
    (c.pessimismExtremeSince == null ||
      integer(c.pessimismExtremeSince, elapsed)) &&
    (c.optimismZeroSince == null || integer(c.optimismZeroSince, elapsed)) &&
    integer(c.petitionDay, 100000) &&
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
  return Object.entries(s.scoutDepartures ?? {}).filter(
    ([id, start]) =>
      now - start >=
      (SCOUT_SITES.find((x) => x.id === id)?.hours ?? Infinity) * 60,
  );
}
export function lostPatrol(s: TimberState) {
  return (s.campaign?.patrolOrder ?? Object.keys(s.scoutDepartures ?? {}))[2];
}
export function campaignOutcome(s: TimberState): Campaign["ending"] {
  const c = campaignOf(s);
  if (s.chapter !== 5) return null;
  const people = s.world.citizens.filter((p) => !p.mechanicalFrom);
  const rules = GAME_RULES.endings;
  const held = (since: number | null | undefined) =>
    since != null && s.elapsed - since >= rules.evictionMinutes;
  if (
    (s.world.pessimism >= rules.evictionPessimism &&
      held(c.pessimismExtremeSince)) ||
    (s.world.optimism <= rules.evictionOptimism && held(c.optimismZeroSince)) ||
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
  if (!c) return s;
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
  if (s.chapter === 5 && !c.ending) {
    const rules = GAME_RULES.endings;
    const pessimismExtremeSince =
      s.world.pessimism >= rules.evictionPessimism
        ? (c.pessimismExtremeSince ?? s.elapsed)
        : null;
    const optimismZeroSince =
      s.world.optimism <= rules.evictionOptimism
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
    if (
      c.beat === "vigil" &&
      s.world.pessimism > 30 &&
      c.lastHigh !== s.elapsed
    )
      return { ...s, campaign: { ...c, lastHigh: s.elapsed } };
  }
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
      if (action === "next") return change("departure");
      break;
    case "departure":
      if (action === "leave")
        return {
          ...createVillageGame(),
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
        const dead = s.world.citizens
          .filter((p) => p.alive && !p.mechanicalFrom)
          .slice(-2)
          .map((p) => p.id);
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
            memorial: action === "recover" ? "recover" : "remember",
          },
          loss,
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
    case "ending":
      if (action === "finish") return change("finished");
      break;
  }
  throw Error("아직 이 명령의 조건을 갖추지 못했습니다.");
}
export function canPay(s: TimberState, resource: ResourceId, units: number) {
  return (
    s.world.resources[resource] >=
    (units + (resource === "RES_WOOD" ? s.reservedWood : 0)) * AMOUNT_SCALE
  );
}
