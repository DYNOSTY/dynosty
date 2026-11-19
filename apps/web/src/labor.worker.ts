/// <reference lib="webworker" />
import {
  commandLabor,
  createLaborSave,
  createLaborState,
  parseLaborSave,
  tickLabor,
} from "@dynosty/game-core";
import type { LaborRequest, LaborResponse } from "./labor-protocol.js";

let state = createLaborState(),
  last = performance.now();
const send = (m: LaborResponse) => self.postMessage(m);
const publish = (reset = false) => send({ type: "state", state, reset });
publish(true);
self.onmessage = (event: MessageEvent<LaborRequest>) => {
  const m = event.data;
  try {
    if (m.type === "command") state = commandLabor(state, m.command, m.id);
    else if (m.type === "save") {
      send({
        type: "saved",
        requestId: m.requestId,
        save: createLaborSave(state),
      });
      return;
    } else {
      state = { ...parseLaborSave(m.data).state, paused: true, remainder: 0 };
      publish(true);
      send({ type: "loaded", requestId: m.requestId });
      last = performance.now();
      return;
    }
    last = performance.now();
    publish(m.type === "command" && m.command.type === "restart");
  } catch (e) {
    send({
      type: "error",
      requestId: m.type === "command" ? null : m.requestId,
      message:
        e instanceof Error ? e.message : "일손 명령을 처리하지 못했습니다.",
    });
  }
};
setInterval(() => {
  const now = performance.now(),
    elapsed = Math.max(0, Math.floor(now - last));
  last = now;
  if (state.paused) return;
  try {
    state = tickLabor(state, elapsed);
    publish();
  } catch {
    state = { ...state, paused: true };
    publish();
    send({
      type: "error",
      requestId: null,
      message: "일손 시간 진행을 멈췄습니다. 현재 진행과 원본을 유지합니다.",
    });
  }
}, 1000);
