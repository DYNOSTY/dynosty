import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { Scene } from "@babylonjs/core/scene";
import { installMeshoptDecoder } from "./meshopt.js";

// GLB 자산은 생성한 Scene에 속한다. StrictMode 재기동에서 공유하지 않는다.
const caches = new WeakMap<Scene, Map<string, Promise<AssetContainer>>>();
export function loadSceneAsset(scene: Scene, url: string) {
  if (scene.isDisposed) return Promise.reject(new Error("종료한 장면입니다."));
  let cache = caches.get(scene);
  if (!cache) {
    cache = new Map();
    caches.set(scene, cache);
    const owned = cache;
    scene.onDisposeObservable.addOnce(() => {
      for (const pending of owned.values())
        void pending.then((asset) => asset.dispose()).catch(() => {});
      owned.clear();
      caches.delete(scene);
    });
  }
  let pending = cache.get(url);
  if (!pending) {
    installMeshoptDecoder();
    pending = LoadAssetContainerAsync(url, scene).then((asset) => {
      if (scene.isDisposed) {
        asset.dispose();
        throw new Error("모델을 불러오는 동안 장면이 종료되었습니다.");
      }
      // The container is only a template. The loader starts its first clip,
      // but visible actors play independently instantiated animation groups.
      for (const group of asset.animationGroups) group.stop();
      return asset;
    });
    cache.set(url, pending);
    const owned = cache;
    void pending.catch(() => {
      if (owned.get(url) === pending) owned.delete(url);
    });
  }
  return pending;
}
