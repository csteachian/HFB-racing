"""HFB Racing track maker for Blender (run from the Scripting tab).

1. Draw a CLOSED curve (Add > Curve > Bezier or NURBS, then Tab, and toggle Cyclic with Alt+C).
   Blender is Z-up: move points up and down in Z to make hills.
2. Select the curve in Object Mode so it is the active object.
3. Set COUNT and WIDTH below, then press Run Script.
4. File > Export > glTF 2.0, format glTF Binary (.glb), leave "+Y Up" on. Import the .glb in the game.

It creates a mesh called "Road" and empties called CP, CP.001, CP.002 ... placed evenly along the curve
in the direction the curve is drawn. The first point (CP) is the start line.
Optional: add empties named Pad, Pad.001 ... anywhere on the road for boost pads.
Unit scale: 1 Blender unit = 1 metre. The karts are about 3 m long and the sample road is 16 m wide."""
import bpy, bmesh
from mathutils import Vector

COUNT = 48      # number of CP empties (more = tighter fit to the curve)
WIDTH = 16.0    # road width in metres

curve_obj = bpy.context.active_object
if curve_obj is None or curve_obj.type != 'CURVE':
    raise Exception("Select your track curve first (it must be the active object).")

# 1. Flatten the curve into an ordered polyline.
dg = bpy.context.evaluated_depsgraph_get()
tmp = bpy.data.meshes.new_from_object(curve_obj.evaluated_get(dg))
mw = curve_obj.matrix_world
poly = [mw @ v.co for v in tmp.vertices]
bpy.data.meshes.remove(tmp)
if len(poly) < 4:
    raise Exception("The curve produced too few points. Increase its Resolution Preview U.")

# 2. Resample evenly by distance.
lengths = [0.0]
for i in range(len(poly)):
    lengths.append(lengths[-1] + (poly[(i + 1) % len(poly)] - poly[i]).length)
total = lengths[-1]

def point_at(d):
    d %= total
    for i in range(len(poly)):
        if lengths[i + 1] >= d:
            seg = lengths[i + 1] - lengths[i]
            t = (d - lengths[i]) / seg if seg > 0 else 0.0
            return poly[i].lerp(poly[(i + 1) % len(poly)], t)
    return poly[0].copy()

col = bpy.context.collection

# 3. Road mesh: a ribbon of WIDTH metres along the curve.
ring = [point_at(total * i / (COUNT * 4)) for i in range(COUNT * 4)]
bm = bmesh.new()
lefts, rights = [], []
for i, p in enumerate(ring):
    t = ring[(i + 1) % len(ring)] - ring[i - 1]
    t.z = 0.0
    t.normalize()
    n = Vector((-t.y, t.x, 0.0))          # left of travel (Z up)
    lefts.append(bm.verts.new(p + n * WIDTH / 2))
    rights.append(bm.verts.new(p - n * WIDTH / 2))
for i in range(len(ring)):
    j = (i + 1) % len(ring)
    bm.faces.new((lefts[i], rights[i], rights[j], lefts[j]))
road_mesh = bpy.data.meshes.new("Road")
bm.to_mesh(road_mesh)
bm.free()
mat = bpy.data.materials.new("Asphalt")
mat.use_nodes = True
mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.17, 0.19, 0.24, 1.0)
road_mesh.materials.append(mat)
road = bpy.data.objects.new("Road", road_mesh)
col.objects.link(road)

# 4. Control point empties, numbered in driving order.
for i in range(COUNT):
    e = bpy.data.objects.new("CP" if i == 0 else "CP.%03d" % i, None)
    e.location = point_at(total * i / COUNT)
    e.empty_display_type = 'SPHERE'
    e.empty_display_size = 1.0
    col.objects.link(e)

print("HFB Racing: made Road and %d CP empties. Export as .glb now." % COUNT)
