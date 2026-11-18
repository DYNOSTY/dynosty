# 가운데 온돌 2판 (2026-11-18 컨셉 시트 concept_ondol.png): 한국식 구들 정자
# 돌 구들 단 위 열린 기와 정자 · 앞쪽 아궁이 3곳 + 가마솥 · 뒤 따로 선 흙돌 굴뚝 · 장작·석탄 바구니
# 사용: blender -b --python ondol2.py -- <저장.glb> <미리보기.png>
import bpy, bmesh, sys, math, random
from mathutils import Vector, Matrix

dst, preview = sys.argv[sys.argv.index("--") + 1:][:2]
random.seed(5)
bpy.ops.wm.read_factory_settings(use_empty=True)

COLORS = {
    "stone_hot": (0.22, 0.23, 0.26), "plaster": (0.5, 0.44, 0.36), "giwa_sooty": (0.17, 0.19, 0.22),
    "timber_dark": (0.18, 0.13, 0.1), "log_bark": (0.3, 0.24, 0.18), "iron_hot": (0.05, 0.05, 0.06),
    "window": (1.0, 0.55, 0.2), "coal": (0.04, 0.04, 0.05), "thatch_sooty": (0.55, 0.45, 0.28),
    "felt_patch": (0.38, 0.32, 0.25), "snow": (0.86, 0.9, 0.97), "paving_hot": (0.09, 0.09, 0.1),
}
def mat(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*COLORS[name], 1)
    b.inputs["Roughness"].default_value = 0.85
    if name == "window":
        b.inputs["Emission Color"].default_value = (1.0, 0.45, 0.12, 1)
        b.inputs["Emission Strength"].default_value = 6.0
    return m

groups = {}
def bmg(name):
    return groups.setdefault(name, bmesh.new())
def box(name, c, size, rz=0.0, ry=0.0):
    bm = bmg(name)
    r = bmesh.ops.create_cube(bm, size=1.0)
    M = Matrix.Translation(c) @ Matrix.Rotation(math.radians(rz), 4, "Z") @ Matrix.Rotation(math.radians(ry), 4, "Y") @ Matrix.Diagonal((*size, 1))
    bmesh.ops.transform(bm, matrix=M, verts=r["verts"])
def cyl(name, c, r1, r2, h, segs=12, rot=None, caps=True):
    bm = bmg(name)
    r = bmesh.ops.create_cone(bm, cap_ends=caps, segments=segs, radius1=r1, radius2=r2, depth=h)
    M = Matrix.Translation(c) @ (rot.to_4x4() if rot else Matrix.Identity(4))
    bmesh.ops.transform(bm, matrix=M, verts=r["verts"])
def half_sphere(name, c, r, sz):
    bm = bmg(name)
    rr = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=r)
    top = [v for v in rr["verts"] if v.co.z > 0.01]
    bmesh.ops.delete(bm, geom=top, context="VERTS")  # 솥은 아래 반쪽(위는 뚜껑)
    rest = [v for v in bm.verts if v in set(rr["verts"]) - set(top)]
    bmesh.ops.transform(bm, matrix=Matrix.Translation(c) @ Matrix.Diagonal((1, 1, sz, 1)), verts=rest)

W, D, H = 7.0, 5.0, 0.9          # 구들 단 (가로·세로·높이)
FY = -D / 2 + 0.3                 # 앞면 y
# 1) 구들 단 + 아래 디딤 단 + 둘레 젖은 돌바닥(눈이 녹은 자리)
box("stone_hot", (0, 0.3, H / 2), (W, D, H))
box("stone_hot", (0, 0.3, 0.12), (W + 0.6, D + 0.6, 0.24))
cyl("paving_hot", (0, 0.3, 0.03), 5.6, 5.6, 0.06, 40)  # 눈이 녹아 젖은 어두운 돌바닥
# 2) 앞 아궁이 3곳: 안쪽 불빛 + 돌 테(양옆·위) — 단 앞면에 묻힘
for x in (-2.1, 0.0, 2.1):
    box("window", (x, FY - 0.02, 0.38), (0.72, 0.12, 0.5))
    box("stone_hot", (x, FY - 0.1, 0.72), (1.0, 0.2, 0.16))
    for sx in (-0.44, 0.44):
        box("stone_hot", (x + sx, FY - 0.1, 0.38), (0.14, 0.2, 0.62))
    # 3) 가마솥: 검은 무쇠 솥 + 뚜껑 + 손잡이
    half_sphere("iron_hot", (x, FY + 0.75, H + 0.42), 0.5, 0.8)
    cyl("iron_hot", (x, FY + 0.75, H + 0.44), 0.56, 0.52, 0.06, 18)
    cyl("iron_hot", (x, FY + 0.75, H + 0.52), 0.46, 0.28, 0.12, 18)
    cyl("iron_hot", (x, FY + 0.75, H + 0.62), 0.06, 0.06, 0.1, 8)
# 4) 기둥 8개 · 처마도리
POSTS = [(-3.2, FY + 0.15), (-1.05, FY + 0.15), (1.05, FY + 0.15), (3.2, FY + 0.15),
         (-3.2, 2.55), (-1.05, 2.55), (1.05, 2.55), (3.2, 2.55)]
for x, y in POSTS:
    cyl("timber_dark", (x, y, H + 1.42), 0.15, 0.13, 2.84, 10, caps=False)
for y in (FY + 0.15, 2.55):
    box("timber_dark", (0, y, H + 2.84), (6.8, 0.2, 0.22))
for x in (-3.2, 3.2):
    box("timber_dark", (x, 0.3, H + 2.84), (0.2, 4.6, 0.22))
# 5) 뒤쪽 양 모서리 흙벽 + 작은 불 켜진 창, 바닥 짚자리
for x in (-2.6, 2.6):
    box("plaster", (x, 2.5, H + 1.1), (1.2, 0.2, 2.2))
    box("window", (x, 2.38, H + 1.5), (0.4, 0.06, 0.34))
for k in range(6):
    box("thatch_sooty", (-2.0 + (k % 3) * 2.0, -0.4 + (k // 3) * 1.6, H + 0.012), (1.4, 1.0, 0.025), rz=random.uniform(-6, 6))
# 6) 우진각 기와지붕: 처마 네 모서리를 살짝 들어 올린 한옥 곡선
bm = bmg("giwa_sooty")
EW, ED, EZ, RZ, RL = 8.2, 6.2, H + 2.95, H + 4.65, 3.0  # 처마를 줄이고 기둥을 높여 안의 솥·아궁이가 위에서도 보이게
cy = 0.3
eave = [bm.verts.new(p) for p in ((-EW / 2, cy - ED / 2, EZ + 0.38), (EW / 2, cy - ED / 2, EZ + 0.38), (EW / 2, cy + ED / 2, EZ + 0.38), (-EW / 2, cy + ED / 2, EZ + 0.38))]
mids = [bm.verts.new(p) for p in ((0, cy - ED / 2, EZ), (EW / 2, cy, EZ + 0.08), (0, cy + ED / 2, EZ), (-EW / 2, cy, EZ + 0.08))]
ridge = [bm.verts.new((-RL / 2, cy, RZ)), bm.verts.new((RL / 2, cy, RZ))]
# 앞·뒤 사다리꼴(가운데가 처진 곡선), 옆 삼각형
bm.faces.new((eave[0], mids[0], ridge[0])); bm.faces.new((mids[0], eave[1], ridge[1])); bm.faces.new((mids[0], ridge[1], ridge[0]))
bm.faces.new((eave[2], mids[2], ridge[1])); bm.faces.new((mids[2], eave[3], ridge[0])); bm.faces.new((mids[2], ridge[0], ridge[1]))
bm.faces.new((eave[1], mids[1], ridge[1])); bm.faces.new((mids[1], eave[2], ridge[1]))
bm.faces.new((eave[3], mids[3], ridge[0])); bm.faces.new((mids[3], eave[0], ridge[0]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
# 용마루 · 내림마루 · 꼭대기 장식
box("giwa_sooty", (0, cy, RZ + 0.1), (RL + 0.5, 0.36, 0.26))
cyl("giwa_sooty", (0, cy, RZ + 0.42), 0.16, 0.08, 0.4, 10)
for sx in (-1, 1):
    for sy in (-1, 1):
        a = Vector((sx * RL / 2, cy, RZ)); b = Vector((sx * EW / 2, cy + sy * ED / 2, EZ + 0.38))
        mid = (a + b) / 2; d = b - a
        L = d.length
        rz = math.degrees(math.atan2(d.y, d.x)); ry = -math.degrees(math.asin(d.z / L))
        box("giwa_sooty", (mid.x, mid.y, mid.z + 0.1), (L, 0.22, 0.18), rz=rz, ry=ry)
# 7) 뒤에 따로 선 굴뚝: 돌 밑동 + 흙 기둥 + 작은 기와 갓, 낮은 연도로 단과 이어짐
CX, CYY = 3.9, 3.6
box("stone_hot", (CX, CYY, 0.6), (1.0, 1.0, 1.2))
box("plaster", (CX, CYY, 2.4), (0.72, 0.72, 2.4))
box("giwa_sooty", (CX, CYY, 3.72), (1.1, 1.1, 0.14))
cyl("giwa_sooty", (CX, CYY, 3.95), 0.62, 0.15, 0.36, 4, rot=Matrix.Rotation(math.pi / 4, 3, "Z"))
box("stone_hot", ((CX + 3.0) / 2, (CYY + 2.8) / 2, 0.22), (1.6, 0.5, 0.44), rz=math.degrees(math.atan2(CYY - 2.8, CX - 3.0)))
smoke = bpy.data.objects.new("smoke", None)
smoke.location = (CX, CYY, 4.3)
bpy.context.collection.objects.link(smoke)
# 8) 장작 더미 둘 · 석탄 바구니 둘
for (sx, sy, n) in ((-3.9, -1.2, 12), (3.9, -0.8, 12)):
    for k in range(n):
        cyl("log_bark", (sx, sy + (k % 4 - 1.5) * 0.26, 0.15 + (k // 4) * 0.25), 0.13, 0.13, 1.1, 8,
            rot=Matrix.Rotation(math.pi / 2, 3, "X") @ Matrix.Rotation(math.pi / 2, 3, "Y"))
for (bx, by) in ((-3.1, FY - 0.9), (3.0, FY - 0.9)):
    cyl("felt_patch", (bx, by, 0.24), 0.36, 0.42, 0.48, 14)
    for k in range(7):
        a = random.uniform(0, math.tau); r = random.uniform(0, 0.25)
        box("coal", (bx + math.cos(a) * r, by + math.sin(a) * r, 0.5 + random.uniform(0, 0.08)), (0.16, 0.14, 0.12), rz=random.uniform(0, 90))
# 9) 둘레 눈더미는 흰 접시처럼 보여서 뺌 (젖은 돌바닥이 땅 눈과 바로 만남)

# ── 최적화: 바닥에 닿아 안 보이는 아랫면 지움 · 재질마다 한 덩어리 ──
for name, bm in groups.items():
    if name not in ("snow", "giwa_sooty"):
        low = [f for f in bm.faces if f.normal.z < -0.95 and f.calc_center_median().z < 0.2]
        bmesh.ops.delete(bm, geom=low, context="FACES_ONLY")
    me = bpy.data.meshes.new(f"ondol_{name}")
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(f"ondol_{name}", me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(mat(name))
    if name == "giwa_sooty":
        mod = ob.modifiers.new("solid", "SOLIDIFY"); mod.thickness = 0.16; mod.use_rim_only = True
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=1.4)
    bpy.ops.object.mode_set(mode="OBJECT")
    ob.select_set(False)
print("FACES", sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type == "MESH"))

for ob in bpy.context.scene.objects:
    ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_apply=True, use_selection=False)

sc = bpy.context.scene
for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
    try:
        sc.render.engine = eng; break
    except TypeError:
        pass
sc.render.resolution_x, sc.render.resolution_y = 1200, 800
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.11, 0.14, 0.2, 1)
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 2.0; sun.data.color = (0.75, 0.83, 1.0); sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
sc.collection.objects.link(sun)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
el, az, dist = math.radians(36), math.radians(-125), 20
cam.location = (dist * math.cos(el) * math.cos(az), dist * math.cos(el) * math.sin(az), dist * math.sin(el) + 1.5)
cam.rotation_euler = (Vector((0, 0.3, 1.6)) - cam.location).to_track_quat("-Z", "Y").to_euler()
sc.render.filepath = preview
bpy.ops.render.render(write_still=True)
print("ONDOL2", dst)
