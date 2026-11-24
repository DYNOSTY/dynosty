// 자원 터 모델을 복홀 지도에 세움 (자리와 숨김 조건은 resource-site-layout.ts)
// 모델은 부품으로 깎고 재질을 그림 한 장으로 구운 입체 (tools/blender/site3d.py): <이름>.glb + <이름>.jpg
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { TimberState } from "@dynosty/game-core";
import {
  RESOURCE_SITE_HEADING,
  RESOURCE_SITE_SCALE,
  RESOURCE_SITES,
  type ResourceSite,
  resourceSiteGround,
  resourceSiteVisible,
} from "./resource-site-layout.js";
import { loadSceneAsset } from "./scene-assets.js";

type Elevation = (x: number, z: number) => number;
type Loaded = {
  site: ResourceSite;
  node: TransformNode;
  material: StandardMaterial;
  /** 지형을 따르기 전 꼭짓점 (다시 따를 때 원본에서 계산) */
  meshes: { mesh: Mesh; base: Float32Array }[];
};

/** 광맥 자리 표시용 임시 바위를 모델로 대신한 광맥 id (logging-scene이 바위를 숨김) */
const carved = new WeakMap<Scene, Set<string>>();
export const depositCarved = (scene: Scene, anchor: string) =>
  carved.get(scene)?.has(anchor) ?? false;

export function createResourceSites(
  scene: Scene,
  root: TransformNode | null,
  onFail: () => void,
) {
  const loaded: Loaded[] = [];
  let state: TimberState | null = null;
  let elevation: Elevation = () => 0;
  let disposed = false;
  const p = new Vector3();

  // 눈밭이 비탈에 묻히거나 뜨지 않게, 꼭짓점마다 그 자리 땅 높이를 따라가게 함
  const follow = ({ site, node, meshes }: Loaded) => {
    const ground = resourceSiteGround(site, elevation);
    const base = ground(site.x, site.z);
    node.position.set(site.x, base, site.z);
    node.computeWorldMatrix(true);
    for (const { mesh, base: local } of meshes) {
      const at = Float32Array.from(local);
      const toWorld = mesh.computeWorldMatrix(true);
      for (let i = 0; i < at.length; i += 3) {
        Vector3.TransformCoordinatesFromFloatsToRef(
          at[i] ?? 0,
          at[i + 1] ?? 0,
          at[i + 2] ?? 0,
          toWorld,
          p,
        );
        at[i + 1] =
          (at[i + 1] ?? 0) + (ground(p.x, p.z) - base) / RESOURCE_SITE_SCALE;
      }
      mesh.updateVerticesData(VertexBuffer.PositionKind, at);
      mesh.refreshBoundingInfo({});
    }
  };
  const show = ({ site, node }: Loaded) =>
    node.setEnabled(resourceSiteVisible(site, state));
  const hideDeposit = (site: ResourceSite) => {
    if (!site.replacesDeposit) return;
    let set = carved.get(scene);
    if (!set) {
      set = new Set();
      carved.set(scene, set);
    }
    set.add(site.anchor);
    const rock = `deposit-rock:${site.anchor}`;
    for (const mesh of scene.meshes)
      if (mesh.name === rock) mesh.setEnabled(false);
  };

  for (const site of RESOURCE_SITES)
    void loadSceneAsset(scene, `/models/sites/${site.file}.glb`)
      .then((asset) => {
        if (disposed) return;
        const node = new TransformNode(`resource-site:${site.id}`, scene);
        node.parent = root;
        node.rotation.y = RESOURCE_SITE_HEADING; // 모델의 앞(트인 쪽)이 기본 시점의 카메라를 봄
        node.scaling.setAll(RESOURCE_SITE_SCALE);
        node.position.set(site.x, 0, site.z);
        node.setEnabled(false);
        const inst = asset.instantiateModelsToScene(
          (n) => `resource-site:${site.id}:${n}`,
          false,
          { doNotInstantiate: true },
        );
        for (const top of inst.rootNodes) top.parent = node;
        // 그림은 GLB에 넣지 않고 따로 읽음 — GLB 속 그림은 밝기 표현이 달라(sRGB 버퍼) 이 재질에서 어둡게 나옴
        const material = new StandardMaterial(
          `resource-site:${site.id}`,
          scene,
        );
        const picture = new Texture(
          `/models/sites/${site.file}.jpg`,
          scene,
          false,
          false, // glTF의 그림 좌표는 위아래가 뒤집혀 있지 않음
        );
        picture.anisotropicFilteringLevel = 8;
        material.diffuseTexture = picture;
        material.specularColor = Color3.Black();
        material.backFaceCulling = false; // 풀잎·짚 술은 한 겹짜리 면
        const meshes: Loaded["meshes"] = [];
        for (const mesh of node.getChildMeshes(false)) {
          mesh.isPickable = false;
          mesh.material = material;
          if (!(mesh instanceof Mesh)) continue;
          // 같은 GLB를 다시 세워도 꼭짓점을 따로 고치도록 형상을 떼어 냄
          mesh.makeGeometryUnique();
          const at = mesh.getVerticesData(VertexBuffer.PositionKind);
          if (!at) continue;
          mesh.setVerticesData(VertexBuffer.PositionKind, at, true);
          meshes.push({ mesh, base: Float32Array.from(at) });
        }
        const entry = { site, node, material, meshes };
        loaded.push(entry);
        follow(entry);
        show(entry);
        hideDeposit(site);
      })
      .catch(() => {
        if (!disposed) onFail();
      });

  return {
    /** 마을 상태가 바뀔 때. 지형이 바뀐 경우에만 꼭짓점을 다시 따른다. */
    update(
      next: TimberState | null,
      ground: Elevation,
      terrainChanged: boolean,
    ) {
      state = next;
      elevation = ground;
      for (const entry of loaded) {
        if (terrainChanged) follow(entry);
        show(entry);
      }
    },
    dispose() {
      disposed = true;
      carved.delete(scene);
      for (const { node, material } of loaded) {
        node.dispose(false, true);
        material.dispose(true, true);
      }
      loaded.length = 0;
    },
  };
}
