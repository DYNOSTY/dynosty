/// <reference lib="webworker" />
import {
  commandTimber,
  createTimberSave,
  createTimberState,
  parseTimberSave,
  tickTimber,
} from "@dynosty/game-core";
import type { TimberRequest, TimberResponse } from "./timber-protocol.js";

let state = createTimberState(),
  last = performance.now();
const send = (m: TimberResponse) => self.postMessage(m);
const publish = () => send({ type: "state", state });
publish();
self.onmessage = (event: MessageEvent<TimberRequest>) => {
  const m = event.data;
  try {
    if (m.type === "command") state = commandTimber(state, m.command, m.id);
    else if (m.type === "save") {
      send({
        type: "saved",
        requestId: m.requestId,
        save: createTimberSave(state),
      });
      return;
    } else {
      const loaded = parseTimberSave(m.data);
      state = { ...loaded.state, paused: true, remainder: 0 };
      send({ type: "loaded", requestId: m.requestId });
    }
    last = performance.now();
    publish();
  } catch (e) {
    send({
      type: "error",
      requestId: m.type === "command" ? null : m.requestId,
      message:
        e instanceof Error ? e.message : "체험판 명령을 처리하지 못했습니다.",
    });
  }
};
setInterval(() => {
  const now = performance.now(),
    elapsed = Math.max(0, Math.floor(now - last));
  last = now;
  if (state.paused) return;
  try {
    state = tickTimber(state, elapsed);
    publish();
  } catch {
    state = { ...state, paused: true };
    publish();
    send({
      type: "error",
      requestId: null,
      message: "시간 진행을 멈췄습니다. 현재 상태와 저장 기록은 유지됩니다.",
    });
  }
}, 1000);
