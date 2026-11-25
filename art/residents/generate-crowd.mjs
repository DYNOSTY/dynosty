// node art/residents/generate-crowd.mjs [--check]
// Only the six allowlisted GLBs are inputs. No game build, renderer, or Blender required.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { compressTexture } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptSimplifier } from "meshoptimizer";
import { PNG } from "pngjs";

const dir = path.resolve(
  import.meta.dirname,
  "../../apps/web/public/models/residents",
);
const axes = [0, 1, 2];
const linear = Array.from({ length: 256 }, (_, n) => {
  const s = n / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
});

// Column-major affine transforms. Skinning also recovers the position decode
// matrix that meshopt quantization folds into the inverse bind matrices.
function product(a, b) {
  return b.map((_, i) =>
    [0, 1, 2, 3].reduce((v, k) => v + a[(i % 4) + 4 * k] * b[(i & ~3) + k], 0),
  );
}
function vertexMatrix(palette, joints, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) throw Error("Unweighted skinned vertex");
  if (weights[0] === sum) return palette[joints[0]];
  return palette[joints[0]].map(
    (_, k) =>
      weights.reduce((v, w, i) => v + w * palette[joints[i]][k], 0) / sum,
  );
}
function pushVertex(out, m, [x, y, z], n) {
  for (const i of axes)
    out.pos.push(m[i] * x + m[i + 4] * y + m[i + 8] * z + m[i + 12]);
  // Cofactor matrix, proportional to inverse transpose for these positive-scale rigs.
  const normal = axes.map((i) => {
    const j = (i + 1) % 3,
      k = (i + 2) % 3;
    return (
      n[0] * (m[4 + j] * m[8 + k] - m[4 + k] * m[8 + j]) +
      n[1] * (m[8 + j] * m[k] - m[8 + k] * m[j]) +
      n[2] * (m[j] * m[4 + k] - m[k] * m[4 + j])
    );
  });
  const length = Math.hypot(...normal);
  if (!(length > 0)) throw Error("Invalid transformed normal");
  out.norm.push(...normal.map((v) => v / length));
}

async function materialSampler(mat, textures) {
  if (mat.getAlphaMode() !== "OPAQUE")
    throw Error("Crowd bake expects opaque sources");
  const factor = mat.getBaseColorFactor().slice(0, 3),
    tex = mat.getBaseColorTexture();
  if (!tex) return () => factor;
  const info = mat.getBaseColorTextureInfo();
  if (
    info.getWrapS() !== 10497 ||
    info.getWrapT() !== 10497 ||
    info.getTexCoord() !== 0 ||
    info.listExtensions().length
  )
    throw Error("Unsupported texture coordinates");
  if (!textures.has(tex)) {
    // Convert embedded JPEG through the pinned glTF Transform image backend.
    await compressTexture(tex, { targetFormat: "png", resize: [128, 128] });
    textures.set(tex, PNG.sync.read(Buffer.from(tex.getImage())));
  }
  const { width, height, data } = textures.get(tex);
  // A few authored batches share a textured material but omit TEXCOORD_0.
  // Use a constant UV there rather than inventing a surface projection.
  return ([u, v] = [0, 0]) => {
    const x = Math.floor((u - Math.floor(u)) * width),
      y = Math.floor((v - Math.floor(v)) * height);
    return factor.map((f, k) => f * linear[data[(y * width + x) * 4 + k]]);
  };
}

export async function flatten(scene) {
  const out = { pos: [], norm: [], rgb: [], indices: [] };
  const textures = new Map(),
    nodes = [];
  for (const root of scene.listChildren())
    root.traverse((node) => {
      if (node.getMesh()) nodes.push(node);
    });
  for (const node of nodes) {
    const world = node.getWorldMatrix(),
      skin = node.getSkin();
    const palette = skin
      ?.listJoints()
      .map((j, i) =>
        product(
          j.getWorldMatrix(),
          skin.getInverseBindMatrices().getElement(i, []),
        ),
      );
    for (const prim of node.getMesh().listPrimitives()) {
      if (
        prim.getMode() !== 4 ||
        !prim.getIndices() ||
        node.getWeights().some(Boolean) ||
        node.getMesh().getWeights().some(Boolean) ||
        prim.getAttribute("WEIGHTS_1")
      )
        throw Error("Unsupported primitive");
      const pos = prim.getAttribute("POSITION"),
        norm = prim.getAttribute("NORMAL"),
        uv = prim.getAttribute("TEXCOORD_0");
      const joints = prim.getAttribute("JOINTS_0"),
        weights = prim.getAttribute("WEIGHTS_0");
      const sample = await materialSampler(prim.getMaterial(), textures);
      const offset = out.pos.length / 3;
      for (let i = 0; i < pos.getCount(); i++) {
        const m = palette
          ? vertexMatrix(
              palette,
              joints.getElement(i, []),
              weights.getElement(i, []),
            )
          : world;
        pushVertex(out, m, pos.getElement(i, []), norm.getElement(i, []));
        out.rgb.push(...sample(uv?.getElement(i, [])));
      }
      for (const index of prim.getIndices().getArray())
        out.indices.push(offset + index);
    }
  }
  return out;
}

function reduce(name, source) {
  const pos = Float32Array.from(source.pos),
    rgb = Float32Array.from(source.rgb);
  // Lock the six extreme points, including feet, tail and head. Color-aware
  // collapse keeps texture/material transitions; prune tiny disconnected trim.
  const lock = new Uint8Array(pos.length / 3);
  const bounds = [];
  for (const k of axes) {
    let lo = 0,
      hi = 0;
    for (let i = 1; i < lock.length; i++) {
      if (pos[i * 3 + k] < pos[lo * 3 + k]) lo = i;
      if (pos[i * 3 + k] > pos[hi * 3 + k]) hi = i;
    }
    lock[lo] = lock[hi] = 1;
    bounds.push([pos[lo * 3 + k], pos[hi * 3 + k]]);
  }
  const ib = Uint32Array.from(source.indices);
  // Join numerically split skinning seams before simplification (sub-mm grid).
  for (let i = 0; i < pos.length; i++)
    pos[i] = Math.round(pos[i] * 2000) / 2000;
  // The winter raptor has a broad coat with free edges and thin plumage.
  // Use the measured silhouette budget rather than flattening that outfit.
  const budget =
    name === "R03_Velociraptor_v2"
      ? 2400
      : name.startsWith("SPINO")
        ? 576
        : 1000;
  const [count] = MeshoptSimplifier.simplifyWithUpdate(
    ib,
    pos,
    3,
    rgb,
    3,
    [0.025, 0.025, 0.025],
    lock,
    3 * budget,
    1,
    ["Permissive", "Prune"],
  );
  const indices = ib.subarray(0, count);
  const doc = new Document(),
    buf = doc.createBuffer();
  const attr = (type, array) =>
    doc.createAccessor().setType(type).setArray(array).setBuffer(buf);
  const remap = new Map(),
    p = [],
    n = [],
    c = [];
  const ids = Uint16Array.from(indices, (old) => {
    if (!remap.has(old)) {
      remap.set(old, remap.size);
      for (const k of axes) {
        p.push(
          Math.max(bounds[k][0], Math.min(bounds[k][1], pos[old * 3 + k])),
        );
        n.push(source.norm[old * 3 + k]);
        c.push(Math.max(0, Math.min(255, Math.round(rgb[old * 3 + k] * 255))));
      }
      c.push(255);
    }
    return remap.get(old);
  });
  const mat = doc
    .createMaterial("Baked albedo")
    .setMetallicFactor(0)
    .setRoughnessFactor(0.92)
    .setDoubleSided(true);
  const prim = doc
    .createPrimitive()
    .setIndices(attr("SCALAR", ids))
    .setMaterial(mat)
    .setAttribute("POSITION", attr("VEC3", Float32Array.from(p)))
    .setAttribute("NORMAL", attr("VEC3", Float32Array.from(n)))
    .setAttribute(
      "COLOR_0",
      attr("VEC4", Uint8Array.from(c)).setNormalized(true),
    );
  doc
    .createScene()
    .addChild(
      doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)),
    );
  return doc;
}

if (import.meta.main) {
  if (process.argv.slice(2).some((arg) => arg !== "--check"))
    throw Error("Usage: node art/residents/generate-crowd.mjs [--check]");
  const check = process.argv.includes("--check");
  await Promise.all([MeshoptDecoder.ready, MeshoptSimplifier.ready]);
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  if (!check) await mkdir(path.join(dir, "crowd"), { recursive: true });
  for (const base of [
    "R02_Triceratops",
    "R03_Velociraptor",
    "SPINO_Spinosaurus",
  ])
    for (const suffix of ["", "_v2"]) {
      const name = base + suffix,
        file = `${name}.glb`,
        dst = path.join(dir, "crowd", file);
      const source = await flatten(
        (await io.read(path.join(dir, file))).getRoot().listScenes()[0],
      );
      const doc = reduce(name, source),
        bytes = await io.writeBinary(doc);
      if (check) {
        if (!(await readFile(dst)).equals(bytes)) throw Error(`Stale: ${file}`);
      } else await writeFile(dst, bytes);
      console.log(
        `${file}: ${source.indices.length / 3} -> ${doc.getRoot().listMeshes()[0].listPrimitives()[0].getIndices().getCount() / 3} triangles, ${bytes.length} bytes${check ? " (identical)" : ""}`,
      );
    }
}
