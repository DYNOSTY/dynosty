// 온돌 옆 연료 더미: 목재·석탄 재고만큼 쌓이고, 쓰면 맨 위부터 줄어듦 (프로스트펑크처럼 재고가 눈에 보이게)
// 부품은 블렌더로 깎음 — tools/blender/fuel.py (장작 한 토막 · 석탄 덩어리 3종)
// 한 종류당 thin instance 한 덩어리, 보이는 개수는 thinInstanceCount로만 바꿈 → 재고가 바뀌어도 그리기 부담 그대로
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { createMaterialLibrary } from "./materials.js";
import { loadSceneAsset } from "./scene-assets.js";
import { elevation, rng } from "./world.js";

/** 장작 더미 · 석탄 더미 자리 (온돌 앞 큰길 양옆) */
export const WOOD_AT = { x: 3.9, z: -4.6 };
const COAL_AT = { x: -3.9, z: -4.6 };
const LOG_ROWS = 6;
const LOGS_PER_ROW = 6;
/** 목재 몇 개당 장작 한 토막 */
const WOOD_PER_LOG = 4;
const COAL_CHUNKS = 60;
/** 석탄 1개당 덩이 수 */
const CHUNKS_PER_COAL = 1.5;

export function createFuelYard(scene: Scene, worldRoot?: TransformNode) {
  const lib = createMaterialLibrary(scene);
  const meshes: Mesh[] = [];
  let logs: Mesh | null = null;
  const coal: Mesh[] = [];
  let pending: { coal: number; wood: number } | null = null;
  let disposed = false;

  // GLB 조각의 모양·재질만 가져와 새 덩어리로 (glTF 뿌리의 좌우 뒤집기 없이 우리 좌표로 놓기)
  const part = async (file: string) => {
    const asset = await loadSceneAsset(scene, `/models/props/${file}.glb`);
    const src = asset.meshes.find((m) => m.getTotalVertices() > 0);
    if (!src || !(src instanceof Mesh) || !src.geometry) return null;
    const m = new Mesh(`fuel-${file}`, scene);
    src.geometry.applyToMesh(m);
    m.material = src.material;
    lib.dress(m.material); // 나무껍질은 공용 재질 + 위쪽 눈
    m.parent = worldRoot ?? null;
    m.isPickable = false;
    m.alwaysSelectAsActiveMesh = true;
    meshes.push(m);
    return m;
  };

  const ready = (async () => {
    const r = rng(404);
    logs = await part("FUEL_LOG");
    if (logs) {
      // 아래 줄부터 엇갈려 쌓기 (장작 길이 방향 = z)
      const yaw = Quaternion.RotationYawPitchRoll(0, 0, 0);
      for (let row = 0; row < LOG_ROWS; row++) {
        const n = LOGS_PER_ROW - (row % 2);
        for (let i = 0; i < n; i++) {
          const x = WOOD_AT.x + (i - (n - 1) / 2) * 0.23 + (r() - 0.5) * 0.02;
          const z = WOOD_AT.z + (r() - 0.5) * 0.08;
          const y = elevation(WOOD_AT.x, WOOD_AT.z) + 0.11 + row * 0.2;
          const roll = Quaternion.RotationYawPitchRoll(
            (r() - 0.5) * 0.06,
            0,
            r() * Math.PI * 2,
          );
          logs.thinInstanceAdd(
            Matrix.Compose(
              new Vector3(1, 1, 1),
              yaw.multiply(roll),
              new Vector3(x, y, z),
            ),
            false,
          );
        }
      }
      logs.thinInstanceBufferUpdated("matrix");
    }
    // 석탄: 아래에서 위로 쌓이는 원뿔 (나선형으로 놓아 맨 위부터 줄어듦)
    const chunks = await Promise.all(
      [0, 1, 2].map((k) => part(`FUEL_COAL_${k}`)),
    );
    const base = elevation(COAL_AT.x, COAL_AT.z);
    for (let k = 0; k < COAL_CHUNKS; k++) {
      const t = k / COAL_CHUNKS;
      const radius = 0.7 * (1 - t) ** 0.85;
      const a = k * 2.39996 + r() * 0.4;
      const m = chunks[k % 3];
      if (!m) continue;
      m.thinInstanceAdd(
        Matrix.Compose(
          new Vector3(1, 1, 1).scale(0.9 + r() * 0.5),
          Quaternion.RotationYawPitchRoll(r() * 6.28, r() * 6.28, r() * 6.28),
          new Vector3(
            COAL_AT.x + Math.cos(a) * radius,
            base + 0.05 + t * 0.95,
            COAL_AT.z + Math.sin(a) * radius,
          ),
        ),
        false,
      );
    }
    for (const m of chunks)
      if (m) {
        m.thinInstanceBufferUpdated("matrix");
        coal.push(m);
      }
    // 불러오는 사이에 들어온 재고 반영 (TS는 비동기 안에서 바뀐 값을 못 따라가 형 지정)
    const waiting = pending as { coal: number; wood: number } | null;
    if (disposed) dispose();
    else if (waiting) setStock(waiting.coal, waiting.wood);
  })();

  function setStock(coalAmount: number, woodAmount: number) {
    pending = { coal: coalAmount, wood: woodAmount };
    if (!logs || coal.length !== 3) return;
    const maxLogs = LOG_ROWS * LOGS_PER_ROW - Math.floor(LOG_ROWS / 2);
    logs.thinInstanceCount = Math.min(
      maxLogs,
      Math.ceil(Math.max(0, woodAmount) / WOOD_PER_LOG),
    );
    const visible = Math.min(
      COAL_CHUNKS,
      Math.round(Math.max(0, coalAmount) * CHUNKS_PER_COAL),
    );
    // 덩이 k는 k%3번 모양에 들어 있음 → 모양마다 앞에서부터 셈
    coal.forEach((m, j) => {
      m.thinInstanceCount = Math.max(0, Math.ceil((visible - j) / 3));
    });
  }
  function dispose() {
    disposed = true;
    for (const m of meshes) m.dispose();
  }
  return { ready, setStock, dispose };
}
