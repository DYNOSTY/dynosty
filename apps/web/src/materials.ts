// 공용 재질 세트 (2026-11-18 컨셉 시트 톤: 그을림·서리·주황 창 불빛)
// GLB 재질 이름으로 찾아 같은 텍스처를 입힌다. 새 모델은 블렌더 재질 이름을 아래 이름 그대로 쓰면 된다.
import type { Material } from "@babylonjs/core/Materials/material";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";

/** 공용 재질 12종 (public/textures/materials/<이름>_albedo|normal.webp) */
export const LIBRARY = [
  "giwa_sooty",
  "timber_dark",
  "log_bark",
  "thatch_sooty",
  "stone",
  "snow",
  "ice_clear",
  "iron_rusted",
  "hanji_frosted",
  "window",
  "felt_patch",
  "glass_frosted",
] as const;
type LibraryId = (typeof LIBRARY)[number];

// 지금 GLB(도감 12종)의 재질 이름 → 공용 재질. 새 모델은 공용 이름을 그대로 써서 여기 거치지 않음
const ALIAS: Record<string, LibraryId> = {
  tile: "giwa_sooty",
  cap: "giwa_sooty",
  wood: "timber_dark",
  timber: "timber_dark",
  darkwood: "timber_dark",
  thatch: "thatch_sooty",
  strawlight: "thatch_sooty",
  iron: "iron_rusted",
  brass: "iron_rusted",
  copper: "iron_rusted",
  paper: "hanji_frosted",
  glass: "glass_frosted",
  glass2: "glass_frosted",
  water: "ice_clear",
  rope: "felt_patch",
  linen: "felt_patch",
  amber: "window",
  ember: "window",
};

/** 불 켜진 창: 이 재질을 쓰는 조각은 주황으로 빛나고 글로우에 들어감 */
export const isGlowMaterial = (name: string | undefined) =>
  !!name && resolve(name) === "window";

// 이름 끝이 _hot이면 같은 재질이되 눈이 쌓이지 않음 (온돌처럼 뜨거운 곳)
const hot = (name: string) => name.endsWith("_hot");
const resolve = (name: string): LibraryId | undefined => {
  const n = hot(name) ? name.slice(0, -4) : name;
  return (LIBRARY as readonly string[]).includes(n)
    ? (n as LibraryId)
    : ALIAS[n];
};

// 위를 보는 면(지붕·데크·계단)에 눈이 쌓인 듯 덮음 — 모델을 고치지 않아도 컨셉 시트처럼 지붕에 두꺼운 눈
// Babylon이 생성자(super) 안에서 셰이더 코드를 먼저 묻기 때문에 값은 만들기 직전에 여기 둠
let pending = { amount: 0.8, from: 0.5 };
class SnowCoverPlugin extends MaterialPluginBase {
  amount = pending.amount;
  /** 이 기울기(법선 y)부터 눈이 붙기 시작 — 지붕은 낮게, 벽·데크는 높게 */
  from = pending.from;
  static attach(material: Material, amount: number, from: number) {
    pending = { amount, from };
    return new SnowCoverPlugin(material);
  }
  private constructor(material: Material) {
    super(material, "SnowCover", 200, { SNOWCOVER: false });
    this._enable(true);
  }
  override prepareDefines(defines: Record<string, unknown>) {
    defines.SNOWCOVER = true;
  }
  override getClassName() {
    return "SnowCoverPlugin";
  }
  override getCustomCode(shaderType: string) {
    if (shaderType !== "fragment") return null;
    const amount = this.amount ?? pending.amount,
      from = this.from ?? pending.from;
    // 노이즈로 눈 가장자리를 들쭉날쭉하게 (세계 좌표 기준이라 건물마다 달라 보임)
    return {
      CUSTOM_FRAGMENT_UPDATE_ALPHA: `
        #ifdef SNOWCOVER
        {
          // 부드러운 값 노이즈 (네모 칸이 보이지 않게 이웃끼리 섞음)
          vec2 p = vPositionW.xz * 1.6;
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          #define SNOW_H(q) fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453)
          float n = mix(mix(SNOW_H(i), SNOW_H(i + vec2(1, 0)), f.x), mix(SNOW_H(i + vec2(0, 1)), SNOW_H(i + vec2(1, 1)), f.x), f.y);
          float up = smoothstep(${from.toFixed(2)} + n * 0.18, ${(from + 0.3).toFixed(2)} + n * 0.18, normalW.y);
          surfaceAlbedo = mix(surfaceAlbedo, vec3(0.8, 0.85, 0.94), up * ${amount.toFixed(2)});
        }
        #endif
      `,
    };
  }
}

/** 공룡 주민: 머리·어깨·등짐처럼 위를 보는 곳에 눈 (빛나는 등불·눈 덩이는 그대로) */
const snowed = new WeakSet<Material>();
export function snowOnResident(material: Material | null) {
  if (!material || snowed.has(material)) return;
  snowed.add(material);
  if (/lamp|snow/i.test(material.name)) return;
  SnowCoverPlugin.attach(material, 0.5, 0.6); // 살짝 덮이게 — 담요 누빔 색이 보이도록
}

export function createMaterialLibrary(scene: Scene) {
  const cache = new Map<string, Texture>();
  const tex = (file: string) => {
    let t = cache.get(file);
    if (!t) {
      t = new Texture(`/textures/materials/${file}.webp`, scene);
      cache.set(file, t);
    }
    return t;
  };
  const done = new WeakSet<Material>();
  return {
    texture: (id: LibraryId, kind: "albedo" | "normal" = "albedo") =>
      tex(`${id}_${kind}`),
    /** GLB의 PBR 재질에 공용 텍스처를 입힘 (같은 재질은 한 번만) */
    dress(material: Material | null) {
      if (!material || done.has(material)) return;
      done.add(material);
      const m = material as PBRMaterial;
      if (!("albedoTexture" in m)) return;
      // 회벽은 공용 재질이 없어 색만 그을리게
      if (material.name === "plaster") {
        m.albedoColor = new Color3(0.58, 0.56, 0.53);
        SnowCoverPlugin.attach(m, 0.85, 0.55);
        return;
      }
      const id = resolve(material.name);
      if (!id || id === "snow") return; // 눈은 village가 땅과 맞춤
      m.albedoTexture = tex(`${id}_albedo`);
      m.albedoColor = Color3.White();
      m.bumpTexture = tex(`${id}_normal`);
      m.metallic = id === "iron_rusted" ? 0.35 : 0;
      m.roughness = id === "ice_clear" || id === "glass_frosted" ? 0.35 : 0.9;
      // 초가는 어두운 밀짚이라 조금 밝혀 컨셉 시트의 누런 빛을 살림
      if (id === "thatch_sooty") m.albedoColor = new Color3(1.35, 1.22, 1.05);
      if (id === "window") {
        m.emissiveTexture = tex("window_albedo");
        m.emissiveColor = new Color3(1.15, 0.78, 0.48); // 작은 창도 멀리서 읽히게
        m.bumpTexture = null;
      } else if (
        id !== "ice_clear" &&
        id !== "glass_frosted" &&
        !hot(material.name)
      ) {
        const roof = id === "giwa_sooty" || id === "thatch_sooty";
        SnowCoverPlugin.attach(m, roof ? 0.95 : 0.75, roof ? 0.22 : 0.55);
      }
    },
  };
}
export type MaterialLibrary = ReturnType<typeof createMaterialLibrary>;
