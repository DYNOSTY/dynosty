// 벌목터: 나무가 곧 자원 — 숲 가장자리에서 공룡 일꾼이 도끼로 찍으면(나뭇조각) 나무가 기울어 쓰러지고(눈 먼지)
// 통나무로 잘린 뒤 다음 나무로 옮겨 감. 한 곳을 다 베면 잠시 뒤 어린나무가 다시 자람.
// 나무·그루터기·통나무는 thin instance 한 덩어리씩(가벼움) — 움직이는 나무는 그 칸의 행렬만 바꿈
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { Scene } from "@babylonjs/core/scene";
import { LOGGING_SITES } from "./layout.js";
import { loadSceneAsset } from "./scene-assets.js";
import {
  instantiate,
  residentGlb,
  residentScale,
  type Shadow,
} from "./village.js";
import { elevation, rng } from "./world.js";

const WORKERS = ["R10_Iguanodon", "R01_Pachycephalosaurus", "R03_Velociraptor"];
const TREES_PER_SITE = 6;
const CHOP = 3.2; // 찍는 시간(초)
const FALL = 1.7; // 쓰러지는 시간
const SETTLE = 0.8; // 땅에 닿고 튕기는 시간
const LIE = 3; // 누운 채로
const REGROW_WAIT = 18; // 다 벤 뒤 다시 자라기까지
const GROW = 6;
const WALK_SPEED = 1.1;

type Tree = {
  pos: Vector3;
  yaw: number;
  s: number;
  fall: Vector3; // 쓰러지는 쪽(땅과 나란한 단위 벡터)
  tree: number; // thin instance 번호
  stump: number;
  logs: number[];
};
type Phase = "walk" | "chop" | "fall" | "settle" | "lie" | "rest" | "regrow";
type Site = {
  trees: Tree[];
  next: number;
  phase: Phase;
  t: number;
  worker?: { node: TransformNode; play: (clip: string) => void };
  chips: ParticleSystem;
  puff: ParticleSystem;
};

export function createLogging(opts: {
  scene: Scene;
  shadow: Shadow;
  /** 숲과 같은 소나무·그루터기 모양을 새 덩어리로 만들어 주는 함수 (world.ts) */
  makePine: (name: string) => Mesh;
  makeStump: (name: string) => Mesh;
  worldRoot?: TransformNode;
}) {
  const { scene, shadow, worldRoot } = opts;
  const r = rng(77);
  const pine = opts.makePine("logging-pine");
  const stump = opts.makeStump("logging-stump");
  const logMat = new StandardMaterial("logging-log", scene);
  logMat.diffuseColor = new Color3(0.36, 0.25, 0.18);
  logMat.specularColor = Color3.Black();
  const log = CreateCylinder(
    "logging-log",
    { height: 1.1, diameterTop: 0.34, diameterBottom: 0.38, tessellation: 7 },
    scene,
  );
  log.material = logMat;
  for (const m of [pine, stump, log]) {
    m.isPickable = false;
    m.parent = worldRoot ?? null;
    m.alwaysSelectAsActiveMesh = true;
    m.isVisible = true; // 숲 원본(mergedMesh)은 숨김으로 만들어짐
  }
  const HIDE = Matrix.Scaling(0, 0, 0);
  const add = (m: Mesh) => m.thinInstanceAdd(HIDE, false);
  const set = (m: Mesh, i: number, mat: Matrix) =>
    m.thinInstanceSetMatrixAt(i, mat, false);

  // 나무 행렬: 밑동을 축으로 fall 쪽으로 angle만큼 기울임
  const treeMatrix = (t: Tree, angle: number, grow = 1) => {
    const axis = Vector3.Cross(Vector3.Up(), t.fall).normalize();
    const q = Quaternion.RotationAxis(axis, angle).multiply(
      Quaternion.RotationYawPitchRoll(t.yaw, 0, 0),
    );
    const s = t.s * grow;
    return Matrix.Compose(new Vector3(s, s, s), q, t.pos);
  };

  // 파편 결: 작은 네모 하나로 나뭇조각·눈 먼지 둘 다
  const dot = new DynamicTexture("logging-dot", 32, scene, false);
  const dc = dot.getContext() as CanvasRenderingContext2D;
  const g = dc.createRadialGradient(16, 16, 1, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  dc.fillStyle = g;
  dc.fillRect(0, 0, 32, 32);
  dot.update();
  dot.hasAlpha = true;
  const burst = (
    name: string,
    color: Color4,
    size: [number, number],
    power: [number, number],
    gravity: number,
    life: [number, number],
  ) => {
    const ps = new ParticleSystem(name, 120, scene);
    ps.particleTexture = dot;
    ps.emitter = Vector3.Zero();
    ps.emitRate = 0;
    ps.minSize = size[0];
    ps.maxSize = size[1];
    ps.minEmitPower = power[0];
    ps.maxEmitPower = power[1];
    ps.minLifeTime = life[0];
    ps.maxLifeTime = life[1];
    ps.gravity = new Vector3(0, gravity, 0);
    ps.direction1 = new Vector3(-1, 0.6, -1);
    ps.direction2 = new Vector3(1, 1.6, 1);
    ps.color1 = color;
    ps.color2 = color;
    ps.colorDead = new Color4(color.r, color.g, color.b, 0);
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.start();
    return ps;
  };
  const emit = (ps: ParticleSystem, at: Vector3, n: number) => {
    ps.emitter = at.clone();
    ps.manualEmitCount = n;
  };

  const sites: Site[] = LOGGING_SITES.map(([sx, sz], si) => {
    const base = Math.atan2(sz, sx),
      d0 = Math.hypot(sx, sz);
    const trees: Tree[] = [];
    for (let k = 0; k < TREES_PER_SITE; k++) {
      const a =
        base + (k - (TREES_PER_SITE - 1) / 2) * 0.085 + (r() - 0.5) * 0.03;
      const d = d0 + 1.2 + (k % 2) * 2.1 + r() * 0.6;
      const x = Math.cos(a) * d,
        z = Math.sin(a) * d;
      // 숲 둘레를 따라(옆으로) 쓰러짐 — 마을 쪽에 선 일꾼 위로 넘어지지 않게
      const side = k % 2 ? 1 : -1;
      const fall = new Vector3(-Math.sin(a) * side, 0, Math.cos(a) * side);
      const t: Tree = {
        pos: new Vector3(x, elevation(x, z), z),
        yaw: r() * Math.PI * 2,
        s: 0.85 + r() * 0.3,
        fall,
        tree: add(pine),
        stump: add(stump),
        logs: [add(log), add(log), add(log)],
      };
      set(pine, t.tree, treeMatrix(t, 0));
      trees.push(t);
    }
    return {
      trees,
      next: 0,
      phase: "walk",
      t: 0,
      chips: burst(
        `logging-chips-${si}`,
        new Color4(0.78, 0.6, 0.38, 1),
        [0.05, 0.11],
        [1.2, 2.4],
        -6,
        [0.4, 0.8],
      ),
      puff: burst(
        `logging-puff-${si}`,
        new Color4(0.86, 0.9, 0.97, 0.75),
        [0.4, 1.1],
        [0.6, 1.6],
        -0.6,
        [0.9, 1.8],
      ),
    };
  });
  const flush = () => {
    for (const m of [pine, stump, log]) m.thinInstanceBufferUpdated("matrix");
  };
  flush();

  // 일꾼: 공룡 주민 + 왼손에 도끼
  let disposed = false;
  const disposers: Array<() => void> = [];
  const axeMat = new StandardMaterial("logging-axe", scene);
  axeMat.diffuseColor = new Color3(0.3, 0.22, 0.15);
  axeMat.specularColor = Color3.Black();
  const ironMat = new StandardMaterial("logging-axe-iron", scene);
  ironMat.diffuseColor = new Color3(0.5, 0.52, 0.56);
  const giveAxe = (root: TransformNode) => {
    const hand = root
      .getDescendants(false)
      .find((n) => /arm_L_hand$/.test(n.name)) as TransformNode | undefined;
    if (!hand) return;
    const axe = new TransformNode("axe", scene);
    axe.parent = hand;
    axe.position.set(0, -0.1, 0);
    const handle = CreateBox(
      "axe-handle",
      { width: 0.05, height: 0.7, depth: 0.05 },
      scene,
    );
    handle.material = axeMat;
    handle.parent = axe;
    handle.position.y = -0.25;
    const head = CreateBox(
      "axe-head",
      { width: 0.22, height: 0.14, depth: 0.04 },
      scene,
    );
    head.material = ironMat;
    head.parent = axe;
    head.position.set(0.09, -0.55, 0);
    for (const m of [handle, head]) m.isPickable = false;
  };
  sites.forEach((site, i) => {
    const file = WORKERS[i % WORKERS.length] as string;
    void loadSceneAsset(scene, residentGlb(file)).then(
      (asset: AssetContainer) => {
        if (disposed) return;
        const node = new TransformNode(`logger-${i}`, scene);
        node.parent = worldRoot ?? null;
        const first = site.trees[0] as Tree;
        node.position.copyFrom(standAt(first));
        const v = instantiate(asset, node, residentScale(file), shadow, 1.3, 2);
        for (const m of v.meshes) m.isPickable = false;
        giveAxe(node);
        v.play("Idle");
        site.worker = { node, play: v.play };
        disposers.push(v.dispose);
      },
    );
  });
  // 일꾼이 설 자리: 나무에서 마을 쪽으로 한 발
  function standAt(t: Tree) {
    const inward = new Vector3(-t.pos.x, 0, -t.pos.z).normalize();
    const p = t.pos.add(inward.scale(0.95 * t.s));
    p.y = elevation(p.x, p.z);
    return p;
  }

  const FALL_MAX = Math.PI / 2 - 0.05;
  let running = false;
  function step(site: Site, dt: number) {
    const w = site.worker;
    if (!w) return;
    const t = site.trees[site.next] as Tree;
    site.t += dt;
    switch (site.phase) {
      case "walk": {
        const goal = standAt(t);
        const to = goal.subtract(w.node.position);
        to.y = 0;
        const dist = to.length();
        if (dist < 0.05) {
          w.node.position.copyFrom(goal);
          const face = t.pos.subtract(goal);
          w.node.rotation.y = Math.atan2(face.x, face.z);
          site.phase = "chop";
          site.t = 0;
          w.play("Work");
          break;
        }
        w.play("Walk");
        const stepLen = Math.min(dist, WALK_SPEED * dt);
        w.node.position.addInPlace(to.normalize().scale(stepLen));
        w.node.position.y = elevation(w.node.position.x, w.node.position.z);
        w.node.rotation.y = Math.atan2(to.x, to.z);
        break;
      }
      case "chop": {
        // 찍을 때마다 나뭇조각이 튀고 나무가 부르르
        const beat = Math.floor(site.t / 0.55);
        if (beat !== Math.floor((site.t - dt) / 0.55))
          emit(site.chips, t.pos.add(new Vector3(0, 0.55 * t.s, 0)), 14);
        const shake =
          0.02 * Math.sin(site.t * 38) * Math.exp(-((site.t % 0.55) * 6));
        set(pine, t.tree, treeMatrix(t, shake));
        if (site.t >= CHOP) {
          site.phase = "fall";
          site.t = 0;
          w.play("Idle");
          set(
            stump,
            t.stump,
            Matrix.Compose(
              new Vector3(0.75 * t.s, 0.75 * t.s, 0.75 * t.s),
              Quaternion.RotationYawPitchRoll(t.yaw, 0, 0),
              t.pos,
            ),
          );
        }
        break;
      }
      case "fall": {
        // 처음엔 천천히, 갈수록 빨라짐(넘어가는 나무처럼)
        const u = Math.min(1, site.t / FALL);
        set(pine, t.tree, treeMatrix(t, FALL_MAX * u ** 2.6));
        if (u >= 1) {
          site.phase = "settle";
          site.t = 0;
          // 땅에 닿는 자리(나무 가운데쯤)에서 눈 먼지
          for (const k of [1.2, 2.2, 3.2])
            emit(
              site.puff,
              t.pos.add(t.fall.scale(k * t.s)).add(new Vector3(0, 0.3, 0)),
              22,
            );
        }
        break;
      }
      case "settle": {
        const u = Math.min(1, site.t / SETTLE);
        const bounce =
          0.09 * Math.abs(Math.sin(u * Math.PI * 2)) * Math.exp(-u * 3);
        set(pine, t.tree, treeMatrix(t, FALL_MAX - bounce));
        if (u >= 1) {
          site.phase = "lie";
          site.t = 0;
        }
        break;
      }
      case "lie": {
        if (site.t >= LIE) {
          // 가지를 치고 통나무 세 토막으로
          set(pine, t.tree, HIDE);
          const q = Quaternion.FromUnitVectorsToRef(
            Vector3.Up(),
            t.fall,
            new Quaternion(),
          );
          t.logs.forEach((li, k) => {
            const at = t.pos.add(t.fall.scale((0.9 + k * 1.2) * t.s));
            at.y = elevation(at.x, at.z) + 0.18;
            set(log, li, Matrix.Compose(new Vector3(1, 1, 1), q, at));
          });
          emit(
            site.chips,
            t.pos.add(t.fall.scale(1.8 * t.s)).add(new Vector3(0, 0.3, 0)),
            20,
          );
          site.next += 1;
          site.t = 0;
          site.phase = site.next >= site.trees.length ? "rest" : "walk";
          if (site.phase === "rest") w.play("Idle");
        }
        break;
      }
      case "rest": {
        if (site.t >= REGROW_WAIT) {
          for (const tr of site.trees) {
            for (const li of tr.logs) set(log, li, HIDE); // 통나무는 창고로 옮겨 감
            set(stump, tr.stump, HIDE);
          }
          site.phase = "regrow";
          site.t = 0;
        }
        break;
      }
      case "regrow": {
        const u = Math.min(1, site.t / GROW);
        for (const tr of site.trees)
          set(
            pine,
            tr.tree,
            treeMatrix(tr, 0, 0.15 + 0.85 * u * u * (3 - 2 * u)),
          );
        if (u >= 1) {
          site.next = 0;
          site.phase = "walk";
          site.t = 0;
        }
        break;
      }
    }
  }

  return {
    animate(dt: number) {
      if (!running) return;
      for (const s of sites) step(s, Math.min(dt, 0.1));
      flush();
    },
    setRunning(value: boolean) {
      running = value;
      if (!value) for (const s of sites) s.worker?.play("Idle");
    },
    dispose() {
      disposed = true;
      for (const d of disposers) d();
      for (const s of sites) {
        s.chips.dispose();
        s.puff.dispose();
      }
      for (const m of [pine, stump, log]) m.dispose();
      dot.dispose();
    },
  };
}
