/// <reference lib="webworker" />
import {
  advanceDay,
  createInitialState,
  createSceneExample,
  type GameCommand,
  type GameWorkerMessage,
} from "@dynosty/game-core";

let state = createInitialState();
let sceneExampleUpdated = false;
function send(message: GameWorkerMessage) {
  self.postMessage(message);
}
send({ type: "state", state });
send({ type: "scene", snapshot: createSceneExample() });
self.onmessage = (event: MessageEvent<GameCommand>) => {
  try {
    switch (event.data.type) {
      case "advance-day":
        state = advanceDay(state);
        send({ type: "state", state });
        break;
      case "toggle-scene-example":
        sceneExampleUpdated = !sceneExampleUpdated;
        send({
          type: "scene",
          snapshot: createSceneExample(sceneExampleUpdated),
        });
        break;
    }
  } catch {
    send({ type: "error", message: "게임 계산을 진행하지 못했습니다." });
  }
};
