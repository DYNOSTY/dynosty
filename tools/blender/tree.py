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
    mat("tree_needle", (0.045, 0.11, 0.085)),  # 2 잎 — 프로스트펑크처럼 거의 검은 짙은 녹색 (11/20)
    mat("tree_needle_dark", (0.022, 0.055, 0.045)),  # 3 잎 아랫면
    mat("tree_snow", (0.86, 0.9, 0.97), 0.95),  # 4 눈 — 더 하얗게 (대비)
    mat("tree_grain", (0.58, 0.44, 0.30), 0.85),  # 5 단면 나이테
    mat("tree_dead", (0.085, 0.08, 0.09)),  # 6 얼어붙은 고목 (프로스트펑크: 거의 검은 줄기)
]
BARK_RED, BARK, NEEDLE, NEEDLE_DARK, SNOW, GRAIN, DEAD = range(7)


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
def fir(name, tiers=7, height=4.6, base_r=1.55, seed=1, drift=False, segs=12):
    random.seed(seed)
    bm = bmesh.new()
    tube(bm, [Vector((0, 0, -0.1)), Vector((0, 0, 0.9))], [0.17, 0.12], 7, BARK, cap_top=False)
    for k in range(tiers):
        t = k / tiers
        z = 0.65 + t * height * 0.82
        rb = base_r * (1 - t * 0.8) + 0.15
        h = 0.95 * (1 - t * 0.3)
        rot = random.random() * math.pi
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
    else:  # 밑동 눈 더미 — 눈밭에 꽂아 둔 느낌 없이 땅에 붙게 (11/20 숲 점검)
        blob(bm, Vector((0, 0, 0.0)), Vector((base_r * 0.55, base_r * 0.5, 0.22)), SNOW, seed + 7, cut_below=0.0)
    o = new_obj(name, bm)
    soften(o)
    return o


# ── 전나무 v2: 층 = 처진 가지 여러 개 (스킬 dynosty-modeling, 11/20) ──
# 가지 = 지붕 모양 쐐기(가운데 등줄기, 끝으로 가늘어지며 아래로 처짐). 원점 밑동·길이 +Y·위 +Z 로 만들고 줄기 둘레로 돌려 배치.
# 눈 = 가지 등 위에 따로 얹은 얇은 껍질, 끝에서 아래로 늘어진 입술 (위에만 얹은 눈은 부자연스러움)
def frond(bm, base, yaw, length, width, droop, snow=True, seed=0):
    rnd = random.Random(seed)
    R = Matrix.Rotation(yaw, 4, "Z")
    L, W = length * rnd.uniform(0.88, 1.1), width
    def spine(t):  # 처음엔 살짝 들렸다가 끝으로 갈수록 처짐
        return Vector((0, L * t, L * (0.12 * t - droop * t ** 1.7)))
    def P(v):
        return bm.verts.new(base + R @ v)
    secs = []
    for t in (0.0, 0.5):
        c = spine(t)
        w = W * (1 - 0.7 * t)
        h = W * 0.22 * (1 - 0.5 * t)
        secs.append((P(c + Vector((-w, 0, -h * 0.5))), P(c + Vector((0, 0, h))), P(c + Vector((w, 0, -h * 0.5)))))
    tip = P(spine(1.0))
    (l0, r0, q0), (l1, r1, q1) = secs
    for f, m in (((l0, r0, r1, l1), NEEDLE), ((r0, q0, q1, r1), NEEDLE), ((q0, l0, l1, q1), NEEDLE_DARK)):
        bm.faces.new(f).material_index = m
    for f, m in (((l1, r1, tip), NEEDLE), ((r1, q1, tip), NEEDLE), ((q1, l1, tip), NEEDLE_DARK)):
        bm.faces.new(f).material_index = m
    if not snow:
        return
    # 눈 껍질: 등줄기 위 0.05~0.62 구간, 끝은 아래로 늘어진 입술
    # 둥근 눈 쿠션: 단면을 아치(양 가장자리 + 둥근 어깨 둘)로, 두껍게 (컨셉의 소복한 눈)
    th = W * 0.3
    rows = []
    for t in (0.05, 0.5):
        c = spine(t)
        w = W * (1 - 0.7 * t) * 0.8
        h = W * 0.22 * (1 - 0.5 * t)
        rows.append((
            P(c + Vector((-w, 0, -h * 0.3 + th * 0.2))),
            P(c + Vector((-w * 0.4, 0, h + th * 1.1))),
            P(c + Vector((w * 0.4, 0, h + th * 1.1))),
            P(c + Vector((w, 0, -h * 0.3 + th * 0.2))),
        ))
    lip = P(spine(0.7) + Vector((0, 0, -th * 0.9)))
    a, b = rows
    for i in range(3):
        bm.faces.new((a[i], a[i + 1], b[i + 1], b[i])).material_index = SNOW
    for i in range(3):
        bm.faces.new((b[i], b[i + 1], lip)).material_index = SNOW
    bm.faces.new((a[3], a[2], a[1], a[0])).material_index = SNOW


def soften(o, blend=0.65):
    """각진 느낌 줄이기 (사용자 11/20 "너무 각짐, 컨셉은 부드러움"):
    1) 매끈한 음영 + 법선을 나무 전체 모양(세로로 긴 타원) 쪽으로 섞음 → 빛이 나무 전체에 둥글게 흐름
    2) 정점 색: 가지 끝·위쪽은 밝게, 줄기 쪽·아래쪽은 어둡게 (컨셉의 붓 그라데이션), 눈은 덜 어둡게"""
    me = o.data
    zs = [v.co.z for v in me.vertices]
    z0, z1 = min(zs), max(zs)
    hgt = max(0.01, z1 - z0)
    rmax = max(0.01, max(math.hypot(v.co.x, v.co.y) for v in me.vertices))
    for p in me.polygons:
        p.use_smooth = True
    loop_normals = [None] * len(me.loops)
    col = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    for p in me.polygons:
        base = MATS[p.material_index].diffuse_color
        snow = p.material_index == SNOW
        for li in p.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            hz = (v.z - z0) / hgt
            # 세로로 긴 타원 중심에서 바깥으로 향하는 방향
            out = Vector((v.x, v.y, (v.z - (z0 + hgt * 0.42)) * 0.45))
            out = out.normalized() if out.length > 1e-4 else Vector((0, 0, 1))
            n = p.normal.lerp(out, blend)
            if snow:
                n = n.lerp(Vector((0, 0, 1)), 0.35)
            loop_normals[li] = n.normalized()
            rd = min(1.0, math.hypot(v.x, v.y) / (rmax * (1.05 - 0.75 * hz) + 0.2))
            # 잎은 매끈한 음영이 빛 차이를 줄여 어두워지므로 한 단계 밝히고, 안쪽 어둡기는 약하게
            ao = (0.78 + 0.32 * rd) * (0.95 + 0.3 * hz) * 1.35
            if snow:
                ao = 0.85 + 0.15 * rd
            col.data[li].color = (base[0] * ao, base[1] * ao, base[2] * ao, 1.0)
    me.normals_split_custom_set(loop_normals)
    me.color_attributes.active_color = col


def fir2(name, tiers=9, height=4.6, base_r=1.55, seed=1, drift=False, far=False):
    random.seed(seed)
    bm = bmesh.new()
    tube(bm, [Vector((0, 0, -0.1)), Vector((0, 0, 0.75 + height * 0.82))], [0.17, 0.05], 6, BARK, cap_top=False)
    for k in range(tiers):
        t = k / max(1, tiers - 1)
        z = 0.7 + t * height * 0.78
        L = base_r * (1 - t * 0.78) + 0.22
        n = max(4, round((9 - 3.5 * t) * (0.6 if far else 1)))
        rot = random.random() * math.pi
        for i in range(n):
            yaw = rot + 2 * math.pi * i / n + random.uniform(-0.18, 0.18)
            frond(bm, Vector((0, 0, z + random.uniform(-0.05, 0.05))), yaw, L, L * 0.42 + 0.06, 0.3 + 0.22 * (1 - t), snow=True, seed=seed * 100 + k * 10 + i)
    # 꼭대기: 가는 뾰족 + 눈 모자
    zt = 0.7 + height * 0.82
    ring_ = ring(bm, Vector((0, 0, 0)), 0.2, 5, zt - 0.35)
    fan(bm, ring_, bm.verts.new((0, 0, zt + 0.35)), NEEDLE)
    cap = ring(bm, Vector((0, 0, 0)), 0.14, 5, zt + 0.05)
    fan(bm, cap, bm.verts.new((0, 0, zt + 0.42)), SNOW)
    if drift:
        blob(bm, Vector((0, 0, 0.0)), Vector((1.25, 1.1, 0.55)), SNOW, seed + 7, subdiv=2, cut_below=0.0)
    else:
        blob(bm, Vector((0, 0, 0.0)), Vector((base_r * 0.55, base_r * 0.5, 0.22)), SNOW, seed + 7, cut_below=0.0)
    o = new_obj(name, bm)
    soften(o)
    return o


# ── v3: 레퍼런스(Against the Storm 숲 + 컨셉)에서 착안 (11/20) ──
# 게임 시점은 멀리서 내려다봄 → 가지 하나하나의 기하 디테일은 각진 잡음이 됨.
# 나무 = 부드러운 둥근 원뿔 층(가장자리 물결), 매끈한 음영. 눈은 따로 된 껍질이 아니라 "위를 볼수록 흰색"으로 칠함.
def paint(o, snow_from=0.45, snow_to=0.8, seed=0):
    """정점 색: 위를 보는 면일수록 눈(흰색), 아래·안쪽은 짙은 초록, 줄기는 껍질 색. 잡음으로 붓 자국처럼 흔듦"""
    me = o.data
    for p in me.polygons:
        p.use_smooth = True
    col = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    zs = [v.co.z for v in me.vertices]
    z0, z1 = min(zs), max(zs)
    hgt = max(0.01, z1 - z0)
    # 꼭짓점 법선(매끈) 기준으로 위를 보는 정도를 잼
    me.update()
    vn = {v.index: v.normal.copy() for v in me.vertices}
    for p in me.polygons:
        mat = p.material_index
        base = Vector(MATS[mat].diffuse_color[:3])
        for li in p.loop_indices:
            vi = me.loops[li].vertex_index
            v = me.vertices[vi].co
            nzf = p.normal.z
            if mat in (BARK, BARK_RED):
                c = base * (0.85 + 0.15 * (v.z - z0) / hgt)
            else:
                hz = (v.z - z0) / hgt
                nz = 0.6 * nzf + 0.4 * vn[vi].z + 0.18 * noise.noise(v * 2.3 + Vector((seed, 0, 0)))
                s = max(0.0, min(1.0, (nz - snow_from) / (snow_to - snow_from))) * (0.75 + 0.35 * hz)
                s = min(1.0, s)
                green = Vector(MATS[NEEDLE].diffuse_color[:3]) * (1.0 + 0.45 * hz) * (0.9 + 0.2 * noise.noise(v * 3.1))
                if nz < 0:
                    green = Vector(MATS[NEEDLE_DARK].diffuse_color[:3])
                snowc = Vector(MATS[SNOW].diffuse_color[:3]) * (0.92 + 0.08 * hz)
                c = green.lerp(snowc, s)
            col.data[li].color = (c.x, c.y, c.z, 1.0)
    me.color_attributes.active_color = col


def paint_weights(o, weights, seed=0):
    """층 자리로 정한 눈 무게대로 칠함 (컨셉: 층마다 위 선반은 흰 눈, 처진 가장자리는 초록 술)"""
    me = o.data
    for p in me.polygons:
        p.use_smooth = True
    col = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    zs = [v.co.z for v in me.vertices]
    z0, z1 = min(zs), max(zs)
    hgt = max(0.01, z1 - z0)
    snowc = Vector(MATS[SNOW].diffuse_color[:3])
    for p in me.polygons:
        for li in p.loop_indices:
            vi = me.loops[li].vertex_index
            v = me.vertices[vi].co
            hz = (v.z - z0) / hgt
            w = weights.get(vi, 0.0)
            if p.material_index in (BARK, BARK_RED):
                c = Vector(MATS[p.material_index].diffuse_color[:3])
            elif p.material_index == DEAD:  # 검은 줄기에 서리가 얼룩덜룩 앉음
                frost = 0.4 * max(0.0, min(1.0, 0.35 + 1.2 * noise.noise(v * 1.8 + Vector((seed, 0, 0)))))
                c = Vector(MATS[DEAD].diffuse_color[:3]).lerp(snowc * 0.8, frost)
            elif w < 0:
                c = Vector(MATS[NEEDLE_DARK].diffuse_color[:3])
            elif p.material_index == SNOW:
                c = snowc * (0.9 + 0.1 * hz)
            else:
                green = Vector(MATS[NEEDLE].diffuse_color[:3]) * (1.05 + 0.5 * hz) * (0.9 + 0.2 * noise.noise(v * 3.1 + Vector((seed, 0, 0))))
                wn = max(0.0, min(1.0, w + 0.12 * noise.noise(v * 2.4)))
                c = green.lerp(snowc * (0.9 + 0.1 * hz), wn)
            col.data[li].color = (c.x, c.y, c.z, 1.0)
    me.color_attributes.active_color = col


def soft_fir(name, tiers=4, height=3.6, base_r=1.35, seed=1, segs=14, drift=False, core=1.0, body_snow=1.0):
    """core<1: 가지 카드가 실루엣을 맡을 때 몸통은 작은 짙은 속(그림자 덩어리)으로. body_snow: 몸통 눈 양"""
    random.seed(seed)
    bm = bmesh.new()
    W = {}  # bm 꼭짓점 → 눈 무게
    tube(bm, [Vector((0, 0, -0.1)), Vector((0, 0, 0.7))], [0.15, 0.11], 6, BARK, cap_top=False)
    rot = random.random()
    for k in range(tiers):
        t = k / tiers
        z0 = 0.45 + t * height * 0.85
        h = height * 0.85 / tiers * 1.45  # 층이 겹치게
        r = base_r * 1.1 * (1 - t * 0.72) * core
        lobes = 7 + k % 2
        edge, fringe, shelf, inner, under = [], [], [], [], []
        for i in range(segs):
            a = rot + k * 0.7 + 2 * math.pi * i / segs
            wave = 1 + 0.1 * math.sin(a * lobes)  # 부드러운 물결 가장자리 (뾰족 별 X)
            droop = 0.07 * h * (1 + math.sin(a * lobes))
            ex, ey = math.cos(a) * r * wave, math.sin(a) * r * wave
            edge.append(bm.verts.new((ex, ey, z0 - droop)))
            under.append(bm.verts.new((ex, ey, z0 - droop)))  # 아랫면용 따로 (가장자리 색이 어두워지지 않게)
            # 가장자리와 선반 사이 초록 술 (컨셉: 눈 아래로 초록 가지 끝이 삐져나옴)
            fringe.append(bm.verts.new((math.cos(a) * r * 0.9 * wave, math.sin(a) * r * 0.9 * wave, z0 + h * 0.06)))
            shelf.append(bm.verts.new((math.cos(a) * r * 0.7 * wave, math.sin(a) * r * 0.7 * wave, z0 + h * 0.24)))
            inner.append(bm.verts.new((math.cos(a) * r * 0.42, math.sin(a) * r * 0.42, z0 + h * 0.5)))
        top = ring(bm, Vector((0, 0, 0)), r * 0.14, segs, z0 + h * 0.86, rot)
        apex = bm.verts.new((0, 0, z0 + h))
        bridge(bm, edge, fringe, NEEDLE)
        bridge(bm, fringe, shelf, NEEDLE)
        bridge(bm, shelf, inner, NEEDLE)
        bridge(bm, inner, top, NEEDLE)
        fan(bm, top, apex, NEEDLE)
        uc = bm.verts.new((0, 0, z0 + h * 0.12))
        fan(bm, under, uc, NEEDLE_DARK, flip=True)
        for v in edge:
            W[v] = 0.0
        for v in fringe:
            W[v] = 0.08
        for v in shelf:
            W[v] = 0.95 * body_snow
        for v in inner + top + [apex]:
            W[v] = 1.0 * body_snow
        for v in under + [uc]:
            W[v] = -1.0
    if drift:
        blob(bm, Vector((0, 0, 0.0)), Vector((1.1, 1.0, 0.45)), SNOW, seed + 7, subdiv=2, cut_below=0.0)
    else:
        blob(bm, Vector((0, 0, 0.0)), Vector((base_r * 0.6, base_r * 0.55, 0.2)), SNOW, seed + 7, cut_below=0.0)
    bm.verts.index_update()
    weights = {v.index: w for v, w in W.items()}
    o = new_obj(name, bm)
    paint_weights(o, weights, seed=seed)
    return o


def soft_pine(name, seed=3, lumps=3):
    """적송 v3: 줄기·가지는 그대로, 잎 뭉치는 매끈한 납작 구름(눈은 위쪽 색으로)"""
    bm = bmesh.new()
    trunk, radii, branches = pine_parts(seed)
    tube(bm, trunk, radii, 7, BARK_RED)
    for k, (p, end, sz) in enumerate(branches[:-1]):
        mid = p.lerp(end, 0.5) + Vector((0, 0, 0.18))
        tube(bm, [p, mid, end], [0.075, 0.055, 0.035], 5, BARK_RED)
    for k, (p, end, sz) in enumerate(branches):
        rnd = random.Random(seed * 10 + k)
        for j in range(lumps):
            a = j * 2.2 + rnd.random()
            off = Vector((math.cos(a) * sz * 0.4, math.sin(a) * sz * 0.34, rnd.uniform(-0.03, 0.06) * sz))
            blob(bm, end + off, Vector((sz * 0.75, sz * 0.65, sz * 0.28)), NEEDLE, seed * 10 + k * 3 + j, subdiv=2)
    blob(bm, Vector((0, 0, 0.0)), Vector((0.6, 0.55, 0.16)), SNOW, seed + 99, cut_below=0.0)
    o = new_obj(name, bm)
    paint(o, snow_from=0.62, snow_to=0.92, seed=seed)
    return o


def _prof(u):
    """층 단면: 가운데(0)에서 가장자리(1)까지의 높이 비율 — 안쪽은 가파르고 가장자리는 완만"""
    pts = ((0.0, 1.0), (0.14, 0.86), (0.42, 0.5), (0.7, 0.24), (0.9, 0.06), (1.0, 0.0))
    for (u0, z0), (u1, z1) in zip(pts, pts[1:]):
        if u <= u1:
            return z0 + (z1 - z0) * (u - u0) / (u1 - u0)
    return 0.0


def frost_fir(name, tiers=5, height=4.2, base_r=1.05, seed=1, segs=14, drift=False):
    """v5 (11/20 밤, 레퍼런스 조사): v3의 부드러운 층(사용자가 낫다고 한 덩어리)은 그대로 두고 —
    프로스트펑크: 가늘고 높은 검은 윤곽, 눈 위로 솟은 줄기 끝, 짙은 잎과 흰 눈의 센 대비
    실록: 고르지 않은 자연스러움(한쪽이 길고, 기울고, 눈이 군데군데만 얹힘)
    눈은 층 전체를 고르게 덮지 않고 잡음으로 얼룩지게 얹음 → 위에서 봐도 짙은 잎이 절반쯤 보임"""
    rnd = random.Random(seed)
    bm = bmesh.new()
    W = {}
    lx, ly = rnd.uniform(-0.22, 0.22), rnd.uniform(-0.22, 0.22)

    def axis(z):
        return Vector((lx * (z / height) ** 2, ly * (z / height) ** 2, z))

    tube(bm, [axis(-0.1), axis(height * 0.5), axis(height * 0.97), axis(height * 1.12)], [0.16, 0.09, 0.035, 0.012], 6, BARK)
    z_lo, span = height * 0.14, height * 0.8
    rot = rnd.random() * 6.28
    US = (1.0, 0.88, 0.72, 0.52, 0.3, 0.12)
    for k in range(tiers):
        t = k / tiers
        z0 = z_lo + t * span
        h = span / tiers * 1.5  # 층이 겹치게
        r = base_r * 1.1 * (1 - t * 0.74) * rnd.uniform(0.93, 1.08)
        c = axis(z0) + Vector((rnd.uniform(-0.06, 0.06) * r, rnd.uniform(-0.06, 0.06) * r, 0))
        rings = [[] for _ in US]
        under = []
        for i in range(segs):
            a = rot + k * 0.7 + 2 * math.pi * i / segs
            ca, sa = math.cos(a), math.sin(a)
            tip = 1.0 if i % 2 == 0 else -1.0  # 가지 끝(길고 처짐)과 그 사이(짧음)가 번갈아
            n1 = noise.noise(Vector((ca * 0.8 + seed * 3.1 + k * 1.7, sa * 0.8, k * 0.37)))
            wave = max(0.7, 1 + 0.045 * tip + 0.3 * n1)  # 한쪽은 길고 한쪽은 빠진 둘레
            droop = h * (0.08 + 0.05 * n1)  # 위아래 톱니는 삼각 판처럼 보여서 뺌 (11/20 밤)
            for j, u in enumerate(US):
                w = 1 + (wave - 1) * u  # 안쪽으로 갈수록 둥글게
                p = c + Vector((ca * r * w * u, sa * r * w * u, h * _prof(u) - droop * u * u))
                v = bm.verts.new(p)
                rings[j].append(v)
                if j == 0:
                    W[v] = 0.0  # 가지 끝은 늘 짙은 잎
                    under.append(bm.verts.new(p))
                else:
                    n = noise.noise(p * 1.25 + Vector((seed * 7.3, k * 2.1, 0)))
                    W[v] = max(0.0, min(1.0, (0.82 - 0.95 * u + n) * 2.8))  # 얼룩진 눈: 안쪽·위일수록 많이
        for a_, b_ in zip(rings, rings[1:]):
            bridge(bm, a_, b_, NEEDLE)
        apex = bm.verts.new(c + Vector((0, 0, h)))
        W[apex] = 1.0
        fan(bm, rings[-1], apex, NEEDLE)
        uc = bm.verts.new(c + Vector((0, 0, h * 0.12)))
        fan(bm, under, uc, NEEDLE_DARK, flip=True)
        for v in under + [uc]:
            W[v] = -1.0
    if drift:
        blob(bm, Vector((0, 0, 0.0)), Vector((1.1, 1.0, 0.45)), SNOW, seed + 7, subdiv=2, cut_below=0.0)
    else:
        blob(bm, Vector((0, 0, 0.0)), Vector((base_r * 0.6, base_r * 0.55, 0.2)), SNOW, seed + 7, cut_below=0.0)
    bm.verts.index_update()
    weights = {v.index: w for v, w in W.items()}
    o = new_obj(name, bm)
    paint_weights(o, weights, seed=seed)
    round_normals(o)
    return o


def round_normals(o, blend=0.55):
    """각진 면 줄이기: 잎 면의 법선을 나무 전체 모양(세로로 긴 타원)의 바깥 방향 쪽으로 섞음 → 면마다 꺾이던 빛이 나무 전체에 둥글게 흐름.
    줄기와 아랫면은 그대로"""
    me = o.data
    zs = [v.co.z for v in me.vertices]
    z0, hgt = min(zs), max(0.01, max(zs) - min(zs))
    normals = []
    for p in me.polygons:
        for li in p.loop_indices:
            vert = me.vertices[me.loops[li].vertex_index]
            n = vert.normal.copy()
            if p.material_index == NEEDLE:
                v = vert.co
                out = Vector((v.x, v.y, (v.z - (z0 + hgt * 0.35)) * 0.5 + 0.35))
                if out.length > 1e-4:
                    n = n.lerp(out.normalized(), blend).normalized()
            normals.append(n)
    me.normals_split_custom_set(normals)


def snag(name, seed=11, height=3.8):
    """프로스트펑크의 얼어붙은 고목: 잎 없이 가늘고 검은 줄기, 부러진 꼭대기, 짧은 가지 그루, 그 위와 밑동에 눈"""
    rnd = random.Random(seed)
    bm = bmesh.new()
    pts, radii = [], []
    for k in range(5):
        t = k / 4
        pts.append(Vector((0.3 * t * t * math.cos(seed) + 0.05 * math.sin(t * 7 + seed), 0.3 * t * t * math.sin(seed) + 0.05 * math.cos(t * 5 + seed), -0.1 + t * (height + 0.1))))
        radii.append(0.22 - 0.14 * t)
    loops = tube(bm, pts, radii, 6, DEAD, cap_top=False)
    fan(bm, loops[-1], bm.verts.new(pts[-1] + Vector((radii[-1] * 0.9, 0, 0.5))), DEAD)  # 부러져 한쪽만 남은 뾰족한 끝
    for k in range(4):
        t = 0.38 + 0.14 * k + rnd.uniform(-0.04, 0.04)
        i = t * 4
        p = pts[int(i)].lerp(pts[min(int(i) + 1, 4)], i - int(i))
        a = k * 2.4 + rnd.random()
        ln = rnd.uniform(0.4, 0.95) * (1.15 - t)
        end = p + Vector((math.cos(a) * ln, math.sin(a) * ln, ln * rnd.uniform(0.15, 0.55)))
        tube(bm, [p, end], [0.05, 0.02], 4, DEAD)
        if k % 2 == 0:
            blob(bm, p.lerp(end, 0.5) + Vector((0, 0, 0.06)), Vector((0.16, 0.16, 0.06)), SNOW, seed + k)
    blob(bm, Vector((0, 0, 0.0)), Vector((0.55, 0.5, 0.2)), SNOW, seed + 9, cut_below=0.0)
    o = new_obj(name, bm)
    paint_weights(o, {}, seed=seed)
    return o


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


def snow_pad(bm, c, rx, ry, seed, thick=0.06):
    """납작한 눈 방석: 들쭉날쭉한 가장자리(몇 군데는 아래로 처짐) → 가운데로 낮게 솟음.
    둥근 덩어리(팝콘처럼 보임) 대신 컨셉처럼 층진 판 (사용자 11/20 숲 점검)"""
    rnd = random.Random(seed)
    segs = 14
    rot = rnd.random() * math.pi
    outer, mid = [], []
    for i in range(segs):
        a = rot + 2 * math.pi * i / segs
        k = 1 + rnd.uniform(-0.18, 0.12)
        drape = rnd.random() < 0.3
        outer.append(bm.verts.new((c.x + math.cos(a) * rx * k, c.y + math.sin(a) * ry * k, c.z - (thick * 1.6 if drape else 0))))
        mid.append(bm.verts.new((c.x + math.cos(a) * rx * 0.6 * k, c.y + math.sin(a) * ry * 0.6 * k, c.z + thick * 0.9)))
    bridge(bm, outer, mid, SNOW)
    fan(bm, mid, bm.verts.new((c.x, c.y, c.z + thick * 1.3)), SNOW)
    fan(bm, outer, bm.verts.new((c.x, c.y, c.z - thick)), SNOW, flip=True)  # 아랫면 (밑에서 볼 때 비지 않게)


def needle_cluster(bm, c, sz, seed, lumps=3):
    """잎 뭉치 = 넓고 납작하게 퍼진 구름 셋(우산처럼), 위에 납작한 눈 방석 두 겹 (아랫도리 초록은 보이게)"""
    rnd = random.Random(seed)
    for k in range(lumps):
        a = k * 2.1 + rnd.random()
        off = Vector((math.cos(a) * sz * 0.45, math.sin(a) * sz * 0.38, rnd.uniform(-0.04, 0.05) * sz))
        blob(bm, c + off, Vector((sz * 0.7, sz * 0.6, sz * 0.3)), NEEDLE, seed + k)
    top = c.z + sz * 0.22
    snow_pad(bm, Vector((c.x, c.y, top)), sz * 0.95, sz * 0.82, seed + 50, thick=sz * 0.05)
    if lumps < 3:
        return
    off = Vector((rnd.uniform(-0.15, 0.15) * sz, rnd.uniform(-0.15, 0.15) * sz, sz * 0.09))
    snow_pad(bm, Vector((c.x, c.y, top)) + off, sz * 0.5, sz * 0.44, seed + 60, thick=sz * 0.05)


def red_pine(name, seed=3, lumps=3):
    bm = bmesh.new()
    trunk, radii, branches = pine_parts(seed)
    tube(bm, trunk, radii, 8, BARK_RED)
    for k, (p, end, sz) in enumerate(branches[:-1]):
        mid = p.lerp(end, 0.5) + Vector((0, 0, 0.18))
        tube(bm, [p, mid, end], [0.075, 0.055, 0.035], 5, BARK_RED)
    for k, (p, end, sz) in enumerate(branches):
        needle_cluster(bm, end, sz, seed * 10 + k, lumps)
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
    blob(bm, Vector((0, 0, 0.0)), Vector((0.78, 0.72, 0.22)), SNOW, seed + 9, cut_below=0.0)
    return new_obj(name, bm)


def shrub(name, seed=8):
    """눈 덮인 낮은 덤불(눈향나무 느낌): 납작한 잎 덩이 넷 + 눈 방석 — 숲 바닥 빈자리 메움"""
    random.seed(seed)
    bm = bmesh.new()
    for k in range(4):
        a = k * 1.7 + random.random()
        c = Vector((math.cos(a) * 0.38, math.sin(a) * 0.32, 0.22 + random.uniform(0, 0.12)))
        blob(bm, c, Vector((0.48, 0.42, 0.3)), NEEDLE if k % 2 else NEEDLE_DARK, seed + k)
        snow_pad(bm, c + Vector((0, 0, 0.18)), 0.36, 0.32, seed + 20 + k, thick=0.04)
    blob(bm, Vector((0, 0, 0.0)), Vector((0.9, 0.8, 0.16)), SNOW, seed + 40, cut_below=0.0)
    return new_obj(name, bm)


objs = [
    # v5 (11/20 밤): 프로스트펑크(검고 가는 수직 윤곽·고목) + 실록(고르지 않은 자연스러움) + 우리 건물식 두꺼운 눈.
    # 옛 방식(fir·fir2·soft_fir·red_pine)은 비교용으로 함수만 남김. v4 가지 그림 카드는 "징그럽다"로 뺌
    frost_fir("TREE_FIR", seed=1),
    frost_fir("TREE_FIR_B", tiers=6, height=5.0, base_r=0.9, seed=4, segs=12),  # 가늘고 높은
    frost_fir("TREE_FIR_C", tiers=4, height=3.4, base_r=1.35, seed=6),  # 넓고 낮은
    frost_fir("TREE_FIR_YOUNG", tiers=3, height=1.9, base_r=0.72, seed=2, segs=10, drift=True),
    frost_fir("TREE_FIR_FAR", tiers=3, seed=1, segs=8),  # 먼 숲용 가벼운
    soft_pine("TREE_PINE"),
    soft_pine("TREE_PINE_FAR", lumps=1),
    snag("TREE_SNAG", seed=11),
    snag("TREE_SNAG_B", seed=17, height=2.7),
    shrub("TREE_SHRUB"),
    fallen_pine("TREE_PINE_FALLEN"),
    stump("TREE_STUMP"),
]
for o in objs:
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.export_scene.gltf(filepath=f"{out_dir}/{o.name}.glb", export_format="GLB", use_selection=True, export_yup=True, export_normals=True, export_vertex_color="ACTIVE")
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    print(f"{o.name} tris={tris}")

# 미리보기: 한 줄로 늘어놓고 옆에서
xs = [-15.0, -11.8, -8.4, -5.6, -3.0, 0.2, 4.0, 7.0, 9.0, 11.0, 14.0, 17.5]
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
cam.data.lens = 24
sc.collection.objects.link(cam)
sc.camera = cam
cam.location = (0.6, -21, 6.0)
cam.rotation_euler = (Vector((0.6, 0, 2.2)) - cam.location).to_track_quat("-Z", "Y").to_euler()
sc.render.filepath = preview
bpy.ops.render.render(write_still=True)
print("TREE_DONE")
