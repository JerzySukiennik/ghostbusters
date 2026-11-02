# Solve reference-photo cameras (pose + focal) from hand-picked landmarks; writes camfits_solved.json for render_compare.
import json
import math
import os
import sys
import numpy as np
from scipy.optimize import least_squares

HERE = os.path.dirname(os.path.abspath(__file__))
Y_OFF = 2.801

LM = {
    'hl_out_R': (-0.905, 0.090, 0.700), 'hl_in_R': (-0.700, 0.090, 0.700),
    'hl_out_L': (0.905, 0.090, 0.700), 'hl_in_L': (0.700, 0.090, 0.700),
    'plate_F': (0.0, -0.062, 0.385), 'pod_out_R': (-0.875, -0.020, 0.360), 'pod_out_L': (0.875, -0.020, 0.360),
    'hub_FR': (-0.925, 0.820, 0.360), 'hub_FL': (0.925, 0.820, 0.360), 'hub_RR': (-0.925, 4.782, 0.360), 'hub_RL': (0.925, 4.782, 0.360),
    'ap_top_R': (-0.822, 2.005, 1.465), 'ap_base_R': (-0.948, 2.065, 0.972), 'ap_top_L': (0.822, 2.005, 1.465), 'ap_base_L': (0.948, 2.065, 0.972),
    'dome_FL': (0.47, 2.125, 1.650), 'dome_FR': (-0.47, 2.125, 1.650),
    'hood_v': (0.0, 0.215, 0.890), 'logo_R': (-1.02, 2.470, 0.650), 'logo_L': (1.02, 2.470, 0.650),
    'bpil_belt_R': (-0.995, 2.965, 0.975), 'bpil_belt_L': (0.995, 2.965, 0.975),
    'cpil_belt_L': (0.995, 4.120, 0.990), 'cpil_belt_R': (-0.995, 4.120, 0.990),
    'fin_tip_L': (0.962, 6.250, 1.126), 'fin_tip_R': (-0.962, 6.250, 1.126),
    'pod_rear_L': (0.815, 6.325, 0.528), 'pod_rear_R': (-0.815, 6.325, 0.528),
    'radome_top': (0.34, 4.500, 2.600), 'tank_front_L': (0.58, 3.020, 1.790),
    'roof_rear_L': (0.70, 5.790, 1.478), 'roof_rear_R': (-0.70, 5.790, 1.478),
    'tg_logo': (-0.07, 5.990, 0.862), 'plate_R': (0.0, 6.336, 0.505),
    'front_tip_L': (0.93, 0.030, 0.800), 'front_tip_R': (-0.93, 0.030, 0.800),
    'arch_rear_top_L': (1.01, 4.700, 0.535), 'arch_front_top_L': (1.01, 0.820, 0.675), 'arch_front_top_R': (-1.01, 0.820, 0.675),
    'door_rear_bottom_R': (-1.0, 2.98, 0.34), 'door_front_bottom_R': (-1.0, 1.86, 0.34),
    'dome_RL': (0.52, 5.255, 1.650), 'dome_RR': (-0.52, 5.255, 1.650), 'glight_L': (0.42, 0.095, 0.630), 'glight_R': (-0.42, 0.095, 0.630),
}


def bl(p):
    x, s, z = p
    return np.array([x, s - Y_OFF, z], float)


def rotvec_to_R(r):
    th = np.linalg.norm(r)
    if th < 1e-12:
        return np.eye(3)
    k = r / th
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + math.sin(th) * K + (1 - math.cos(th)) * K @ K


def project(params, P, W, H):
    C = params[:3]
    R = rotvec_to_R(params[3:6])
    f = params[6]
    pc = (P - C) @ R
    fpx = f / 36.0 * W
    u = W / 2 + fpx * pc[:, 0] / (-pc[:, 2])
    v = H / 2 - fpx * pc[:, 1] / (-pc[:, 2])
    return np.stack([u, v], 1)


def look_rotvec(eye, target):
    f = target - eye
    f /= np.linalg.norm(f)
    up = np.array([0, 0, 1.0])
    r = np.cross(f, up)
    r /= np.linalg.norm(r)
    u = np.cross(r, f)
    R = np.stack([r, u, -f], 1)
    ang = math.acos(max(-1, min(1, (np.trace(R) - 1) / 2)))
    if ang < 1e-9:
        return np.zeros(3)
    rx = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]]) / (2 * math.sin(ang))
    return rx * ang


def solve(entry):
    W, H = entry['size']
    names = [p[0] for p in entry['points']]
    uv = np.array([p[1:] for p in entry['points']], float)
    P = np.array([bl(LM[n]) for n in names])
    best = None
    fixed = entry.get('lens')
    for guess in entry.get('guesses', [[[6, -4, 1.5], [0, 0, 0.8], 28]]):
        for k in (0.7, 1.0, 1.5):
            eye = np.array(guess[1], float) + (np.array(guess[0], float) - np.array(guess[1], float)) * k
            x0 = np.concatenate([eye, look_rotvec(eye, np.array(guess[1], float)), [fixed or guess[2]]])
            if fixed:
                fun = lambda x: (project(np.concatenate([x, [fixed]]), P, W, H) - uv).ravel()
                res = least_squares(fun, x0[:6], loss='soft_l1', f_scale=8.0)
                xs = np.concatenate([res.x, [fixed]])
            else:
                res = least_squares(lambda x: (project(x, P, W, H) - uv).ravel(), x0, loss='soft_l1', f_scale=8.0,
                                    bounds=([-60, -60, 0.2, -10, -10, -10, 8], [60, 60, 30, 10, 10, 10, 200]))
                xs = res.x
            err = np.sqrt(np.mean(np.sum((project(xs, P, W, H) - uv) ** 2, 1)))
            if best is None or err < best[1]:
                best = (xs, err)
    x, err = best
    R = rotvec_to_R(x[3:6])
    sy = math.sqrt(R[0, 0] ** 2 + R[1, 0] ** 2)
    ex = math.atan2(R[2, 1], R[2, 2])
    ey = math.atan2(-R[2, 0], sy)
    ez = math.atan2(R[1, 0], R[0, 0])
    resid = project(x, P, W, H) - uv
    return {'location': x[:3].tolist(), 'rotation_euler': [ex, ey, ez], 'lens_mm': float(x[6]), 'sensor_mm': 36.0,
            'size': [W, H], 'rms_px': float(err), 'residuals': {n: [round(float(a), 1), round(float(b), 1)] for n, (a, b) in zip(names, resid)}}


if __name__ == '__main__':
    src = os.path.join(HERE, 'camfits.json')
    data = json.load(open(src))
    out = {}
    for k, e in data.items():
        out[k] = solve(e)
        out[k]['photo'] = e['photo']
        print(k, 'rms px %.1f' % out[k]['rms_px'], 'lens %.1f' % out[k]['lens_mm'], 'loc', np.round(out[k]['location'], 2), out[k]['residuals'])
    json.dump(out, open(os.path.join(HERE, 'camfits_solved.json'), 'w'), indent=1)
