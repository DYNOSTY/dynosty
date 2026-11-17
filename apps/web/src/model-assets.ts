import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { isRecord } from "@dynosty/game-core";
export interface ModelPart {
  name: string;
  shape: "box" | "sphere" | "cylinder";
  size: [number, number, number];
  position: [number, number, number];
  rotation: [number, number, number];
  color?: [number, number, number];
  role?: string;
  phase?: number;
  tessellation?: number;
}
export interface ModelAsset {
  format: "dynosty-model";
  version: 1;
  id: string;
  kind: "resident" | "building";
  name: string;
  units: "meter";
  origin: string;
  parts: ModelPart[];
}
export type ModelAssets = Partial<Record<ModelAsset["kind"], ModelAsset>>;
export function parseModel(
  value: unknown,
  kind: ModelAsset["kind"],
): ModelAsset {
  const bad = () => {
    throw new Error("모델 파일의 형식이나 좌표가 올바르지 않습니다.");
  };
  if (
    !isRecord(value) ||
    value.format !== "dynosty-model" ||
    value.version !== 1 ||
    value.kind !== kind ||
    value.units !== "meter" ||
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.name !== "string" ||
    !value.name ||
    typeof value.origin !== "string" ||
    !Array.isArray(value.parts) ||
    value.parts.length < 1 ||
    value.parts.length > 100
  )
    return bad();
  const ids = new Set<string>();
  const vector = (v: unknown, min: number, max: number) =>
    Array.isArray(v) &&
    v.length === 3 &&
    v.every(
      (n) =>
        typeof n === "number" && Number.isFinite(n) && n >= min && n <= max,
    );
  for (const p of value.parts) {
    if (
      !isRecord(p) ||
      typeof p.name !== "string" ||
      !p.name ||
      ids.has(p.name) ||
      !["box", "sphere", "cylinder"].includes(p.shape as string) ||
      !vector(p.size, 0, 10) ||
      !vector(p.position, -20, 20) ||
      !vector(p.rotation, -Math.PI * 2, Math.PI * 2)
    )
      return bad();
    ids.add(p.name);
    const size = p.size as number[];
    if (
      p.shape === "cylinder"
        ? (size[0] ?? 0) <= 0 || (size[1] ?? 0) <= 0
        : size.some((n) => n <= 0)
    )
      return bad();
    if (p.color !== undefined && !vector(p.color, 0, 1)) return bad();
    if (
      p.role !== undefined &&
      !["leg", "body", "head", "tail"].includes(p.role as string)
    )
      return bad();
    if (
      p.phase !== undefined &&
      (typeof p.phase !== "number" ||
        !Number.isFinite(p.phase) ||
        Math.abs(p.phase) > 10)
    )
      return bad();
    if (
      p.tessellation !== undefined &&
      (typeof p.tessellation !== "number" ||
        !Number.isSafeInteger(p.tessellation) ||
        p.tessellation < 3 ||
        p.tessellation > 32)
    )
      return bad();
  }
  if (
    kind === "resident" &&
    ![2, 4].includes(
      value.parts.filter((p) => isRecord(p) && p.role === "leg").length,
    )
  )
    return bad();
  return JSON.parse(JSON.stringify(value)) as ModelAsset;
}
export async function loadModelAssets(
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<{ assets: ModelAssets; failed: string[] }> {
  const result: { assets: ModelAssets; failed: string[] } = {
    assets: {},
    failed: [],
  };
  await Promise.all(
    (
      [
        ["resident", "triceratops.json"],
        ["building", "ondol-nest.json"],
      ] as const
    ).map(async ([kind, file]) => {
      try {
        const response = await fetcher(
          `${import.meta.env.BASE_URL}models/${file}`,
          { signal },
        );
        if (!response.ok) throw new Error("모델 응답 실패");
        result.assets[kind] = parseModel(await response.json(), kind);
      } catch (error) {
        if (signal.aborted) throw error;
        result.failed.push(kind);
      }
    }),
  );
  return result;
}
export function buildModel(
  scene: Scene,
  root: Mesh,
  material: StandardMaterial,
  asset: ModelAsset,
) {
  const meshes: Mesh[] = [];
  const materials: StandardMaterial[] = [];
  const rig: Array<{ mesh: Mesh; part: ModelPart }> = [];
  let time = 0;
  let motion = "idle";
  try {
    for (const p of asset.parts) {
      const id = `${root.id}:${p.name}`;
      const mesh =
        p.shape === "box"
          ? CreateBox(
              id,
              { width: p.size[0], height: p.size[1], depth: p.size[2] },
              scene,
            )
          : p.shape === "sphere"
            ? CreateSphere(
                id,
                {
                  diameterX: p.size[0],
                  diameterY: p.size[1],
                  diameterZ: p.size[2],
                  segments: 8,
                },
                scene,
              )
            : CreateCylinder(
                id,
                {
                  diameterBottom: p.size[0],
                  height: p.size[1],
                  diameterTop: p.size[2],
                  tessellation: p.tessellation ?? 8,
                },
                scene,
              );
      meshes.push(mesh);
      mesh.parent = root;
      mesh.position.set(...p.position);
      mesh.rotation.set(...p.rotation);
      if (p.color) {
        const m = new StandardMaterial(`${id}:material`, scene);
        m.diffuseColor = new Color3(...p.color);
        materials.push(m);
        mesh.material = m;
      } else mesh.material = material;
      mesh.outlineColor = new Color3(0.3, 0.9, 1);
      mesh.outlineWidth = 0.06;
      mesh.renderOutline = false;
      rig.push({ mesh, part: p });
    }
  } catch (error) {
    for (const m of meshes) m.dispose();
    for (const m of materials) m.dispose();
    throw error;
  }
  return {
    meshes,
    setOutline(value: boolean) {
      for (const mesh of meshes) mesh.renderOutline = value;
    },
    setMotion(value: string) {
      if (motion !== value) {
        motion = value;
        time = 0;
      }
    },
    animate(delta: number) {
      time += Math.min(Math.max(delta, 0), 0.1);
      for (const { mesh, part: p } of rig) {
        mesh.position.set(...p.position);
        mesh.rotation.set(...p.rotation);
        mesh.scaling.setAll(1);
        if (asset.kind !== "resident") continue;
        if (p.role === "leg" && motion === "walking")
          mesh.rotation.x += Math.sin(time * 8 + (p.phase ?? 0)) * 0.45;
        if (p.role === "body") {
          if (motion === "walking")
            mesh.position.y += Math.sin(time * 16) * 0.02;
          else mesh.scaling.y = 1 + Math.sin(time * 2) * 0.018;
        }
        if (p.role === "tail")
          mesh.rotation.y +=
            Math.sin(time * (motion === "walking" ? 4 : 1)) * 0.08;
      }
    },
    dispose() {
      for (const mesh of meshes) mesh.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
export type ModelVisual = ReturnType<typeof buildModel>;
