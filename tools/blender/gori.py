# 주인공 고리 v1 (2026-11-22) — 기준: Handover v1.1 05_아트/characters/고리/고리_전신_정면.png
# 노란 비늘 · 샴페인색 헝클어진 머리깃 · 아래로 향한 작은 부리 · 낡은(기운 자국) 청회색 도포 · 장부 · 허리 주머니와 두루마리 · 긴 꼬리
# 뼈대와 동작(Idle·Walk·Work)은 주민 R09(오비랍토르)의 것을 빌리고, 보이는 것은 전부 새로 깎는다.
# 기준 그림과 좌우를 뒤집음: 이 뼈대의 꼬리가 +X로 휘므로 장부는 +X 손, 주머니는 -X 허리.
# 사용: blender -b --python gori.py -- <R09_Oviraptor.glb> <저장.glb> <미리보기.png>
import bpy, bmesh, sys, math, random
from mathutils import Vector
from mathutils.bvhtree import BVHTree

src, dst, preview = sys.argv[sys.argv.index("--") + 1:][:3]
random.seed(11)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
for o in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
    bpy.data.objects.remove(o)
# 팔을 몸 쪽으로 22도 내려 쉬는 자세로 굳힘 — 기준 그림처럼 소매가 몸을 따라 늘어지게
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
for side, sgn in (("L", -1), ("R", 1)):
    pb = arm.pose.bones[f"arm_{side}_upper"]
    pb.rotation_mode = "XYZ"
    pb.rotation_euler = (0, 0, 0)
    from mathutils import Matrix
    world_axis = Vector((0, -1, 0))  # 앞(-Y) 축으로 돌려 팔을 안쪽으로
    m = arm.matrix_world.inverted() @ Matrix.Rotation(-math.radians(22) * sgn, 4, world_axis) @ arm.matrix_world
    pb.matrix = Matrix.Translation(pb.matrix.to_translation()) @ m @ Matrix.Translation(-pb.matrix.to_translation()) @ pb.matrix
bpy.ops.pose.armature_apply(selected=False)
bpy.ops.object.mode_set(mode="OBJECT")
BN = {b.name: (arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in arm.data.bones}
V = Vector


# ── 재질 (sRGB 값 → 선형) ──
def lin(c):
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


MAT = {}
def mat(name, rgb, rough=0.8):
    if name not in MAT:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        p.inputs["Base Color"].default_value = (*lin(rgb), 1)
        p.inputs["Roughness"].default_value = rough
        pattern(m, p, name, rgb)
        MAT[name] = m
    return MAT[name]


def pattern(m, p, name, rgb):
    """구울 결: 도포 = 소용돌이 무늬, 피부 = 비늘, 머리깃 = 가닥 결, 천·가죽 = 잔 얼룩"""
    N, L = m.node_tree.nodes, m.node_tree.links
    kind = {"robe": "robe", "skin": "scale", "belly": "scale", "hair": "hair", "hair2": "hair",
            "pants": "cloth", "sash": "cloth", "pouch": "cloth", "book": "cloth", "patch": "cloth", "collar": "cloth"}.get(name)
    if not kind:
        return
    tc = N.new("ShaderNodeTexCoord")
    mix = N.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    a, b = [i for i in mix.inputs if i.type == "RGBA"][:2]
    out = next(o for o in mix.outputs if o.type == "RGBA")
    lo = lambda k: (*lin(tuple(min(1, c * k) for c in rgb)), 1)
    if kind == "robe":  # 은은한 소용돌이 무늬 (밝게)
        t = N.new("ShaderNodeTexWave")
        t.wave_type = "RINGS"
        t.inputs["Scale"].default_value = 9
        t.inputs["Distortion"].default_value = 10
        t.inputs["Detail"].default_value = 3
        fac = t.outputs["Fac"]
        a.default_value, b.default_value = lo(0.94), lo(1.12)
    elif kind == "scale":  # 비늘: 칸 가운데 밝고 가장자리 어둡게
        t = N.new("ShaderNodeTexVoronoi")
        t.inputs["Scale"].default_value = 70
        fac = t.outputs["Distance"]
        a.default_value, b.default_value = lo(1.04), lo(0.9)
    elif kind == "hair":  # 위아래로 흐르는 가닥 결
        t = N.new("ShaderNodeTexWave")
        t.wave_type = "BANDS"
        t.bands_direction = "Z"
        t.inputs["Scale"].default_value = 6
        t.inputs["Distortion"].default_value = 14
        t.inputs["Detail"].default_value = 4
        fac = t.outputs["Fac"]
        a.default_value, b.default_value = lo(0.92), lo(1.1)
    else:  # 천·가죽 잔 얼룩
        t = N.new("ShaderNodeTexNoise")
        t.inputs["Scale"].default_value = 40
        fac = t.outputs["Fac"]
        a.default_value, b.default_value = lo(0.86), lo(1.1)
    L.new(tc.outputs["Object"], t.inputs["Vector"])
    L.new(fac, mix.inputs[0])
    L.new(out, p.inputs["Base Color"])


SKIN = ("skin", (0.86, 0.72, 0.46))
BELLY = ("belly", (0.93, 0.84, 0.62))
HAIR = ("hair", (0.90, 0.76, 0.52))
HAIR2 = ("hair2", (0.78, 0.62, 0.40))
BEAK = ("beak", (0.52, 0.40, 0.28))
EYE = ("eye", (0.70, 0.46, 0.10))
CLAW = ("claw", (0.14, 0.12, 0.15))
ROBE = ("robe", (0.50, 0.47, 0.66))
COLLAR = ("collar", (0.28, 0.23, 0.40))
INNER = ("inner", (0.86, 0.82, 0.78))
TRIM = ("trim", (0.74, 0.70, 0.74))
SHADE = ("shade", (0.20, 0.18, 0.26))
SASH = ("sash", (0.36, 0.22, 0.17))
PANTS = ("pants", (0.36, 0.25, 0.18))
WRAP = ("wrap", (0.88, 0.85, 0.79))
BOOK = ("book", (0.47, 0.38, 0.29))
PAGES = ("pages", (0.88, 0.83, 0.70))
POUCH = ("pouch", (0.52, 0.44, 0.35))
PATCH = ("patch", (0.56, 0.50, 0.46))
JADE = ("jade", (0.22, 0.58, 0.50))
WHITE = ("white", (0.97, 0.95, 0.90))

PARTS = []  # (오브젝트, 움직일 뼈 목록)


def new_obj(name, bm, mats, bones, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for f in me.polygons:
        f.use_smooth = smooth
    for k in mats:
        me.materials.append(mat(*k))
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    PARTS.append((o, bones))
    return o


def loft(bm, pts, radii, segs=14, normals=None, up=V((0, 0, 1)), cap0=False, cap1=False,
         seg_mat=None, cap_mat=0, closed=False):
    """점들을 따라 타원 고리를 이어 관을 만든다. radii[i] = (가로, 세로). 세로 축 = normals[i](없으면 up을 굴려 옮김)"""
    n = len(pts)
    rings, N = [], None
    for i, p in enumerate(pts):
        a = pts[i - 1] if i > 0 else (pts[-2] if closed else p)
        b = pts[i + 1] if i < n - 1 else (pts[1] if closed else p)
        T = (b - a).normalized()
        h = normals[i] if normals else (N if N is not None else (up if abs(up.dot(T)) < 0.95 else V((0, -1, 0))))
        N = (h - h.dot(T) * T).normalized()
        X = T.cross(N)
        rx, ry = radii[i]
        rings.append([bm.verts.new(p + X * (rx * math.cos(t)) + N * (ry * math.sin(t)))
                      for t in (2 * math.pi * k / segs for k in range(segs))])
    for i in range(n - 1):
        for k in range(segs):
            f = bm.faces.new((rings[i][k], rings[i][(k + 1) % segs], rings[i + 1][(k + 1) % segs], rings[i + 1][k]))
            f.material_index = seg_mat(i) if seg_mat else 0
    for end, cap, r, c in ((0, cap0, rings[0], pts[0]), (1, cap1, rings[-1], pts[-1])):
        if cap:
            m = bm.verts.new(c)
            for k in range(segs):
                f = bm.faces.new((r[k], r[(k + 1) % segs], m) if end else (r[(k + 1) % segs], r[k], m))
                f.material_index = cap_mat
    return rings


def smooth_path(pts, sub=3):
    """캣멀롬으로 점 사이를 채움"""
    out = []
    for i in range(len(pts) - 1):
        p0, p1, p2 = pts[max(i - 1, 0)], pts[i], pts[i + 1]
        p3 = pts[min(i + 2, len(pts) - 1)]
        for s in range(sub):
            t = s / sub
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-1])
    return out


def ellipsoid(bm, c, r, segs=12, rings=8):
    m = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1)
    for v in m["verts"]:
        v.co = V((c[0] + v.co.x * r[0], c[1] + v.co.y * r[1], c[2] + v.co.z * r[2]))


def plate(bm, c, u, v, size, thick, mi=0):
    """c 중심, u·v 방향의 얇은 판"""
    n = u.cross(v).normalized()
    m = bmesh.ops.create_cube(bm, size=1)
    for vert in m["verts"]:
        x, y, z = vert.co
        vert.co = c + u * (x * size[0]) + v * (y * size[1]) + n * (z * thick)
    for f in {f for vert in m["verts"] for f in vert.link_faces}:
        f.material_index = mi


def cone(bm, a, b, r, segs=8):
    loft(bm, [a, a.lerp(b, 0.5), b], [(r, r), (r * 0.6, r * 0.6), (0.001, 0.001)], segs, cap0=True)


# ── 도포 몸판: 높이별 (z, 가로 반지름, 앞뒤 반지름) ──
ROBE_RINGS = [(1.70, 0.09, 0.08), (1.63, 0.12, 0.092), (1.57, 0.165, 0.105), (1.53, 0.20, 0.115), (1.42, 0.215, 0.13), (1.28, 0.20, 0.13),
              (1.14, 0.175, 0.125), (0.98, 0.205, 0.145), (0.75, 0.245, 0.17), (0.52, 0.255, 0.18), (0.39, 0.262, 0.184), (0.33, 0.265, 0.186)]


def robe_r(z):
    for (z0, a0, b0), (z1, a1, b1) in zip(ROBE_RINGS, ROBE_RINGS[1:]):
        if z1 <= z <= z0:
            t = (z0 - z) / (z0 - z1)
            return a0 + (a1 - a0) * t, b0 + (b1 - b0) * t
    return ROBE_RINGS[-1][1:]


def robe_pt(th, z, off=0.0):
    """도포 겉면의 점 (th=0 앞, +는 +X쪽)과 바깥 방향"""
    rx, ry = robe_r(z)
    p = V((rx * math.sin(th), -ry * math.cos(th), z))
    n = V((math.sin(th) / rx, -math.cos(th) / ry, 0)).normalized()
    return p + n * off, n


# 도포 (끝단 띠는 밝은 천, 위 뚜껑은 속옷)
bm = bmesh.new()
pts = [V((0, 0.0, z)) for z, _, _ in ROBE_RINGS]
loft(bm, pts, [(a, b) for _, a, b in ROBE_RINGS], 28, up=V((0, -1, 0)), cap0=True, cap_mat=2,
     seg_mat=lambda i: 1 if i == len(ROBE_RINGS) - 2 else 0)
for v in bm.verts:  # 세로 주름: 허리 아래로 갈수록 깊게
    t = max(0.0, min(1.0, (1.1 - v.co.z) / 0.75))
    if t > 0:
        th = math.atan2(v.co.x, -v.co.y)
        k = 1 + 0.045 * t * math.sin(11 * th + 0.7) + 0.02 * t * math.sin(23 * th)
        v.co.x *= k
        v.co.y *= k
# 기운 자국 (조각 천)
for th, z, w, h in [(0.55, 0.52, 0.09, 0.10), (-1.0, 0.80, 0.08, 0.09), (2.7, 0.60, 0.10, 0.11)]:
    p, n = robe_pt(th, z, 0.014)
    u = V((0, 0, 1)).cross(n).normalized()
    rot = random.uniform(-0.2, 0.2)
    plate(bm, p, u * math.cos(rot) + V((0, 0, 1)) * math.sin(rot), V((0, 0, 1)) * math.cos(rot) - u * math.sin(rot),
          (w, h), 0.006, mi=3)
new_obj("robe", bm, [ROBE, TRIM, INNER, PATCH],
        ["spine", "chest", "pelvis", "leg_L_upper", "leg_R_upper", "arm_L_upper", "arm_R_upper"])

# 깃(짙은 보라) + 동정(흰 띠): 오른 섶이 왼쪽 위로 여며져 허리 아래로
bm = bmesh.new()
collar = [V(p) for p in [(0.035, -0.128, 1.40), (0.055, -0.112, 1.47), (0.08, -0.08, 1.64), (0.094, 0.03, 1.70),
                         (0.0, 0.085, 1.71), (-0.094, 0.03, 1.70), (-0.08, -0.08, 1.64), (-0.035, -0.128, 1.46),
                         (0.05, -0.142, 1.33), (0.125, -0.135, 1.19)]]
cp = smooth_path(collar, 3)
out = [V((p.x, p.y, 0)).normalized() for p in cp]
loft(bm, cp, [(0.032, 0.008)] * len(cp), 6, normals=out)
inner = [p + V((0, 0, 0.012)) - o * 0.022 + V((0, 0, 0)) for p, o in zip(cp, out)]
loft(bm, inner[3:-3], [(0.012, 0.006)] * len(inner[3:-3]), 6, normals=out[3:-3], seg_mat=lambda i: 1)
new_obj("collar", bm, [COLLAR, INNER], ["chest", "neck", "spine"])

# 허리띠 + 매듭 + 늘어진 끈
bm = bmesh.new()
belt = [robe_pt(2 * math.pi * k / 24, 1.14, 0.012)[0] for k in range(25)]
loft(bm, belt, [(0.012, 0.036)] * 25, 6, closed=True)
knot, kn = robe_pt(0.55, 1.14, 0.03)
ellipsoid(bm, knot, (0.03, 0.025, 0.028), 10, 6)
for s in (-1, 1):
    ellipsoid(bm, knot + V((s * 0.045, -0.01, 0.012 * s)), (0.04, 0.018, 0.022), 10, 6)
strip = [robe_pt(0.12, z, 0.016)[0] for z in (1.12, 0.95, 0.78, 0.62)]
loft(bm, strip, [(0.028, 0.006)] * 4, 6, normals=[robe_pt(0.12, z)[1] for z in (1.12, 0.95, 0.78, 0.62)], cap1=True)
loft(bm, [robe_pt(0.62, z, 0.018)[0] for z in (1.12, 0.98, 0.86)], [(0.02, 0.005)] * 3, 6,
     normals=[robe_pt(0.62, z)[1] for z in (1.12, 0.98, 0.86)], cap1=True)
new_obj("sash", bm, [SASH], ["pelvis", "spine"])

# 주머니 + 두루마리 (-X 허리)
bm = bmesh.new()
pc, pn = robe_pt(-1.25, 0.98, 0.035)
pu = V((0, 0, 1)).cross(pn).normalized()
plate(bm, pc, pu, V((0, 0, 1)), (0.11, 0.13), 0.05)
plate(bm, pc + V((0, 0, 0.04)) + pn * 0.028, pu, V((0, 0, 1)), (0.115, 0.06), 0.01, mi=1)
sc, sn = robe_pt(-1.55, 0.95, 0.04)
loft(bm, [sc + V((0, 0, -0.15)), sc + V((0, 0.0, 0.16))], [(0.028, 0.028)] * 2, 10, cap0=True, cap1=True, seg_mat=lambda i: 2)
for z in (-0.05, 0.07):
    loft(bm, [sc + V((0, 0, z)), sc + V((0, 0, z + 0.012))], [(0.031, 0.031)] * 2, 10, seg_mat=lambda i: 3)
loft(bm, [pc + V((0, 0, 0.07)), robe_pt(-1.1, 1.14, 0.01)[0]], [(0.006, 0.006)] * 2, 5, seg_mat=lambda i: 3)
new_obj("pouch", bm, [POUCH, SASH, PAGES, SASH], ["pelvis"])

# 목 + 머리 + 부리 + 눈 (v2: 목 굵게·짧아 보이게, 머리 크게, 주둥이 짧게)
bm = bmesh.new()
loft(bm, [V((0, 0.0, 1.52)), V((0, -0.01, 1.72)), V((0, 0.0, 1.88)), V((0, 0.03, 1.97))],
     [(0.066, 0.066), (0.062, 0.062), (0.064, 0.066), (0.075, 0.075)], 14)
new_obj("neck", bm, [SKIN], ["neck", "chest", "head"])
bm = bmesh.new()
head = [V(p) for p in [(0, 0.105, 2.015), (0, 0.075, 2.017), (0, 0.0, 2.005), (0, -0.075, 1.985), (0, -0.135, 1.958),
                       (0, -0.18, 1.935), (0, -0.21, 1.918), (0, -0.226, 1.908)]]
hr = [0.035, 0.09, 0.114, 0.104, 0.078, 0.054, 0.032, 0.01]
hp = smooth_path(head, 3)
hrs = [hr[0]] + [hr[min(len(hr) - 1, (i + 2) // 3)] * 0.0 + (hr[i // 3] + (hr[min(len(hr) - 1, i // 3 + 1)] - hr[i // 3]) * ((i % 3) / 3)) for i in range(1, len(hp))]
loft(bm, hp, [(r, r * 0.9) for r in hrs], 28, cap0=True, cap1=True)
bm.normal_update()
HEAD_BVH = BVHTree.FromBMesh(bm)
new_obj("head", bm, [SKIN], ["head"])
bm = bmesh.new()
loft(bm, [V((0, -0.214, 1.918)), V((0, -0.229, 1.902)), V((0, -0.232, 1.884))], [(0.016, 0.014), (0.01, 0.009), (0.002, 0.002)], 10, cap0=True)
new_obj("beak", bm, [BEAK], ["head"])
# 눈 v3: 머리 겉면에 납작하게 앉힌 아몬드 겹 (건포도처럼 튀어나온 알 금지)
#  짙은 테 → 호박색 눈(살짝 볼록) → 세로 동공 → 빛점, 그 위를 무거운 윗눈꺼풀이 덮어 지친 눈매
def almond(bm, P, n, u, a, b, lift, dome=0.0, shift=V((0, 0, 0)), pointy=0.35, upper_only=False, segs=28):
    v = n.cross(u).normalized()
    c = P + n * lift + u * shift.x + v * shift.y
    ring, inner = [], []
    for k in range(segs):
        t = 2 * math.pi * k / segs
        x = a * math.cos(t)
        y = b * math.sin(t) * (1 - abs(math.cos(t))) ** pointy
        if upper_only and y < 0:
            y *= 0.15
        ring.append(bm.verts.new(c + u * x + v * y))
        inner.append(bm.verts.new(c + u * x * 0.5 + v * y * 0.5 + n * dome * 0.75))
    m = bm.verts.new(c + n * dome)
    for k in range(segs):
        k2 = (k + 1) % segs
        bm.faces.new((ring[k], ring[k2], inner[k2], inner[k]))
        bm.faces.new((inner[k], inner[k2], m))


def eye_frame(s):
    d = V((s * 0.5, -0.85, 0.08)).normalized()
    c = V((0, -0.06, 1.985))
    hit, n, _, _ = HEAD_BVH.ray_cast(c + d * 0.4, -d)
    n = n.normalized()
    if n.dot(d) < 0:
        n = -n
    u = V((0, 0, 1)).cross(n).normalized()  # 눈의 가로 방향(앞뒤로 누운 선)
    if u.y > 0:
        u = -u  # u = 앞쪽(눈앞머리) 방향
    tilt = math.radians(-12)  # 눈꼬리(뒤쪽)가 살짝 처짐
    v = n.cross(u)
    u = (u * math.cos(tilt) + v * math.sin(tilt) * s * 0 + v * math.sin(tilt)).normalized()
    return hit, n, u


bm_line, bm_iris, bm_dot, bm_lid = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
for s in (-1, 1):
    P, n, u = eye_frame(s)
    almond(bm_line, P, n, u, 0.031, 0.017, 0.0015, 0.002)  # 짙은 테
    almond(bm_iris, P, n, u, 0.025, 0.0125, 0.003, 0.0035, shift=V((-0.002, -0.001, 0)))  # 호박색 눈
    almond(bm_line, P, n, u, 0.0045, 0.011, 0.0055, 0.0015, shift=V((-0.001, -0.0015, 0)), pointy=0.6)  # 세로 동공
    almond(bm_dot, P, n, u, 0.0035, 0.0035, 0.0072, 0.0005, shift=V((0.005, 0.004, 0)), pointy=0)  # 빛점
    almond(bm_lid, P, n, u, 0.035, 0.02, 0.0068, 0.006, shift=V((0, 0.0062, 0)), upper_only=True)  # 윗눈꺼풀
new_obj("eyeline", bm_line, [CLAW], ["head"], smooth=False)
new_obj("eyes", bm_iris, [EYE], ["head"])
new_obj("eyehi", bm_dot, [WHITE], ["head"], smooth=False)
new_obj("lids", bm_lid, [SKIN], ["head"])

# 머리깃 v3: 넓적한 곱슬 타래가 부풀었다가 흘러내리고 끝이 바깥으로 둥글게 말림 + 얼굴 옆을 감싸는 옆머리
bm = bmesh.new()
C = V((0, 0.035, 2.07))
ellipsoid(bm, C, (0.11, 0.115, 0.07), 16, 10)
UP, DOWN = V((0, 0, 1)), V((0, 0, -1))
def dense(pts, rad, nrm):
    P = smooth_path(pts, 2)
    f = lambda i: i / 2
    R = [tuple(rad[int(f(i))][k] + (rad[min(len(rad) - 1, int(f(i)) + 1)][k] - rad[int(f(i))][k]) * (f(i) % 1) for k in (0, 1))
         for i in range(len(P))]
    return P, [(x, y * 1.15) for x, y in R], [nrm[min(len(nrm) - 1, int(f(i)))] for i in range(len(P))]


def lock(root, d, L, w, curl_dir, front=False):
    hz = V((d.x, d.y, 0)).normalized()
    p1 = root + (d * 0.6 + UP * 0.25).normalized() * L * 0.2
    p2 = p1 + (hz * 0.4 + DOWN * 0.8 + curl_dir * 0.15).normalized() * L * 0.32
    p3 = p2 + (hz * 0.12 + DOWN + curl_dir * 0.2).normalized() * L * 0.28
    # 끝 말림: 살짝 바깥 → 위로 되감김
    p4 = p3 + (hz * 0.7 + DOWN * 0.3 + curl_dir * 0.4).normalized() * L * 0.12
    p5 = p4 + (hz * 0.3 + UP * 0.8 + curl_dir * 0.3).normalized() * L * 0.08
    pts = [root - d * 0.02, p1, p2, p3, p4, p5]
    if front:
        side = V((1 if d.x >= 0 else -1, 0, 0))
        for q, a, zmin in ((pts[2], 0.035, 2.06), (pts[3], 0.06, 2.045), (pts[4], 0.07, 2.04), (pts[5], 0.072, 2.045)):
            q += side * a
            q.z = max(q.z, zmin)
    nrm = [(hz + UP * 0.5).normalized()] * 2 + [hz] * 4
    rad = [(w, 0.022), (w, 0.024), (w * 0.9, 0.02), (w * 0.7, 0.016), (w * 0.45, 0.012), (0.004, 0.004)]
    return pts, rad, nrm
for k in range(72):
    az = random.uniform(-math.pi, math.pi)  # 0 = 뒤(+Y)
    el = random.uniform(0.25, 1.25)
    d = V((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))
    front = d.y < -0.3
    root = C + V((d.x * 0.092, d.y * 0.1, d.z * 0.06))
    L = random.uniform(0.09, 0.13) if front else (random.uniform(0.07, 0.11) if el > 0.95 else random.uniform(0.14, 0.2))
    cd = V((random.uniform(-1, 1), random.uniform(-1, 1), 0)).normalized()
    pts, rad, nrm = lock(root, d, L, random.uniform(0.045, 0.06), cd, front)
    loft(bm, *dense(pts, rad, nrm)[:2], 8, normals=dense(pts, rad, nrm)[2], seg_mat=lambda i, k=k: 1 if (k % 3 == 0 and i >= 4) else 0)
for s in (-1, 1):  # 옆머리: 관자놀이에서 뺨 옆으로
    for j in range(3):
        root = V((s * (0.085 + 0.01 * j), -0.06 + 0.035 * j, 2.06))
        d = V((s * 0.8, -0.3, 0.2)).normalized()
        pts, rad, nrm = lock(root, d, 0.2 - 0.02 * j, 0.05, V((0, -1, 0)))
        loft(bm, *dense(pts, rad, nrm)[:2], 8, normals=dense(pts, rad, nrm)[2])
new_obj("hair", bm, [HAIR, HAIR2], ["head"])

# 목걸이 (끈 + 옥)
bm = bmesh.new()
ellipsoid(bm, (0, -0.112, 1.575), (0.014, 0.008, 0.019), 8, 6)
new_obj("jade", bm, [JADE], ["chest"])

# 소매: 넓게 퍼지는 통 + 끝동(밝은 띠) + 안쪽 그늘
for s, side in ((-1, "L"), (1, "R")):
    sh, el = BN[f"arm_{side}_upper"]
    _, wr = BN[f"arm_{side}_lower"]
    bm = bmesh.new()
    # v2: 어깨 안쪽에서 시작해 손목 아래까지 늘어지는 넓은 소매
    path = [V((s * 0.12, 0.0, 1.51)), sh.lerp(el, 0.5), el + V((s * 0.01, 0.0, -0.02)),
            el.lerp(wr, 0.6) + V((s * 0.012, 0.01, -0.03)), wr + V((s * 0.01, 0.02, -0.05)), wr + V((s * 0.0, 0.03, -0.1))]
    loft(bm, path, [(0.07, 0.07), (0.092, 0.088), (0.112, 0.105), (0.132, 0.122), (0.15, 0.135), (0.158, 0.14)], 18,
         up=V((0, -1, 0)), cap1=True, cap_mat=2, seg_mat=lambda i: 1 if i == 4 else 0)
    # 소매 어깨 쪽 조각 천
    pp = sh.lerp(el, 0.7) + V((s * 0.075, -0.05, 0.02))
    plate(bm, pp, V((0, 0, 1)), V((0.3 * s, -1, 0)).normalized(),
          (0.08, 0.07), 0.006, mi=3)
    new_obj(f"sleeve_{side}", bm, [ROBE, TRIM, SHADE, PATCH], [f"arm_{side}_upper", f"arm_{side}_lower", "chest"])

    # 손: 손바닥 + 손가락 셋 + 엄지 + 검은 발톱
    hh, ht = BN[f"arm_{side}_hand"]
    bm = bmesh.new()
    wr2 = hh + V((0, 0, -0.02))
    palm = hh + V((0, -0.005, -0.09))
    loft(bm, [wr2, wr2.lerp(palm, 0.5), palm], [(0.026, 0.02), (0.032, 0.022), (0.03, 0.02)], 10, up=V((s, 0, 0)), cap0=True)
    claws = []
    for dx in (-0.018, 0.0, 0.018):
        a = palm + V((0, dx, 0))
        b = a + V((s * 0.004, dx * 0.3 - 0.008, -0.055))
        loft(bm, [a, b], [(0.009, 0.009), (0.007, 0.007)], 8, cap1=True)
        claws.append((b, b + V((0, -0.006, -0.022))))
    th0 = wr2.lerp(palm, 0.6) + V((-s * 0.005, -0.022, 0))
    loft(bm, [th0, th0 + V((-s * 0.012, -0.03, -0.03))], [(0.009, 0.009), (0.007, 0.007)], 8, cap1=True)
    new_obj(f"hand_{side}", bm, [SKIN], [f"arm_{side}_hand"])
    bm = bmesh.new()
    for a, b in claws:
        cone(bm, a, b, 0.007)
    new_obj(f"handclaw_{side}", bm, [CLAW], [f"arm_{side}_hand"], smooth=False)

    # 바지 (부풀고 발목에서 조임) + 발목 감개 + 발 + 발가락 셋·뒷발가락 + 발톱
    lu, lk = BN[f"leg_{side}_upper"]
    _, la = BN[f"leg_{side}_lower"]
    x = la.x
    bm = bmesh.new()
    loft(bm, [V((x, -0.025, 0.46)), V((x, -0.03, 0.33)), V((x, -0.01, 0.22)), V((x, 0.015, 0.16))],
         [(0.085, 0.085), (0.095, 0.092), (0.08, 0.078), (0.05, 0.05)], 14, cap0=True)
    new_obj(f"pants_{side}", bm, [PANTS], [f"leg_{side}_upper", f"leg_{side}_lower"])
    bm = bmesh.new()
    for i, z in enumerate((0.085, 0.115, 0.145)):
        tilt = V((0.0, 0.01 * (i - 1), 0))
        loft(bm, [V((x, 0.02, z - 0.016)) + tilt, V((x, 0.02, z)) - tilt, V((x, 0.02, z + 0.016)) + tilt],
             [(0.044, 0.044), (0.05, 0.05), (0.044, 0.044)], 12)
    new_obj(f"wrap_{side}", bm, [WRAP], [f"leg_{side}_lower", f"leg_{side}_foot"])
    bm = bmesh.new()
    loft(bm, [V((x, 0.035, 0.10)), V((x, -0.01, 0.06)), V((x, -0.04, 0.04))], [(0.04, 0.035), (0.042, 0.03), (0.038, 0.022)], 10,
         up=V((0, 0, 1)), cap1=True)
    tclaws = []
    for ang in (-0.42, 0.0, 0.42):
        d = V((math.sin(ang) * (1 if True else 1), -math.cos(ang), 0))
        a = V((x, -0.035, 0.035))
        m = a + d * 0.07 + V((0, 0, 0.012))
        b = a + d * 0.13 + V((0, 0, -0.012))
        loft(bm, [a, m, b], [(0.022, 0.02), (0.018, 0.016), (0.013, 0.012)], 8, cap1=True)
        tclaws.append((b - d * 0.005, b + d * 0.045 + V((0, 0, -0.022))))
    a = V((x, 0.03, 0.05))
    loft(bm, [a, a + V((s * 0.01, 0.05, -0.03))], [(0.014, 0.014), (0.009, 0.009)], 8, cap1=True)
    new_obj(f"foot_{side}", bm, [SKIN], [f"leg_{side}_foot", f"leg_{side}_lower"])
    bm = bmesh.new()
    for a, b in tclaws:
        cone(bm, a, b, 0.012)
    new_obj(f"toeclaw_{side}", bm, [CLAW], [f"leg_{side}_foot"], smooth=False)

# 장부 (+X 손에 쥠): 겉장 + 밝은 책장 + 짙은 묶음 끈
hh, ht = BN["arm_R_hand"]
bm = bmesh.new()
bc = hh + V((0.04, -0.03, -0.12))
plate(bm, bc, V((0, -1, 0.15)).normalized(), V((0, 0.15, 1)).normalized(), (0.15, 0.2), 0.04, mi=0)
plate(bm, bc + V((0, -0.006, 0)), V((0, -1, 0.15)).normalized(), V((0, 0.15, 1)).normalized(), (0.142, 0.19), 0.044, mi=1)
for z in (-0.06, 0.0, 0.06):
    plate(bm, bc + V((0, 0.072, z)), V((1, 0, 0)), V((0, 0.15, 1)).normalized(), (0.05, 0.01), 0.008, mi=2)
new_obj("book", bm, [BOOK, PAGES, SASH], ["arm_R_hand"], smooth=False)

# 꼬리: 뼈를 따라 길게 가늘어지며 끝이 들림, 아랫면은 밝은 배 비늘
tp = [V((0, 0.06, 0.92))] + [BN[f"tail_{i}"][0] for i in range(1, 7)] + [BN["tail_6"][1]]
tp = smooth_path(tp, 3)
n = len(tp)
bm = bmesh.new()
loft(bm, tp, [(0.115 * (1 - i / n) ** 1.25 + 0.008,) * 2 for i in range(n)], 14, cap1=True)
bm.normal_update()
for f in bm.faces:
    f.material_index = 1 if f.normal.z < -0.35 else 0
new_obj("tail", bm, [SKIN, BELLY], ["pelvis"] + [f"tail_{i}" for i in range(1, 7)])


# 머리 무리를 1.25배 (기준 그림의 머리 비율) — 눈높이 근처를 중심으로 키워 목을 덮음
P = V((0, -0.03, 1.99))
for o, _ in PARTS:
    if o.name in ("head", "beak", "eyes", "eyeline", "eyehi", "lids", "hair"):
        for v in o.data.vertices:
            v.co = P + (v.co - P) * 1.35 + V((0, -0.01, -0.06))

# ── 뼈에 묶기: 허락된 뼈 마디까지의 거리로 가중치 (가까운 셋) ──
def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + ab * t)).length


for o, bones in PARTS:
    me = o.data
    groups = {b: o.vertex_groups.new(name=b) for b in bones}
    for v in me.vertices:
        p = o.matrix_world @ v.co
        ws = sorted(((1 / (seg_dist(p, *BN[b]) + 0.02) ** 4, b) for b in bones), reverse=True)[:3]
        tot = sum(w for w, _ in ws)
        for w, b in ws:
            groups[b].add([v.index], w / tot, "REPLACE")

bpy.ops.object.select_all(action="DESELECT")
for o, _ in PARTS:
    o.select_set(True)
bpy.context.view_layer.objects.active = PARTS[0][0]
bpy.ops.object.join()
gori = bpy.context.view_layer.objects.active
gori.name = "GORI"
gori.parent = arm
mod = gori.modifiers.new("Armature", "ARMATURE")
mod.object = arm
tris = sum(len(p.vertices) - 2 for p in gori.data.polygons)
print("TRIS", tris)
import numpy as np
TEX = 1024
sc = bpy.context.scene
me = gori.data
me.uv_layers.active = me.uv_layers.new(name="bake")
bpy.ops.object.select_all(action="DESELECT")
gori.select_set(True)
bpy.context.view_layer.objects.active = gori
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
bpy.ops.object.mode_set(mode="OBJECT")
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.render.bake.margin = 6
sc.render.bake.use_clear = True


def bake_one(kind, samples, **kw):
    img = bpy.data.images.new("g_bake_" + kind, TEX, TEX, alpha=False)
    for m in me.materials:
        n = m.node_tree.nodes.new("ShaderNodeTexImage")
        n.image = img
        m.node_tree.nodes.active = n
    sc.cycles.samples = samples
    bpy.ops.object.bake(type=kind, **kw)
    px = np.empty(TEX * TEX * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(TEX, TEX, 4)


color = bake_one("DIFFUSE", 4, pass_filter={"COLOR"})
ao = bake_one("AO", 16)[..., :1]
rgb = color[..., :3] * (0.78 + 0.22 * np.clip(ao, 0, 1))
final = bpy.data.images.new("GORI_tex", TEX, TEX, alpha=False)
final.pixels.foreach_set(np.dstack([np.clip(rgb, 0, 1), np.ones((TEX, TEX, 1), np.float32)]).astype(np.float32).ravel())
final.pack()
baked = bpy.data.materials.new("GORI")
baked.use_nodes = True
t = baked.node_tree.nodes.new("ShaderNodeTexImage")
t.image = final
pb = next(n for n in baked.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
baked.node_tree.links.new(t.outputs[0], pb.inputs["Base Color"])
pb.inputs["Roughness"].default_value = 0.85
me.materials.clear()
me.materials.append(baked)
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_animations=True, export_image_format="JPEG")

# ── 미리보기: 앞 · 옆 · 뒤 비스듬히 · 게임 카메라(36° 내려다봄) 네 장을 한 장으로 ──
sc = bpy.context.scene
try:
    sc.render.engine = "BLENDER_EEVEE"
except TypeError:
    sc.render.engine = "BLENDER_EEVEE_NEXT"
sc.render.resolution_x, sc.render.resolution_y = 420, 620
sc.render.film_transparent = False
w = bpy.data.worlds.new("w")
sc.world = w
w.use_nodes = True
next(n for n in w.node_tree.nodes if n.type == "BACKGROUND").inputs[0].default_value = (0.75, 0.73, 0.70, 1)
bpy.ops.object.light_add(type="SUN", rotation=(0.9, 0.15, 0.5))
bpy.context.object.data.energy = 3.5
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.type = "ORTHO"
cam.data.ortho_scale = 2.6
tgt = V((0.25, 0.2, 1.05))
idle = bpy.data.actions.get("Idle")
if idle:
    arm.animation_data_create()
    arm.animation_data.action = idle
    try:
        arm.animation_data.action_slot = idle.slots[0]
    except Exception:
        pass
    sc.frame_set(int(sum(idle.frame_range) / 2))
import numpy as np
tiles = []
for i, (az, elv) in enumerate([(0, 0), (90, 0), (150, 15), (20, 36)]):
    a, e = math.radians(az), math.radians(elv)
    d = V((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    cam.location = tgt + d * 6
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    f = preview.replace(".png", f"_{i}.png")
    sc.render.filepath = f
    bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(f)
    tiles.append(np.array(im.pixels[:]).reshape(im.size[1], im.size[0], 4))
cam.data.ortho_scale = 0.55
for az in (0, 35):
    a = math.radians(az)
    d = V((math.sin(a), -math.cos(a), 0.05))
    cam.location = V((0, -0.08, 1.98)) + d * 4
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    f = preview.replace(".png", f"_face{az}.png")
    sc.render.resolution_x, sc.render.resolution_y = 310, 620
    sc.render.filepath = f
    bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(f)
    tiles.append(np.array(im.pixels[:]).reshape(im.size[1], im.size[0], 4))
row = np.concatenate(tiles, axis=1)
out = bpy.data.images.new("row", row.shape[1], row.shape[0])
out.pixels = row.ravel()
out.filepath_raw = preview
out.file_format = "PNG"
out.save()
print("PREVIEW", preview)
