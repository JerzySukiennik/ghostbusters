# People build helpers (numpy/scipy), adapted from blender/crew/crewlib.py: mesh topology, thin-plate warps, surface attachment, smoothing, splat previews, UV raster.
import numpy as np
from scipy.spatial import cKDTree
import scipy.sparse as sps

ROOT = '/Users/jurek/Downloads/Claude/Projects/Ghostbusters'
CACHE = ROOT + '/blender/people/cache'
WORK = ROOT + '/Niepotrzebne/work/people'


def load(name):
    return dict(np.load(CACHE + '/' + name + '.npz', allow_pickle=False))


def faces_of(d):
    return [d['loops'][s:s + t] for s, t in zip(d['ls'], d['lt'])]


def tris_of(F):
    T = []
    for f in F:
        for k in range(1, len(f) - 1):
            T.append((f[0], f[k], f[k + 1]))
    return np.array(T, dtype=np.int64)


def tri_face_index(F):
    out = []
    for i, f in enumerate(F):
        out += [i] * (len(f) - 2)
    return np.array(out, dtype=np.int64)


def vnormals(V, T):
    n = np.zeros_like(V)
    fn = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]])
    for k in range(3):
        np.add.at(n, T[:, k], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


def edges_of(F):
    E = set()
    for f in F:
        m = len(f)
        for i in range(m):
            a, b = int(f[i]), int(f[(i + 1) % m])
            E.add((a, b) if a < b else (b, a))
    return np.array(sorted(E), dtype=np.int64)


def adjacency(n, E):
    r = np.concatenate([E[:, 0], E[:, 1]]); c = np.concatenate([E[:, 1], E[:, 0]])
    A = sps.csr_matrix((np.ones(len(r)), (r, c)), shape=(n, n))
    deg = np.asarray(A.sum(1)).ravel()
    return sps.diags(1.0 / np.maximum(deg, 1)) @ A


def smooth(X, M, it, lam=0.5, mask=None):
    X = np.array(X, float)
    for _ in range(it):
        Y = X + lam * (M @ X - X)
        if mask is not None:
            Y[~mask] = X[~mask]
        X = Y
    return X


def sstep(a, b, x):
    t = np.clip((np.asarray(x, float) - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


class TPS:
    def __init__(self, X, Y, reg=1e-6):
        X = np.asarray(X, float); Y = np.asarray(Y, float)
        n = len(X)
        K = np.linalg.norm(X[:, None] - X[None], axis=2)
        P = np.hstack([np.ones((n, 1)), X])
        A = np.zeros((n + 4, n + 4)); A[:n, :n] = K + reg * np.eye(n); A[:n, n:] = P; A[n:, :n] = P.T
        B = np.zeros((n + 4, 3)); B[:n] = Y - X
        sol = np.linalg.solve(A, B)
        self.X, self.W, self.A = X, sol[:n], sol[n:]

    def disp(self, P):
        P = np.asarray(P, float)
        out = np.empty_like(P)
        for s in range(0, len(P), 20000):
            Q = P[s:s + 20000]
            K = np.linalg.norm(Q[:, None] - self.X[None], axis=2)
            out[s:s + 20000] = K @ self.W + self.A[0] + Q @ self.A[1:]
        return out

    def __call__(self, P):
        return np.asarray(P, float) + self.disp(P)


class Attach:
    """Closest-point attachment of points to a triangle mesh: triangle index and barycentrics."""
    def __init__(self, V, T, X, k=12):
        V = np.asarray(V, float); X = np.asarray(X, float)
        C = V[T].mean(1)
        tree = cKDTree(C)
        _, cand = tree.query(X, k=min(k, len(T)))
        best_d = np.full(len(X), np.inf); best_t = np.zeros(len(X), np.int64); best_b = np.zeros((len(X), 3))
        for j in range(cand.shape[1]):
            t = cand[:, j]
            q, b = closest_on_tri(X, V[T[t, 0]], V[T[t, 1]], V[T[t, 2]])
            d = np.linalg.norm(X - q, axis=1)
            m = d < best_d
            best_d[m] = d[m]; best_t[m] = t[m]; best_b[m] = b[m]
        self.t, self.b, self.d, self.T = best_t, best_b, best_d, T

    def point(self, V):
        V = np.asarray(V)
        return (V[self.T[self.t]] * self.b[..., None]).sum(1)

    def interp(self, A):
        A = np.asarray(A)
        return (A[self.T[self.t]] * self.b.reshape(self.b.shape + (1,) * (A.ndim - 1))).sum(1)


def closest_on_tri(P, A, B, C):
    ab = B - A; ac = C - A; ap = P - A
    d1 = (ab * ap).sum(1); d2 = (ac * ap).sum(1)
    bp = P - B; d3 = (ab * bp).sum(1); d4 = (ac * bp).sum(1)
    cp = P - C; d5 = (ab * cp).sum(1); d6 = (ac * cp).sum(1)
    vc = d1 * d4 - d3 * d2; vb = d5 * d2 - d1 * d6; va = d3 * d6 - d5 * d4
    den = np.where(np.abs(va + vb + vc) < 1e-20, 1e-20, va + vb + vc)
    v = vb / den; w = vc / den
    bary = np.stack([1 - v - w, v, w], 1)
    r1 = (d1 <= 0) & (d2 <= 0); bary[r1] = [1, 0, 0]
    r2 = (d3 >= 0) & (d4 <= d3); bary[r2] = [0, 1, 0]
    r3 = (d6 >= 0) & (d5 <= d6); bary[r3] = [0, 0, 1]
    r4 = (vc <= 0) & (d1 >= 0) & (d3 <= 0) & ~(r1 | r2 | r3)
    t4 = d1 / np.where(np.abs(d1 - d3) < 1e-20, 1e-20, d1 - d3); bary[r4] = np.stack([1 - t4, t4, 0 * t4], 1)[r4]
    r5 = (vb <= 0) & (d2 >= 0) & (d6 <= 0) & ~(r1 | r2 | r3 | r4)
    t5 = d2 / np.where(np.abs(d2 - d6) < 1e-20, 1e-20, d2 - d6); bary[r5] = np.stack([1 - t5, 0 * t5, t5], 1)[r5]
    r6 = (va <= 0) & ((d4 - d3) >= 0) & ((d5 - d6) >= 0) & ~(r1 | r2 | r3 | r4 | r5)
    t6 = (d4 - d3) / np.where(np.abs((d4 - d3) + (d5 - d6)) < 1e-20, 1e-20, (d4 - d3) + (d5 - d6)); bary[r6] = np.stack([0 * t6, 1 - t6, t6], 1)[r6]
    bary = np.clip(bary, 0, 1); bary /= bary.sum(1, keepdims=True)
    Q = bary[:, :1] * A + bary[:, 1:2] * B + bary[:, 2:] * C
    return Q, bary


def rot_between(a, b):
    a = a / np.linalg.norm(a, axis=1, keepdims=True); b = b / np.linalg.norm(b, axis=1, keepdims=True)
    v = np.cross(a, b); c = (a * b).sum(1); s = np.linalg.norm(v, axis=1)
    K = np.zeros((len(a), 3, 3))
    K[:, 0, 1] = -v[:, 2]; K[:, 0, 2] = v[:, 1]; K[:, 1, 0] = v[:, 2]; K[:, 1, 2] = -v[:, 0]; K[:, 2, 0] = -v[:, 1]; K[:, 2, 1] = v[:, 0]
    f = np.where(s < 1e-9, 0.5, (1 - c) / np.maximum(s * s, 1e-18))
    return np.eye(3)[None] + K + (K @ K) * f[:, None, None]


VIEWS = {'front': 0.0, 'back': np.pi, 'left': np.pi / 2, 'right': -np.pi / 2, 'q34': np.radians(35), 'q34r': np.radians(-35)}


def splat(meshes, path=None, view='front', size=(480, 640), center=(0, 0, 0.95), height=2.0, light=(-0.4, -0.8, 0.5), bg=0.92, ss=1, dens=1.6):
    from PIL import Image
    W, H = size[0] * ss, size[1] * ss
    ang = VIEWS[view] if isinstance(view, str) else view
    c, s = np.cos(ang), np.sin(ang)
    R = np.array([[c, s, 0], [-s, c, 0], [0, 0, 1]])
    img = np.full((H, W, 3), bg); zb = np.full(H * W, np.inf)
    L = np.asarray(light, float); L = L / np.linalg.norm(L)
    px = H / height
    for V, T, rgb in meshes:
        V = np.asarray(V, float); T = np.asarray(T)
        X = (V - np.asarray(center)) @ R.T
        VN = vnormals(X, T)
        a, b, cc = X[T[:, 0]], X[T[:, 1]], X[T[:, 2]]
        area = np.linalg.norm(np.cross(b - a, cc - a), axis=1)
        pa = 0.5 * area * px * px
        cnt = np.clip(np.ceil(pa * dens).astype(int), 1, 400)
        ti = np.repeat(np.arange(len(T)), cnt)
        r1 = np.random.default_rng(0).random(len(ti)); r2 = np.random.default_rng(1).random(len(ti)); sq = np.sqrt(r1)
        w = np.stack([1 - sq, sq * (1 - r2), sq * r2], 1)
        P = w[:, :1] * a[ti] + w[:, 1:2] * b[ti] + w[:, 2:] * cc[ti]
        nn = w[:, :1] * VN[T[ti, 0]] + w[:, 1:2] * VN[T[ti, 1]] + w[:, 2:] * VN[T[ti, 2]]
        nn /= np.maximum(np.linalg.norm(nn, axis=1, keepdims=True), 1e-9)
        sx = (W / 2 + P[:, 0] * px).astype(int); sy = (H / 2 - P[:, 2] * px).astype(int)
        ok = (sx >= 0) & (sx < W) & (sy >= 0) & (sy < H)
        idx = sy[ok] * W + sx[ok]; dz = P[ok, 1]; nn = nn[ok]
        col = np.broadcast_to(np.asarray(rgb, float), (len(idx), 3)) if np.ndim(rgb) == 1 else np.asarray(rgb)[ti[ok]]
        facing = np.clip(-nn[:, 1], 0, 1)
        shade = 0.22 + 0.68 * np.clip(nn @ L, 0, 1) + 0.18 * facing
        order = np.argsort(-dz)
        idx, dz, shade, col = idx[order], dz[order], shade[order], col[order]
        better = dz < zb[idx]
        idx, dz, shade, col = idx[better], dz[better], shade[better], col[better]
        flat = img.reshape(-1, 3)
        flat[idx] = col * shade[:, None]; zb[idx] = dz
    im = Image.fromarray((np.clip(img, 0, 1) ** (1 / 1.0) * 255).astype(np.uint8)).resize(size, Image.LANCZOS)
    if path:
        im.save(path, quality=88)
    return im


def sheet(images, path, cols=4, bg=(235, 235, 235)):
    from PIL import Image
    w, h = images[0].size
    rows = (len(images) + cols - 1) // cols
    S = Image.new('RGB', (w * cols, h * rows), bg)
    for k, im in enumerate(images):
        S.paste(im, ((k % cols) * w, (k // cols) * h))
    S.save(path, quality=88)
    return S


def uv_islands(d):
    F = faces_of(d); uv = d['uv']; parent = list(range(len(F)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    key = {}
    for fi, (s, t) in enumerate(zip(d['ls'], d['lt'])):
        for k in range(t):
            kk = (int(d['loops'][s + k]), round(float(uv[s + k][0]), 5), round(float(uv[s + k][1]), 5))
            if kk in key:
                a, b = find(fi), find(key[kk]); parent[a] = b
            else:
                key[kk] = fi
    return np.array([find(i) for i in range(len(F))])


def ear_faces(d):
    isl = uv_islands(d); F = faces_of(d); V = d['co']
    c = np.array([V[f].mean(0) for f in F])
    out = np.zeros(len(F), bool)
    for i in np.unique(isl):
        m = isl == i
        if (np.abs(c[m, 0]).min() > 0.048) and m.sum() > 100 and d['mi'][m].max() < 3:
            out |= m
    return out
