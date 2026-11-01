# Ghostbusters pack lane: shared headless Blender helpers. All geometry is authored in G-space (glTF: +Y up, +Z front/toward wearer).
import bpy, bmesh, math, os, json, random
from mathutils import Vector, Matrix, Quaternion
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ASSETS = os.path.join(ROOT, 'assets', 'pack')
WORK = os.path.join(ROOT, 'Niepotrzebne', 'work', 'pack')
TEX = os.path.join(WORK, 'tex')
for d in (ASSETS, WORK, TEX):
    os.makedirs(d, exist_ok=True)

G2B = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
B2G = G2B.inverted()
MM = 0.001


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.unit_settings.system = 'METRIC'
    return s


def V(*a):
    if len(a) == 1:
        a = a[0]
    return Vector((float(a[0]), float(a[1]), float(a[2])))


def frame(o=(0, 0, 0), z=(0, 0, 1), y=None):
    z = V(z).normalized()
    if y is None:
        y = (0, 1, 0) if abs(z.y) < 0.95 else (0, 0, -1)
    y = V(y)
    x = y.cross(z).normalized()
    y = z.cross(x).normalized()
    m = Matrix.Identity(4)
    for i in range(3):
        m[i][0], m[i][1], m[i][2], m[i][3] = x[i], y[i], z[i], o[i]
    return m


def T(o=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0):
    return Matrix.Translation(V(o)) @ Matrix.Rotation(math.radians(rz), 4, 'Z') @ Matrix.Rotation(math.radians(ry), 4, 'Y') @ Matrix.Rotation(math.radians(rx), 4, 'X')


def catmull(points, step=0.01):
    p = [V(q) for q in points]
    if len(p) < 2:
        return p
    ext = [p[0] + (p[0] - p[1])] + p + [p[-1] + (p[-1] - p[-2])]
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        n = max(2, int((p2 - p1).length / step))
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(p[-1])
    return out


def resample(pts, step):
    pts = [V(q) for q in pts]
    L = [0.0]
    for i in range(1, len(pts)):
        L.append(L[-1] + (pts[i] - pts[i - 1]).length)
    total = L[-1]
    n = max(1, int(round(total / step)))
    out, j = [], 0
    for k in range(n + 1):
        s = total * k / n
        while j < len(L) - 2 and L[j + 1] < s:
            j += 1
        seg = L[j + 1] - L[j]
        t = 0 if seg < 1e-9 else (s - L[j]) / seg
        out.append(pts[j].lerp(pts[j + 1], t))
    return out, total


def frames_along(pts, up=None):
    tans = []
    for i in range(len(pts)):
        a = pts[max(0, i - 1)]
        b = pts[min(len(pts) - 1, i + 1)]
        tans.append((b - a).normalized())
    t0 = tans[0]
    ref = V(up) if up is not None else (V(0, 1, 0) if abs(t0.y) < 0.9 else V(1, 0, 0))
    n = (ref - t0 * ref.dot(t0)).normalized()
    out = []
    for i, t in enumerate(tans):
        if i > 0:
            n = (n - t * n.dot(t)).normalized()
        b = t.cross(n)
        out.append((t, n, b))
    return out


class Part:
    def __init__(self, name, seg=False):
        self.name = name
        self.bm = bmesh.new()
        self.seg = self.bm.verts.layers.float.new('_SEG') if seg else None
        self.uv = self.bm.loops.layers.uv.new('UVMap')
        self.uvfix = self.bm.faces.layers.int.new('uvfix')
        self.kinds = []
        self.decal_uv = []

    def mi(self, kind):
        if kind not in self.kinds:
            self.kinds.append(kind)
        return self.kinds.index(kind)

    def _new_faces(self, verts):
        fs = set()
        for v in verts:
            fs.update(v.link_faces)
        return fs

    def _finish(self, verts, M, kind, bevel=0.0, seg=2, angle=30.0, edges=None, segval=None):
        bmesh.ops.transform(self.bm, matrix=M, verts=list(verts))
        faces = self._new_faces(verts)
        idx = self.mi(kind)
        for f in faces:
            f.material_index = idx
            f.smooth = True
        if segval is not None:
            self._set_seg(verts, segval)
        if bevel > 0:
            if edges is None:
                es = set()
                for f in faces:
                    es.update(f.edges)
                edges = [e for e in es if len(e.link_faces) == 2 and math.degrees(e.calc_face_angle(0.0)) > angle]
            if edges:
                r = bmesh.ops.bevel(self.bm, geom=list(edges), offset=bevel, offset_type='OFFSET', segments=seg, profile=0.5,
                                    affect='EDGES', clamp_overlap=True, material=-1, loop_slide=True)
                nf = r.get('faces', [])
                for f in nf:
                    f.smooth = True
                    f.material_index = idx
                if segval is not None:
                    vs = set()
                    for f in nf:
                        vs.update(f.verts)
                    self._set_seg(vs, segval)
        return faces

    def _set_seg(self, verts, val):
        if self.seg is None:
            raise RuntimeError('Part created without seg layer: ' + self.name)
        for v in verts:
            v[self.seg] = float(val)

    def box(self, size, M, kind, bevel=0.0, seg=2, angle=30.0, segval=None):
        r = bmesh.ops.create_cube(self.bm, size=1.0, matrix=Matrix.Diagonal((size[0], size[1], size[2], 1.0)))
        return self._finish(r['verts'], M, kind, bevel, seg, angle, segval=segval)

    def cyl(self, r, h, M, kind, n=24, bevel=0.0, seg=2, r2=None, caps=True, base=False, segval=None, angle=30.0):
        off = Matrix.Translation((0, 0, h / 2)) if base else Matrix.Identity(4)
        res = bmesh.ops.create_cone(self.bm, cap_ends=caps, cap_tris=False, segments=n, radius1=r, radius2=(r if r2 is None else r2), depth=h, matrix=off)
        return self._finish(res['verts'], M, kind, bevel, seg, angle, segval=segval)

    def prism(self, pts2d, depth, M, kind, bevel=0.0, seg=2, angle=30.0, base=True, segval=None):
        area = sum(pts2d[i][0] * pts2d[(i + 1) % len(pts2d)][1] - pts2d[(i + 1) % len(pts2d)][0] * pts2d[i][1] for i in range(len(pts2d)))
        if area < 0:
            pts2d = list(reversed(pts2d))
        z0 = 0.0 if base else -depth / 2
        bot = [self.bm.verts.new((p[0], p[1], z0)) for p in pts2d]
        top = [self.bm.verts.new((p[0], p[1], z0 + depth)) for p in pts2d]
        n = len(pts2d)
        self.bm.faces.new(list(reversed(bot)))
        self.bm.faces.new(top)
        for i in range(n):
            j = (i + 1) % n
            self.bm.faces.new((bot[i], bot[j], top[j], top[i]))
        return self._finish(bot + top, M, kind, bevel, seg, angle, segval=segval)

    def rbox(self, w, h, d, rad, M, kind, n=4, bevel=0.0, seg=2, base=True, segval=None):
        return self.prism(rrect(w, h, rad, n), d, M, kind, bevel, seg, base=base, segval=segval)

    def lathe(self, prof, M, kind, n=24, cap0=True, cap1=True, segval=None, smooth_angle=None):
        rings = []
        for (r, z) in prof:
            ring = []
            for k in range(n):
                a = 2 * math.pi * k / n
                ring.append(self.bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
            rings.append(ring)
        allv = [v for ring in rings for v in ring]
        for i in range(len(rings) - 1):
            a, b = rings[i], rings[i + 1]
            for k in range(n):
                k2 = (k + 1) % n
                if prof[i][0] < 1e-6 and prof[i + 1][0] < 1e-6:
                    continue
                self.bm.faces.new((a[k], a[k2], b[k2], b[k]))
        if cap0 and prof[0][0] > 1e-6:
            self.bm.faces.new(list(reversed(rings[0])))
        if cap1 and prof[-1][0] > 1e-6:
            self.bm.faces.new(rings[-1])
        bmesh.ops.remove_doubles(self.bm, verts=allv, dist=1e-7)
        allv = [v for v in allv if v.is_valid]
        faces = self._finish(allv, M, kind, 0.0, segval=segval)
        if smooth_angle is not None:
            for f in faces:
                for e in f.edges:
                    if len(e.link_faces) == 2 and math.degrees(e.calc_face_angle(0.0)) > smooth_angle:
                        e.smooth = False
        return faces

    def tube(self, pts, r, kind, n=8, step=0.01, ribs=None, caps=True, up=None, smooth=True, rfun=None, segval=None):
        sp = catmull(pts, step * 0.5) if smooth else [V(p) for p in pts]
        sp, total = resample(sp, step)
        fr = frames_along(sp, up)
        rings, L = [], 0.0
        for i, p in enumerate(sp):
            if i > 0:
                L += (sp[i] - sp[i - 1]).length
            rr = r
            if ribs is not None:
                pitch, depth = ribs
                ph = (L / pitch) % 1.0
                rr = r - depth * (0.5 - 0.5 * math.cos(2 * math.pi * ph))
            if rfun is not None:
                rr = rfun(L / max(total, 1e-6), rr)
            t, nn, b = fr[i]
            ring = []
            for k in range(n):
                a = 2 * math.pi * k / n
                ring.append(self.bm.verts.new(p + (nn * math.cos(a) + b * math.sin(a)) * rr))
            rings.append(ring)
        idx = self.mi(kind)
        faces = []
        circ = 2 * math.pi * r
        Ls = [0.0]
        for i in range(1, len(sp)):
            Ls.append(Ls[-1] + (sp[i] - sp[i - 1]).length)
        for i in range(len(rings) - 1):
            a, b = rings[i], rings[i + 1]
            for k in range(n):
                k2 = (k + 1) % n
                f = self.bm.faces.new((a[k], a[k2], b[k2], b[k]))
                for lp, (uu, vv) in zip(f.loops, ((k / n * circ, Ls[i]), ((k + 1) / n * circ, Ls[i]), ((k + 1) / n * circ, Ls[i + 1]), (k / n * circ, Ls[i + 1]))):
                    lp[self.uv].uv = (uu, vv)
                f[self.uvfix] = 1
                faces.append(f)
        if caps:
            faces.append(self.bm.faces.new(list(reversed(rings[0]))))
            faces.append(self.bm.faces.new(rings[-1]))
        for f in faces:
            f.material_index = idx
            f.smooth = smooth
        if segval is not None:
            self._set_seg([v for ring in rings for v in ring], segval)
        return faces, total

    def sweep(self, pts, prof, kind, step=0.01, up=None, caps=True, smooth=True):
        sp = catmull(pts, step * 0.5) if smooth else [V(p) for p in pts]
        sp, total = resample(sp, step)
        fr = frames_along(sp, up)
        rings = []
        for i, p in enumerate(sp):
            t, nn, b = fr[i]
            rings.append([self.bm.verts.new(p + nn * a + b * c) for (a, c) in prof])
        idx = self.mi(kind)
        n = len(prof)
        faces = []
        for i in range(len(rings) - 1):
            a, b2 = rings[i], rings[i + 1]
            for k in range(n):
                k2 = (k + 1) % n
                f = self.bm.faces.new((a[k], a[k2], b2[k2], b2[k]))
                f.material_index = idx
                f.smooth = True
                faces.append(f)
        if caps:
            for ring, rev in ((rings[0], True), (rings[-1], False)):
                f = self.bm.faces.new(list(reversed(ring)) if rev else ring)
                f.material_index = idx
                f.smooth = True
                faces.append(f)
        for f in faces:
            for e in f.edges:
                if len(e.link_faces) == 2 and math.degrees(e.calc_face_angle(0.0)) > 50:
                    e.smooth = False
        return faces, total

    def loft(self, rings, kind, caps=True, sharp=50.0, segval=None):
        vr = [[self.bm.verts.new(V(p)) for p in ring] for ring in rings]
        idx = self.mi(kind)
        n = len(rings[0])
        faces = []
        for i in range(len(vr) - 1):
            a, b2 = vr[i], vr[i + 1]
            for k in range(n):
                k2 = (k + 1) % n
                f = self.bm.faces.new((a[k], a[k2], b2[k2], b2[k]))
                f.material_index = idx
                f.smooth = True
                faces.append(f)
        if caps:
            for ring, rev in ((vr[0], True), (vr[-1], False)):
                f = self.bm.faces.new(list(reversed(ring)) if rev else ring)
                f.material_index = idx
                f.smooth = True
                faces.append(f)
        for f in faces:
            for e in f.edges:
                if len(e.link_faces) == 2 and math.degrees(e.calc_face_angle(0.0)) > sharp:
                    e.smooth = False
        if segval is not None:
            self._set_seg([v for ring in vr for v in ring], segval)
        return faces

    def disc_decal(self, center, xdir, ydir, r, kind, uvrect, n=32, normal_off=0.0003):
        c, xd, yd = V(center), V(xdir).normalized(), V(ydir).normalized()
        nrm = xd.cross(yd).normalized()
        c = c + nrm * normal_off
        u0, v0, u1, v1 = uvrect
        vs, uvs = [], []
        for k in range(n):
            a = 2 * math.pi * k / n
            vs.append(self.bm.verts.new(c + xd * math.cos(a) * r + yd * math.sin(a) * r))
            uvs.append((u0 + (u1 - u0) * (0.5 + 0.5 * math.cos(a)), v0 + (v1 - v0) * (0.5 + 0.5 * math.sin(a))))
        f = self.bm.faces.new(vs)
        f.material_index = self.mi(kind)
        f.smooth = False
        for lp, uv in zip(f.loops, uvs):
            lp[self.uv].uv = uv
        return f

    def planar_uv(self, faces, center, xdir, ydir, size, uvrect=(0, 0, 1, 1)):
        c, xd, yd = V(center), V(xdir).normalized(), V(ydir).normalized()
        u0, v0, u1, v1 = uvrect
        for f in faces:
            for lp in f.loops:
                d = lp.vert.co - c
                lp[self.uv].uv = (u0 + (u1 - u0) * (0.5 + d.dot(xd) / size), v0 + (v1 - v0) * (0.5 + d.dot(yd) / size))

    def strip(self, pts, width, thick, kind, step=0.01, up=None, uvrect=None, twist=0.0):
        sp = catmull(pts, step * 0.5)
        sp, total = resample(sp, step)
        fr = frames_along(sp, up)
        idx = self.mi(kind)
        rows = []
        L = 0.0
        for i, p in enumerate(sp):
            if i > 0:
                L += (sp[i] - sp[i - 1]).length
            t, nn, b = fr[i]
            a = twist * L / max(total, 1e-6)
            side = (b * math.cos(a) + nn * math.sin(a))
            nrm = (nn * math.cos(a) - b * math.sin(a))
            hw = width / 2
            rows.append([self.bm.verts.new(p - side * hw + nrm * thick / 2), self.bm.verts.new(p + side * hw + nrm * thick / 2),
                         self.bm.verts.new(p + side * hw - nrm * thick / 2), self.bm.verts.new(p - side * hw - nrm * thick / 2), L])
        faces = []
        for i in range(len(rows) - 1):
            a, b = rows[i], rows[i + 1]
            ft = self.bm.faces.new((a[0], a[1], b[1], b[0]))
            fb = self.bm.faces.new((a[2], a[3], b[3], b[2]))
            fs1 = self.bm.faces.new((a[1], a[2], b[2], b[1]))
            fs2 = self.bm.faces.new((a[3], a[0], b[0], b[3]))
            for f in (ft, fb, fs1, fs2):
                f.material_index = idx
                f.smooth = True
            if uvrect is not None:
                u0, v0, u1, v1 = uvrect
                va, vb = v0 + (v1 - v0) * (a[4] / total), v0 + (v1 - v0) * (b[4] / total)
                for f, us in ((ft, (u0, u1, u1, u0)), (fb, (u1, u0, u0, u1))):
                    vv = (va, va, vb, vb)
                    for lp, uu, vvv in zip(f.loops, us, vv):
                        lp[self.uv].uv = (uu, vvv)
                for f in (fs1, fs2):
                    for lp in f.loops:
                        lp[self.uv].uv = (u0, va)
            faces += [ft, fb, fs1, fs2]
        return faces, total

    def quad(self, center, xdir, ydir, w, h, kind, uvrect=None, normal_off=0.0004, segval=None):
        c, xd, yd = V(center), V(xdir).normalized(), V(ydir).normalized()
        nrm = xd.cross(yd).normalized()
        c = c + nrm * normal_off
        vs = [self.bm.verts.new(c + xd * sx * w / 2 + yd * sy * h / 2) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        f = self.bm.faces.new(vs)
        f.material_index = self.mi(kind)
        f.smooth = False
        if uvrect is not None:
            u0, v0, u1, v1 = uvrect
            for lp, uv in zip(f.loops, ((u0, v0), (u1, v0), (u1, v1), (u0, v1))):
                lp[self.uv].uv = uv
            self.decal_uv.append(f)
        if segval is not None:
            self._set_seg(vs, segval)
        return f

    def screw(self, pos, normal, r=0.0035, kind='steel', n=6, h=None, slot=True):
        h = h if h is not None else r * 0.55
        M = frame(pos, normal)
        prof = [(r, 0.0), (r, h * 0.45), (r * 0.82, h * 0.85), (r * 0.45, h), (0.0, h)]
        self.lathe(prof, M, kind, n=n, cap0=False)

    def merge(self, other_bm):
        pass


def rrect(w, h, r, n=4):
    r = min(r, w / 2 - 1e-5, h / 2 - 1e-5)
    pts = []
    if r <= 1e-5:
        return [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    for cx, cy, a0 in ((w / 2 - r, -h / 2 + r, -90), (w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180)):
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def circle_pts(r, n, a0=0.0):
    return [(r * math.cos(a0 + 2 * math.pi * k / n), r * math.sin(a0 + 2 * math.pi * k / n)) for k in range(n)]


def make_object(part, mats, parent=None, pivot_g=None, sharp_angle=35.0, weighted=True, name=None):
    bm = part.bm
    for e in bm.edges:
        if len(e.link_faces) == 2:
            ang = math.degrees(e.calc_face_angle(0.0))
            if ang > sharp_angle:
                e.smooth = False
        elif len(e.link_faces) != 2:
            e.smooth = False
    bmesh.ops.transform(bm, matrix=G2B, verts=bm.verts[:])
    if pivot_g is not None:
        pb = G2B @ V(pivot_g)
        bmesh.ops.translate(bm, vec=-pb, verts=bm.verts[:])
    me = bpy.data.meshes.new((name or part.name) + '_mesh')
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name or part.name, me)
    bpy.context.scene.collection.objects.link(ob)
    for k in part.kinds:
        me.materials.append(mats[k] if isinstance(mats, dict) else mats(k))
    if pivot_g is not None:
        ob.location = G2B @ V(pivot_g)
    if parent is not None:
        ob.parent = parent
    if weighted and len(me.polygons):
        m = ob.modifiers.new('WN', 'WEIGHTED_NORMAL')
        m.mode = 'FACE_AREA'
        m.weight = 50
        m.keep_sharp = True
        m.thresh = 0.01
    return ob


def apply_mods(ob):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    for m in list(ob.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except Exception as ex:
            print('modifier apply failed', ob.name, m.name, ex)


def empty(name, pos_g, rot_g=None, parent=None, size=0.03, extras=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'ARROWS'
    e.empty_display_size = size
    bpy.context.scene.collection.objects.link(e)
    Mg = Matrix.Identity(4)
    if rot_g is not None:
        R = rot_g.to_matrix() if isinstance(rot_g, Quaternion) else rot_g
        Mg = R.to_4x4()
    Mg.translation = V(pos_g)
    e.matrix_world = G2B @ Mg @ B2G
    if parent is not None:
        e.parent = parent
        e.matrix_parent_inverse = parent.matrix_world.inverted()
    if extras:
        for k, v in extras.items():
            e[k] = v
    return e


def basis_g(x=None, y=None, z=None):
    if z is not None and y is not None:
        z = V(z).normalized(); y = V(y)
        x = y.cross(z).normalized(); y = z.cross(x).normalized()
    elif z is not None and x is not None:
        z = V(z).normalized(); x = V(x)
        y = z.cross(x).normalized(); x = y.cross(z).normalized()
    elif y is not None and x is not None:
        x = V(x).normalized(); y = V(y)
        z = x.cross(y).normalized(); y = z.cross(x).normalized()
    M = Matrix.Identity(3)
    for i in range(3):
        M[i][0], M[i][1], M[i][2] = x[i], y[i], z[i]
    return M


def quat_list(M3):
    q = M3.to_quaternion()
    return [round(q.x, 6), round(q.y, 6), round(q.z, 6), round(q.w, 6)]


def world_pose_g(ob):
    Mg = B2G @ ob.matrix_world @ G2B
    loc = Mg.to_translation()
    q = Mg.to_quaternion()
    return [round(loc.x, 5), round(loc.y, 5), round(loc.z, 5)], [round(q.x, 6), round(q.y, 6), round(q.z, 6), round(q.w, 6)]


def node_group_gltf_output():
    ng = bpy.data.node_groups.get('glTF Material Output')
    if ng is None:
        ng = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        ng.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
        ng.interface.new_socket('Thickness', in_out='INPUT', socket_type='NodeSocketFloat')
        ng.nodes.new('NodeGroupInput')
    return ng


def principled(name, color=(0.5, 0.5, 0.5), metal=0.0, rough=0.5, emit=None, emit_strength=1.0, alpha=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1.0)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if emit is not None:
        b.inputs['Emission Color'].default_value = (*emit, 1.0)
        b.inputs['Emission Strength'].default_value = emit_strength
    return m


def tex_node(nt, path, colorspace='sRGB', loc=(-600, 0)):
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = colorspace
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = img
    t.location = loc
    return t


def textured_material(name, base_path, orm_path=None, normal_path=None, emissive=None, emit_strength=1.0, rough=0.5, metal=0.0, occlusion=True, alpha_clip=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get('Principled BSDF')
    tb = tex_node(nt, base_path, 'sRGB', (-700, 300))
    nt.links.new(tb.outputs['Color'], b.inputs['Base Color'])
    if alpha_clip is not None:
        nt.links.new(tb.outputs['Alpha'], b.inputs['Alpha'])
        m.blend_method = 'CLIP' if hasattr(m, 'blend_method') else None
    if orm_path:
        to = tex_node(nt, orm_path, 'Non-Color', (-700, -50))
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        sep.location = (-400, -50)
        nt.links.new(to.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], b.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
        if occlusion:
            g = nt.nodes.new('ShaderNodeGroup')
            g.node_tree = node_group_gltf_output()
            g.location = (-100, -400)
            nt.links.new(sep.outputs['Red'], g.inputs['Occlusion'])
    else:
        b.inputs['Roughness'].default_value = rough
        b.inputs['Metallic'].default_value = metal
    if normal_path:
        tn = tex_node(nt, normal_path, 'Non-Color', (-700, -400))
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.location = (-400, -400)
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    if emissive is not None:
        b.inputs['Emission Color'].default_value = (*emissive, 1.0)
        b.inputs['Emission Strength'].default_value = emit_strength
    return m


def tri_count(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    n = 0
    for o in objs:
        if o.type != 'MESH':
            continue
        oe = o.evaluated_get(dg)
        me = oe.to_mesh()
        me.calc_loop_triangles()
        n += len(me.loop_triangles)
        oe.to_mesh_clear()
    return n


def export_glb(path, root):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    def sel(o):
        o.select_set(True)
        for c in o.children:
            sel(c)
    sel(root)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                              export_attributes=True, export_extras=True, export_cameras=False, export_lights=False,
                              export_image_format='AUTO', export_jpeg_quality=88, export_texcoords=True, export_normals=True,
                              export_tangents=False, export_materials='EXPORT', export_vertex_color='NONE',
                              export_animations=False, export_skins=False, export_morph=False)
    print('exported', path, os.path.getsize(path))


def setup_render(res=(1280, 720), engine='BLENDER_EEVEE_NEXT', samples=32, hdri=None, strength=1.0, bg=(0.06, 0.06, 0.065), film_transparent=False):
    s = bpy.context.scene
    s.render.engine = engine
    s.render.resolution_x, s.render.resolution_y = res
    s.render.resolution_percentage = 100
    s.render.image_settings.file_format = 'JPEG'
    s.render.image_settings.quality = 88
    s.render.film_transparent = film_transparent
    try:
        s.view_settings.view_transform = 'AgX'
        s.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        s.view_settings.view_transform = 'Filmic'
    if engine == 'CYCLES':
        s.cycles.samples = samples
        s.cycles.use_denoising = True
        s.cycles.device = 'CPU'
    else:
        try:
            s.eevee.taa_render_samples = samples
            s.eevee.use_shadows = True
            s.eevee.use_raytracing = True
            s.eevee.ray_tracing_options.resolution_scale = '1'
            s.eevee.use_gtao = True
            s.eevee.gtao_distance = 0.2
        except Exception as ex:
            print('eevee opts', ex)
    w = bpy.data.worlds.new('W')
    s.world = w
    w.use_nodes = True
    nt = w.node_tree
    bgn = nt.nodes['Background']
    if hdri and os.path.exists(hdri):
        env = nt.nodes.new('ShaderNodeTexEnvironment')
        env.image = bpy.data.images.load(hdri)
        mapn = nt.nodes.new('ShaderNodeMapping')
        tc = nt.nodes.new('ShaderNodeTexCoord')
        nt.links.new(tc.outputs['Generated'], mapn.inputs['Vector'])
        nt.links.new(mapn.outputs['Vector'], env.inputs['Vector'])
        nt.links.new(env.outputs['Color'], bgn.inputs['Color'])
        bgn.inputs['Strength'].default_value = strength
        w['mapping'] = mapn.name
    else:
        bgn.inputs['Color'].default_value = (*bg, 1)
        bgn.inputs['Strength'].default_value = strength
    return s


def look_at_g(cam, pos_g, tgt_g, lens=50.0):
    pb, tb = G2B @ V(pos_g), G2B @ V(tgt_g)
    d = (tb - pb).normalized()
    q = d.to_track_quat('-Z', 'Y')
    cam.location = pb
    cam.rotation_euler = q.to_euler()
    cam.data.lens = lens


def add_camera(name='Cam'):
    cd = bpy.data.cameras.new(name)
    cd.clip_start = 0.01
    cd.clip_end = 50
    c = bpy.data.objects.new(name, cd)
    bpy.context.scene.collection.objects.link(c)
    bpy.context.scene.camera = c
    return c


def add_area(name, pos_g, tgt_g, power, size=1.0, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.energy = power
    ld.size = size
    ld.color = color
    lo = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(lo)
    pb, tb = G2B @ V(pos_g), G2B @ V(tgt_g)
    lo.location = pb
    lo.rotation_euler = (tb - pb).normalized().to_track_quat('-Z', 'Y').to_euler()
    return lo


def render_to(path):
    s = bpy.context.scene
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('rendered', path)
