# Face designs as real-world measurement targets and shape operators (mm), applied to Jurek's anchors in rig-normalized space.
FACES = {
    'crew_1': dict(
        ipd=64.0, eye_depth=2.2, eye_dz=0.0, eye_scale=24.0, aperture=-1.0, eye_tilt=0.6, fissure=30.5,
        skull=dict(sx=0.975, sy=1.0, sz=1.02),
        face_height=124.0, nose_len=55.0, lower_face=71.0, upper_lip=21.0, chin_len=27.0,
        nose_width=33.0, nose_proj=21.0, bridge=3.5, hump=1.6, tip_drop=1.0, nostril_flare=0.0,
        mouth_width=50.0, lip_up=-1.0, lip_low=-0.6, lip_proj=0.0,
        bizyg=132.0, bigonial=102.0, jaw_drop=8.0, chin_proj=3.0, chin_width=0.95,
        brow_ridge=3.0, brow_height=1.0, brow_tilt=-0.5, cheek_full=-2.0, cheek_hollow=2.2, jowl=0.0, double_chin=0.0,
        ear_scale=1.04, ear_out=1.0, forehead=6.0, temple_hollow=1.0,
    ),
    'crew_2': dict(
        ipd=63.0, eye_depth=2.6, eye_dz=-0.5, eye_scale=24.2, aperture=-2.2, eye_tilt=-1.0, fissure=29.0,
        skull=dict(sx=1.05, sy=1.01, sz=0.99),
        face_height=127.0, nose_len=55.0, lower_face=74.0, upper_lip=22.5, chin_len=28.0,
        nose_width=42.0, nose_proj=19.0, bridge=2.5, hump=0.6, tip_drop=2.5, nostril_flare=1.5,
        mouth_width=54.0, lip_up=-1.5, lip_low=0.8, lip_proj=0.5,
        bizyg=144.0, bigonial=114.0, jaw_drop=8.0, chin_proj=1.5, chin_width=1.18,
        brow_ridge=4.0, brow_height=-1.5, brow_tilt=-1.2, cheek_full=3.0, cheek_hollow=0.0, jowl=3.0, double_chin=6.0,
        ear_scale=1.16, ear_out=1.5, forehead=2.0, temple_hollow=0.0,
    ),
    'crew_3': dict(
        ipd=61.5, eye_depth=0.2, eye_dz=0.5, eye_scale=23.8, aperture=0.9, eye_tilt=1.8, fissure=32.5,
        skull=dict(sx=0.97, sy=1.00, sz=1.01),
        face_height=110.0, nose_len=47.0, lower_face=63.0, upper_lip=19.0, chin_len=24.0,
        nose_width=38.5, nose_proj=15.0, bridge=0.5, hump=0.0, tip_drop=-0.5, nostril_flare=1.6,
        mouth_width=49.0, lip_up=2.3, lip_low=2.8, lip_proj=1.6,
        bizyg=133.0, bigonial=96.0, jaw_drop=2.0, chin_proj=0.3, chin_width=1.02,
        brow_ridge=-1.0, brow_height=2.4, brow_tilt=1.2, cheek_full=3.0, cheek_hollow=0.0, jowl=0.0, double_chin=0.0,
        ear_scale=0.93, ear_out=-1.0, forehead=2.0, temple_hollow=0.0,
    ),
}


E0Z, SN0, ME0 = 1.6374, 1.5922, 1.5380


def chin_drop(cid, s):
    f = FACES[cid]
    sn = -f['nose_len'] / s; sto = sn - f['upper_lip'] / s; me = sto - (f['lower_face'] - f['upper_lip']) / s
    return max(0.0, ME0 - (E0Z + me / 1000))


def neck_drop(cid, s):
    return 0.5 * chin_drop(cid, s)
