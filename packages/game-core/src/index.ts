// 연결 확인용 최소 상태. 실제 자원·주민 규칙은 게임 설계에 맞춰 추가한다.
export interface GameState {
  readonly schemaVersion: 1;
  readonly day: number;
}

export type GameCommand = { readonly type: "advance-day" };
export type GameWorkerMessage =
  | { readonly type: "state"; readonly state: GameState }
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
