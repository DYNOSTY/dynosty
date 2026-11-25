// Run from the repository root: node --test art/residents/crowd-models.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

// Independent reference: transform the point into each joint's space and back,
// then blend points (the generator instead blends precomputed matrices).
function geometry(scene) {
  const points = [],
    triangles = [];
  const apply = (m, p) =>
    [0, 1, 2].map(
      (axis) =>
        m[12 + axis] + p.reduce((s, v, i) => s + m[i * 4 + axis] * v, 0),
    );
  for (const root of scene.listChildren())
    root.traverse((node) => {
      const skin = node.getSkin(),
        world = node.getWorldMatrix();
      const joints = skin
        ?.listJoints()
        .map((joint, i) => [
          skin.getInverseBindMatrices().getElement(i, []),
          joint.getWorldMatrix(),
        ]);
      for (const prim of node.getMesh()?.listPrimitives() ?? []) {
        const offset = points.length,
          pos = prim.getAttribute("POSITION");
        for (let i = 0; i < pos.getCount(); i++) {
          const p = pos.getElement(i, []);
          if (!skin) {
            points.push(apply(world, p));
            continue;
          }
          const weights = prim.getAttribute("WEIGHTS_0").getElement(i, []),
            indices = prim.getAttribute("JOINTS_0").getElement(i, []);
          const q = [0, 0, 0],
            total = weights.reduce((a, b) => a + b, 0);
          weights.forEach((w, k) => {
            if (w) {
              const [bind, global] = joints[indices[k]];
              apply(global, apply(bind, p)).forEach((v, a) => {
                q[a] += (w * v) / total;
              });
            }
          });
          points.push(q);
        }
        for (const i of prim.getIndices().getArray())
          triangles.push(i + offset);
      }
    });
  return { points, triangles };
}

// Orthographic occupancy at crowd scale; both meshes use the source camera.
const size = 96;
function raster(points, indices, xmin, ymin, scale) {
  const screen = points.map(([x, y]) => [
    (x - xmin) * scale + 2,
    (y - ymin) * scale + 2,
  ]);
  const mask = new Uint8Array(size * size);
  const edge = ([x, y], b, px, py) =>
    (b[0] - x) * (py - y) - (b[1] - y) * (px - x);
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [
      screen[indices[i]],
      screen[indices[i + 1]],
      screen[indices[i + 2]],
    ];
    const sign = Math.sign(edge(a, b, ...c));
    if (!sign) continue;
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))),
      x1 = Math.min(size, Math.ceil(Math.max(a[0], b[0], c[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))),
      y1 = Math.min(size, Math.ceil(Math.max(a[1], b[1], c[1])));
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++)
        if (
          sign * edge(a, b, x + 0.5, y + 0.5) >= 0 &&
          sign * edge(b, c, x + 0.5, y + 0.5) >= 0 &&
          sign * edge(c, a, x + 0.5, y + 0.5) >= 0
        )
          mask[y * size + x] = 1;
  }
  return mask;
}
function range(points, k) {
  const vals = points.map((p) => p[k]);
  return [Math.min(...vals), Math.max(...vals)];
}
function overlap(source, crowd, project) {
  const a = source.points.map(project),
    b = crowd.points.map(project);
  const [x, X] = range(a, 0),
    [y, Y] = range(a, 1),
    scale = (size - 4) / Math.max(X - x, Y - y);
  const m = raster(a, source.triangles, x, y, scale),
    n = raster(b, crowd.triangles, x, y, scale);
  let union = 0,
    intersection = 0;
  for (let i = 0; i < m.length; i++) {
    union += m[i] | n[i];
    intersection += m[i] & n[i];
  }
  return intersection / union;
}

const assets = new URL(
  "../../apps/web/public/models/residents/",
  import.meta.url,
);
const names = [
  "R02_Triceratops",
  "R03_Velociraptor",
  "SPINO_Spinosaurus",
].flatMap((base) => [base, `${base}_v2`]);
for (const name of names) {
  test(`${name}: static, colored, indexed crowd mesh`, async () => {
    const bytes = await readFile(new URL(`crowd/${name}.glb`, assets));
    const root = (await new NodeIO().readBinary(bytes)).getRoot();
    assert.equal(root.listScenes().length, 1);
    assert.equal(root.listNodes().length, 1);
    assert.equal(root.listMeshes().length, 1);
    assert.equal(root.listMaterials().length, 1);
    assert.equal(
      root.listSkins().length +
        root.listAnimations().length +
        root.listTextures().length,
      0,
    );
    const mesh = root.listScenes()[0].listChildren()[0].getMesh();
    assert.equal(mesh.listPrimitives().length, 1);
    const [prim] = mesh.listPrimitives();
    assert.equal(prim.getMode(), 4);
    assert.equal(prim.getMaterial(), root.listMaterials()[0]);
    const pos = prim.getAttribute("POSITION"),
      color = prim.getAttribute("COLOR_0"),
      normal = prim.getAttribute("NORMAL");
    assert.equal(pos.getCount(), color.getCount());
    assert.equal(pos.getCount(), normal.getCount());
    const palette = new Set();
    for (let i = 0; i < pos.getCount(); i++) {
      assert.ok(pos.getElement(i, []).every(Number.isFinite));
      assert.ok(Math.abs(Math.hypot(...normal.getElement(i, [])) - 1) < 0.002);
      palette.add(color.getElement(i, []).join(","));
    }
    assert.ok(palette.size >= (name.startsWith("SPINO") ? 5 : 32));
    const indices = prim.getIndices().getArray();
    const budget = name === "R03_Velociraptor_v2" ? 2400 : 1024;
    assert.ok(
      indices.length > 0 &&
        indices.length % 3 === 0 &&
        indices.length <= budget * 3,
    );
    assert.ok(indices.every((i) => i < pos.getCount()));
    assert.ok(bytes.length < 96 * 1024);
  });
  test(`${name}: default pose and four crowd-distance views`, async (t) => {
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
    const load = async (file) =>
      geometry(
        (await io.readBinary(await readFile(new URL(file, assets))))
          .getRoot()
          .listScenes()[0],
      );
    const source = await load(`${name}.glb`),
      crowd = await load(`crowd/${name}.glb`);
    const views = [
      ([x, y]) => [x, y],
      ([, y, z]) => [z, y],
      ([x, , z]) => [x, z],
      ([x, y, z]) => [(x - z) / Math.SQRT2, (x + z) * 0.35 + y * 0.87],
    ];
    const scores = views.map((v) => overlap(source, crowd, v));
    const delta = [0, 1, 2].flatMap((k) => {
      const a = range(source.points, k),
        b = range(crowd.points, k);
      return b.map((v, i) => Math.abs(v - a[i]) / (a[1] - a[0]));
    });
    t.diagnostic(
      `IoU ${scores.map((v) => v.toFixed(3)).join("/")} | max relative bound shift ${Math.max(...delta).toFixed(4)} | Y bounds ${range(crowd.points, 1).map((x) => x.toFixed(4))}`,
    );
    assert.ok(
      scores.every((v) => v >= 0.9),
      `silhouette: ${scores}`,
    );
    assert.ok(Math.max(...delta) < 0.025, `bounds: ${delta}`);
  });
}
