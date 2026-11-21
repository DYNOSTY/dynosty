# 공룡 주민 겨울 차림 v3 (2026-11-18, 컨셉 시트를 그대로 따라 다시 만듦)
# - 망토(coat)·피부 → 컨셉 시트 견본에서 뽑은 누빔·비늘 재질 (월드 기준 상자 투영 UV, 이어 붙임)
# - 밑단 띠(Unbleached silk) → 털로 바꾸고 부풀림
# - 새로 깎음: 털 깃 · 뜨개 목도리(두 겹 + 늘어진 자락 + 술) · 털+짚 발싸개 · 등불(틀+빛) · 네 발은 등짐(말이 + 끈) · 눈
# - 덧붙인 것은 뼈에 묶어(가중치 1) 걷기·일하기 동작을 따라감
# 사용: blender -b --python dino2.py -- <원본.glb> <재질 폴더> <저장.glb> <미리보기.png>
import bpy, bmesh, sys, math, random
from mathutils import Vector, Matrix

src, texdir, dst, preview = sys.argv[sys.argv.index("--") + 1:][:4]
random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
body = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.parent == arm and o.data.vertices]
B = {b.name: (arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in arm.data.bones}
quad = "front_L_lower" in B
pts = [o.matrix_world @ v.co for o in body for v in o.data.vertices]
H = max(p.z for p in pts)  # 키(월드)
print("H", round(H, 2), "quad", quad)

# ── 재질 ──
def img(name, color=True):
    im = bpy.data.images.load(f"{texdir}/{name}.jpg", check_existing=True)
    if not color:
        im.colorspace_settings.name = "Non-Color"
    return im

_mats = {}
def tex_mat(kind, tint=(1, 1, 1), emit=0.0, rough=0.92):
    key = (kind, tint, emit)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(f"v3_{kind}")
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = img(kind)
    if tint != (1, 1, 1):
        mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        nt.links.new(t.outputs["Color"], mix.inputs[6]); mix.inputs[7].default_value = (*tint, 1)
        nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    else:
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    if kind != "lamp":
        n = nt.nodes.new("ShaderNodeTexImage"); n.image = img(kind + "_n", False)
        nm = nt.nodes.new("ShaderNodeNormalMap"); nm.inputs["Strength"].default_value = 0.8
        nt.links.new(n.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if emit:
        nt.links.new(t.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emit
    _mats[key] = m
    return m

def flat_mat(name, rgb, rough=0.85, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    m.diffuse_color = (*rgb, 1)
    return m

TILE = {"quilt": 0.16, "fur": 0.09, "knit": 0.06, "straw": 0.08, "skin": 0.12}  # 키 대비 무늬 한 칸 크기

def box_uv(me, mw, kind):
    """면 방향에 맞춘 상자 투영 UV — 원래 UV(그림 그려진 배치)를 덮어씀"""
    tile = TILE[kind] * H
    if not me.uv_layers:
        me.uv_layers.new()
    uv = me.uv_layers.active.data
    rot = mw.to_3x3()
    for p in me.polygons:
        n = rot @ p.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        a1, a2 = [(1, 2), (0, 2), (0, 1)][ax]
        for li in p.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = (co[a1] / tile, co[a2] / tile)

def puff(o):
    """망토를 한 번 잘게 나누고 누빔 재질 밝기만큼 바깥으로 밀어 솜 넣은 누빔처럼 (뼈 가중치는 나눌 때 그대로 따라감)"""
    tex = bpy.data.textures.new("quilt_puff", "IMAGE")
    tex.image = img("quilt")
    sub = o.modifiers.new("puff_sub", "SUBSURF"); sub.subdivision_type = "SIMPLE"; sub.levels = 1; sub.render_levels = 1
    dsp = o.modifiers.new("puff_disp", "DISPLACE"); dsp.texture = tex; dsp.texture_coords = "UV"
    dsp.strength = 0.018 * H / o.matrix_world.to_scale().x; dsp.mid_level = 0.45
    with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
        bpy.ops.object.modifier_move_to_index(modifier="puff_sub", index=0)
        bpy.ops.object.modifier_move_to_index(modifier="puff_disp", index=1)
        bpy.ops.object.modifier_apply(modifier="puff_sub")
        bpy.ops.object.modifier_apply(modifier="puff_disp")
        # 굴곡은 남기고 면 수만 반으로 (파일·그리기 부담)
        dec = o.modifiers.new("puff_dec", "DECIMATE"); dec.ratio = 0.45
        bpy.ops.object.modifier_move_to_index(modifier="puff_dec", index=0)
        bpy.ops.object.modifier_apply(modifier="puff_dec")
    print("PUFF", o.name, len(o.data.vertices))

# 1) 기존 옷·피부 다시 입히기
for o in body:
    if not o.data.materials:
        continue
    name = o.data.materials[0].name
    kind = None
    if name.endswith("_coat_brush"):
        kind = "quilt"
    elif name.endswith("_skin_brush"):
        kind = "skin"
    elif name == "Unbleached silk":
        kind = "fur"
        # 털 띠는 두툼하게: 꼭짓점을 바깥으로 밀어 부풀림
        for v in o.data.vertices:
            v.co += v.normal * (0.012 * H / o.matrix_world.to_scale().x)
    if kind:
        box_uv(o.data, o.matrix_world, kind)
        o.data.materials[0] = tex_mat(kind)
        if kind == "quilt":
            puff(o)
        print("RETEX", name, "->", kind)

# ── 덧붙이는 모양 ──
def bone_radius(bone, t0=0.0, t1=1.0, pct=0.8):
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

parts = []  # (재질, bmesh, 뼈, 재질종류 또는 None)
def orient(bm, at, axis):
    rot = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation(at) @ rot, verts=bm.verts)

def torus(mat, bone, at, axis, R, r, segs=28, rings=10, lumpy=0.0, squash=1.0):
    """도넛: 털 깃·발목 털·목도리. lumpy>0이면 굵기를 들쭉날쭉하게(털 뭉치)"""
    bm = bmesh.new()
    grid = []
    bumps = [1 + random.uniform(-lumpy, lumpy) for _ in range(segs)]
    for i in range(segs):
        a = 2 * math.pi * i / segs
        row = []
        for j in range(rings):
            b = 2 * math.pi * j / rings
            rr = r * bumps[i] * (1 + random.uniform(-lumpy, lumpy) * 0.6)
            x = (R + rr * math.cos(b)) * math.cos(a)
            y = (R + rr * math.cos(b)) * math.sin(a)
            z = rr * math.sin(b) * squash
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for i in range(segs):
        for j in range(rings):
            bm.faces.new((grid[i][j], grid[(i + 1) % segs][j], grid[(i + 1) % segs][(j + 1) % rings], grid[i][(j + 1) % rings]))
    orient(bm, at, axis)
    parts.append((mat, bm, bone))

def tube(mat, bone, at, axis, radius, height, segs=20, flare=1.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=segs, radius1=radius * flare, radius2=radius, depth=height)
    orient(bm, at, axis)
    parts.append((mat, bm, bone))

def cyl(mat, bone, at, axis, radius, length, segs=16):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=radius, radius2=radius, depth=length)
    orient(bm, at, axis)
    parts.append((mat, bm, bone))

def box(mat, bone, c, size, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    m = Matrix.Translation(c) @ (rot or Matrix.Identity(4)) @ Matrix.Diagonal((*size, 1))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    parts.append((mat, bm, bone))

def blob(mat, bone, c, r, sz, sx=1.0):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=6, radius=r)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.01], context="VERTS")
    bmesh.ops.transform(bm, matrix=Matrix.Translation(c) @ Matrix.Diagonal((sx, 1, sz, 1)), verts=bm.verts)
    parts.append((mat, bm, bone))

FUR, KNIT, STRAW, LAMP = tex_mat("fur"), tex_mat("knit"), tex_mat("straw"), tex_mat("lamp", emit=2.0)
QUILT = tex_mat("quilt")
WOOD = flat_mat("v3_lamp_frame", (0.16, 0.1, 0.06), 0.7)
LEATHER = flat_mat("v3_strap", (0.3, 0.18, 0.1), 0.75)
SNOW = flat_mat("v3_snow", (0.88, 0.92, 0.98), 0.95)
TEXKIND = {FUR: "fur", KNIT: "knit", STRAW: "straw", QUILT: "quilt"}

# 2) 털 깃 + 뜨개 목도리
nh, nt_ = B["neck"]
ndir = (nt_ - nh).normalized()
nr = bone_radius("neck", 0.0, 0.45)
fwd = Vector((0, -1, 0))
# 목 보호대처럼 겹겹이 쌓이지 않게: 털 깃은 납작하게 어깨에, 목도리는 한 겹을 앞이 처지게 기울여 두름
torus(FUR, "chest", nh - ndir * 0.01 * H, ndir, nr + 0.04 * H, 0.04 * H, lumpy=0.35, squash=0.55)
# 목도리(컨셉처럼 굵게): 두툼한 한 바퀴 + 앞 매듭 + 길이 다른 자락 둘 + 끝 술
drape = (ndir + fwd * 0.45).normalized() if not quad else ndir
torus(KNIT, "neck", nh + ndir * 0.05 * H, drape, nr + 0.03 * H, 0.05 * H, rings=10, lumpy=0.08)
up = Vector((0, 0, 1))
# 자락이 매달리는 곳: 두 발은 가슴 앞, 네 발은 목 아래(주름장식에 안 가리게)
hang = (nh + ndir * 0.05 * H + fwd * (nr + 0.05 * H)) if not quad else (nh + ndir * 0.06 * H - up * (nr + 0.04 * H))
blob(KNIT, "neck", hang - up * 0.03 * H, 0.05 * H, 1.1)  # 매듭
for k, (dx, ln) in enumerate(((0.035, 0.25), (-0.03, 0.19))):
    tail_len = ln * H * (0.85 if quad else 1.0)
    tilt = Matrix.Rotation(math.radians(7 if k == 0 else -9), 4, "Y") @ Matrix.Rotation(math.radians(-6), 4, "X")
    top = hang + Vector((dx * H, 0, -0.04 * H))
    c = top + Vector((0, 0, -tail_len / 2))
    box(KNIT, "chest", c, (0.085 * H, 0.022 * H, tail_len), tilt)
    for f in range(5):  # 술
        fx = (f - 2) * 0.017 * H
        box(KNIT, "chest", c + tilt.to_3x3() @ Vector((fx, 0, -tail_len / 2 - 0.028 * H)), (0.009 * H, 0.009 * H, 0.05 * H), tilt)

# 3) 발목: 짚 감개 + 위에 털 도넛
legs = ["front_L_lower", "front_R_lower", "hind_L_lower", "hind_R_lower"] if quad else ["leg_L_lower", "leg_R_lower"]
for lg in legs:
    h, t = B[lg]
    d = t - h
    r = bone_radius(lg, 0.45, 0.95)
    # 장화 하나처럼: 짚 감개 윗단에 털 테두리를 딱 붙임(따로 떨어진 고리 두 개 = 용수철처럼 보임)
    tube(STRAW, lg, h + d * 0.72, d, r + 0.018 * H, d.length * 0.42, flare=1.1)
    torus(FUR, lg, h + d * 0.52, d, r + 0.022 * H, 0.02 * H, lumpy=0.15, squash=0.75)

# 3-2) 벙어리장갑: 두 발 공룡 두 손
if not quad:
    for hand in ("arm_L_hand", "arm_R_hand"):
        hh, ht = B[hand]
        c = hh + (ht - hh) * 0.35
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=7, radius=0.042 * H)
        bmesh.ops.transform(bm, matrix=Matrix.Translation(c) @ Matrix.Diagonal((1.0, 0.9, 1.25, 1)), verts=bm.verts)
        parts.append((KNIT, bm, hand))
        torus(FUR, hand, hh + (ht - hh) * 0.02, ht - hh, 0.04 * H, 0.016 * H, segs=16, rings=6, lumpy=0.3)

# 4) 등불: 나무 틀 + 빛나는 창 + 위 뚜껑·고리
if quad:
    ch, _ = B["chest"]
    cr = bone_radius("chest")
    lamp_at, lamp_bone = ch + Vector((-(cr + 0.06 * H), -0.04 * H, -0.04 * H)), "chest"  # 왼쪽 어깨 옆
else:
    hh, _ = B["arm_R_hand"]
    lamp_at, lamp_bone = hh + Vector((0.01 * H, -0.02 * H, -0.08 * H)), "arm_R_hand"
L = 0.1 * H
box(LAMP, lamp_bone, lamp_at, (L * 0.8, L * 0.8, L))
for sx in (-1, 1):
    for sy in (-1, 1):
        box(WOOD, lamp_bone, lamp_at + Vector((sx * L * 0.42, sy * L * 0.42, 0)), (L * 0.12, L * 0.12, L * 1.05))
box(WOOD, lamp_bone, lamp_at + Vector((0, 0, L * 0.58)), (L * 1.05, L * 1.05, L * 0.16))
box(WOOD, lamp_bone, lamp_at + Vector((0, 0, -L * 0.56)), (L * 0.95, L * 0.95, L * 0.12))
torus(WOOD, lamp_bone, lamp_at + Vector((0, 0, L * 0.78)), Vector((1, 0, 0)), L * 0.16, L * 0.04, segs=12, rings=6)
blob(SNOW, lamp_bone, lamp_at + Vector((0, 0, L * 0.66)), L * 0.5, 0.35)

# 5) 등짐(네 발): 말아 놓은 담요 + 가죽 끈 두 줄 + 눈
if quad:
    sh, st = B["spine"]
    mid = (sh + st) / 2
    top = max(p.z for p in pts if abs(p.x) < 0.25 * H and abs(p.y - mid.y) < 0.12 * H)
    half_w = max(abs(p.x) for p in pts if abs(p.y - mid.y) < 0.12 * H and p.z > top - 0.15 * H)
    rr = 0.075 * H
    roll_at = Vector((0, mid.y, top + rr * 0.85))
    cyl(KNIT, "spine", roll_at, Vector((1, 0, 0)), rr, half_w * 1.1)
    for dx in (-0.3, 0.3):
        torus(LEATHER, "spine", roll_at + Vector((dx * half_w, 0, 0)), Vector((1, 0, 0)), rr * 1.04, 0.012 * H, segs=20, rings=6)
    blob(SNOW, "spine", roll_at + Vector((0, 0, rr * 0.82)), rr * 0.9, 0.3, sx=half_w * 0.35 / (rr * 0.9))
else:
    for s in ("arm_L_upper", "arm_R_upper"):
        h, _ = B[s]
        blob(SNOW, "chest", h + Vector((0, 0.01 * H, 0.03 * H)), 0.05 * H, 0.4)


# 6) 망토 가장자리 털 테두리: 망토의 열린 가장자리선을 따라 털 관을 두르고, 망토 꼭짓점의 뼈 가중치를 그대로 받음
def hem_fur(o, r):
    me, mw = o.data, o.matrix_world
    bm = bmesh.new(); bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    edges = [e for e in bm.edges if e.is_boundary]
    nb = {}
    for e in edges:
        a, b = e.verts[0].index, e.verts[1].index
        nb.setdefault(a, []).append(b); nb.setdefault(b, []).append(a)
    seen, loops = set(), []
    for st in nb:
        if st in seen:
            continue
        chain, cur, prev = [st], st, None
        seen.add(st)
        while True:
            nxt = [n for n in nb[cur] if n != prev and n not in seen]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
            seen.add(cur); chain.append(cur)
        closed = len(chain) > 2 and chain[0] in nb[chain[-1]]
        length = sum(((mw @ bm.verts[chain[i]].co) - (mw @ bm.verts[chain[i - 1]].co)).length for i in range(1, len(chain)))
        zs = [(mw @ bm.verts[i].co).z for i in chain]
        xy = [(mw @ bm.verts[i].co) for i in chain]
        span = max(max(p.x for p in xy) - min(p.x for p in xy), max(p.y for p in xy) - min(p.y for p in xy))
        # 가로로 누운 가장자리(밑단·소매 끝)만 — 세로 이음선은 털 우리처럼 보여서 뺌
        if length > 0.25 * H and (max(zs) - min(zs)) < 0.35 * span:
            loops.append((chain, closed))
    if quad:
        # 네 발 망토는 막힌 덩어리라 열린 가장자리가 없음 → 양옆에서 가장 낮은 줄을 밑단으로
        co = [(i, mw @ v.co) for i, v in enumerate(bm.verts)]
        y0, y1 = min(c.y for _, c in co), max(c.y for _, c in co)
        for side in (-1, 1):
            chain = []
            for k in range(18):
                ya, yb = y0 + (y1 - y0) * (k + 0.05) / 18, y0 + (y1 - y0) * (k + 0.95) / 18
                cand = [(c.z, i) for i, c in co if ya <= c.y <= yb and c.x * side > 0.05 * H]
                if cand:
                    chain.append(min(cand)[1])
            if len(chain) > 3:
                loops.append((chain, False))
    if not loops:
        bm.free(); return 0
    out = bmesh.new()
    src = []  # 새 꼭짓점마다 원래 망토 꼭짓점
    SEG = 7
    for chain, closed in loops:
        P = [mw @ bm.verts[i].co for i in chain]
        N = [(mw.to_3x3() @ bm.verts[i].normal).normalized() for i in chain]
        rings = []
        for k, i in enumerate(chain):
            a = P[(k + 1) % len(P)] if (closed or k + 1 < len(P)) else P[k]
            b = P[k - 1] if (closed or k > 0) else P[k]
            t = (a - b).normalized() if (a - b).length > 1e-6 else Vector((1, 0, 0))
            n = (N[k] - t * N[k].dot(t)).normalized()
            bnorm = t.cross(n)
            rr = r * (1 + random.uniform(-0.3, 0.3))
            c = P[k] + n * r * 0.4
            ring = []
            for j in range(SEG):
                ang = 2 * math.pi * j / SEG
                ring.append(out.verts.new(c + (n * math.cos(ang) + bnorm * math.sin(ang)) * rr))
                src.append(i)
            rings.append(ring)
        cnt = len(rings) if closed else len(rings) - 1
        for k in range(cnt):
            r0, r1 = rings[k], rings[(k + 1) % len(rings)]
            for j in range(SEG):
                try:
                    out.faces.new((r0[j], r1[j], r1[(j + 1) % SEG], r0[(j + 1) % SEG]))
                except ValueError:
                    pass
    nme = bpy.data.meshes.new("winter_hem_fur")
    out.to_mesh(nme); out.free()
    ob = bpy.data.objects.new("winter_hem_fur", nme)
    bpy.context.collection.objects.link(ob)
    nme.materials.append(FUR)
    for p in nme.polygons:
        p.use_smooth = True
    box_uv(nme, Matrix.Identity(4), "fur")
    names = {g.index: g.name for g in o.vertex_groups}
    groups = {}
    for vi, si in enumerate(src):
        for g in me.vertices[si].groups:
            if g.weight > 0.001:
                if names[g.group] not in groups:
                    groups[names[g.group]] = ob.vertex_groups.new(name=names[g.group])
                groups[names[g.group]].add([vi], g.weight, "REPLACE")
    ob.parent = arm; ob.matrix_parent_inverse = arm.matrix_world.inverted()
    m = ob.modifiers.new("Armature", "ARMATURE"); m.object = arm
    bm.free()
    return len(loops)

for o in body:
    if o.data.materials and o.data.materials[0].name == "v3_quilt":
        print("HEM loops", hem_fur(o, (0.034 if quad else 0.022) * H))

# ── 뼈에 묶기 (같은 재질은 한 덩어리) ──
by = {}
for mat, bm, bone in parts:
    by.setdefault(mat.name, (mat, []))[1].append((bm, bone))
inv = arm.matrix_world.inverted()
for name, (mat, items) in by.items():
    me = bpy.data.meshes.new(f"winter_{name}")
    allbm = bmesh.new()
    vb = []
    for bm, bone in items:
        vmap = {}
        for v in bm.verts:
            vmap[v] = allbm.verts.new(v.co); vb.append(bone)
        for f in bm.faces:
            try:
                allbm.faces.new([vmap[v] for v in f.verts])
            except ValueError:
                pass
        bm.free()
    bmesh.ops.recalc_face_normals(allbm, faces=allbm.faces)
    allbm.to_mesh(me); allbm.free()
    ob = bpy.data.objects.new(f"winter_{name}", me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    kind = TEXKIND.get(mat)
    if kind:
        box_uv(me, Matrix.Identity(4), kind)
    if mat == LAMP:  # 등불 창: 면마다 그림 한 장
        uv = me.uv_layers.new().data
        for p in me.polygons:
            for k, li in enumerate(p.loop_indices):
                uv[li].uv = [(0, 0), (1, 0), (1, 1), (0, 1)][k % 4]
    for bone in set(vb):
        g = ob.vertex_groups.new(name=bone)
        g.add([i for i, b in enumerate(vb) if b == bone], 1.0, "REPLACE")
    ob.parent = arm
    ob.matrix_parent_inverse = inv
    mod = ob.modifiers.new("Armature", "ARMATURE"); mod.object = arm
print("PARTS", {k: len(v[1]) for k, v in by.items()})

bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_animations=True, export_image_format="JPEG")

# 미리보기 (워크벤치 — 뼈 있는 모델은 Eevee가 멈춤)
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"
sc.display.shading.color_type = "TEXTURE"
sc.display.shading.light = "STUDIO"
sc.render.resolution_x, sc.render.resolution_y = 800, 800
sc.world = bpy.data.worlds.new("w")
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), 0))
mx = Vector((max(p.x for p in pts), max(p.y for p in pts), H))
c = (mn + mx) / 2
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = max((mx - mn).length * 0.95, 0.1)
cam.location = c + Vector((-0.6, -0.8, 0.35)).normalized() * 10
cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
sc.render.filepath = preview
bpy.ops.render.render(write_still=True)
print("DINO_DONE", dst)
