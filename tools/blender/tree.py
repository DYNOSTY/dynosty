# 숲 나무 5종 (2026-11-19, 컨셉 dynosty-art/tree/tree_sheet.png · 사용자 "색 눌러서 깎자")
# 눈 쌓인 전나무 · 눈 더미에 묻힌 어린 전나무 · 기운 적송 · 쓰러진 적송 · 도끼 자국 그루터기+장작 두 쪽
# 숲에 수백 그루가 서므로 덩어리는 굵고 면은 적게(낮은 다각형 + 면마다 평면 음영), 색은 한 단계 눌러 차갑게
# 사용: blender -b --python tree.py -- <저장 폴더> <미리보기.png>
import bpy, bmesh, sys, math, random
from mathutils import Vector, Matrix, noise

out_dir, preview = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, rgb, rough=0.9):
    m = bpy.data.materials.new(name)
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    m.diffuse_color = (*rgb, 1)
    return m


# 색은 컨셉보다 한 단계 눌러 차갑게 (밤 마을에서도 초록이 검게 죽지 않을 만큼만 남김)
MATS = [
    mat("tree_bark_red", (0.30, 0.15, 0.10)),  # 0 적송 껍질 (컨셉의 쨍한 주홍 → 눌린 적갈)
    mat("tree_bark", (0.20, 0.14, 0.11)),  # 1 전나무 줄기
    mat("tree_needle", (0.09, 0.22, 0.16)),  # 2 잎
    mat("tree_needle_dark", (0.05, 0.13, 0.10)),  # 3 잎 아랫면
    mat("tree_snow", (0.78, 0.84, 0.93), 0.95),  # 4 눈 (살짝 푸른 흰색)
    mat("tree_grain", (0.58, 0.44, 0.30), 0.85),  # 5 단면 나이테
]
BARK_RED, BARK, NEEDLE, NEEDLE_DARK, SNOW, GRAIN = range(6)


def new_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in MATS:
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = False
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    return o


def ring(bm, center, r, segs, z, rot=0.0, jitter=0.0, seed=0, sx=1.0, sy=1.0):
    vs = []
    for i in range(segs):
        a = rot + 2 * math.pi * i / segs
        k = 1 + jitter * noise.noise(Vector((math.cos(a) * 3 + seed, math.sin(a) * 3, z * 2)))
        vs.append(bm.verts.new((center.x + math.cos(a) * r * k * sx, center.y + math.sin(a) * r * k * sy, z)))
    return vs


def bridge(bm, a, b, m):
    n = len(a)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i])).material_index = m


def fan(bm, loop, c, m, flip=False):
    n = len(loop)
    for i in range(n):
        j = (i + 1) % n
        f = (loop[j], loop[i], c) if flip else (loop[i], loop[j], c)
        bm.faces.new(f).material_index = m


def tube(bm, pts, radii, segs, m, cap_top=True, cap_bottom=False):
    """점들을 잇는 원통 (줄기·가지). 면 수를 아끼려고 마디 사이는 한 칸"""
    loops = []
    side = None  # 고리 방향을 앞 마디에서 이어받아(평행 이동) 줄기가 꼬이지 않게
    for k, (p, r) in enumerate(zip(pts, radii)):
        d = (pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]).normalized()
        if side is None:
            side = d.cross(Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0)))
        else:
            side = side - d * side.dot(d)
        side.normalize()
        up = d.cross(side)
        loop = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            groove = 1 + 0.08 * math.sin(a * 5 + k)
            v = (side * math.cos(a) + up * math.sin(a)) * r * groove
            loop.append(bm.verts.new(p + v))
        loops.append(loop)
    for a, b in zip(loops, loops[1:]):
        bridge(bm, a, b, m)
    if cap_top:
        fan(bm, loops[-1], bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * radii[-1] * 0.3), m)
    if cap_bottom:
        fan(bm, loops[0], bm.verts.new(pts[0]), m, flip=True)
    return loops


def blob(bm, center, size, m, seed, subdiv=1, cut_below=None):
    """뭉친 덩어리 (잎 뭉치·눈 덩이): 찌그러진 이코구 + 잡음. cut_below면 그 높이 아래를 눌러 납작하게"""
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=subdiv, radius=1.0)
    vmap = {}
    for v in tmp.verts:
        p = v.co.copy()
        n = 1 + 0.18 * noise.noise(p * 1.7 + Vector((seed, seed * 0.3, 0)))
        w = Vector((p.x * size.x * n, p.y * size.y * n, p.z * size.z * n)) + center
        if cut_below is not None and w.z < cut_below:
            w.z = cut_below + (w.z - cut_below) * 0.15
        vmap[v] = bm.verts.new(w)
    for f in tmp.faces:
        bm.faces.new([vmap[v] for v in f.verts]).material_index = m
    tmp.free()


# ── 전나무: 처진 별 모양 가지 층 + 층마다 둥근 눈 덮개 ──
def fir(name, tiers=7, height=4.6, base_r=1.55, seed=1, drift=False):
    random.seed(seed)
    bm = bmesh.new()
    tube(bm, [Vector((0, 0, -0.1)), Vector((0, 0, 0.9))], [0.17, 0.12], 7, BARK, cap_top=False)
    for k in range(tiers):
        t = k / tiers
        z = 0.65 + t * height * 0.82
        rb = base_r * (1 - t * 0.8) + 0.15
        h = 0.95 * (1 - t * 0.3)
        rot = random.random() * math.pi
        segs = 12
        # 잎 치마: 가지 끝(짝수)은 멀리·아래로, 사이(홀수)는 안쪽
        low = []
        for i in range(segs):
            a = rot + 2 * math.pi * i / segs
            tip = i % 2 == 0
            r = rb * (1.0 if tip else 0.7) * (1 + random.uniform(-0.06, 0.06))
            low.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, z - (0.32 * h if tip else 0.0))))
        top = ring(bm, Vector((0, 0, 0)), rb * 0.16, segs, z + h, rot)
        bridge(bm, low, top, NEEDLE)
        fan(bm, low, bm.verts.new((0, 0, z + 0.12 * h)), NEEDLE_DARK, flip=True)  # 아랫면 (밑에서 볼 때 비지 않게)
        # 눈 덮개: 치마보다 조금 작은 별 + 가운데로 둥글게 솟음, 가지 끝에 살짝 흘러내림
        s_low, s_mid = [], []
        for i in range(segs):
            a = rot + 2 * math.pi * i / segs
            tip = i % 2 == 0
            r = rb * (0.74 if tip else 0.5)
            s_low.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, z + (0.2 if tip else 0.3) * h)))
            rm = rb * 0.42
            s_mid.append(bm.verts.new((math.cos(a) * rm, math.sin(a) * rm, z + 0.62 * h)))
        bridge(bm, s_low, s_mid, SNOW)
        s_top = ring(bm, Vector((0, 0, 0)), rb * 0.2, segs, z + 0.95 * h, rot)
        bridge(bm, s_mid, s_top, SNOW)
        fan(bm, s_top, bm.verts.new((0, 0, z + h * 1.02)), SNOW)
    # 꼭대기 눈 뾰족
    zt = 0.65 + height * 0.82 + 0.6
    cap = ring(bm, Vector((0, 0, 0)), 0.22, 6, zt - 0.45)
    fan(bm, cap, bm.verts.new((0, 0, zt - 0.05)), SNOW)
    if drift:  # 눈 더미에 묻힌 아랫도리
        blob(bm, Vector((0, 0, 0.0)), Vector((1.25, 1.1, 0.55)), SNOW, seed + 7, subdiv=2, cut_below=0.0)
    return new_obj(name, bm)


# ── 적송: 기운 붉은 줄기, 위쪽 절반에만 우산처럼 퍼진 잎 뭉치, 뭉치마다 눈 ──
def pine_parts(seed=3):
    """줄기 점들과 가지(시작·끝·뭉치 크기)를 돌려줌 — 서 있는 것과 쓰러진 것이 같이 씀"""
    random.seed(seed)
    trunk = []
    for k in range(7):
        t = k / 6
        trunk.append(Vector((0.55 * math.sin(t * 3.0) - 0.25 * t, 0.15 * math.sin(t * 3.6), t * 4.3)))
    radii = [0.24 - 0.15 * (k / 6) for k in range(7)]
    branches = []
    for k, (t, a, ln, sz) in enumerate(((0.52, 2.6, 1.25, 0.85), (0.62, -0.4, 1.1, 0.8), (0.72, 1.4, 1.0, 0.75), (0.82, -2.2, 0.9, 0.7), (0.9, 0.6, 0.7, 0.65))):
        i = t * 6
        p = trunk[int(i)].lerp(trunk[min(int(i) + 1, 6)], i - int(i))
        end = p + Vector((math.cos(a) * ln, math.sin(a) * ln * 0.8, 0.35 + 0.15 * random.random()))
        branches.append((p, end, sz))
    branches.append((trunk[-1], trunk[-1] + Vector((0.05, 0, 0.25)), 0.8))  # 꼭대기 뭉치
    return trunk, radii, branches


def needle_cluster(bm, c, sz, seed):
    """잎 뭉치 = 덩어리 셋이 뭉친 구름, 위에 둥근 눈 방석 (눈은 늘 하늘 쪽, 아랫도리 초록은 보이게)"""
    rnd = random.Random(seed)
    for k in range(3):
        a = k * 2.1 + rnd.random()
        off = Vector((math.cos(a) * sz * 0.42, math.sin(a) * sz * 0.36, rnd.uniform(-0.05, 0.08) * sz))
        blob(bm, c + off, Vector((sz * 0.62, sz * 0.55, sz * 0.4)), NEEDLE, seed + k)
    blob(bm, c + Vector((0, 0, sz * 0.26)), Vector((sz * 0.82, sz * 0.72, sz * 0.26)), SNOW, seed + 50, subdiv=2, cut_below=c.z + sz * 0.16)


def red_pine(name, seed=3):
    bm = bmesh.new()
    trunk, radii, branches = pine_parts(seed)
    tube(bm, trunk, radii, 8, BARK_RED)
    for k, (p, end, sz) in enumerate(branches[:-1]):
        mid = p.lerp(end, 0.5) + Vector((0, 0, 0.18))
        tube(bm, [p, mid, end], [0.075, 0.055, 0.035], 5, BARK_RED)
    for k, (p, end, sz) in enumerate(branches):
        needle_cluster(bm, end, sz, seed * 10 + k)
    blob(bm, Vector((0, 0, 0.0)), Vector((0.6, 0.55, 0.16)), SNOW, seed + 99, cut_below=0.0)  # 밑동 눈
    return new_obj(name, bm)


def fallen_pine(name, seed=3):
    """같은 적송을 옆으로 눕힘: 줄기·가지는 돌리고, 잎 뭉치와 눈은 눕힌 자리에서 다시 위를 보게 쌓음.
    밑동 끝은 잘린 단면(나이테)"""
    bm = bmesh.new()
    trunk, radii, branches = pine_parts(seed)
    rot = Matrix.Rotation(math.radians(86), 4, "Y")
    lift = Vector((0, 0, 0.22))
    T = [rot @ p + lift for p in trunk]
    loops = tube(bm, T, radii, 8, BARK_RED, cap_top=True)
    fan(bm, loops[0], bm.verts.new(T[0] + Vector((-0.02, 0, 0))), GRAIN, flip=True)  # 잘린 면
    for k, (p, end, sz) in enumerate(branches[:-1]):
        # 누운 나무의 가지는 땅 쪽으로 퍼짐: 수평 방향만 살리고 높이는 낮게
        a, b = rot @ p + lift, rot @ end + lift
        flat = Vector((b.x - a.x, b.y - a.y, 0))
        if flat.length < 0.2:
            flat = Vector((0, 1 if k % 2 else -1, 0))
        flat.normalize()
        if k == 1:  # 부러진 가지 하나는 짧은 그루만
            tube(bm, [a, a + flat * 0.35 + Vector((0, 0, 0.15))], [0.06, 0.035], 5, BARK_RED)
            continue
        c = a + flat * (0.55 + sz * 0.5)
        c.z = sz * 0.32
        tube(bm, [a, c + Vector((0, 0, -sz * 0.1))], [0.065, 0.035], 5, BARK_RED, cap_top=False)
        needle_cluster(bm, c, sz * 0.85, seed * 10 + k)
    # 줄기 위에 얇게 쌓인 눈 몇 덩이 + 땅 눈
    for k in range(3):
        p = T[1 + k * 2] + Vector((0, 0, radii[1 + k * 2] * 0.85))
        blob(bm, p, Vector((0.38, 0.16, 0.06)), SNOW, seed + 200 + k)
    blob(bm, Vector((1.8, 0, 0.0)), Vector((2.4, 0.9, 0.12)), SNOW, seed + 300, cut_below=0.0)
    return new_obj(name, bm)


def stump(name, seed=5):
    """그루터기(도끼 자국이 난 비스듬한 단면) + 쪼갠 장작 두 쪽 + 밑동 눈"""
    random.seed(seed)
    bm = bmesh.new()
    segs = 12
    low = ring(bm, Vector((0, 0, 0)), 0.34, segs, -0.05, jitter=0.08, seed=seed)
    mid = ring(bm, Vector((0, 0, 0)), 0.32, segs, 0.25, jitter=0.08, seed=seed)
    bridge(bm, low, mid, BARK_RED)
    top = []
    for i, v in enumerate(mid):
        a = 2 * math.pi * i / segs
        z = 0.48 + 0.06 * math.cos(a)  # 비스듬히 벤 면
        if i in (2, 3):
            z -= 0.12  # 도끼 자국
        top.append(bm.verts.new((v.co.x * 0.97, v.co.y * 0.97, z)))
    bridge(bm, mid, top, BARK_RED)
    inner = [bm.verts.new((v.co.x * 0.85, v.co.y * 0.85, v.co.z - 0.005)) for v in top]
    bridge(bm, top, inner, BARK_RED)
    fan(bm, inner, bm.verts.new((0.02, 0, 0.47)), GRAIN)
    # 쪼갠 장작 두 쪽: 반원통 (평평한 면 = 나이테)
    for k, (x, y, rz) in enumerate(((0.75, 0.2, 0.3), (0.62, -0.32, -0.5))):
        rmat = Matrix.Rotation(rz, 4, "Z")
        half = 8
        rows = []
        for j in (-0.32, 0.32):
            row = []
            for i in range(half + 1):
                a = math.pi * i / half
                p = Vector((j, math.cos(a) * 0.13, math.sin(a) * 0.13))
                row.append(bm.verts.new(rmat @ p + Vector((x, y, 0.0))))
            rows.append(row)
        for i in range(half):
            bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i])).material_index = BARK_RED
        bm.faces.new(rows[0][::-1] + rows[1]).material_index = GRAIN  # 쪼갠 면 (넓은 다각형 한 장)
        fan(bm, rows[0], bm.verts.new(rmat @ Vector((-0.32, 0, 0.04)) + Vector((x, y, 0))), GRAIN, flip=True)
        fan(bm, rows[1], bm.verts.new(rmat @ Vector((0.32, 0, 0.04)) + Vector((x, y, 0))), GRAIN)
    blob(bm, Vector((0, 0, 0.0)), Vector((0.62, 0.58, 0.14)), SNOW, seed + 9, cut_below=0.0)
    return new_obj(name, bm)


objs = [
    fir("TREE_FIR", seed=1),
    fir("TREE_FIR_YOUNG", tiers=4, height=1.8, base_r=0.85, seed=2, drift=True),
    red_pine("TREE_PINE"),
    fallen_pine("TREE_PINE_FALLEN"),
    stump("TREE_STUMP"),
]
for o in objs:
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.export_scene.gltf(filepath=f"{out_dir}/{o.name}.glb", export_format="GLB", use_selection=True, export_yup=True)
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    print(f"{o.name} tris={tris}")

# 미리보기: 한 줄로 늘어놓고 옆에서
xs = [-9.0, -5.4, -1.8, 2.0, 9.4]
for o, x in zip(objs, xs):
    o.location = (x, 0, 0)
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"
sc.display.shading.color_type = "MATERIAL"
sc.display.shading.light = "STUDIO"
sc.display.shading.show_shadows = True
sc.render.resolution_x, sc.render.resolution_y = 1600, 700
sc.world = bpy.data.worlds.new("w")
sc.world.color = (0.55, 0.56, 0.6)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.data.lens = 34
sc.collection.objects.link(cam)
sc.camera = cam
cam.location = (0.6, -21, 6.0)
cam.rotation_euler = (Vector((0.6, 0, 2.2)) - cam.location).to_track_quat("-Z", "Y").to_euler()
sc.render.filepath = preview
bpy.ops.render.render(write_still=True)
print("TREE_DONE")
