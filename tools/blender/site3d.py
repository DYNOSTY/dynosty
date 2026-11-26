# 자원 터 여섯 곳 — 부품으로 깎아 구운 입체 (2026-11-21~22). 컨셉: dynosty-art/sites/sites_sheet.png
#   버려진 곳간 · 석탄 노두 · 철광 노두 · 얼음 낚시 못 · 쓰러진 적송 · 얼지 않는 샘
#
# 지나온 길 (다시 하지 말 것):
#   site.py   : 수식 덩어리 + 꼭짓점 색 → 세 번을 깎아도 장난감 같음 ("개 별로")
#   relief.py : 컨셉 그림을 판에 입힘 → "깎은 게 아니라 그린 거 붙인 거" (퇴짜)
# 지금 방식:
#   1) 부품을 실제로 세움: 기둥·도리·서까래·이엉 켜·눈 이불·흙벽·받침돌·섬·독·바구니 (덩어리 하나가 아님)
#   2) 색은 꼭짓점 색이 아니라 절차 재질(결·얼룩·위를 보는 면의 눈) → 그림 한 장으로 구움(bake) + 틈새 그늘(AO)을 곱함
#   3) 게임은 GLB(모양) + JPG(구운 그림)를 읽음 (resource-sites.ts, 이름이 SITE3_로 시작)
# 사용: blender -b --python site3d.py -- <저장 폴더>
#   열어 둔 블렌더에서는 ARGS = [저장 폴더], STAGE = "build"(모양만) | "all"(굽기까지), ONLY = ["COAL", …](그 터만)
import bpy, bmesh, math, os, random, sys
import numpy as np
from mathutils import Matrix, Vector, noise

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else globals().get("ARGS", [])
STAGE = globals().get("STAGE", "all")
TAU = 2 * math.pi


def lin(c):  # 화면에서 보일 색(sRGB)으로 적고 재질에는 선형 값으로 넣음
    return tuple(x**2.2 for x in c)


def sstep(a, b, v):
    t = max(0.0, min(1.0, (v - a) / (b - a)))
    return t * t * (3 - 2 * t)


def nz(x, y=0.0, z=0.0):
    return noise.noise(Vector((x, y, z)))


# ── 장면 비우기 (열어 둔 블렌더에서 다시 돌릴 수 있게) ──
def wipe(o):
    me = o.data
    bpy.data.objects.remove(o, do_unlink=True)
    if me and me.users == 0:
        bpy.data.meshes.remove(me)


COLL = bpy.data.collections.get("SITE3D")
if COLL is None:
    COLL = bpy.data.collections.new("SITE3D")
    bpy.context.scene.collection.children.link(COLL)
for o in list(COLL.objects):
    wipe(o)
for m in list(bpy.data.materials):
    if m.name.startswith("s3_"):
        bpy.data.materials.remove(m)
MATS = {}
SNOW = (0.9, 0.93, 0.98)


# ── 재질: 잡음 → 색 띠. grain = 결 좌표(부품마다 넣어 둔 "grain" 그림 좌표)를 따라 늘인 결 ──
def make_mat(name, ramp, scale=(1, 1, 1), grain=False, detail=6.0, snow=None, weave=None, auxdark=None, auxsnow=False, snowcol=SNOW, rim=None, crack=None):
    m = bpy.data.materials.new("s3_" + name)
    m.use_nodes = True
    N, L = m.node_tree.nodes, m.node_tree.links
    bsdf = N["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 1.0
    if grain:
        src = N.new("ShaderNodeUVMap")
        src.uv_map = "grain"
        vec = src.outputs[0]
    else:
        vec = N.new("ShaderNodeTexCoord").outputs["Object"]

    def math_(op, a, b):
        n = N.new("ShaderNodeMath")
        n.operation = op
        for k, v in enumerate((a, b)):
            if isinstance(v, (int, float)):
                n.inputs[k].default_value = v
            else:
                L.new(v, n.inputs[k])
        return n.outputs[0]

    def mix(col, fac, color):
        mx = N.new("ShaderNodeMix")
        mx.data_type = "RGBA"
        mx.clamp_factor = True
        L.new(fac, mx.inputs[0])
        L.new(col, mx.inputs[6])
        mx.inputs[7].default_value = (*lin(color), 1)
        return mx.outputs[2]

    mp = N.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = scale
    L.new(vec, mp.inputs["Vector"])
    tex = N.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = 1.0
    tex.inputs["Detail"].default_value = detail
    L.new(mp.outputs[0], tex.inputs["Vector"])
    cr = N.new("ShaderNodeValToRGB")
    e = cr.color_ramp.elements
    e[0].position, e[0].color = ramp[0][0], (*lin(ramp[0][1]), 1)
    e[1].position, e[1].color = ramp[-1][0], (*lin(ramp[-1][1]), 1)
    for p, c in ramp[1:-1]:
        e.new(p).color = (*lin(c), 1)
    L.new(tex.outputs[0], cr.inputs[0])
    col = cr.outputs[0]
    if weave:  # 엮은 줄: (촘촘함, 방향 X|Y|Z, 세기, 어두운 색)
        wv = N.new("ShaderNodeTexWave")
        wv.wave_type = "BANDS"
        wv.bands_direction = weave[1]
        wv.inputs["Scale"].default_value = weave[0]
        wv.inputs["Distortion"].default_value = weave[4] if len(weave) > 4 else 1.5  # 다섯째 값 = 줄이 구불거리는 정도
        L.new(vec, wv.inputs["Vector"])
        col = mix(col, math_("MULTIPLY", wv.outputs[1], weave[2]), weave[3])
    if crack:  # 얼음의 금: (촘촘함, 금 굵기, 세기, 금 색)
        vo = N.new("ShaderNodeTexVoronoi")
        vo.feature = "DISTANCE_TO_EDGE"
        vo.inputs["Scale"].default_value = crack[0]
        L.new(vec, vo.inputs["Vector"])
        col = mix(col, math_("MULTIPLY", math_("LESS_THAN", vo.outputs["Distance"], crack[1]), crack[2]), crack[3])
    if auxdark:  # 이엉 켜의 위쪽(윗켜 밑에 깔린 곳)을 어둡게: (세기, 어두운 색)
        au = N.new("ShaderNodeUVMap")
        au.uv_map = "aux"
        sp = N.new("ShaderNodeSeparateXYZ")
        L.new(au.outputs[0], sp.inputs[0])
        col = mix(col, math_("MULTIPLY", math_("SUBTRACT", 1.0, sp.outputs[0]), auxdark[0]), auxdark[1])
    if snow is not None:  # 위를 보는 면에 눈: 문턱이 낮을수록 많이 덮임, 가장자리는 잡음으로 들쭉날쭉
        geo = N.new("ShaderNodeNewGeometry")
        sp = N.new("ShaderNodeSeparateXYZ")
        L.new(geo.outputs["Normal"], sp.inputs[0])
        sn = N.new("ShaderNodeTexNoise")
        sn.inputs["Scale"].default_value = 2.6
        sn.inputs["Detail"].default_value = 3.0
        k = math_("ADD", sp.outputs[2], math_("MULTIPLY", math_("SUBTRACT", sn.outputs[0], 0.5), 0.5))
        if auxsnow:  # 보조 좌표 y만큼 눈을 더 덮음 (바닥 가장자리가 눈밭에 녹게)
            au = N.new("ShaderNodeUVMap")
            au.uv_map = "aux"
            sa = N.new("ShaderNodeSeparateXYZ")
            L.new(au.outputs[0], sa.inputs[0])
            k = math_("ADD", k, sa.outputs[1])
        col = mix(col, math_("MULTIPLY", math_("SUBTRACT", k, snow), 6.0), snowcol)
    if rim:  # 옆을 보는 면(눈 턱)을 푸르게 그늘지움: (세기, 그늘 색) — 흰 눈이 판 한 장으로 뭉개지지 않게
        geo = N.new("ShaderNodeNewGeometry")
        sp = N.new("ShaderNodeSeparateXYZ")
        L.new(geo.outputs["Normal"], sp.inputs[0])
        col = mix(col, math_("MULTIPLY", math_("SUBTRACT", 1.0, sp.outputs[2]), rim[0]), rim[1])
    L.new(col, bsdf.inputs["Base Color"])
    MATS[name] = m


make_mat("thatch", [(0.32, (0.3, 0.22, 0.11)), (0.5, (0.54, 0.42, 0.21)), (0.68, (0.72, 0.6, 0.33))], (46, 2.2, 1), grain=True, auxdark=(0.75, (0.13, 0.09, 0.05)))  # 눈은 재질이 아니라 눈 이불로 (재질 눈은 켜마다 흰 줄이 되어 널빤지처럼 보였음)
make_mat("thatch_dark", [(0.3, (0.07, 0.05, 0.03)), (0.7, (0.2, 0.15, 0.08))], (40, 2, 1), grain=True)
make_mat("wood", [(0.3, (0.2, 0.14, 0.1)), (0.5, (0.37, 0.28, 0.2)), (0.7, (0.52, 0.43, 0.34))], (34, 2.4, 1), grain=True, snow=0.72)
make_mat("wood_in", [(0.3, (0.17, 0.12, 0.08)), (0.5, (0.33, 0.24, 0.17)), (0.7, (0.47, 0.38, 0.29))], (34, 2.4, 1), grain=True)
make_mat("wattle", [(0.3, (0.24, 0.18, 0.11)), (0.5, (0.39, 0.3, 0.19)), (0.7, (0.5, 0.41, 0.27))], (3, 26, 1), grain=True, weave=(30, "Y", 0.7, (0.12, 0.08, 0.05)))
make_mat("stone", [(0.3, (0.3, 0.31, 0.34)), (0.5, (0.45, 0.46, 0.5)), (0.7, (0.6, 0.6, 0.62))], (3, 3, 3), snow=0.62)
make_mat("snow", [(0.3, (0.78, 0.84, 0.95)), (0.5, (0.9, 0.93, 0.98)), (0.7, (0.98, 0.99, 1.0))], (1.9, 1.9, 1.9), detail=2.0, rim=(1.1, (0.55, 0.65, 0.85)))
# 눈밭: 바탕은 짚 섞인 흙, 그 위를 눈밭 색이 덮음. 덮이는 정도는 꼭짓점의 보조 좌표 y (곳간 안과 앞마당만 흙이 드러남).
# 바닥을 따로 판으로 깔았더니 네모 테가 비쳤음 → 눈밭 한 장 안에서 색으로 가름
make_mat("ground", [(0.3, (0.22, 0.17, 0.12)), (0.5, (0.42, 0.33, 0.2)), (0.7, (0.62, 0.52, 0.32))], (7, 7, 7), snow=1.08, auxsnow=True, snowcol=(0.64, 0.69, 0.8))  # 0.76으로는 게임 땅보다 밝아 눈밭이 판으로 떠 보였음
make_mat("sack", [(0.3, (0.64, 0.54, 0.36)), (0.5, (0.8, 0.7, 0.5)), (0.7, (0.92, 0.84, 0.64))], (9, 9, 9), weave=(24, "Z", 0.4, (0.46, 0.36, 0.22)))  # 어두우면 바위로 보였음
make_mat("jar", [(0.3, (0.15, 0.09, 0.07)), (0.5, (0.3, 0.18, 0.13)), (0.7, (0.47, 0.31, 0.22))], (3, 3, 7), snow=0.86)
make_mat("reed", [(0.3, (0.4, 0.3, 0.16)), (0.5, (0.6, 0.48, 0.28)), (0.7, (0.74, 0.62, 0.4))], (8, 8, 8), weave=(52, "Z", 0.6, (0.22, 0.15, 0.07)))
make_mat("grain", [(0.3, (0.66, 0.5, 0.2)), (0.5, (0.85, 0.71, 0.36)), (0.7, (0.95, 0.86, 0.55))], (70, 70, 70), detail=1.0)
make_mat("rope", [(0.3, (0.48, 0.39, 0.24)), (0.7, (0.68, 0.58, 0.38))], (30, 30, 30))


# ── 모양 도우미 ──
def BM():
    bm = bmesh.new()
    return bm, bm.loops.layers.uv.new("grain"), bm.loops.layers.uv.new("aux")


def finish(name, bm, mat, smooth=True, recalc=True):
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth and len(p.vertices) <= 4  # 마구리(여러 모 면)는 납작하게
    me.materials.append(MATS[mat])
    o = bpy.data.objects.new(name, me)
    COLL.objects.link(o)
    return o


def sheet(name, rows, mat, ref, smooth=True, skip=None):
    """점 줄(rows)을 이어 붙인 판. 점 = (자리, 결 좌표, 보조 좌표). 겉이 ref 쪽을 보게 맞춤"""
    bm, g, a = BM()
    vs = [[bm.verts.new(p[0]) for p in row] for row in rows]
    for j in range(len(rows) - 1):
        for i in range(len(rows[j]) - 1):
            if skip and skip(i, j):
                continue
            idx = ((j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i))
            f = bm.faces.new([vs[r][c] for r, c in idx])
            for l, (r, c) in zip(f.loops, idx):
                l[g].uv = rows[r][c][1]
                l[a].uv = rows[r][c][2]
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.normal_update()
    if sum(f.normal.dot(ref) * f.calc_area() for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    return finish(name, bm, mat, smooth, recalc=False)


def log(name, a, b, r0, r1=None, mat="wood", segs=7, seed=0, wob=0.02):
    """통나무: 살짝 굽고 굵기가 고르지 않은 원기둥. 결 좌표 = (둘레, 길이)"""
    a, b = Vector(a), Vector(b)
    r1 = r0 * 0.9 if r1 is None else r1
    d = b - a
    ln = d.length
    d.normalize()
    side = d.cross(Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))).normalized()
    up = d.cross(side)
    rnd = random.Random(seed)
    bm, g, _ = BM()
    st = 4
    rings = []
    for k in range(st + 1):
        t = k / st
        c = a + d * (ln * t)
        if 0 < k < st:
            c += side * rnd.uniform(-wob, wob) + up * rnd.uniform(-wob, wob)
        r = (r0 + (r1 - r0) * t) * rnd.uniform(0.92, 1.08)
        rings.append([bm.verts.new(c + (side * math.cos(TAU * i / segs) + up * math.sin(TAU * i / segs)) * r) for i in range(segs)])
    for k in range(st):
        for i in range(segs):
            j = (i + 1) % segs
            f = bm.faces.new([rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]])
            for l, (ii, kk) in zip(f.loops, ((i, k), (i + 1, k), (i + 1, k + 1), (i, k + 1))):
                l[g].uv = (ii / segs * TAU * r0 + seed * 0.37, kk / st * ln + seed * 1.3)
    bm.faces.new(rings[0])
    bm.faces.new(rings[-1])
    return finish(name, bm, mat)


def lathe(name, c, prof, mat, segs=10, lean=(0.0, 0.0), seed=0, lump=0.0, squash=1.0):
    """돌려 만든 그릇꼴 (섬·독·바구니): prof = (반지름, 높이) 차례. 위아래를 막음"""
    bm, g, _ = BM()
    rings = []
    for r, z in prof:
        ring = []
        for i in range(segs):
            ang = TAU * i / segs
            rr = r * (1 + lump * nz(math.cos(ang) * 1.3 + seed, math.sin(ang) * 1.3, z * 2.2))
            ring.append(bm.verts.new((c[0] + math.cos(ang) * rr + lean[0] * z, c[1] + math.sin(ang) * rr * squash + lean[1] * z, c[2] + z)))
        rings.append(ring)
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        for i in range(segs):
            j = (i + 1) % segs
            f = bm.faces.new([a[i], a[j], b[j], b[i]])
            for l, (ii, kk) in zip(f.loops, ((i, k), (i + 1, k), (i + 1, k + 1), (i, k + 1))):  # 결 좌표 = (둘레, 높이)
                l[g].uv = (ii / segs * TAU * prof[1][0], prof[kk][1])
    bm.faces.new(rings[0])
    bm.faces.new(rings[-1])
    return finish(name, bm, mat)


def stone(name, c, size, seed, rz=0.0, mat="stone"):
    """받침돌: 모서리를 친 상자를 조금 일그러뜨림 (다듬다 만 돌)"""
    bm, _, _ = BM()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.14, segments=1, affect="EDGES")
    rnd = random.Random(seed)
    m = Matrix.Translation(c) @ Matrix.Rotation(rz, 4, "Z") @ Matrix.Rotation(rnd.uniform(-0.1, 0.1), 4, "X") @ Matrix.Diagonal((size[0], size[1], size[2], 1))
    for v in bm.verts:
        v.co = m @ (v.co + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * 0.06)
    return finish(name, bm, mat, smooth=False)


def pillow(name, c, rx, ry, h, seed, mat="snow", segs=10):
    """소복이 얹힌 눈 한 덩이: 가장자리가 고르지 않은 쿠션"""
    bm, _, _ = BM()
    rnd = random.Random(seed)
    ks = [1 + rnd.uniform(-0.16, 0.16) for _ in range(segs)]
    rings = [[bm.verts.new((c[0] + math.cos(TAU * i / segs) * rx * u * ks[i], c[1] + math.sin(TAU * i / segs) * ry * u * ks[i], c[2] + h * zf)) for i in range(segs)] for u, zf in ((1.05, -0.15), (1.0, 0.4), (0.66, 0.85))]
    top = bm.verts.new((c[0], c[1], c[2] + h))
    for a, b in zip(rings, rings[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new([a[i], a[j], b[j], b[i]])
    for i in range(segs):
        bm.faces.new([rings[-1][i], rings[-1][(i + 1) % segs], top])
    bm.faces.new(rings[0])
    return finish(name, bm, mat)


def panel(name, p0, p1, z0, z1, th=0.07, mat="wattle"):
    """벽 한 칸: 두 바닥 점 사이에 세운 얇은 상자. z1 = 높이 또는 (왼쪽 높이, 오른쪽 높이)"""
    a, b = Vector((p0[0], p0[1], 0)), Vector((p1[0], p1[1], 0))
    d = b - a
    ln = d.length
    d.normalize()
    n = Vector((-d.y, d.x, 0)) * th / 2
    zt = z1 if isinstance(z1, tuple) else (z1, z1)
    bm, g, _ = BM()
    v = {}
    for iu in (0, 1):
        for iz in (0, 1):
            for sd in (-1, 1):
                z = z0 if iz == 0 else zt[iu]
                v[(iu, iz, sd)] = (bm.verts.new(a + d * ln * iu + n * sd + Vector((0, 0, z))), (iu * ln, z))
    for quad in (((0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)), ((0, 0, -1), (0, 1, -1), (1, 1, -1), (1, 0, -1)), ((0, 1, -1), (0, 1, 1), (1, 1, 1), (1, 1, -1)), ((0, 0, -1), (0, 0, 1), (0, 1, 1), (0, 1, -1)), ((1, 0, -1), (1, 1, -1), (1, 1, 1), (1, 0, 1))):
        f = bm.faces.new([v[k][0] for k in quad])
        for l, k in zip(f.loops, quad):
            l[g].uv = v[k][1]
    return finish(name, bm, mat, smooth=False)


G = (0.64, 0.69, 0.8)  # 눈밭 색: 게임 땅보다 밝으면 판으로 떠 보임 (0.69로는 게임 화면에서 땅보다 1할쯤 밝았음)
make_mat("coal", [(0.3, (0.08, 0.08, 0.1)), (0.5, (0.15, 0.15, 0.18)), (0.7, (0.26, 0.27, 0.32))], (5, 5, 5), snow=0.8, snowcol=(0.4, 0.42, 0.5), weave=(14, "Z", 0.35, (0.04, 0.04, 0.05)))  # 윗면은 눈 대신 서리빛 — 눈을 얹으면 회색 바위로 보였음
make_mat("earth", [(0.3, (0.2, 0.14, 0.09)), (0.5, (0.33, 0.24, 0.15)), (0.7, (0.46, 0.36, 0.22))], (6, 6, 6), snow=0.78)
# 바위의 지층 줄은 옅고 구불거리게: 고르고 진하면 나뭇결·골함석으로 보였음
# 철광은 줄을 아예 뺌(구워 놓으니 나뭇결) — 잿빛 도는 어두운 갈색에 녹빛 얼룩. 밝은 주황 한 색이면 찰흙으로 보였음
# 게임 빛에서는 블렌더보다 어둡게 나온다 (어두운 갈색은 초콜릿 덩어리로 보였음) → 녹빛을 한 단계 밝게
make_mat("ore", [(0.28, (0.22, 0.15, 0.13)), (0.5, (0.46, 0.24, 0.15)), (0.72, (0.72, 0.42, 0.2))], (1.5, 1.5, 1.5), detail=8.0, snow=0.72)
make_mat("ore_dark", [(0.28, (0.17, 0.12, 0.11)), (0.5, (0.34, 0.19, 0.14)), (0.72, (0.56, 0.31, 0.17))], (1.9, 1.9, 1.9), detail=8.0, snow=0.72)
make_mat("rock", [(0.3, (0.26, 0.27, 0.3)), (0.5, (0.4, 0.41, 0.45)), (0.7, (0.56, 0.56, 0.59))], (2.5, 2.5, 2.5), snow=0.68, weave=(5, "Z", 0.16, (0.16, 0.17, 0.2), 5.0))
make_mat("ice", [(0.3, (0.47, 0.64, 0.77)), (0.5, (0.6, 0.75, 0.86)), (0.7, (0.76, 0.87, 0.94))], (0.9, 0.9, 0.9), detail=3.0, snow=1.14, crack=(1.7, 0.018, 0.55, (0.9, 0.95, 1.0)))  # 금이 굵고 촘촘하면 타일 바닥으로 보였음
make_mat("water", [(0.3, (0.02, 0.07, 0.1)), (0.5, (0.04, 0.14, 0.19)), (0.7, (0.08, 0.25, 0.31))], (2, 2, 2), detail=2.0)
make_mat("bark", [(0.3, (0.24, 0.12, 0.08)), (0.5, (0.43, 0.23, 0.15)), (0.7, (0.62, 0.39, 0.26))], (9, 3, 1), grain=True, snow=0.72, weave=(10, "X", 0.5, (0.1, 0.06, 0.04)))
make_mat("heartwood", [(0.3, (0.6, 0.46, 0.28)), (0.5, (0.78, 0.63, 0.4)), (0.7, (0.9, 0.78, 0.54))], (40, 3, 1), grain=True)
make_mat("needle", [(0.3, (0.1, 0.2, 0.13)), (0.5, (0.17, 0.3, 0.19)), (0.7, (0.27, 0.42, 0.26))], (5, 5, 5), snow=0.86)  # 게임 빛에서 검게 죽어 한 단계 밝힘  # 0.55로는 윗면이 다 하얘져 눈 덮인 돌로 보였음
make_mat("blade", [(0.3, (0.58, 0.47, 0.26)), (0.5, (0.78, 0.66, 0.4)), (0.7, (0.92, 0.82, 0.57))], (20, 20, 20))  # 잎은 옆을 보는 면이라 게임 빛을 덜 받음 → 밝은 짚색으로
# 터마다 눈이 걷힌 자리에 드러나는 바닥 (석탄 가루 / 녹슨 부스러기 / 마른 풀 / 젖은 흙 / 솔 껍질)
make_mat("ground_coal", [(0.3, (0.06, 0.06, 0.08)), (0.5, (0.14, 0.13, 0.14)), (0.7, (0.3, 0.26, 0.2))], (8, 8, 8), snow=1.08, auxsnow=True, snowcol=G)
make_mat("ground_iron", [(0.3, (0.2, 0.11, 0.08)), (0.5, (0.36, 0.2, 0.12)), (0.7, (0.5, 0.34, 0.2))], (8, 8, 8), snow=1.08, auxsnow=True, snowcol=G)
make_mat("ground_plain", [(0.3, (0.3, 0.26, 0.2)), (0.5, (0.45, 0.38, 0.26)), (0.7, (0.6, 0.52, 0.36))], (8, 8, 8), snow=1.08, auxsnow=True, snowcol=G)
make_mat("ground_wet", [(0.3, (0.1, 0.1, 0.09)), (0.5, (0.2, 0.18, 0.14)), (0.7, (0.32, 0.28, 0.2))], (8, 8, 8), snow=1.08, auxsnow=True, snowcol=G)
make_mat("ground_bark", [(0.3, (0.2, 0.12, 0.08)), (0.5, (0.36, 0.24, 0.15)), (0.7, (0.52, 0.4, 0.26))], (8, 8, 8), snow=1.08, auxsnow=True, snowcol=G)


def rag(ang):
    return 1 + 0.08 * math.sin(3 * ang + 1) + 0.05 * math.sin(7 * ang) + 0.03 * math.sin(13 * ang + 2)


def make_gh(rx, ry, cy, drifts=(), base=0.16):
    """터가 앉은 눈밭의 높이 함수: 낮고 볼록한 둔덕 + 바람이 쌓은 눈 더미, 가장자리는 땅 높이. gh.fade = 가장자리로 갈수록 0"""

    def rr_(x, y):
        return math.hypot(x / rx, (y - cy) / ry) / rag(math.atan2((y - cy) / ry, x / rx))

    def gh(x, y):
        rr = rr_(x, y)
        if rr >= 1:
            return 0.0
        k = (1 - rr * rr) ** 0.7
        h = base * k + 0.03 * nz(x * 1.3, y * 1.3)
        for cx, cy2, amp, sx, sy in drifts:
            h += amp * math.exp(-(((x - cx) / sx) ** 2) - ((y - cy2) / sy) ** 2) * k**0.5
        return max(0.0, h) * sstep(1.0, 0.86, rr)

    gh.fade = lambda x, y: sstep(1.0, 0.8, rr_(x, y))
    return gh


def ground(rx, ry, cy, gh, bare, mat, n=11, segs=48):
    """눈밭 한 장. bare(x, y) = 눈이 걷혀 바닥이 드러난 정도 (0~1)"""
    bm, _, aux = BM()
    rings = []
    for f in [1.0, 0.95] + [0.88 - 0.78 * i / (n - 3) for i in range(n - 2)]:
        ring = []
        for i in range(segs):
            ang = TAU * i / segs
            x, y = math.cos(ang) * rx * rag(ang) * f, cy + math.sin(ang) * ry * rag(ang) * f
            ring.append(bm.verts.new((x, y, -0.03 if f == 1.0 else gh(x, y))))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new([a[i], a[j], b[j], b[i]])
    mid = bm.verts.new((0, cy, gh(0, cy)))
    for i in range(segs):
        bm.faces.new([rings[-1][i], rings[-1][(i + 1) % segs], mid])
    for f in bm.faces:
        for l in f.loops:
            l[aux].uv = (0, 1.3 * (1 - bare(l.vert.co.x, l.vert.co.y)))
    bm.normal_update()
    if sum(f.normal.z for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    return finish("ground", bm, mat, recalc=False)


def rock(name, c, size, seed, mat="rock", rot=(0.0, 0.0, 0.0), n=13, box=0.6):
    """깨진 바위: 구와 상자 사이 겉면에 흩은 점 몇 개를 볼록 껍질로 감쌈 → 큰 면이 진 덩이 (box가 클수록 모난 덩이).
    돌려주는 값 = (윗면 가운데, 윗면 반지름 x, y) — 그 위에 눈을 얹는 데 씀"""
    rnd = random.Random(seed)
    bm, _, _ = BM()
    for _ in range(n):
        v = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1))).normalized()
        bm.verts.new(v.lerp(v / max(abs(v.x), abs(v.y), abs(v.z)), box))
    bmesh.ops.convex_hull(bm, input=bm.verts)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    m = Matrix.Translation(c) @ Matrix.Rotation(rot[2], 4, "Z") @ Matrix.Rotation(rot[1], 4, "Y") @ Matrix.Rotation(rot[0], 4, "X") @ Matrix.Diagonal((size[0] / 2, size[1] / 2, size[2] / 2, 1))
    for v in bm.verts:
        v.co = m @ v.co
    zmax = max(v.co.z for v in bm.verts)
    tops = [v.co for v in bm.verts if v.co.z > zmax - size[2] * 0.22]
    top = sum(tops, Vector()) / len(tops)
    finish(name, bm, mat, smooth=False)
    return Vector((top.x, top.y, zmax)), size[0] * 0.42, size[1] * 0.42


def cap(top, h, seed, grow=1.0):
    """바위 턱에 얹힌 눈"""
    c, rx, ry = top
    h = min(h, 0.4 * min(rx, ry) * grow)  # 반지름만큼 높으면 눈이 아니라 공·버섯으로 보였음
    pillow(f"cap{seed}", (c.x, c.y, c.z - h * 0.3), rx * grow, ry * grow, h, seed)


def tuft(name, x, y, z, h, seed, n=5, spread=0.1, mat="blade"):
    """눈을 뚫고 나온 마른 풀·갈대 한 포기: 휘어진 좁은 잎 여러 가닥"""
    rnd = random.Random(seed)
    bm, _, _ = BM()
    for _ in range(n):
        ang = rnd.uniform(0, TAU)
        hh = h * rnd.uniform(0.6, 1.0)
        lean = Vector((math.cos(ang), math.sin(ang), 0)) * rnd.uniform(0.08, 0.35) * hh
        w = Vector((-math.sin(ang), math.cos(ang), 0)) * 0.028
        b = Vector((x + rnd.uniform(-spread, spread), y + rnd.uniform(-spread, spread), z - 0.03))
        mid, tip = b + lean * 0.35 + Vector((0, 0, hh * 0.6)), b + lean + Vector((0, 0, hh))
        v = [bm.verts.new(p) for p in (b - w, b + w, mid + w * 0.7, mid - w * 0.7, tip)]
        bm.faces.new(v[:4])
        bm.faces.new([v[3], v[2], v[4]])
    return finish(name, bm, mat, smooth=False, recalc=False)


def disc(name, c, rfun, mat, rings=(1.0, 0.6, 0.25), segs=28):
    """고르지 않은 둥근 판 (얼음·물). rfun(각도) = (x 반지름, y 반지름)"""
    bm, _, _ = BM()
    rs = [[bm.verts.new((c[0] + math.cos(TAU * i / segs) * rfun(TAU * i / segs)[0] * f, c[1] + math.sin(TAU * i / segs) * rfun(TAU * i / segs)[1] * f, c[2])) for i in range(segs)] for f in rings]
    for a, b in zip(rs, rs[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new([a[i], a[j], b[j], b[i]])
    mid = bm.verts.new(c)
    for i in range(segs):
        bm.faces.new([rs[-1][i], rs[-1][(i + 1) % segs], mid])
    bm.normal_update()
    if sum(f.normal.z for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    return finish(name, bm, mat, smooth=False, recalc=False)


def pdist(x, y, pts):
    """꺾은선까지의 거리"""
    best = 1e9
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        dx, dy = bx - ax, by - ay
        t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
        best = min(best, math.hypot(x - ax - dx * t, y - ay - dy * t))
    return best


# ── 버려진 곳간 ── 앞(-Y)이 트이고 용마루가 좌우로 뻗음. 오른쪽 앞 지붕이 내려앉아 서까래가 드러남
def store():
    rnd = random.Random(66)
    # 처마를 높이고 내밂을 줄임: 1.7 / 0.32로는 게임 카메라에서 지붕이 앞을 다 가려 안이 안 보였음
    WX, DY, EAVE, RIDGE, GO = 1.9, 1.15, 1.9, 2.6, 0.35  # 반 폭, 반 깊이, 처마 도리 높이, 용마루 높이, 박공 내밂
    DYT = DY + 0.22  # 용마루에서 처마 끝까지 (수평)
    SL = math.hypot(DYT, (RIDGE - EAVE) * DYT / DY)  # 비탈 길이
    SPAN = 2 * WX + 2 * GO


    def R(s, u, v):
        """지붕 비탈 위의 점. s: -1 앞 / +1 뒤, u: 0 왼쪽 끝 … 1 오른쪽 끝, v: 0 용마루 … 1 처마 끝"""
        z = RIDGE - v * (RIDGE - EAVE) * DYT / DY - 0.26 * math.sin(math.pi * u) * (1 - 0.5 * v)  # 용마루가 가운데에서 처짐
        z -= 0.14 * abs(2 * u - 1) ** 3 * max(0.0, v) + 0.03 * nz(u * 6, s)  # 네 귀가 처지고 용마루 줄이 고르지 않음 (반듯하면 상자로 보였음)
        if s < 0:
            z -= 0.34 * sstep(0.48, 0.86, u) * max(0.0, v) ** 1.2  # 무너진 쪽으로 내려앉음
        return Vector((-WX - GO + u * SPAN, s * v * DYT, z))


    def Nrm(s, u, v):
        e = 0.01
        n = (R(s, u + e, v) - R(s, u - e, v)).cross(R(s, u, v + e) - R(s, u, v - e)).normalized()
        return n if n.z > 0 else -n


    def hole(s, u, v):
        """뚫린 자리까지의 거리 (0보다 작으면 뚫린 안쪽)"""
        if s > 0:
            return 1.0
        return math.hypot((u - 0.7) / 0.2, (v - 0.55) / 0.34) - 1 + 0.3 * nz(u * 13, v * 8, 3.1)  # 네모로 뚫으면 창문처럼 보였음


    def uw(x):
        return (x + WX + GO) / SPAN


    VW = DY / DYT


    def wall_top(s, x):
        return R(s, uw(x), VW).z - 0.13


    def gh(x, y):
        """터가 앉은 눈밭의 높이: 낮고 볼록한 둔덕 + 벽 밖에 바람이 쌓은 눈 더미, 가장자리는 땅 높이"""
        ang = math.atan2((y + 0.25) / 2.85, x / 3.5)
        rag = 1 + 0.08 * math.sin(3 * ang + 1) + 0.05 * math.sin(7 * ang) + 0.03 * math.sin(13 * ang + 2)
        rr = math.hypot(x / 3.5, (y + 0.25) / 2.85) / rag
        if rr >= 1:
            return 0.0
        k = (1 - rr * rr) ** 0.7
        h = 0.16 * k + 0.03 * nz(x * 1.3, y * 1.3)
        for cx, cy, amp, sx, sy in ((-2.55, 0.2, 0.42, 0.5, 1.1), (0.0, 1.75, 0.46, 1.7, 0.45), (2.6, 0.45, 0.38, 0.5, 0.9)):
            h += amp * math.exp(-(((x - cx) / sx) ** 2) - ((y - cy) / sy) ** 2) * k**0.5
        return max(0.0, h) * sstep(1.0, 0.86, rr)


    # 눈밭
    def bare(x, y):
        """흙이 드러난 정도 (1 = 곳간 안, 0 = 눈밭): 벽 안쪽과 앞마당 조금"""
        return sstep(1.0, 0.62, max(abs(x) / (WX + 0.05), y / DY if y > 0 else (-y - 0.25) / (DY + 0.75)))


    bm, _, aux = BM()
    SEG = 48
    rings = []
    for f in (1.0, 0.95, 0.88, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1):
        ring = []
        for i in range(SEG):
            ang = TAU * i / SEG
            rag = 1 + 0.08 * math.sin(3 * ang + 1) + 0.05 * math.sin(7 * ang) + 0.03 * math.sin(13 * ang + 2)
            x, y = math.cos(ang) * 3.5 * rag * f, -0.25 + math.sin(ang) * 2.85 * rag * f
            ring.append(bm.verts.new((x, y, -0.03 if f == 1.0 else gh(x, y))))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(SEG):
            j = (i + 1) % SEG
            bm.faces.new([a[i], a[j], b[j], b[i]])
    mid = bm.verts.new((0, -0.25, gh(0, -0.25)))
    for i in range(SEG):
        bm.faces.new([rings[-1][i], rings[-1][(i + 1) % SEG], mid])
    for f in bm.faces:
        for l in f.loops:
            l[aux].uv = (0, 1.3 * (1 - bare(l.vert.co.x, l.vert.co.y)))
    bm.normal_update()
    if sum(f.normal.z for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    finish("ground", bm, "ground", recalc=False)

    # 이엉: 처마에서 용마루까지 여섯 켜. 켜마다 아래 끝이 들쭉날쭉하고 아랫켜 위로 들림 (통판 하나로 덮으면 널빤지처럼 보였음)
    NC, NXC = 6, 44
    for s in (-1, 1):
        ref = Nrm(s, 0.5, 0.5)
        for k in range(NC):
            v0 = max(0.0, k / NC - 0.04)
            top, bot, lip = [], [], []
            for i in range(NXC + 1):
                u = i / NXC
                vb = min(1.07, (k + 1) / NC + 0.05 * rnd.random() + (0.07 if rnd.random() < 0.16 else 0.0))
                n = Nrm(s, u, (v0 + vb) / 2)
                gu = u * SPAN + k * 0.61
                top.append((R(s, u, v0) + n * 0.04, (gu, v0 * SL), (0.0, 0)))
                bot.append((R(s, u, vb) + n * 0.15, (gu, vb * SL), (1.0, 0)))
                lip.append((R(s, u, vb - 0.012) + n * 0.03, (gu, vb * SL + 0.12), (0.15, 0)))
            sheet(f"thatch{s}{k}", [top, bot, lip], "thatch", ref, skip=lambda i, j, s=s, k=k: hole(s, (i + 0.5) / NXC, (k + 0.5) / NC) < 0)
        # 지붕 밑면 (안에서 올려다보이는 어두운 짚)
        under = [[(R(s, i / 14, j / 5) - Nrm(s, i / 14, j / 5) * 0.03, (i / 14 * SPAN, j / 5 * SL), (0, 0)) for i in range(15)] for j in range(6)]
        sheet(f"under{s}", under, "thatch_dark", -ref, skip=lambda i, j, s=s: hole(s, (i + 0.5) / 14, (j + 0.5) / 5) < 0)
        # 눈 이불: 용마루 쪽이 두껍고, 아래 끝은 혀처럼 늘어져 처짐. 뚫린 자리로는 얇아지다 끊김
        NU, NV = 64, 12  # 성기게 짜면 뚫린 자리 테두리가 계단처럼 깎였음
        rows = []
        for j in range(NV + 1):
            f = j / NV
            row = []
            for i in range(NU + 1):
                u = i / NU
                vm = 0.8 + 0.08 * nz(u * 3.1, s * 2.0) + 0.12 * abs(math.sin(u * 13 + s * 2))  # 처마 가까이까지 덮고 짚 술만 남김
                v = f * vm
                t = (0.14 + 0.3 * (0.5 + 0.5 * nz(u * 3.1, v * 2.3, s)) + 0.14 * max(0.0, nz(u * 8, v * 5, s + 5))) * min(1.0, (1 - f) * 5) ** 0.5  # 고르면 판 한 장으로 보였음 → 굴곡을 크게, 끝은 두툼한 턱으로
                t *= max(0.0, min(1.0, hole(s, u, v) / 0.1)) * min(1.0, min(u, 1 - u) / 0.03 + 0.25)
                p = R(s, u, v) + (Vector((0, 0, 1)) if j == 0 else Nrm(s, u, v)) * (0.15 + t)
                row.append((p, (0, 0), (0, 0)))
            rows.append(row)
        sheet(f"snow{s}", rows, "snow", ref, skip=lambda i, j, s=s: hole(s, (i + 0.5) / NU, (j + 0.5) / NV * 0.85) < 0.04)
        # 처마 술: 처마 끝에서 늘어진 짚. 끝이 깊게 들쭉날쭉한 두 겹 (이게 없으면 지붕이 널빤지로 보였음)
        for layer in range(2):
            NF = 64
            top, mid, bot = [], [], []
            for i in range(NF + 1):
                u = i / NF
                tip = R(s, u, 1.0) + Nrm(s, u, 1.0) * (0.13 - 0.06 * layer)
                out = Vector((0, s * (0.05 - 0.07 * layer), 0))
                drop = 0.16 + 0.2 * rnd.random() + (0.14 if rnd.random() < 0.2 else 0.0) - 0.06 * layer
                gu = u * SPAN + layer * 0.37
                top.append((tip - out * 2, (gu, 0.0), (0.3, 0)))
                mid.append((tip + out + Vector((0, 0, -0.1)), (gu, 0.14), (0.7, 0)))
                bot.append((tip + out * 0.6 + Vector((0, 0, -0.1 - drop)), (gu, 0.14 + drop), (1.0, 0)))
            sheet(f"fringe{s}{layer}", [top, mid, bot], "thatch", Vector((0, s, 0.3)))
        # 박공 술: 지붕 옆 끝에서 늘어진 짚
        for end in (0, 1):
            top, bot = [], []
            for j in range(15):
                v = j / 14 * 1.04
                p = R(s, end, v) + Nrm(s, end, v) * 0.13
                drop = 0.14 + 0.16 * rnd.random()
                top.append((p + Vector(((0.5 - end) * 0.08, 0, 0)), (v * SL, 0.0), (0.3, 0)))
                bot.append((p + Vector(((end - 0.5) * 0.06, 0, -drop)), (v * SL, drop), (1.0, 0)))
            sheet(f"gfringe{s}{end}", [top, bot], "thatch", Vector((end * 2 - 1, 0, 0.2)))

    # 뼈대: 기둥, 도리, 들보, 용마루대, 대공, 서까래, 가새
    for i, (x, s) in enumerate(((-WX, -1), (-0.7, -1), (WX, -1), (-WX, 1), (0.0, 1), (WX, 1))):
        lean = -0.14 if (x > 0 and s < 0) else rnd.uniform(-0.03, 0.03)  # 무너진 쪽 기둥은 안으로 기욺
        log(f"post{i}", (x, s * DY, 0.0), (x + lean, s * DY, wall_top(s, x)), 0.125, 0.105, seed=i)
        if s < 0:
            log(f"rope{i}", (x + lean, s * DY, wall_top(s, x) - 0.24), (x + lean, s * DY, wall_top(s, x) - 0.08), 0.135, 0.135, mat="rope", segs=8, seed=30 + i, wob=0)
    for s in (-1, 1):
        xs = (-WX - 0.2, -0.95, 0.0, 0.95, WX + 0.2)
        for i in range(4):
            log(f"plate{s}{i}", (xs[i], s * DY, wall_top(s, xs[i]) + 0.04), (xs[i + 1], s * DY, wall_top(s, xs[i + 1]) + 0.04), 0.085, 0.085, mat="wood_in", seed=40 + i)
    for i, x in enumerate((-WX, 0.0, WX)):
        zf, zb = wall_top(-1, x) + 0.1, wall_top(1, x) + 0.1
        log(f"tie{i}", (x, -DY - 0.1, zf), (x, DY + 0.1, zb), 0.08, 0.08, mat="wood_in", seed=50 + i)
        log(f"king{i}", (x, 0, (zf + zb) / 2), (x, 0, R(1, uw(x), 0).z - 0.1), 0.07, 0.06, mat="wood_in", seed=53 + i)
    for i in range(4):
        u0, u1 = 0.02 + 0.24 * i, 0.02 + 0.24 * (i + 1)
        log(f"ridge{i}", R(1, u0, 0) - Vector((0, 0, 0.1)), R(1, u1, 0) - Vector((0, 0, 0.1)), 0.075, 0.075, mat="wood_in", seed=60 + i)
    for s in (-1, 1):
        for i in range(10):
            u = 0.05 + 0.9 * i / 9
            off = lambda v: R(s, u, v) - Nrm(s, u, v) * 0.07
            if s < 0 and i == 6:  # 부러져 반만 남고, 나머지는 안으로 떨어짐
                log(f"raft{s}{i}", off(0.02), off(0.46), 0.045, mat="wood", seed=70 + i)
                log(f"raftdown{i}", off(0.5) - Vector((0, 0, 0.1)), (R(s, u, 0.9).x + 0.15, -0.55, 0.35), 0.045, mat="wood", seed=80 + i)
            elif s < 0 and i == 7:  # 위아래 토막만
                log(f"raft{s}{i}a", off(0.02), off(0.3), 0.045, mat="wood", seed=70 + i)
                log(f"raft{s}{i}b", off(0.74), off(1.0), 0.045, mat="wood", seed=90 + i)
            else:
                log(f"raft{s}{i}", off(0.02), off(1.0), 0.045, mat="wood" if (s < 0 and i in (5, 8)) else "wood_in", seed=70 + i + (s > 0) * 20)
    log("brace0", (-WX, -DY, 0.95), (-WX + 0.55, -DY, wall_top(-1, -WX + 0.55)), 0.05, seed=101)
    log("brace1", (-0.7, -DY, 1.0), (-0.2, -DY, wall_top(-1, -0.2)), 0.05, seed=102)
    log("brace2", (WX - 0.14, -DY, 0.9), (WX - 0.65, -DY, wall_top(-1, WX - 0.65)), 0.05, seed=103)
    log("fallen", (0.35, -0.9, 1.0), (1.3, -1.75, 0.2), 0.05, seed=104)  # 떨어져 걸친 서까래

    # 벽: 싸리 엮은 흙벽 (뒤·왼쪽은 성하고, 오른쪽은 앞이 무너짐, 앞은 왼쪽 한 칸만) + 가로대 + 박공
    panel("wall_back", (-WX, DY), (WX, DY), 0.0, (wall_top(1, -WX), wall_top(1, WX)))
    panel("wall_left", (-WX, -DY), (-WX, DY), 0.0, (wall_top(-1, -WX), wall_top(1, -WX)))
    panel("wall_right", (WX, -0.1), (WX, DY), 0.0, (1.1, wall_top(1, WX)))
    panel("wall_front", (-WX, -DY), (-0.7, -DY), 0.0, 1.3)
    for z in (0.45, 0.9, 1.32):
        log(f"railb{z}", (-WX, DY - 0.07, z), (WX, DY - 0.07, z), 0.032, 0.032, mat="wood_in", seed=int(z * 100))
        log(f"raill{z}", (-WX + 0.07, -DY, z), (-WX + 0.07, DY, z), 0.032, 0.032, mat="wood_in", seed=int(z * 100) + 1)
    for z in (0.4, 0.85):
        log(f"railf{z}", (-WX, -DY - 0.06, z), (-0.7, -DY - 0.06, z), 0.032, 0.032, seed=int(z * 100) + 2)
    for sx in (-1, 1):  # 박공: 들보에서 용마루까지 세모
        x = sx * WX
        bm, g, _ = BM()
        pts = [(x + th, y, z) for th in (-0.035, 0.035) for y, z in ((-DY, wall_top(-1, x) + 0.1), (DY, wall_top(1, x) + 0.1), (0.0, R(1, uw(x), 0).z - 0.12))]
        v = [bm.verts.new(p) for p in pts]
        for tri in ((0, 1, 2), (3, 5, 4), (0, 2, 5, 3), (1, 4, 5, 2), (0, 3, 4, 1)):
            f = bm.faces.new([v[k] for k in tri])
            for l, k in zip(f.loops, tri):
                l[g].uv = (pts[k][1] + DY, pts[k][2])
        finish(f"gable{sx}", bm, "wattle", smooth=False)

    # 받침돌: 앞 두 모서리에 두 켜, 왼쪽 벽 밑에 한 줄
    k = 0
    for cx, cy, n, step in ((-2.15, -1.32, 4, (0.36, -0.06)), (1.55, -1.5, 4, (0.34, 0.14))):
        for i in range(n):
            x, y = cx + step[0] * i, cy + step[1] * i
            stone(f"stone{k}", (x, y, gh(x, y) + 0.1), (0.38, 0.34, 0.3), 660 + k, rz=rnd.uniform(-0.25, 0.25))
            if i in (1, 2):
                stone(f"stone{k}b", (x + 0.05, y + 0.05, gh(x, y) + 0.37), (0.34, 0.3, 0.26), 680 + k, rz=rnd.uniform(-0.3, 0.3))
            k += 1
    for i in range(5):
        x, y = -WX - 0.12, -DY + 0.25 + i * 0.47
        stone(f"stonel{i}", (x, y, gh(x, y) + 0.08), (0.34, 0.42, 0.28), 700 + i, rz=rnd.uniform(-0.15, 0.15))
    stone("step", (-0.95, -2.05, gh(-0.95, -2.05) + 0.05), (0.5, 0.36, 0.2), 720, rz=0.3)

    # 남은 것: 곡식 섬 둘, 독 둘(하나는 눈 뚜껑), 쏟아진 바구니와 낟알
    SACK = [(0.12, 0.0), (0.36, 0.06), (0.41, 0.26), (0.36, 0.52), (0.22, 0.7), (0.09, 0.77), (0.2, 0.9), (0.23, 0.94), (0.08, 0.9)]  # 묶은 목 위로 주둥이가 벌어짐
    # 소품은 처마 줄 가까이 앞으로, 1.25배 크게: 안쪽에 두었더니 게임 카메라에서 처마에 가려 안 보였음
    for i, (x, y, sc, ln) in enumerate(((-1.05, -1.3, 1.25, (0.05, 0.0)), (-0.4, -1.0, 1.38, (-0.04, 0.03)))):
        lathe(f"sack{i}", (x, y, gh(x, y)), [(r * sc, z * sc) for r, z in SACK], "sack", segs=11, lean=ln, seed=i * 3, lump=0.06, squash=0.9)  # 많이 울퉁불퉁하면 바위로 보였음
        log(f"sacktie{i}", (x + ln[0] * 0.76 * sc, y + ln[1] * 0.76 * sc, gh(x, y) + 0.75 * sc), (x + ln[0] * 0.81 * sc, y + ln[1] * 0.81 * sc, gh(x, y) + 0.81 * sc), 0.115 * sc, 0.115 * sc, mat="rope", segs=8, seed=120 + i, wob=0)
    JAR = [(0.17, 0.0), (0.33, 0.16), (0.37, 0.4), (0.3, 0.6), (0.19, 0.69), (0.23, 0.75), (0.2, 0.77)]
    lathe("jar0", (0.95, -1.1, gh(0.95, -1.1)), [(r * 1.05, z * 1.05) for r, z in JAR], "jar", segs=14, seed=5, lump=0.03)
    lathe("jar1", (1.4, -0.65, gh(1.4, -0.65)), [(r * 1.18, z * 1.18) for r, z in JAR], "jar", segs=14, seed=6, lump=0.03)
    pillow("jarsnow0", (0.95, -1.1, gh(0.95, -1.1) + 0.8), 0.22, 0.22, 0.1, 8)
    pillow("jarsnow1", (1.4, -0.65, gh(1.4, -0.65) + 0.9), 0.25, 0.25, 0.13, 7)
    # 바구니: 낮고 넓은 광주리에 낟알이 수북함 (눕혔더니 쐐기 조각으로 보였음 → 바로 놓고 옆에 쏟아진 낟알을 둠)
    BX, BY = 0.15, -1.55
    bz = gh(BX, BY)
    tilt = Matrix.Translation((BX, BY, bz)) @ Matrix.Rotation(-0.16, 4, "X")
    bask = lathe("basket", (0, 0, 0), [(0.3, 0.0), (0.42, 0.12), (0.47, 0.27), (0.49, 0.3), (0.44, 0.28), (0.4, 0.2)], "reed", segs=16)
    bask.data.transform(tilt)
    gr = lathe("basketgrain", (0, 0, 0), [(0.41, 0.2), (0.3, 0.27), (0.12, 0.33), (0.02, 0.34)], "grain", segs=14)
    gr.data.transform(tilt)
    # 쏟아진 낟알: 낮은 무더기 몇 개 (부채꼴 판으로 깔았더니 노란 세모 조각으로 보였음)
    for i, (dx, dy, r) in enumerate(((0.3, -0.52, 0.3), (0.62, -0.62, 0.17), (0.02, -0.7, 0.13))):
        pillow(f"spill{i}", (BX + dx, BY + dy, gh(BX + dx, BY + dy) + 0.01), r, r * 0.72, 0.07, 130 + i, mat="grain")
    # 안으로 내려앉은 지붕 조각과 그 위의 눈
    rows = [[(Vector((0.55 + 0.75 * i / 4, -0.75 + 0.7 * j / 3, 0.2 + 0.5 * i / 4 + 0.05 * nz(i, j))), (i * 0.2, j * 0.25), (j / 3, 0)) for i in range(5)] for j in range(4)]
    sheet("debris", rows, "thatch", Vector((-0.5, 0, 1)))
    pillow("debrissnow", (0.95, -0.4, 0.5), 0.3, 0.26, 0.14, 9)
    # 받침돌·모서리에 얹힌 눈 몇 덩이
    pillow("capl", (-1.75, -1.42, gh(-1.75, -1.42) + 0.5), 0.3, 0.22, 0.12, 11)
    pillow("capr", (2.0, -1.2, gh(2.0, -1.2) + 0.5), 0.3, 0.22, 0.12, 12)

    # 살짝 돌려 세움 (컨셉처럼 왼쪽 박공이 조금 보이게)
    YAW = Matrix.Rotation(math.radians(-10), 4, "Z")
    for o in COLL.objects:
        o.data.transform(YAW)


# ── 자연 터 다섯 곳 ── 사용자 2026-11-22 "처음 거(곳간)처럼 퀄 좋게": 첫 판은 곳간보다 부품이 훨씬 적고 밋밋했음.
# 곳간이 나았던 까닭 = 부품이 많고 겹쳐 틈새 그늘이 생김 + 두껍고 울퉁불퉁한 눈 + 사람이 쓰던 흔적 → 터마다 같은 것을 넣음
make_mat("shale", [(0.3, (0.2, 0.21, 0.25)), (0.5, (0.3, 0.32, 0.37)), (0.7, (0.42, 0.44, 0.5))], (4, 4, 9), snow=0.82)
make_mat("fish", [(0.3, (0.42, 0.47, 0.52)), (0.5, (0.6, 0.64, 0.68)), (0.7, (0.8, 0.83, 0.86))], (30, 30, 8))
make_mat("rock_wet", [(0.3, (0.07, 0.08, 0.09)), (0.5, (0.15, 0.16, 0.18)), (0.7, (0.25, 0.27, 0.3))], (3, 3, 3))


make_mat("snowbank", [(0.3, (0.6, 0.65, 0.77)), (0.5, (0.64, 0.69, 0.8)), (0.7, (0.71, 0.76, 0.86))], (1.9, 1.9, 1.9), detail=2.0, rim=(1.0, (0.5, 0.6, 0.8)))  # 눈밭과 같은 색 — 흰 눈 색으로 덮으면 네모 판이 비쳤음


def blanket(name, x0, x1, y0, y1, zfun, t, seed, nu=24, nv=8, lobes=7.0):
    """넓게 덮인 두꺼운 눈: 뒤(y1)는 바탕에 붙고, 앞(y0)은 혀처럼 늘어져 턱 아래로 처짐"""
    rows = []
    for j in range(nv + 1):
        f = j / nv
        row = []
        for i in range(nu + 1):
            u = i / nu
            x = x0 + (x1 - x0) * u
            front = y0 - 0.24 * abs(math.sin(u * lobes * math.pi + seed)) - 0.1 * nz(u * 7, seed)  # 앞 끝이 곧으면 판자로 보였음
            y = y1 + (front - y1) * f
            side = min(1.0, min(u, 1 - u) / 0.14 + 0.08)  # 옆 끝은 얇게 잦아듦 (두꺼운 채로 끊으면 눈 상자로 보였음)
            th = t * (0.6 + 0.5 * nz(x * 1.7, y * 1.7, seed)) * min(1.0, f * 6) ** 0.5 * min(1.0, (1 - f) * 5) ** 0.5 * side
            z = zfun(x, y) + th if j < nv else zfun(x, y0 + 0.02) - 0.14 - 0.12 * abs(nz(u * 9, seed))
            row.append((Vector((x, y, z)), (0, 0), (0, 0)))
        rows.append(row)
    return sheet(name, rows, "snowbank", Vector((0, 0, 1)))


def twig(name, x, y, z, h, seed):
    """잎 진 떨기나무: 가는 가지 몇 가닥이 벌어지고 한 번씩 갈라짐"""
    rnd = random.Random(seed)
    for k in range(rnd.randint(3, 5)):
        a = rnd.uniform(0, TAU)
        tip = Vector((x + math.cos(a) * rnd.uniform(0.25, 0.6) * h, y + math.sin(a) * rnd.uniform(0.25, 0.6) * h, z + h * rnd.uniform(0.7, 1.0)))
        base = Vector((x, y, z - 0.05))
        log(f"{name}_{k}", base, tip, 0.024, 0.007, mat="wood_in", segs=4, seed=seed + k, wob=0.03)
        mid = base.lerp(tip, 0.55)
        log(f"{name}_{k}f", mid, mid + Vector((rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25), rnd.uniform(0.2, 0.4))) * h, 0.013, 0.004, mat="wood_in", segs=4, seed=seed + k + 50, wob=0.02)


def reed(name, x, y, z, h, seed, n=6, spread=0.14):
    """갈대 한 포기: 휘어진 줄기 끝에 이삭이 달림"""
    rnd = random.Random(seed)
    bm, _, _ = BM()
    for _ in range(n):
        ang = rnd.uniform(0, TAU)
        hh = h * rnd.uniform(0.6, 1.0)
        lean = Vector((math.cos(ang), math.sin(ang), 0)) * rnd.uniform(0.08, 0.3) * hh
        w = Vector((-math.sin(ang), math.cos(ang), 0)) * 0.022
        b = Vector((x + rnd.uniform(-spread, spread), y + rnd.uniform(-spread, spread), z - 0.03))
        mid, tip = b + lean * 0.35 + Vector((0, 0, hh * 0.6)), b + lean + Vector((0, 0, hh))
        v = [bm.verts.new(p) for p in (b - w, b + w, mid + w * 0.7, mid - w * 0.7, tip)]
        bm.faces.new(v[:4])
        bm.faces.new([v[3], v[2], v[4]])
        if rnd.random() < 0.7:  # 이삭: 끝에 달린 마름모
            d = (tip - mid).normalized()
            k = [bm.verts.new(p) for p in (tip - d * 0.3, tip - d * 0.14 + w * 2.6, tip + d * 0.06, tip - d * 0.14 - w * 2.6)]
            bm.faces.new(k)
    return finish(name, bm, "blade", smooth=False, recalc=False)


def crag(name, cx, cy, rx, ry, seed, mat, peaks, layer=0.42, dip=0.28, nx=72, ny=58):
    """한 덩어리 바위산: 봉우리 몇 개(x, y, 높이, 반지름)를 합친 높이에 기운 지층 턱을 냄.
    턱 = 눈이 앉는 선반, 턱과 턱 사이 = 깎아지른 면. 격자 점을 조금씩 흔들어 턱 선이 계단으로 보이지 않게"""
    rnd = random.Random(seed)

    def height(x, y):
        b = 0.0
        for px, py, ph, pr in peaks:
            d = math.hypot(x - px, y - py) / pr
            if d < 1:
                b = max(b, ph * (1 - d**1.6))  # 뾰족한 원뿔꼴
        if b <= 0:
            return -0.25
        b *= 0.85 + 0.25 * (1 - 2 * abs(nz(x * 1.1 + seed, y * 1.1)))  # 등성이 진 잡음
        t = (b + dip * (x - cx) + 0.3 * nz(x * 0.6, y * 0.6, seed)) / layer  # 턱 높이를 흔듦 (고르면 계단식 논·케이크로 보였음)
        ti = math.floor(t)
        return max(-0.25, (ti + sstep(0.6, 1.0, t - ti)) * layer - dip * (x - cx))

    bm, _, _ = BM()
    vs = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            x = cx - rx + 2 * rx * (i + rnd.uniform(-0.3, 0.3)) / nx
            y = cy - ry + 2 * ry * (j + rnd.uniform(-0.3, 0.3)) / ny
            row.append(bm.verts.new((x, y, height(x, y))))
        vs.append(row)
    for j in range(ny):
        for i in range(nx):
            q = [vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]]
            if max(v.co.z for v in q) > -0.2:
                bm.faces.new(q)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.normal_update()
    if sum(f.normal.z for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    return finish(name, bm, mat, smooth=False, recalc=False)


def icicle(name, p, ln, seed):
    log(name, p, (p[0] + 0.02, p[1] - 0.01, p[2] - ln), 0.05, 0.004, mat="ice", segs=5, seed=seed, wob=0)


# ── 석탄 노두 ── 눈 언덕 앞이 무너져 검은 석탄 켜가 벽으로 드러남 (사이사이 얇은 셰일 켜). 발치에 캐다 둔 바구니와 곡괭이
def coal():
    rnd = random.Random(21)
    base = make_gh(3.5, 2.9, -0.2)

    def hill(x, y):
        d2 = (x / 3.3) ** 2 + ((y - 0.35) / 1.95) ** 2
        return 0.0 if d2 >= 1 else 2.8 * (1 - d2) ** 0.8 * (1 + 0.12 * nz(x * 0.8 + 2.1, y * 0.8))

    def gh(x, y):  # 앞이 가파르게 깎인 언덕 (깎인 자리를 석탄 켜가 덮음). 벽 꼭대기와 언덕 높이를 맞춤 — 벽이 언덕보다 높으면 위에 얹은 눈이 상자로 떠 보였음
        return base(x, y) + hill(x, y) * sstep(-1.35, -0.65, y - 0.1 * math.sin(x * 1.7)) * base.fade(x, y)

    ground(3.5, 2.9, -0.2, gh, lambda x, y: sstep(1.0, 0.35, math.hypot(x / 2.4, (y + 1.85) / 1.0)), "ground_coal", n=18, segs=60)
    # 켜: 모서리 친 주사위 덩이를 빈틈없이 쌓음. 크기를 흔들고 몇 개는 앞으로 내밀어 벽돌 담처럼 보이지 않게, 켜 사이에 얇은 셰일
    dip, k = 0.1, 0
    y, z = -1.25, 0.28
    for hc, kind, half in ((0.5, "coal", 1.9), (0.44, "coal", 1.75), (0.13, "shale", 1.7), (0.52, "coal", 1.55), (0.42, "coal", 1.35)):
        x = -half + rnd.uniform(0, 0.12)
        while x < half:
            w = min((1.1 if kind == "shale" else 0.52) * rnd.uniform(0.8, 1.35), half - x + 0.2)
            cx = x + w / 2
            if kind == "shale":
                rock(f"shale{k}", (cx, y - 0.06, z + hc / 2 + cx * dip), (w * 1.02, 0.8, hc * 1.3), 2500 + k, mat="shale", rot=(0, -dip, rnd.uniform(-0.06, 0.06)), box=0.85, n=14)
            elif rnd.random() > 0.06:  # 군데군데 덩이가 빠짐
                stone(f"coal{k}", (cx, y + rnd.choice((0.0, 0.0, -0.1, 0.07)), z + hc / 2 + cx * dip + rnd.uniform(-0.02, 0.02)), (w * 0.97, 0.7, hc * rnd.uniform(0.94, 1.06)), 2100 + k, rz=rnd.uniform(-0.1, 0.1), mat="earth" if rnd.random() < 0.04 else "coal")
            x += w
            k += 1
        z += hc * 0.96
        y += 0.2 if kind == "coal" else 0.04
    topz = z
    for i in range(6):  # 벽 위로 드러난 흙
        x = -1.05 + i * 0.42 + rnd.uniform(-0.08, 0.08)
        rock(f"lip{i}", (x, y - 0.1, topz - 0.05 + x * dip), (0.66, 0.6, 0.3), 2150 + i, mat="earth", rot=(0, 0, rnd.uniform(-0.3, 0.3)), box=0.5)
    # 언덕의 눈이 벽 위를 덮고 앞으로 넘쳐 처짐
    blanket("lipsnow", -1.95, 1.9, y - 0.42, 0.75, lambda bx, by: max(gh(bx, by), topz + 0.04 + bx * dip - max(0.0, by - (y - 0.1)) * 0.8), 0.24, 3, nu=30, nv=9)
    # 발치의 무너진 더미
    for i in range(18):
        r = rnd.random() ** 0.7
        a = rnd.uniform(0, TAU)
        bx, by = -0.35 + math.cos(a) * r * 1.35, -1.9 + math.sin(a) * r * 0.55
        s = rnd.uniform(0.26, 0.48)
        stone(f"heap{i}", (bx, by, gh(bx, by) + s * 0.32 + 0.38 * max(0.0, 1 - r * 1.3)), (s, s * 0.9, s * 0.8), 2200 + i, rz=rnd.uniform(0, 3.14), mat="coal")
    for i in range(20):  # 눈 위의 검은 부스러기
        s = rnd.uniform(0.08, 0.16)
        bx, by = rnd.uniform(-2.4, 2.4), rnd.uniform(-2.9, -1.6)
        rock(f"crumb{i}", (bx, by, gh(bx, by) + s * 0.25), (s, s, s * 0.8), 2300 + i, mat="coal", rot=(0, 0, rnd.uniform(0, 3.14)), box=0.8, n=9)
    # 캐다 둔 흔적: 석탄을 담은 싸리 바구니, 곡괭이
    bx, by = 1.75, -1.85
    bz = gh(bx, by)
    lathe("basket", (bx, by, bz), [(0.27, 0.0), (0.37, 0.14), (0.42, 0.42), (0.44, 0.47), (0.38, 0.45), (0.34, 0.3)], "reed", segs=14)
    for i in range(6):
        a = TAU * i / 6
        rock(f"load{i}", (bx + math.cos(a) * 0.17 * (i > 0), by + math.sin(a) * 0.17 * (i > 0), bz + 0.4 + 0.08 * (i == 0)), (0.24, 0.22, 0.2), 2600 + i, mat="coal", rot=(0, 0, a), box=0.8, n=10)
    log("pick", (0.85, -2.45, gh(0.85, -2.45) + 0.06), (1.45, -1.55, bz + 0.5), 0.035, 0.03, seed=5)
    rock("pickhead", (1.45, -1.55, bz + 0.52), (0.62, 0.09, 0.09), 2610, mat="shale", rot=(0, 0.25, 2.2), box=0.3, n=10)
    cap(rock("side0", (-2.4, -0.95, 0.28), (0.95, 0.8, 0.7), 2180, mat="earth", rot=(0.1, 0.2, 0.4)), 0.2, 2181)
    cap(rock("side1", (2.45, -0.6, 0.3), (0.85, 0.8, 0.75), 2182, mat="earth", rot=(-0.1, 0.25, -0.3)), 0.2, 2183)
    twig("twig0", -2.55, 0.35, gh(-2.55, 0.35), 0.9, 2700)
    twig("twig1", 2.5, 0.6, gh(2.5, 0.6), 0.75, 2710)
    for i in range(12):
        bx, by = rnd.uniform(-2.2, 2.2), rnd.uniform(0.75, 1.8)
        tuft(f"tuft{i}", bx, by, gh(bx, by), rnd.uniform(0.45, 0.85), 2400 + i)


# ── 철광 노두 ── 같은 쪽으로 기운 녹빛 바위 켜가 겹겹이 솟고, 사이로 뾰족한 날이 섬. 실루엣 = 높고 뾰족한 봉우리 무리
def iron():
    rnd = random.Random(34)
    gh = make_gh(3.4, 2.8, -0.2, drifts=((-2.5, 1.05, 0.42, 0.6, 0.9), (2.45, 0.95, 0.36, 0.6, 0.8)))
    ground(3.4, 2.8, -0.2, gh, lambda x, y: 0.85 * sstep(1.0, 0.4, math.hypot(x / 2.3, (y + 1.3) / 1.15)), "ground_iron")
    # 덩이를 여럿 쌓는 식은 세 번 다 틀렸음 (돌탑·컵케이크 / 찰흙 보석 / 부스러기 더미) → 바위산을 한 덩어리로 뜨고 기운 지층 턱을 냄
    crag("crag", 0.0, 0.3, 3.0, 2.3, 34, "ore", ((0.2, 0.95, 3.3, 1.55), (-1.3, 0.65, 2.3, 1.25), (1.5, 0.5, 1.9, 1.15), (-0.4, -0.3, 1.3, 1.05), (1.0, -0.6, 0.9, 0.85), (-2.0, -0.4, 0.75, 0.75)))
    # 세로로 선 뾰족한 날: 봉우리 곁에서 솟아 실루엣을 들쭉날쭉하게
    for i, (x, y, w, d, h, ry) in enumerate(((0.95, 1.2, 0.5, 1.2, 3.0, 0.2), (-0.75, 1.25, 0.45, 1.0, 2.5, -0.14), (-2.0, 0.95, 0.4, 0.85, 1.7, 0.2))):
        rock(f"fin{i}", (x, y, h * 0.4), (w, d, h), 380 + i, mat="ore_dark", rot=(rnd.uniform(-0.1, 0.1), ry, rnd.uniform(-0.4, 0.4)), box=0.25, n=10)
    for i in range(13):
        s = rnd.uniform(0.26, 0.6)
        x, y = rnd.uniform(-2.1, 2.3), rnd.uniform(-2.6, -1.45)
        rock(f"rub{i}", (x, y, gh(x, y) + s * 0.28), (s, s * 0.85, s * 0.75), 3400 + i, mat="ore" if i % 3 else "ore_dark", rot=(rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), rnd.uniform(0, 3.14)), box=0.42)
    for i in range(14):
        s = rnd.uniform(0.08, 0.16)
        x, y = rnd.uniform(-2.5, 2.5), rnd.uniform(-2.8, -1.3)
        rock(f"crumb{i}", (x, y, gh(x, y) + s * 0.25), (s, s, s * 0.8), 3600 + i, mat="ore", rot=(0, 0, rnd.uniform(0, 3.14)), box=0.6, n=9)
    twig("twig0", -2.7, -0.2, gh(-2.7, -0.2), 0.9, 3700)
    twig("twig1", 2.6, -0.5, gh(2.6, -0.5), 0.8, 3710)
    twig("twig2", 0.2, 2.1, gh(0.2, 2.1), 1.0, 3720)
    for i in range(9):
        a = rnd.uniform(0.2, 3.0)
        x, y = math.cos(a) * 2.9, 0.3 + math.sin(a) * 2.0
        tuft(f"tuft{i}", x, y, gh(x, y), rnd.uniform(0.45, 0.8), 3500 + i)


# ── 얼음 낚시 못 ── 금 간 얼음판 + 뚫은 구멍과 깨낸 얼음 조각 + 통발과 장대 + 물고기 말리는 덕 + 눈 얹힌 돌 + 갈대
def pond():
    rnd = random.Random(44)
    base = make_gh(3.4, 2.8, -0.1)
    PX, PY, PRX, PRY = 0.0, -0.25, 2.25, 1.65
    wob = lambda a: 1 + 0.09 * math.sin(a * 3 + 0.7) + 0.05 * math.sin(a * 5)

    def prr(x, y):
        return math.hypot((x - PX) / PRX, (y - PY) / PRY) / wob(math.atan2((y - PY) / PRY, (x - PX) / PRX))

    def gh(x, y):  # 못 자리는 눈밭보다 꺼지고, 둘레에는 눈 턱이 둘림
        r = prr(x, y)
        k = sstep(0.9, 1.08, r)
        return (base(x, y) + 0.24 * math.exp(-(((r - 1.14) / 0.17) ** 2)) * base.fade(x, y)) * k + 0.06 * (1 - k)

    ground(3.4, 2.8, -0.1, gh, lambda x, y: 0.0, "ground_plain", n=16, segs=56)
    disc("ice", (PX, PY, 0.13), lambda a: (PRX * 1.04 * wob(a), PRY * 1.04 * wob(a)), "ice")
    # 뚫은 구멍: 어두운 물 + 긁어낸 얼음 턱 + 깨낸 얼음 조각
    HX, HY = 0.65, -0.95
    disc("hole", (HX, HY, 0.145), lambda a: (0.42, 0.36), "water", rings=(1.0, 0.5), segs=14)
    lathe("holerim", (HX, HY, 0.13), [(0.6, 0.0), (0.55, 0.07), (0.46, 0.08), (0.42, 0.01)], "snow", segs=14, squash=0.86, lump=0.08)
    for i in range(7):
        a = rnd.uniform(2.2, 5.2)
        s = rnd.uniform(0.14, 0.28)
        rock(f"chunk{i}", (HX + math.cos(a) * rnd.uniform(0.7, 1.0), HY + math.sin(a) * rnd.uniform(0.6, 0.85), 0.13 + s * 0.3), (s * 1.3, s, s * 0.7), 4400 + i, mat="ice", rot=(rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), rnd.uniform(0, 3.14)), box=0.6, n=10)
    # 통발: 구멍 옆에 뉜 싸리 바구니 (테를 두름), 얼음 깨는 장대
    TRAP = [(0.1, 0.0), (0.2, 0.25), (0.31, 0.6), (0.37, 0.95), (0.39, 1.0), (0.33, 0.98), (0.28, 0.6)]
    lay = Matrix.Translation((1.4, 0.05, 0.13 + 0.37)) @ Matrix.Rotation(0.5, 4, "Z") @ Matrix.Rotation(math.pi / 2 * 0.95, 4, "X")
    lathe("trap", (0, 0, 0), TRAP, "reed", segs=12).data.transform(lay)
    for i, (r, z) in enumerate(((0.22, 0.3), (0.32, 0.62), (0.385, 0.97))):
        lathe(f"trapband{i}", (0, 0, 0), [(r + 0.01, z - 0.025), (r + 0.035, z), (r + 0.01, z + 0.025)], "rope", segs=12).data.transform(lay)
    log("pole", (1.15, -0.85, 0.14), (1.6, 0.35, 2.3), 0.05, 0.04, seed=3)
    log("polerope", (1.36, -0.3, 1.12), (1.4, -0.2, 1.3), 0.066, 0.066, mat="rope", segs=8, seed=4, wob=0)
    # 물고기 말리는 덕: 엇건 장대 두 틀에 가로대, 꿰어 건 물고기
    A, B = Vector((1.15, 1.75, 0)), Vector((2.35, 1.2, 0))
    for i, c in enumerate((A, B)):
        d = (B - A).normalized()
        n = Vector((-d.y, d.x, 0))
        z0 = gh(c.x, c.y)
        log(f"rack{i}a", c - n * 0.32 + Vector((0, 0, z0)), c + n * 0.08 + Vector((0, 0, 1.5)), 0.042, 0.035, seed=10 + i)
        log(f"rack{i}b", c + n * 0.32 + Vector((0, 0, z0)), c - n * 0.08 + Vector((0, 0, 1.5)), 0.042, 0.035, seed=12 + i)
        log(f"rackrope{i}", c + Vector((0, 0, 1.3)), c + Vector((0, 0, 1.42)), 0.07, 0.07, mat="rope", segs=8, seed=14 + i, wob=0)
    log("rackbar", A + (A - B).normalized() * 0.18 + Vector((0, 0, 1.38)), B + (B - A).normalized() * 0.18 + Vector((0, 0, 1.38)), 0.035, 0.035, seed=16)
    for i in range(6):
        p = A.lerp(B, 0.1 + 0.16 * i)
        rock(f"fish{i}", (p.x, p.y, 1.38 - 0.27 - 0.03 * (i % 2)), (0.09, 0.17, 0.44), 4500 + i, mat="fish", rot=(0, 0, math.atan2(B.y - A.y, B.x - A.x) + rnd.uniform(-0.3, 0.3)), box=0.1, n=10)
    for i, (a, s) in enumerate(((0.5, 0.55), (1.2, 0.72), (2.0, 0.5), (3.3, 0.64), (4.2, 0.44), (5.5, 0.48), (2.7, 0.42), (5.0, 0.36))):  # 못 둘레의 눈 얹힌 돌
        x, y = PX + math.cos(a) * PRX * wob(a) * 1.16, PY + math.sin(a) * PRY * wob(a) * 1.18
        cap(rock(f"boulder{i}", (x, y, gh(x, y) + s * 0.25), (s * 1.5, s * 1.3, s), 60 + i, rot=(rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), rnd.uniform(0, 3.14))), 0.2 * s / 0.5, 80 + i, grow=0.92)
    for i in range(30):  # 갈대: 못 뒤 왼쪽에 큰 무리, 오른쪽과 앞 왼쪽에 작은 무리
        a = rnd.choice((rnd.uniform(1.75, 2.95), rnd.uniform(1.75, 2.95), rnd.uniform(5.6, 6.5), rnd.uniform(3.6, 4.1)))
        d = rnd.uniform(0.9, 1.12)
        x, y = PX + math.cos(a) * PRX * wob(a) * d, PY + math.sin(a) * PRY * wob(a) * d
        reed(f"reed{i}", x, y, max(0.13, gh(x, y)), rnd.uniform(0.85, 1.5), 300 + i)


# ── 쓰러진 적송 ── 부러져 누운 굵은 줄기 + 뿌리가 벌어진 삐죽한 그루터기 + 눈을 인 가지 무리 + 튄 속살 조각
def pine():
    rnd = random.Random(77)
    gh = make_gh(3.5, 2.8, -0.1)
    T = [Vector(p) for p in ((1.6, -1.0, 0.44), (0.6, -0.5, 0.46), (-0.55, 0.05, 0.54), (-1.55, 0.6, 0.66), (-2.2, 0.98, 0.8))]
    RAD = (0.38, 0.34, 0.28, 0.2, 0.11)
    line = [(p.x, p.y) for p in T]
    ground(3.5, 2.8, -0.1, gh, lambda x, y: 0.8 * sstep(1.1, 0.3, min(pdist(x, y, line), math.hypot(x - 2.4, y - 0.1) + 0.2)), "ground_bark")
    for i in range(4):
        log(f"trunk{i}", T[i], T[i + 1], RAD[i], RAD[i + 1], mat="bark", segs=12, seed=i, wob=0.03)
    # 부러진 밑동: 줄기 결을 따라 찢긴 속살
    d0 = (T[0] - T[1]).normalized()
    side = d0.cross(Vector((0, 0, 1))).normalized()
    up = side.cross(d0)
    for i in range(16):
        a = TAU * i / 16 + rnd.uniform(-0.2, 0.2)
        ring = (side * math.cos(a) + up * math.sin(a))
        p = T[0] + ring * RAD[0] * rnd.uniform(0.25, 0.88) - d0 * 0.1
        log(f"splint{i}", p, p + d0 * rnd.uniform(0.3, 0.9) + ring * rnd.uniform(0.0, 0.14), 0.085, 0.008, mat="heartwood", segs=4, seed=20 + i, wob=0)
    # 그루터기: 뿌리가 벌어지고, 꺾인 자리가 삐죽삐죽
    SX, SY = 2.4, 0.1
    sz = gh(SX, SY)
    lathe("stump", (SX, SY, sz - 0.05), [(0.6, 0.0), (0.47, 0.14), (0.4, 0.5), (0.37, 0.92)], "bark", segs=12, lump=0.1)
    for i in range(5):
        a = TAU * i / 5 + 0.4
        log(f"root{i}", (SX + math.cos(a) * 0.3, SY + math.sin(a) * 0.3, sz + 0.3), (SX + math.cos(a) * 0.95, SY + math.sin(a) * 0.95, sz - 0.04), 0.16, 0.05, mat="bark", segs=7, seed=30 + i, wob=0.02)
    for i in range(13):
        a = TAU * i / 13 + rnd.uniform(-0.2, 0.2)
        r = 0.34 * rnd.uniform(0.2, 0.95)
        p = Vector((SX + math.cos(a) * r, SY + math.sin(a) * r, sz + 0.8))
        log(f"stumpsplint{i}", p, p + Vector((math.cos(a) * 0.06, math.sin(a) * 0.06, rnd.uniform(0.3, 0.8))), 0.09, 0.008, mat="heartwood", segs=4, seed=40 + i, wob=0)
    for i in range(14):  # 부러지며 튄 속살 조각
        x, y = rnd.uniform(1.3, 3.0), rnd.uniform(-1.6, 0.0)
        a = rnd.uniform(0, TAU)
        ln = rnd.uniform(0.15, 0.4)
        log(f"chip{i}", (x, y, gh(x, y) + 0.03), (x + math.cos(a) * ln, y + math.sin(a) * ln, gh(x, y) + 0.05), 0.035, 0.008, mat="heartwood", segs=4, seed=100 + i, wob=0)
    # 가지와 솔잎: 가지마다 납작한 잎 뭉치가 층층이, 눈은 얇게 (게임의 선 적송과 같은 결)
    k = 0
    for i, (ti, d, ln) in enumerate(((1, (-0.2, -1.0, 0.3), 1.2), (1, (0.5, 0.9, 0.5), 1.0), (2, (0.3, 1.0, 0.45), 1.5), (2, (-0.6, -0.9, 0.2), 1.3), (3, (-0.2, 1.0, 0.55), 1.4), (3, (-0.9, -0.6, 0.3), 1.25), (3, (-0.6, 0.4, 0.9), 1.1), (4, (-1.0, 0.3, 0.4), 1.0), (4, (-0.5, 1.0, 0.6), 1.15), (4, (-0.9, -0.5, 0.55), 0.9))):
        a = T[ti]
        b = a + Vector(d).normalized() * ln
        log(f"branch{i}", a, b, 0.085, 0.03, mat="bark", segs=6, seed=60 + i, wob=0.04)
        fork = a.lerp(b, 0.55)
        log(f"branch{i}f", fork, fork + Vector((rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5), 0.25)), 0.04, 0.015, mat="bark", segs=5, seed=160 + i, wob=0.03)
        for f in (0.5, 0.78, 1.02):
            c = a.lerp(b, f) + Vector((rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), 0.08))
            s = rnd.uniform(0.75, 1.15)
            cap(rock(f"needle{k}", c, (s, s * 0.85, s * 0.34), 700 + k, mat="needle", rot=(rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), rnd.uniform(0, 3.14)), n=18, box=0.12), 0.09, 750 + k, grow=0.6)
            k += 1
    for i in range(10):  # 줄기 위에 길게 얹힌 눈
        f = 0.06 + 0.88 * i / 9
        seg = min(3, int(f * 4))
        p = T[seg].lerp(T[seg + 1], f * 4 - seg)
        r = RAD[seg] + (RAD[seg + 1] - RAD[seg]) * (f * 4 - seg)
        pillow(f"trunksnow{i}", (p.x, p.y, p.z + r * 0.72), 0.3, 0.2, 0.1, 800 + i)
    log("bit0", (0.2, -1.9, gh(0.2, -1.9) + 0.07), (1.1, -2.2, gh(1.1, -2.2) + 0.09), 0.08, 0.05, mat="bark", segs=6, seed=90)
    log("bit1", (-1.6, -1.2, gh(-1.6, -1.2) + 0.06), (-0.9, -1.5, gh(-0.9, -1.5) + 0.06), 0.06, 0.03, mat="bark", segs=6, seed=91)
    twig("twig0", 2.3, 1.6, gh(2.3, 1.6), 0.8, 950)
    for i in range(9):
        x, y = rnd.uniform(-2.6, 2.6), rnd.choice((rnd.uniform(-2.3, -1.6), rnd.uniform(1.4, 2.0)))
        tuft(f"tuft{i}", x, y, gh(x, y), rnd.uniform(0.4, 0.7), 900 + i)


# ── 얼지 않는 샘 ── 바위 틈에서 솟은 검푸른 물웅덩이 + 살얼음 + 흘러 나가는 물길 + 고드름 + 물 긷던 통과 발판
def spring():
    rnd = random.Random(55)
    base = make_gh(3.4, 2.8, -0.1, drifts=((0.0, 2.05, 0.4, 1.9, 0.5),))
    PX, PY, PRX, PRY = 0.0, 0.0, 1.5, 1.05
    PATH = [(0.1, -0.9), (0.42, -1.45), (0.2, -2.0), (0.5, -2.5), (0.45, -2.95)]
    wob = lambda a: 1 + 0.1 * math.sin(a * 3 + 1.9) + 0.05 * math.sin(a * 5)

    def prr(x, y):
        return math.hypot((x - PX) / PRX, (y - PY) / PRY) / wob(math.atan2((y - PY) / PRY, (x - PX) / PRX))

    def gh(x, y):  # 웅덩이와 물길 자리는 파이고, 웅덩이 둘레는 눈 턱
        r = prr(x, y)
        k = sstep(0.9, 1.1, r)
        h = (base(x, y) + 0.16 * math.exp(-(((r - 1.16) / 0.16) ** 2)) * base.fade(x, y)) * k + 0.05 * (1 - k)
        return min(h, 0.04 + max(0.0, h - 0.04) * sstep(0.14, 0.45, pdist(x, y, PATH)))

    ground(3.4, 2.8, -0.1, gh, lambda x, y: 0.8 * max(sstep(1.4, 1.05, prr(x, y)), sstep(0.6, 0.28, pdist(x, y, PATH))), "ground_wet", n=16, segs=56)
    disc("pool", (PX, PY, 0.1), lambda a: (PRX * 1.04 * wob(a), PRY * 1.04 * wob(a)), "water")
    # 가장자리 살얼음 띠 (안쪽 끝이 들쭉날쭉)
    rows = [[], []]
    for i in range(33):
        a = TAU * i / 32
        fin = 0.74 + 0.07 * math.sin(a * 7) + 0.04 * math.sin(a * 13)
        rows[0].append((Vector((PX + math.cos(a) * PRX * wob(a) * 1.05, PY + math.sin(a) * PRY * wob(a) * 1.05, 0.118)), (0, 0), (0, 0)))
        rows[1].append((Vector((PX + math.cos(a) * PRX * wob(a) * fin, PY + math.sin(a) * PRY * wob(a) * fin, 0.112)), (0, 0), (0, 0)))
    sheet("shelf", rows, "ice", Vector((0, 0, 1)), smooth=False, skip=lambda i, j: 22 <= i <= 25)  # 물길이 나가는 앞쪽은 트임
    # 물길: 살얼음 | 물 | 살얼음
    L1, W1, W2, L2 = [], [], [], []
    pts = [Vector((*PATH[i], 0)).lerp(Vector((*PATH[i + 1], 0)), f) for i in range(len(PATH) - 1) for f in (0.0, 0.34, 0.67)] + [Vector((*PATH[-1], 0))]
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        n = Vector((-t.y, t.x, 0))
        w = 0.17 + 0.012 * i
        z = 0.062
        L1.append((p - n * (w + 0.13) + Vector((0, 0, z + 0.012)), (0, 0), (0, 0)))
        W1.append((p - n * w + Vector((0, 0, z)), (0, 0), (0, 0)))
        W2.append((p + n * w + Vector((0, 0, z)), (0, 0), (0, 0)))
        L2.append((p + n * (w + 0.13) + Vector((0, 0, z + 0.012)), (0, 0), (0, 0)))
    sheet("stream", [W1, W2], "water", Vector((0, 0, 1)), smooth=False)
    sheet("streamice0", [L1, W1], "ice", Vector((0, 0, 1)), smooth=False)
    sheet("streamice1", [W2, L2], "ice", Vector((0, 0, 1)), smooth=False)
    for i, f in enumerate((0.3, 0.55, 0.8)):  # 물길에 놓인 디딤돌
        p = pts[int(f * (len(pts) - 1))]
        rock(f"step{i}", (p.x + rnd.uniform(-0.05, 0.05), p.y, 0.09), (0.34, 0.3, 0.14), 5400 + i, mat="rock_wet", rot=(0, 0, rnd.uniform(0, 3.14)), box=0.5, n=10)
    # 뒤쪽 바위 턱: 물이 솟는 자리. 켜를 쌓고 사이사이 작은 바위로 틈을 메워 말굽으로 두름
    for i, (x, y, w, d, hgt, n) in enumerate(((0.0, 1.4, 2.3, 1.4, 2.0, 4), (-1.6, 0.9, 1.6, 1.3, 1.4, 3), (1.6, 0.95, 1.5, 1.3, 1.25, 3), (-0.95, 1.5, 1.2, 1.0, 1.0, 2), (0.95, 1.55, 1.2, 1.0, 0.9, 2))):
        hh, z = hgt / n, -0.15
        for j in range(n):
            f = 0.88**j
            top = rock(f"crag{i}_{j}", (x + rnd.uniform(-0.07, 0.07) * w, y + 0.05 * j, z + hh * 0.62), (w * f, d * f, hh * 1.3), 550 + i * 10 + j, rot=(rnd.uniform(-0.06, 0.06), 0.08 + rnd.uniform(-0.07, 0.07), rnd.uniform(-0.3, 0.3)), box=0.6, n=15)
            z += hh * 0.86
        cap(top, 0.24, 590 + i, grow=0.95)
    blanket("backsnow", -1.9, 1.9, 1.75, 2.6, lambda bx, by: gh(bx, by) + 0.25 * sstep(2.6, 1.9, by), 0.2, 7, nu=22, nv=6)
    for i in range(7):  # 바위 턱에서 물 위로 드리운 고드름
        x = -0.8 + i * 0.27 + rnd.uniform(-0.06, 0.06)
        icicle(f"icicle{i}", (x, 0.82 + 0.06 * abs(x), 0.72 + rnd.uniform(-0.1, 0.1)), rnd.uniform(0.22, 0.45), 5500 + i)
    for i, (a, s) in enumerate(((0.2, 0.55), (0.8, 0.42), (2.35, 0.44), (2.95, 0.58), (3.6, 0.46), (5.9, 0.42))):  # 웅덩이를 두른 눈 얹힌 돌 (앞은 물길로 트임)
        x, y = PX + math.cos(a) * PRX * wob(a) * 1.3, PY + math.sin(a) * PRY * wob(a) * 1.36
        cap(rock(f"boulder{i}", (x, y, gh(x, y) + s * 0.25), (s * 1.5, s * 1.3, s), 570 + i, rot=(rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), rnd.uniform(0, 3.14))), 0.2 * s / 0.5, 580 + i, grow=0.92)
    for i in range(8):  # 물가의 젖은 검은 돌 (눈이 앉지 않음)
        a = rnd.uniform(0, TAU)
        s = rnd.uniform(0.16, 0.3)
        rock(f"wet{i}", (PX + math.cos(a) * PRX * wob(a) * 0.98, PY + math.sin(a) * PRY * wob(a) * 0.98, 0.1 + s * 0.2), (s * 1.4, s * 1.2, s * 0.8), 5600 + i, mat="rock_wet", rot=(0, 0, rnd.uniform(0, 3.14)), box=0.4, n=11)
    # 물 긷던 흔적: 통, 긴 자루 바가지, 물가의 통나무 발판
    bz = gh(-1.75, -1.3)
    lathe("bucket", (-1.75, -1.3, bz), [(0.24, 0.0), (0.3, 0.5), (0.27, 0.52), (0.23, 0.42), (0.2, 0.1)], "wood", segs=10)
    for z in (0.12, 0.4):
        lathe(f"hoop{z}", (-1.75, -1.3, bz), [(0.255 + z * 0.1, z - 0.02), (0.275 + z * 0.1, z), (0.255 + z * 0.1, z + 0.02)], "rope", segs=10)
    log("ladle", (-1.45, -1.4, bz + 0.05), (-0.7, -0.75, 1.2), 0.035, 0.03, seed=7)
    for i in range(3):
        log(f"plank{i}", (-1.5 + 0.02 * i, -0.75 + 0.16 * i, 0.2), (-0.55, -0.95 + 0.16 * i, 0.16), 0.075, 0.07, seed=8 + i, wob=0.01)
    twig("twig0", 2.55, -0.9, gh(2.55, -0.9), 0.85, 5700)
    twig("twig1", -2.6, 0.2, gh(-2.6, 0.2), 0.75, 5710)
    for i in range(12):
        a = rnd.choice((rnd.uniform(2.6, 3.6), rnd.uniform(-0.4, 0.5)))
        x, y = math.cos(a) * 2.5, -0.1 + math.sin(a) * 1.75
        reed(f"reed{i}", x, y, gh(x, y), rnd.uniform(0.5, 0.95), 5800 + i, n=5, spread=0.1)


def build_stage(stage):
    rnd = random.Random(90 + stage)
    gh = make_gh(3.3, 2.8, 0.0, base=0.1)
    WX, DY, EAVE, RIDGE = 1.7, 1.2, 1.75, 2.5
    # 사람이 오가며 다져 흙이 드러난 자리
    ground(3.3, 2.8, 0.0, gh, lambda x, y: sstep(1.0, 0.45, max(abs(x) / (WX + 1.3), abs(y) / (DY + 1.4))), "ground_plain", n=12, segs=40)
    corners = ((-WX, -DY), (WX, -DY), (WX, DY), (-WX, DY))
    # 기초돌: 1단계는 뒤와 왼쪽만, 그 뒤로는 빙 둘러
    k = 0
    for (x0, y0), (x1, y1) in zip(corners, corners[1:] + corners[:1]):
        n = 5 if abs(x1 - x0) > 1 else 4
        for i in range(n):
            x, y = x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n
            if stage == 1 and (y < 0.5 and x > -WX + 0.2) and rnd.random() < 0.8:
                k += 1
                continue
            if y0 == y1 == -DY and 0.25 < i / n < 0.75:
                k += 1
                continue  # 앞 가운데는 드나드는 자리
            stone(f"found{k}", (x, y, gh(x, y) + 0.08), (0.42, 0.38, 0.3), 900 + k, rz=rnd.uniform(-0.3, 0.3))
            k += 1
    if stage == 1:
        # 자리를 잡는 말뚝과 줄
        for i, (x, y) in enumerate(corners):
            log(f"stake{i}", (x, y, 0.0), (x + rnd.uniform(-0.04, 0.04), y, 0.95), 0.05, 0.04, seed=i)
        for i, ((x0, y0), (x1, y1)) in enumerate(zip(corners, corners[1:] + corners[:1])):
            log(f"line{i}", (x0, y0, 0.82), (x1, y1, 0.82), 0.016, 0.016, mat="rope", segs=4, seed=10 + i, wob=0.01)
    else:
        # 기둥 여섯, 도리, 들보, 가새
        for i, (x, y) in enumerate(((-WX, -DY), (0, -DY), (WX, -DY), (-WX, DY), (0, DY), (WX, DY))):
            log(f"post{i}", (x, y, 0.1), (x + rnd.uniform(-0.03, 0.03), y, EAVE), 0.1, 0.085, seed=20 + i)
        for i, y in enumerate((-DY, DY)):
            log(f"plate{i}", (-WX - 0.25, y, EAVE + 0.06), (WX + 0.25, y, EAVE + 0.06), 0.085, 0.08, seed=30 + i)
        for i, x in enumerate((-WX, 0.0, WX)):
            log(f"tie{i}", (x, -DY - 0.2, EAVE + 0.16), (x, DY + 0.2, EAVE + 0.16), 0.08, 0.075, seed=33 + i)
        for i, (x, y, dx) in enumerate(((-WX, -DY, 0.55), (WX, -DY, -0.55), (-WX, DY, 0.55), (WX, DY, -0.55))):
            log(f"brace{i}", (x, y, EAVE - 0.7), (x + dx, y, EAVE), 0.05, 0.045, seed=36 + i)
        # 사다리: 앞 도리에 기대 세움
        for sx in (-0.2, 0.2):
            log(f"ladder{sx}", (0.9 + sx, -DY - 0.95, gh(0.9, -DY - 0.95)), (0.9 + sx, -DY - 0.1, EAVE + 0.25), 0.035, 0.03, seed=40)
        for i in range(5):
            f = 0.14 + i * 0.17
            y, z = -DY - 0.95 + 0.85 * f, gh(0.9, -DY - 0.95) + (EAVE + 0.25) * f
            log(f"rung{i}", (0.68, y, z), (1.12, y, z), 0.025, 0.025, seed=45 + i, wob=0)
    if stage == 3:
        ridge = lambda x: RIDGE - 0.06 * math.sin((x + WX) / (2 * WX) * math.pi)
        log("ridge", (-WX - 0.3, 0, ridge(-WX)), (WX + 0.3, 0, ridge(WX)), 0.08, 0.075, seed=50)
        for i, x in enumerate((-WX, 0.0, WX)):
            log(f"king{i}", (x, 0, EAVE + 0.2), (x, 0, ridge(x) - 0.05), 0.065, 0.06, seed=52 + i)
        for s in (-1, 1):
            for i in range(8):
                x = -WX - 0.15 + (2 * WX + 0.3) * i / 7
                log(f"raft{s}{i}", (x, 0, ridge(x) + 0.05), (x, s * (DY + 0.45), EAVE - 0.22), 0.045, 0.04, seed=60 + i + (s > 0) * 10)
            # 이엉: 뒤 비탈은 다 얹었고, 앞 비탈은 왼쪽 반만 (얹다 만 자리의 서까래가 보임)
            NC, NXC = 4, 30
            for kk in range(NC):
                v0, top, bot, lip = max(0.0, kk / NC - 0.05), [], [], []
                umax = 1.0 if s > 0 else 0.5 - 0.08 * kk
                for i in range(NXC + 1):
                    u = i / NXC * umax
                    x = -WX - 0.3 + (2 * WX + 0.6) * u
                    vb = min(1.06, (kk + 1) / NC + 0.06 * rnd.random())
                    P = lambda v: Vector((x, s * v * (DY + 0.5), ridge(x) + 0.1 - v * (ridge(x) - EAVE + 0.3)))
                    n = Vector((0, s * 0.55, 0.83))
                    top.append((P(v0) + n * 0.04, (x, v0 * 1.7), (0.0, 0)))
                    bot.append((P(vb) + n * 0.14, (x, vb * 1.7), (1.0, 0)))
                    lip.append((P(vb - 0.015) + n * 0.03, (x, vb * 1.7 + 0.1), (0.15, 0)))
                sheet(f"thatch{s}{kk}", [top, bot, lip], "thatch", Vector((0, s * 0.55, 0.83)))
        # 비계 장대와 발판, 올릴 짚단
        for i, x in enumerate((-0.2, 1.5)):
            log(f"scaf{i}", (x, -DY - 0.75, gh(x, -DY - 0.75)), (x, -DY - 0.7, EAVE + 0.5), 0.045, 0.04, seed=80 + i)
        log("scafbar", (-0.35, -DY - 0.72, 1.15), (1.65, -DY - 0.72, 1.15), 0.04, 0.04, seed=83, wob=0)
        for i, (x, y) in enumerate(((-2.2, -1.5), (-1.75, -1.85), (-2.35, -2.0))):
            lathe(f"sheaf{i}", (x, y, gh(x, y)), [(0.2, 0.0), (0.24, 0.3), (0.12, 0.42), (0.2, 0.7), (0.26, 0.74)], "blade", segs=9, lean=(rnd.uniform(-0.1, 0.1), 0))
            log(f"sheaftie{i}", (x, y, gh(x, y) + 0.38), (x, y, gh(x, y) + 0.46), 0.135, 0.135, mat="rope", segs=8, seed=85 + i, wob=0)
    # 쌓아 둔 통나무 (지을수록 줄어듦)와 돌무더기, 모탕 위의 통나무
    rows = {1: (4, 3, 2), 2: (3, 2), 3: (2,)}[stage]
    for j, n in enumerate(rows):
        for i in range(n):
            # 통나무 마구리가 앞(카메라)을 보게 쌓음 — 옆으로 뉘었더니 줄무늬 판자로 보였음
            x = 2.25 + (i - (n - 1) / 2) * 0.3
            z = gh(2.25, -1.9) + 0.15 + j * 0.26
            log(f"pile{j}{i}", (x, -2.55, z), (x + rnd.uniform(-0.05, 0.05), -1.15, z), 0.14, 0.13, mat="bark" if (i + j) % 2 else "wood", segs=8, seed=100 + j * 5 + i, wob=0.01)
    for i in range(7 if stage == 1 else 3):
        x, y = -2.4 + rnd.uniform(-0.35, 0.35), 1.6 + rnd.uniform(-0.3, 0.3)
        stone(f"heap{i}", (x, y, gh(x, y) + 0.1 + 0.2 * (i % 3 == 0)), (0.4, 0.36, 0.3), 950 + i, rz=rnd.uniform(0, 3))
    if stage >= 2:
        for sx in (-0.3, 0.3):  # 모탕(통나무 받침) 둘에 다듬던 통나무
            log(f"horse{sx}", (-2.3 + sx, -1.9, gh(-2.3, -1.9) + 0.12), (-2.3 + sx, -1.2, gh(-2.3, -1.2) + 0.12), 0.1, 0.1, seed=110, wob=0)
        log("worked", (-2.75, -1.55, gh(-2.3, -1.55) + 0.3), (-1.85, -1.55, gh(-2.3, -1.55) + 0.3), 0.11, 0.1, mat="heartwood", segs=8, seed=112, wob=0)
        for i in range(8):  # 대팻밥
            x, y = -2.3 + rnd.uniform(-0.6, 0.6), -1.55 + rnd.uniform(-0.5, 0.5)
            a = rnd.uniform(0, TAU)
            log(f"chip{i}", (x, y, gh(x, y) + 0.03), (x + math.cos(a) * 0.18, y + math.sin(a) * 0.18, gh(x, y) + 0.05), 0.03, 0.008, mat="heartwood", segs=4, seed=120 + i, wob=0)


def bake(name, out_dir, tex):
    """부품을 한 물체로 합치고, 재질과 틈새 그늘을 그림 한 장으로 구워 GLB + JPG로 내보냄"""
    sc = bpy.context.scene
    old = bpy.data.objects.get(name)
    if old:
        wipe(old)
    bpy.ops.object.select_all(action="DESELECT")
    for o in COLL.objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = COLL.objects[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    me = ob.data
    me.uv_layers.active = me.uv_layers.new(name="bake")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002)
    bpy.ops.object.mode_set(mode="OBJECT")
    hidden = [o for o in sc.objects if o is not ob and not o.hide_render]  # 다른 물체가 그늘을 드리우지 않게 숨김
    for o in hidden:
        o.hide_render = True
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.render.bake.margin = 6
    sc.render.bake.use_clear = True

    def one(kind, samples, **kw):
        img = bpy.data.images.new("s3_bake_" + kind, tex, tex, alpha=False)
        for m in me.materials:
            N = m.node_tree.nodes
            n = N.get("bake_target") or N.new("ShaderNodeTexImage")
            n.name = "bake_target"
            n.image = img
            N.active = n
        sc.cycles.samples = samples
        bpy.ops.object.bake(type=kind, **kw)
        px = np.empty(tex * tex * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        bpy.data.images.remove(img)
        return px.reshape(tex, tex, 4)

    color = one("DIFFUSE", 4, pass_filter={"COLOR"})
    ao = one("AO", 32)[..., :1]
    # 틈새 그늘: 그늘진 곳을 어둡고 푸르게 (눈밭의 찬 그늘)
    shade = 0.42 + 0.58 * np.clip(ao, 0, 1) ** 1.1  # 0.3부터 깔았더니 처마 밑 소품이 잿빛으로 죽었음
    tint = np.array([0.8, 0.86, 1.0], np.float32)
    rgb = color[..., :3] * shade * (tint + (1 - tint) * shade)
    stale = bpy.data.images.get(name)
    if stale:
        bpy.data.images.remove(stale)
    final = bpy.data.images.new(name, tex, tex, alpha=False)
    final.pixels.foreach_set(np.dstack([np.clip(rgb, 0, 1), np.ones((tex, tex, 1), np.float32)]).astype(np.float32).ravel())
    final.filepath_raw = os.path.join(out_dir, name + ".jpg")
    final.file_format = "JPEG"
    sc.render.image_settings.quality = 88
    final.save()
    # 구운 그림 한 장만 쓰는 재질로 바꾸고, 굽는 데 쓴 좌표만 남김
    for uv in [u for u in me.uv_layers if u.name != "bake"]:
        me.uv_layers.remove(uv)
    stale = bpy.data.materials.get("s3baked_" + name)
    if stale:
        bpy.data.materials.remove(stale)
    baked = bpy.data.materials.new("s3baked_" + name)
    baked.use_nodes = True
    t = baked.node_tree.nodes.new("ShaderNodeTexImage")
    t.image = final
    baked.node_tree.links.new(t.outputs[0], baked.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
    baked.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1.0
    me.materials.clear()
    me.materials.append(baked)
    for o in hidden:
        o.hide_render = False
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, name + ".glb"), export_format="GLB", use_selection=True, export_yup=True, export_normals=True, export_materials="NONE")
    COLL.objects.unlink(ob)  # 다음 터를 세울 때 지워지지 않게 모음 밖으로
    sc.collection.objects.link(ob)
    print(f"{name} tris={sum(len(p.vertices) - 2 for p in me.polygons)} 그림={tex}")


# 이름: (세우는 함수, 구울 그림 한 변)
SITES = {"STORE": (store, 2048), "COAL": (coal, 1536), "IRON": (iron, 1536), "FISH": (pond, 1536), "PINE": (pine, 1536), "SPRING": (spring, 1536)}
SITES.update({"BUILD1": (lambda: build_stage(1), 1024), "BUILD2": (lambda: build_stage(2), 1024), "BUILD3": (lambda: build_stage(3), 1024)})
ONLY = globals().get("ONLY")
for key, (fn, tex) in SITES.items():
    if ONLY and key not in ONLY:
        continue
    for o in list(COLL.objects):
        wipe(o)
    fn()
    print(f"{key}: 부품 {len(COLL.objects)}개, 세모 {sum(len(p.vertices) - 2 for o in COLL.objects for p in o.data.polygons)}")
    if STAGE == "all":
        bake("SITE3_" + key, ARGS[0], tex)
print("SITE3D_DONE")
