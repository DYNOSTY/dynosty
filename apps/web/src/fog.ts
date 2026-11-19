// 아직 가 보지 않은 정찰 거점을 덮는 먹빛 안개 (땅 위 번진 먹 + 떠도는 먹 구름)
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { ScoutSite } from "./scout-sites.js";
import { elevation, rng } from "./world.js";

function inkTexture(scene: Scene, seed: number) {
  const size = 256,
    tex = new DynamicTexture(`ink-${seed}`, size, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const r = rng(seed);
  ctx.clearRect(0, 0, size, size);
  // 먹이 번진 얼룩: 원 여러 개를 겹쳐 가장자리를 들쭉날쭉하게
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2,
      d = r() * size * 0.22;
    const x = size / 2 + Math.cos(a) * d,
      y = size / 2 + Math.sin(a) * d,
      rad = size * (0.12 + r() * 0.2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, "rgba(52,48,60,0.34)");
    g.addColorStop(1, "rgba(52,48,60,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

export function createFog(scene: Scene, sites: ScoutSite[]) {
  const veils = new Map<
    string,
    { mesh: Mesh; mat: StandardMaterial; fade: number }
  >();
  sites.forEach((s, i) => {
    const mat = new StandardMaterial(`veil-${s.id}`, scene);
    mat.diffuseTexture = inkTexture(scene, 500 + i);
    mat.useAlphaFromDiffuseTexture = true;
    mat.disableLighting = true;
    mat.emissiveColor = Color3.White();
    mat.zOffset = -3;
    const mesh = CreateDisc(
      `veil-${s.id}`,
      { radius: 15, tessellation: 40 },
      scene,
    );
    mesh.rotation.x = Math.PI / 2;
    // 숲 위 7m에 떠서 거점을 덮는 먹 구름
    mesh.position.set(s.x, elevation(s.x, s.z) + 7, s.z);
    mesh.material = mat;
    mesh.isPickable = false;
    veils.set(s.id, { mesh, mat, fade: 1 });
  });
  const target = new Map<string, number>();
  return {
    reset() {
      target.clear();
      for (const v of veils.values()) {
        v.fade = 1;
        v.mat.alpha = 1;
        v.mesh.setEnabled(true);
      }
    },
    /** 정찰을 마치면 먹 안개가 2초에 걸쳐 걷힘 */
    reveal(id: string) {
      target.set(id, 0);
    },
    animate(dt: number) {
      for (const [id, to] of target) {
        const v = veils.get(id);
        if (!v) continue;
        v.fade = Math.max(to, v.fade - dt * 0.5);
        v.mat.alpha = v.fade;
        if (v.fade <= 0) {
          v.mesh.setEnabled(false);
          target.delete(id);
        }
      }
    },
    dispose() {
      for (const v of veils.values()) {
        v.mat.diffuseTexture?.dispose();
        v.mat.dispose();
        v.mesh.dispose();
      }
    },
  };
}
