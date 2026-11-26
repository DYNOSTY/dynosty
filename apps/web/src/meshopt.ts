// Resident and building GLBs are meshopt-compressed (scripts/optimize-models.mjs).
// Babylon fetches its meshopt decoder from the Babylon CDN by default, which the offline
// portable build cannot reach. The decoder ships in the bundle instead: it is published
// as the global Babylon expects, and the script URL Babylon loads is an empty local one.
import { MeshoptCompression } from "@babylonjs/core/Meshes/Compression/meshoptCompression";
import { MeshoptDecoder } from "meshoptimizer/decoder";

let ready = false;
export function installMeshoptDecoder() {
  if (ready) return;
  ready = true;
  Object.assign(globalThis, { MeshoptDecoder });
  MeshoptCompression.Configuration = {
    decoder: {
      url: URL.createObjectURL(new Blob([""], { type: "text/javascript" })),
    },
  };
}
