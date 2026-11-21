# 공룡 컨셉 시트 아래 재질 견본 6칸 → 이음새 없는 512 텍스처(색 + 굴곡)
# 칸 순서(10종 공통): 누빔 · 털 · 뜨개 · 짚 · 피부 · 등불
# 사용: blender -b --python tex.py -- <컨셉 폴더> <저장 폴더>
import bpy, sys, os
import numpy as np

src_dir, out_dir = sys.argv[sys.argv.index("--") + 1:][:2]
NAMES = ["quilt", "fur", "knit", "straw", "skin", "lamp"]
N = 256  # 게임에서 공룡은 화면에 40~80px — 256이면 충분, 10종 합쳐 2MB 안쪽


def load(path):
    im = bpy.data.images.load(path)
    w, h = im.size
    a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1, :, :3]  # 위→아래
    bpy.data.images.remove(im)
    return a


def save(a, path):
    h, w = a.shape[:2]
    im = bpy.data.images.new("o", w, h, alpha=False)
    rgba = np.concatenate([a[::-1], np.ones((h, w, 1), np.float32)], axis=2)
    im.pixels[:] = rgba.ravel()
    im.filepath_raw = path
    im.file_format = "JPEG"
    bpy.context.scene.render.image_settings.quality = 90
    im.save()
    bpy.data.images.remove(im)


def runs(mask, min_len):
    out, start = [], None
    for i, m in enumerate(list(mask) + [False]):
        if m and start is None:
            start = i
        elif not m and start is not None:
            if i - start >= min_len:
                out.append((start, i))
            start = None
    return out


def find_swatches(a):
    h, w = a.shape[:2]
    y0 = int(h * 0.68)
    low = a[y0:]
    bg = np.median(a[int(h * 0.97):, :, :], axis=(0, 1))
    diff = np.abs(low - bg).sum(axis=2) > 0.12
    cols = runs(diff.mean(axis=0) > 0.35, w // 20)
    boxes = []
    for x0, x1 in cols:
        rows = runs(diff[:, x0:x1].mean(axis=1) > 0.5, h // 20)
        r = max(rows, key=lambda r: r[1] - r[0])
        boxes.append((x0, y0 + r[0], x1, y0 + r[1]))
    return boxes


def resize(a, n):
    h, w = a.shape[:2]
    ys = (np.arange(n) + 0.5) * h / n - 0.5
    xs = (np.arange(n) + 0.5) * w / n - 0.5
    y0 = np.clip(np.floor(ys).astype(int), 0, h - 1); y1 = np.clip(y0 + 1, 0, h - 1); fy = (ys - y0)[:, None, None]
    x0 = np.clip(np.floor(xs).astype(int), 0, w - 1); x1 = np.clip(x0 + 1, 0, w - 1); fx = (xs - x0)[None, :, None]
    t = a[y0][:, x0] * (1 - fx) + a[y0][:, x1] * fx
    b = a[y1][:, x0] * (1 - fx) + a[y1][:, x1] * fx
    return t * (1 - fy) + b * fy


def seamless(a):
    """반 칸 밀어 겹치기: 가장자리는 밀린 그림(가운데가 오는 곳)으로 덮어 이음새를 없앰"""
    n = a.shape[0]
    shifted = np.roll(np.roll(a, n // 2, 0), n // 2, 1)
    t = 1 - np.abs(np.linspace(-1, 1, n))  # 가운데 1, 가장자리 0
    s = np.clip(t / 0.5, 0, 1)
    s = s * s * (3 - 2 * s)  # 부드러운 계단
    wgt = (s[:, None] * s[None, :])[..., None]
    return a * wgt + shifted * (1 - wgt)


def normal(a, strength=2.5):
    g = a.mean(axis=2)
    gx = (np.roll(g, -1, 1) - np.roll(g, 1, 1)) * strength
    gy = (np.roll(g, -1, 0) - np.roll(g, 1, 0)) * strength
    nz = np.ones_like(g)
    l = np.sqrt(gx * gx + gy * gy + nz * nz)
    return np.stack([(-gx / l) * 0.5 + 0.5, (gy / l) * 0.5 + 0.5, nz / l * 0.5 + 0.5], axis=2)


for f in sorted(os.listdir(src_dir)):
    if not f.startswith("R") or not f.endswith(".png"):
        continue
    sp = f[:-4]
    a = load(os.path.join(src_dir, f))
    boxes = find_swatches(a)
    print("SHEET", sp, a.shape[:2], boxes)
    if len(boxes) != 6:
        print("  !! 칸 수가 6이 아님 — 건너뜀")
        continue
    os.makedirs(os.path.join(out_dir, sp), exist_ok=True)
    for name, (x0, y0, x1, y1) in zip(NAMES, boxes):
        s = (x1 - x0)
        ix = int(s * 0.06)
        # 위쪽 28%는 눈 얹힌 부분이라 버림(등불은 통째로)
        top = y0 + (int((y1 - y0) * 0.28) if name != "lamp" else ix)
        crop = a[top:y1 - ix, x0 + ix:x1 - ix]
        side = min(crop.shape[:2])
        crop = crop[:side, :side]
        img = resize(crop, N)
        if name != "lamp":
            img = seamless(img)
        save(np.clip(img, 0, 1), os.path.join(out_dir, sp, name + ".jpg"))
        if name != "lamp":
            save(normal(img), os.path.join(out_dir, sp, name + "_n.jpg"))
print("TEX_DONE")
