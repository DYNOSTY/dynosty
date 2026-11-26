// 안 가 본 땅에 낀 안개 (2026-11-21).
// 마을 둘레(SIGHT_RADIUS)만 걷혀 있고 바깥은 안개가 끼어 있다가, 정찰을 마친 곳과 거기까지의 길이 2초에 걸쳐 걷힌다.
//
// 지나온 길 (모두 사용자 퇴짜 → 다시 하지 말 것):
//  1) 나무 위에 덮은 검은 판: "위에 덮여 있는 불쾌한 암흑"
//  2) 땅에서 솟은 구름 둑(입체 면): "진흙 덩어리가 됐잖아, 뒤지게 무겁네"
// → 안개를 따로 그리는 물체로 만들지 않는다. 땅·나무·건물이 그려질 때 그 자리의 안개 짙기만큼 안개 색으로 물들인다
//   (재질에 끼워 넣는 계산). 그릴 것이 하나도 늘지 않아 가볍고, 덩어리가 없어 뿌옇기만 하다.
//  · 짙기 = 걷힌 가장자리에서 얼마나 안쪽인가 × 땅에서 얼마나 낮은가.
//    가장자리에서는 발목 높이까지만 끼고, 깊이 들어갈수록 안개 윗면이 높아져 나무가 밑동부터 차례로 잠긴다.
//  · 색은 그때의 날씨 안개 색(scene.fogColor) — 먼 곳이 흐려지는 색과 같아 하늘 끝까지 이어진다.
//  · 가장자리는 자리마다 들쭉날쭉하고 천천히 흐른다.
//  · 짙기는 화면 점마다가 아니라 모델 꼭짓점마다 셈한다. 점마다 셈했더니 숲이 겹쳐 그려지는 만큼 계산이 불어나
//    초당 55장이 31장으로 떨어졌다(내장 그래픽, 1600×900). 꼭짓점이 촘촘해서 보기에는 같다.
import type { Material } from "@babylonjs/core/Materials/material";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { RegisterMaterialPlugin } from "@babylonjs/core/Materials/materialPluginManager";
import { PBRBaseMaterial } from "@babylonjs/core/Materials/PBR/pbrBaseMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { Scene } from "@babylonjs/core/scene";
import { initialClearCircles } from "./mist-layout.js";
import { SCOUT_SITES, type ScoutSite } from "./scout-sites.js";
import { LAKE } from "./world.js";

/** 처음부터 보이는 범위: 마을·그루터기 벌판·숲 가장자리까지 */
export const SIGHT_RADIUS = 38;
/** 걷힌 곳에서 안개가 다 짙어질 때까지의 거리 */
const EDGE_WIDTH = 20;
/** 정찰로 찾은 곳 둘레가 걷히는 범위 */
const SITE_RADIUS = 13;
/** 셰이더에 넘기는 정찰 거점 수 */
const MAX_SITES = SCOUT_SITES.length;
const initialCircles = initialClearCircles();
const INITIAL_COUNT = initialCircles.length;
/** 셰이더에 전달하는 초기 원 목록의 복사본. */
export function getInitialMistCircles() {
  return initialCircles.map((circle) => ({ ...circle }));
}

// 모든 재질이 같이 보는 값 (createFog의 animate가 매 장면 고침)
const mist = {
  color: [0.6, 0.66, 0.77],
  /** 걷힌 반지름 · 가장자리 폭 · 세기(0이면 안개 없음) · 흐른 시간 */
  params: [SIGHT_RADIUS, EDGE_WIDTH, 0, 0],
  /** 거점마다 x · z · 걷히는 반지름 · 걷힌 정도(0~1) */
  sites: new Float32Array(MAX_SITES * 4),
  initial: new Float32Array(
    initialCircles.flatMap((s) => [s.x, s.z, s.radius, 0]),
  ),
};

/** 살아 있는 장면 수 — 개발 모드에서는 장면이 두 번 만들어지고 먼저 것이 나중에 지워지므로 켜고 끄기를 세어서 함 */
let live = 0;

const f = (n: number) => n.toFixed(1);
const VERTEX_DEFS = `
#ifdef DYNOSTY_MIST
varying float vMist;
float mistSmooth(float a, float b, float v) {
  float t = clamp((v - a) / (b - a), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
// 땅 높이: world.ts의 elevation과 같은 식 (안개 두께를 땅에서부터 재려고)
float mistGround(vec2 p) {
  float d = length(p);
  float dl = length(p - vec2(${f(LAKE.x)}, ${f(LAKE.z)}));
  float hills = mistSmooth(23.0, 40.0, d) * (sin(p.x * 0.13) * cos(p.y * 0.11) + 1.2) * 1.5;
  float ridge = mistSmooth(50.0, 67.0, d) * (sin(p.x * 0.21 + p.y * 0.17) + 1.4) * 2.6;
  return (hills + ridge) * mistSmooth(${f(LAKE.r - 1)}, ${f(LAKE.r + 6)}, dl);
}
#endif
`;
const VERTEX_MAIN = `
#ifdef DYNOSTY_MIST
vMist = 0.0;
if (mistParams.z > 0.0) {
  vec2 p = worldPos.xz;
  float t = mistParams.w;
  // 가장자리 흔들림: 자리마다 다르고 천천히 흐름
  float w = sin(p.x * 0.37 + cos(p.y * 0.29) * 2.1 + t * 0.21) * 0.6 + sin(p.y * 0.83 - p.x * 0.61 - t * 0.13) * 0.4;
  float edge = mistParams.y;
  float clearV = 1.0 - mistSmooth(mistParams.x, mistParams.x + edge, length(p) + w * 3.0);
  for (int i = 0; i < ${MAX_SITES}; i++) {
    vec4 s = mistSites[i];
    if (s.w > 0.0) {
      // 찾은 곳 둘레와, 마을에서 거기까지 난 길
      clearV = max(clearV, s.w * (1.0 - mistSmooth(s.z, s.z + edge * 0.6, length(p - s.xy) + w * 2.0)));
      float k = clamp(dot(p, s.xy) / max(dot(s.xy, s.xy), 1.0), 0.0, 1.0);
      clearV = max(clearV, s.w * (1.0 - mistSmooth(4.0, 4.0 + edge * 0.5, length(p - s.xy * k) + w * 1.5)));
    }
  }
  for (int i = 0; i < ${INITIAL_COUNT}; i++) {
    vec4 s = mistInitial[i];
    // 흔들림의 최대 2m를 더해 지정 반경 안은 항상 완전히 걷힌다.
    clearV = max(clearV, 1.0 - mistSmooth(s.z + 2.0, s.z + 2.0 + edge * 0.6, length(p - s.xy) + w * 2.0));
  }
  float deep = 1.0 - clearV; // 0 = 걷힘 … 1 = 안개 깊숙이
  float h = worldPos.y - mistGround(p); // 땅에서의 높이
  float top = mix(0.8, 16.0, deep); // 안개 윗면: 가장자리는 발목, 깊을수록 높이
  float thick = 1.0 - mistSmooth(top * 0.3, top, h); // 윗면 아래로 내려갈수록 짙음
  float amount = max(deep * thick, mistSmooth(0.7, 1.0, deep)); // 깊숙한 곳은 높이와 상관없이 다 잠김
  vMist = amount * mistParams.z;
}
#endif
`;

const MIST_UNIFORMS = `#ifdef DYNOSTY_MIST
uniform vec3 mistColor;
uniform vec4 mistParams;
uniform vec4 mistSites[${MAX_SITES}];
uniform vec4 mistInitial[${INITIAL_COUNT}];
#endif`;

class MistPlugin extends MaterialPluginBase {
  constructor(material: Material) {
    super(material, "DynostyMist", 200, { DYNOSTY_MIST: false });
    // freeze()한 재질은 일반 bindForSubMesh를 건너뛸 수 있어 매 그리기마다 호출되는 경로를 쓴다.
    this.registerForExtraEvents = true;
    this._enable(true);
  }
  override getClassName() {
    return "DynostyMistPlugin";
  }
  override prepareDefines(defines: Record<string, unknown>) {
    defines.DYNOSTY_MIST = true;
  }
  override getUniforms() {
    return {
      ubo: [
        { name: "mistColor", size: 3, type: "vec3" },
        { name: "mistParams", size: 4, type: "vec4" },
        { name: "mistSites", size: 4, type: "vec4", arraySize: MAX_SITES },
        {
          name: "mistInitial",
          size: 4,
          type: "vec4",
          arraySize: INITIAL_COUNT,
        },
      ],
      vertex: MIST_UNIFORMS,
      fragment: MIST_UNIFORMS,
    };
  }
  override hardBindForSubMesh(ubo: UniformBuffer) {
    ubo.updateFloat3(
      "mistColor",
      mist.color[0] ?? 0,
      mist.color[1] ?? 0,
      mist.color[2] ?? 0,
    );
    ubo.updateFloat4(
      "mistParams",
      mist.params[0] ?? 0,
      mist.params[1] ?? 0,
      mist.params[2] ?? 0,
      mist.params[3] ?? 0,
    );
    ubo.updateFloatArray("mistSites", mist.sites);
    ubo.updateFloatArray("mistInitial", mist.initial);
  }
  override getCustomCode(shaderType: string) {
    if (shaderType === "vertex")
      return {
        CUSTOM_VERTEX_DEFINITIONS: VERTEX_DEFS,
        CUSTOM_VERTEX_MAIN_END: VERTEX_MAIN,
      };
    if (shaderType === "fragment")
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: `
#ifdef DYNOSTY_MIST
varying float vMist;
#endif
`,
        CUSTOM_FRAGMENT_MAIN_END: `
#ifdef DYNOSTY_MIST
gl_FragColor.rgb = mix(gl_FragColor.rgb, mistColor, vMist);
#endif
`,
      };
    return null;
  }
}
// 이 뒤에 만들어지는 모든 땅·나무·건물 재질에 끼워 넣음 (장면을 만들기 전에 불려야 하므로 모듈을 읽을 때 등록)
RegisterMaterialPlugin("DynostyMist", (material) =>
  material instanceof StandardMaterial || material instanceof PBRBaseMaterial
    ? new MistPlugin(material)
    : null,
);

export function createFog(scene: Scene, sites: ScoutSite[]) {
  /** 거점별 걷힌 정도 0(안개)~1(다 걷힘) */
  const shown = new Map<string, number>();
  const target = new Map<string, number>();
  const list = sites.slice(0, MAX_SITES);
  const write = () => {
    mist.sites.fill(0);
    list.forEach((s, i) => {
      mist.sites.set([s.x, s.z, SITE_RADIUS, shown.get(s.id) ?? 0], i * 4);
    });
  };
  live += 1;
  mist.params[2] = 1;
  write();
  return {
    reset() {
      shown.clear();
      target.clear();
      write();
    },
    /** 정찰을 마치면 그곳과 거기까지의 길이 2초에 걸쳐 걷힘 */
    reveal(id: string) {
      target.set(id, 1);
    },
    animate(dt: number) {
      const fog = scene.fogColor;
      mist.color = [fog.r, fog.g, fog.b];
      mist.params[3] = (mist.params[3] ?? 0) + dt;
      if (target.size === 0) return;
      for (const [id, to] of target) {
        const now = Math.min(to, (shown.get(id) ?? 0) + dt * 0.5);
        shown.set(id, now);
        if (now >= to) target.delete(id);
      }
      write();
    },
    dispose() {
      live -= 1;
      if (live <= 0) mist.params[2] = 0; // 마지막 장면이 끝나면 안개를 끔
    },
  };
}
