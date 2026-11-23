import {
  BUILDING_RULES,
  productionSiteDefinition,
  RESEARCH_CATALOG,
  type TimberState,
} from "@dynosty/game-core";

export function villageCompletions(
  before: TimberState,
  after: TimberState,
): string[] {
  if (before.chapter !== after.chapter || after.elapsed < before.elapsed)
    return [];
  const lines: string[] = [];
  for (const f of after.town.facilities) {
    const old = before.town.facilities.find((q) => q.id === f.id);
    if (!old) lines.push(BUILDING_RULES[f.kind].name + " 건설 완료");
    else if (f.level > old.level)
      lines.push(
        BUILDING_RULES[f.kind].name + " " + f.level + "단계 개량 완료",
      );
  }
  for (const h of after.homes) {
    const old = before.homes.find((q) => q.id === h.id);
    if (!old) lines.push("온돌 둥지 건설 완료");
    else if ((h.level ?? 1) > (old.level ?? 1))
      lines.push("온돌 둥지 " + h.level + "단계 개량 완료");
  }
  const build = before.construction;
  if (build && !after.construction && build.kind !== "home") {
    const name =
      build.kind === "logging"
        ? productionSiteDefinition(build.siteId ?? "west").name + " 작업장"
        : BUILDING_RULES[build.kind].name;
    lines.push(name + " 건설 완료");
  }
  for (const id of after.town.development.completed)
    if (!before.town.development.completed.includes(id))
      lines.push(
        (RESEARCH_CATALOG.find((r) => r.id === id)?.name ?? id) + " 연구 완료",
      );
  if (after.decree && before.decree?.serial !== after.decree.serial)
    lines.push(after.decree.title + " 발효");
  return lines;
}
