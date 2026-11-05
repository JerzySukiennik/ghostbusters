# Traffic vehicle designs (metres; s from the front bumper tip, z up, x half-widths) shared by the atlas painter and the Blender builder.

ATLAS_SIZE = 1024
R = {
    'white': (0, 0, 16, 16),
    'white_fixed': (16, 0, 16, 16),
    'black': (32, 0, 16, 16),
    'paint': (48, 0, 16, 16),
    'paint2': (64, 0, 16, 16),
    'glass': (80, 0, 16, 16),
    'side_l': (0, 32, 1024, 224),
    'side_r': (0, 256, 1024, 224),
    'front': (0, 480, 384, 160),
    'rear': (384, 480, 384, 160),
    'plate': (768, 480, 128, 64),
    'hub': (896, 480, 128, 128),
    'tire': (768, 544, 128, 64),
    'lens_round': (768, 608, 64, 64),
    'lens_rect': (832, 608, 64, 32),
    'lens_tail': (832, 640, 64, 32),
    'lens_amber': (896, 608, 32, 32),
    'lens_rev': (928, 608, 32, 32),
    'sign': (0, 640, 512, 96),
    'sign2': (512, 672, 256, 64),
    'extra': (0, 736, 1024, 288),
}
SIDE_Z = 1.8

COLORS = {
    'chrome': (0.78, 0.79, 0.80), 'trim': (0.025, 0.025, 0.027), 'glass': (0.012, 0.016, 0.02), 'under': (0.02, 0.02, 0.02),
    'tire': (0.03, 0.03, 0.03), 'interior': (0.05, 0.045, 0.04), 'vinyl': (0.045, 0.04, 0.035),
}

CHECKER = dict(
    kind='checker', title='Checker Marathon A11 (NYC taxi, 1980)', type='car', mass=1750, tint=False,
    paint=(0.95, 0.70, 0.05), L=5.15, body=(0.07, 5.08), wb=3.05, s_fa=0.98, tire_r=0.36, tire_w=0.205, rim_r=0.19, track=1.60,
    whitewall=True, hub='checker',
    top=[(0.07, 0.95), (0.25, 0.975), (0.8, 0.99), (1.9, 1.0), (3.5, 1.0), (4.3, 1.0), (4.8, 0.99), (5.08, 0.93)],
    bottom=[(0.07, 0.42), (0.35, 0.33), (0.9, 0.30), (4.3, 0.30), (4.85, 0.36), (5.08, 0.46)],
    hw=[(0.07, 0.86), (0.3, 0.93), (1.2, 0.955), (2.2, 0.965), (3.6, 0.975), (4.5, 0.97), (5.0, 0.93), (5.08, 0.90)],
    zm=[(0.0, 0.80), (2.0, 0.82), (5.08, 0.80)], crown=[(0.07, -0.11), (0.6, -0.08), (1.5, -0.03), (1.9, 0.0), (2.0, 0.02), (4.3, 0.02), (5.08, 0.01)],
    shoulder=0.09, tumble=0.035, rocker=0.12,
    arches=[(0.98, 0.45, 0.012), (4.03, 0.44, 0.012)],
    gh=dict(ws0=1.92, ws1=2.42, bl0=4.02, bl1=4.40, roof=1.585, roof_w=0.74, inset=0.035, crown=0.035,
            windows=[(1.98, 3.02), (3.11, 3.92), (3.98, 4.24)], frame='chrome', pillar='paint', vinyl=None),
    front=dict(z=(0.42, 0.95), heads=[dict(shape='round', x=0.79, z=0.84, r=0.088), dict(shape='round', x=0.60, z=0.84, r=0.088)],
               grille=dict(x=0.50, z=(0.45, 0.74)), park=[dict(x=0.69, z=0.62, w=0.15, h=0.06)]),
    rear=dict(z=(0.46, 1.0), tails=[dict(x=0.80, z=0.72, w=0.10, h=0.20)], rev=[dict(x=0.80, z=0.58, w=0.08, h=0.05)], plate_z=0.62),
    fbump=dict(z=(0.33, 0.55), s=0.0, d=0.13, wrap=0.30, guards=True), rbump=dict(z=(0.36, 0.56), s=5.15, d=0.12, wrap=0.28),
    mirrors=[2.08], sign='taxi', door_lines=[1.98, 3.06, 3.12, 3.97], handles=[2.85, 3.80],
)

GRANFURY = dict(
    kind='nypd', title='Plymouth Gran Fury (NYPD, 1984)', type='car', mass=1650, tint=False,
    paint=(0.33, 0.56, 0.86), paint2=(0.92, 0.93, 0.94), L=5.22, body=(0.08, 5.14), wb=2.86, s_fa=1.02, tire_r=0.345, tire_w=0.21, rim_r=0.19, track=1.53,
    whitewall=False, hub='police',
    top=[(0.08, 0.86), (0.2, 0.90), (1.0, 0.92), (1.75, 0.94), (3.9, 0.94), (4.3, 0.96), (5.14, 0.94)],
    bottom=[(0.08, 0.40), (0.3, 0.30), (0.9, 0.28), (4.4, 0.28), (4.9, 0.33), (5.14, 0.42)],
    hw=[(0.08, 0.89), (0.25, 0.925), (1.0, 0.94), (3.0, 0.945), (4.6, 0.94), (5.14, 0.92)],
    zm=[(0.0, 0.70), (5.14, 0.70)], crown=[(0.08, 0.0), (0.8, 0.012), (1.7, 0.02), (4.2, 0.02), (5.14, 0.01)],
    shoulder=0.045, tumble=0.03, rocker=0.12,
    arches=[(1.02, 0.42, 0.006), (3.88, 0.42, 0.006)],
    gh=dict(ws0=1.80, ws1=2.38, bl0=3.88, bl1=4.30, roof=1.395, roof_w=0.70, inset=0.04, crown=0.03,
            windows=[(1.86, 2.88), (2.98, 3.80)], frame='chrome', pillar='paint2', vinyl=None, roof_slot='Paint2'),
    front=dict(z=(0.40, 0.90), heads=[dict(shape='rect', x=0.72, z=0.74, w=0.20, h=0.12), dict(shape='rect', x=0.49, z=0.74, w=0.20, h=0.12)],
               grille=dict(x=0.37, z=(0.52, 0.83)), park=[dict(x=0.62, z=0.56, w=0.30, h=0.05)]),
    rear=dict(z=(0.42, 0.96), tails=[dict(x=0.62, z=0.78, w=0.50, h=0.13)], rev=[dict(x=0.30, z=0.78, w=0.12, h=0.12)], plate_z=0.60),
    fbump=dict(z=(0.34, 0.52), s=0.0, d=0.12, wrap=0.30, guards=False), rbump=dict(z=(0.36, 0.54), s=5.22, d=0.12, wrap=0.30),
    mirrors=[1.95], sign='police', door_lines=[1.86, 2.92, 2.97, 3.85], handles=[2.70, 3.62], spot=True,
)

CAPRICE = dict(
    kind='caprice', title='Chevrolet Caprice Classic (1982)', type='car', mass=1700, tint=True,
    paint=(0.18, 0.30, 0.20), L=5.38, body=(0.08, 5.30), wb=2.95, s_fa=1.03, tire_r=0.35, tire_w=0.205, rim_r=0.19, track=1.58,
    whitewall=True, hub='wire',
    top=[(0.08, 0.84), (0.25, 0.88), (1.0, 0.905), (1.8, 0.93), (4.0, 0.93), (4.5, 0.96), (5.30, 0.95)],
    bottom=[(0.08, 0.40), (0.3, 0.31), (0.9, 0.29), (4.5, 0.29), (5.0, 0.34), (5.30, 0.43)],
    hw=[(0.08, 0.90), (0.3, 0.935), (1.2, 0.95), (3.2, 0.955), (4.8, 0.95), (5.30, 0.93)],
    zm=[(0.0, 0.72), (5.3, 0.72)], crown=[(0.08, 0.0), (0.8, 0.015), (1.7, 0.02), (4.2, 0.02), (5.3, 0.01)],
    shoulder=0.04, tumble=0.03, rocker=0.12,
    arches=[(1.03, 0.43, 0.006), (3.98, 0.43, 0.006)],
    gh=dict(ws0=1.88, ws1=2.48, bl0=3.98, bl1=4.42, roof=1.415, roof_w=0.71, inset=0.04, crown=0.03,
            windows=[(1.94, 3.0), (3.09, 3.86)], frame='chrome', pillar='paint', vinyl=(2.45, 4.0), opera=None),
    front=dict(z=(0.40, 0.88), heads=[dict(shape='rect', x=0.75, z=0.74, w=0.19, h=0.11), dict(shape='rect', x=0.54, z=0.74, w=0.19, h=0.11)],
               grille=dict(x=0.43, z=(0.50, 0.82)), park=[dict(x=0.66, z=0.58, w=0.38, h=0.05)]),
    rear=dict(z=(0.43, 0.96), tails=[dict(x=0.70, z=0.76, w=0.36, h=0.16)], rev=[dict(x=0.44, z=0.76, w=0.10, h=0.16)], plate_z=0.62),
    fbump=dict(z=(0.34, 0.52), s=0.0, d=0.12, wrap=0.32, guards=False), rbump=dict(z=(0.36, 0.55), s=5.38, d=0.12, wrap=0.32),
    mirrors=[2.02], sign=None, door_lines=[1.94, 3.03, 3.07, 3.92], handles=[2.82, 3.70],
)

LTD = dict(
    kind='ltd', title='Ford LTD Crown Victoria (1984)', type='car', mass=1750, tint=True,
    paint=(0.40, 0.10, 0.10), L=5.36, body=(0.08, 5.28), wb=2.90, s_fa=1.05, tire_r=0.35, tire_w=0.205, rim_r=0.19, track=1.58,
    whitewall=True, hub='ford',
    top=[(0.08, 0.86), (0.25, 0.90), (1.0, 0.92), (1.8, 0.94), (4.0, 0.94), (4.5, 0.96), (5.28, 0.95)],
    bottom=[(0.08, 0.41), (0.3, 0.32), (0.9, 0.30), (4.5, 0.30), (5.0, 0.35), (5.28, 0.44)],
    hw=[(0.08, 0.92), (0.3, 0.955), (1.2, 0.97), (3.2, 0.975), (4.8, 0.97), (5.28, 0.95)],
    zm=[(0.0, 0.73), (5.28, 0.73)], crown=[(0.08, 0.0), (0.8, 0.012), (1.7, 0.02), (4.2, 0.02), (5.28, 0.01)],
    shoulder=0.035, tumble=0.025, rocker=0.12,
    arches=[(1.05, 0.43, 0.006), (3.95, 0.43, 0.006)],
    gh=dict(ws0=1.90, ws1=2.50, bl0=3.92, bl1=4.36, roof=1.41, roof_w=0.72, inset=0.04, crown=0.03,
            windows=[(1.96, 2.98), (3.07, 3.80)], frame='chrome', pillar='paint', vinyl=(2.47, 4.0), opera=(3.84, 3.92)),
    front=dict(z=(0.41, 0.90), heads=[dict(shape='rect', x=0.74, z=0.75, w=0.19, h=0.11), dict(shape='rect', x=0.53, z=0.75, w=0.19, h=0.11)],
               grille=dict(x=0.40, z=(0.50, 0.84)), park=[dict(x=0.87, z=0.75, w=0.06, h=0.11)]),
    rear=dict(z=(0.44, 0.96), tails=[dict(x=0.66, z=0.74, w=0.44, h=0.18)], rev=[dict(x=0.38, z=0.74, w=0.10, h=0.12)], plate_z=0.64),
    fbump=dict(z=(0.35, 0.53), s=0.0, d=0.12, wrap=0.32, guards=False), rbump=dict(z=(0.37, 0.55), s=5.36, d=0.12, wrap=0.32),
    mirrors=[2.04], sign=None, door_lines=[1.96, 3.01, 3.05, 3.86], handles=[2.80, 3.65],
)

CUTLASS = dict(
    kind='cutlass', title='Oldsmobile Cutlass Supreme coupe (1983)', type='car', mass=1500, tint=True,
    paint=(0.82, 0.76, 0.62), L=5.08, body=(0.08, 5.00), wb=2.75, s_fa=1.05, tire_r=0.34, tire_w=0.20, rim_r=0.18, track=1.50,
    whitewall=True, hub='olds',
    top=[(0.08, 0.80), (0.3, 0.86), (1.0, 0.88), (1.85, 0.91), (3.8, 0.91), (4.3, 0.94), (5.0, 0.92)],
    bottom=[(0.08, 0.39), (0.3, 0.30), (0.9, 0.28), (4.2, 0.28), (4.7, 0.33), (5.0, 0.42)],
    hw=[(0.08, 0.83), (0.3, 0.88), (1.2, 0.905), (3.0, 0.91), (4.5, 0.905), (5.0, 0.88)],
    zm=[(0.0, 0.70), (5.0, 0.70)], crown=[(0.08, 0.0), (0.8, 0.02), (1.7, 0.02), (4.0, 0.02), (5.0, 0.01)],
    shoulder=0.04, tumble=0.03, rocker=0.12,
    arches=[(1.05, 0.42, 0.006), (3.80, 0.42, 0.006)],
    gh=dict(ws0=1.95, ws1=2.55, bl0=3.70, bl1=4.25, roof=1.385, roof_w=0.68, inset=0.04, crown=0.03,
            windows=[(2.01, 3.22)], frame='chrome', pillar='paint', vinyl=(2.52, 3.78), opera=(3.45, 3.58)),
    front=dict(z=(0.39, 0.86), heads=[dict(shape='rect', x=0.70, z=0.70, w=0.17, h=0.10), dict(shape='rect', x=0.70, z=0.58, w=0.17, h=0.10)],
               grille=dict(x=0.50, z=(0.48, 0.80), split=True), park=[dict(x=0.24, z=0.45, w=0.18, h=0.04)]),
    rear=dict(z=(0.42, 0.93), tails=[dict(x=0.66, z=0.71, w=0.36, h=0.17)], rev=[dict(x=0.44, z=0.71, w=0.08, h=0.17)], plate_z=0.62),
    fbump=dict(z=(0.33, 0.50), s=0.0, d=0.12, wrap=0.30, guards=False), rbump=dict(z=(0.35, 0.53), s=5.08, d=0.12, wrap=0.30),
    mirrors=[2.12], sign=None, door_lines=[2.0, 3.40], handles=[3.18],
)

ARIES = dict(
    kind='aries', title='Dodge Aries K sedan (1983)', type='car', mass=1150, tint=True,
    paint=(0.38, 0.22, 0.14), L=4.48, body=(0.07, 4.41), wb=2.52, s_fa=0.92, tire_r=0.31, tire_w=0.185, rim_r=0.17, track=1.46,
    whitewall=False, hub='k',
    top=[(0.07, 0.78), (0.3, 0.84), (0.9, 0.86), (1.55, 0.89), (3.4, 0.89), (3.8, 0.92), (4.41, 0.90)],
    bottom=[(0.07, 0.37), (0.3, 0.28), (0.8, 0.26), (3.7, 0.26), (4.2, 0.30), (4.41, 0.38)],
    hw=[(0.07, 0.80), (0.3, 0.84), (1.0, 0.86), (2.8, 0.865), (4.0, 0.86), (4.41, 0.84)],
    zm=[(0.0, 0.68), (4.41, 0.68)], crown=[(0.07, 0.0), (0.8, 0.015), (1.6, 0.02), (3.6, 0.02), (4.41, 0.01)],
    shoulder=0.035, tumble=0.03, rocker=0.11,
    arches=[(0.92, 0.38, 0.005), (3.44, 0.38, 0.005)],
    gh=dict(ws0=1.55, ws1=2.12, bl0=3.36, bl1=3.80, roof=1.335, roof_w=0.66, inset=0.04, crown=0.03,
            windows=[(1.61, 2.56), (2.64, 3.32)], frame='trim', pillar='trim', vinyl=None),
    front=dict(z=(0.37, 0.84), heads=[dict(shape='rect', x=0.62, z=0.70, w=0.26, h=0.14)],
               grille=dict(x=0.42, z=(0.55, 0.80)), park=[dict(x=0.62, z=0.58, w=0.24, h=0.05)]),
    rear=dict(z=(0.38, 0.90), tails=[dict(x=0.62, z=0.74, w=0.32, h=0.15)], rev=[dict(x=0.40, z=0.74, w=0.10, h=0.15)], plate_z=0.60),
    fbump=dict(z=(0.31, 0.48), s=0.0, d=0.11, wrap=0.26, guards=False), rbump=dict(z=(0.33, 0.50), s=4.48, d=0.11, wrap=0.26),
    mirrors=[1.66], sign=None, door_lines=[1.62, 2.60, 2.62, 3.36], handles=[2.40, 3.18],
)

RTS = dict(
    kind='bus', title='GMC RTS-II city bus (NYCTA, 1984)', type='bus', mass=12500, tint=False,
    paint=(0.92, 0.92, 0.90), L=12.19, W=2.59, H=3.06, wb=7.11, s_fa=2.30, tire_r=0.51, tire_w=0.29, rim_r=0.29, track_f=2.10, track_r=1.95,
)
BOXTRUCK = dict(
    kind='boxtruck', title='GMC 7000 box truck (1982)', type='boxtruck', mass=7500, tint=False,
    paint=(0.62, 0.10, 0.08), L=8.4, W=2.44, H=3.55, wb=4.70, s_fa=1.05, tire_r=0.47, tire_w=0.25, rim_r=0.255, track_f=1.95, track_r=1.80,
)
GARBAGE = dict(
    kind='garbage', title='Mack MR rear loader (DSNY, 1984)', type='garbage', mass=17000, tint=False,
    paint=(0.90, 0.90, 0.88), L=9.3, W=2.50, H=3.45, wb=4.55, s_fa=1.30, tire_r=0.52, tire_w=0.28, rim_r=0.29, track_f=2.05, track_r=1.85,
)

ALL = {d['kind']: d for d in (CHECKER, GRANFURY, CAPRICE, LTD, CUTLASS, ARIES, RTS, BOXTRUCK, GARBAGE)}

BIG_R = dict(R, front=(0, 736, 512, 288), rear=(512, 736, 512, 288))
RTS.update(paint=(0.84, 0.79, 0.66), front_zr=(0.0, 3.1), rear_zr=(0.0, 3.1), hub='k', number='4127', route='M10  CENTRAL PARK WEST')
BOXTRUCK.update(paint=(0.45, 0.035, 0.03), paint2=(0.86, 0.86, 0.84), front_zr=(0.4, 1.7), rear_zr=(0.9, 3.6), hub='k')
GARBAGE.update(paint=(0.86, 0.86, 0.84), front_zr=(0.4, 2.7), rear_zr=(0.8, 2.4), hub='k', tandem=1.34, number='25DE-431')
