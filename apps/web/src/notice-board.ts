import type { ModelAsset, ModelPart } from "./model-assets.js";

const parts: ModelPart[] = [];
type Triple = [number, number, number];
const timber: Triple = [0.34, 0.17, 0.08];
const tile: Triple = [0.18, 0.23, 0.25];
function box(
  name: string,
  size: Triple,
  position: Triple,
  color: Triple,
  rotation: Triple = [0, 0, 0],
) {
  parts.push({ name, shape: "box", size, position, color, rotation });
}
for (const x of [-1.55, 1.55]) {
  box(`stone-foot${x}`, [0.58, 0.45, 0.6], [x, -0.54, 0], [0.44, 0.43, 0.39]);
  box(`pillar${x}`, [0.27, 2.65, 0.28], [x, 0.8, 0], timber);
}
box("notice-panel", [3.05, 1.58, 0.18], [0, 1.12, 0], [0.54, 0.33, 0.15]);
for (const side of [-1, 1]) {
  box(`tiled-eave${side}`, [3.9, 0.13, 0.62], [0, 2.22, side * 0.28], tile, [
    side * 0.32,
    0,
    0,
  ]);
  for (const [i, x] of [-0.94, 0, 0.94].entries()) {
    const y = 1.16 + i * 0.045;
    box(
      `hanji${side}${i}`,
      [0.72, 1.07, 0.025],
      [x, y, side * 0.11],
      [0.93, 0.86, 0.68],
    );
    box(
      `red-seal${side}${i}`,
      [0.13, 0.13, 0.02],
      [x + 0.19, y - 0.33, side * 0.14],
      [0.56, 0.13, 0.08],
    );
    for (const col of [-0.11, 0.11])
      box(
        `ink${side}${i}${col}`,
        [0.04, 0.42, 0.012],
        [x + col, y + 0.12, side * 0.14],
        [0.22, 0.18, 0.13],
      );
  }
}
box("ridge", [3.95, 0.14, 0.14], [0, 2.37, 0], tile);
export const noticeBoard: ModelAsset = {
  format: "dynosty-model",
  version: 1,
  id: "bokhol-notice-board",
  kind: "building",
  name: "복홀 방 게시판",
  units: "meter",
  origin: "center",
  parts,
};
