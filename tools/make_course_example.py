"""Builds lakeside-sprint.glb: the example course that ships in courses/.
Use it as a template: change CPS to reshape the track, then re-run:  python3 make_course_example.py lakeside-sprint.glb
Convention: mesh "Road", empties CP, CP.001, CP.002 ... in driving order, optional empties Pad, Pad.001 ...
glTF is Y-up, so (x, y, z) here is already in three.js space."""
import json, math, struct, sys

OUT = sys.argv[1]
SUB, HALF_W = 14, 9.0
# Control points (x, height, z) in driving order, clockwise seen from above. 1 unit = 1 metre.
# Rules of thumb: corners no tighter than ~15 m radius, and keep different parts of the track
# at least 2 x road width + 6 m apart so cars on one stretch cannot touch another.
CPS = [(0, 0, -120), (80, 0, -115), (140, 1, -80), (165, 3, -15), (135, 4, 45), (85, 3, 65), (50, 2, 40), (20, 1, 10),
       (-15, 1, 15), (-35, 1, 55), (-30, 1, 100), (-75, 0, 125), (-135, 0, 105), (-165, 0, 45), (-150, 0, -30), (-105, 0, -85), (-50, 0, -115)]
CPS = [(x, y + 0.4, z) for x, y, z in CPS]   # lift slightly: the smooth curve can dip a little below the control heights
N_CP = len(CPS)
cps = CPS

def catmull(a, b, c, d, t):
    return tuple(0.5 * (2 * q + (-p + r) * t + (2 * p - 5 * q + 4 * r - s) * t * t + (-p + 3 * q - 3 * r + s) * t ** 3)
                 for p, q, r, s in zip(a, b, c, d))

ring = []
for i in range(N_CP):
    a, b, c, d = (cps[(i + k) % N_CP] for k in (-1, 0, 1, 2))
    ring += [catmull(a, b, c, d, s / SUB) for s in range(SUB)]
M = len(ring)

def tangent(i):
    p, q = ring[(i - 1) % M], ring[(i + 1) % M]
    x, z = q[0] - p[0], q[2] - p[2]; l = math.hypot(x, z)
    return x / l, z / l

pos, left_of = [], []
for i, p in enumerate(ring):
    tx, tz = tangent(i); lx, lz = tz, -tx          # left of travel
    left_of.append((lx, lz))
    pos += [(p[0] + lx * HALF_W, p[1], p[2] + lz * HALF_W), (p[0] - lx * HALF_W, p[1], p[2] - lz * HALF_W)]
idx = []
for i in range(M):
    j = (i + 1) % M
    L0, R0, L1, R1 = 2 * i, 2 * i + 1, 2 * j, 2 * j + 1
    idx += [L0, R0, L1, L1, R0, R1]

# sanity: tightest corner radius on the centreline
rmin = 1e9
for i in range(M):
    a, b, c = ring[i - 1], ring[i], ring[(i + 1) % M]
    ab, bc, ca = math.dist((a[0], a[2]), (b[0], b[2])), math.dist((b[0], b[2]), (c[0], c[2])), math.dist((c[0], c[2]), (a[0], a[2]))
    area = abs((b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2])) / 2
    if area > 1e-6: rmin = min(rmin, ab * bc * ca / (4 * area))
length = sum(math.dist(ring[i], ring[(i + 1) % M]) for i in range(M))
print(f"length {length:.0f} m, tightest radius {rmin:.0f} m, road {2 * HALF_W:.0f} m wide")

pads = []
for k, i in enumerate([M // 8, 3 * M // 8, 5 * M // 8, 7 * M // 8]):
    lx, lz = left_of[i]; o = 3 if k % 2 else -3
    pads.append((ring[i][0] + lx * o, ring[i][1], ring[i][2] + lz * o))

pos_b = b"".join(struct.pack("<3f", *v) for v in pos)
nrm_b = b"".join(struct.pack("<3f", 0, 1, 0) for _ in pos)
idx_b = b"".join(struct.pack("<I", v) for v in idx)
blob = pos_b + nrm_b + idx_b
mins = [min(v[k] for v in pos) for k in range(3)]; maxs = [max(v[k] for v in pos) for k in range(3)]

def name(base, i): return base if i == 0 else f"{base}.{i:03d}"
nodes = [{"name": "Road", "mesh": 0}]
nodes += [{"name": name("CP", i), "translation": list(p)} for i, p in enumerate(cps)]
nodes += [{"name": name("Pad", i), "translation": list(p)} for i, p in enumerate(pads)]
if "--nocp" in sys.argv: nodes = nodes[:1]   # test file: Road only, no CP empties
doc = {
    "asset": {"version": "2.0", "generator": "hfb-racing course example"},
    "scene": 0, "scenes": [{"nodes": list(range(len(nodes)))}], "nodes": nodes,
    "meshes": [{"name": "Road", "primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "material": 0}]}],
    "materials": [{"name": "Asphalt", "doubleSided": True,
                   "pbrMetallicRoughness": {"baseColorFactor": [0.17, 0.19, 0.24, 1], "metallicFactor": 0, "roughnessFactor": 0.95}}],
    "accessors": [
        {"bufferView": 0, "componentType": 5126, "count": len(pos), "type": "VEC3", "min": mins, "max": maxs},
        {"bufferView": 1, "componentType": 5126, "count": len(pos), "type": "VEC3"},
        {"bufferView": 2, "componentType": 5125, "count": len(idx), "type": "SCALAR"}],
    "bufferViews": [
        {"buffer": 0, "byteOffset": 0, "byteLength": len(pos_b), "target": 34962},
        {"buffer": 0, "byteOffset": len(pos_b), "byteLength": len(nrm_b), "target": 34962},
        {"buffer": 0, "byteOffset": len(pos_b) + len(nrm_b), "byteLength": len(idx_b), "target": 34963}],
    "buffers": [{"byteLength": len(blob)}],
}
js = json.dumps(doc, separators=(",", ":")).encode()
js += b" " * (-len(js) % 4); blob += b"\0" * (-len(blob) % 4)
total = 12 + 8 + len(js) + 8 + len(blob)
with open(OUT, "wb") as f:
    f.write(struct.pack("<4sII", b"glTF", 2, total))
    f.write(struct.pack("<I4s", len(js), b"JSON") + js)
    f.write(struct.pack("<I4s", len(blob), b"BIN\0") + blob)
print("wrote", OUT, total, "bytes")
