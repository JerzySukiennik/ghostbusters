# Hairline and hair-region maps in Jurek head space: azimuth/elevation around the head centre, per-character hairline curves, beard region.
import numpy as np

C = np.array([0.0, 0.008, 1.625])

HAIRLINE = {
    'crew_1': [(0, 35), (16, 35), (30, 31.5), (42, 30.5), (52, 33), (60, 25), (67, 10), (72, -10), (77, -12), (81, 4), (88, 9), (98, 7), (104, -12), (114, -26), (140, -36), (180, -40)],
    'crew_2': [(0, 36), (30, 35), (50, 30), (60, 21), (67, 8), (72, -9), (77, -12), (81, 3), (88, 7), (98, 5), (104, -13), (114, -27), (140, -37), (180, -41)],
    'crew_3': [(0, 31), (18, 31.5), (35, 30), (50, 26), (60, 17), (68, 4), (74, -8), (79, -6), (84, 9), (98, 7), (106, -14), (118, -28), (145, -36), (180, -39)],
}
BALD = {'crew_2': [(0, 24), (40, 22), (60, 19), (80, 18), (100, 19), (125, 21), (150, 24), (180, 26)]}


def az_el(P):
    v = np.asarray(P, float) - C
    az = np.degrees(np.arctan2(v[..., 0], -v[..., 1]))
    el = np.degrees(np.arctan2(v[..., 2], np.hypot(v[..., 0], v[..., 1])))
    return az, el


def curve(tab, az):
    a = np.abs(az)
    return np.interp(a, [p[0] for p in tab], [p[1] for p in tab])


def hair_mask(P, cid, soft=2.5):
    az, el = az_el(P)
    hl = curve(HAIRLINE[cid], az)
    m = np.clip((el - hl) / soft + 0.5, 0, 1)
    m = m * m * (3 - 2 * m)
    if cid in BALD:
        up = curve(BALD[cid], az)
        b = np.clip((up - el) / 4.0 + 0.5, 0, 1)
        m = m * b * b * (3 - 2 * b)
    return m


def hair_depth(P, cid):
    az, el = az_el(P)
    return el - curve(HAIRLINE[cid], az)


def beard_neckline(az):
    return np.interp(np.abs(az), [0, 45, 70, 85, 95], [1.482, 1.488, 1.512, 1.535, 1.55])
