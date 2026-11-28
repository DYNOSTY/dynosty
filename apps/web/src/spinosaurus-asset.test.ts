import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function must<T>(value: T | null | undefined, what: string): T {
  if (value == null) throw new Error(`missing ${what}`);
  return value;
}

function glb(name: string) {
  const data = readFileSync(
    new URL(`../public/models/residents/${name}.glb`, import.meta.url),
  );
  return JSON.parse(
    data.subarray(20, 20 + data.readUInt32LE(12)).toString("utf8"),
  );
}

describe("후속 제작 스피노사우루스", () => {
  it.each(["SPINO_Spinosaurus", "SPINO_Spinosaurus_v2"])(
    "%s 상세 모델의 모든 재질은 비금속이다",
    (name) => {
      const { materials } = glb(name);
      expect(materials.length).toBeGreaterThan(0);
      for (const material of materials) {
        expect(
          material.pbrMetallicRoughness?.metallicFactor ?? 1,
          material.name,
        ).toBe(0);
      }
    },
  );
  it.each(["SPINO_Spinosaurus", "SPINO_Spinosaurus_v2"])(
    "%s에 고유 형상과 움직이는 팔다리가 있다",
    (name) => {
      const model = glb(name);
      const names = model.nodes.map((node: { name?: string }) => node.name);
      expect(names).toEqual(
        expect.arrayContaining([
          "long-snout",
          "high-sail",
          "sturdy-tail",
          "left-leg",
          "right-leg",
        ]),
      );
      for (const clip of ["Idle", "Walk"]) {
        const animation = model.animations.find(
          (entry: { name: string }) => entry.name === clip,
        );
        expect(animation).toBeDefined();
        const targets = animation.channels.map(
          (channel: { target: { node: number } }) => names[channel.target.node],
        );
        expect(targets).toEqual(
          expect.arrayContaining(["left-leg", "right-leg"]),
        );
      }
      expect(names.includes("winter-mantle")).toBe(name.endsWith("_v2"));
      expect(model.extensionsUsed).toContain("EXT_meshopt_compression");
    },
  );
});

it("스피노 표면의 삼각형 방향은 바깥 법선과 일치한다", async () => {
  const { NodeIO } = await import("@gltf-transform/core");
  const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
  const { MeshoptDecoder } = await import("meshoptimizer");
  await MeshoptDecoder.ready;
  const doc = await new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder })
    .read(
      fileURLToPath(
        new URL(
          "../public/models/residents/SPINO_Spinosaurus.glb",
          import.meta.url,
        ),
      ),
    );
  const body = must(
    doc
      .getRoot()
      .listNodes()
      .find((node) => node.getName() === "body"),
    "body node",
  );
  const primitive = must(
    must(body.getMesh(), "body mesh").listPrimitives()[0],
    "body primitive",
  );
  const positions = must(
    must(primitive.getAttribute("POSITION"), "position attribute").getArray(),
    "positions",
  );
  const normals = must(
    must(primitive.getAttribute("NORMAL"), "normal attribute").getArray(),
    "normals",
  );
  const indices = must(
    must(primitive.getIndices(), "index accessor").getArray(),
    "indices",
  );
  let checked = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = must(indices[i], "index a") * 3;
    const b = must(indices[i + 1], "index b") * 3;
    const c = must(indices[i + 2], "index c") * 3;
    const u = [0, 1, 2].map(
      (j) =>
        must(positions[b + j], "position b") -
        must(positions[a + j], "position a"),
    );
    const v = [0, 1, 2].map(
      (j) =>
        must(positions[c + j], "position c") -
        must(positions[a + j], "position a"),
    );
    const cross = [
      must(u[1], "u1") * must(v[2], "v2") - must(u[2], "u2") * must(v[1], "v1"),
      must(u[2], "u2") * must(v[0], "v0") - must(u[0], "u0") * must(v[2], "v2"),
      must(u[0], "u0") * must(v[1], "v1") - must(u[1], "u1") * must(v[0], "v0"),
    ];
    if (Math.hypot(...cross) < 1e-7) continue;
    expect(
      must(cross[0], "cross 0") * must(normals[a], "normal 0") +
        must(cross[1], "cross 1") * must(normals[a + 1], "normal 1") +
        must(cross[2], "cross 2") * must(normals[a + 2], "normal 2"),
    ).toBeGreaterThan(0);
    checked++;
  }
  expect(checked).toBeGreaterThan(100);
});

it.each(["SPINO_Spinosaurus", "SPINO_Spinosaurus_v2"])(
  "%s의 걷기는 대기보다 다리를 크게 움직인다",
  async (name) => {
    const { NodeIO } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
    const { MeshoptDecoder } = await import("meshoptimizer");
    await MeshoptDecoder.ready;
    const doc = await new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ "meshopt.decoder": MeshoptDecoder })
      .read(
        fileURLToPath(
          new URL(`../public/models/residents/${name}.glb`, import.meta.url),
        ),
      );
    const swing = (clip: string) => {
      const animation = doc
        .getRoot()
        .listAnimations()
        .find((item) => item.getName() === clip);
      const channel = animation
        ?.listChannels()
        .find((item) => item.getTargetNode()?.getName() === "left-leg");
      const values = channel?.getSampler()?.getOutput()?.getArray();
      if (!values || values.length < 8)
        throw new Error(`Missing ${clip} limb animation`);
      return Math.abs(Number(values[0]) - Number(values[4]));
    };
    expect(swing("Idle")).toBeGreaterThan(0);
    expect(swing("Walk")).toBeGreaterThan(swing("Idle") * 5);
  },
);
