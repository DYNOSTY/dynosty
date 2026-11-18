# DYNOSTY 건물 깎기 (2026-11-18 컨셉 시트: 그을림·두꺼운 눈·고드름·덧댄 판자·주황 창·굴뚝 연기)
# 사용: blender -b --python carve.py -- <nest|office> <원본.glb> <저장.glb> <미리보기.png>
import bpy, bmesh, sys, math, random
from mathutils import Vector, Matrix, noise
from mathutils.bvhtree import BVHTree

kind, src, dst, preview = sys.argv[sys.argv.index("--") + 1:][:4]
random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
base = next(o for o in bpy.context.scene.objects if o.type == "MESH")
dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(base, dg)
mw = base.matrix_world
mwi = mw.inverted()
base_mats = [m.name for m in base.data.materials]

# ── 재질: 이름이 게임 공용 재질과 같아야 materials.ts가 텍스처를 입힘 ──
COLORS = {
    "snow": (0.86, 0.9, 0.97), "ice_clear": (0.6, 0.78, 0.9), "timber_dark": (0.16, 0.12, 0.1),
    "iron_rusted": (0.22, 0.14, 0.1), "stone": (0.24, 0.26, 0.3), "felt_patch": (0.3, 0.27, 0.24),
    "rope": (0.45, 0.38, 0.26), "log_bark": (0.2, 0.17, 0.15), "hanji_frosted": (0.78, 0.74, 0.66),
    "window": (1.0, 0.55, 0.2),
}
_mats = {}
def mat(name):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    c = COLORS.get(name, (0.5, 0.5, 0.5))
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*c, 1)
        bsdf.inputs["Roughness"].default_value = 0.85
        if name == "window":
            bsdf.inputs["Emission Color"].default_value = (1.0, 0.5, 0.18, 1)
            bsdf.inputs["Emission Strength"].default_value = 4.0
    _mats[name] = m
    return m

def surface(x, y, top=12.0, allow=None):
    """위에서 아래로 광선 → (위치, 법선, 재질 이름) / 없으면 None"""
    o = mwi @ Vector((x, y, top))
    d = (mwi.to_3x3() @ Vector((0, 0, -1))).normalized()
    loc, nor, idx, _ = bvh.ray_cast(o, d)
    if loc is None:
        return None
    name = base_mats[base.data.polygons[idx].material_index] if idx is not None and idx < len(base.data.polygons) else ""
    if allow and name not in allow:
        return None
    return mw @ loc, (mw.to_3x3() @ nor).normalized(), name

def new_obj(name, bm, material, mods=()):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(mat(material))
    for mod in mods:
        mod(ob)
    for p in me.polygons:
        p.use_smooth = True
    return ob

def smooth(factor, repeat):
    def f(ob):
        m = ob.modifiers.new("smooth", "SMOOTH"); m.factor = factor; m.iterations = repeat
    return f

def solidify(th):
    def f(ob):
        # 겉만: 윗면과 옆 테두리만 남기고 지붕에 닿는 밑판은 만들지 않음
        m = ob.modifiers.new("solid", "SOLIDIFY"); m.thickness = th; m.offset = -1.0; m.use_rim_only = True
    return f

def add_box(bm, center, size, rot=Matrix.Identity(3)):
    r = bmesh.ops.create_cube(bm, size=1.0)
    M = Matrix.Translation(center) @ rot.to_4x4() @ Matrix.Diagonal((*size, 1))
    bmesh.ops.transform(bm, matrix=M, verts=r["verts"])

def add_cone(bm, tip_top, radius, length, segs=6):
    r = bmesh.ops.create_cone(bm, cap_ends=False, segments=segs, radius1=radius, radius2=0.0, depth=length)  # 윗면은 지붕에 박혀 안 보임
    # 원뿔: 위가 넓고 아래로 뾰족 (고드름)
    M = Matrix.Translation(tip_top - Vector((0, 0, length / 2))) @ Matrix.Rotation(math.pi, 4, "X")
    bmesh.ops.transform(bm, matrix=M, verts=r["verts"])

def frame_on(normal, tangent_hint=Vector((0, 0, 1))):
    z = normal.normalized()
    x = tangent_hint.cross(z)
    if x.length < 1e-3:
        x = Vector((1, 0, 0)).cross(z)
    x.normalize()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed()

def snow_cap(name, pts_fn, keep, thick=0.14, lift=0.03, wrap=None):
    lift = lift + thick  # 윗면을 두께만큼 띄우고 테두리가 지붕까지 내려옴
    """지붕 위를 덮는 눈: 격자 점마다 광선, 지붕이면 위로 띄워 덮개 → 두께 + 울퉁불퉁"""
    bm = bmesh.new()
    grid = {}
    for key, (x, y) in pts_fn():
        hit = surface(x, y)
        if not hit or not keep(hit, x, y):
            continue
        p, n, _ = hit
        bump = noise.noise(Vector((x * 1.7, y * 1.7, 0.3))) * 0.05
        grid[key] = bm.verts.new(p + n * (lift + bump))
    for (i, j), v in list(grid.items()):
        jn = (j + 1) % wrap if wrap else j + 1  # 극좌표는 마지막 칸 → 첫 칸으로 이어 붙임
        q = [grid.get(k) for k in ((i, j), (i + 1, j), (i + 1, jn), (i, jn))]
        if all(q):
            bm.faces.new(q)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.001)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    return new_obj(name, bm, "snow", [smooth(0.6, 5), solidify(thick)])

def empty(name, at):
    e = bpy.data.objects.new(name, None)
    e.location = at
    e.empty_display_size = 0.2
    bpy.context.collection.objects.link(e)
    return e

def icicles(name, points, seed=3):
    rnd = random.Random(seed)
    bm = bmesh.new()
    for p in points:
        L = rnd.uniform(0.12, 0.45)
        add_cone(bm, p, rnd.uniform(0.03, 0.06), L)
    return new_obj(name, bm, "ice_clear")

# ════════════════════ 둥지 ════════════════════
if kind == "nest":
    C = Vector((0, 0.1, 0))
    R = 3.0
    # 1) 두꺼운 눈 덮개: 극좌표 격자, 가장자리는 들쭉날쭉 (각도마다 끝 반지름이 다름)
    RINGS, SEGS = 18, 48
    def polar():
        for i in range(RINGS + 1):
            for j in range(SEGS):
                a = j / SEGS * math.tau
                edge = 2.25 + 0.45 * (noise.noise(Vector((math.cos(a) * 2, math.sin(a) * 2, 1.0))) * 0.5 + 0.5)
                r = (i / RINGS) * edge
                yield (i, j % SEGS), (C.x + math.cos(a) * r, C.y + math.sin(a) * r)
    def polar_wrap():
        for (i, j), xy in polar():
            yield (i, j), xy
    roof = {"thatch", "strawlight", "rope"}
    cap = snow_cap("nest_snow_cap", polar_wrap, lambda h, x, y: h[2] in roof, thick=0.16, wrap=SEGS)
    # 극좌표 이음매(마지막 칸 ↔ 첫 칸) 메우기
    bm = bmesh.new(); bm.from_mesh(cap.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.02)
    bm.to_mesh(cap.data); bm.free()

    # 2) 처마 고드름: 초가 끝단(z≈1.12) 둘레, 앞 처마(문) 자리는 비움
    pts = []
    for k in range(64):
        a = k / 64 * math.tau
        if abs(math.degrees(a) - 270) < 22:
            continue
        hit = surface(C.x + math.cos(a) * 2.95, C.y + math.sin(a) * 2.95)
        if hit and hit[2] in roof:
            pts.append(Vector((C.x + math.cos(a) * 3.0, C.y + math.sin(a) * 3.0, hit[0].z - 0.02)))
    icicles("nest_icicles", pts)

    # 3) 새끼줄 고리는 눈 위로 떠 보여서 뺌 (원래 모델의 방사형 새끼줄로 충분)

    # 4) 덧댄 판자 두 묶음 · 펠트 두 장 (지붕 곡면에 붙여서)
    bm = bmesh.new()
    for ang, n in ((35, 3), (205, 3)):
        a = math.radians(ang)
        for k in range(n):
            x = C.x + math.cos(a) * 1.75 + math.cos(a + 1.57) * (k - 1) * 0.16
            y = C.y + math.sin(a) * 1.75 + math.sin(a + 1.57) * (k - 1) * 0.16
            hit = surface(x, y)
            if not hit:
                continue
            p, nrm, _ = hit
            rot = frame_on(nrm, Vector((math.cos(a), math.sin(a), 0)))
            add_box(bm, p + nrm * 0.2, (0.13, 0.95, 0.045), rot @ Matrix.Rotation(math.radians(8 * (k - 1)), 3, "Z"))
    new_obj("nest_planks", bm, "timber_dark")
    bm = bmesh.new()
    for ang in (120, 300):
        a = math.radians(ang)
        hit = surface(C.x + math.cos(a) * 1.9, C.y + math.sin(a) * 1.9)
        if hit:
            p, nrm, _ = hit
            add_box(bm, p + nrm * 0.18, (0.85, 0.7, 0.03), frame_on(nrm, Vector((math.cos(a), math.sin(a), 0))))
    new_obj("nest_felt", bm, "felt_patch")

    # 5) 굴뚝: 돌 기둥 + 쇠 갓, 꼭대기에 smoke 노드
    a = math.radians(55)
    hit = surface(C.x + math.cos(a) * 1.55, C.y + math.sin(a) * 1.55)
    bx, by, bz = C.x + math.cos(a) * 1.55, C.y + math.sin(a) * 1.55, hit[0].z if hit else 2.2
    bm = bmesh.new()
    r = bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.26, radius2=0.22, depth=1.0)
    bmesh.ops.translate(bm, vec=(bx, by, bz + 0.3), verts=r["verts"])
    new_obj("nest_chimney", bm, "stone")
    bm = bmesh.new()
    r = bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.36, radius2=0.08, depth=0.22)
    bmesh.ops.translate(bm, vec=(bx, by, bz + 0.95), verts=r["verts"])
    add_box(bm, Vector((bx, by, bz + 0.81)), (0.08, 0.08, 0.1))
    new_obj("nest_chimney_cap", bm, "iron_rusted")
    empty("smoke", Vector((bx, by, bz + 1.1)))

    # 6) 벽에 불 켜진 작은 창 2개 + 나무 틀 (앞 양옆)
    bmw, bmf = bmesh.new(), bmesh.new()
    for deg in (-135, -45):
        a = math.radians(deg)
        out = Vector((math.cos(a), math.sin(a), 0))
        p = Vector((C.x, C.y, 0.88)) + out * 2.86
        rot = frame_on(out)
        add_box(bmw, p, (0.44, 0.34, 0.06), rot)
        for dx, dy, sx, sy in ((0, 0.2, 0.56, 0.07), (0, -0.2, 0.56, 0.07), (0.25, 0, 0.07, 0.46), (-0.25, 0, 0.07, 0.46), (0, 0, 0.04, 0.34)):
            add_box(bmf, p + rot @ Vector((dx, dy, 0.04)), (sx, sy, 0.05), rot)
    new_obj("nest_windows", bmw, "window")
    new_obj("nest_window_frames", bmf, "timber_dark")

    # 7) 기단에 쌓인 눈더미 (문 앞은 치움)
    bm = bmesh.new()
    rings = []
    for i, (rr, h) in enumerate(((2.92, 0.38), (3.1, 0.26), (3.28, 0.1), (3.45, 0.0))):
        ring = []
        for j in range(96):
            a = j / 96 * math.tau
            gate = abs(math.degrees(a) - 270) < 18
            hh = 0 if gate else h * (0.75 + 0.5 * (noise.noise(Vector((math.cos(a) * 3, math.sin(a) * 3, i))) * 0.5 + 0.5))
            ring.append(bm.verts.new((C.x + math.cos(a) * rr, C.y + math.sin(a) * rr, 0.05 + hh)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for j in range(96):
            bm.faces.new((rings[i][j], rings[i + 1][j], rings[i + 1][(j + 1) % 96], rings[i][(j + 1) % 96]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    new_obj("nest_drift", bm, "snow")

# ════════════════════ 조달소 ════════════════════
if kind == "office":
    roof = {"tile", "cap"}
    # 1) 지붕 눈 덮개: 지붕 위 격자, 처마 끝은 노이즈로 들쭉날쭉 덜 덮음
    X0, X1, Y0, Y1, ST = -2.9, 2.9, -1.35, 2.3, 0.14
    NX, NY = int((X1 - X0) / ST), int((Y1 - Y0) / ST)
    def grid():
        for i in range(NX + 1):
            for j in range(NY + 1):
                yield (i, j), (X0 + i * ST, Y0 + j * ST)
    def keep(h, x, y):
        if h[2] not in roof:
            return False
        edge = min(abs(y - Y0), abs(Y1 - y), abs(x - X0), abs(X1 - x))
        # 처마 끝은 넉넉히 비워 휜 처마선이 보이게, 군데군데 구멍을 내 기와가 비치게
        if edge < 0.3 + 0.35 * (noise.noise(Vector((x * 2.2, y * 2.2, 5))) * 0.5 + 0.5):
            return False
        return noise.noise(Vector((x * 1.3, y * 1.3, 9))) < 0.32
    snow_cap("office_snow_cap", grid, keep, thick=0.13)

    # 2) 처마 고드름: 앞·뒤 처마선 (지붕의 가장 낮은 끝 찾기)
    pts = []
    for yy, sign in ((-1.2, -1), (2.16, 1)):
        for k in range(34):
            x = -2.65 + k * (5.3 / 33) + random.uniform(-0.04, 0.04)
            for t in range(12):  # 처마 쪽으로 걸어가며 지붕이 끝나는 곳
                y = yy - sign * t * 0.03
                hit = surface(x, y)
                if hit and hit[2] in roof:
                    pts.append(Vector((x, y, hit[0].z - 0.03)))
                    break
    icicles("office_icicles", pts, seed=5)

    # 3) 벽돌 굴뚝 (뒤 오른쪽) + 쇠 갓 + smoke
    bx, by = 2.0, 1.45
    hit = surface(bx, by)
    rz = hit[0].z if hit else 2.6
    bm = bmesh.new(); add_box(bm, Vector((bx, by, rz + 0.25)), (0.5, 0.5, 1.2)); new_obj("office_chimney", bm, "stone")
    bm = bmesh.new()
    add_box(bm, Vector((bx, by, rz + 0.9)), (0.62, 0.62, 0.08))
    add_box(bm, Vector((bx, by, rz + 1.08)), (0.5, 0.5, 0.05))
    for dx, dy in ((0.2, 0.2), (-0.2, 0.2), (0.2, -0.2), (-0.2, -0.2)):
        add_box(bm, Vector((bx + dx, by + dy, rz + 0.99)), (0.05, 0.05, 0.15))
    new_obj("office_chimney_cap", bm, "iron_rusted")
    empty("smoke", Vector((bx, by, rz + 1.2)))

    # 4) 창을 가로지른 판자 (앞 창 두 개) — 불빛은 틈으로 샘
    bm = bmesh.new()
    for cx in (-1.38, 1.38):
        for ang, dz in ((24, 0.06), (-20, -0.1)):
            rot = Matrix.Rotation(math.radians(ang), 3, "Y")
            add_box(bm, Vector((cx, -1.03, 1.24 + dz)), (0.95, 0.04, 0.11), rot)
    new_obj("office_planks", bm, "timber_dark")

    # 5) 궤짝 더미 (앞 왼쪽) — 윗면 눈 · 서리 낀 게시판 (앞 오른쪽)
    bm = bmesh.new()
    for p, s in (((-3.15, -2.0, 0.42), 0.48), ((-3.1, -1.45, 0.42), 0.48), ((-3.12, -1.72, 0.9), 0.44), ((-2.55, -2.15, 0.36), 0.36)):
        add_box(bm, Vector(p), (s, s, s))
    new_obj("office_crates", bm, "timber_dark")
    bm = bmesh.new()
    for p, s in (((-3.15, -2.0, 0.68), 0.5), ((-3.1, -1.45, 0.68), 0.5), ((-3.12, -1.72, 1.14), 0.46), ((-2.55, -2.15, 0.56), 0.38)):
        add_box(bm, Vector(p), (s, s, 0.06))
    new_obj("office_crate_snow", bm, "snow")
    bm = bmesh.new()
    for dx in (-0.45, 0.45):
        add_box(bm, Vector((3.25 + dx, -2.05, 0.75)), (0.09, 0.09, 1.3))
    new_obj("office_board_posts", bm, "log_bark")
    bm = bmesh.new(); add_box(bm, Vector((3.25, -2.08, 1.05)), (0.95, 0.05, 0.6)); new_obj("office_board", bm, "hanji_frosted")
    bm = bmesh.new(); add_box(bm, Vector((3.25, -2.05, 1.42)), (1.1, 0.2, 0.06)); new_obj("office_board_snow", bm, "snow")

# ════════════════════ 나머지 10종: 설정(JSON)대로 ════════════════════
if kind == "generic":
    import json
    cfg = json.load(open(sys.argv[sys.argv.index("--") + 5], encoding="utf-8"))
    roof = set(cfg.get("roof", []))
    # 지붕 재질의 범위
    xs, ys = [], []
    for p in base.data.polygons:
        if base_mats[p.material_index] in roof:
            for v in p.vertices:
                w = mw @ base.data.vertices[v].co
                xs.append(w.x); ys.append(w.y)
    if roof and xs:
        X0, X1, Y0, Y1 = min(xs) - 0.1, max(xs) + 0.1, min(ys) - 0.1, max(ys) + 0.1
        ST = 0.13
        NX, NY = int((X1 - X0) / ST), int((Y1 - Y0) / ST)
        patchy = cfg.get("patchy", True)
        def grid():
            for i in range(NX + 1):
                for j in range(NY + 1):
                    yield (i, j), (X0 + i * ST, Y0 + j * ST)
        def keep(h, x, y):
            if h[2] not in roof:
                return False
            edge = min(abs(y - Y0), abs(Y1 - y), abs(x - X0), abs(X1 - x))
            if edge < 0.18 + 0.3 * (noise.noise(Vector((x * 2.2, y * 2.2, 5))) * 0.5 + 0.5):
                return False
            return (not patchy) or noise.noise(Vector((x * 1.3, y * 1.3, 9))) < 0.32
        snow_cap(cfg["name"] + "_snow_cap", grid, keep, thick=0.13)
        # 처마 고드름: 네 변에서 안쪽으로 걸어가 지붕이 시작되는 곳
        pts = []
        for side in range(4):
            n = max(6, int(((X1 - X0) if side < 2 else (Y1 - Y0)) / 0.17))
            for k in range(n):
                t = (k + 0.5) / n + random.uniform(-0.01, 0.01)
                for st in range(20):
                    d = st * 0.04
                    if side == 0: x, y = X0 + (X1 - X0) * t, Y0 + d
                    elif side == 1: x, y = X0 + (X1 - X0) * t, Y1 - d
                    elif side == 2: x, y = X0 + d, Y0 + (Y1 - Y0) * t
                    else: x, y = X1 - d, Y0 + (Y1 - Y0) * t
                    hit = surface(x, y)
                    if hit and hit[2] in roof:
                        if random.random() < 0.75:
                            pts.append(Vector((x, y, hit[0].z - 0.03)))
                        break
        icicles(cfg["name"] + "_icicles", pts, seed=len(pts))
    # 굴뚝 위 연기 노드
    if "smoke" in cfg:
        empty("smoke", Vector(cfg["smoke"]))
    # 들보 밑 고드름 (지붕 없는 크레인 등)
    if "beam" in cfg:
        b = cfg["beam"]
        pts = []
        for k in range(int((b["x1"] - b["x0"]) / 0.16)):
            x = b["x0"] + k * 0.16
            for y in [b["y0"] + i * 0.05 for i in range(int((b["y1"] - b["y0"]) / 0.05) + 1)]:
                hit = surface(x, y)
                if hit and hit[0].z > b["zmin"] and hit[2] in b["mats"]:
                    if random.random() < 0.7:
                        pts.append(Vector((x, y, hit[0].z - b.get("drop", 0.2))))
                    break
        icicles(cfg["name"] + "_beam_icicles", pts, seed=11)
    # 덧붙이는 소품: 불·횃불·등불·궤짝·구멍 등
    groups = {}
    def box(material, c, size, rz=0.0):
        bm = groups.setdefault(material, bmesh.new())
        add_box(bm, Vector(c), tuple(size), Matrix.Rotation(math.radians(rz), 3, "Z"))
    def cyl(material, c, r1, r2, h, segs=10):
        bm = groups.setdefault(material, bmesh.new())
        rr = bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r1, radius2=r2, depth=h)
        bmesh.ops.translate(bm, vec=Vector(c), verts=rr["verts"])
    def ground(x, y, top=12.0):
        h = surface(x, y, top)
        return h[0].z if h else 0.2
    for it in cfg.get("props", []):
        t, x, y = it["type"], it["x"], it["y"]
        z = it.get("z", ground(x, y, it.get("from", 12.0)))
        if t == "fire":  # 화로·봉화: 쇠 그릇 + 불빛
            cyl("iron_rusted", (x, y, z + 0.18), 0.32, 0.22, 0.36)
            cyl("window", (x, y, z + 0.42), 0.22, 0.05, 0.36, 8)
            if it.get("smoke"): empty("smoke", Vector((x, y, z + 0.9)))
        elif t == "barrel":  # 드럼통 불
            cyl("iron_rusted", (x, y, z + 0.38), 0.26, 0.26, 0.76, 12)
            cyl("window", (x, y, z + 0.82), 0.2, 0.04, 0.3, 8)
        elif t == "torch":  # 횃불: 기둥 + 쇠 바구니 + 불
            cyl("log_bark", (x, y, z + 0.9), 0.06, 0.05, 1.8, 6)
            cyl("iron_rusted", (x, y, z + 1.85), 0.15, 0.09, 0.2, 8)
            cyl("window", (x, y, z + 2.05), 0.12, 0.02, 0.3, 8)
        elif t == "lantern":  # 걸린 등불
            box("window", (x, y, z), (0.18, 0.18, 0.24))
            box("iron_rusted", (x, y, z + 0.15), (0.24, 0.24, 0.05))
        elif t == "glow":  # 문 안쪽 불빛 판
            box("window", (x, y, z), it["size"], it.get("rz", 0))
        elif t == "crates":
            for k in range(it.get("n", 3)):
                s = random.uniform(0.38, 0.5)
                box("timber_dark", (x + (k % 2) * 0.5, y + (k // 2) * 0.45, z + s / 2 + (0.45 if k == 2 else 0)), (s, s, s), random.uniform(-15, 15))
        elif t == "sacks":
            for k in range(it.get("n", 4)):
                box("felt_patch", (x + k * 0.35, y + random.uniform(-0.1, 0.1), z + 0.2), (0.32, 0.26, 0.4), random.uniform(-25, 25))
        elif t == "logs":
            for k in range(it.get("n", 6)):
                bm = groups.setdefault("log_bark", bmesh.new())
                rr = bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.12, radius2=0.12, depth=1.3)
                bmesh.ops.transform(bm, matrix=Matrix.Translation((x, y + (k % 3) * 0.24, z + 0.12 + (k // 3) * 0.22)) @ Matrix.Rotation(math.pi / 2, 4, "Y"), verts=rr["verts"])
        elif t == "scrap":
            for k in range(it.get("n", 6)):
                box("iron_rusted", (x + random.uniform(-0.5, 0.5), y + random.uniform(-0.4, 0.4), z + random.uniform(0.05, 0.3)), (random.uniform(0.3, 0.7), random.uniform(0.08, 0.3), random.uniform(0.05, 0.2)), random.uniform(0, 180))
        elif t == "hole":  # 얼음 구멍
            cyl("shadow", (x, y, z + 0.012), 0.24, 0.24, 0.02, 16)
    for material, bm in groups.items():
        new_obj(cfg["name"] + "_" + material, bm, material)

# ── 최적화: 덧붙인 조각의 안 보이는 밑면 지우기 · 같은 재질끼리 한 덩어리로 ──
bpy.ops.object.select_all(action="DESELECT")
added = [o for o in bpy.context.scene.objects if o.type == "MESH" and o is not base]
for ob in added:
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target="MESH")  # 수정자 적용
    ob.select_set(False)
    if ob.data.materials and ob.data.materials[0].name in ("snow", "ice_clear"):
        continue
    bm = bmesh.new(); bm.from_mesh(ob.data)
    zmin_by = {}
    # 아래를 보는 면 중 바닥·지붕에 닿은 것(조각 안에서 가장 낮은 높이 근처)은 안 보임
    for island in [bm.faces]:
        pass
    low = [f for f in bm.faces if f.normal.z < -0.95]
    if low:
        zs = sorted(f.calc_center_median().z for f in bm.faces)
        floor = zs[0] + 0.02
        bmesh.ops.delete(bm, geom=[f for f in low if f.calc_center_median().z <= floor + 0.6], context="FACES_ONLY")
    bm.to_mesh(ob.data); bm.free()
by_mat = {}
for ob in added:
    key = ob.data.materials[0].name if ob.data.materials else ""
    by_mat.setdefault(key, []).append(ob)
for key, obs in by_mat.items():
    if len(obs) < 2:
        continue
    bpy.ops.object.select_all(action="DESELECT")
    for ob in obs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.join()
print("ADDED_FACES", sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type == "MESH" and o is not base), "BASE_FACES", len(base.data.polygons))

# ── 저장: 수정자 적용해서 GLB ──
for ob in bpy.context.scene.objects:
    ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_apply=True, use_selection=False)

# ── 미리보기 렌더: 컨셉 시트와 같은 36° 3/4 각도 ──
sc = bpy.context.scene
for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
    try:
        sc.render.engine = eng
        break
    except TypeError:
        pass
sc.render.resolution_x, sc.render.resolution_y = 1200, 800
world = bpy.data.worlds.new("w"); sc.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.11, 0.14, 0.2, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 2.2; sun.data.color = (0.75, 0.83, 1.0)
sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35))
sc.collection.objects.link(sun)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam); sc.camera = cam
dist = 13.0
el, az = math.radians(36), math.radians(-125)
cam.location = (dist * math.cos(el) * math.cos(az), dist * math.cos(el) * math.sin(az), dist * math.sin(el) + 1.0)
target = Vector((0, 0, 1.0))
cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
cam.data.lens = 50
sc.render.filepath = preview
bpy.ops.render.render(write_still=True)
print("CARVED", kind, dst)
