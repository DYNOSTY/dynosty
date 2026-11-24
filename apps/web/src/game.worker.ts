/// <reference lib="webworker" />
import {
  advanceDay,
  advancePlayMinutes,
  createExampleSave,
  createInitialState,
  createPlaySave,
  createPlayScene,
  createPlayState,
  createSceneExample,
  GAME_RULES,
  type GameCommand,
  type GameWorkerMessage,
  type PlayState,
  parseExampleSave,
  parsePlaySave,
  setPlayPaused,
  supplyFood,
  tickPlay,
} from "@dynosty/game-core";

let state = createInitialState();
let play: PlayState | null = null;
let manualScene = false;
let lastTick = performance.now();
let sceneExampleUpdated = false;
function send(message: GameWorkerMessage) {
  self.postMessage(message);
}
send({ type: "state", state });
send({ type: "scene", snapshot: createSceneExample() });
function publishPlay() {
  if (!play) return;
  send({ type: "play-state", state: play });
  if (!manualScene) send({ type: "scene", snapshot: createPlayScene(play) });
}
try {
  play = createPlayState();
  publishPlay();
} catch {
  send({
    type: "play-error",
    message: "게임 기준을 확인하지 못해 새 게임을 시작할 수 없습니다.",
  });
}
setInterval(() => {
  const now = performance.now();
  const elapsed = Math.max(0, Math.floor(now - lastTick));
  lastTick = now;
  if (!play || play.paused) return;
  try {
    play = tickPlay(play, elapsed);
    publishPlay();
  } catch {
    if (play) play = setPlayPaused(play, true);
    send({
      type: "play-error",
      message: "시간 계산을 중지했습니다. 저장 기록은 유지됩니다.",
    });
  }
}, GAME_RULES.time.tickMs);
self.onmessage = (event: MessageEvent<GameCommand>) => {
  try {
    switch (event.data.type) {
      case "play-command": {
        const command = event.data.command;
        if (command.type === "new-game") play = createPlayState();
        else if (!play) throw new Error("새 게임 기준 없음");
        else if (command.type === "pause")
          play = setPlayPaused(play, command.paused);
        else if (command.type === "advance-day")
          play = advancePlayMinutes(play, 1440);
        else if (command.type === "test-food")
          play = supplyFood(play, command.days);
        manualScene = false;
        lastTick = performance.now();
        publishPlay();
        break;
      }
      case "request-play-save":
        if (!play) throw new Error("저장할 게임 없음");
        send({
          type: "play-save-ready",
          requestId: event.data.requestId,
          save: createPlaySave(play),
        });
        break;
      case "load-play":
        play = setPlayPaused(parsePlaySave(event.data.data).state, true);
        manualScene = false;
        lastTick = performance.now();
        publishPlay();
        send({ type: "play-loaded", requestId: event.data.requestId });
        break;
      case "advance-day":
        state = advanceDay(state);
        send({ type: "state", state });
        break;
      case "toggle-scene-example":
        manualScene = true;
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
        manualScene = true;
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
      event.data.type === "request-play-save" ||
      event.data.type === "load-play"
    ) {
      send({
        type: "play-save-error",
        requestId: event.data.requestId,
        message:
          "게임 저장을 처리하지 못했습니다. 현재 게임과 기존 기록은 유지됩니다.",
      });
      return;
    }
    if (event.data.type === "play-command") {
      send({
        type: "play-error",
        message: "게임 명령을 처리하지 못했습니다. 현재 상태를 유지합니다.",
      });
      return;
    }
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
