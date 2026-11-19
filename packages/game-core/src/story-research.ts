import { applyCitizenEvent } from "./play.js";
import type { TimberState } from "./timber.js";

export type StoryRoute = "flight" | "mechanical" | "dictatorship";
export type StoryEvent =
  | "rebellion-started"
  | "rebellion-suppressed"
  | "chungnyeong-assassinated"
  | "allied-yangnyeong";
export interface ResearchStory {
  rebellion: boolean;
  route: StoryRoute | null;
  chungnyeong: "alive" | "dead" | "mechanical";
}
export const createResearchStory = (): ResearchStory => ({
  rebellion: false,
  route: null,
  chungnyeong: "alive",
});
export function recordResearchStory(
  s: TimberState,
  event: StoryEvent,
): TimberState {
  const previous = s.town.development.story;
  if (
    ![
      "rebellion-started",
      "rebellion-suppressed",
      "chungnyeong-assassinated",
      "allied-yangnyeong",
    ].includes(event)
  )
    throw Error("알 수 없는 이야기 사건입니다.");
  if (event === "rebellion-started") {
    if (previous.rebellion) return s;
    return {
      ...s,
      town: {
        ...s.town,
        development: {
          ...s.town.development,
          story: { ...previous, rebellion: true },
        },
      },
    };
  }
  if (!previous.rebellion)
    throw Error("양녕의 반란 사건이 먼저 발생해야 합니다.");
  const route: StoryRoute =
    event === "rebellion-suppressed"
      ? "flight"
      : event === "chungnyeong-assassinated"
        ? "mechanical"
        : "dictatorship";
  if (previous.route !== null) {
    if (previous.route === route) return s;
    throw Error("이미 확정한 후반 분기를 다른 노선으로 바꿀 수 없습니다.");
  }
  const story: ResearchStory = {
    ...previous,
    route,
    chungnyeong: route === "mechanical" ? "dead" : "alive",
  };
  return {
    ...s,
    town: { ...s.town, development: { ...s.town.development, story } },
  };
}
export function mechanizeCitizen(s: TimberState, source: string) {
  if (
    s.town.development.story.route !== "mechanical" ||
    !s.town.development.completed.includes("TECH_MECHA2") ||
    s.town.development.story.chungnyeong !== "mechanical"
  )
    throw Error("충녕의 기계 부활과 메카2 연구가 필요합니다.");
  return applyCitizenEvent(s.world, {
    type: "mechanize",
    id: `bone-worker-${s.world.citizens.findIndex((c) => c.id === source)}`,
    sourceCitizenId: source,
  });
}
export function storyResearchValid(s: TimberState): boolean {
  const d = s.town.development,
    story = d.story;
  if (
    !story ||
    typeof story.rebellion !== "boolean" ||
    ![null, "flight", "mechanical", "dictatorship"].includes(story.route) ||
    !["alive", "dead", "mechanical"].includes(story.chungnyeong) ||
    (!story.rebellion && story.route !== null) ||
    (story.route !== "mechanical" && story.chungnyeong !== "alive") ||
    (story.route === "mechanical" && story.chungnyeong === "alive") ||
    (story.chungnyeong === "mechanical") !== d.completed.includes("TECH_MECHA2")
  )
    return false;
  for (const [tech, route] of [
    ["TECH_FLIGHT", "flight"],
    ["TECH_MECHA2", "mechanical"],
    ["TECH_ELECTRICAL", "dictatorship"],
    ["R18", "mechanical"],
  ])
    if (d.completed.includes(tech ?? "") && story.route !== route) return false;
  if (
    !Array.isArray(d.electrical) ||
    new Set(d.electrical).size !== d.electrical.length ||
    (d.electrical.length > 0 && !d.completed.includes("TECH_ELECTRICAL")) ||
    d.electrical.some(
      (id) =>
        !s.town.facilities.some(
          (f) =>
            f.id === id &&
            [
              "logging",
              "coal",
              "iron",
              "quarry",
              "fishery",
              "farm",
              "ranch",
            ].includes(f.kind),
        ),
    )
  )
    return false;
  return s.world.citizens.every(
    (c) => !c.mechanicalFrom || d.completed.includes("TECH_MECHA2"),
  );
}
