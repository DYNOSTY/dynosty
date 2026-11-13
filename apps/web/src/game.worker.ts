/// <reference lib="webworker" />
import {
  advanceDay,
  createInitialState,
  type GameCommand,
  type GameWorkerMessage,
} from "@dynosty/game-core";

let state = createInitialState();
function send(message: GameWorkerMessage) {
  self.postMessage(message);
}
send({ type: "state", state });
self.onmessage = (event: MessageEvent<GameCommand>) => {
  if (event.data.type !== "advance-day") return;
  try {
    state = advanceDay(state);
    send({ type: "state", state });
  } catch {
    send({ type: "error", message: "게임 계산을 진행하지 못했습니다." });
  }
};
