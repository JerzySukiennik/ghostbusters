# Hairline maps for people (from blender/crew/hairline.py): azimuth/elevation around the head centre, per-character hairline curves from pdesign.
import numpy as np

C = np.array([0.0, 0.008, 1.625])

from pdesign import HAIRLINE, BALD


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
