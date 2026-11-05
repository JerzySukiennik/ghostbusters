# Face helpers for people (from blender/crew/faces.py): chin and neck drop from the face design in pdesign.
from pdesign import FACES

E0Z, SN0, ME0 = 1.6374, 1.5922, 1.5380


def chin_drop(cid, s):
    f = FACES[cid]
    sn = -f['nose_len'] / s; sto = sn - f['upper_lip'] / s; me = sto - (f['lower_face'] - f['upper_lip']) / s
    return max(0.0, ME0 - (E0Z + me / 1000))


def neck_drop(cid, s):
    return 0.5 * chin_drop(cid, s)
