import "@babylonjs/core/Rendering/outlineRenderer";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { LaborState } from "@dynosty/game-core";
import { SITE_IDS, type SiteId, siteAvailable } from "./site-targets.js";

const targets = {
  "site-inspection": [
    "exchange-inspection-table",
    "exchange-inspection-parcel",
  ],
  "site-quarantine": ["timber-quarantine"],
  "site-ration": [
    "labor-prep-station",
    "labor-queue-0",
    "labor-queue-1",
    "labor-queue-2",
  ],
} as const;
export function createSiteSelection(
  scene: Scene,
  onChange: (id: SiteId | null) => void,
) {
  let state: LaborState | null = null,
    selected: SiteId | null = null;
  const meshes = new Map<SiteId, AbstractMesh[]>();
  for (const id of SITE_IDS)
    meshes.set(
      id,
      targets[id].flatMap((n) => {
        const m = scene.getMeshByName(n);
        return m ? [m, ...m.getChildMeshes(false)] : [];
      }),
    );
  function outline(id: SiteId, enabled: boolean) {
    for (const m of meshes.get(id) ?? []) {
      m.renderOutline =
        enabled &&
        m.isEnabled() &&
        m.isVisible &&
        (id !== "site-ration" || m.name === "labor-prep-station");
      m.outlineColor = new Color3(0.3, 0.9, 1);
      m.outlineWidth = 0.05;
    }
  }
  function available(id: SiteId) {
    return (
      siteAvailable(state, id) &&
      (meshes.get(id) ?? []).some((m) => m.isEnabled() && m.isVisible)
    );
  }
  function select(id: SiteId | null) {
    const next = id && available(id) ? id : null;
    if (next === selected) return;
    if (selected) outline(selected, false);
    selected = next;
    if (next) outline(next, true);
    onChange(next);
  }
  return {
    select,
    update(s: LaborState | null) {
      state = s;
      for (const [id, parts] of meshes)
        for (const m of parts)
          m.isPickable = available(id) && m.isEnabled() && m.isVisible;
      if (selected) {
        if (!available(selected)) select(null);
        else outline(selected, true);
      }
    },
    idForMesh(mesh: AbstractMesh | null): SiteId | null {
      if (!mesh) return null;
      for (const [id, parts] of meshes)
        if (available(id) && parts.includes(mesh)) return id;
      return null;
    },
    dispose() {
      if (selected) outline(selected, false);
      selected = null;
      for (const parts of meshes.values())
        for (const m of parts) m.isPickable = false;
      meshes.clear();
    },
  };
}
