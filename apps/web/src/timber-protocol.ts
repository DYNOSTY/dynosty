import type {
  PlayState,
  TimberCommand,
  TimberSave,
  TimberState,
} from "@dynosty/game-core";
export type TimberRequest =
  | { type: "init"; world: PlayState }
  | { type: "exit" }
  | { type: "command"; id: string; command: TimberCommand }
  | { type: "save"; requestId: number }
  | { type: "load"; requestId: number; data: unknown };
export type TimberResponse =
  | { type: "exited"; world: PlayState }
  | { type: "state"; state: TimberState }
  | { type: "saved"; requestId: number; save: TimberSave }
  | { type: "loaded"; requestId: number }
  | { type: "error"; message: string; requestId: number | null };
