import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { Scene } from "@babylonjs/core/scene";

export function mountScene(canvas: HTMLCanvasElement): () => void {
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
  const building = CreateBox("sample-building", { size: 1.5 }, scene);
  building.position.y = 0.75;
  const buildingMaterial = new StandardMaterial("building-material", scene);
  buildingMaterial.diffuseColor = new Color3(0.84, 0.66, 0.38);
  building.material = buildingMaterial;
  const observer = new ResizeObserver(() => engine.resize());
  observer.observe(canvas);
  engine.runRenderLoop(() => scene.render());
  return () => {
    observer.disconnect();
    scene.dispose();
    engine.dispose();
  };
}
