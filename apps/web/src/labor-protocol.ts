import type { LaborCommand, LaborSave, LaborState } from "@dynosty/game-core";
export type LaborRequest =
  | { type: "command"; id: string; command: LaborCommand }
  | { type: "save"; requestId: number }
  | { type: "load"; requestId: number; data: unknown };
export type LaborResponse =
  | { type: "state"; state: LaborState }
  | { type: "saved"; requestId: number; save: LaborSave }
  | { type: "loaded"; requestId: number }
  | { type: "error"; requestId: number | null; message: string };
