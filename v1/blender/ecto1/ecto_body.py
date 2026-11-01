# Ecto-1 body shell: parametric patches meshed by constrained Delaunay, analytic normals, doors split with real gaps.
import math
import numpy as np
from ecto_common import (Patch, MB, cdt, steiner_grid, patch_mesh, points_in_poly, rounded_rect, resample,
                         offset_poly, bl, pchip, smoothstep, grid_mesh)
import ecto_design as D

FIL = 0.012
FIL_K = 1.0 - math.sqrt(1.0 - 0.94 ** 2)


def side_x(s, z):
    s = np.asarray(s, float)
    z = np.asarray(z, float)
    h = D.hw(s)
    zs = D.zsh(s)
    xs = D.xsh(s)
    up = np.clip((z - D.ZMW) / np.maximum(zs - D.ZMW, 0.05), 0.0, 1.0)
    top = (h - xs - FIL * FIL_K) * up ** 2.2
    dn = np.clip((D.ZMW - z) / (D.ZMW - 0.26), 0.0, 1.4)
    bot = 0.042 * dn ** 2.4
    t = np.clip((z - (zs - FIL)) / FIL, 0.0, 1.0)
    fil = FIL * (1.0 - np.sqrt(np.maximum(1.0 - (t * 0.94) ** 2, 0.0)))
    cz = D.crease_z(s)
    cr = D.crease_amp(s) * np.clip(1.0 - np.abs(z - cz) / 0.038, 0.0, 1.0) ** 1.3
    front = (1.0 - smoothstep(D.S_SIDE_FRONT, D.S_SIDE_FRONT + 0.08, s)) * 0.0
    return h - top - bot - fil + cr - front


def side_f(s, z):
    return bl(side_x(s, z), s, z)


SIDE = Patch(side_f)


def deck_z(s, x):
    s = np.asarray(s, float)
    ax = np.abs(np.asarray(x, float))
    zs = D.zsh(s)
    xs = D.xsh(s)
    hood_e = D.X_HOOD - D.X_HGAP / 2
    fend_e = D.X_HOOD + D.X_HGAP / 2
    zc = D.zhc(s)
    xn = np.clip(ax / D.X_HOOD, 0, 1.2)
    z_hood = zc + 0.016 - 0.032 * xn - 0.008 * xn ** 2
    w = np.clip((xs - ax) / np.maximum(xs - D.X_HOOD, 0.05), 0.0, 1.0)
    z_he = zc + 0.016 - 0.032 - 0.008 + 0.010
    z_fend = zs - np.maximum(zs - z_he, 0.0) * w ** 1.35 + 0.006 * np.sin(np.pi * np.clip(w, 0, 1))
    gapt = np.clip((ax - hood_e) / (fend_e - hood_e), 0.0, 1.0)
    z_gap = np.minimum(z_hood, z_fend) - 0.012
    z = np.where(ax <= hood_e, z_hood, np.where(ax >= fend_e, z_fend, z_gap))
    hood_zone = (s >= D.S_HOOD_F - 0.001) & (s <= D.S_HOOD_R + 0.001)
    z = np.where(hood_zone | (ax >= fend_e), z, np.where(ax <= hood_e, z_hood, z_fend))
    rear_gap = (np.abs(s - D.S_HOOD_R) < 0.003) & (ax < hood_e)
    z = np.where(rear_gap, z - 0.010, z)
    return z


def deck_f(s, x):
    return bl(x, s, deck_z(s, x))


DECK = Patch(deck_f, flip=True)


def ws_base(phi):
    phi = np.asarray(phi, float)
    a = np.abs(phi)
    x = D.X_APB * phi
    s = D.S_WB_C + (D.S_APB - D.S_WB_C) * a ** 3.0
    z = 0.955 + (D.Z_APB - 0.955) * a ** 2
    return x, s, z


def roof_point(s, th):
    s = np.asarray(s, float)
    th = np.asarray(th, float)
    a = D.x_dr(s)
    zd = D.z_dr(s)
    b = np.maximum(D.z_rc(s) - zd, 0.0)
    c = np.clip(np.cos(th), 0, 1)
    sn = np.clip(np.sin(th), 0, 1)
    x = a * c ** (2.0 / 6.0)
    z = zd + b * sn ** (2.0 / 2.6)
    return x, z


def ws_top(phi):
    phi = np.asarray(phi, float)
    x = D.X_APT * phi
    a = D.x_dr(D.S_APT)
    th = np.arccos(np.clip(np.abs(x) / a, 0, 1) ** 3.0)
    _, z = roof_point(np.full_like(phi, D.S_APT), th)
    s = np.full_like(phi, D.S_APT) + 0.012 * (1 - phi ** 2)
    return x, s, z


def ws_f(phi, w):
    xb, sb, zb_ = ws_base(phi)
    xt, st, zt = ws_top(phi)
    w = np.asarray(w, float)
    bulge = 0.018 * np.sin(np.pi * np.clip(w, 0, 1)) * (1 - np.abs(phi) ** 4)
    x = xb + (xt - xb) * w
    s = sb + (st - sb) * w - bulge
    z = zb_ + (zt - zb_) * w
    return bl(x, s, z)


WINDSHIELD = Patch(ws_f, flip=True)


def gh_f(sb, v):
    sb = np.asarray(sb, float)
    v = np.asarray(v, float)
    st = sb + D.lean(sb)
    xb, zb_ = D.x_gb(sb), D.z_gb(sb)
    xt, zt = D.x_dr(st), D.z_dr(st)
    bow = 0.010 * np.sin(np.pi * np.clip(v, 0, 1))
    return bl(xb + (xt - xb) * v + bow, sb + (st - sb) * v, zb_ + (zt - zb_) * v)


GREEN = Patch(gh_f, flip=True)


def sill_inner(s):
    s = np.asarray(s, float)
    xi = np.where(s <= 5.93, D.x_gb(np.minimum(s, 5.93)), D.TG_X + 0.010)
    t = np.clip((s - 5.93) / (D.S_FIN_TIP - 5.93), 0, 1)
    zi = np.where(s <= 5.93, D.z_gb(np.minimum(s, 5.93)), D.z_gb(5.93) - 0.075 * t ** 1.3)
    return xi, zi


def sill_f(s, u):
    s = np.asarray(s, float)
    u = np.asarray(u, float)
    xo, zo = D.xsh(s), D.zsh(s)
    xi, zi = sill_inner(s)
    x = xo + (xi - xo) * u
    z = zo + (zi - zo) * u + 0.006 * np.sin(np.pi * np.clip(u, 0, 1)) * smoothstep(4.3, 5.0, s)
    return bl(x, s, z)


SILL = Patch(sill_f, flip=True)


def roof_f(s, th):
    x, z = roof_point(s, th)
    return bl(x, s, z)


ROOF = Patch(roof_f)


def tg_s(x, z):
    x = np.asarray(x, float)
    z = np.asarray(z, float)
    curv = 0.020 * (x / D.TG_X) ** 2
    lower = D.S_TG_BOT - 0.012 * np.clip((z - D.Z_TG_BOT) / (D.Z_TG_WIN - D.Z_TG_BOT), 0, 1)
    wt = np.clip((z - D.Z_TG_WIN) / (D.Z_TG_TOP - D.Z_TG_WIN), 0, 1)
    upper = (D.S_TG_BOT - 0.012) + (D.S_TG_TOP - (D.S_TG_BOT - 0.012)) * wt
    return np.where(z <= D.Z_TG_WIN, lower, upper) - curv


def tg_f(x, z):
    return bl(x, tg_s(x, z), z)


TAILGATE = Patch(tg_f)


def cap_s(x, z):
    z = np.asarray(z, float)
    x = np.asarray(x, float)
    sr = D.side_rear(np.clip(z, 0.30, 1.12))
    return sr - 0.020 * np.clip((0.97 - x) / 0.25, 0, 1) ** 2


def cap_f(x, z):
    return bl(x, cap_s(x, z), z)


CAP = Patch(cap_f, flip=True)


def inwall_f(s, z):
    return bl(np.full_like(np.asarray(s, float), D.TG_X + 0.010), s, z)


INWALL = Patch(inwall_f)


def side_domain():
    fa = D.F_ARCH
    ss = np.linspace(D.S_SIDE_FRONT, 6.30, 4000)
    zbv = D.zb(ss)
    srv = D.side_rear(np.clip(zbv, 0.30, 1.12))
    k = np.argmax(ss >= srv)
    s_end = ss[k]
    z_end = zbv[k]

    def arch_z(s):
        t = np.clip((s - fa['cs']) / fa['a'], -1, 1)
        return fa['cz'] + fa['b'] * np.sqrt(1 - t * t)
    ra = D.R_ARCH
    rr = rounded_rect(ra['s0'], 0.0, ra['s1'], ra['ztop'], (0.0, ra['r1'], ra['r0'], 0.0), seg=10)
    s_fa0 = ss[np.argmax((ss > fa['cs'] - fa['a'] - 0.05) & (arch_z(ss) >= zbv) & (ss > 0.2))]
    s_fa1 = ss[np.where((ss < fa['cs'] + fa['a'] + 0.05) & (arch_z(ss) >= zbv))[0][-1]]
    bottom = []
    for s in np.arange(D.S_SIDE_FRONT, s_fa0, 0.03):
        bottom.append((s, float(D.zb(s))))
    for s in np.linspace(s_fa0, s_fa1, 48):
        bottom.append((s, float(max(arch_z(s), D.zb(s)))))
    rr_pts = np.array(rr)
    for s in np.arange(s_fa1 + 0.03, ra['s0'], 0.04):
        bottom.append((s, float(D.zb(s))))
    top_arc = [p for p in rr[1:] if p[1] > 0.001]
    top_arc = sorted(top_arc, key=lambda p: p[0])
    zf = float(D.zb(ra['s0']))
    bottom.append((ra['s0'], zf))
    for p in top_arc:
        if p[1] >= D.zb(p[0]):
            bottom.append((float(p[0]), float(p[1])))
    bottom.append((ra['s1'], float(D.zb(ra['s1']))))
    for s in np.arange(ra['s1'] + 0.04, s_end, 0.04):
        bottom.append((s, float(D.zb(s))))
    bottom.append((s_end, z_end))
    rear = []
    for z in np.linspace(z_end, float(D.zsh(D.S_FIN_TIP)), 30)[1:]:
        rear.append((float(D.side_rear(z)), float(z)))
    rear[-1] = (D.S_FIN_TIP, float(D.zsh(D.S_FIN_TIP)))
    top = []
    for s in np.arange(D.S_FIN_TIP - 0.03, D.S_SIDE_FRONT, -0.03):
        top.append((float(s), float(D.zsh(s))))
    top.append((D.S_SIDE_FRONT, float(D.zsh(D.S_SIDE_FRONT))))
    front = [(D.S_SIDE_FRONT, float(z)) for z in np.linspace(float(D.zsh(D.S_SIDE_FRONT)), float(D.zb(D.S_SIDE_FRONT)), 8)[1:-1]]
    outer = bottom + rear + top + front
    return outer, (s_fa0, s_fa1)


def door_poly(d, top_extra=0.06):
    s0, s1, zb_ = d['s0'], d['s1'], d['zb']
    zt = float(D.zsh(s1)) + top_extra
    return rounded_rect(s0, zb_, s1, zt, (d['r_rb'], 0.0, 0.0, d['r_fb']), seg=8)


def offset_lines_top(s0, s1, ds, offs):
    out = []
    for d in offs:
        ss = np.arange(s0, s1, ds)
        out.append([(float(s), float(D.zsh(s) - d)) for s in ss])
    return out


def build_side(mats):
    """Returns dict of MBs: body (left side), door_fl (left front door skin), plus edge data."""
    outer, (sa0, sa1) = side_domain()
    df = D.DOOR_F
    dr = D.DOOR_R
    g = D.GAP / 2
    pf = door_poly(df)
    pr = door_poly(dr)
    pf_in, pf_out = offset_poly(pf, -g), offset_poly(pf, g)
    pr_in, pr_out = offset_poly(pr, -g), offset_poly(pr, g)
    pf_in = resample(pf_in, 0.03)
    pf_out = resample(pf_out, 0.03)
    pr_in = resample(pr_in, 0.03)
    pr_out = resample(pr_out, 0.03)
    red = [(float(s), float(D.red_bottom(s))) for s in np.arange(D.S_RED0, D.FLASH[1][0] + 0.001, 0.025)]
    red_front = [(D.S_RED0, float(D.red_bottom(D.S_RED0))), (D.S_RED0, float(D.zsh(D.S_RED0)) + 0.05)]
    crease = [(float(s), float(D.crease_z(s))) for s in np.arange(0.06, 2.35, 0.04)]
    tops = offset_lines_top(D.S_SIDE_FRONT + 0.01, D.S_FIN_TIP - 0.01, 0.035, [0.0035, 0.0075, 0.0125, 0.022, 0.040])
    lines = [red, red_front, crease] + tops
    holes = []
    zs = np.arange(0.28, 1.13, 0.028)
    ss = np.arange(0.0, 6.3, 0.045)
    st = steiner_grid(outer, holes, lines + [pf_in, pf_out, pr_in, pr_out], ss, zs, 0.010)
    lines_all = lines + [pf_in + [pf_in[0]], pf_out + [pf_out[0]], pr_in + [pr_in[0]], pr_out + [pr_out[0]]]
    V2, T = cdt(outer, holes, lines_all, st)
    cen = V2[T].mean(axis=1)
    in_df = points_in_poly(cen, pf_in)
    in_dr = points_in_poly(cen, pr_in)
    gap_f = points_in_poly(cen, pf_out) & ~in_df
    gap_r = points_in_poly(cen, pr_out) & ~in_dr
    is_red = (cen[:, 0] >= D.S_RED0) & (cen[:, 1] >= D.red_bottom(cen[:, 0]))
    mat = np.where(is_red, mats['red'], mats['white'])
    body = MB()
    door = MB()
    keep_body = ~(in_df | gap_f | gap_r)
    patch_mesh(body, SIDE, V2, T[keep_body], mat[keep_body], uv=lambda c: c)
    patch_mesh(door, SIDE, V2, T[in_df], mat[in_df], uv=lambda c: c)
    edges = dict(door_f_in=pf_in, door_f_out=pf_out, door_r_in=pr_in, door_r_out=pr_out, arch=(sa0, sa1))
    return body, door, edges


def gap_wall(mb, patch, chain, depth, mat, inward_sign=-1.0, closed=True, step=0.02, clip=None):
    ch = resample(chain, step, closed=closed)
    pts2 = np.array(ch, float)
    if clip is not None:
        pts2 = pts2[clip(pts2)]
        if len(pts2) < 2:
            return
    P = patch.pos(pts2)
    N = patch.nrm(pts2)
    Q = P + N * depth * inward_sign
    n = len(P)
    if closed:
        idx = list(range(n)) + [0]
    else:
        idx = list(range(n))
    V = []
    Fs = []
    Ns = []
    for a, b in zip(idx[:-1], idx[1:]):
        if np.linalg.norm(P[b] - P[a]) > 0.2:
            continue
        base = len(V)
        V += [P[a], P[b], Q[b], Q[a]]
        e = P[b] - P[a]
        nn = np.cross(e, N[a])
        nn = nn / (np.linalg.norm(nn) + 1e-12)
        Fs += [(base, base + 1, base + 2), (base, base + 2, base + 3)]
        Ns += [[nn, nn, nn], [nn, nn, nn]]
    if not V:
        return
    V = np.array(V)
    Fs = np.array(Fs)
    Ns = np.array(Ns)
    mb.add(V, Fs, Ns, None, mat)
    mb.add(V, Fs[:, ::-1], -Ns[:, ::-1], None, mat)


def build_deck(mats):
    s_wb = lambda x: D.S_WB_C + (D.S_APB - D.S_WB_C) * np.clip(np.abs(x) / D.X_APB, 0, 1) ** 3.0
    outer = []
    for x in np.linspace(0.0, 0.70, 15):
        outer.append((D.S_HOOD_F, float(x)))
    for t in np.linspace(0, 1, 10)[1:]:
        x = 0.70 + 0.11 * t
        s = D.S_HOOD_F - (D.S_HOOD_F - 0.030) * (0.5 - 0.5 * math.cos(math.pi * t))
        outer.append((float(s), float(x)))
    for x in np.linspace(0.81, float(D.xsh(0.022)), 6)[1:]:
        outer.append((0.024, float(x)))
    for s in np.arange(0.05, D.S_APB, 0.04):
        outer.append((float(s), float(D.xsh(s))))
    outer.append((D.S_APB, float(D.xsh(D.S_APB))))
    outer.append((D.S_APB, D.X_APB))
    for x in np.linspace(D.X_APB, 0.0, 40)[1:]:
        outer.append((float(s_wb(x)), float(x)))
    hood_e = D.X_HOOD - D.X_HGAP / 2
    fend_e = D.X_HOOD + D.X_HGAP / 2
    l1 = [(float(s), hood_e) for s in np.arange(D.S_HOOD_F, D.S_HOOD_R + 0.001, 0.05)]
    l2 = [(float(s), fend_e) for s in np.arange(D.S_HOOD_F - 0.01, D.S_APB, 0.05)]
    l3 = [(D.S_HOOD_R - 0.003, float(x)) for x in np.linspace(0, hood_e, 16)]
    l4 = [(D.S_HOOD_R + 0.003, float(x)) for x in np.linspace(0, hood_e, 16)]
    edge_off = []
    for d in (0.004, 0.009, 0.016):
        edge_off.append([(float(s), float(D.xsh(s) - d)) for s in np.arange(0.04, D.S_APB - 0.01, 0.04)])
    lines = [l1, l2, l3, l4] + edge_off
    st = steiner_grid(outer, [], lines, np.arange(0.0, 2.1, 0.05), np.arange(0.0, 1.0, 0.045), 0.008)
    V2, T = cdt(outer, [], lines, st)
    cen = V2[T].mean(axis=1)
    gap = ((np.abs(cen[:, 1]) > hood_e) & (np.abs(cen[:, 1]) < fend_e) & (cen[:, 0] > D.S_HOOD_F - 0.005) & (cen[:, 0] < D.S_HOOD_R + 0.01)) | \
          ((np.abs(cen[:, 0] - D.S_HOOD_R) < 0.003) & (np.abs(cen[:, 1]) < hood_e))
    mat = np.where(gap, mats['gap'], mats['white'])
    mb = MB()
    patch_mesh(mb, DECK, V2, T, mat, uv=lambda c: c[:, ::-1])
    return mb


def build_windshield(mats):
    mb = MB()
    phis = np.linspace(-1, 1, 41)
    ws = np.linspace(0, 1, 13)
    PH, W = np.meshgrid(phis, ws)
    P = ws_f(PH.ravel(), W.ravel()).reshape(len(ws), len(phis), 3)
    grid_mesh(mb, P, mats['glass'], np.stack([PH, W], axis=-1), flip=False)
    return mb


def gh_v(sb, z):
    sb = np.asarray(sb, float)
    st = sb + D.lean(sb)
    zb_ = D.z_gb(sb)
    return (np.asarray(z, float) - zb_) / (D.z_dr(st) - zb_)


def build_greenhouse(mats):
    """Left side greenhouse: glass openings with chrome frames, pillars, painted band up to the drip moulding."""
    body = MB()
    door = MB()
    glass_b = MB()
    glass_d = MB()
    S0, S1 = 2.035, 5.93
    outer = resample([(S0, 0.0), (S1, 0.0), (S1, 1.0), (S0, 1.0)], 0.05)
    fw = 0.014
    holes = []
    panes = []
    for name, a, b, kind in D.GH:
        if kind != 'glass':
            continue
        sm = 0.5 * (a + b)
        vt = float(gh_v(sm, D.z_gt(sm)))
        rad = 0.045 if name in ('corner', 'quarter') else (0.02 if name == 'vent' else 0.012)
        r = rounded_rect(a + fw, D.GH_V0, b - fw, vt, (0.012, rad, 0.012, 0.012), seg=6)
        holes.append(r)
        panes.append((name, a + fw, b - fw, vt, r))
    ss = np.arange(S0, S1 + 0.001, 0.03)
    vft = gh_v(ss, D.z_gt(ss) + D.GH_FRAME)
    frame_top = [(float(a), float(b)) for a, b in zip(ss, vft)]
    vft_door = float(gh_v(2.5, D.z_gt(2.5) + D.GH_FRAME))
    g = 0.0015
    splits = [[(2.0780 - g, -0.01), (2.0780 - g, vft_door + 0.002)], [(2.0780 + g, -0.01), (2.0780 + g, vft_door + 0.002)],
              [(2.9505, -0.01), (2.9505, vft_door + 0.002)], [(2.9535, -0.01), (2.9535, vft_door + 0.002)]]
    rows = [[(float(s), 0.012) for s in np.arange(S0 + 0.005, S1, 0.05)]]
    lines = [frame_top] + splits + rows
    st = steiner_grid(outer, holes, lines, np.arange(2.0, 6.0, 0.035), np.linspace(0, 1, 11), 0.006)
    V2, T = cdt(outer, holes, lines, st)
    cen = V2[T].mean(axis=1)
    kinds = np.full(len(T), mats['chrome'])
    for name, a, b, kind in D.GH:
        sel = (cen[:, 0] >= a) & (cen[:, 0] < b)
        kinds[sel] = mats['white'] if kind == 'paint' else mats['chrome']
    above = cen[:, 1] > gh_v(cen[:, 0], D.z_gt(cen[:, 0]) + D.GH_FRAME)
    kinds[above] = mats['white']
    on_door = (cen[:, 0] > 2.0780 + g) & (cen[:, 0] < 2.9505) & ~above
    in_gap = (((cen[:, 0] >= 2.9505) & (cen[:, 0] <= 2.9535)) | (np.abs(cen[:, 0] - 2.078) <= g)) & ~above
    patch_mesh(body, GREEN, V2, T[~on_door & ~in_gap], kinds[~on_door & ~in_gap])
    patch_mesh(door, GREEN, V2, T[on_door], kinds[on_door])
    for name, a, b, vt, r in panes:
        su = np.linspace(a, b, max(3, int((b - a) / 0.05) + 2))
        sv = np.linspace(D.GH_V0, vt, 9)
        st2 = steiner_grid(r, [], [], su, sv, 0.004)
        V3, T3 = cdt(r, [], [], st2)
        inset = Patch(lambda s_, v_: gh_f(s_, v_) - GREEN.nrm(np.stack([s_, v_], 1)) * 0.010, flip=True)
        target = glass_d if (a > 2.07 and b < 2.96) else glass_b
        patch_mesh(target, inset, V3, T3, mats['glass'])
    return body, door, glass_b, glass_d, panes


def build_sill(mats):
    body = MB()
    door = MB()
    df = D.DOOR_F
    g = D.GAP / 2
    outer = [(D.S_APB, 0.0), (D.S_FIN_TIP, 0.0), (D.S_FIN_TIP, 1.0), (D.S_APB, 1.0)]
    outer = resample(outer, 0.04)
    lines = [[(df['s1'] - g, -0.1), (df['s1'] - g, 1.1)], [(df['s1'] + g, -0.1), (df['s1'] + g, 1.1)],
             [(D.DOOR_R['s1'] - g, -0.1), (D.DOOR_R['s1'] - g, 1.1)], [(D.DOOR_R['s1'] + g, -0.1), (D.DOOR_R['s1'] + g, 1.1)],
             [(D.DOOR_R['s0'] - g, -0.1), (D.DOOR_R['s0'] - g, 1.1)]]
    st = steiner_grid(outer, [], lines, np.arange(2.0, 6.3, 0.04), np.linspace(0, 1, 7), 0.003)
    V2, T = cdt(outer, [], lines, st)
    cen = V2[T].mean(axis=1)
    red = cen[:, 0] >= D.FLASH[0][0]
    mat = np.where(red, mats['red'], mats['chrome'])
    on_door = cen[:, 0] < df['s1'] - g
    gap = ((cen[:, 0] > df['s1'] - g) & (cen[:, 0] < df['s1'] + g)) | ((cen[:, 0] > D.DOOR_R['s1'] - g) & (cen[:, 0] < D.DOOR_R['s1'] + g))
    patch_mesh(body, SILL, V2, T[~on_door & ~gap], mat[~on_door & ~gap])
    patch_mesh(door, SILL, V2, T[on_door], mat[on_door])
    return body, door


def build_roof(mats):
    mb = MB()
    ss = np.concatenate([np.linspace(D.S_APT - 0.045, 2.6, 19), np.linspace(2.6, 5.3, 40)[1:], np.linspace(5.3, D.S_ROOF_REAR, 18)[1:]])
    th = np.concatenate([np.linspace(0, 0.25, 6), np.linspace(0.25, math.pi / 2, 18)[1:]])
    S, TH = np.meshgrid(ss, th)
    x, z = roof_point(S, TH)
    P = bl(x, S, z)
    grid_mesh(mb, P, mats['white'], np.stack([S, x], axis=-1), flip=False)
    return mb


def build_rear(mats):
    """Tailgate face + window (RearDoor) and the left quarter end cap + inner wall (body)."""
    tg = MB()
    tgg = MB()
    body = MB()
    xs = np.linspace(-D.TG_X, D.TG_X, 31)
    zl = np.linspace(D.Z_TG_BOT, D.Z_TG_WIN, 14)
    X, Z = np.meshgrid(xs, zl)
    grid_mesh(tg, tg_f(X.ravel(), Z.ravel()).reshape(X.shape + (3,)), mats['white'], np.stack([X, Z], -1), flip=True)
    zu = np.linspace(D.Z_TG_WIN, D.Z_TG_TOP, 8)
    xw = np.linspace(-D.TG_X, D.TG_X, 31)
    X2, Z2 = np.meshgrid(xw, zu)
    P2 = tg_f(X2.ravel(), Z2.ravel()).reshape(X2.shape + (3,))
    fx = 0.035
    inner = (np.abs(X2) <= D.TG_X - fx) & (Z2 >= D.Z_TG_WIN + 0.03) & (Z2 <= D.Z_TG_TOP - 0.025)
    grid_mesh(tg, P2, mats['chrome'], np.stack([X2, Z2], -1), flip=True)
    xg = np.linspace(-D.TG_X + fx, D.TG_X - fx, 25)
    zg = np.linspace(D.Z_TG_WIN + 0.03, D.Z_TG_TOP - 0.025, 7)
    X3, Z3 = np.meshgrid(xg, zg)
    P3 = tg_f(X3.ravel(), Z3.ravel()).reshape(X3.shape + (3,)) + np.array([0, 0.008, 0])
    grid_mesh(tgg, P3, mats['glass'], np.stack([X3, Z3], -1), flip=True)
    zc = np.linspace(0.655, 1.0, 14)
    xs_cap = []
    rows = []
    for z in zc:
        sr = float(D.side_rear(min(max(z, 0.30), 1.12)))
        xo = float(side_x(sr, z))
        xr = np.linspace(D.TG_X + 0.010, xo, 9)
        rows.append(np.stack([xr, np.full_like(xr, z)], 1))
    R = np.array(rows)
    P = cap_f(R[..., 0].ravel(), R[..., 1].ravel()).reshape(R.shape[:2] + (3,))
    grid_mesh(body, P, mats['red'], None, flip=True)
    ss = np.linspace(D.S_TG_BOT - 0.03, 6.20, 10)
    zz = np.linspace(D.Z_TG_BOT - 0.04, 1.0, 14)
    S, Zw = np.meshgrid(ss, zz)
    Pw = inwall_f(S.ravel(), Zw.ravel()).reshape(S.shape + (3,))
    grid_mesh(body, Pw, mats['white'], None, flip=False)
    return tg, tgg, body


def build_underbody(mats):
    mb = MB()
    ss = np.linspace(0.30, 6.05, 30)
    xs = np.linspace(-0.97, 0.97, 9)
    S, X = np.meshgrid(ss, xs)
    P = bl(X, S, np.full_like(S, 0.265))
    grid_mesh(mb, P, mats['under'], None, flip=True)
    for cs, (x0, x1) in ((D.S_FA, (0.50, 0.99)), (D.S_RA, (0.50, 0.99))):
        ang = np.linspace(0.18, math.pi - 0.18, 22)
        r = 0.44 if cs == D.S_FA else 0.43
        xs2 = np.linspace(x0, x1, 4)
        A, Xx = np.meshgrid(ang, xs2)
        s = cs + r * np.cos(A)
        z = 0.31 + r * np.sin(A)
        for sgn in (1, -1):
            P = bl(sgn * Xx, s, z)
            grid_mesh(mb, P, mats['under'], None, flip=(sgn > 0))
    return mb
