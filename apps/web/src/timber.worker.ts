/// <reference lib="webworker" />
import {
  campaignOf,
  commandTimber,
  createTimberSave,
  createVillageGame,
  parseTimberSave,
  tickTimber,
  updateCampaign,
} from "@dynosty/game-core";
import type { TimberRequest, TimberResponse } from "./timber-protocol.js";

function resumeVillage(data: unknown) {
  const saved = parseTimberSave(data).state;
  // Earlier developer saves can already have a mutually exclusive research ending.
  const campaign =
    saved.campaign || !saved.town.development.story.rebellion
      ? { campaign: campaignOf(saved) }
      : {};
  return updateCampaign({ ...saved, ...campaign, paused: true, remainder: 0 });
}
let state = createVillageGame(true),
  last = performance.now();
let initialized = false;
const send = (m: TimberResponse) => self.postMessage(m);
const publish = () => send({ type: "state", state });
self.onmessage = (event: MessageEvent<TimberRequest>) => {
  const m = event.data;
  try {
    if (m.type === "init") {
      if (!initialized)
        state = m.resume ? resumeVillage(m.resume) : createVillageGame(true);
      initialized = true;
    } else if (m.type === "exit") {
      state = { ...state, paused: true, remainder: 0 };
      send({ type: "exited", world: state.world });
      publish();
      return;
    } else if (m.type === "command")
      state =
        m.command.type === "restart"
          ? createVillageGame(true)
          : commandTimber(state, m.command, m.id);
    else if (m.type === "save") {
      send({
        type: "saved",
        requestId: m.requestId,
        save: createTimberSave(state),
      });
      return;
    } else {
      state = resumeVillage(m.data);
      initialized = true;
      send({ type: "loaded", requestId: m.requestId });
    }
    last = performance.now();
    publish();
  } catch (e) {
    send({
      type: "error",
      requestId: m.type === "save" || m.type === "load" ? m.requestId : null,
      message:
        e instanceof Error ? e.message : "마을 명령을 처리하지 못했습니다.",
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
