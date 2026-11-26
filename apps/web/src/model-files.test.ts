import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const models = new URL("../public/models/", import.meta.url);
const extensions = (file: URL) => {
  const glb = readFileSync(file);
  const json = JSON.parse(
    glb.subarray(20, 20 + glb.readUInt32LE(12)).toString("utf8"),
  ) as { extensionsUsed?: string[] };
  return json.extensionsUsed ?? [];
};

describe("모델 파일", () => {
  it("주민·건물 GLB는 압축해 둔다(pnpm models:optimize)", () => {
    const loose = ["residents", "buildings"].flatMap((folder) =>
      readdirSync(new URL(`${folder}/`, models))
        .filter((name) => name.endsWith(".glb"))
        .map((name) => `${folder}/${name}`)
        .filter(
          (name) =>
            !extensions(new URL(name, models)).includes(
              "EXT_meshopt_compression",
            ),
        ),
    );
    expect(loose).toEqual([]);
  });
});
