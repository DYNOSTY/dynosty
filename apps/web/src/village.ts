// M2 마을: 건물 도감 GLB 12종 + 주민 v04 GLB 10종을 섬에 배치
import "@babylonjs/loaders/glTF";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Node } from "@babylonjs/core/node";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { Scene } from "@babylonjs/core/scene";
import { VILLAGE_LAYOUT as LAYOUT } from "@dynosty/game-core";
import { loadSceneAsset as load } from "./scene-assets.js";
import { elevation, rng } from "./world.js";

// ponytail: 표시 축척은 개발 시안 값. 기획서는 1단위=1m만 정함 → 개발팀과 확정 필요
export const BUILDING_SCALE = 0.75; // 둥지 지붕 1.85m = 목재 체험 보수 표시 높이
export const RESIDENT_SCALE = 0.5;
const OUTLINE = new Color3(0.3, 0.9, 1); // 현장과 대표 모델의 공통 선택색

export { VILLAGE_LAYOUT as LAYOUT } from "@dynosty/game-core";

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

const villageNames: Record<string, string> = {
  BLD_OFFICE: "관아",
  BLD_NEST: "온돌 둥지",
  BLD_WAREHOUSE: "갈무리 창고",
  BLD_WORKSHOP: "공방",
  BLD_FORAGE: "채집막",
  BLD_GREENHOUSE: "온상 재배소",
  BLD_WATER: "물터",
  BLD_FISHERY: "어획막",
  BLD_WATCH: "망루",
  BLD_CLINIC: "병원",
  BLD_SALVAGE: "자재 회수장",
  BLD_GATE: "마을 문",
  R01_Pachycephalosaurus: "파키케팔로사우루스",
  R02_Triceratops: "트리케라톱스",
  R03_Velociraptor: "벨로키랍토르",
  R04_Ankylosaurus: "안킬로사우루스",
  R05_Gallimimus: "갈리미무스",
  R07_Parasaurolophus: "파라사우롤로푸스",
  R08_Brachiosaurus: "브라키오사우루스",
  R09_Oviraptor: "오비랍토르",
  R10_Iguanodon: "이구아노돈",
  R12_Protoceratops: "프로토케라톱스",
};
export interface GlbVisual {
  setOutline(value: boolean): void;
  setLit?(lit: boolean): void;
  setMotion(value: string): void;
  animate(delta: number): void;
  dispose(): void;
}

type Shadow = (
  at: TransformNode,
  radius: number,
  depth?: number,
) => InstancedMesh | null;
function instantiate(
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
      m.addLODLevel(0.00005, null);
    }
  }
  const blob = shadow(parent, radius, depth);
  const groups = inst.animationGroups;
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
  const targets = new Map<
    string,
    { name: string; detail: string; meshes: AbstractMesh[] }
  >();
  let marked: string | null = null;
  function mark(id: string | null) {
    if (marked === id) return;
    if (marked)
      for (const m of targets.get(marked)?.meshes ?? [])
        m.renderOutline = false;
    marked = id;
    if (id)
      for (const m of targets.get(id)?.meshes ?? []) {
        m.outlineColor = OUTLINE;
        m.outlineWidth = 0.025;
        m.renderOutline = true;
      }
  }
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
    prop: Mesh;
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
  plinthMat.diffuseColor = new Color3(0.74, 0.74, 0.8);
  plinthMat.specularColor = Color3.Black();
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
    const v = instantiate(asset, node, scale, shadow, radius, depth);
    const model = node.name.replace(".glb", "");
    const id = "village:" + model + ":" + x + ":" + z;
    const detail = !role
      ? "복홀 · 마을 시설"
      : role === "walk"
        ? "복홀 · 마을 주민"
        : "복홀 · 작업장과 창고 사이 운반 담당";
    targets.set(id, {
      name: villageNames[model] ?? model,
      detail,
      meshes: v.meshes,
    });
    for (const m of v.meshes) {
      m.isPickable = true;
      m.metadata = { ...m.metadata, villageTarget: id };
      // 건물 밑 돌판(상자 1개)이 눈밭 위 흰 네모로 튀어 보임 → 둘레 눈 색으로 덮음
      if (!role && m.material?.name === "stone" && m.getTotalVertices() <= 36)
        m.material = plinthMat;
    }
    if (!role) {
      node.computeWorldMatrix(true);
      for (const m of v.meshes) {
        m.computeWorldMatrix(true);
        m.freezeWorldMatrix();
        m.doNotSyncBoundingInfo = true;
        m.material?.freeze();
      }
    }
    if (clip) v.play(clip, r());
    disposers.push(v.dispose);
    const door = DOOR[url.split("/").pop()?.replace(".glb", "") ?? ""];
    if (door && light) {
      const lamp = CreateBox(
        `${node.name}-door`,
        { width: 1.1, height: 0.95, depth: 0.06 },
        scene,
      );
      lamp.parent = node;
      lamp.position.set(0, door[0], door[1]);
      lamp.material = light.warmMat;
      lamp.isPickable = false;
      light.glow.addIncludedOnlyMesh(lamp);
    }
    if (role === "walk")
      walkers.push({ node, play: v.play, target: null, wait: r() * 2 });
    else if (role) {
      role.prop.parent = node;
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
  const jobs: Array<Promise<void>> = LAYOUT.filter(
    ([id]) => id !== "BLD_NEST",
  ).map(([id, x, z]) =>
    place(
      `/models/buildings/${id}.glb`,
      x,
      z,
      id === "BLD_GATE" ? Math.PI : face(x, z),
      BUILDING_SCALE,
    ),
  );

  // 등에 지는 짐 (모델 단위: 주민 0.5배 안에서 등 높이)
  const propMat = (name: string, hex: string) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = Color3.Black();
    return m;
  };
  const makeProp = (kind: "plant" | "wood" | "fish") => {
    const root = new Mesh(`carry-${kind}`, scene);
    if (kind === "wood") {
      const mat = propMat("carry-wood", "#7a5a40");
      [-0.28, 0, 0.28].forEach((x, i) => {
        const log = CreateCylinder(
          `carry-log-${i}`,
          { height: 1.6, diameter: 0.34, tessellation: 7 },
          scene,
        );
        log.rotation.x = Math.PI / 2;
        log.position.set(x, i === 1 ? 0.28 : 0, 0);
        log.material = mat;
        log.parent = root;
      });
    } else if (kind === "plant") {
      const bundle = CreateCylinder(
        "carry-fern",
        {
          height: 1.2,
          diameterBottom: 0.9,
          diameterTop: 0.15,
          tessellation: 7,
        },
        scene,
      );
      bundle.material = propMat("carry-plant", "#5e7a4a");
      bundle.parent = root;
    } else {
      const fish = CreateSphere(
        "carry-fish",
        { diameterX: 0.45, diameterY: 0.35, diameterZ: 1.3, segments: 6 },
        scene,
      );
      fish.material = propMat("carry-fish-mat", "#9aa6ad");
      fish.parent = root;
    }
    root.position.set(0, 1.75, -0.45);
    root.setEnabled(false);
    for (const m of root.getChildMeshes()) m.isPickable = false;
    return root;
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
          `/models/residents/${file}.glb`,
          work.x,
          work.z,
          r() * Math.PI * 2,
          RESIDENT_SCALE,
          "Idle",
          1.3,
          2,
          { work, store: store.clone(), prop: makeProp(haul[1]) },
        ),
      );
      return;
    }
    const a = (i / RESIDENTS.length) * Math.PI * 2 + r() * 0.4,
      d = 5 + r() * 3;
    jobs.push(
      place(
        `/models/residents/${file}.glb`,
        Math.cos(a) * d,
        Math.sin(a) * d,
        r() * Math.PI * 2,
        RESIDENT_SCALE,
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
  const fires = [
    [-7, -20],
    [15, 0],
    [-11, -9],
  ].map(([x = 0, z = 0], i) => {
    const fire = new ParticleSystem("처마 불길-" + i, 90, scene);
    fire.particleTexture = puff;
    fire.emitter = new Vector3(x, elevation(x, z) + 1.8, z);
    fire.minEmitBox = new Vector3(-1, 0, -0.5);
    fire.maxEmitBox = new Vector3(1, 0, 0.5);
    fire.direction1 = new Vector3(-0.4, 1.8, -0.2);
    fire.direction2 = new Vector3(0.4, 3, 0.2);
    fire.minLifeTime = 0.4;
    fire.maxLifeTime = 1.2;
    fire.minSize = 0.4;
    fire.maxSize = 1.2;
    fire.emitRate = 55;
    fire.color1 = new Color4(1, 0.65, 0.08, 1);
    fire.color2 = new Color4(0.9, 0.22, 0.02, 1);
    fire.colorDead = new Color4(0.2, 0.12, 0.09, 0);
    return fire;
  });
  const CHIMNEY: Record<string, number> = {
    BLD_OFFICE: 2.5,
    BLD_WORKSHOP: 3,
    BLD_GREENHOUSE: 2.4,
    BLD_CLINIC: 2.2,
  };
  const smokes = LAYOUT.filter(([id]) => id in CHIMNEY).map(([id, x, z], i) => {
    const ps = new ParticleSystem(`smoke-${i}`, 80, scene);
    ps.particleTexture = puff;
    ps.emitter = new Vector3(x, (CHIMNEY[id] ?? 2) + elevation(x, z), z);
    ps.minEmitBox = new Vector3(-0.15, 0, -0.15);
    ps.maxEmitBox = new Vector3(0.15, 0, 0.15);
    ps.direction1 = new Vector3(-0.1, 1, -0.05);
    ps.direction2 = new Vector3(0.25, 1.3, 0.15);
    ps.minEmitPower = 0.5;
    ps.maxEmitPower = 0.9;
    ps.minLifeTime = 2.5;
    ps.maxLifeTime = 4;
    ps.gravity = new Vector3(0.25, 0, 0.08);
    ps.addSizeGradient(0, 0.22);
    ps.addSizeGradient(1, 0.95);
    ps.color1 = new Color4(1, 1, 1, 0.4);
    ps.color2 = new Color4(0.95, 0.95, 0.97, 0.3);
    ps.colorDead = new Color4(0.95, 0.95, 0.97, 0);
    ps.emitRate = 7;
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    return ps;
  });

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
    const asset = await load(scene, `/models/buildings/${file}.glb`);
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
        const asset = await load(scene, `/models/residents/${file}.glb`);
        if (disposed || parties.get(m.id) !== party) return;
        const node = new TransformNode(`scout-${m.id}-${k}`, scene);
        node.parent = worldRoot ?? null;
        node.setEnabled(false);
        const v = instantiate(asset, node, RESIDENT_SCALE, shadow, 1.3, 2);
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
  const herald = new TransformNode("관아 포졸", scene);
  herald.parent = worldRoot ?? null;
  herald.setEnabled(false);
  const writ = CreateBox(
    "법령 한지",
    { width: 0.95, height: 1.22, depth: 0.035 },
    scene,
  );
  writ.parent = worldRoot ?? null;
  writ.isPickable = false;
  const paper = new StandardMaterial("방 한지", scene);
  const ink = new DynamicTexture(
    "법령 글씨",
    { width: 256, height: 320 },
    scene,
    false,
  );
  paper.diffuseTexture = ink;
  writ.material = paper;
  writ.setEnabled(false);
  let delivery = -1;
  let messenger: GlbVisual | undefined;
  function postDecree(title: string, deliver: boolean) {
    const pen = ink.getContext() as CanvasRenderingContext2D;
    pen.fillStyle = "#ead9ac";
    pen.fillRect(0, 0, 256, 320);
    pen.fillStyle = "#38271a";
    pen.font = "bold 48px serif";
    pen.fillText("방", 102, 70);
    pen.font = "28px serif";
    for (const [i, word] of title.split(" ").entries())
      pen.fillText(word, 30, 122 + i * 36);
    pen.fillStyle = "#973929";
    pen.fillRect(183, 245, 35, 35);
    ink.update();
    delivery = deliver ? 0 : 1;
    if (deliver && !messenger)
      void entityVisual("resident", herald, 0)
        .then((visual) => {
          if (disposed) {
            visual.dispose();
            return;
          }
          messenger = visual;
          visual.setMotion("walking");
        })
        .catch(() => {});
  }
  function animate(dt: number) {
    if (delivery >= 0) {
      delivery = Math.min(1, delivery + dt / 3);
      const z = -10 + 13.6 * delivery;
      herald.setEnabled(delivery < 1);
      herald.position.set(0, elevation(0, z), z);
      writ.setEnabled(true);
      writ.position.set(
        delivery < 1 ? 0.55 : 0,
        elevation(0, z) + 1.2,
        delivery < 1 ? z : 3.79,
      );
      if (delivery === 1) delivery = -1;
    }
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
    level = 1,
  ): Promise<GlbVisual> {
    const asset = await load(
      scene,
      kind === "building"
        ? "/models/buildings/BLD_NEST.glb"
        : "/models/residents/R02_Triceratops.glb",
    );
    if (disposed || parent.isDisposed()) throw new Error("종료한 대상입니다.");
    const node = new TransformNode(`${parent.name}:glb`, scene);
    node.parent = parent;
    node.position.y = offsetY;
    const v = instantiate(
      asset,
      node,
      kind === "building"
        ? BUILDING_SCALE * (1 + (level - 1) * 0.06)
        : RESIDENT_SCALE,
      shadow,
      kind === "building" ? 4.2 : 1.3,
      kind === "building" ? 4 : 2,
    );
    const lamp =
      kind === "building" && light
        ? CreateBox(
            node.name + "-door-light",
            { width: 1.1, height: 0.95, depth: 0.06 },
            scene,
          )
        : null;
    if (lamp && light) {
      lamp.parent = node;
      lamp.position.set(0, 1, 2.95);
      lamp.material = light.warmMat;
      lamp.isPickable = false;
      light.glow.addIncludedOnlyMesh(lamp);
      lamp.setEnabled(false);
    }
    v.play("Idle", 0);
    return {
      setLit(value) {
        lamp?.setEnabled(value);
      },
      setOutline(value) {
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
    entityVisual,
    postDecree,
    clearDecree() {
      delivery = -1;
      herald.setEnabled(false);
      writ.setEnabled(false);
    },
    setFireDamage(burned: boolean, burning: boolean) {
      for (const fire of fires) {
        if (burning && !fire.isStarted()) fire.start();
        if (!burning && fire.isStarted()) fire.stop();
      }
      for (const node of nodes)
        if (["BLD_CLINIC.glb", "BLD_WORKSHOP.glb"].includes(node.name))
          node.setEnabled(!burned);
    },
    setPreviewResidentsVisible(visible: boolean) {
      for (const walker of walkers) walker.node.setEnabled(visible);
    },
    targets,
    mark,
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
      messenger?.dispose();
      herald.dispose();
      writ.dispose();
      ink.dispose();
      paper.dispose();
      plinthMat.dispose();
      for (const fire of fires) fire.dispose(false);
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
