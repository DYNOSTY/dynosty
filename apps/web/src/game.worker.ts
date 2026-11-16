/// <reference lib="webworker" />
import {
  advanceDay,
  createExampleSave,
  createInitialState,
  createSceneExample,
  type GameCommand,
  type GameWorkerMessage,
  parseExampleSave,
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
      case "request-save":
        send({
          type: "save-ready",
          requestId: event.data.requestId,
          save: createExampleSave(state, sceneExampleUpdated),
        });
        break;
      case "load-example": {
        const saved = parseExampleSave(event.data.data);
        state = saved.game;
        sceneExampleUpdated = saved.sceneExampleUpdated;
        send({ type: "state", state });
        send({
          type: "scene",
          snapshot: createSceneExample(sceneExampleUpdated),
        });
        send({ type: "load-complete", requestId: event.data.requestId });
        break;
      }
    }
  } catch {
    if (
      event.data.type === "request-save" ||
      event.data.type === "load-example"
    )
      send({
        type: "save-error",
        requestId: event.data.requestId,
        message:
          "저장 정보를 처리하지 못했습니다. 현재 예제와 기존 저장은 유지됩니다.",
      });
    else send({ type: "error", message: "게임 계산을 진행하지 못했습니다." });
  }
};
