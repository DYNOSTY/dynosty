import type {
  PlayState,
  SceneSnapshot,
  TimberCommand,
  TimberSave,
  TimberState,
} from "@dynosty/game-core";
export type TimberRequest =
  | { type: "init"; world: PlayState; resume?: unknown }
  | { type: "exit" }
  | { type: "command"; id: string; command: TimberCommand }
  | { type: "save"; requestId: number }
  | { type: "load"; requestId: number; data: unknown };
export type TimberResponse =
  | { type: "exited"; world: PlayState }
  | {
      type: "state";
      scene: SceneSnapshot;
      resumeJson: string;
      completions?: string[];
      resetNotices?: boolean;
    }
  | { type: "saved"; requestId: number; save: TimberSave }
  | { type: "loaded"; requestId: number }
  | { type: "error"; message: string; requestId: number | null };

// Private worker-to-UI snapshot. The same bytes are also the resume file.
export function encodeVillageSnapshot(state: TimberState): string {
  return JSON.stringify({
    format: "dynosty-timber",
    saveVersion: 1,
    state,
  } satisfies TimberSave);
}
export function readWorkerSnapshot(json: string): TimberState {
  return (JSON.parse(json) as TimberSave).state;
}
