import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { Scene } from "@babylonjs/core/scene";
import type { SceneSnapshot } from "@dynosty/game-core";
import { createSceneEntities } from "./scene-entities.js";

export interface SceneController {
  update(snapshot: SceneSnapshot): void;
  dispose(): void;
}

export function mountScene(canvas: HTMLCanvasElement): SceneController {
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.08, 0.14, 0.12, 1);
  const camera = new ArcRotateCamera(
    "camera",
    -Math.PI / 2,
    Math.PI / 3,
    12,
    Vector3.Zero(),
    scene,
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 4;
  camera.upperRadiusLimit = 24;
  new HemisphericLight("sun", new Vector3(0, 1, 0), scene);
  const ground = CreateGround("ground", { width: 10, height: 10 }, scene);
  const groundMaterial = new StandardMaterial("ground-material", scene);
  groundMaterial.diffuseColor = new Color3(0.28, 0.43, 0.28);
  ground.material = groundMaterial;
  const entities = createSceneEntities(scene);
  const observer = new ResizeObserver(() => engine.resize());
  observer.observe(canvas);
  engine.runRenderLoop(() => scene.render());
  return {
    update: entities.update,
    dispose() {
      observer.disconnect();
      entities.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
