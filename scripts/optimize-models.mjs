// Compresses the game's resident and building GLB models in place with meshopt
// (EXT_meshopt_compression + KHR_mesh_quantization). The browser decodes them with the
// meshopt decoder configured in apps/web/src/meshopt.ts.
// Already compressed files are skipped, so run it again after adding or replacing models:
//   pnpm models:optimize
// Resource-site models stay as authored: their raw POSITION bounds feed the site layout.
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const root = path.resolve(import.meta.dirname, "../apps/web/public/models");
const folders = ["residents", "buildings", "gori"];

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "meshopt.encoder": MeshoptEncoder,
    "meshopt.decoder": MeshoptDecoder,
  });

let before = 0;
let after = 0;
for (const folder of folders) {
  const dir = path.join(root, folder);
  for (const name of (await readdir(dir)).sort()) {
    if (!name.endsWith(".glb")) continue;
    const file = path.join(dir, name);
    const doc = await io.read(file);
    if (
      doc
        .getRoot()
        .listExtensionsUsed()
        .some((e) => e.extensionName === "EXT_meshopt_compression")
    )
      continue;
    const size = (await stat(file)).size;
    // Keep empty leaf nodes: scene code and animations may look nodes up by name.
    await doc.transform(
      dedup(),
      prune({ keepLeaves: true }),
      meshopt({
        encoder: MeshoptEncoder,
        level: "medium",
        quantizationVolume: "scene",
      }),
    );
    await io.write(file, doc);
    const next = (await stat(file)).size;
    before += size;
    after += next;
    console.log(
      `${folder}/${name}: ${(size / 1e6).toFixed(2)} → ${(next / 1e6).toFixed(2)} MB`,
    );
  }
}
console.log(
  before
    ? `total ${(before / 1e6).toFixed(1)} → ${(after / 1e6).toFixed(1)} MB`
    : "모든 모델이 이미 압축되어 있습니다.",
);
