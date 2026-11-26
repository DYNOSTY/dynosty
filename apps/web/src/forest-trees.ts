import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import type { Scene } from "@babylonjs/core/scene";
import {
  BOKHOL_FORESTS,
  LOGGING_RULES,
  loggingSite,
  productionSites,
  type TimberState,
} from "@dynosty/game-core";
import {
  forestCounts,
  forestDecorations,
  forestIsFar,
} from "./forest-layout.js";
import { loadSceneAsset } from "./scene-assets.js";
import { terrainElevation } from "./terrain.js";

const standing = ["TREE_FIR", "TREE_FIR_B", "TREE_FIR_C", "TREE_PINE"];
const far = ["TREE_FIR_FAR", "TREE_PINE_FAR"];
const kinds = [
  ...standing,
  ...far,
  "TREE_STUMP",
  "TREE_FIR_YOUNG",
  "TREE_SHRUB",
  "TREE_PINE_FALLEN",
  "TREE_SNAG",
  "TREE_SNAG_B",
];

// 법선이 없는 조각은 원본처럼 기존 대체 나무의 감김을 기준으로 맞춘다.
function windingScore(pos: ArrayLike<number>, ix: ArrayLike<number>) {
  let cx = 0,
    cy = 0,
    cz = 0;
  for (let i = 0; i < pos.length; i += 3) {
    cx += pos[i] ?? 0;
    cy += pos[i + 1] ?? 0;
    cz += pos[i + 2] ?? 0;
  }
  const count = pos.length / 3;
  cx /= count;
  cy /= count;
  cz /= count;
  let score = 0;
  for (let i = 0; i < ix.length; i += 3) {
    const a = (ix[i] ?? 0) * 3,
      b = (ix[i + 1] ?? 0) * 3,
      c = (ix[i + 2] ?? 0) * 3;
    const ux = (pos[b] ?? 0) - (pos[a] ?? 0),
      uy = (pos[b + 1] ?? 0) - (pos[a + 1] ?? 0),
      uz = (pos[b + 2] ?? 0) - (pos[a + 2] ?? 0);
    const vx = (pos[c] ?? 0) - (pos[a] ?? 0),
      vy = (pos[c + 1] ?? 0) - (pos[a + 1] ?? 0),
      vz = (pos[c + 2] ?? 0) - (pos[a + 2] ?? 0);
    score +=
      (uy * vz - uz * vy) *
        (((pos[a] ?? 0) + (pos[b] ?? 0) + (pos[c] ?? 0)) / 3 - cx) +
      (uz * vx - ux * vz) *
        (((pos[a + 1] ?? 0) + (pos[b + 1] ?? 0) + (pos[c + 1] ?? 0)) / 3 - cy) +
      (ux * vy - uy * vx) *
        (((pos[a + 2] ?? 0) + (pos[b + 2] ?? 0) + (pos[c + 2] ?? 0)) / 3 - cz);
  }
  return score;
}

export function createForestTrees(scene: Scene) {
  const material = new StandardMaterial("forest-tree-material", scene);
  material.diffuseColor = Color3.White();
  material.specularColor = Color3.Black();
  const meshes = new Map<string, Mesh>();
  const buffers = new Map<string, Float32Array>();
  let disposed = false;
  const keys = new Map<string, string>();
  let state: TimberState | null = null;
  // 상태가 매 틱 바뀌어도 숲 모양은 둥지·벌목장 변화 때만 바뀐다. 그때만 행렬을 다시 계산한다.
  let lastInput = "";
  const inputKey = (s: TimberState | null) =>
    s
      ? JSON.stringify([
          s.homes.map((h) => [h.position.x, h.position.z, h.headingRadians]),
          productionSites(s).map((l) => [
            l.siteId,
            l.remaining,
            l.built,
            l.storageBuilt,
          ]),
        ])
      : "none";

  // 박찬님 원본의 미리보기 숲 대신 실제 복홀 숲을 공유 thin instance로 그린다.
  // 로딩 실패 때는 기존 상자·원뿔 형태로 대체하며, 장식은 숲 안쪽에 고정한다.
  function fallback(kind: string) {
    const stump = kind === "TREE_STUMP";
    const trunk = CreateBox(
      "tree-fallback-trunk",
      { width: 0.35, height: stump ? 0.35 : 1.4, depth: 0.35 },
      scene,
    );
    trunk.position.y = stump ? 0.175 : 0.7;
    const pieces = [trunk];
    if (!stump) {
      const crown = CreateCylinder(
        "tree-fallback-crown",
        { height: 3, diameterBottom: 2, diameterTop: 0, tessellation: 6 },
        scene,
      );
      crown.position.y = 2.5;
      pieces.push(crown);
    }
    for (const [i, piece] of pieces.entries()) {
      const colors = new Float32Array(piece.getTotalVertices() * 4);
      for (let n = 0; n < colors.length; n += 4)
        colors.set(i ? [0.12, 0.32, 0.18, 1] : [0.43, 0.27, 0.12, 1], n);
      piece.setVerticesData("color", colors);
      piece.computeWorldMatrix(true);
    }
    return Mesh.MergeMeshes(pieces, true, true) as Mesh;
  }
  function install(kind: string, mesh: Mesh) {
    const old = meshes.get(kind);
    mesh.name = `forest-tree:${kind}`;
    mesh.material = material;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    meshes.set(kind, mesh);
    old?.dispose();
    keys.delete(kind);
    update(state, true);
  }
  function update(s: TimberState | null, force = false) {
    state = s;
    const input = inputKey(s);
    if (!force && input === lastInput) return;
    lastInput = input;
    const height = terrainElevation(s);
    const groups = new Map(kinds.map((kind) => [kind, [] as number[]]));
    if (s)
      for (const patch of BOKHOL_FORESTS) {
        const { standing: count } = forestCounts(
          loggingSite(s, patch.id).remaining,
        );
        const options = forestIsFar(patch.x, patch.z) ? far : standing;
        const add = (
          kind: string,
          x: number,
          z: number,
          scale: number,
          angle: number,
        ) => {
          const m = Matrix.Compose(
            new Vector3(scale, scale, scale),
            Quaternion.RotationYawPitchRoll(angle, 0, 0),
            new Vector3(x, height(x, z), z),
          );
          groups.get(kind)?.push(...m.asArray());
        };
        for (let i = 0; i < LOGGING_RULES.treesPerForest; i++) {
          const x =
            patch.x - 7 + (i % 8) * 2 + Math.sin(i * 13 + patch.x) * 0.8;
          const z =
            patch.z -
            9 +
            Math.floor(i / 8) * 6 +
            Math.cos(i * 7 + patch.z) * 1.1;
          const kind =
            i < count
              ? (options[(i * 7 + Math.abs(patch.x)) % options.length] ??
                "TREE_FIR")
              : "TREE_STUMP";
          add(
            kind,
            x,
            z,
            0.8 + (1 + Math.sin(i * 4.9 + patch.z)) * 0.24,
            i * 1.61,
          );
        }
        for (const [i, d] of forestDecorations().entries())
          add(d.kind, patch.x + d.x, patch.z + d.z, 0.8, i * 1.61);
      }
    for (const [kind, values] of groups) {
      const key = JSON.stringify(values);
      if (keys.get(kind) === key) continue;
      keys.set(kind, key);
      const mesh = meshes.get(kind);
      if (!mesh) continue;
      let buffer = buffers.get(kind);
      if (!buffer || buffer.length < Math.max(16, values.length)) {
        buffer = new Float32Array(Math.max(16, values.length));
        buffers.set(kind, buffer);
        mesh.thinInstanceSetBuffer("matrix", buffer, 16, false);
      }
      buffer.set(values);
      mesh.thinInstanceCount = values.length / 16;
      mesh.thinInstanceBufferUpdated("matrix");
      mesh.setEnabled(values.length > 0);
    }
  }
  for (const kind of kinds) install(kind, fallback(kind));
  void Promise.all(
    kinds.map(async (kind) => {
      try {
        const asset = await loadSceneAsset(scene, `/models/trees/${kind}.glb`);
        if (disposed || scene.isDisposed) return;
        const inst = asset.instantiateModelsToScene(
          (n) => `${kind}-src:${n}`,
          false,
        );
        try {
          const parts: Mesh[] = [];
          for (const root of inst.rootNodes) {
            root.computeWorldMatrix(true);
            for (const m of root.getChildMeshes(false))
              if (m instanceof Mesh && m.getTotalVertices() > 0) parts.push(m);
          }
          for (const m of parts) {
            m.computeWorldMatrix(true);
            // glTF 색(재질 색·정점색)은 선형 값이다. 공용 StandardMaterial은 정점색을 화면 색(감마)으로 쓰므로
            // 그대로 넣으면 박찬님의 짙은 녹색 잎(선형 0.045)이 거의 검게 나온다 → 감마로 바꿔 넣는다.
            const source = m.getVerticesData("color");
            const c =
              (m.material as { albedoColor?: Color3 } | null)?.albedoColor ??
              Color3.White();
            const colors = new Float32Array(m.getTotalVertices() * 4);
            for (let i = 0; i < colors.length; i += 4) {
              const linear = source
                ? new Color3(
                    source[i] ?? 1,
                    source[i + 1] ?? 1,
                    source[i + 2] ?? 1,
                  )
                : c;
              const g = linear.toGammaSpace();
              colors.set([g.r, g.g, g.b, 1], i);
            }
            m.setVerticesData("color", colors);
          }
          const merged = Mesh.MergeMeshes(parts, true, true);
          if (!merged) throw new Error("빈 모델");
          const vd = VertexData.ExtractFromMesh(merged);
          const positions = Array.from(vd.positions ?? []),
            indices = Array.from(vd.indices ?? []),
            geometric: number[] = [];
          VertexData.ComputeNormals(positions, indices, geometric);
          const normals = vd.normals;
          if (normals && normals.length === positions.length) {
            let agreement = 0;
            for (let i = 0; i < normals.length; i++)
              agreement += (normals[i] ?? 0) * (geometric[i] ?? 0);
            if (agreement < 0)
              for (let i = 0; i < indices.length; i += 3)
                [indices[i + 1], indices[i + 2]] = [
                  indices[i + 2] ?? 0,
                  indices[i + 1] ?? 0,
                ];
          } else {
            const old = meshes.get(kind);
            const oldPos = old?.getVerticesData("position"),
              oldIndices = old?.getIndices();
            if (
              oldPos &&
              oldIndices &&
              Math.sign(windingScore(oldPos, oldIndices)) !==
                Math.sign(windingScore(positions, indices))
            ) {
              for (let i = 0; i < indices.length; i += 3)
                [indices[i + 1], indices[i + 2]] = [
                  indices[i + 2] ?? 0,
                  indices[i + 1] ?? 0,
                ];
              VertexData.ComputeNormals(positions, indices, geometric);
            }
            vd.normals = geometric;
          }
          vd.indices = indices;
          vd.applyToMesh(merged);
          buffers.delete(kind);
          install(kind, merged);
        } finally {
          inst.dispose();
        }
      } catch (error) {
        console.warn(`숲 모델 ${kind} 로딩 실패: 대체 나무 사용`, error);
      }
    }),
  );
  return {
    update: (s: TimberState | null) => update(s),
    dispose() {
      disposed = true;
      for (const mesh of meshes.values()) mesh.dispose();
      material.dispose();
    },
  };
}
