export {
  createSceneExample,
  type SceneEntity,
  type ScenePosition,
  type SceneSnapshot,
  validateSceneSnapshot,
} from "./scene.js";

import type { PlaySave, PlayState } from "./play.js";
import type { ExampleSave } from "./save.js";
import type { SceneSnapshot } from "./scene.js";

export {
  createExampleSave,
  type ExampleSave,
  isRecord,
  parseExampleSave,
  SaveDataError,
} from "./save.js";

// 연결 확인용 최소 상태. 실제 자원·주민 규칙은 게임 설계에 맞춰 추가한다.
export interface GameState {
  readonly schemaVersion: 1;
  readonly day: number;
}

export type PlayCommand =
  | { readonly type: "pause"; readonly paused: boolean }
  | { readonly type: "advance-day" }
  | { readonly type: "new-game" }
  | { readonly type: "test-food"; readonly days: number };
export type GameCommand =
  | { readonly type: "play-command"; readonly command: PlayCommand }
  | { readonly type: "request-play-save"; readonly requestId: number }
  | {
      readonly type: "load-play";
      readonly requestId: number;
      readonly data: unknown;
    }
  | { readonly type: "advance-day" }
  | { readonly type: "toggle-scene-example" }
  | { readonly type: "request-save"; readonly requestId: number }
  | {
      readonly type: "load-example";
      readonly requestId: number;
      readonly data: unknown;
    };
export type GameWorkerMessage =
  | { readonly type: "play-state"; readonly state: PlayState }
  | { readonly type: "play-error"; readonly message: string }
  | {
      readonly type: "play-save-ready";
      readonly requestId: number;
      readonly save: PlaySave;
    }
  | { readonly type: "play-loaded"; readonly requestId: number }
  | {
      readonly type: "play-save-error";
      readonly requestId: number;
      readonly message: string;
    }
  | { readonly type: "state"; readonly state: GameState }
  | { readonly type: "scene"; readonly snapshot: SceneSnapshot }
  | {
      readonly type: "save-ready";
      readonly requestId: number;
      readonly save: ExampleSave;
    }
  | { readonly type: "load-complete"; readonly requestId: number }
  | {
      readonly type: "save-error";
      readonly requestId: number;
      readonly message: string;
    }
  | { readonly type: "error"; readonly message: string };

export function createInitialState(): GameState {
  return { schemaVersion: 1, day: 1 };
}

export function advanceDay(state: GameState): GameState {
  if (
    !Number.isSafeInteger(state.day) ||
    state.day < 1 ||
    state.day === Number.MAX_SAFE_INTEGER
  ) {
    throw new RangeError("게임 날짜는 증가 가능한 양의 정수여야 합니다.");
  }
  return { ...state, day: state.day + 1 };
}

export * from "./bokhol.js";
export * from "./development.js";
export * from "./exchange.js";
export * from "./home-construction.js";
export * from "./home-placement.js";
export * from "./hospital.js";
export * from "./labor.js";
export {
  TIMBER_RULES as LEGACY_TIMBER_RULES,
  type TimberCommand as LegacyTimberCommand,
  TimberError as LegacyTimberError,
  type TimberState as LegacyTimberState,
} from "./legacy-timber.js";
export * from "./logging.js";
export {
  AMOUNT_SCALE,
  advancePlayClock,
  advancePlayMinutes,
  applyCitizenEvent,
  type Citizen,
  type CitizenEvent,
  createPlaySave,
  createPlayScene,
  createPlayState,
  dailyFoodDemand,
  evaluateOutcome,
  FOOD_IDS,
  type FoodId,
  foodWarnings,
  GAME_RULES,
  type OutcomeFacts,
  PlayDataError,
  type PlaySave,
  type PlayState,
  parsePlaySave,
  parsePlayState,
  parseRules,
  RESOURCE_IDS,
  type ResourceId,
  type RuleSet,
  setPlayPaused,
  supplyFood,
  tickPlay,
} from "./play.js";
export {
  type GroundObstacle,
  type GroundPoint,
  residentPath,
} from "./resident-path.js";
export * from "./resident-routine.js";
export * from "./scout-sites.js";
export * from "./storage.js";
export * from "./story-research.js";
export * from "./timber.js";
export * from "./town.js";
export * from "./village-services.js";
