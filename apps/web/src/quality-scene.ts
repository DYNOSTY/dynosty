import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { type LaborState, TIMBER_RULES } from "@dynosty/game-core";
import { qualityView } from "./quality-view.js";
/** 표시만 분리한다. 선택 대상·게임 시간·물량은 기존 원장을 유지한다. */
export function createQualityVisual(scene: Scene) {
  const material = new StandardMaterial("quality-allocated-material", scene);
  material.diffuseColor = new Color3(0.96, 0.5, 0.15);
  material.specularColor = Color3.Black();
  const pending = new StandardMaterial("quality-pending-material", scene);
  pending.diffuseColor = new Color3(0.55, 0.6, 0.6);
  pending.specularColor = Color3.Black();
  const checkedMaterial = scene.getMaterialByName("exchange-accepted");
  const allocated = CreateBox(
    "quality-allocated",
    { width: 1.2, height: 0.35, depth: 0.7 },
    scene,
  );
  allocated.position.set(-3.5, 0.175, -3.7);
  allocated.material = material;
  allocated.isPickable = false;
  allocated.setEnabled(false);
  const accepted = scene.getMeshByName("timber-accepted"),
    parcel = scene.getMeshByName("exchange-inspection-parcel"),
    quarantine = scene.getMeshByName("timber-quarantine");
  return {
    update(s: LaborState | null) {
      allocated.setEnabled(false);
      if (!s) {
        if (parcel) parcel.scaling.x = 1;
        if (quarantine) quarantine.scaling.x = 1;
        return;
      }
      const { bins } = qualityView(s);
      if (accepted) {
        accepted.setEnabled(bins.available > 0);
        accepted.scaling.x = Math.max(
          0.15,
          bins.available / TIMBER_RULES.requested,
        );
      }
      allocated.setEnabled(bins.allocated > 0);
      allocated.scaling.x = Math.max(
        0.15,
        bins.allocated / TIMBER_RULES.requested,
      );
      if (parcel) {
        parcel.material = bins.checked > 0 ? checkedMaterial : pending;
        parcel.setEnabled(bins.waiting + bins.checked > 0);
        parcel.scaling.x = Math.max(
          0.15,
          (bins.waiting + bins.checked) / TIMBER_RULES.requested,
        );
      }
      if (quarantine)
        quarantine.scaling.x = Math.max(
          0.15,
          bins.quarantine / TIMBER_RULES.offers.A.wet,
        );
    },
    dispose() {
      allocated.dispose();
      material.dispose();
      pending.dispose();
    },
  };
}
