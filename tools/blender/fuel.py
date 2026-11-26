# 온돌 옆 연료 더미 부품 (2026-11-19 절기·혹한): 장작 한 토막 · 석탄 덩어리 3종
# 게임(fuelyard.ts)이 재고 수만큼 쌓아 올림 — 부품은 작고 가볍게
# 사용: blender -b --python fuel.py -- <저장 폴더> <미리보기.png>
import bpy, bmesh, sys, math, random
from mathutils import Vector, Matrix, noise

out_dir, preview = sys.argv[sys.argv.index("--") + 1:][:2]
random.seed(11)
bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, rgb, rough, metal=0.0):
    m = bpy.data.materials.new(name)
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    m.diffuse_color = (*rgb, 1)
    return m


BARK = mat("log_bark", (0.25, 0.17, 0.11), 0.9)  # 게임에서 공용 나무껍질 재질로 바뀜(materials.ts)
GRAIN = mat("end_grain", (0.62, 0.45, 0.28), 0.85)
COAL = mat("coal", (0.05, 0.05, 0.055), 0.45)
SNOW = mat("snow_cap", (0.9, 0.93, 0.98), 0.95)


def log_piece():
    """장작 한 토막(길이 1, 지름 약 0.22): 세로 골이 진 나무껍질 · 살짝 휜 몸통 · 옹이 · 단면은 껍질 테두리+나이테 속"""
    bm = bmesh.new()
    segs, rings = 16, 8
    r0 = 0.11
    rows = []
    for j in range(rings + 1):
        y = -0.5 + j / rings
        bend = 0.025 * math.sin((y + 0.5) * math.pi)  # 휜 몸통
        row = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            groove = 0.07 * math.sin(a * 7 + noise.noise(Vector((a, y * 3, 0))) * 2)  # 세로 골
            bump = 1 + groove + 0.06 * noise.noise(Vector((math.cos(a) * 4, math.sin(a) * 4, y * 6)))
            if j in (0, rings):
                bump *= 0.97
            row.append(bm.verts.new((math.cos(a) * r0 * bump + bend, y, math.sin(a) * r0 * bump)))
        rows.append(row)
    for j in range(rings):
        for i in range(segs):
            f = bm.faces.new((rows[j][i], rows[j][(i + 1) % segs], rows[j + 1][(i + 1) % segs], rows[j + 1][i]))
            f.material_index = 0
    # 단면: 바깥 껍질 테두리(재질0) + 안쪽 나이테(재질1, 살짝 오목)
    for j, sign in ((0, -1), (rings, 1)):
        ring = rows[j]
        y = ring[0].co.y
        inner = [bm.verts.new((v.co.x * 0.8 + (1 - 0.8) * 0.0, y - sign * 0.004, v.co.z * 0.8)) for v in ring]
        c = bm.verts.new((sum(v.co.x for v in inner) / segs, y - sign * 0.01, 0))
        for i in range(segs):
            k = (i + 1) % segs
            quad = (ring[i], ring[k], inner[k], inner[i]) if sign > 0 else (ring[k], ring[i], inner[i], inner[k])
            bm.faces.new(quad).material_index = 0
            tri = (inner[i], inner[k], c) if sign > 0 else (inner[k], inner[i], c)
            bm.faces.new(tri).material_index = 1
    # 옹이 두 개: 몸통에서 살짝 튀어나온 혹
    for y, a in ((-0.18, 1.1), (0.24, 3.9)):
        j = int((y + 0.5) * rings)
        i = int(a / (2 * math.pi) * segs) % segs
        for jj in (j, j + 1):
            for ii in (i, (i + 1) % segs):
                v = rows[jj][ii]
                d = Vector((v.co.x, 0, v.co.z)).normalized()
                v.co += d * 0.025
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("FUEL_LOG")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(BARK)
    me.materials.append(GRAIN)
    for p in me.polygons:
        p.use_smooth = p.material_index == 0
    return bpy.data.objects.new("FUEL_LOG", me)


def coal_chunk(k):
    """석탄 덩어리: 잘게 나눈 덩이에 울퉁불퉁 + 깨진 면 3~4개를 평평하게 잘라냄(칼로 쪼갠 듯)"""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.09)
    sx, sy, sz = 1 + random.uniform(-0.2, 0.35), 1 + random.uniform(-0.2, 0.2), 0.7 + random.uniform(-0.1, 0.15)
    for v in bm.verts:
        n = noise.noise(v.co * 14 + Vector((k * 3.1, k * 1.7, 0))) + 0.5 * noise.noise(v.co * 40 + Vector((k, 0, 2)))
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz)) * (1 + 0.22 * n)
    for _ in range(3 + k % 2):
        nrm = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-0.6, 1))).normalized()
        cut = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=nrm * 0.055, plane_no=nrm, clear_outer=True)
        edges = [e for e in cut["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
        if edges:
            bmesh.ops.holes_fill(bm, edges=edges)
    me = bpy.data.meshes.new(f"FUEL_COAL_{k}")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(COAL)
    for p in me.polygons:
        p.use_smooth = False
    return bpy.data.objects.new(f"FUEL_COAL_{k}", me)


objs = [log_piece()] + [coal_chunk(k) for k in range(3)]
for i, o in enumerate(objs):
    bpy.context.collection.objects.link(o)
    o.location = (i * 0.5, 0, 0.15)

for o in objs:
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    loc = o.location.copy()
    o.location = (0, 0, 0)
    bpy.ops.export_scene.gltf(filepath=f"{out_dir}/{o.name}.glb", export_format="GLB", use_selection=True, export_yup=True)
    o.location = loc

# 미리보기: 장작 4줄 더미 + 석탄 더미
sc = bpy.context.scene
for row in range(4):
    for i in range(6 - row % 2):
        o = objs[0].copy()
        sc.collection.objects.link(o)
        o.rotation_euler = (0, 0, math.pi / 2)
        o.location = (-1.2, -0.6 + i * 0.23 + (row % 2) * 0.115, 0.11 + row * 0.2)
for i in range(40):
    o = objs[1 + i % 3].copy()
    sc.collection.objects.link(o)
    a = random.uniform(0, math.tau)
    r = random.uniform(0, 0.55) * (1 - i / 50)
    o.location = (0.9 + math.cos(a) * r, math.sin(a) * r, 0.06 + (0.55 - r) * 0.55)
    o.rotation_euler = (random.uniform(0, 3), random.uniform(0, 3), random.uniform(0, 3))
sc.render.engine = "BLENDER_WORKBENCH"
sc.display.shading.color_type = "MATERIAL"
sc.display.shading.light = "STUDIO"
sc.render.resolution_x, sc.render.resolution_y = 900, 500
sc.world = bpy.data.worlds.new("w")
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam
cam.location = (0.2, -4.2, 2.4)
cam.rotation_euler = (Vector((0, 0, 0.4)) - cam.location).to_track_quat("-Z", "Y").to_euler()
sc.render.filepath = preview
bpy.ops.render.render(write_still=True)
print("FUEL_DONE")
