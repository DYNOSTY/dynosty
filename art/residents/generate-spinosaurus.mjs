// Editable, deterministic successor-authored model. Metres, +Y up, +Z forward.
// Run from the repository root with the pinned Node and installed dependencies.
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder });

for (const winter of [false, true]) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene("Spinosaurus");
  const mat = (name, color) =>
    doc
      .createMaterial(name)
      .setBaseColorFactor([...color, 1])
      .setMetallicFactor(0)
      .setRoughnessFactor(0.9);
  const skin = mat("moss skin", [0.32, 0.43, 0.36]);
  const sail = mat("rust sail", [0.58, 0.29, 0.19]);
  const cloth = mat("indigo cloth", [0.19, 0.26, 0.3]);
  const trim = mat("flax trim", [0.76, 0.66, 0.44]);
  const dark = mat("eyes", [0.025, 0.035, 0.03]);
  const mantle = mat("winter wool", [0.71, 0.75, 0.72]);
  const root = doc.createNode("body-root");
  scene.addChild(root);
  function ellipsoid(name, pos, size, material, parent = root) {
    const positions = [],
      normals = [],
      indices = [];
    const rows = 12,
      cols = 20;
    for (let y = 0; y <= rows; y++) {
      const a = (Math.PI * y) / rows;
      for (let x = 0; x <= cols; x++) {
        const b = (2 * Math.PI * x) / cols;
        const nx = Math.sin(a) * Math.cos(b),
          ny = Math.cos(a),
          nz = Math.sin(a) * Math.sin(b);
        positions.push(nx * size[0], ny * size[1], nz * size[2]);
        const length = Math.hypot(nx / size[0], ny / size[1], nz / size[2]);
        normals.push(
          nx / size[0] / length,
          ny / size[1] / length,
          nz / size[2] / length,
        );
      }
    }
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const i = y * (cols + 1) + x;
        indices.push(i, i + 1, i + cols + 1, i + 1, i + cols + 2, i + cols + 1);
      }
    const accessor = (type, array) =>
      doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
    const primitive = doc
      .createPrimitive()
      .setAttribute("POSITION", accessor("VEC3", new Float32Array(positions)))
      .setAttribute("NORMAL", accessor("VEC3", new Float32Array(normals)))
      .setIndices(accessor("SCALAR", new Uint16Array(indices)))
      .setMaterial(material);
    const node = doc
      .createNode(name)
      .setTranslation(pos)
      .setMesh(doc.createMesh(name).addPrimitive(primitive));
    parent.addChild(node);
    return node;
  }
  ellipsoid("body", [0, 1.05, 0], [0.46, 0.53, 0.82], skin);
  ellipsoid("work-cloth", [0, 1.06, -0.03], [0.475, 0.54, 0.48], cloth);
  ellipsoid("sash", [0, 1.05, 0.17], [0.485, 0.55, 0.065], trim);
  ellipsoid("high-sail", [0, 1.83, -0.16], [0.09, 0.85, 0.7], sail);
  ellipsoid("neck", [0, 1.35, 0.61], [0.31, 0.42, 0.4], skin);
  ellipsoid("head", [0, 1.56, 0.9], [0.3, 0.27, 0.4], skin);
  ellipsoid("long-snout", [0, 1.49, 1.34], [0.2, 0.15, 0.56], skin);
  ellipsoid("sturdy-tail", [0, 0.98, -1.02], [0.31, 0.34, 0.72], skin);
  ellipsoid("tail-tip", [0, 0.9, -1.58], [0.16, 0.2, 0.48], skin);
  for (const side of [-1, 1]) {
    ellipsoid(
      `eye-${side}`,
      [side * 0.272, 1.67, 1.02],
      [0.045, 0.055, 0.045],
      dark,
    );
    const leg = doc
      .createNode(side < 0 ? "left-leg" : "right-leg")
      .setTranslation([side * 0.31, 0.9, -0.18]);
    root.addChild(leg);
    ellipsoid(`thigh-${side}`, [0, -0.25, 0], [0.2, 0.35, 0.24], skin, leg);
    ellipsoid(`foot-${side}`, [0, -0.73, 0.11], [0.21, 0.13, 0.34], skin, leg);
    ellipsoid(`shin-${side}`, [0, -0.54, 0], [0.14, 0.25, 0.17], skin, leg);
    const arm = doc
      .createNode(side < 0 ? "left-arm" : "right-arm")
      .setTranslation([side * 0.38, 1.28, 0.48]);
    root.addChild(arm);
    ellipsoid(`forearm-${side}`, [0, -0.2, 0.08], [0.1, 0.25, 0.12], skin, arm);
    if (winter)
      ellipsoid(
        `winter-shoulder-${side}`,
        [side * 0.31, 1.46, 0.18],
        [0.23, 0.23, 0.53],
        mantle,
      );
  }
  if (winter)
    ellipsoid("winter-mantle", [0, 1.3, 0.27], [0.5, 0.28, 0.58], mantle);
  const times = doc
    .createAccessor()
    .setType("SCALAR")
    .setArray(new Float32Array([0, 0.5, 1]))
    .setBuffer(buffer);
  const rotation = (angle) => [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)];
  for (const [name, amplitude] of [
    ["Idle", 0.035],
    ["Walk", 0.48],
  ]) {
    const animation = doc.createAnimation(name);
    for (const [nodeName, sign] of [
      ["left-leg", 1],
      ["right-leg", -1],
      ["left-arm", -1],
      ["right-arm", 1],
    ]) {
      const target = doc
        .getRoot()
        .listNodes()
        .find((node) => node.getName() === nodeName);
      const values = doc
        .createAccessor()
        .setType("VEC4")
        .setArray(
          new Float32Array([
            ...rotation(-amplitude * sign),
            ...rotation(amplitude * sign),
            ...rotation(-amplitude * sign),
          ]),
        )
        .setBuffer(buffer);
      const sampler = doc
        .createAnimationSampler()
        .setInput(times)
        .setOutput(values)
        .setInterpolation("LINEAR");
      animation
        .addSampler(sampler)
        .addChannel(
          doc
            .createAnimationChannel()
            .setSampler(sampler)
            .setTargetNode(target)
            .setTargetPath("rotation"),
        );
    }
  }
  await doc.transform(
    dedup(),
    prune({ keepLeaves: true }),
    meshopt({
      encoder: MeshoptEncoder,
      level: "medium",
      quantizationVolume: "scene",
    }),
  );
  await io.write(
    `apps/web/public/models/residents/SPINO_Spinosaurus${winter ? "_v2" : ""}.glb`,
    doc,
  );
}
