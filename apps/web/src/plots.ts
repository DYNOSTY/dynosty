// 부지: 아직 안 지은 자리에는 말뚝과 줄을 친 빈 터를, 짓는 중인 자리에는 공사 모형 세 단계
// (터 닦기 → 골조 → 지붕 얹기, tools/blender/site3d.py의 build_stage)를 세움. 다 지으면 치우고 건물이 보임(village.ts).
// 빈 터와 공사 모형도 누르면 그 부지("bld:번호")가 골라짐.
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Node } from "@babylonjs/core/node";
import type { Scene } from "@babylonjs/core/scene";
import { LAYOUT } from "./layout.js";
import { loadSceneAsset } from "./scene-assets.js";
import { elevation } from "./world.js";

/** 공사 모형 1 = 게임 1.35 (모형의 집 자리 3.4×2.4 → 둥지·창고 크기) */
export const PLOT_SCALE = 1.35;
/** 빈 터의 말뚝 자리 (부지 가운데에서, 게임 길이) */
const LOT = { x: 2.3, z: 1.7 };

/** 단계가 바뀌면 새 모형이 이만큼(초)에 걸쳐 땅에서 솟음 */
const RISE = 0.6;

/** 0 = 빈 터, 1~3 = 공사 단계 */
export type PlotStage = 0 | 1 | 2 | 3;

export function createPlots(
  scene: Scene,
  root: TransformNode | null,
  onFail: () => void,
) {
  let disposed = false;
  const owners = new Map<Node, number>();
  const mat = (name: string, r: number, g: number, b: number) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = new Color3(r, g, b);
    m.specularColor = Color3.Black();
    return m;
  };
  const stakeMat = mat("plot-stake", 0.34, 0.25, 0.17);
  const ropeMat = mat("plot-rope", 0.62, 0.52, 0.34);
  // 누를 자리: 눈밭보다 살짝 어두운 다져진 땅
  const padMat = mat("plot-pad", 0.62, 0.66, 0.76);
  const baked = new Map<number, StandardMaterial>();
  const bakedMat = (stage: number) => {
    let m = baked.get(stage);
    if (m) return m;
    m = new StandardMaterial(`plot-stage-${stage}`, scene);
    // 그림은 GLB에 넣지 않고 따로 읽음 (resource-sites.ts와 같은 까닭)
    const t = new Texture(
      `/models/sites/SITE3_BUILD${stage}.jpg`,
      scene,
      false,
      false,
    );
    t.anisotropicFilteringLevel = 4;
    m.diffuseTexture = t;
    m.specularColor = Color3.Black();
    m.backFaceCulling = false;
    baked.set(stage, m);
    return m;
  };

  type Plot = {
    node: TransformNode;
    stage: PlotStage;
    /** 단계별 모형 (0 = 빈 터의 말뚝과 줄) */
    parts: Map<number, TransformNode>;
    loading: Set<number>;
    /** 단계가 바뀐 뒤 지난 시간(초) */
    rise: number;
  };
  const plots = new Map<number, Plot>();

  function emptyLot(parent: TransformNode) {
    const lot = new TransformNode("plot-lot", scene);
    lot.parent = parent;
    const pad = CreateDisc(
      "plot-pad",
      { radius: 3.3, tessellation: 20 },
      scene,
    );
    pad.rotation.x = Math.PI / 2;
    pad.scaling.y = 0.78;
    pad.position.y = 0.04;
    pad.material = padMat;
    pad.parent = lot;
    const corners: Array<[number, number]> = [
      [-LOT.x, -LOT.z],
      [LOT.x, -LOT.z],
      [LOT.x, LOT.z],
      [-LOT.x, LOT.z],
    ];
    corners.forEach(([x, z], i) => {
      const stake = CreateCylinder(
        "plot-stake",
        {
          height: 1.1,
          diameterTop: 0.1,
          diameterBottom: 0.14,
          tessellation: 6,
        },
        scene,
      );
      stake.position.set(x, 0.5, z);
      stake.material = stakeMat;
      stake.parent = lot;
      const [nx, nz] = corners[(i + 1) % 4] ?? [x, z];
      const len = Math.hypot(nx - x, nz - z);
      const rope = CreateBox(
        "plot-rope",
        { width: len, height: 0.04, depth: 0.04 },
        scene,
      );
      rope.position.set((x + nx) / 2, 0.86, (z + nz) / 2);
      rope.rotation.y = -Math.atan2(nz - z, nx - x);
      rope.material = ropeMat;
      rope.parent = lot;
    });
    return lot;
  }

  function show(plot: number, p: Plot) {
    for (const [stage, part] of p.parts) part.setEnabled(stage === p.stage);
    if (p.parts.has(p.stage) || p.loading.has(p.stage)) return;
    const stage = p.stage;
    if (stage === 0) {
      p.parts.set(0, emptyLot(p.node));
      return;
    }
    p.loading.add(stage);
    void loadSceneAsset(scene, `/models/sites/SITE3_BUILD${stage}.glb`)
      .then((asset) => {
        if (disposed) return;
        const part = new TransformNode(`plot-${plot}-stage-${stage}`, scene);
        part.parent = p.node;
        part.rotation.y = Math.PI; // 모형의 앞이 기본 시점의 카메라를 봄
        part.scaling.setAll(PLOT_SCALE);
        const inst = asset.instantiateModelsToScene(
          (n) => `plot-${plot}-${stage}:${n}`,
          false,
        );
        for (const top of inst.rootNodes) top.parent = part;
        for (const mesh of part.getChildMeshes()) {
          mesh.isPickable = true;
          mesh.material = bakedMat(stage);
        }
        p.parts.set(stage, part);
        part.setEnabled(p.stage === stage);
      })
      .catch(onFail);
  }

  return {
    /** 부지마다 지금 단계. 여기 없는 부지는 다 지은 것 → 표식을 치움.
     *  돌려주는 값 = 방금 단계가 올라갔거나 다 지은 부지의 자리 (눈먼지를 일으킬 곳) */
    set(stages: Map<number, PlotStage>): Vector3[] {
      const changed: Vector3[] = [];
      for (const [plot, stage] of stages) {
        let p = plots.get(plot);
        if (!p) {
          const [, x, z] = LAYOUT[plot] ?? ["", 0, 0];
          const node = new TransformNode(`plot-${plot}`, scene);
          node.parent = root;
          node.position.set(x, elevation(x, z), z);
          owners.set(node, plot);
          p = { node, stage, parts: new Map(), loading: new Set(), rise: RISE };
          plots.set(plot, p);
        }
        if (stage > p.stage) {
          p.rise = 0;
          changed.push(p.node.position);
        }
        p.stage = stage;
        p.node.setEnabled(true);
        show(plot, p);
      }
      for (const [plot, p] of plots)
        if (!stages.has(plot) && p.node.isEnabled()) {
          if (p.stage > 0) changed.push(p.node.position);
          p.node.setEnabled(false);
        }
      return changed;
    },
    animate(dt: number) {
      for (const p of plots.values()) {
        if (p.rise >= RISE) continue;
        p.rise = Math.min(RISE, p.rise + dt);
        const part = p.stage > 0 ? p.parts.get(p.stage) : undefined;
        if (part)
          part.scaling.y =
            PLOT_SCALE * (0.62 + 0.38 * (1 - (1 - p.rise / RISE) ** 3));
      }
    },
    /** 누른 조각이 어느 부지인지 (LAYOUT 번호, 부지가 아니면 null) */
    plotForMesh(mesh: Node | null): number | null {
      for (let n = mesh; n; n = n.parent) {
        const i = owners.get(n);
        if (i !== undefined) return i;
      }
      return null;
    },
    dispose() {
      disposed = true;
      for (const p of plots.values()) p.node.dispose();
      for (const m of baked.values()) m.dispose();
    },
  };
}
