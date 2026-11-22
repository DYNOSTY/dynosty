// 일꾼 모션: 자원 터에서 캐 오는 조와 부지에서 건물을 짓는 조.
//   터: 두 명이 마을에서 걸어가 연장질을 하고(부스러기가 튐), 짐을 망태에 담아 조달소 앞으로 지고 돌아옴.
//   공사: 두 명이 장작 더미에서 자재를 지고 부지로 가서, 건물 둘레를 돌며 자리마다 메질을 함(불티가 튐).
//         첫째는 부지를 떠나지 않고 계속 돌며 메질하고, 둘째는 몇 자리 돌고 나면 빈 망태로 자재를 다시 가지러 감
//         (둘 다 가지러 가면 부지가 절반은 비어 짓는 것처럼 안 보였음). 단계가 바뀌거나 다 지으면 눈먼지가 일어남(puff).
// 해가 지면(일하는 시각 9~18시 밖) 돌아와 쉰다.
// 계산(얼마나 들어오고 언제 다 짓는지)은 game-core의 works.ts가 하고, 여기는 보여 주기만 함.
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { Scene } from "@babylonjs/core/scene";
import { type SiteId, WORK_HOURS } from "@dynosty/game-core";
import { WOOD_AT } from "./fuelyard.js";
import { LAYOUT } from "./layout.js";
import { PLOT_SCALE } from "./plots.js";
import { SITE_SCALE } from "./resource-sites.js";
import { loadSceneAsset } from "./scene-assets.js";
import { RESOURCE_SITES } from "./scout-sites.js";
import {
  instantiate,
  residentGlb,
  residentScale,
  type Shadow,
} from "./village.js";
import { elevation } from "./world.js";

const WALK = 2.6; // 터까지 30m 안팎 — 벌목꾼(1.1)처럼 걸으면 한 번 다녀오는 데 1분이 걸림
const WORK_TIME = 7; // 한 번 가서 일하는 시간(초)
const DROP_TIME = 1.2;
const BEAT = 0.6; // 연장을 한 번 내리치는 간격
const BUILD_TIME = 3.5; // 공사: 한 자리에서 메질하는 시간(초)
const BUILD_STOPS = 3; // 공사: 자재를 한 번 지고 와서 도는 자리 수

type Tool = "pick" | "axe" | "rod" | "hammer" | "none";
type Rgb = [number, number, number];
/** 터마다: 일꾼 둘이 설 자리(모델 기준, 앞이 -y)와 바라볼 곳, 연장, 부스러기 색, 망태에 담기는 짐 색 */
const SITE_WORK: Record<
  SiteId,
  {
    spots: [[number, number], [number, number]];
    look: [number, number];
    tool: Tool;
    chips: Rgb;
    load: Rgb;
    workers: [string, string];
  }
> = {
  coal: {
    spots: [
      [-1.1, -2.5],
      [0.6, -2.6],
    ],
    look: [0, -1.0],
    tool: "pick",
    chips: [0.12, 0.12, 0.15],
    load: [0.1, 0.1, 0.12],
    workers: ["R10_Iguanodon", "R01_Pachycephalosaurus"],
  },
  iron: {
    spots: [
      [-1.2, -2.5],
      [1.1, -2.4],
    ],
    look: [0, -0.4],
    tool: "pick",
    chips: [0.5, 0.26, 0.14],
    load: [0.42, 0.22, 0.13],
    workers: ["R02_Triceratops", "R04_Ankylosaurus"],
  },
  spring: {
    spots: [
      [-1.0, -1.25],
      [1.5, -1.5],
    ],
    look: [0, 0],
    tool: "none",
    chips: [0.75, 0.86, 0.95],
    load: [0.3, 0.5, 0.62],
    workers: ["R07_Parasaurolophus", "R12_Protoceratops"],
  },
  store: {
    spots: [
      [-0.4, -2.5],
      [1.0, -2.6],
    ],
    look: [0.2, -1.4],
    tool: "none",
    chips: [0.8, 0.68, 0.4],
    load: [0.8, 0.68, 0.4],
    workers: ["R09_Oviraptor", "R12_Protoceratops"],
  },
  fish: {
    spots: [
      [0.2, -2.0],
      [1.7, -1.6],
    ],
    look: [0.65, -0.95],
    tool: "rod",
    chips: [0.8, 0.9, 0.98],
    load: [0.6, 0.66, 0.72],
    workers: ["R03_Velociraptor", "R05_Gallimimus"],
  },
  pine: {
    spots: [
      [0.3, -1.25],
      [-0.9, -0.8],
    ],
    look: [-0.3, -0.1],
    tool: "axe",
    chips: [0.78, 0.6, 0.38],
    load: [0.42, 0.26, 0.16],
    workers: ["R10_Iguanodon", "R03_Velociraptor"],
  },
};

/** 한 조가 일하는 방식 (세계 자리) */
type Job = {
  spots: [Vector3, Vector3];
  look: Vector3;
  tool: Tool;
  chips: Rgb;
  load: Rgb;
  workers: [string, string];
  /** 터: 짐을 내려놓는 곳 / 공사: 자재를 가지러 가는 곳 */
  home: Vector3;
  /** true = 자재를 지고 가서 짓는 공사 (짐은 가는 길에), false = 캐서 지고 오는 터 */
  fetch: boolean;
  /** 공사: 건물 둘레를 따라 도는 메질 자리 */
  ring?: Vector3[];
};
type Phase = "rest" | "out" | "work" | "back" | "drop";
type Worker = {
  node: TransformNode;
  play: (clip: string) => void;
  load: { setEnabled(on: boolean): void };
  phase: Phase;
  t: number;
  spot: Vector3;
  /** 공사: 지금 서는 둘레 자리 번호와, 자재를 다시 가지러 가기까지 남은 자리 수 */
  at: number;
  stops: number;
  /** 공사: 자재를 가지러 가지 않고 부지에 남아 계속 메질하는 일꾼 */
  stay: boolean;
  dispose: () => void;
};
type Crew = { job: Job; want: boolean; workers: Worker[]; loading: boolean };

export function createSiteWork(opts: {
  scene: Scene;
  shadow: Shadow;
  worldRoot?: TransformNode;
}) {
  const { scene, shadow, worldRoot } = opts;
  let disposed = false;
  let minute = 12 * 60;

  const ground = (x: number, z: number) => new Vector3(x, elevation(x, z), z);
  // 터의 짐을 내려놓는 곳: 조달소에서 마당 쪽으로 몇 걸음
  const office = LAYOUT[0] ?? ["", 0, -14];
  const drop = ground(office[1] + 1.5, office[2] + 3.6);
  // 공사 자재를 가지러 가는 곳: 온돌 옆 장작 더미 앞
  const pile = ground(WOOD_AT.x + 1.6, WOOD_AT.z + 0.8);

  const mat = (name: string, c: Rgb) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = new Color3(c[0], c[1], c[2]);
    m.specularColor = Color3.Black();
    return m;
  };
  const woodMat = mat("sitework-wood", [0.3, 0.22, 0.15]);
  const ironMat = mat("sitework-iron", [0.5, 0.52, 0.56]);
  const basketMat = mat("sitework-basket", [0.5, 0.4, 0.24]);

  // 부스러기: 흐릿한 점 하나를 조마다 색만 바꿔 씀
  const dot = new DynamicTexture("sitework-dot", 32, scene, false);
  const dc = dot.getContext() as CanvasRenderingContext2D;
  const g = dc.createRadialGradient(16, 16, 1, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  dc.fillStyle = g;
  dc.fillRect(0, 0, 32, 32);
  dot.update();
  dot.hasAlpha = true;
  const chips = new Map<string, ParticleSystem>();
  const chipsFor = (key: string, [r, gr, b]: Rgb) => {
    let ps = chips.get(key);
    if (ps) return ps;
    const color = new Color4(r, gr, b, 1);
    const spark = key.startsWith("build-"); // 메질 불티는 더 크고 높이 튐
    ps = new ParticleSystem(`sitework-chips-${key}`, 80, scene);
    ps.particleTexture = dot;
    ps.emitter = Vector3.Zero();
    ps.emitRate = 0;
    ps.minSize = spark ? 0.12 : 0.06;
    ps.maxSize = spark ? 0.3 : 0.14;
    ps.minEmitPower = 1.2;
    ps.maxEmitPower = 2.6;
    ps.minLifeTime = 0.4;
    ps.maxLifeTime = 0.9;
    ps.gravity = new Vector3(0, -6, 0);
    ps.direction1 = new Vector3(-1, spark ? 1.4 : 0.8, -1);
    ps.direction2 = new Vector3(1, spark ? 2.8 : 1.8, 1);
    ps.color1 = color;
    ps.color2 = color;
    ps.colorDead = new Color4(r, gr, b, 0);
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.start();
    chips.set(key, ps);
    return ps;
  };

  /** 왼손에 연장을 쥐여 줌 (모델 단위) */
  const giveTool = (root: TransformNode, tool: Tool) => {
    const hand = root
      .getDescendants(false)
      .find((n) => /arm_L_hand$/.test(n.name)) as TransformNode | undefined;
    if (!hand || tool === "none") return;
    const rig = new TransformNode("tool", scene);
    rig.parent = hand;
    rig.position.set(0, -0.1, 0);
    const long = tool === "rod" ? 1.5 : tool === "hammer" ? 0.5 : 0.75;
    const handle = CreateBox(
      "tool-handle",
      { width: 0.05, height: long, depth: 0.05 },
      scene,
    );
    handle.material = woodMat;
    handle.parent = rig;
    handle.position.y = -long / 2 + 0.1;
    handle.isPickable = false;
    if (tool === "rod") return; // 낚싯대는 자루만
    const head = CreateBox(
      "tool-head",
      tool === "pick"
        ? { width: 0.5, height: 0.07, depth: 0.07 } // 곡괭이: 양쪽으로 뻗은 날
        : tool === "hammer"
          ? { width: 0.22, height: 0.12, depth: 0.12 } // 메: 뭉툭한 머리
          : { width: 0.22, height: 0.14, depth: 0.04 }, // 도끼
      scene,
    );
    head.material = tool === "hammer" ? woodMat : ironMat;
    head.parent = rig;
    head.position.set(tool === "axe" ? 0.09 : 0, -long + 0.14, 0);
    head.isPickable = false;
  };
  /** 등에 지는 망태: 늘 메고 있고, 짐(위에 봉긋한 덩이)만 켜고 끔 */
  const giveBasket = (root: TransformNode, c: Rgb) => {
    const rig = new TransformNode("basket", scene);
    rig.parent = root;
    rig.position.set(0, 1.25, -0.4);
    const body = CreateCylinder(
      "basket-body",
      { height: 0.6, diameterTop: 0.62, diameterBottom: 0.44, tessellation: 9 },
      scene,
    );
    body.material = basketMat;
    body.parent = rig;
    const heap = CreateSphere(
      "basket-load",
      { diameter: 0.58, segments: 5 },
      scene,
    );
    heap.material = mat(`sitework-load-${c.join("-")}`, c);
    heap.parent = rig;
    heap.position.y = 0.3;
    heap.scaling.y = 0.6;
    heap.setEnabled(false);
    for (const m of [body, heap]) m.isPickable = false;
    return heap;
  };

  // 눈먼지: 공사 단계가 바뀌거나 다 지었을 때 부지에서 한 번 일어남
  const dust = new ParticleSystem("sitework-dust", 160, scene);
  dust.particleTexture = dot;
  dust.emitter = Vector3.Zero();
  dust.minEmitBox = new Vector3(-2.6, 0, -1.9);
  dust.maxEmitBox = new Vector3(2.6, 1.6, 1.9);
  dust.emitRate = 0;
  dust.minSize = 0.9;
  dust.maxSize = 2.2;
  dust.minEmitPower = 0.6;
  dust.maxEmitPower = 2.2;
  dust.minLifeTime = 0.7;
  dust.maxLifeTime = 1.5;
  dust.gravity = new Vector3(0, 0.6, 0);
  dust.direction1 = new Vector3(-1.4, 0.3, -1.4);
  dust.direction2 = new Vector3(1.4, 1.2, 1.4);
  dust.color1 = new Color4(0.86, 0.9, 1, 0.75);
  dust.color2 = new Color4(0.78, 0.83, 0.95, 0.6);
  dust.colorDead = new Color4(0.86, 0.9, 1, 0);
  dust.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  dust.start();

  // 얼지 않는 샘에서 늘 피어오르는 김 (물이 얼지 않았다는 표시)
  const springAt = RESOURCE_SITES.find((x) => x.id === "spring");
  const steam = new ParticleSystem("sitework-steam", 60, scene);
  steam.particleTexture = dot;
  steam.emitter = ground(
    springAt?.x ?? 0,
    springAt?.z ?? 0,
  ).addInPlaceFromFloats(0, 0.4, 0);
  steam.minEmitBox = new Vector3(-1.3, 0, -0.9);
  steam.maxEmitBox = new Vector3(1.3, 0, 0.9);
  steam.emitRate = springAt ? 12 : 0;
  steam.minSize = 0.9;
  steam.maxSize = 2.0;
  steam.minEmitPower = 0.3;
  steam.maxEmitPower = 0.7;
  steam.minLifeTime = 2.2;
  steam.maxLifeTime = 4;
  steam.gravity = new Vector3(0.12, 0.25, 0);
  steam.direction1 = new Vector3(-0.2, 1, -0.2);
  steam.direction2 = new Vector3(0.3, 1.4, 0.2);
  steam.color1 = new Color4(0.95, 0.98, 1, 0.6);
  steam.color2 = new Color4(0.88, 0.94, 1, 0.42);
  steam.colorDead = new Color4(0.92, 0.96, 1, 0);
  steam.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  steam.start();

  const crews = new Map<string, Crew>();

  function siteJob(id: SiteId): Job {
    const s = RESOURCE_SITES.find((x) => x.id === id);
    const rule = SITE_WORK[id];
    /** 모델 기준 자리(앞이 -y)를 세계 자리로 */
    const at = ([x, y]: [number, number]) =>
      ground((s?.x ?? 0) + x * SITE_SCALE, (s?.z ?? 0) + y * SITE_SCALE);
    return {
      spots: [at(rule.spots[0]), at(rule.spots[1])],
      look: at(rule.look),
      tool: rule.tool,
      chips: rule.chips,
      load: rule.load,
      workers: rule.workers,
      home: drop,
      fetch: false,
    };
  }
  function buildJob(plot: number): Job {
    const [, x, z] = LAYOUT[plot] ?? ["", 0, 0];
    const k = PLOT_SCALE;
    // 건물 둘레의 메질 자리: 앞 왼쪽부터 한 바퀴 (앞 = 기본 시점의 카메라 쪽)
    const ring = (
      [
        [-1.3, -1.9],
        [0.4, -2.0],
        [2.2, -0.3],
        [1.2, 1.7],
        [-1.2, 1.7],
        [-2.2, -0.3],
      ] as const
    ).map(([dx, dz]) => ground(x + dx * k, z + dz * k));
    return {
      spots: [ring[0] ?? ground(x, z), ring[3] ?? ground(x, z)],
      look: ground(x, z),
      tool: "hammer",
      chips: [1, 0.72, 0.25], // 불티
      ring,
      load: [0.42, 0.26, 0.16],
      workers: ["R01_Pachycephalosaurus", "R09_Oviraptor"],
      home: pile,
      fetch: true,
    };
  }

  function spawn(key: string, crew: Crew) {
    crew.loading = true;
    const job = crew.job;
    job.workers.forEach((file, i) => {
      void loadSceneAsset(scene, residentGlb(file)).then(
        (asset: AssetContainer) => {
          if (disposed) return;
          const node = new TransformNode(`siteworker-${key}-${i}`, scene);
          node.parent = worldRoot ?? null;
          node.position.copyFrom(job.home).addInPlaceFromFloats(i * 1.2, 0, 0);
          const v = instantiate(
            asset,
            node,
            residentScale(file),
            shadow,
            1.3,
            2,
          );
          for (const m of v.meshes) m.isPickable = false;
          giveTool(node, job.tool);
          const load = giveBasket(node, job.load);
          node.setEnabled(false);
          crew.workers.push({
            node,
            play: v.play,
            load,
            phase: "rest",
            // 둘이 같은 걸음으로 붙어 다니지 않게 둘째는 조금 늦게 나섬
            t: -i * 3,
            spot: job.spots[i] ?? job.spots[0],
            at: i * 3, // 둘이 건물 맞은편에서 시작해 같은 쪽으로 돎
            stops: BUILD_STOPS,
            stay: job.fetch && i === 0,
            dispose: v.dispose,
          });
        },
      );
    });
  }

  /** 목표까지 걷고, 닿으면 true */
  function walkTo(w: Worker, goal: Vector3, dt: number) {
    const to = goal.subtract(w.node.position);
    to.y = 0;
    const dist = to.length();
    if (dist < 0.25) return true;
    w.play("Walk");
    w.node.position.addInPlace(to.normalize().scale(Math.min(dist, WALK * dt)));
    w.node.position.y = elevation(w.node.position.x, w.node.position.z);
    w.node.rotation.y = Math.atan2(to.x, to.z);
    return false;
  }

  function step(key: string, crew: Crew, w: Worker, dt: number) {
    const job = crew.job;
    const hour = minute / 60;
    const on = crew.want && hour >= WORK_HOURS.from && hour < WORK_HOURS.to;
    w.t += dt;
    switch (w.phase) {
      case "rest":
        if (!on || w.t < 0) break;
        w.node.setEnabled(true);
        w.load.setEnabled(job.fetch); // 공사: 자재를 지고 나섬
        w.stops = BUILD_STOPS;
        w.phase = "out";
        break;
      case "out": {
        if (!on) {
          w.phase = "back"; // 불러들이거나 해가 지면 그대로 돌아옴
          break;
        }
        if (!walkTo(w, job.ring?.[w.at % job.ring.length] ?? w.spot, dt)) break;
        const look = job.look.subtract(w.node.position);
        w.node.rotation.y = Math.atan2(look.x, look.z);
        if (job.fetch) w.load.setEnabled(false); // 자재를 부림
        w.play("Work");
        w.phase = "work";
        w.t = 0;
        break;
      }
      case "work": {
        if (Math.floor(w.t / BEAT) !== Math.floor((w.t - dt) / BEAT)) {
          const at = w.node.position.add(
            job.look.subtract(w.node.position).normalize().scale(0.9),
          );
          at.y += job.ring ? 0.9 : 0.5;
          const ps = chipsFor(key, job.chips);
          ps.emitter = at;
          ps.manualEmitCount = job.ring ? 16 : 10;
        }
        if (w.t < (job.ring ? BUILD_TIME : WORK_TIME) && on) break;
        // 공사: 옆 자리로 옮겨 가며 계속 메질
        if (job.ring && on && (w.stay || --w.stops > 0)) {
          w.at += 1;
          w.phase = "out";
          break;
        }
        // 터: 캔 것을 담음 (반도 못 하고 불려 오면 빈 망태)
        if (!job.fetch) w.load.setEnabled(w.t >= WORK_TIME * 0.5);
        w.phase = "back";
        break;
      }
      case "back":
        if (!walkTo(w, job.home, dt)) break;
        w.play("Idle");
        w.phase = "drop";
        w.t = 0;
        break;
      case "drop":
        if (w.t < DROP_TIME) break;
        w.load.setEnabled(false);
        w.t = 0;
        if (on) w.phase = "rest";
        else {
          w.phase = "rest";
          w.node.setEnabled(false);
        }
        break;
    }
  }

  function want(key: string, on: boolean, make: () => Job) {
    let crew = crews.get(key);
    if (!crew) {
      if (!on) return;
      crew = { job: make(), want: on, workers: [], loading: false };
      crews.set(key, crew);
    }
    crew.want = on;
    if (on && !crew.loading) spawn(key, crew);
  }

  return {
    /** 일꾼을 보낸 터와 짓는 중인 부지 (game-core PlayState.works) */
    setJobs(sites: Partial<Record<SiteId, boolean>>, builds: number[]) {
      for (const id of Object.keys(SITE_WORK) as SiteId[])
        want(`site-${id}`, sites[id] === true, () => siteJob(id));
      for (const plot of builds)
        want(`build-${plot}`, true, () => buildJob(plot));
      for (const key of crews.keys())
        if (key.startsWith("build-") && !builds.includes(Number(key.slice(6))))
          want(key, false, () => buildJob(0)); // 다 지었으면 돌아옴
    },
    /** 부지에서 눈먼지가 한 번 일어남 (공사 단계가 바뀜·다 지음) */
    puff(at: Vector3) {
      dust.emitter = at;
      dust.manualEmitCount = 46;
    },
    /** 하루 안의 게임 시각(분) */
    setClock(m: number) {
      minute = m;
    },
    animate(dt: number) {
      const d = Math.min(dt, 0.1);
      for (const [key, crew] of crews)
        for (const w of crew.workers) step(key, crew, w, d);
    },
    dispose() {
      disposed = true;
      for (const crew of crews.values())
        for (const w of crew.workers) {
          w.dispose();
          w.node.dispose();
        }
      for (const ps of chips.values()) ps.dispose();
      dust.dispose();
      steam.dispose();
      dot.dispose();
    },
  };
}
