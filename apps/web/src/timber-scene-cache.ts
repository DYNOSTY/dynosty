import {
  type SceneSnapshot,
  type TimberState,
  timberScene,
} from "@dynosty/game-core";

const scenes = new WeakMap<TimberState, SceneSnapshot>();

export function rememberScene(state: TimberState, scene: SceneSnapshot) {
  scenes.set(state, scene);
}

export function sceneOf(state: TimberState): SceneSnapshot {
  let scene = scenes.get(state);
  if (!scene) {
    scene = timberScene(state);
    scenes.set(state, scene);
  }
  return scene;
}
