# Ecto-1 livery details: No-Ghost decals (front doors, rear door), ECTO-1 plates, passenger A-pillar spotlight.
import math
import numpy as np
from ecto_common import MB, lathe, box, grid_mesh, bl, rmat, Y_OFF
import ecto_design as D
import ecto_body as B

LOGO_DOOR = dict(s=2.47, z=0.650, size=0.56)
LOGO_REAR = dict(x=-0.07, z=0.862, size=0.46)


def door_logo(mi, right=False):
    mb = MB()
    s0 = LOGO_DOOR['s'] - LOGO_DOOR['size'] / 2
    z0 = LOGO_DOOR['z'] - LOGO_DOOR['size'] / 2
    n = 14
    ss = np.linspace(s0, s0 + LOGO_DOOR['size'], n)
    zz = np.linspace(z0, z0 + LOGO_DOOR['size'], n)
    S, Z = np.meshgrid(ss, zz)
    uv = np.stack([(S - s0) / LOGO_DOOR['size'], (Z - z0) / LOGO_DOOR['size']], -1)
    Pp = B.side_f(S.ravel(), Z.ravel())
    Nn = B.SIDE.nrm(np.stack([S.ravel(), Z.ravel()], 1))
    G = (Pp + Nn * 0.0016).reshape(n, n, 3)
    grid_mesh(mb, G, mi['logo'], uv, flip=False, normals=Nn.reshape(n, n, 3))
    if right:
        mb = mb.mirrored_x()
        for k in range(len(mb.UV)):
            mb.UV[k][..., 0] = 1.0 - mb.UV[k][..., 0]
    return mb


def rear_logo(mi):
    mb = MB()
    sz = LOGO_REAR['size']
    x0 = LOGO_REAR['x'] - sz / 2
    z0 = LOGO_REAR['z'] - sz / 2
    n = 10
    xs = np.linspace(x0, x0 + sz, n)
    zs = np.linspace(z0, z0 + sz, n)
    X, Z = np.meshgrid(xs, zs)
    uv = np.stack([(x0 + sz - X) / sz, (Z - z0) / sz], -1)
    Pp = B.tg_f(X.ravel(), Z.ravel())
    Nn = B.TAILGATE.nrm(np.stack([X.ravel(), Z.ravel()], 1))
    if Nn[:, 1].mean() < 0:
        Nn = -Nn
    G = (Pp + Nn * 0.0016).reshape(n, n, 3)
    gu = np.gradient(G, axis=1)
    gv = np.gradient(G, axis=0)
    fl = np.sum(np.cross(gu, gv)[n // 2, n // 2] * Nn.reshape(n, n, 3)[n // 2, n // 2]) < 0
    grid_mesh(mb, G, mi['logo'], uv, flip=fl, normals=Nn.reshape(n, n, 3))
    return mb


def plate(mi, front=True):
    mb = MB()
    w, h = 0.305, 0.152
    if front:
        s, z = -0.062, 0.385
        V = np.array([bl(-w / 2, s, z - h / 2), bl(w / 2, s, z - h / 2), bl(w / 2, s, z + h / 2), bl(-w / 2, s, z + h / 2)])
        n = np.array([0, -1.0, 0])
    else:
        s, z = 6.336, 0.505
        V = np.array([bl(w / 2, s, z - h / 2), bl(-w / 2, s, z - h / 2), bl(-w / 2, s, z + h / 2), bl(w / 2, s, z + h / 2)])
        n = np.array([0, 1.0, 0])
    UV = np.array([(0, 0), (1, 0), (1, 1), (0, 1)], float)
    tri = np.array([(0, 1, 2), (0, 2, 3)])
    fn = np.cross(V[1] - V[0], V[2] - V[0])
    if np.dot(fn, n) < 0:
        tri = tri[:, ::-1]
    mb.add(V, tri, np.tile(n, (2, 3, 1)), UV[tri], mi['plate'])
    sg = -1.0 if front else 1.0
    box(mb, bl(0.0, s - sg * 0.018, z)[()], (w + 0.045, 0.024, h + 0.04), mi['chrome'])
    box(mb, bl(0.0, s - sg * 0.009, z)[()], (w + 0.012, 0.010, h + 0.012), mi['gap'])
    return mb


def pillar_spotlight(mi):
    mb = MB()
    base = np.asarray(bl(-0.95, 2.10, 1.02)[()])
    lathe(mb, [(0.0, 0.0), (0.012, 0.0), (0.012, 0.09), (0.0, 0.09)], seg=10, axis='X', center=base + np.array([0.0, 0.0, 0.0]), mat=mi['chrome'], R=rmat(rz=math.pi))
    c = base + np.array([-0.10, -0.03, 0.0])
    lathe(mb, [(0.0, -0.08), (0.04, -0.075), (0.062, -0.04), (0.068, 0.02), (0.064, 0.035), (0.0, 0.036)], seg=20, axis='Y', center=c, mat=mi['chrome'], flip=True, R=rmat(rz=math.pi))
    lathe(mb, [(0.0, 0.034), (0.058, 0.034), (0.0, 0.040)][::-1], seg=18, axis='Y', center=c, mat=mi['lens_clear'], R=rmat(rz=math.pi))
    return mb
