import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSceneAsset } from "./scene-assets.js";

const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@babylonjs/core/Loading/sceneLoader", () => ({
  LoadAssetContainerAsync: load,
}));
const engines: NullEngine[] = [];
function world() {
  const engine = new NullEngine();
  engines.push(engine);
  return new Scene(engine);
}
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  vi.clearAllMocks();
});

describe("GLB 자산의 장면 소유권", () => {
  it("같은 장면은 요청을 공유하지만 StrictMode 재기동의 새 장면은 공유하지 않는다", async () => {
    const first = world(),
      second = world();
    const asset1 = { dispose: vi.fn() },
      asset2 = { dispose: vi.fn() };
    load.mockResolvedValueOnce(asset1).mockResolvedValueOnce(asset2);
    const a = loadSceneAsset(first, "/model.glb");
    expect(loadSceneAsset(first, "/model.glb")).toBe(a);
    expect(await a).toBe(asset1);
    first.dispose();
    expect(await loadSceneAsset(second, "/model.glb")).toBe(asset2);
    expect(load).toHaveBeenCalledTimes(2);
    await Promise.resolve();
    expect(asset1.dispose).toHaveBeenCalledOnce();
  });
  it("로딩 중 폐기한 장면은 늦게 도착한 모델을 해제하고 적용하지 않는다", async () => {
    const scene = world();
    let finish!: (asset: AssetContainer) => void;
    load.mockImplementationOnce(
      () =>
        new Promise<AssetContainer>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = loadSceneAsset(scene, "/late.glb");
    scene.dispose();
    const asset = { dispose: vi.fn() };
    finish(asset as unknown as AssetContainer);
    await expect(pending).rejects.toThrow("장면이 종료");
    expect(asset.dispose).toHaveBeenCalledOnce();
    await expect(loadSceneAsset(scene, "/late.glb")).rejects.toThrow(
      "종료한 장면",
    );
    expect(load).toHaveBeenCalledOnce();
  });
  it("실패한 요청을 캐시에 고정하지 않아 같은 장면에서 복구할 수 있다", async () => {
    const scene = world(),
      asset = { dispose: vi.fn() };
    load
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(asset);
    await expect(loadSceneAsset(scene, "/retry.glb")).rejects.toThrow(
      "offline",
    );
    expect(await loadSceneAsset(scene, "/retry.glb")).toBe(asset);
  });
});
