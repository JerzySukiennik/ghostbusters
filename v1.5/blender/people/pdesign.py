# People definitions: Janine and 1984 New York pedestrians as body, face, skin, hair and outfit parameters on Jurek's rig (all hand-scripted).
import numpy as np

JUREK_STATURE = 1.740

LANKY = dict(
    torso=[(0.86, 1.10, 1.08, 1.14), (0.95, 1.10, 1.10, 1.12), (1.03, 1.16, 1.22, 1.12), (1.10, 1.16, 1.24, 1.12),
           (1.20, 1.08, 1.12, 1.08), (1.28, 1.06, 1.10, 1.06), (1.36, 1.03, 1.06, 1.04), (1.42, 1.02, 1.04, 1.02)],
    neck=1.25, trap=1.04, delt=1.00, upperarm=(1.00, 0.98, 0.98), forearm=(1.04, 1.00, 0.98), hand=0.97,
    thigh=(1.08, 1.02, 0.97), shin=(0.95, 0.94, 0.90), foot=1.0, bulges=[], ease=1.0, belly_ease=1.0)
STOCKY = dict(
    torso=[(0.86, 1.30, 1.45, 1.40), (0.95, 1.36, 1.75, 1.42), (1.03, 1.38, 2.05, 1.45), (1.10, 1.36, 2.00, 1.45),
           (1.20, 1.28, 1.60, 1.42), (1.28, 1.24, 1.45, 1.40), (1.36, 1.18, 1.32, 1.34), (1.42, 1.12, 1.18, 1.22)],
    neck=1.52, trap=1.45, delt=1.38, upperarm=(1.40, 1.40, 1.36), forearm=(1.40, 1.34, 1.24), hand=1.18,
    thigh=(1.45, 1.38, 1.22), shin=(1.22, 1.20, 1.10), foot=1.06,
    bulges=[('belly', (0.0, -0.10, 1.02), (0.12, 0.10, 0.12), 0.045)], ease=0.95, belly_ease=0.55)
WOMAN = dict(
    torso=[(0.86, 1.30, 1.22, 1.50), (0.95, 1.26, 1.18, 1.42), (1.03, 1.10, 1.14, 1.24), (1.10, 1.06, 1.10, 1.16),
           (1.20, 1.02, 1.04, 1.06), (1.28, 0.98, 1.02, 1.02), (1.36, 0.96, 1.00, 1.00), (1.42, 0.97, 1.00, 1.00)],
    neck=1.12, trap=0.92, delt=0.97, upperarm=(1.04, 1.06, 1.04), forearm=(1.06, 1.04, 1.00), hand=0.95,
    thigh=(1.36, 1.26, 1.06), shin=(1.06, 1.05, 0.96), foot=0.96,
    bulges=[('breastL', (0.082, -0.090, 1.235), (0.062, 0.05, 0.060), 0.036), ('breastR', (-0.082, -0.090, 1.235), (0.062, 0.05, 0.060), 0.036),
            ('glutes', (0.0, 0.085, 0.86), (0.13, 0.06, 0.08), 0.012)], ease=1.0, belly_ease=1.0)


def mixb(a, b, t, bulge_scale=1.0, extra=()):
    out = {}
    for k in a:
        if k == 'torso':
            out[k] = [tuple(float(x) for x in (np.array(ra) * (1 - t) + np.array(rb) * t)) for ra, rb in zip(a[k], b[k])]
        elif k == 'bulges':
            src = a[k] if t < 0.5 else b[k]
            out[k] = [(n, c, s, amp * bulge_scale) for n, c, s, amp in src] + list(extra)
        elif isinstance(a[k], tuple):
            out[k] = tuple(float(x) for x in (np.array(a[k]) * (1 - t) + np.array(b[k]) * t))
        else:
            out[k] = float(a[k] * (1 - t) + b[k] * t)
    return out


FM = dict(ipd=63.0, eye_depth=1.5, eye_dz=0.0, eye_scale=24.0, aperture=-0.5, eye_tilt=0.0, fissure=30.5, skull=dict(sx=1.0, sy=1.0, sz=1.0),
          face_height=122.0, nose_len=53.0, lower_face=70.0, upper_lip=21.0, chin_len=26.0, nose_width=36.0, nose_proj=19.0, bridge=3.0, hump=0.8,
          tip_drop=1.0, nostril_flare=0.5, mouth_width=52.0, lip_up=0.0, lip_low=0.0, lip_proj=0.0, bizyg=138.0, bigonial=104.0, jaw_drop=6.0,
          chin_proj=2.0, chin_width=1.0, brow_ridge=2.5, brow_height=0.0, brow_tilt=0.0, cheek_full=0.0, cheek_hollow=0.5, jowl=0.0, double_chin=0.0,
          ear_scale=1.05, ear_out=0.5, forehead=4.0, temple_hollow=0.5)
FF = dict(ipd=61.5, eye_depth=0.6, eye_dz=0.4, eye_scale=23.7, aperture=0.6, eye_tilt=1.0, fissure=31.5, skull=dict(sx=0.97, sy=1.0, sz=1.0),
          face_height=112.0, nose_len=48.0, lower_face=64.0, upper_lip=19.0, chin_len=24.0, nose_width=33.0, nose_proj=16.0, bridge=1.5, hump=0.0,
          tip_drop=0.0, nostril_flare=0.3, mouth_width=49.0, lip_up=1.2, lip_low=1.6, lip_proj=0.8, bizyg=130.0, bigonial=94.0, jaw_drop=2.0,
          chin_proj=0.8, chin_width=0.97, brow_ridge=-0.5, brow_height=1.8, brow_tilt=1.0, cheek_full=1.0, cheek_hollow=0.0, jowl=0.0, double_chin=0.0,
          ear_scale=0.95, ear_out=0.0, forehead=3.0, temple_hollow=0.0)


def face(base, **kw):
    f = dict(base); f['skull'] = dict(base['skull'])
    if 'skull' in kw:
        f['skull'].update(kw.pop('skull'))
    f.update(kw)
    return f


HL_M = [(0, 35), (16, 35), (30, 31.5), (42, 30.5), (52, 33), (60, 25), (67, 10), (72, -10), (77, -12), (81, 4), (88, 9), (98, 7), (104, -12), (114, -26), (140, -36), (180, -40)]
HL_F = [(0, 31), (18, 31.5), (35, 30), (50, 26), (60, 17), (68, 4), (74, -8), (79, -6), (84, 9), (98, 7), (106, -14), (118, -28), (145, -36), (180, -39)]
HL_RECEDE = [(0, 41), (20, 40), (32, 36), (44, 33), (54, 33), (62, 24), (68, 9), (72, -10), (77, -12), (81, 4), (88, 9), (98, 7), (104, -12), (114, -26), (140, -36), (180, -40)]

SKIN = dict(
    fair=dict(tone=(0.84, 0.66, 0.56), red=0.6, lips=(0.66, 0.42, 0.40)),
    ruddy=dict(tone=(0.83, 0.61, 0.51), red=1.0, lips=(0.64, 0.40, 0.37)),
    olive=dict(tone=(0.73, 0.57, 0.45), red=0.45, lips=(0.60, 0.38, 0.34)),
    tan=dict(tone=(0.66, 0.48, 0.36), red=0.4, lips=(0.52, 0.32, 0.28)),
    brown=dict(tone=(0.48, 0.32, 0.22), red=0.35, lips=(0.38, 0.22, 0.19), lips_inner=(0.52, 0.31, 0.28)),
    dark=dict(tone=(0.33, 0.21, 0.145), red=0.3, lips=(0.29, 0.17, 0.15), lips_inner=(0.48, 0.28, 0.26)),
    asian=dict(tone=(0.80, 0.64, 0.50), red=0.35, lips=(0.62, 0.40, 0.37)),
)


def look(skin, age, sex, hair, **kw):
    s = SKIN[skin]
    L = dict(tone=s['tone'], red=s['red'], peri=0.6, lips=s['lips'], stubble=0.0, stubble_col=(0.14, 0.12, 0.12), scalp='hair', hair=hair,
             wrinkle=float(np.clip((age - 28) / 40, 0, 1.1)), spots=float(np.clip((age - 50) / 20, 0, 1)), brow_paint=tuple(np.array(hair) * 0.9 + 0.01),
             brow_amt=0.85, freckle=0.0, oil=0.08, age=age, rough=0.58 if sex == 'f' else 0.56)
    if 'lips_inner' in s:
        L['lips_inner'] = s['lips_inner']
    L.update(kw)
    return L


EYES = dict(
    brown=dict(c1=(0.22, 0.13, 0.06), c2=(0.42, 0.30, 0.13), ring=0.8, sclera=(0.91, 0.88, 0.85)),
    dark=dict(c1=(0.09, 0.05, 0.03), c2=(0.20, 0.11, 0.055), ring=0.85, sclera=(0.90, 0.87, 0.84)),
    blue=dict(c1=(0.30, 0.40, 0.48), c2=(0.52, 0.58, 0.60), ring=0.6, sclera=(0.89, 0.85, 0.79)),
    hazel=dict(c1=(0.26, 0.22, 0.10), c2=(0.48, 0.40, 0.18), ring=0.7, sclera=(0.91, 0.88, 0.85)),
    green=dict(c1=(0.22, 0.30, 0.18), c2=(0.45, 0.42, 0.20), ring=0.7, sclera=(0.91, 0.88, 0.85)),
)

PEOPLE = {
    'janine': dict(
        name='Janine Melnitz', role='receptionist', sex='f', age=32, s=0.955,
        body=mixb(WOMAN, LANKY, 0.30, bulge_scale=0.75),
        face=face(FF, face_height=114.0, nose_len=50.0, nose_proj=18.0, bridge=2.2, hump=0.4, nose_width=31.5, mouth_width=50.0, lip_up=1.8, lip_low=2.2, lip_proj=1.0,
                  bizyg=127.0, bigonial=91.0, chin_proj=1.2, chin_width=0.92, cheek_hollow=1.6, cheek_full=-0.5, brow_height=1.2, brow_tilt=0.6, eye_scale=23.9,
                  aperture=0.8, ipd=61.0, skull=dict(sx=0.955)),
        hairline=[(0, 29), (18, 29.5), (35, 28), (50, 24), (60, 15), (68, 3), (74, -8), (79, -6), (84, 9), (98, 7), (106, -14), (118, -28), (145, -36), (180, -39)],
        look=look('fair', 32, 'f', (0.075, 0.050, 0.038), lips=(0.62, 0.17, 0.19), peri=0.75, brow_paint=(0.07, 0.045, 0.035), brow_amt=0.9, wrinkle=0.15, oil=0.06, blush=0.35, liner=0.55),
        eyes='hazel', brow_w=0.0034,
        brow=dict(width=(4.6, 1.8), color=(0.06, 0.04, 0.03), arch=1.2, layers=[0.0, 0.5, 1.0], h=0.0013, density=0.9),
        hair=dict(mode='vol', style='crop', color=(0.17, 0.085, 0.052), top=0.036, side=0.017, back=0.018, nape=-27, curl=0.009, curl_f=7.0, naz=96, nel=44, fringe=True),
        glasses=dict(w=57.0, h=50.0, rim=2.6, color=(0.86, 0.62, 0.66), alpha=0.55, tint=(0.75, 0.68, 0.70)),
        outfit=dict(
            top=dict(kind='blouse', color=(0.90, 0.89, 0.86), color2=(0.48, 0.50, 0.55), pattern='janine_stripes', hem=0.98, ease=4.0, collar='blouse', sleeve='long'),
            vest=dict(kind='knit', color=(0.50, 0.06, 0.07), color2=(0.05, 0.04, 0.05), pattern='plaid', hem=0.97, neck='v', ease=8.0),
            legs=dict(kind='skirt', color=(0.06, 0.06, 0.07), hem=0.52, top=1.0, ease=10.0, flare=0.02, tights=(0.16, 0.12, 0.11), sheer=0.55),
            shoes=dict(kind='pumps', color=(0.04, 0.035, 0.035)),
            hat=None, earrings=(0.80, 0.66, 0.30)),
    ),
    'p01': dict(
        name='Harold', role='businessman in trench coat', sex='m', age=47, s=1.02,
        body=mixb(LANKY, STOCKY, 0.42, bulge_scale=0.6),
        face=face(FM, face_height=126.0, nose_len=55.0, nose_proj=21.0, hump=1.5, jowl=1.5, double_chin=2.0, bigonial=108.0, brow_ridge=3.0, cheek_full=1.5, ear_scale=1.1),
        hairline=HL_RECEDE,
        look=look('fair', 47, 'm', (0.24, 0.20, 0.17), stubble=0.25),
        eyes='blue', brow_w=0.0045,
        hair=dict(mode='vol', style='short', color=(0.24, 0.20, 0.17), top=0.012, side=0.007, back=0.008, nape=-28, curl=0.0),
        outfit=dict(
            top=dict(kind='coat', color=(0.60, 0.50, 0.34), color2=(0.42, 0.34, 0.22), pattern='gabardine', hem=0.50, ease=17.0, collar='popped', belt=True, buttons='double'),
            under=dict(color=(0.86, 0.86, 0.84), tie=(0.36, 0.06, 0.08)),
            legs=dict(kind='trousers', color=(0.17, 0.17, 0.19), ease=8.0),
            shoes=dict(kind='shoes', color=(0.05, 0.04, 0.035)),
            hat=dict(kind='fedora', color=(0.21, 0.19, 0.17), band=(0.05, 0.045, 0.04))),
    ),
    'p02': dict(
        name='Linda', role='commuter in a red coat', sex='f', age=31, s=0.965,
        body=mixb(WOMAN, LANKY, 0.20, bulge_scale=0.85),
        face=face(FF, nose_proj=18.0, bridge=2.0, mouth_width=50.0, lip_up=1.6, bizyg=128.0),
        hairline=HL_F,
        look=look('olive', 31, 'f', (0.22, 0.12, 0.07), lips=(0.62, 0.22, 0.24), blush=0.3, liner=0.4),
        eyes='brown', brow_w=0.0032,
        hair=dict(mode='vol', style='perm', color=(0.25, 0.13, 0.07), top=0.040, side=0.050, back=0.052, nape=-62, curl=0.008),
        outfit=dict(
            top=dict(kind='coat', color=(0.50, 0.06, 0.07), color2=(0.30, 0.03, 0.04), pattern='wool', hem=0.47, ease=15.0, collar='popped', belt=True, buttons='double', pads=10.0),
            legs=dict(kind='tights', color=(0.10, 0.08, 0.075), sheer=0.45),
            shoes=dict(kind='boots', color=(0.035, 0.03, 0.03), top=0.40),
            hat=None, earrings=(0.82, 0.70, 0.35)),
    ),
    'p03': dict(
        name='Dwayne', role='young man in a leather jacket', sex='m', age=22, s=1.03,
        body=mixb(LANKY, STOCKY, 0.10),
        face=face(FM, nose_width=42.0, nose_proj=15.0, nostril_flare=1.5, lip_up=2.2, lip_low=2.6, lip_proj=1.5, bridge=0.5, brow_ridge=1.5, bizyg=136.0, face_height=118.0, jaw_drop=3.0),
        hairline=[(0, 33), (16, 33), (30, 30), (42, 29), (52, 30), (60, 23), (67, 9), (72, -10), (77, -12), (81, 4), (88, 9), (98, 7), (104, -12), (114, -26), (140, -36), (180, -40)],
        look=look('dark', 22, 'm', (0.025, 0.02, 0.018), stubble=0.3, stubble_col=(0.05, 0.04, 0.035)),
        eyes='dark', brow_w=0.0040,
        hair=dict(mode='vol', style='crop', color=(0.03, 0.025, 0.022), top=0.010, side=0.006, back=0.006, nape=-25, curl=0.003),
        outfit=dict(
            top=dict(kind='leather', color=(0.045, 0.042, 0.045), color2=(0.02, 0.02, 0.02), pattern='leather', hem=0.86, ease=11.0, collar='small', zip=True),
            under=dict(color=(0.85, 0.85, 0.83)),
            legs=dict(kind='jeans', color=(0.16, 0.24, 0.40), ease=5.0),
            shoes=dict(kind='sneakers', color=(0.88, 0.88, 0.86), stripe=(0.65, 0.08, 0.08)),
            hat=None),
    ),
    'p04': dict(
        name='Officer Brennan', role='NYPD patrol officer', sex='m', age=38, s=1.04, uniform='nypd',
        body=mixb(LANKY, STOCKY, 0.55, bulge_scale=0.5),
        face=face(FM, face_height=124.0, bizyg=142.0, bigonial=112.0, chin_width=1.1, nose_width=37.0, cheek_full=1.0, brow_ridge=3.5, brow_height=-1.0),
        hairline=HL_M,
        look=look('ruddy', 38, 'm', (0.30, 0.18, 0.10), stubble=0.45, stubble_col=(0.25, 0.16, 0.10)),
        eyes='blue', brow_w=0.0046,
        hair=dict(mode='vol', style='short', color=(0.30, 0.18, 0.10), top=0.010, side=0.005, back=0.006, nape=-25, curl=0.0),
        outfit=dict(
            top=dict(kind='uniform', color=(0.065, 0.08, 0.15), color2=(0.04, 0.05, 0.09), pattern='serge', hem=0.86, ease=9.0, collar='shirt', badge=True, patches=True, buttons='single'),
            belt=dict(color=(0.03, 0.03, 0.03), z=1.0, gear=True),
            legs=dict(kind='trousers', color=(0.06, 0.07, 0.13), ease=7.0, stripe=None),
            shoes=dict(kind='shoes', color=(0.03, 0.03, 0.03)),
            hat=dict(kind='police', color=(0.06, 0.075, 0.14), visor=(0.02, 0.02, 0.02), badge=(0.85, 0.66, 0.25))),
    ),
    'p05': dict(
        name='Rose', role='elderly woman in a long coat', sex='f', age=72, s=0.92,
        body=mixb(WOMAN, STOCKY, 0.35, bulge_scale=0.9),
        face=face(FF, jowl=3.0, double_chin=3.0, cheek_full=-1.0, cheek_hollow=1.0, face_height=114.0, nose_len=51.0, nose_proj=18.0, tip_drop=2.0, lip_up=-1.0, lip_low=-0.5,
                  aperture=-1.5, eye_depth=1.5, ear_scale=1.05),
        hairline=HL_F,
        look=look('fair', 72, 'f', (0.70, 0.68, 0.66), lips=(0.60, 0.36, 0.38), wrinkle=1.1, spots=1.0, brow_paint=(0.45, 0.42, 0.40), brow_amt=0.6, blush=0.25),
        eyes='blue', brow_w=0.0030,
        hair=dict(mode='vol', style='perm', color=(0.72, 0.70, 0.68), top=0.022, side=0.024, back=0.022, nape=-30, curl=0.006),
        outfit=dict(
            top=dict(kind='coat', color=(0.24, 0.11, 0.19), color2=(0.15, 0.06, 0.11), pattern='wool', hem=0.34, ease=18.0, collar='fur', buttons='single'),
            legs=dict(kind='tights', color=(0.62, 0.48, 0.38), sheer=0.85),
            shoes=dict(kind='shoes', color=(0.18, 0.11, 0.07)),
            hat=dict(kind='knit', color=(0.62, 0.42, 0.45), fold=True)),
    ),
    'p06': dict(
        name='Ray', role='Con Ed street worker', sex='m', age=41, s=1.0, uniform='coned',
        body=mixb(LANKY, STOCKY, 0.48, bulge_scale=0.7),
        face=face(FM, face_height=120.0, bizyg=140.0, bigonial=108.0, nose_width=38.0, nose_proj=18.0, lip_low=0.8, brow_ridge=2.5),
        hairline=HL_M,
        look=look('tan', 41, 'm', (0.05, 0.04, 0.035), stubble=0.9, stubble_col=(0.08, 0.06, 0.05)),
        eyes='brown', brow_w=0.0047,
        hair=dict(mode='vol', style='short', color=(0.05, 0.04, 0.035), top=0.012, side=0.006, back=0.008, nape=-26, curl=0.002),
        outfit=dict(
            top=dict(kind='work', color=(0.40, 0.29, 0.16), color2=(0.30, 0.21, 0.11), pattern='canvas', hem=0.86, ease=13.0, collar='small', zip=True),
            vest=dict(kind='safety', color=(0.96, 0.42, 0.06), color2=(0.80, 0.82, 0.80), hem=0.90, neck='v', ease=16.0),
            legs=dict(kind='jeans', color=(0.18, 0.25, 0.38), ease=6.0),
            shoes=dict(kind='boots', color=(0.42, 0.29, 0.15), top=0.16),
            hat=dict(kind='hardhat', color=(0.92, 0.92, 0.88))),
    ),
    'p07': dict(
        name='Sal', role='cabbie in a flat cap', sex='m', age=56, s=0.985,
        body=mixb(LANKY, STOCKY, 0.9),
        face=face(FM, face_height=127.0, bizyg=145.0, bigonial=114.0, nose_width=41.0, nose_proj=20.0, tip_drop=2.5, jowl=3.0, double_chin=5.0, cheek_full=3.0, aperture=-2.0, eye_depth=2.4),
        hairline=HL_RECEDE,
        look=look('olive', 56, 'm', (0.30, 0.28, 0.27), stubble=0.6, stubble_col=(0.22, 0.20, 0.19), mustache=(0.16, 0.14, 0.13)),
        eyes='brown', brow_w=0.0052,
        hair=dict(mode='vol', style='short', color=(0.30, 0.28, 0.27), top=0.006, side=0.008, back=0.008, nape=-24, curl=0.0),
        outfit=dict(
            top=dict(kind='windbreaker', color=(0.11, 0.15, 0.27), color2=(0.07, 0.09, 0.17), pattern='nylon', hem=0.88, ease=14.0, collar='small', zip=True, cuffband=True),
            legs=dict(kind='trousers', color=(0.33, 0.33, 0.34), ease=9.0),
            shoes=dict(kind='shoes', color=(0.06, 0.045, 0.035)),
            hat=dict(kind='flatcap', color=(0.33, 0.28, 0.21), pattern='tweed')),
    ),
    'p08': dict(
        name='Kim', role='new wave student', sex='f', age=21, s=0.935,
        body=mixb(WOMAN, LANKY, 0.30, bulge_scale=0.7),
        face=face(FF, ipd=62.0, eye_depth=-0.5, aperture=-0.8, eye_tilt=2.2, fissure=30.0, nose_proj=12.0, bridge=-0.5, nose_width=35.0, bizyg=134.0, face_height=108.0,
                  brow_ridge=-1.5, lip_up=1.0),
        hairline=HL_F,
        look=look('asian', 21, 'f', (0.025, 0.022, 0.024), lips=(0.55, 0.12, 0.30), liner=0.85, blush=0.4, wrinkle=0.0),
        eyes='dark', brow_w=0.0028,
        hair=dict(mode='vol', style='bob', color=(0.03, 0.027, 0.03), top=0.016, side=0.022, back=0.020, nape=-48, curl=0.0, fringe=True),
        outfit=dict(
            top=dict(kind='denim', color=(0.36, 0.48, 0.63), color2=(0.70, 0.55, 0.30), pattern='denim', hem=0.93, ease=11.0, collar='small', buttons='single'),
            under=dict(color=(0.85, 0.20, 0.45)),
            legs=dict(kind='skirt', color=(0.035, 0.035, 0.04), hem=0.70, top=0.99, ease=8.0, flare=0.015, tights=(0.03, 0.03, 0.035), sheer=0.05),
            shoes=dict(kind='hightops', color=(0.90, 0.90, 0.88)),
            hat=None, earrings=(0.95, 0.25, 0.55)),
    ),
    'p09': dict(
        name='Marcus', role='man in a velour tracksuit', sex='m', age=27, s=1.015,
        body=mixb(LANKY, STOCKY, 0.25),
        face=face(FM, face_height=121.0, nose_width=41.0, nose_proj=16.0, lip_up=2.0, lip_low=2.4, lip_proj=1.2, bizyg=137.0, jaw_drop=5.0, chin_proj=2.5),
        hairline=[(0, 33), (16, 33), (30, 30), (42, 29), (52, 30), (60, 23), (67, 9), (72, -10), (77, -12), (81, 4), (88, 9), (98, 7), (104, -12), (114, -26), (140, -36), (180, -40)],
        look=look('brown', 27, 'm', (0.03, 0.024, 0.02), stubble=0.5, stubble_col=(0.06, 0.045, 0.04)),
        eyes='dark', brow_w=0.0042,
        hair=dict(mode='vol', style='crop', color=(0.03, 0.024, 0.02), top=0.016, side=0.010, back=0.010, nape=-24, curl=0.004),
        outfit=dict(
            top=dict(kind='track', color=(0.55, 0.06, 0.08), color2=(0.92, 0.92, 0.90), pattern='velour', hem=0.90, ease=10.0, collar='band', zip=True, stripes=True, cuffband=True),
            legs=dict(kind='track', color=(0.55, 0.06, 0.08), ease=10.0, stripe=(0.92, 0.92, 0.90)),
            shoes=dict(kind='sneakers', color=(0.92, 0.92, 0.90), stripe=(0.10, 0.20, 0.55)),
            hat=None),
    ),
    'p10': dict(
        name='Denise', role='businesswoman with sneakers', sex='f', age=40, s=0.975,
        body=mixb(WOMAN, STOCKY, 0.15, bulge_scale=0.9),
        face=face(FF, nose_width=38.0, nose_proj=14.0, nostril_flare=1.2, lip_up=2.0, lip_low=2.4, lip_proj=1.4, bizyg=131.0, face_height=113.0, cheek_full=1.5),
        hairline=HL_F,
        look=look('dark', 40, 'f', (0.03, 0.024, 0.022), lips=(0.36, 0.13, 0.14), blush=0.15, liner=0.4),
        eyes='dark', brow_w=0.0031,
        hair=dict(mode='vol', style='bob', color=(0.035, 0.028, 0.025), top=0.022, side=0.020, back=0.020, nape=-36, curl=0.003),
        outfit=dict(
            top=dict(kind='suit', color=(0.34, 0.34, 0.36), color2=(0.26, 0.26, 0.28), pattern='pinstripe', hem=0.86, ease=10.0, collar='lapel', buttons='single', pads=12.0),
            under=dict(color=(0.92, 0.90, 0.86)),
            legs=dict(kind='skirt', color=(0.32, 0.32, 0.34), hem=0.47, top=0.99, ease=8.0, flare=0.01, tights=(0.30, 0.20, 0.15), sheer=0.6, pattern='pinstripe'),
            shoes=dict(kind='sneakers', color=(0.93, 0.93, 0.91), socks=(0.93, 0.93, 0.91), stripe=(0.75, 0.75, 0.74)),
            hat=None, earrings=(0.85, 0.70, 0.30)),
    ),
}

PEDS = [k for k in PEOPLE if k.startswith('p')]
CREW = {k: dict(s=v['s'], body=v['body'], name=v['name']) for k, v in PEOPLE.items()}
FACES = {k: v['face'] for k, v in PEOPLE.items()}
HAIRLINE = {k: v['hairline'] for k, v in PEOPLE.items()}
BALD = {}
LOOK = {k: v['look'] for k, v in PEOPLE.items()}
