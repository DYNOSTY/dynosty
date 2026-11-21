# 공룡 주민 겨울 차림 (2026-11-18 공룡 컨셉 시트): 목도리 · 등불 · 짚 발싸개 · 어깨/등 눈
# 액세서리는 뼈에 묶어(가중치 1) 걷기·일하기 동작을 그대로 따라감
# 사용: blender -b --python dino.py -- <원본.glb> <저장.glb> <미리보기.png>
import bpy, bmesh, sys, math
from mathutils import Vector, Matrix

src, dst, preview = sys.argv[sys.argv.index("--") + 1:][:3]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
body = [o for o in bpy.context.scene.objects if o.type == "MESH"]
B = {b.name: (arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in arm.data.bones}
quad = "front_L_lower" in B

COLORS = {"wool_scarf": (0.86, 0.8, 0.66), "straw_wrap": (0.7, 0.58, 0.36), "window": (1.0, 0.55, 0.2),
          "iron_rusted": (0.12, 0.09, 0.08), "snow": (0.9, 0.93, 0.98)}
def mat(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*COLORS[name], 1)
    b.inputs["Roughness"].default_value = 0.9
    m.diffuse_color = (*COLORS[name], 1)  # 미리보기(워크벤치)에도 같은 색
    if name == "window":
        b.inputs["Emission Color"].default_value = (1.0, 0.5, 0.15, 1)
        b.inputs["Emission Strength"].default_value = 1.2  # 세면 하얗게 날아감 → 주황이 보이게
    return m

def bone_radius(bone, t0=0.0, t1=1.0, pct=0.8):
    """그 뼈에 묶인 살의 굵기(뼈 축에서 떨어진 거리, 80번째 백분위)"""
    h, t = B[bone]
    axis = t - h
    L2 = axis.length_squared or 1e-6
    ds = []
    for ob in body:
        g = ob.vertex_groups.get(bone)
        if not g:
            continue
        for v in ob.data.vertices:
            w = next((x.weight for x in v.groups if x.group == g.index), 0.0)
            if w < 0.5:
                continue
            p = ob.matrix_world @ v.co
            s = max(0.0, min(1.0, (p - h).dot(axis) / L2))
            if t0 <= s <= t1:
                ds.append((p - (h + axis * s)).length)
    ds.sort()
    return ds[int(len(ds) * pct)] if ds else 0.15

parts = []  # (재질, bmesh, 뼈)
def ring(material, bone, at, normal, major, minor, segs=20):
    bm = bmesh.new()
    rr = bmesh.ops.create_circle(bm, cap_ends=False, segments=segs, radius=major)
    # 원을 굵게: 고리 단면을 skin 대신 작은 원뿔 띠로 (가볍게)
    geom = bmesh.ops.extrude_edge_only(bm, edges=bm.edges)
    new = [e for e in geom["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.scale(bm, vec=(1 + minor / major, 1 + minor / major, 1), verts=new)
    bmesh.ops.translate(bm, vec=(0, 0, minor * 1.6), verts=new)
    geom2 = bmesh.ops.extrude_edge_only(bm, edges=[e for e in bm.edges if all(v in new for v in e.verts)])
    new2 = [e for e in geom2["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.scale(bm, vec=(major / (major + minor), major / (major + minor), 1), verts=new2)
    bmesh.ops.translate(bm, vec=(0, 0, minor * 1.6), verts=new2)
    rot = Vector((0, 0, 1)).rotation_difference(normal.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation(at) @ rot, verts=bm.verts)
    parts.append((material, bm, bone))
def band(material, bone, at, axis, radius, height, segs=18, flare=1.0):
    """뼈를 감는 짧은 천 띠 (속이 빈 원통 · 뚜껑 없음 — 안은 몸이라 안 보임)"""
    bm = bmesh.new()
    rr = bmesh.ops.create_cone(bm, cap_ends=False, segments=segs, radius1=radius * flare, radius2=radius, depth=height)
    rot = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation(at) @ rot, verts=rr["verts"])
    parts.append((material, bm, bone))
def box(material, bone, c, size):
    bm = bmesh.new()
    r = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(c) @ Matrix.Diagonal((*size, 1)), verts=r["verts"])
    parts.append((material, bm, bone))
def blob(material, bone, c, r, sz):
    bm = bmesh.new()
    rr = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=r)
    bmesh.ops.delete(bm, geom=[v for v in rr["verts"] if v.co.z < -0.01], context="VERTS")  # 아래 반쪽은 몸에 묻힘
    bmesh.ops.transform(bm, matrix=Matrix.Translation(c) @ Matrix.Diagonal((1, 1, sz, 1)), verts=bm.verts)
    parts.append((material, bm, bone))

# 1) 목도리: 목 뿌리에 두 겹 + 앞으로 늘어진 자락
nh, nt = B["neck"]
nr = bone_radius("neck", 0.0, 0.5)
ndir = (nt - nh).normalized()
band("wool_scarf", "neck", nh + ndir * 0.06, ndir, nr + 0.035, 0.16, flare=1.12)
fwd = Vector((0, -1, 0))
box("wool_scarf", "chest", nh + fwd * (nr + 0.07) + Vector((0.06, 0, -0.18)), (0.13, 0.05, 0.38))

# 2) 등불: 두 발은 오른손 아래, 네 발은 가슴 옆에 매달림
if quad:
    ch, _ = B["chest"]
    side = Vector((bone_radius("chest") + 0.06, 0, -0.05))
    lamp_at, lamp_bone = ch + side, "chest"
else:
    hh, _ = B["arm_R_hand"]
    lamp_at, lamp_bone = hh + Vector((0, 0, -0.2)), "arm_R_hand"
box("window", lamp_bone, lamp_at, (0.13, 0.13, 0.17))
box("iron_rusted", lamp_bone, lamp_at + Vector((0, 0, 0.1)), (0.17, 0.17, 0.03))
box("iron_rusted", lamp_bone, lamp_at + Vector((0, 0, -0.1)), (0.15, 0.15, 0.03))

# 3) 짚 발싸개: 발목 위 두 겹
legs = ["front_L_lower", "front_R_lower", "hind_L_lower", "hind_R_lower"] if quad else ["leg_L_lower", "leg_R_lower"]
for lg in legs:
    h, t = B[lg]
    d = (t - h)
    r = bone_radius(lg, 0.55, 0.95)
    band("straw_wrap", lg, h + d * 0.8, d, r + 0.025, max(0.1, d.length * 0.28), flare=1.08)

# 4) 눈: 두 발은 어깨, 네 발은 등(짐) 꼭대기
if quad:
    sh, st = B["spine"]
    top = max((ob.matrix_world @ v.co).z for ob in body for v in ob.data.vertices
              if abs((ob.matrix_world @ v.co).x) < 0.3 and abs((ob.matrix_world @ v.co).y - sh.y) < 0.35)
    blob("snow", "spine", Vector((sh.x, sh.y, top - 0.02)), 0.34, 0.35)
else:
    for s in ("arm_L_upper", "arm_R_upper"):
        h, _ = B[s]
        blob("snow", "chest", h + Vector((0, 0.02, 0.07)), 0.11, 0.45)

# ── 뼈에 묶기 (같은 재질은 한 덩어리) ──
by = {}
for material, bm, bone in parts:
    by.setdefault(material, []).append((bm, bone))
for material, items in by.items():
    me = bpy.data.meshes.new(f"winter_{material}")
    bm_all = bmesh.new()
    vgroups = []  # 꼭짓점별 뼈
    for bm, bone in items:
        bm.verts.ensure_lookup_table()
        start = len(bm_all.verts)
        vmap = {}
        for v in bm.verts:
            nv = bm_all.verts.new(v.co)
            vmap[v] = nv
            vgroups.append(bone)
        for f in bm.faces:
            try:
                bm_all.faces.new([vmap[v] for v in f.verts])
            except ValueError:
                pass
        bm.free()
    bm_all.to_mesh(me); bm_all.free()
    ob = bpy.data.objects.new(f"winter_{material}", me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(mat(material))
    for p in me.polygons:
        p.use_smooth = True
    for bone in set(vgroups):
        g = ob.vertex_groups.new(name=bone)
        g.add([i for i, b in enumerate(vgroups) if b == bone], 1.0, "REPLACE")
    ob.parent = arm
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
print("PARTS", {k: len(v) for k, v in by.items()}, "quad", quad)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", use_selection=False, export_animations=True)

# 미리보기
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"  # 뼈 있는 모델은 Eevee 미리보기에서 가끔 멈춤 → 가벼운 렌더
sc.display.shading.color_type = "MATERIAL"
sc.display.shading.light = "STUDIO"
sc.render.resolution_x, sc.render.resolution_y = 700, 700
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.12, 0.15, 0.22, 1)
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 3
sun.rotation_euler = (math.radians(45), 0, math.radians(-30)); sc.collection.objects.link(sun)
pts = [o.matrix_world @ v.co for o in body for v in o.data.vertices]
c = sum(pts, Vector()) / len(pts)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.location = c + Vector((-3.0, -4.4, 1.6))
cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
sc.render.filepath = preview
bpy.ops.render.render(write_still=True)
print("DINO_DONE", dst)
