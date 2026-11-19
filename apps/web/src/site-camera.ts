import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { SITE_POINTS, type SiteId } from "./site-targets.js";
/** 작업 보기 전용. 실제 포인터 선택은 카메라를 이동시키지 않는다. */
export function focusSiteCamera(camera: ArcRotateCamera, id: SiteId) {
  camera.setTarget(new Vector3(...SITE_POINTS[id]));
  camera.alpha = -Math.PI / 2;
  camera.beta = Math.PI / 3;
  camera.radius = 8;
  camera.inertialAlphaOffset = 0;
  camera.inertialBetaOffset = 0;
  camera.inertialRadiusOffset = 0;
  camera.inertialPanningX = 0;
  camera.inertialPanningY = 0;
}

export function resetSceneCamera(camera: ArcRotateCamera) {
  camera.setTarget(Vector3.Zero());
  camera.alpha = -Math.PI / 2;
  camera.beta = Math.PI / 3;
  camera.radius = 12;
  camera.inertialAlphaOffset =
    camera.inertialBetaOffset =
    camera.inertialRadiusOffset =
      0;
  camera.inertialPanningX = camera.inertialPanningY = 0;
}
