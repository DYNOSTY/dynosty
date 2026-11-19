# 지게 + 짐 3종 (2026-11-19 일의 과정): 일꾼이 늘 빈 지게를 지고, 돌아올 때만 짐(LOAD)이 보임
# 게임(village.ts)은 노드 이름으로 LOAD를 켜고 끔. 재질 이름은 materials.ts 공용 재질(log_bark·timber_dark·thatch_sooty·felt_patch)
# 블렌더 좌표: Z 위, +Y = 등 뒤(짐 쪽). 원점 = 등에 닿는 가운데(멜빵 높이 중간)
# 사용: blender -b --python jige.py -- <저장 폴더> <미리보기.png>
import bpy, bmesh, sys, math, random
from mathutils import Vector, Matrix, noise

out_dir, preview = sys.argv[sys.argv.index("--") + 1:][:2]
random.seed(5)


def mat(name, rgb, rough=0.85):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    m.diffuse_color = (*rgb, 1)
    return m


def tube(points, r, material, segs=8, taper=1.0, name="tube"):
    """점들을 잇는 둥근 막대(나무 기둥·새끼줄)"""
    bm = bmesh.new()
    rings = []
    n = len(points)
    for i, p in enumerate(points):
        a = points[min(i + 1, n - 1)] - points[max(i - 1, 0)]
        t = a.normalized()
        side = t.cross(Vector((0, 0, 1)))
        if side.length < 1e-3:
            side = t.cross(Vector((1, 0, 0)))
        side.normalize()
        up = side.cross(t)
        rr = r * (1 + (taper - 1) * i / max(1, n - 1))
        ring = []
        for k in range(segs):
            ang = 2 * math.pi * k / segs
            bump = 1 + 0.08 * noise.noise(p * 9 + Vector((k, 0, 0)))
            ring.append(bm.verts.new(p + (side * math.cos(ang) + up * math.sin(ang)) * rr * bump))
        rings.append(ring)
    for i in range(n - 1):
        for k in range(segs):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % segs], rings[i + 1][(k + 1) % segs], rings[i + 1][k]))
    for ring, rev in ((rings[0], True), (rings[-1], False)):
        bm.faces.new(list(reversed(ring)) if rev else ring)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    for p in me.polygons:
        p.use_smooth = True
    return me


def obj(me, name, parent=None):
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.parent = parent
    return o


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    objs[0].data.name = name
    return objs[0]


def build(kind):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    BARK = mat("log_bark", (0.3, 0.2, 0.13))
    WOOD = mat("timber_dark", (0.35, 0.24, 0.15))
    STRAW = mat("thatch_sooty", (0.62, 0.5, 0.3))
    ROPE = mat("felt_patch", (0.55, 0.45, 0.32))
    root = bpy.data.objects.new("JIGE_ROOT", None)
    bpy.context.collection.objects.link(root)
    parts = []
    # 양쪽 기둥: 아래는 벌어지고 위로 갈수록 모임, 살짝 휨. 원점 위아래 -0.55~+0.75
    for sx in (-1, 1):
        pts = [Vector((sx * (0.27 - 0.1 * t), 0.03 * math.sin(t * math.pi), -0.6 + 1.38 * t)) for t in [i / 8 for i in range(9)]]
        parts.append(obj(tube(pts, 0.032, BARK, taper=0.75, name="pole"), "pole"))
        # 뒤로 뻗은 가지(짐 받침): 기둥 아래쪽에서 위로 비스듬히
        base = Vector((sx * 0.25, 0.02, -0.18))
        prong = [base + Vector((0, 0.42 * t, 0.2 * t + 0.06 * t * t)) for t in [i / 5 for i in range(6)]]
        parts.append(obj(tube(prong, 0.026, BARK, segs=7, taper=0.6, name="prong"), "prong"))
        # 멜빵: 위 세장에서 앞(-Y)으로 둥글게 내려와 아래 세장으로
        strap = [Vector((sx * (0.16 + 0.03 * math.sin(a)), -0.16 * math.sin(a) - 0.02, 0.62 - 0.95 * (a / math.pi))) for a in [i / 10 * math.pi for i in range(11)]]
        parts.append(obj(tube(strap, 0.02, ROPE, segs=6, name="strap"), "strap"))
    # 세장(가로대) 셋
    for z, w in ((-0.38, 0.25), (0.08, 0.22), (0.5, 0.185)):
        parts.append(obj(tube([Vector((-w, 0.0, z)), Vector((w, 0.0, z))], 0.02, WOOD, segs=6, name="bar"), "bar"))
    # 짚 등태: 가운데 엮은 판
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.transform(bm, matrix=Matrix.Translation((0, -0.02, 0.28)) @ Matrix.Diagonal((0.36, 0.05, 0.42, 1)), verts=bm.verts)
    me = bpy.data.meshes.new("pad")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(STRAW)
    parts.append(obj(me, "pad"))
    jige = join(parts, "JIGE")
    jige.parent = root

    load = []
    if kind == "wood":
        # 장작단: 가지 위에 가로로 9토막, 새끼로 두 번 묶고 위에 눈
        for row in range(3):
            for i in range(4 - row % 2):
                x = 0
                y = 0.2 + (i - (3 - row % 2) / 2) * 0.1
                z = -0.02 + row * 0.095
                pts = [Vector((-0.42, y, z + 0.01 * random.uniform(-1, 1))), Vector((0.42, y + 0.01, z))]
                load.append(obj(tube(pts, 0.05, BARK, segs=8, name="log"), "log"))
        for x in (-0.22, 0.22):
            loop = [Vector((x, 0.2 + 0.25 * math.cos(a), 0.09 + 0.17 * math.sin(a))) for a in [i / 12 * 2 * math.pi for i in range(13)]]
            load.append(obj(tube(loop, 0.012, ROPE, segs=5, name="tie"), "tie"))
    elif kind == "plant":
        # 고사리·풀 단 셋: 아래를 새끼로 묶고, 가는 잎 14장이 위로 부채처럼 퍼짐
        GREEN = mat("fern_bundle", (0.3, 0.42, 0.24))
        for i, x in enumerate((-0.19, 0.0, 0.19)):
            bm = bmesh.new()
            for k in range(14):
                ang = (k / 13 - 0.5) * 1.1 + random.uniform(-0.08, 0.08)
                tilt = random.uniform(-0.35, 0.35)
                L = random.uniform(0.5, 0.68)
                base = Vector((x, 0.22, -0.04))
                tip = base + Vector((math.sin(ang) * L * 0.55, math.sin(tilt) * L * 0.4, math.cos(ang) * L))
                mid = base.lerp(tip, 0.55) + Vector((0, 0.03, 0))
                w = 0.035
                side = Vector((math.cos(ang), 0, -math.sin(ang))) * w
                v = [bm.verts.new(base - side * 0.3), bm.verts.new(base + side * 0.3), bm.verts.new(mid + side), bm.verts.new(mid - side), bm.verts.new(tip)]
                bm.faces.new((v[0], v[1], v[2], v[3]))
                bm.faces.new((v[3], v[2], v[4]))
            me = bpy.data.meshes.new("fern")
            bm.to_mesh(me)
            bm.free()
            me.materials.append(GREEN)
            load.append(obj(me, "fern"))
            load.append(obj(tube([Vector((x - 0.05, 0.22, 0.02)), Vector((x + 0.05, 0.22, 0.02))], 0.03, ROPE, segs=6, name="band"), "band"))
    else:
        # 물고기 두름: 새끼줄 두 가닥에 꿰어 매단 물고기 6마리
        FISH = mat("fish_scale", (0.55, 0.6, 0.64), 0.4)
        for sx in (-0.13, 0.13):
            load.append(obj(tube([Vector((sx, 0.18, 0.5)), Vector((sx, 0.2, -0.15))], 0.01, ROPE, segs=5, name="string"), "string"))
            for k in range(3):
                z = 0.38 - k * 0.26
                bm = bmesh.new()
                bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.05)
                bmesh.ops.transform(bm, matrix=Matrix.Translation((sx, 0.24, z)) @ Matrix.Diagonal((0.6, 0.45, 1.7, 1)), verts=bm.verts)
                # 꼬리지느러미
                t1 = bm.verts.new((sx, 0.24, z - 0.12))
                t2 = bm.verts.new((sx - 0.05, 0.24, z - 0.2))
                t3 = bm.verts.new((sx + 0.05, 0.24, z - 0.2))
                bm.faces.new((t1, t2, t3))
                me = bpy.data.meshes.new("fish")
                bm.to_mesh(me)
                bm.free()
                me.materials.append(FISH)
                load.append(obj(me, "fish"))
    # 짐 위 눈
    SNOW = mat("snow", (0.9, 0.93, 0.98), 0.95)
    if kind == "wood":
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=6, radius=0.2)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < 0], context="VERTS")
        bmesh.ops.transform(bm, matrix=Matrix.Translation((0, 0.21, 0.28 if kind == "wood" else 0.5)) @ Matrix.Diagonal((1.9, 0.9, 0.25, 1)), verts=bm.verts)
        me = bpy.data.meshes.new("snowcap")
        bm.to_mesh(me)
        bm.free()
        me.materials.append(SNOW)
        load.append(obj(me, "snowcap"))
    ld = join(load, "LOAD")
    ld.parent = root
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=f"{out_dir}/JIGE_{kind}.glb", export_format="GLB", use_selection=False)
    return root


for k in ("wood", "plant", "fish"):
    build(k)

# 미리보기: 세 가지 나란히
bpy.ops.wm.read_factory_settings(use_empty=True)
for i, k in enumerate(("wood", "plant", "fish")):
    bpy.ops.import_scene.gltf(filepath=f"{out_dir}/JIGE_{k}.glb")
    for o in bpy.context.selected_objects:
        if o.parent is None:
            o.location.x += (i - 1) * 1.3
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"
sc.display.shading.color_type = "MATERIAL"
sc.display.shading.light = "STUDIO"
sc.render.resolution_x, sc.render.resolution_y = 1000, 560
sc.world = bpy.data.worlds.new("w")
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam
cam.location = (2.2, 3.4, 1.4)
cam.rotation_euler = (Vector((0, 0, 0.1)) - cam.location).to_track_quat("-Z", "Y").to_euler()
sc.render.filepath = preview
bpy.ops.render.render(write_still=True)
print("JIGE_DONE")
