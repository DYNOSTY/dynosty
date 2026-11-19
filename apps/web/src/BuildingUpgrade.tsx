import {
  GAME_RULES,
  type TimberCommand,
  type TimberState,
  upgradeCost,
  upgradeIssue,
  upgradeTarget,
} from "@dynosty/game-core";
export function BuildingUpgrade({
  state,
  id,
  command,
}: {
  state: TimberState;
  id: string;
  command: (c: TimberCommand) => void;
}) {
  const f = upgradeTarget(state, id);
  if (!f) return null;
  const issue = upgradeIssue(state, id);
  const cost = Object.entries(upgradeCost(f))
    .map(
      ([r, n]) =>
        GAME_RULES.resources[r as keyof typeof GAME_RULES.resources].name + n,
    )
    .join(" · ");
  return (
    <div>
      <button
        type="button"
        disabled={!!issue}
        onClick={() => command({ type: "upgrade-facility", id })}
      >
        {f.level >= 3
          ? "최고3단계"
          : `${String(f.level + 1)}단계 개량 · ${cost}`}
      </button>
      {issue && f.level < 3 ? <p className="hint">{issue}</p> : null}
    </div>
  );
}
