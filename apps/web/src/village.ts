// M2 마을: 건물 도감 GLB 12종 + 주민 v04 GLB 10종을 섬에 배치
import "@babylonjs/loaders/glTF";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import {
  type Matrix,
  Quaternion,
  Vector3,
} from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Node } from "@babylonjs/core/node";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { Scene } from "@babylonjs/core/scene";
import {
  createMaterialLibrary,
  isGlowMaterial,
  snowOnResident,
} from "./materials.js";
import { loadSceneAsset as load } from "./scene-assets.js";
import { elevation, rng } from "./world.js";

// ponytail: 표시 축척은 개발 시안 값. 기획서는 1단위=1m만 정함 → 개발팀과 확정 필요
export const BUILDING_SCALE = 0.75; // 둥지 지붕 1.85m = 목재 체험 보수 표시 높이
export const RESIDENT_SCALE = 0.5;
const OUTLINE = new Color3(0.3, 0.9, 1); // 현장과 대표 모델의 공통 선택색

// [건물, x, z] — 입구(+Z)가 마당을 향함. 가운데 반경 9m는 체험 소품 자리로 비워 둠
// 블렌더로 컨셉 시트처럼 깎은 판(2026-11-18) — 있으면 이걸 씀 (원본 GLB는 그대로 둠)
const CARVED: Record<string, string> = Object.fromEntries(
  [
    "BLD_NEST",
    "BLD_OFFICE",
    "BLD_ONDOL",
    "BLD_WATER",
    "BLD_FORAGE",
    "BLD_SALVAGE",
    "BLD_GREENHOUSE",
    "BLD_FISHERY",
    "BLD_WAREHOUSE",
    "BLD_WORKSHOP",
    "BLD_WATCH",
    "BLD_GATE",
    "BLD_CLINIC",
  ].map((id) => [id, `${id}_v2`]),
);
export const glbFile = (id: string) =>
  `/models/buildings/${CARVED[id] ?? id}.glb`;
export { LAYOUT } from "./layout.js";

import { LAYOUT } from "./layout.js";

// 공룡마다 원래 몸집 차이는 살리되, 가장 큰 브라키오사우루스도 둥지 문(약 1.38m) 안으로 들어가게
// [게임 안 키(m), 모델 키] — 모델은 종과 상관없이 비슷한 크기로 만들어져 있어 종별로 따로 줄임
const RESIDENT_HEIGHT: Record<string, [number, number]> = {
  R08_Brachiosaurus: [1.3, 3.63],
  R07_Parasaurolophus: [1.15, 3.38],
  R10_Iguanodon: [1.12, 3.27],
  R05_Gallimimus: [1.0, 3.4],
  R02_Triceratops: [0.95, 2.77],
  R01_Pachycephalosaurus: [0.95, 3.52],
  R03_Velociraptor: [0.8, 3.36],
  R09_Oviraptor: [0.78, 3.49],
  R04_Ankylosaurus: [0.75, 2.45],
  R12_Protoceratops: [0.6, 2.28],
};
/** 겨울 차림(컨셉 시트 재질 누빔·비늘, 털 테두리·목도리·짚 장화·등불·등짐) — tools/blender/tex.py → dino2.py */
export const residentGlb = (file: string) => `/models/residents/${file}_v2.glb`;
export const residentScale = (file: string) => {
  const h = RESIDENT_HEIGHT[file];
  return h ? h[0] / h[1] : RESIDENT_SCALE;
};
const RESIDENTS = [
  "R01_Pachycephalosaurus",
  "R02_Triceratops",
  "R03_Velociraptor",
  "R04_Ankylosaurus",
  "R05_Gallimimus",
  "R07_Parasaurolophus",
  "R08_Brachiosaurus",
  "R09_Oviraptor",
  "R10_Iguanodon",
  "R12_Protoceratops",
];

export interface GlbVisual {
  setOutline(value: boolean): void;
  setMotion(value: string): void;
  animate(delta: number): void;
  dispose(): void;
}

export type Shadow = (
  at: TransformNode,
  radius: number,
  depth?: number,
) => InstancedMesh | null;
export function instantiate(
  container: AssetContainer,
  parent: TransformNode,
  scale: number,
  shadow: Shadow,
  radius: number,
  depth?: number,
) {
  const inst = container.instantiateModelsToScene(
    (n) => `${parent.name}:${n}`,
    false,
  );
  for (const root of inst.rootNodes) root.parent = parent;
  parent.scaling.setAll(scale);
  const meshes = parent.getChildMeshes(false) as AbstractMesh[];
  for (const m of meshes) {
    m.isPickable = true;
    // 화면에서 몇 픽셀도 안 되는 조각(발톱·눈 등)은 멀리서 그리지 않음 — 그리기 호출 약 1/4 감소
    if (m instanceof Mesh && m.getTotalVertices() > 0) {
      m.useLODScreenCoverage = true;
      m.addLODLevel(0.00012, null);
    }
  }
  const blob = shadow(parent, radius, depth);
  const groups = inst.animationGroups;
  if (inst.skeletons.length) for (const m of meshes) snowOnResident(m.material);
  for (const g of groups) g.stop();
  let playing: AnimationGroup | undefined;
  const play = (clip: string, offset = 0) => {
    const g = groups.find((x) => x.name.endsWith(clip));
    if (!g || g === playing) return;
    playing?.stop();
    playing = g;
    g.start(true, 1);
    if (offset) g.goToFrame(g.from + (g.to - g.from) * offset);
  };
  return {
    meshes,
    play,
    dispose() {
      blob?.dispose();
      inst.dispose();
    },
  };
}

// 문 불빛 (모델 단위: 문 높이 y, 앞면 z)
const DOOR: Record<string, [number, number]> = {
  BLD_NEST: [1.0, 2.95],
  BLD_OFFICE: [1.2, 2.75],
  BLD_CLINIC: [1.1, 2.4],
  BLD_WORKSHOP: [1.2, 2.5],
  BLD_WAREHOUSE: [1.5, 2.65],
};
type Light = {
  glow: { addIncludedOnlyMesh(m: Mesh): void };
  warmMat: StandardMaterial;
};
export function createVillage(
  scene: Scene,
  shadow: Shadow,
  light?: Light,
  worldRoot?: TransformNode,
) {
  let disposed = false;
  let scoutGeneration = 0;
  const landmarkVisuals = new Map<
    string,
    { node: TransformNode; dispose: () => void }
  >();
  const r = rng(11);
  const nodes: TransformNode[] = [];
  const disposers: Array<() => void> = [];
  // ── 주민 움직임: 마당을 걷는 주민 · 자원 나르는 일꾼 ──
  type Hauler = {
    work: Vector3;
    store: Vector3;
    /** 등에 늘 지는 지게 (일꾼 노드에 붙임) */
    rig: TransformNode;
    /** 지게 위 짐 — 창고로 갈 때만 켬 */
    prop: { setEnabled(on: boolean): void };
    state: "work" | "toStore" | "drop" | "toWork";
    timer: number;
  };
  type Walker = {
    node: TransformNode;
    play: (clip: string, offset?: number) => void;
    target: Vector3 | null;
    wait: number;
    haul?: Hauler;
  };
  const walkers: Walker[] = [];
  const plinthMat = new StandardMaterial("plinth-snow", scene);
  // 땅(StandardMaterial)과 같은 빛 계산이라야 눈밭에 묻힘 — PBR 그대로면 색을 낮춰도 하얗게 뜸
  plinthMat.diffuseColor = new Color3(0.82, 0.82, 0.88);
  plinthMat.specularColor = Color3.Black();
  // 공용 재질 세트: GLB 재질 이름으로 그을린 기와·나무·초가 등을 입힘 (materials.ts)
  const lib = createMaterialLibrary(scene);
  const templates = new Map<
    string,
    { meshes: Mesh[]; local: Map<Mesh, Matrix>; smoke: Vector3 | null }
  >();
  // 누를 수 있는 마을 건물: 건물 뿌리 노드 → LAYOUT 번호
  const buildingNodes = new Map<Node, number>();
  const register = (node: TransformNode, x: number, z: number) => {
    const i = LAYOUT.findIndex(([, lx, lz]) => lx === x && lz === z);
    if (i >= 0) buildingNodes.set(node, i);
  };
  // 고른 건물 발밑 금빛 고리 (윤곽선 대신: 인스턴스에도 되고 싸다)
  const ring = CreateTorus(
    "select-ring",
    { diameter: 1, thickness: 0.05, tessellation: 64 },
    scene,
  );
  const ringMat = new StandardMaterial("select-ring-mat", scene);
  ringMat.disableLighting = true;
  // 순금빛 · 색 보정·안개를 받지 않아 어디서나 같은 색 (선택 확인 테스트도 이 색을 셈)
  ringMat.emissiveColor = new Color3(1, 0.85, 0.05);
  ringMat.diffuseColor = Color3.Black();
  ringMat.fogEnabled = false;
  ringMat.imageProcessingConfiguration = new ImageProcessingConfiguration();
  ringMat.imageProcessingConfiguration.isEnabled = false;
  ring.material = ringMat;
  ring.isPickable = false;
  ring.setEnabled(false);
  plinthMat.freeze();
  const place = async (
    url: string,
    x: number,
    z: number,
    yaw: number,
    scale: number,
    clip?: string,
    radius = 4.4,
    depth = 3.8,
    role?: "walk" | Omit<Hauler, "state" | "timer">,
  ) => {
    const asset = await load(scene, url);
    if (disposed) return;
    const node = new TransformNode(url.split("/").pop() ?? "glb", scene);
    node.parent = worldRoot ?? null;
    node.position.set(x, elevation(x, z), z);
    node.rotation.y = yaw;
    nodes.push(node);
    // 같은 건물 두 채째부터(둥지 8채 등): 첫 채의 조각을 인스턴스로 → 그리기 호출을 한 번에 같이
    const tpl = role ? undefined : templates.get(url);
    if (tpl) {
      node.scaling.setAll(scale);
      node.computeWorldMatrix(true);
      for (const src of tpl.meshes) {
        const inst = src.createInstance(`${node.name}:${src.name}`);
        inst.parent = node;
        inst.rotationQuaternion = new Quaternion();
        tpl.local
          .get(src)
          ?.decompose(inst.scaling, inst.rotationQuaternion, inst.position);
        inst.isPickable = true;
        inst.computeWorldMatrix(true);
        inst.freezeWorldMatrix();
      }
      shadow(node, radius, depth);
      if (tpl.smoke)
        addSmoke(
          Vector3.TransformCoordinates(tpl.smoke, node.getWorldMatrix()),
        );
      register(node, x, z);
      return;
    }
    const v = instantiate(asset, node, scale, shadow, radius, depth);
    if (!role) register(node, x, z);
    for (const m of v.meshes) {
      m.isPickable = !role;
      if (!role) lib.dress(m.material);
      // 불 켜진 창(window·amber·ember)은 재질 자체로 주황 — 글로우는 가림을 모르고 지붕을 뚫고 번져서 넣지 않음
      // 건물 밑 눈 깔개·납작한 돌판이 눈밭 위 흰 네모로 튀어 보임 → 땅과 같은 눈 재질로
      const name = m.material?.name;
      const bb = m.getBoundingInfo().boundingBox;
      // 아주 납작한 돌판만 땅 눈으로 (둥지 돌담 기단은 돌 그대로)
      const flat = bb.maximum.y - bb.minimum.y < 0.3;
      if (!role && (name === "snow" || (name === "stone" && flat)))
        m.material = plinthMat;
      // 건물은 그을린 듯 어둡게 — 밝은 하늘 반사를 줄여 불 켜진 창만 눈에 띄게 (프로스트펑크 톤)
      const pbr = m.material as { environmentIntensity?: number } | null;
      if (!role && pbr && pbr.environmentIntensity !== undefined)
        pbr.environmentIntensity = 0.35;
    }
    if (!role) {
      node.computeWorldMatrix(true);
      // 굴뚝 연기: 모델 안 smoke 노드 자리 → 없으면 예전 높이표
      const bld = url.split("/").pop()?.replace(".glb", "") ?? "";
      const smokeNode = node
        .getDescendants(false)
        .find(
          (n): n is TransformNode =>
            /smoke/i.test(n.name) && n instanceof TransformNode,
        );
      const chimney = CHIMNEY[bld];
      const at = smokeNode
        ? smokeNode.computeWorldMatrix(true).getTranslation()
        : chimney !== undefined
          ? new Vector3(x, chimney + elevation(x, z), z)
          : null;
      if (at) addSmoke(at);
      for (const m of v.meshes) {
        m.computeWorldMatrix(true);
        m.freezeWorldMatrix();
        m.doNotSyncBoundingInfo = true;
        m.material?.freeze();
      }
      // 다음 채가 인스턴스로 쓸 본(本): 조각마다 이 건물 기준 위치
      const inv = node.getWorldMatrix().clone().invert();
      const local = new Map<Mesh, Matrix>();
      const meshes = v.meshes.filter(
        (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
      );
      for (const m of meshes) local.set(m, m.getWorldMatrix().multiply(inv));
      templates.set(url, {
        meshes,
        local,
        smoke: at && smokeNode ? Vector3.TransformCoordinates(at, inv) : null,
      });
    }
    if (clip) v.play(clip, r());
    disposers.push(v.dispose);
    const door = DOOR[url.split("/").pop()?.replace(".glb", "") ?? ""];
    // 창이 스스로 빛나는 건물은 임시 문 불빛 상자를 두지 않음 (바닥에 깔린 주황 판처럼 보임)
    const glowsItself = v.meshes.some((m) => isGlowMaterial(m.material?.name));
    if (door && light && !glowsItself) {
      const lamp = CreateBox(
        `${node.name}-door`,
        { width: 0.8, height: 0.75, depth: 0.04 }, // 문 안쪽 불빛: 처마 밖으로 튀지 않게 작고 안으로
        scene,
      );
      lamp.parent = node;
      lamp.position.set(0, door[0] - 0.1, door[1] - 0.18);
      lamp.material = light.warmMat;
      lamp.isPickable = false; // 문 불빛도 지붕 너머로 번지지 않게 글로우 제외
    }
    if (role === "walk")
      walkers.push({ node, play: v.play, target: null, wait: r() * 2 });
    else if (role) {
      role.rig.parent = node;
      walkers.push({
        node,
        play: v.play,
        target: null,
        wait: 0,
        haul: { ...role, state: "work", timer: 2 + r() * 3 },
      });
    }
  };
  const face = (x: number, z: number) => Math.atan2(-x, -z); // +Z가 마당 쪽
  const jobs: Array<Promise<void>> = LAYOUT.map(([id, x, z]) =>
    place(
      glbFile(id),
      x,
      z,
      id === "BLD_GATE" ? Math.PI : face(x, z),
      BUILDING_SCALE,
    ),
  );

  // 등에 지는 짐 (모델 단위: 주민 0.5배 안에서 등 높이)
  // 지게(블렌더 tools/blender/jige.py): 빈 지게는 늘 등에, 짐(LOAD)은 창고로 갈 때만
  const makeProp = (kind: "plant" | "wood" | "fish") => {
    const rig = new TransformNode(`jige-${kind}`, scene);
    rig.position.set(0, 1.25, -0.34);
    rig.scaling.setAll(1.1);
    let loadNode: TransformNode | null = null;
    let on = false;
    const prop = {
      setEnabled(value: boolean) {
        on = value;
        loadNode?.setEnabled(value);
      },
    };
    void load(scene, `/models/props/JIGE_${kind}.glb`).then((asset) => {
      if (disposed) return;
      const inst = asset.instantiateModelsToScene(
        (n) => `${rig.name}:${n}`,
        false,
      );
      for (const root of inst.rootNodes) root.parent = rig;
      for (const m of rig.getChildMeshes(false)) {
        m.isPickable = false;
        lib.dress(m.material);
      }
      loadNode =
        (rig.getDescendants(false).find((n) => n.name.endsWith("LOAD")) as
          | TransformNode
          | undefined) ?? null;
      loadNode?.setEnabled(on);
      disposers.push(() => inst.dispose());
    });
    return { rig, prop };
  };
  // 일터 앞 자리(건물에서 마당 쪽으로 3.4m)
  const spot = (i: number) => {
    const [, x, z] = LAYOUT[i] ?? ["", 0, 0];
    const d = Math.hypot(x, z);
    return new Vector3(x - (x / d) * 3.4, 0, z - (z / d) * 3.4);
  };
  const store = spot(3); // 갈무리 창고
  const HAULS: Record<number, [number, "plant" | "wood" | "fish"]> = {
    2: [5, "plant"],
    5: [11, "wood"],
    8: [8, "fish"],
  }; // 채집막 · 자재 회수장 · 양식장 → 창고
  RESIDENTS.forEach((file, i) => {
    const haul = HAULS[i];
    if (haul) {
      const work = spot(haul[0]);
      jobs.push(
        place(
          residentGlb(file),
          work.x,
          work.z,
          r() * Math.PI * 2,
          residentScale(file),
          "Idle",
          1.3,
          2,
          { work, store: store.clone(), ...makeProp(haul[1]) },
        ),
      );
      return;
    }
    const a = (i / RESIDENTS.length) * Math.PI * 2 + r() * 0.4,
      d = 5 + r() * 3;
    jobs.push(
      place(
        residentGlb(file),
        Math.cos(a) * d,
        Math.sin(a) * d,
        r() * Math.PI * 2,
        residentScale(file),
        "Idle",
        1.3,
        2,
        "walk",
      ),
    );
  });
  const ready = Promise.allSettled(jobs).then(
    (rs) => rs.filter((x) => x.status === "rejected").length,
  );

  // 굴뚝 연기 (게임이 돌아갈 때만)
  const puff = new DynamicTexture("puff-tex", 64, scene, false);
  const pc = puff.getContext() as CanvasRenderingContext2D;
  const pg = pc.createRadialGradient(32, 32, 2, 32, 32, 32);
  pg.addColorStop(0, "rgba(255,255,255,0.9)");
  pg.addColorStop(1, "rgba(255,255,255,0)");
  pc.fillStyle = pg;
  pc.fillRect(0, 0, 64, 64);
  puff.update();
  puff.hasAlpha = true;
  const CHIMNEY: Record<string, number> = {
    BLD_NEST: 1.95,
    BLD_OFFICE: 2.5,
    BLD_WORKSHOP: 3,
    BLD_GREENHOUSE: 2.4,
    BLD_CLINIC: 2.2,
  };
  // 석탄 연기처럼 짙고 무겁게 (프로스트펑크 톤)
  const smokes: ParticleSystem[] = [];
  const smokeBase = new Map<ParticleSystem, number>();
  /** 화력(절약0.6·보통1·긴급1.4) × 연료 유무 → 굴뚝 연기 양 */
  let smokeScale = 1;
  function addSmoke(at: Vector3, scale = 1) {
    const ps = new ParticleSystem(`smoke-${smokes.length}`, 110, scene);
    ps.particleTexture = puff;
    ps.emitter = at;
    ps.minEmitBox = new Vector3(-0.12, 0, -0.12);
    ps.maxEmitBox = new Vector3(0.12, 0, 0.12);
    ps.direction1 = new Vector3(-0.1, 1, -0.05);
    ps.direction2 = new Vector3(0.25, 1.4, 0.15);
    ps.minEmitPower = 0.6;
    ps.maxEmitPower = 1;
    ps.minLifeTime = 3;
    ps.maxLifeTime = 5;
    ps.gravity = new Vector3(0.35, 0, 0.1);
    ps.addSizeGradient(0, 0.3 * scale);
    ps.addSizeGradient(1, 1.5 * scale);
    if (scale > 1) ps.emitRate = 18;
    ps.color1 = new Color4(0.3, 0.3, 0.34, 0.6);
    ps.color2 = new Color4(0.42, 0.42, 0.47, 0.5);
    ps.colorDead = new Color4(0.55, 0.56, 0.62, 0);
    ps.emitRate = 10;
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    smokes.push(ps);
    smokeBase.set(ps, ps.emitRate);
    ps.emitRate = ps.emitRate * smokeScale;
    if (running) ps.start();
  }

  // ── 발견한 거점: 건물 도감 GLB가 땅에서 솟아오름 (전용 모형은 모델링 담당 몫) ──
  const LANDMARK_GLB: Record<string, string> = {
    reed: "BLD_FISHERY",
    pine: "BLD_NEST",
    forge: "BLD_SALVAGE",
    hunt: "BLD_FORAGE",
  };
  const risers: Array<{ node: TransformNode; t: number }> = [];
  async function addLandmark(id: string, x: number, z: number) {
    const file = LANDMARK_GLB[id];
    if (!file || disposed || landmarkVisuals.has(id)) return;
    const generation = scoutGeneration;
    const asset = await load(scene, glbFile(file));
    if (disposed || generation !== scoutGeneration || landmarkVisuals.has(id))
      return;
    const node = new TransformNode(`landmark-glb-${id}`, scene);
    node.parent = worldRoot ?? null;
    node.position.set(x, elevation(x, z), z);
    node.rotation.y = face(x, z);
    const v = instantiate(asset, node, BUILDING_SCALE, shadow, 4.2, 3.8);
    for (const m of v.meshes) m.isPickable = false;
    node.scaling.y = 0.01 * BUILDING_SCALE;
    risers.push({ node, t: 0 });
    landmarkVisuals.set(id, { node, dispose: v.dispose });
  }
  function animateRisers(dt: number) {
    for (let i = risers.length - 1; i >= 0; i--) {
      const rz = risers[i];
      if (!rz) continue;
      rz.t = Math.min(1, rz.t + dt / 1.6);
      rz.node.scaling.y = Math.max(0.01, 1 - (1 - rz.t) ** 3) * BUILDING_SCALE;
      if (rz.t >= 1) risers.splice(i, 1);
    }
  }
  /** 걷는 중인 정찰대 머리 위 표식 위치 */
  function partyPoints() {
    const out: Array<{
      id: string;
      x: number;
      y: number;
      z: number;
      visible: boolean;
    }> = [];
    for (const [id, p] of parties) {
      const lead = p.members[0]?.node;
      const vis = !!lead?.isEnabled();
      out.push({
        id: `party:${id}`,
        x: lead?.position.x ?? 0,
        y: (lead?.position.y ?? 0) + 2.2,
        z: lead?.position.z ?? 0,
        visible: vis,
      });
    }
    return out;
  }

  // ── 정찰대: 두 발 정찰병 2마리가 거점까지 걸어가고, 살피다가, 돌아옴 (기획서: 2족 정찰병 갈리미무스 R05) ──
  type Mission = {
    id: string;
    x: number;
    z: number;
    start: number;
    hours: number;
  };
  type Party = {
    m: Mission;
    members: Array<{
      node: TransformNode;
      play: (c: string) => void;
      dispose: () => void;
      side: number;
    }>;
    from: Vector3;
    to: Vector3;
  };
  const parties = new Map<string, Party>();
  async function setMissions(list: Mission[]) {
    const ids = new Set(list.map((m) => m.id));
    for (const [id, p] of parties)
      if (!ids.has(id)) {
        for (const mb of p.members) {
          mb.dispose();
          mb.node.dispose();
        }
        parties.delete(id);
      }
    for (const m of list) {
      if (parties.has(m.id)) continue;
      const dir = new Vector3(m.x, 0, m.z).normalize();
      const party: Party = {
        m,
        members: [],
        from: dir.scale(9.5),
        to: new Vector3(m.x, 0, m.z).subtract(dir.scale(4)),
      };
      parties.set(m.id, party);
      for (const [k, file] of [
        "R05_Gallimimus",
        "R03_Velociraptor",
      ].entries()) {
        const asset = await load(scene, residentGlb(file));
        if (disposed || parties.get(m.id) !== party) return;
        const node = new TransformNode(`scout-${m.id}-${k}`, scene);
        node.parent = worldRoot ?? null;
        node.setEnabled(false);
        const v = instantiate(asset, node, residentScale(file), shadow, 1.3, 2);
        for (const mesh of v.meshes) mesh.isPickable = false;
        if (parties.get(m.id) !== party) {
          v.dispose();
          node.dispose();
          return;
        }
        party.members.push({
          node,
          play: v.play,
          dispose: v.dispose,
          side: k ? -0.9 : 0.9,
        });
      }
    }
  }
  // 게임 시각(분)에 맞춰 위치를 정함 → 멈추면 그 자리에 멈춤
  function updateParties(gameMin: number) {
    for (const p of parties.values()) {
      const total = p.m.hours * 60,
        e = gameMin - p.m.start;
      const dist = Vector3.Distance(p.from, p.to);
      const travel = Math.min(total / 2, dist * 6.25); // 1초=게임 10분, 걸음 1.6m/s
      let t = -1,
        out = true;
      if (e >= 0 && e < travel) t = e / travel;
      else if (e >= total - travel && e < total) {
        t = 1 - (e - (total - travel)) / travel;
        out = false;
      }
      const dx = p.to.x - p.from.x,
        dz = p.to.z - p.from.z,
        len = Math.hypot(dx, dz) || 1;
      for (const mb of p.members) {
        if (t < 0) {
          mb.node.setEnabled(false);
          continue;
        } // 안개 속을 살피는 중
        const x = p.from.x + dx * t + (-dz / len) * mb.side,
          z = p.from.z + dz * t + (dx / len) * mb.side;
        mb.node.setEnabled(true);
        mb.node.position.set(x, elevation(x, z), z);
        mb.node.rotation.y = Math.atan2(out ? dx : -dx, out ? dz : -dz);
        mb.play(running ? "Walk" : "Idle");
      }
    }
  }

  function setHeat(scale: number) {
    if (Math.abs(scale - smokeScale) < 0.01) return;
    smokeScale = scale;
    for (const ps of smokes) ps.emitRate = (smokeBase.get(ps) ?? 10) * scale;
  }
  let running = false;
  function setRunning(value: boolean) {
    if (value === running) return;
    running = value;
    for (const ps of smokes) value ? ps.start() : ps.stop();
    for (const w of walkers) {
      w.target = null;
      w.play(value && w.haul?.state === "work" ? "Work" : "Idle");
    }
  }
  const moveTo = (w: Walker, to: Vector3, dt: number) => {
    const p = w.node.position,
      dx = to.x - p.x,
      dz = to.z - p.z,
      dist = Math.hypot(dx, dz);
    if (dist < 0.08) return true;
    const step = Math.min(dist, 1.1 * dt);
    p.x += (dx / dist) * step;
    p.z += (dz / dist) * step;
    p.y = elevation(p.x, p.z);
    w.node.rotation.y = Math.atan2(dx, dz);
    return false;
  };
  function animate(dt: number) {
    animateRisers(dt);
    if (!running) return;
    for (const w of walkers) {
      const h = w.haul;
      if (h) {
        // 일꾼: 일터에서 작업 → 짐 지고 창고로 → 내려놓고 → 빈손으로 돌아감
        h.timer -= dt;
        if (h.state === "work" && h.timer <= 0) {
          h.state = "toStore";
          h.prop.setEnabled(true);
          w.play("Walk");
        } else if (h.state === "toStore" && moveTo(w, h.store, dt)) {
          h.state = "drop";
          h.timer = 1.2;
          h.prop.setEnabled(false);
          w.play("Idle");
        } else if (h.state === "drop" && h.timer <= 0) {
          h.state = "toWork";
          w.play("Walk");
        } else if (h.state === "toWork" && moveTo(w, h.work, dt)) {
          h.state = "work";
          h.timer = 3 + r() * 3;
          w.play("Work");
        }
        continue;
      }
      // 마당 둘레에서 이웃 자리로 옮겨 다님 → 가운데 둥지를 가로지르지 않음
      if (w.wait > 0) {
        w.wait -= dt;
        continue;
      }
      const p = w.node.position;
      if (!w.target) {
        const a =
          Math.atan2(p.z, p.x) + (r() < 0.5 ? -1 : 1) * (0.35 + r() * 0.8);
        const d = 4.2 + r() * 4.3;
        w.target = new Vector3(Math.cos(a) * d, 0, Math.sin(a) * d);
        w.play("Walk");
      }
      if (moveTo(w, w.target, dt)) {
        w.target = null;
        w.wait = 1.5 + r() * 3.5;
        w.play("Idle");
      }
    }
  }

  // 게임 대상(둥지·대표 주민)용 GLB 표시
  async function entityVisual(
    kind: "building" | "resident",
    parent: Node,
    offsetY: number,
  ): Promise<GlbVisual> {
    const asset = await load(
      scene,
      kind === "building"
        ? glbFile("BLD_ONDOL") // 가운데 온돌: 난방의 중심 (블렌더로 만든 화덕·큰 굴뚝·구들 고래)
        : residentGlb("R02_Triceratops"),
    );
    if (disposed || parent.isDisposed()) throw new Error("종료한 대상입니다.");
    const node = new TransformNode(`${parent.name}:glb`, scene);
    node.parent = parent;
    node.position.y = offsetY;
    const v = instantiate(
      asset,
      node,
      kind === "building" ? BUILDING_SCALE : residentScale("R02_Triceratops"),
      shadow,
      kind === "building" ? 4.2 : 1.3,
      kind === "building" ? 4 : 2,
    );
    v.play("Idle", 0);
    if (kind === "building") {
      for (const m of v.meshes) lib.dress(m.material);
      // 큰 굴뚝 연기 (온돌은 늘 땜)
      (parent as TransformNode).computeWorldMatrix?.(true);
      node.computeWorldMatrix(true);
      const s = node
        .getDescendants(false)
        .find(
          (n): n is TransformNode =>
            /smoke/i.test(n.name) && n instanceof TransformNode,
        );
      if (s) addSmoke(s.computeWorldMatrix(true).getTranslation(), 2.2);
    }
    return {
      setOutline(value) {
        if (kind === "building") {
          ring.setEnabled(value);
          if (value) {
            node.computeWorldMatrix(true);
            const p = node.getAbsolutePosition();
            ring.position.set(p.x, p.y + 0.12, p.z + 0.3);
            ring.scaling.setAll(10.5);
          }
          return;
        }
        for (const m of v.meshes) {
          m.outlineColor = OUTLINE;
          m.outlineWidth = 0.025;
          m.renderOutline = value;
        }
      },
      setMotion(value) {
        v.play(value === "walking" ? "Walk" : "Idle");
      },
      animate() {},
      dispose() {
        v.dispose();
        node.dispose();
      },
    };
  }

  return {
    ready,
    setHeat,
    entityVisual,
    /** 누른 조각이 마을 건물이면 LAYOUT 번호 */
    buildingForMesh(mesh: Node | null): number | null {
      for (let n: Node | null = mesh; n; n = n.parent) {
        const i = buildingNodes.get(n);
        if (i !== undefined) return i;
      }
      return null;
    },
    /** 고른 건물 발밑 고리 (null이면 숨김) */
    highlight(i: number | null) {
      const at = i === null ? undefined : LAYOUT[i];
      ring.setEnabled(!!at);
      if (!at) return;
      const [id, x, z] = at;
      ring.position.set(x, elevation(x, z) + 0.12, z);
      ring.scaling.setAll(id === "BLD_NEST" ? 5.4 : 6.4);
    },
    setRunning,
    animate,
    setMissions,
    updateParties,
    addLandmark,
    partyPoints,
    resetScouting() {
      scoutGeneration++;
      for (const party of parties.values())
        for (const member of party.members) {
          member.dispose();
          member.node.dispose();
        }
      parties.clear();
      for (const visual of landmarkVisuals.values()) {
        visual.dispose();
        visual.node.dispose();
      }
      landmarkVisuals.clear();
      risers.length = 0;
    },
    dispose() {
      disposed = true;
      plinthMat.dispose();
      for (const ps of smokes) ps.dispose();
      for (const p of parties.values())
        for (const mb of p.members) {
          mb.dispose();
          mb.node.dispose();
        }
      parties.clear();
      for (const visual of landmarkVisuals.values()) {
        visual.dispose();
        visual.node.dispose();
      }
      landmarkVisuals.clear();
      puff.dispose();
      for (const d of disposers) d();
      for (const n of nodes) n.dispose();
    },
  };
}
