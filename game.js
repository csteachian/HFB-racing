(() => {
'use strict';
const T = THREE;
let LAPS = 3; // per course: a course can set `laps`
const VERSION = '2026.11.08-b'; // shown on the menu and compared between players in an online lobby
const FAR = 18; // metres beyond the road edge where the player counts as off course (and crawls)
const GRASS_MAX = 6; // seconds of continuous grass before the player counts as off course
const GATES = 14; // checkpoints around the lap; gate 0 is the start line
let N = 300, HALF = 10, GRID_STEP = 4;
const $ = (id) => document.getElementById(id);
const angDiff = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- renderer ---------- */
let renderer;
try {
  renderer = new T.WebGLRenderer({ canvas: $('view'), antialias: true });
} catch (e) {
  $('nogl').hidden = false; $('go').disabled = true; return;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const SKY = 0x20314f;
const scene = new T.Scene();
scene.background = new T.Color(SKY);
scene.fog = new T.Fog(SKY, 90, 330);
const camera = new T.PerspectiveCamera(68, 1, 0.5, 600);
const hemi = new T.HemisphereLight(0xcfe0ff, 0x2a4a3a, 0.95);
scene.add(hemi);
const sun = new T.DirectionalLight(0xffe2b0, 0.9);
sun.position.set(-80, 120, 60);
scene.add(sun);
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();
const ground = new T.Mesh(new T.PlaneGeometry(2400, 2400), new T.MeshLambertMaterial({ color: 0x2f6b4f }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; scene.add(ground);

/* ---------- track (rebuildable) ---------- */
/* Each ctrl point is [x, z] or [x, z, height]. Keep heights at 0 or above (the ground sits at 0). */
const COURSES = [
  { id: 'kerb', name: 'Kerb Circuit', blurb: 'Long sweepers and an S-bend. A good place to learn drifting.',
    half: 10, sky: 0x20314f, ground: 0x2f6b4f, pads: [0.13, 0.37, 0.58, 0.78],
    ctrl: [[0,-100],[80,-90],[140,-30],[120,40],[60,70],[20,40],[-30,60],[-100,70],[-150,10],[-120,-60],[-60,-90]] },
  { id: 'harbour', name: 'Harbour Hairpins', blurb: 'Narrow and technical, with three hairpins and a chicane. Brake early.',
    half: 8.5, scale: 0.8, sky: 0x4d7a99, ground: 0x6f7f5e, pads: [0.07, 0.47, 0.67, 0.83],
    ctrl: [[-70,-90],[10,-90],[90,-90],[111,-81],[120,-60],[111,-39],[90,-30],[60,-30],[25,-38],[-10,-22],[-45,-30],[-66,-21],[-75,0],[-66,21],[-45,30],[-10,30],[30,30],[70,30],[91,39],[100,60],[91,81],[70,90],[30,90],[-30,90],[-90,90],[-135,75],[-160,30],[-160,-30],[-140,-75],[-110,-90]] },
  { id: 'ridge', name: 'Ridgeback', blurb: 'Fast and hilly, with a long climb and a drop to the finish.',
    half: 11, scale: 0.85, sky: 0xd08a5b, ground: 0x6b5a3a, pads: [0.1, 0.34, 0.6, 0.85],
    ctrl: [[0,-140,0],[100,-135,3],[190,-85,9],[215,0,13],[170,80,8],[90,120,3],[10,85,0],[-60,110,4],[-140,95,10],[-205,20,12],[-185,-70,8],[-110,-130,3]] },
  { id: 'summit', name: 'Pine Summit', blurb: 'A long alpine climb through snowy pines, then a fast run back down.',
    half: 11, laps: 2, sky: 0x9fc3e0, ground: 0xe3ecf0, fog: [120,430], pads: [0.053, 0.205, 0.275, 0.426, 0.578, 0.654, 0.841, 0.907],
    scenery: [['snowpine',380], ['rock',120], ['cabin',16]],
    ctrl: [[-448,196,1.5],[-415,140,2.5],[-399,96,3.3],[-409,59,3.8],[-440,18,3.8],[-472,-34,3.8],[-487,-98,4],[-473,-170,5],[-430,-242,7.1],[-363,-310,10.4],[-279,-371,14.4],[-185,-422,18.7],[-83,-458,22.6],[18,-470,25.3],[107,-453,26.5],[173,-408,26],[212,-347,24],[232,-290,21.3],[254,-253,18.5],[299,-244,16.4],[378,-252,15.5],[478,-261,16],[570,-250,17.7],[625,-211,20.2],[623,-150,22.7],[571,-82,24.7],[495,-20,25.8],[427,31,26],[388,78,25.3],[376,135,24.1],[369,208,22.7],[341,292,21.4],[279,370,20.3],[186,424,19.3],[81,443,18.1],[-16,432,16.5],[-96,406,14.4],[-163,385,11.6],[-230,378,8.6],[-305,382,5.5],[-382,381,3],[-446,363,1.2],[-480,320,0.5],[-477,260,0.7]] },
  { id: 'canyon', name: 'Canyon Rush', blurb: 'Red mesas and cacti on a sweeping desert road with long blind crests.',
    half: 12, laps: 2, sky: 0xe3a56a, ground: 0xc78a4d, fog: [140,480], pads: [0.082, 0.237, 0.275, 0.446, 0.544, 0.702, 0.788, 0.94],
    scenery: [['cactus',260], ['sandrock',200], ['mesa',28]],
    ctrl: [[67,547,11.8],[19,591,11.2],[-34,586,10.4],[-82,530,9.4],[-118,449,8.3],[-147,376,7.4],[-179,329,6.8],[-225,298,6.6],[-281,265,7],[-336,213,7.8],[-381,139,8.8],[-414,51,9.7],[-434,-46,10.2],[-440,-146,10],[-426,-240,9.1],[-386,-313,7.4],[-323,-352,5.4],[-253,-359,3.3],[-195,-356,1.6],[-158,-376,0.6],[-135,-434,0.5],[-111,-519,1.3],[-72,-592,2.9],[-20,-617,4.9],[34,-586,7.1],[82,-525,9],[124,-470,10.5],[172,-442,11.5],[233,-426,12.1],[296,-392,12.4],[340,-320,12.6],[347,-219,12.9],[320,-117,13.2],[288,-35,13.6],[281,30,14],[313,104,14.4],[367,207,14.5],[406,329,14.4],[401,437,14.1],[349,494,13.7],[270,494,13.3],[196,467,12.9],[143,458,12.5],[105,490,12.2]] },
  { id: 'harvest', name: 'Harvest Valley', blurb: 'Rolling farmland with barns and hay bales. Gentle hills and fast flowing bends.',
    half: 11, laps: 2, sky: 0x8fc0e8, ground: 0x86a84a, pads: [0.03, 0.215, 0.275, 0.426, 0.604, 0.684, 0.775, 0.959],
    scenery: [['hay',140], ['barn',14], ['pine',110], ['rock',20]],
    ctrl: [[298,-125,7.7],[361,-110,8],[431,-84,8.4],[489,-42,8.8],[520,15,9.2],[518,79,9.5],[484,143,9.5],[428,199,9.2],[361,246,8.3],[290,286,7.1],[220,322,5.5],[150,355,3.7],[77,383,2.1],[2,402,1],[-71,407,0.5],[-139,395,0.7],[-195,368,1.6],[-238,332,2.9],[-272,295,4.4],[-303,262,5.6],[-339,234,6.4],[-383,209,6.5],[-430,181,6.1],[-471,144,5.2],[-496,97,4.2],[-496,43,3.3],[-470,-13,2.7],[-425,-65,2.6],[-371,-109,2.9],[-321,-149,3.7],[-280,-191,4.6],[-245,-242,5.5],[-209,-306,6.1],[-159,-378,6.5],[-90,-447,6.6],[-3,-498,6.4],[91,-518,6.2],[175,-499,6],[235,-444,5.9],[263,-367,6],[263,-286,6.3],[250,-216,6.6],[243,-168,7],[257,-140,7.3]] },
  { id: 'coast', name: 'Coast Highway', blurb: 'Palm trees, white villas and lighthouses along a long sunny coast road.',
    half: 12, laps: 2, sky: 0x7fc4e8, ground: 0xdcc88e, fog: [140,480], pads: [0.07, 0.237, 0.278, 0.422, 0.603, 0.699, 0.852, 0.914],
    scenery: [['palm',260], ['house',36], ['sandrock',60], ['tower',5]],
    ctrl: [[-420,463,7.8],[-401,366,6.7],[-357,267,5.1],[-314,188,3.5],[-295,136,2],[-310,101,0.9],[-352,65,0.5],[-401,14,0.9],[-437,-58,1.9],[-444,-146,3.4],[-421,-242,5],[-371,-336,6.3],[-301,-422,7],[-218,-494,7.2],[-126,-543,6.7],[-35,-562,5.9],[47,-546,5.1],[110,-499,4.4],[153,-438,4.1],[184,-387,4.3],[220,-363,4.8],[277,-370,5.6],[355,-391,6.4],[442,-403,7],[512,-383,7.4],[540,-324,7.6],[518,-239,7.7],[459,-149,7.9],[391,-72,8.4],[343,-12,9.1],[328,43,10.1],[338,112,11],[350,202,11.9],[338,307,12.4],[289,406,12.5],[210,477,12.1],[119,510,11.4],[32,513,10.6],[-44,507,9.8],[-113,512,9.3],[-186,533,9],[-266,559,8.9],[-343,566,8.8],[-400,535,8.5]] },
  { id: 'moon', name: 'Moonlit Ridge', blurb: 'A night run over a pine ridge. Street lamps mark the road; watch the crests.',
    half: 10, laps: 2, sky: 0x0a1226, ground: 0x1d3a33, fog: [50,270], dim: true, pads: [0.042, 0.198, 0.276, 0.409, 0.555, 0.662, 0.836, 0.905],
    scenery: [['darkpine',320], ['rock',100], ['lamp',0]],
    ctrl: [[-130,403,2.9],[-164,374,1],[-218,383,0.5],[-296,410,1.5],[-378,414,3.9],[-429,367,6.9],[-425,274,10],[-372,168,12.7],[-303,80,14.4],[-257,21,15],[-256,-29,14.6],[-289,-93,13.7],[-325,-182,12.5],[-335,-284,11.5],[-308,-375,11],[-253,-439,10.9],[-186,-474,11.2],[-119,-487,11.6],[-57,-483,12.1],[-1,-461,12.6],[45,-419,13],[78,-368,13.5],[106,-328,14.3],[139,-318,15.5],[191,-335,17.2],[259,-359,19],[330,-361,20.7],[382,-326,22],[403,-260,22.5],[400,-180,22.1],[392,-104,20.9],[392,-32,19.1],[399,45,17.2],[395,127,15.7],[363,204,14.9],[304,258,14.8],[233,283,15.4],[171,296,16.2],[127,322,16.7],[92,375,16.4],[52,444,15.1],[1,494,12.6],[-53,498,9.4],[-97,457,6]] },
];
let pts = [], tan = [], nrm = [], pads = [], group = null, trackLen = 0;
const headingOf = (t) => Math.atan2(t.x, t.z);
const C = (h) => new T.Color(h);

function newGroup() {
  if (group) { scene.remove(group); group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  group = new T.Group(); scene.add(group); pads = []; clearChaos();
}
function setCenterline(points) {
  const curve = new T.CatmullRomCurve3(points, true, 'catmullrom', 0.5), L = curve.getLength();
  trackLen = L; N = clamp(Math.round(L / 2.5), 120, 1000);
  pts = curve.getSpacedPoints(N).slice(0, N);
  GRID_STEP = Math.max(2, Math.round(9 / (L / N)));
  tan = pts.map((p, i) => pts[(i + 1) % N].clone().sub(pts[(i - 1 + N) % N]).setY(0).normalize());
  nrm = tan.map((t) => new T.Vector3(t.z, 0, -t.x)); // left of travel
}
function strip(a, b, y, colorFn) {
  const pos = [], col = [], idx = [];
  for (let i = 0; i < N; i++) {
    const c = colorFn(i); if (!c) continue;
    const j = (i + 1) % N, base = pos.length / 3;
    for (const [k, o] of [[i, a], [i, b], [j, a], [j, b]]) {
      pos.push(pts[k].x + nrm[k].x * o, y + pts[k].y, pts[k].z + nrm[k].z * o);
      col.push(c.r, c.g, c.b);
    }
    idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  group.add(new T.Mesh(g, new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide })));
}
let padTexture = null;
function padTex() {
  if (padTexture) return padTexture;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); x.fillStyle = '#ffb627'; x.fillRect(0, 0, 64, 64);
  x.strokeStyle = '#7a4a00'; x.lineWidth = 7;
  for (const y of [14, 34, 54]) { x.beginPath(); x.moveTo(10, y + 8); x.lineTo(32, y - 8); x.lineTo(54, y + 8); x.stroke(); }
  return (padTexture = new T.CanvasTexture(c));
}
function addPad(p, heading) {
  const m = new T.Mesh(new T.PlaneGeometry(5, 7), new T.MeshBasicMaterial({ map: padTex() }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = heading + Math.PI; // chevrons point along travel
  m.position.set(p.x, p.y + 0.08, p.z); group.add(m); pads.push(p);
}
function addStartLine() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 8;
  const x = c.getContext('2d');
  for (let i = 0; i < 32; i++) for (let j = 0; j < 8; j++) { x.fillStyle = (i + j) % 2 ? '#f1eee6' : '#161a24'; x.fillRect(i, j, 1, 1); }
  const tex = new T.CanvasTexture(c); tex.magFilter = T.NearestFilter;
  const h = headingOf(tan[0]), p0 = pts[0];
  const line = new T.Mesh(new T.PlaneGeometry(HALF * 2, 3), new T.MeshBasicMaterial({ map: tex }));
  line.rotation.order = 'YXZ'; line.rotation.set(-Math.PI / 2, h, 0);
  line.position.set(p0.x, p0.y + 0.09, p0.z); group.add(line);
  const m = new T.MeshLambertMaterial({ color: 0x3a4256 });
  for (const s of [-1, 1]) {
    const pole = new T.Mesh(new T.BoxGeometry(0.8, 8, 0.8), m);
    pole.position.set(p0.x + nrm[0].x * s * (HALF + 2), p0.y + 4, p0.z + nrm[0].z * s * (HALF + 2)); group.add(pole);
  }
  const beam = new T.Mesh(new T.BoxGeometry(HALF * 2 + 4.8, 1.4, 0.8), new T.MeshLambertMaterial({ color: 0xffb627 }));
  beam.rotation.y = h; beam.position.set(p0.x, p0.y + 8, p0.z); group.add(beam);
}
function addTrees() {
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const cones = new T.InstancedMesh(new T.ConeGeometry(3, 8, 6).translate(0, 5.5, 0), new T.MeshLambertMaterial({ color: 0x1f5a3f }), 220);
  const trunks = new T.InstancedMesh(new T.CylinderGeometry(0.5, 0.6, 2).translate(0, 1, 0), new T.MeshLambertMaterial({ color: 0x5a3b26 }), 220);
  const d = new T.Object3D(), yMax = Math.max(0, ...pts.map((p) => p.y)); let n = 0;
  while (n < 220) {
    const x = (rnd() - 0.5) * 700, z = (rnd() - 0.5) * 600;
    let near = 1e9; for (const p of pts) near = Math.min(near, Math.hypot(p.x - x, p.z - z));
    if (near < HALF + 9 + yMax * 1.3) continue;
    const k = 0.8 + rnd() * 0.7; d.position.set(x, 0, z); d.scale.set(k, k, k); d.updateMatrix();
    cones.setMatrixAt(n, d.matrix); trunks.setMatrixAt(n, d.matrix); n++;
  }
  group.add(cones, trunks);
}
function applyTheme(c) {
  scene.background.set(c.sky); scene.fog.color.set(c.sky); ground.material.color.set(c.ground);
  scene.fog.near = c.fog ? c.fog[0] : 90; scene.fog.far = c.fog ? c.fog[1] : 330;
  hemi.intensity = c.dim ? 0.5 : 0.95; sun.intensity = c.dim ? 0.35 : 0.9; // a "dim" course is lit like a moonlit night
}
let bankRun = 1.2; // horizontal metres of embankment per metre of height (matches bank() below); imported tracks have none
function bank(side, color) { // embankment from the outer kerb down to the ground, so raised roads do not float
  const o = side * (HALF + 1.4), pos = [], idx = [];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, base = pos.length / 3;
    for (const k of [i, j]) {
      const y = pts[k].y, o2 = o + side * (y * bankRun + 0.01);
      pos.push(pts[k].x + nrm[k].x * o, y + 0.04, pts[k].z + nrm[k].z * o, pts[k].x + nrm[k].x * o2, -0.02, pts[k].z + nrm[k].z * o2);
    }
    idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  group.add(new T.Mesh(g, new T.MeshLambertMaterial({ color, side: T.DoubleSide })));
}

/* ---------- scenery: instanced roadside objects, chosen per course ---------- */
// Each kind is a list of parts [geometry, colour, flat?] drawn many times. `min`/`max` are metres beyond the road edge.
const SCN = {
  pine: { min: 8, max: 150, scale: [0.8, 1.5], parts: () => [[new T.ConeGeometry(3, 8, 6).translate(0, 5.5, 0), 0x1f5a3f], [new T.CylinderGeometry(0.5, 0.6, 2).translate(0, 1, 0), 0x5a3b26]] },
  darkpine: { min: 8, max: 150, scale: [0.9, 1.7], parts: () => [[new T.ConeGeometry(3, 8, 6).translate(0, 5.5, 0), 0x12372c], [new T.CylinderGeometry(0.5, 0.6, 2).translate(0, 1, 0), 0x2e2018]] },
  snowpine: { min: 8, max: 160, scale: [0.9, 1.7], parts: () => [[new T.ConeGeometry(3, 8, 6).translate(0, 5.5, 0), 0x27604a], [new T.ConeGeometry(2, 3.4, 6).translate(0, 9.6, 0), 0xf2f6f8], [new T.CylinderGeometry(0.5, 0.6, 2).translate(0, 1, 0), 0x5a3b26]] },
  rock: { min: 6, max: 140, scale: [0.8, 3], parts: () => [[new T.DodecahedronGeometry(1.6).scale(1.25, 0.8, 1).translate(0, 0.6, 0), 0x7d8088]] },
  sandrock: { min: 6, max: 160, scale: [0.9, 3.4], parts: () => [[new T.DodecahedronGeometry(1.6).scale(1.25, 0.85, 1).translate(0, 0.6, 0), 0xa8603a]] },
  mesa: { min: 55, max: 380, scale: [0.9, 2.4], parts: () => [[new T.CylinderGeometry(16, 21, 26, 7).translate(0, 13, 0), 0xb5683c], [new T.CylinderGeometry(16.2, 16.6, 3, 7).translate(0, 21, 0), 0xd08a52]] },
  cactus: { min: 7, max: 120, scale: [0.8, 1.6], parts: () => [[new T.CylinderGeometry(0.55, 0.65, 5).translate(0, 2.5, 0), 0x3f8f4f], [new T.CylinderGeometry(0.35, 0.35, 2).rotateZ(Math.PI / 2).translate(1.1, 3, 0), 0x3f8f4f], [new T.CylinderGeometry(0.35, 0.35, 1.8).translate(2, 3.8, 0), 0x3f8f4f]] },
  cabin: { min: 18, max: 120, scale: [0.9, 1.4], parts: () => [[new T.BoxGeometry(6, 3.5, 5).translate(0, 1.75, 0), 0x8a5a3a], [new T.ConeGeometry(5, 2.6, 4).rotateY(Math.PI / 4).translate(0, 4.8, 0), 0x3b2a22]] },
  barn: { min: 22, max: 130, scale: [0.9, 1.3], parts: () => [[new T.BoxGeometry(8, 5, 12).translate(0, 2.5, 0), 0xa63d2f], [new T.ConeGeometry(7.4, 3.2, 4).rotateY(Math.PI / 4).scale(1, 1, 1.5).translate(0, 6.6, 0), 0x6b6f77]] },
  hay: { min: 8, max: 110, scale: [0.9, 1.5], parts: () => [[new T.CylinderGeometry(1.3, 1.3, 1.8, 10).rotateZ(Math.PI / 2).translate(0, 1.3, 0), 0xd9b64a]] },
  palm: { min: 7, max: 110, scale: [0.9, 1.5], parts: () => [[new T.CylinderGeometry(0.3, 0.5, 8, 6).translate(0, 4, 0), 0x8b6b3d], [new T.SphereGeometry(2.8, 7, 4).scale(1, 0.35, 1).translate(0, 8.4, 0), 0x2f8f4a]] },
  house: { min: 16, max: 110, scale: [0.9, 1.4], parts: () => [[new T.BoxGeometry(6, 3.6, 5).translate(0, 1.8, 0), 0xf2efe6], [new T.ConeGeometry(5, 2.2, 4).rotateY(Math.PI / 4).translate(0, 4.7, 0), 0x3a7ca5]] },
  tower: { min: 25, max: 90, scale: [1, 1.5], parts: () => [[new T.CylinderGeometry(2, 3, 22, 10).translate(0, 11, 0), 0xf1eee6], [new T.CylinderGeometry(2.3, 2.6, 4, 10).translate(0, 15, 0), 0xd2402f], [new T.CylinderGeometry(2.8, 2.8, 1.2, 10).translate(0, 22.6, 0), 0x2c303b], [new T.SphereGeometry(1.6, 8, 6).translate(0, 24, 0), 0xffe9a0, true]] },
  lamp: { along: 38, parts: () => [[new T.CylinderGeometry(0.15, 0.2, 7).translate(0, 3.5, 0), 0x2c303b], [new T.SphereGeometry(0.55, 8, 6).translate(0, 7.2, 0), 0xffe9a0, true]] },
};
function addScenery(c) {
  const spacing = trackLen / N, d = new T.Object3D();
  c.scenery.forEach(([kind, count], ki) => {
    const def = SCN[kind]; if (!def) return;
    let seed = 1000 + ki * 7919 + Math.round(trackLen); const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pos = [];
    if (def.along) {
      const step = Math.max(3, Math.round(def.along / spacing));
      for (let i = 0, k = 0; i < N; i += step, k++) { const o = (k % 2 ? 1 : -1) * (HALF + 3.4); pos.push([pts[i].x + nrm[i].x * o, pts[i].y, pts[i].z + nrm[i].z * o, 1, headingOf(tan[i])]); }
    } else {
      for (let tries = 0; pos.length < count && tries < count * 60; tries++) {
        const i = Math.floor(rnd() * N), o = (rnd() < 0.5 ? -1 : 1) * (HALF + 1.4 + def.min + rnd() * (def.max - def.min) + pts[i].y * 1.3);
        const x = pts[i].x + nrm[i].x * o, z = pts[i].z + nrm[i].z * o;
        if (Math.abs(x) > 1100 || Math.abs(z) > 1100) continue;
        let ok = true; // keep clear of every stretch of road and its embankment, not just the one we measured from
        for (let q = 0; q < N; q += 2) if (Math.hypot(pts[q].x - x, pts[q].z - z) < HALF + 3 + def.min * 0.5 + pts[q].y * 1.3) { ok = false; break; }
        if (ok) pos.push([x, 0, z, def.scale[0] + rnd() * (def.scale[1] - def.scale[0]), rnd() * 6.283]);
      }
    }
    if (!pos.length) return;
    for (const [geo, col, flat] of def.parts()) {
      const m = new T.InstancedMesh(geo, flat ? new T.MeshBasicMaterial({ color: col }) : new T.MeshLambertMaterial({ color: col }), pos.length);
      pos.forEach(([x, y, z, k, ry], n) => { d.position.set(x, y, z); d.rotation.set(0, ry, 0); d.scale.set(k, k, k); d.updateMatrix(); m.setMatrixAt(n, d.matrix); });
      group.add(m);
    }
  });
}
function buildCourse(c) {
  bankRun = 1.2;
  if (c.gltf) { buildImported(c.gltf, c); return; }
  const sc = c.scale || 1; loadedCourse = c.id; LAPS = c.laps || 3;
  setCenterline(c.ctrl.map(([x, z, y]) => new T.Vector3(x * sc, (y || 0) * sc, z * sc))); HALF = c.half;
  pts.forEach((p) => { p.y = Math.max(0, p.y); }); // the spline can undershoot 0 slightly; keep the road above the ground
  applyTheme(c); newGroup();
  const aA = C(0x2c303b), aB = C(0x303644), red = C(0xe04a3a), white = C(0xf1eee6), bankColor = C(c.ground).multiplyScalar(0.8);
  strip(-HALF, HALF, 0.03, (i) => (i % 2 ? aA : aB));
  strip(HALF, HALF + 1.4, 0.05, (i) => (Math.floor(i / 3) % 2 ? red : white));
  strip(-HALF - 1.4, -HALF, 0.05, (i) => (Math.floor(i / 3) % 2 ? red : white));
  strip(-0.25, 0.25, 0.06, (i) => (i % 6 < 3 ? white : null));
  bank(1, bankColor); bank(-1, bankColor);
  c.pads.forEach((f, k) => {
    const i = Math.round(N * f) % N;
    addPad(pts[i].clone().addScaledVector(nrm[i], (k % 2 ? 0.3 : -0.3) * HALF), headingOf(tan[i]));
  });
  addStartLine(); if (c.scenery) addScenery(c); else addTrees();
}
const nearestIdx = (x, z) => { let b = 1e12, bi = 0; pts.forEach((p, i) => { const q = (p.x - x) ** 2 + (p.z - z) ** 2; if (q < b) { b = q; bi = i; } }); return bi; };

/* Imported course: a mesh named Road*, empties CP, CP.001, CP.002 ... in driving order, optional empties Pad*. */
const CP_RE = /^cp[_\-\s]?(\d+)?$/i;
function buildImported(gltf, meta) {
  bankRun = 0.25; // a hand-made road has no built-in embankment: the ground is reached quickly beside it // meta: a course loaded from courses/ (theme, width, id); absent for a hand-imported file
  const root = gltf.scene; root.updateMatrixWorld(true);
  const cps = [], padPos = [], drop = [];
  root.traverse((o) => {
    const nm = o.name || ''; let m;
    if (o.isLight || o.isCamera) drop.push(o);
    else if (!o.isMesh && (m = CP_RE.exec(nm))) cps.push({ i: m[1] ? parseInt(m[1], 10) : 0, p: o.getWorldPosition(new T.Vector3()) });
    else if (!o.isMesh && /^pad/i.test(nm)) padPos.push(o.getWorldPosition(new T.Vector3()));
  });
  if (cps.length < 4) throw new Error(`Found ${cps.length} empties named CP. Add at least 4, in driving order (CP, CP.001, CP.002 ...).`);
  cps.sort((a, b) => a.i - b.i);
  setCenterline(cps.map((c) => c.p));
  const dists = [], v = new T.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || !/road|track|asphalt|surface/i.test(o.name) || !o.geometry.attributes.position) return;
    const a = o.geometry.attributes.position, step = Math.max(1, Math.floor(a.count / 1500));
    for (let k = 0; k < a.count; k += step) {
      v.fromBufferAttribute(a, k).applyMatrix4(o.matrixWorld);
      let best = 1e12; for (const p of pts) best = Math.min(best, (p.x - v.x) ** 2 + (p.z - v.z) ** 2);
      dists.push(Math.sqrt(best));
    }
  });
  const near = dists.filter((d) => d < 60).sort((a, b) => a - b);
  HALF = meta && meta.half ? clamp(meta.half, 3, 40) : near.length ? clamp(near[Math.floor(near.length * 0.9)], 3, 40) : 10;
  drop.forEach((o) => o.parent && o.parent.remove(o));
  applyTheme(meta || COURSES[0]); newGroup(); group.add(root); loadedCourse = meta ? meta.id : 'imported'; LAPS = meta && meta.laps ? meta.laps : 3;
  padPos.forEach((p) => addPad(p, headingOf(tan[nearestIdx(p.x, p.z)])));
  addStartLine();
  return { points: cps.length, half: HALF, assumed: !near.length };
}

/* ---------- karts ---------- */
const G = {
  body: new T.BoxGeometry(1.8, 0.6, 3), nose: new T.BoxGeometry(1.2, 0.4, 1), head: new T.SphereGeometry(0.46, 12, 8),
  wing: new T.BoxGeometry(2, 0.1, 0.5), wheel: new T.CylinderGeometry(0.45, 0.45, 0.45, 12).rotateZ(Math.PI / 2),
};
const tyre = new T.MeshLambertMaterial({ color: 0x14171f }), skin = new T.MeshLambertMaterial({ color: 0xf2d3b0 });
function makeKart(color) {
  const mat = new T.MeshLambertMaterial({ color }), g = new T.Group();
  const add = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  add(G.body, mat, 0, 0.65, 0); add(G.nose, mat, 0, 0.55, 1.7); add(G.head, skin, 0, 1.45, -0.2);
  add(G.wing, mat, 0, 1.25, -1.5);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(G.wheel, tyre, sx * 1.05, 0.45, sz * 1.0);
  g.userData.mat = mat; scene.add(g); return g;
}

/* ---------- racers ---------- */
const NAMES = ['You', 'Pixel', 'Dash', 'Murray', 'Nova', 'Rook'];
const COLORS = [0xffb627, 0xe04a3a, 0x3aa0e0, 0x7bd35a, 0xc86fe0, 0xe8ecf2];
const racers = NAMES.map((name, k) => ({
  name, kind: k ? 'bot' : 'local', color: COLORS[k], label: null, botIdx: -1, gone: false, mesh: makeKart(COLORS[k]), base: 0.88 + (k * 0.017) % 0.09, lane: ((k * 37) % 9) - 4,
}));
const player = racers[0];
const online = { on: false, room: null, code: '', me: '', host: '', hostPeer: null, byLabel: new Map(), cfg: null, snap: null, seenN: 0, cacheBots: null, wasHost: false, spectating: false, sentAt: -1e9 };
let roomNS = null, loadedCourse = 'kerb', tNow = 0, boardT = 0;
const SLOT = [4, 0, 1, 2, 3, 5]; // player starts on row 3, left
function resetRacers() {
  const side = clamp(HALF * 0.3, 1.5, 3);
  racers.forEach((r, k) => {
    const slot = (online.on && r.e !== undefined) ? r.e : SLOT[k], row = slot >> 1, i = N - GRID_STEP * (row + 1), s = slot % 2 ? side : -side;
    r.x = pts[i].x + nrm[i].x * s; r.z = pts[i].z + nrm[i].z * s; r.y = pts[i].y; r.h = headingOf(tan[i]);
    Object.assign(r, { ammo: ROCKETS, dead: 0, safe: 0, hitBy: '', fireCd: 4 + ((k * 7) % 5), laneNow: undefined, vy: 0, gate: GATES - 1, speed: 0, steer: 0, boost: 0, drift: 0, idx: i, dist: Math.abs(s), laps: -1, finished: false, finishT: 0, cc: r.base, drifting: false, gone: false, srcA: null, tAt: undefined });
  });
}
function locate(r) {
  let best = 1e12, bi = r.idx;
  // Progress can only move a few points per frame (a kart covers about one point per frame at top speed), so it cannot
  // run ahead of a kart that has cut across the infield; checkLost() then notices the gap.
  for (let d = -3; d <= 3; d++) {
    const k = (r.idx + d + N) % N, dx = r.x - pts[k].x, dz = r.z - pts[k].z, q = dx * dx + dz * dz;
    if (q < best) { best = q; bi = k; }
  }
  const old = r.idx; r.idx = bi; r.dist = Math.sqrt(best);
  if (r === player) { // the player's laps are counted by checkpoints (see checkLost); only a backwards crossing is handled here
    if (old < N * 0.25 && bi > N * 0.75) { r.laps--; r.gate = GATES - 1; }
    return;
  }
  if (old > N * 0.75 && bi < N * 0.25) {
    r.laps++;
    if (r.laps >= LAPS && !r.finished) { r.finished = true; r.finishT = raceT; }
  } else if (old < N * 0.25 && bi > N * 0.75) r.laps--;
}
const progress = (r) => r.laps * N + r.idx;
const ranking = () => racers.slice().sort((a, b) => (b.finished - a.finished) || (a.finished ? a.finishT - b.finishT : progress(b) - progress(a)));

// How quickly speed falls back to normal after a boost ends: seconds are roughly ln(6)/rate. Lower rate = longer, gentler fade.
const FALLOFF_BASE = 5, FALLOFF_RATE = 1.1;
function step(r, inp, dt) {
  if (r.finished) { inp = { steer: 0, gas: false, brake: false, drift: false }; r.speed = Math.max(0, r.speed - 26 * dt); r.boost = 0; r.drift = 0; }
  const off = r.dist > HALF + 1.2;
  let vmax = 40 * (r.kind === 'bot' ? r.cc : 1);
  const boosting = r.boost > 0;
  if (boosting) { vmax = 58; r.boost -= dt; }
  else if (off) vmax *= 0.5;
  if (r.dist > HALF + FAR) vmax = Math.min(vmax, 9); // far from the road you are crawling; see checkLost()
  if (inp.gas) { if (r.speed < vmax) r.speed = Math.min(vmax, r.speed + (boosting ? 70 : 26) * dt); } // no acceleration above the limit, so a boost can fade out smoothly
  else if (inp.brake) r.speed -= (r.speed > 0 ? 55 : 20) * dt;
  else r.speed -= Math.sign(r.speed) * Math.min(Math.abs(r.speed), 10 * dt);
  if (r.speed > vmax) { // boost fade-out on the road is gradual; grass still bites quickly
    const over = r.speed - vmax;
    r.speed -= Math.min(over, (off ? 45 : FALLOFF_BASE + over * FALLOFF_RATE) * dt);
  }
  r.speed = Math.max(r.speed, -10);
  r.steer += (inp.steer - r.steer) * Math.min(1, 9 * dt);
  const drifting = inp.drift && r.speed > 16 && Math.abs(r.steer) > 0.25;
  const rate = (drifting ? 2.8 : 2.0) * (1 - 0.35 * Math.min(1, Math.abs(r.speed) / 45));
  r.h += r.steer * rate * Math.min(1, Math.abs(r.speed) / 10) * (r.speed < 0 ? -1 : 1) * dt;
  if (drifting) r.drift += dt;
  else { if (r.drift > 0.9) r.boost = Math.max(r.boost, r.drift > 1.8 ? 1.3 : 0.8); r.drift = 0; }
  r.x += Math.sin(r.h) * r.speed * dt; r.z += Math.cos(r.h) * r.speed * dt;
  r.drifting = drifting;
}
function botInput(r, dt) {
  const k = (r.idx + Math.max(5, Math.round(18 / (trackLen / N)))) % N, lane = chaosOn ? botLane(r, dt) : clamp(r.lane, -HALF * 0.6, HALF * 0.6);
  const tx = pts[k].x + nrm[k].x * lane, tz = pts[k].z + nrm[k].z * lane;
  const diff = angDiff(Math.atan2(tx - r.x, tz - r.z) - r.h);
  if (chaosOn) { // wedged against something: back out for a moment, then try again
    if (r.recov > 0) { r.recov -= dt; return { steer: clamp(-diff * 2.2, -1, 1), gas: false, brake: true, drift: false }; }
    r.stuck = Math.abs(r.speed) < 2 && raceT > 3 && !r.finished ? (r.stuck || 0) + dt : 0;
    if (r.stuck > 1.3) { r.recov = 1.0; r.stuck = 0; }
  }
  r.cc = r.base + clamp((progress(player) - progress(r)) * 0.0007, -0.05, 0.05); // gentle catch-up
  return { steer: clamp(diff * 2.2, -1, 1), gas: Math.abs(diff) < 0.55 || r.speed < 18, brake: Math.abs(diff) > 0.85 && r.speed > 22, drift: false };
}

/* ---------- input ---------- */
const keys = {}, touch = {};
const BLOCK = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
window.addEventListener('keydown', (e) => { if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return; keys[e.code] = true; if (e.code === 'KeyM' && !e.repeat) toggleSound(); if (e.code === 'KeyR' && !e.repeat) respawnKey(); if (BLOCK.includes(e.code)) e.preventDefault(); });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
document.querySelectorAll('.tbtn').forEach((b) => {
  const k = b.dataset.k, set = (v) => (e) => { e.preventDefault(); touch[k] = v; b.classList.toggle('on', v); };
  b.addEventListener('pointerdown', (e) => { b.setPointerCapture(e.pointerId); set(true)(e); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, set(false));
  b.addEventListener('contextmenu', (e) => e.preventDefault());
});
const readInput = () => ({
  steer: ((keys.ArrowLeft || keys.KeyA || touch.left) ? 1 : 0) - ((keys.ArrowRight || keys.KeyD || touch.right) ? 1 : 0),
  gas: !!(keys.ArrowUp || keys.KeyW || touch.gas), brake: !!(keys.ArrowDown || keys.KeyS || touch.brake),
  drift: !!(keys.Space || keys.ShiftLeft || keys.ShiftRight || touch.drift),
});

/* ---------- race flow ---------- */
let state = 'menu', cd = 0, goT = 0, raceT = 0, lapStart = 0, best = Infinity, camH = 0, orbit = 0, endTimer = 0;
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
function lapCrossed() {
  if (player.laps === 0) { lapStart = raceT; return; }
  if (player.laps > 0) { best = Math.min(best, raceT - lapStart); lapStart = raceT; $('best').textContent = fmt(best); if (player.laps < LAPS) playChime(); }
}
function playerFinished() { endTimer = 1.4; }
function renderBoard() {
  const board = $('board'); board.textContent = '';
  ranking().forEach((r, i) => {
    const li = document.createElement('li'); if (r === player) li.className = 'me';
    for (const [cls, txt] of [['', String(i + 1)], ['', r.name], ['t', r.finished ? fmt(r.finishT) : (r.gone ? 'left' : 'racing')]]) {
      const sp = document.createElement('span'); if (cls) sp.className = cls; sp.textContent = txt; li.appendChild(sp);
    }
    board.appendChild(li);
  });
}
function resultButtons() {
  const on = online.on, host = isHost();
  $('again').hidden = on && !host; $('tolobby').hidden = !(on && host); $('waitmsg').hidden = !(on && !host);
  $('tomenu').textContent = on ? 'Leave room' : 'Change course';
}
function showResults() {
  renderBoard(); resultButtons(); boardT = 0.5;
  $('hud').hidden = true; $('results').hidden = false; state = 'done';
}
let lostT = 0, missed = false, grassT = 0, lostWhy = 'MISSED CHECKPOINT'; // lostT: seconds the player has been off course or past a missed checkpoint
const gateIdx = (k) => Math.round((k * N) / GATES) % N;
function respawnAtGate(p) { // back to the last checkpoint really passed, facing along the road, at a gentle speed
  const g = gateIdx(p.gate);
  Object.assign(p, { x: pts[g].x, z: pts[g].z, y: pts[g].y, vy: 0, h: headingOf(tan[g]), speed: 10, steer: 0, boost: 0, drift: 0, dist: 0, idx: g, drifting: false });
  camH = p.h; lostT = 0; missed = false; grassT = 0;
}
let lastRespawn = -1e9;
function respawnKey() { // the player's own Respawn key / button
  if (state !== 'race' || player.finished || player.dead > 0 || tNow - lastRespawn < 800) return;
  lastRespawn = tNow; respawnAtGate(player);
}
function checkLost(dt) {
  // The player must pass every checkpoint in order, within the road width plus a margin. A kart that cuts across the
  // infield, stays far from the road or drives on the grass for too long is warned, then put back on the last
  // checkpoint it really passed.
  const p = player;
  if (p.finished) { lostT = 0; missed = false; grassT = 0; return; }
  const next = (p.gate + 1) % GATES, gi = gateIdx(next), ahead = ((p.idx - gi + N + N / 2) % N) - N / 2; // signed gap along the track
  if (!missed && Math.abs(ahead) <= 3 && p.dist <= HALF + 10) {
    p.gate = next;
    if (next === 0) { // start line: a lap is done
      p.laps++; lapCrossed();
      if (p.laps >= LAPS && !p.finished) { p.finished = true; p.finishT = raceT; playerFinished(); if (racers.every((r) => r === p || !r.finished)) playFanfare(); else playChime(); }
    }
  } else if (!missed && ahead > 6 && ahead < N / GATES) missed = true;
  grassT = p.dist > HALF + 1.2 ? grassT + dt : 0;
  if (!(missed || p.dist > HALF + FAR || grassT > GRASS_MAX)) { lostT = 0; return; }
  lostWhy = missed ? 'MISSED CHECKPOINT' : 'OFF COURSE';
  lostT += dt;
  if (lostT >= 1.6) respawnAtGate(p);
}
function startRace() {
  resetRacers(); if (chaosOn) buildObstacles(chaosSeed); else clearChaos();
  if (online.on) markSeen(); else { outbox = {}; botFireLog = []; botBlastLog = []; botEvDirty = false; }
  fireHeld = false; shake = 0; $('ammochip').hidden = !chaosOn; $('firebtn').hidden = !chaosOn; $('fire').hidden = !chaosOn;
  lostT = 0; missed = false; grassT = 0; raceT = 0; lapStart = 0; best = Infinity; endTimer = 0; $('best').textContent = '--';
  camH = player.h; cd = 3; state = 'count';
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // so the keys drive the kart, not a focused menu control
  $('menu').hidden = true; $('results').hidden = true; $('lobby').hidden = true; $('join').hidden = true; $('hud').hidden = false;
}
$('go').addEventListener('click', () => { chaosOn = false; startRace(); });
$('gochaos').addEventListener('click', () => { chaosOn = true; chaosSeed = uid(); startRace(); });
$('again').addEventListener('click', () => { if (online.on) { hostStart('live'); return; } if (chaosOn) chaosSeed = uid(); startRace(); });
$('tomenu').addEventListener('click', () => { if (online.on) { leaveRoom(); return; } $('results').hidden = true; $('menu').hidden = false; state = 'menu'; resetRacers(); });
window.addEventListener('keydown', (e) => { if (e.code === 'Enter' && !online.on && !(e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) && (state === 'menu' || state === 'done')) { if (state === 'menu') chaosOn = false; else if (chaosOn) chaosSeed = uid(); startRace(); } });

/* ---------- course picker and import ---------- */
let current = 'kerb', imported = null; // imported = { name, data, info }
const UNREADABLE = 'Could not read that file. Export from Blender as glTF Binary (.glb).';
const fail = (msg) => { const m = $('coursemsg'); m.textContent = msg; m.style.color = 'var(--alert)'; };
function describe() {
  const m = $('coursemsg'); m.style.color = '';
  const tail = `${(trackLen / 1000).toFixed(2)} km, ${Math.round(HALF * 2)} m wide.`;
  m.textContent = current === 'imported' ? `${imported.info}. ${tail}` : `${COURSES.find((c) => c.id === current).blurb} ${tail}`;
}
function fillSelect(sel, withImported) {
  const groups = [['Built-in', COURSES.filter((c) => !c.gltf)], ['From the courses folder', COURSES.filter((c) => c.gltf)]];
  if (withImported && imported) groups.push(['Imported file', [{ id: 'imported', name: imported.name }]]);
  const used = groups.filter((g) => g[1].length); sel.textContent = '';
  for (const [label, list] of used) {
    let into = sel;
    if (used.length > 1) { into = document.createElement('optgroup'); into.label = label; sel.appendChild(into); }
    for (const it of list) { const o = document.createElement('option'); o.value = it.id; o.textContent = it.name; into.appendChild(o); }
  }
}
const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT');
function renderPicker() { const sel = $('picker'); fillSelect(sel, true); sel.value = current; }
$('picker').addEventListener('change', (e) => { selectCourse(e.target.value); if (e.target.blur) e.target.blur(); renderPicker(); });
function finishSelect(id) { current = id; resetRacers(); buildMap(); renderPicker(); describe(); }
function loadImported(data, done) {
  if (!THREE.GLTFLoader) { fail('The track loader did not load. Check your connection and reload.'); return; }
  try {
    new THREE.GLTFLoader().parse(data, '', (gltf) => {
      try { done(buildImported(gltf)); } catch (err) { fail(err.message); }
    }, () => fail(UNREADABLE));
  } catch (err) { fail(UNREADABLE); }
}
function selectCourse(id) {
  if (state !== 'menu') return;
  if (id === 'imported') { if (imported) loadImported(imported.data, () => finishSelect('imported')); return; }
  buildCourse(COURSES.find((c) => c.id === id)); finishSelect(id);
}
function importFile(file) {
  if (state !== 'menu' || !file) return;
  file.arrayBuffer().then((buf) => {
    const data = new Uint8Array(buf)[0] === 0x7b ? new TextDecoder().decode(buf) : buf; // .gltf JSON or .glb binary
    loadImported(data, (info) => {
      imported = { name: file.name.replace(/\.(glb|gltf)$/i, ''), data, info: `${info.points} control points${info.assumed ? ' (width assumed, no mesh named Road)' : ''}` };
      finishSelect('imported');
    });
  }).catch(() => fail('Could not open that file.'));
}
$('pick').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', (e) => { importFile(e.target.files[0]); e.target.value = ''; });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => { e.preventDefault(); importFile(e.dataTransfer.files[0]); });

/* ---------- courses from files: courses/courses.json lists .glb tracks that appear next to the built-in ones ---------- */
const hexNum = (v, dflt) => (typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v) ? parseInt(v.replace('#', ''), 16) : dflt);
function loadCourseFile(m) {
  return new Promise((resolve) => {
    const none = () => resolve(null);
    if (!m || typeof m.file !== 'string' || !/^[\w .-]+\.(glb|gltf)$/i.test(m.file) || m.file.includes('..')) return none();
    const id = String(m.id || m.file.replace(/\.(glb|gltf)$/i, '')).toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 24);
    if (!id || id === 'imported' || COURSES.some((c) => c.id === id)) return none();
    fetch('courses/' + encodeURIComponent(m.file)).then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error('missing')))).then((buf) => {
      const data = new Uint8Array(buf)[0] === 0x7b ? new TextDecoder().decode(buf) : buf;
      new THREE.GLTFLoader().parse(data, '', (gltf) => {
        let cps = 0; gltf.scene.traverse((o) => { if (!o.isMesh && CP_RE.test(o.name || '')) cps++; });
        if (cps < 4) { console.warn('courses/' + m.file + ': needs at least 4 empties named CP, CP.001 ...'); return none(); }
        resolve({ id, name: String(m.name || id).slice(0, 24), blurb: String(m.blurb || `${cps} control points.`).slice(0, 140),
          sky: hexNum(m.sky, COURSES[0].sky), ground: hexNum(m.ground, COURSES[0].ground), half: Number(m.half) > 0 ? Number(m.half) : 0, laps: Number.isInteger(m.laps) ? clamp(m.laps, 1, 9) : 3, gltf });
      }, () => { console.warn('courses/' + m.file + ' could not be read'); none(); });
    }).catch(() => { console.warn('courses/' + m.file + ' could not be loaded'); none(); });
  });
}
async function loadCourseFiles() {
  try {
    if (!window.fetch && typeof fetch === 'undefined') return;
    if (!THREE.GLTFLoader || !window.location || !/^https?:$/.test(window.location.protocol)) return; // needs a web server; skipped on file://
    const res = await fetch('courses/courses.json'); if (!res.ok) return;
    const list = await res.json(); if (!Array.isArray(list)) return;
    for (const c of await Promise.all(list.slice(0, 12).map(loadCourseFile))) if (c && !COURSES.some((x) => x.id === c.id)) COURSES.push(c);
    renderPicker(); refreshLobby();
  } catch (e) { /* no courses folder: built-in courses only */ }
}

/* ---------- minimap ---------- */
const mapEl = $('map'), mctx = mapEl.getContext('2d');
let mapBase = null, mapCss = 128, mapDpr = 1, mapK = 1, mapCX = 0, mapCZ = 0;
const mp = (x, z) => [(x - mapCX) * mapK + mapCss / 2, (z - mapCZ) * mapK + mapCss / 2];
const hexCss = (n) => '#' + n.toString(16).padStart(6, '0');
function buildMap() {
  mapCss = Math.round(clamp(window.innerWidth * 0.3, 104, 160)); mapDpr = Math.min(window.devicePixelRatio || 1, 2);
  mapEl.style.width = mapEl.style.height = mapCss + 'px';
  mapEl.width = mapEl.height = Math.round(mapCss * mapDpr);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  mapK = (mapCss - 24) / Math.max(x1 - x0, z1 - z0, 1); mapCX = (x0 + x1) / 2; mapCZ = (z0 + z1) / 2;
  const base = document.createElement('canvas'); base.width = base.height = mapEl.width;
  const c = base.getContext('2d'); c.scale(mapDpr, mapDpr); c.lineJoin = 'round'; c.lineCap = 'round';
  const trace = () => { c.beginPath(); pts.forEach((p, i) => { const [x, y] = mp(p.x, p.z); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath(); };
  const w = Math.max(4, HALF * 2 * mapK);
  trace(); c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = w + 3; c.stroke();
  trace(); c.strokeStyle = '#3a4256'; c.lineWidth = w; c.stroke();
  const [sx, sy] = mp(pts[0].x, pts[0].z), h = Math.max(3, HALF * mapK); // start line
  c.strokeStyle = '#f1eee6'; c.lineWidth = 2; c.beginPath();
  c.moveTo(sx + nrm[0].x * h, sy + nrm[0].z * h); c.lineTo(sx - nrm[0].x * h, sy - nrm[0].z * h); c.stroke();
  mapBase = base;
}
function drawMap() {
  if (!mapBase) return;
  mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.clearRect(0, 0, mapEl.width, mapEl.height); mctx.drawImage(mapBase, 0, 0);
  mctx.setTransform(mapDpr, 0, 0, mapDpr, 0, 0);
  for (let k = racers.length - 1; k >= 0; k--) { // player drawn last, on top
    const r = racers[k]; if (r.gone) continue; const [x, y] = mp(r.x, r.z);
    mctx.fillStyle = hexCss(r.color);
    if (r === player) {
      const fx = Math.sin(r.h), fy = Math.cos(r.h);
      mctx.beginPath(); mctx.moveTo(x + fx * 8, y + fy * 8);
      mctx.lineTo(x - fx * 5 - fy * 5, y - fy * 5 + fx * 5); mctx.lineTo(x - fx * 5 + fy * 5, y - fy * 5 - fx * 5); mctx.closePath();
      mctx.fill(); mctx.lineWidth = 1.5; mctx.strokeStyle = '#fff'; mctx.stroke();
    } else {
      mctx.beginPath(); mctx.arc(x, y, 3.4, 0, Math.PI * 2); mctx.fill(); mctx.lineWidth = 1; mctx.strokeStyle = 'rgba(0,0,0,0.65)'; mctx.stroke();
    }
  }
}
window.addEventListener('resize', () => { if (pts.length) buildMap(); });

/* ---------- online racing (room capability or PeerJS) ---------- */
const BOT_NAMES = ['Pixel', 'Dash', 'Murray', 'Nova', 'Rook'];
const f2 = (v) => Math.round(v * 100) / 100;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const viewersOf = (snap) => snap.filter((p) => p.kind === 'viewer');
const nickOf = (p) => (p && p.presence && typeof p.presence.nick === 'string' && p.presence.nick) || 'Racer';
const myNick = () => ($('nick').value || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 12) || 'Racer';
const isHost = () => online.on && online.host !== '' && online.host === online.me;
const builtIn = (id) => COURSES.find((c) => c.id === id);

function setColor(r, hex) { r.color = hex; r.mesh.userData.mat.color.set(hex); }
function setTag(r, text) {
  if (r.tagText === text) return; r.tagText = text;
  if (!r.tag) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const spr = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false }));
    spr.scale.set(7, 1.75, 1); spr.position.set(0, 3.3, 0); r.mesh.add(spr); r.tag = { spr, c };
  }
  const x = r.tag.c.getContext('2d'); x.clearRect(0, 0, 256, 64);
  x.font = '700 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 6; x.strokeStyle = 'rgba(10,14,26,0.85)'; x.strokeText(text, 128, 34); x.fillStyle = '#ffffff'; x.fillText(text, 128, 34);
  r.tag.spr.material.map.needsUpdate = true;
}
function setIdentity(r, e, name) {
  r.e = e; r.name = name; setColor(r, COLORS[e % COLORS.length]); setTag(r, name); r.tag.spr.visible = r !== player;
}
function assignSolo() {
  racers.forEach((r, k) => {
    Object.assign(r, { kind: k ? 'bot' : 'local', label: null, botIdx: -1, e: undefined, gone: false, name: NAMES[k] });
    setColor(r, COLORS[k]); setTag(r, NAMES[k]); r.tag.spr.visible = k > 0;
  });
}
function assignOnline(roster, host) {
  const hostBots = online.hostPeer && online.hostPeer.presence.bots;
  setIdentity(player, roster.indexOf(online.me), myNick());
  let i = 1;
  for (const l of roster) {
    if (l === online.me) continue;
    const r = racers[i++], p = online.byLabel.get(l);
    Object.assign(r, { kind: 'remote', label: l, botIdx: -1 }); setIdentity(r, roster.indexOf(l), nickOf(p));
    r.stale = (p && p.presence.s) || null;
  }
  for (let b = 0; i < racers.length; b++) {
    const r = racers[i++];
    Object.assign(r, { kind: host ? 'bot' : 'remote', label: null, botIdx: b }); setIdentity(r, roster.length + b, BOT_NAMES[b]);
    r.stale = (hostBots && hostBots[b]) || null;
  }
}

async function probeRoom() {
  // Two transports share one room interface: the Claude artifact `room` capability, or the PeerJS adapter in net.js.
  try { roomNS = window.claude && window.claude.use ? await window.claude.use('room') : null; } catch (e) { roomNS = null; }
  if (!roomNS && window.HFBNet && window.HFBNet.available()) roomNS = window.HFBNet;
  $('online').hidden = !roomNS;
}
const makeCode = () => { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 5; i++) c += A[Math.floor(Math.random() * A.length)]; return c; };
const savedNick = () => { try { return localStorage.getItem('hfbracing-nick') || ''; } catch (e) { return ''; } };
let joining = false;
async function joinRoom(raw, create) {
  const msg = (t, err) => { const m = $('joinmsg'); m.textContent = t; m.style.color = err ? 'var(--alert)' : ''; };
  if (joining || online.on) return;
  if (!roomNS) { msg('Online racing is not available in this view.', true); return; }
  const code = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 4) { msg('Enter the room code your host gave you.', true); return; }
  joining = true; msg('Connecting...');
  try {
    let room;
    const p2p = !!roomNS.p2p;
    try { room = p2p ? await roomNS.join(code, create) : await roomNS.join('kart-' + code.toLowerCase()); } catch (e) {
      const c = e && e.code;
      msg(c === 'nohost' ? 'No room with that code. Check it and try again.' : c === 'full' ? 'That room is full (6 players).' : c === 'taken' ? 'That code is already in use. Press Create room again.' : 'Could not connect to the room. Try again.', true); return;
    }
    const nick = myNick(); try { localStorage.setItem('hfbracing-nick', nick); } catch (e) { /* storage can be unavailable */ }
    const startCourse = builtIn(loadedCourse) ? loadedCourse : COURSES[0].id;
    room.presence(create ? { nick, ver: VERSION, creator: true, race: { n: 0, phase: 'lobby', course: startCourse, chaos: false, seed: 0, roster: [] } } : { nick, ver: VERSION });
    for (let i = 0; i < 30 && !room.peers().some((p) => p.isMe); i++) await wait(100);
    if (!create && !p2p) {
      await wait(1400); // others answer over a second or two
      const v = viewersOf(room.peers());
      if (!v.some((p) => p.presence && p.presence.race)) { await room.leave(); msg('No room with that code. Check it and try again.', true); return; }
      if (v.length > 6) { await room.leave(); msg('That room is full (6 players).', true); return; }
    }
    Object.assign(online, { on: true, room, code, me: '', host: '', hostPeer: null, cfg: null, snap: null, seenN: 0, cacheBots: null, wasHost: false, spectating: false, sentAt: -1e9 });
    room.onPeers(() => {}, () => leaveRoom('The host left or the connection to the room was lost.'));
    if (create && loadedCourse !== startCourse) { buildCourse(builtIn(startCourse)); buildMap(); }
    assignSolo(); resetRacers(); state = 'lobby'; $('join').hidden = true; $('menu').hidden = true; $('lobby').hidden = false; refreshLobby();
  } finally { joining = false; }
}
async function leaveRoom(note) {
  if (!online.on) return;
  const room = online.room;
  Object.assign(online, { on: false, room: null, snap: null, cfg: null, seenN: 0, wasHost: false, spectating: false, host: '', me: '' });
  try { if (room) await room.leave(); } catch (e) { /* already gone */ }
  assignSolo();
  const c = builtIn(current) || COURSES[0]; current = c.id; buildCourse(c); resetRacers(); buildMap(); renderPicker(); describe();
  for (const id of ['lobby', 'join', 'results', 'hud']) $(id).hidden = true;
  $('count').hidden = true; $('menu').hidden = false; state = 'menu';
  if (note) fail(note);
}

function electHost(snap) {
  const v = viewersOf(snap), creator = v.find((p) => p.presence.creator === true);
  if (creator) return creator.peer;
  const cfg = online.cfg, pool = cfg && cfg.phase === 'live' ? v.filter((p) => cfg.roster.includes(p.peer)) : v;
  return (pool.length ? pool : v).map((p) => p.peer).sort()[0] || '';
}
function takeOver() {
  if (online.cfg && !(online.hostPeer && online.hostPeer.presence.race)) online.room.presence({ race: online.cfg });
  for (const r of racers) {
    if (r.botIdx < 0 || r.kind !== 'remote') continue;
    const a = online.cacheBots && online.cacheBots[r.botIdx];
    r.kind = 'bot'; r.dist = 0; r.drift = 0;
    if (a) Object.assign(r, { x: a[0], z: a[1], y: a[2], h: a[3], speed: a[4], laps: a[5], idx: a[6], finishT: a[7], finished: a[7] > 0, boost: a[8] ? 0.5 : 0, steer: a[10] });
  }
}
function onSnap(snap) {
  online.byLabel = new Map(viewersOf(snap).map((p) => [p.peer, p]));
  const host = electHost(snap), hostPeer = online.byLabel.get(host) || null, mine = host === online.me;
  online.host = host; online.hostPeer = hostPeer;
  const live = hostPeer && hostPeer.presence.race;
  if (live) online.cfg = live;
  if (hostPeer && !mine && hostPeer.presence.bots) online.cacheBots = hostPeer.presence.bots;
  if (mine && !online.wasHost) takeOver();
  online.wasHost = mine;
  const cfg = online.cfg;
  if (cfg && cfg.n > online.seenN) {
    online.seenN = cfg.n;
    if (cfg.phase === 'live') { if (cfg.roster.includes(online.me)) startOnlineRace(cfg); else { online.spectating = true; state = 'lobby'; } }
    else goLobby();
  }
  if (state === 'lobby' && cfg && cfg.course && cfg.course !== loadedCourse && builtIn(cfg.course)) { buildCourse(builtIn(cfg.course)); resetRacers(); buildMap(); }
  refreshLobby();
}
function goLobby() {
  online.spectating = false; clearChaos(); assignSolo(); resetRacers(); state = 'lobby'; endTimer = 0;
  for (const id of ['results', 'hud', 'count']) $(id).hidden = true;
  $('lobby').hidden = false;
}
function startOnlineRace(cfg) {
  if (!builtIn(cfg.course)) { leaveRoom('This room uses a course your browser has not loaded. Reload the page and try again.'); return; }
  if (cfg.course !== loadedCourse && builtIn(cfg.course)) { buildCourse(builtIn(cfg.course)); buildMap(); }
  online.spectating = false; assignOnline(cfg.roster, isHost()); chaosOn = !!cfg.chaos; chaosSeed = (cfg.seed | 0) || 1; startRace();
}
function hostStart(phase) {
  if (!isHost()) return;
  const cfg = online.cfg || {};
  const roster = viewersOf(online.room.peers()).map((p) => p.peer).sort().slice(0, 6);
  online.room.presence({ race: { n: Math.max(online.seenN, cfg.n || 0) + 1, phase, course: cfg.course || loadedCourse, chaos: !!cfg.chaos, seed: phase === 'live' ? uid() : 0, roster: phase === 'live' ? roster : [] } });
}
$('lobbypicker').addEventListener('change', (e) => { hostCourse(e.target.value); if (e.target.blur) e.target.blur(); });
$('lobbymode').addEventListener('change', (e) => { if (isHost()) online.room.presence({ race: Object.assign({}, online.cfg, { chaos: e.target.value === '1' }) }); if (e.target.blur) e.target.blur(); });
function hostCourse(id) { if (isHost()) online.room.presence({ race: Object.assign({}, online.cfg, { course: id }) }); }
function refreshLobby() {
  if (state !== 'lobby' || !online.on) return;
  const v = viewersOf(online.snap || []).sort((a, b) => (a.peer < b.peer ? -1 : 1)), host = isHost(), cfg = online.cfg || {};
  $('roomcode').textContent = online.code;
  const ul = $('players'); ul.textContent = '';
  for (const p of v) {
    const li = document.createElement('li'), n = document.createElement('span'), t = document.createElement('span');
    n.textContent = nickOf(p) + (p.isMe && p.sameTab ? ' (you)' : ''); t.className = 'tagpill'; t.textContent = p.peer === online.host ? 'Host' : '';
    li.appendChild(n); li.appendChild(t); ul.appendChild(li);
  }
  $('startonline').hidden = !host; $('lobbywait').hidden = host;
  const box = $('lobbypicker'), shown = cfg.course || loadedCourse, key = COURSES.length + (host ? 'h' : 'g'); // rebuilt only when the list changes, so an open dropdown is not closed by updates
  if (box.dataset.key !== key) { fillSelect(box, false); box.dataset.key = key; }
  box.disabled = !host; if (box.value !== shown) box.value = shown;
  const mbox = $('lobbymode'), wantMode = cfg.chaos ? '1' : '0'; mbox.disabled = !host; if (mbox.value !== wantMode) mbox.value = wantMode;
  const c = builtIn(shown), odd = v.filter((p) => p.presence.nick !== undefined && p.presence.ver !== VERSION); // a player who has just connected has not announced anything yet
  $('lobbymsg').textContent = odd.length ? `Some players run a different version of the game (${odd.map(nickOf).join(', ')}). Everyone should reload the page before racing.`
    : online.spectating ? 'A race is in progress. You will join the next one.' : (c ? c.blurb + (cfg.chaos ? ' Chaos: obstacles block the road, and everyone has three rockets (F).' : '') : 'This course has not loaded in your browser. Reload the page.');
}

function feed(r, a) {
  if (r.srcA === a || a === r.stale) return;
  r.srcA = a; r.tx = a[0]; r.tz = a[1]; r.ty = a[2]; r.th = a[3]; r.tv = a[4];
  r.laps = a[5]; r.idx = a[6]; r.finishT = a[7]; r.finished = a[7] > 0; r.boost = a[8]; r.drifting = !!a[9]; r.steer = a[10]; r.tAt = tNow;
}
function smoothRemote(r, dt) {
  if (r.tAt === undefined) return;
  const ahead = Math.min(0.2, (tNow - r.tAt) / 1000 + 0.05), px = r.tx + Math.sin(r.th) * r.tv * ahead, pz = r.tz + Math.cos(r.th) * r.tv * ahead, k = Math.min(1, 20 * dt);
  if (Math.hypot(px - r.x, pz - r.z) > 40) { r.x = px; r.z = pz; r.y = r.ty; r.h = r.th; }
  else { r.x += (px - r.x) * k; r.z += (pz - r.z) * k; r.y += (r.ty - r.y) * k; r.h += angDiff(r.th - r.h) * k; }
  r.speed = r.tv;
}
function pollRoom() {
  const snap = online.room.peers(), me = snap.find((p) => p.isMe && p.sameTab);
  if (!me) return;
  online.me = me.peer;
  if (snap !== online.snap) { online.snap = snap; onSnap(snap); }
  for (const r of racers) {
    if (r.kind !== 'remote') continue;
    if (r.label) {
      const p = online.byLabel.get(r.label); r.gone = !p;
      if (p) { const nm = nickOf(p); if (nm !== r.name) { r.name = nm; setTag(r, nm); } if (p.presence.s) feed(r, p.presence.s); }
    } else if (online.hostPeer && online.hostPeer.presence.bots) {
      const a = online.hostPeer.presence.bots[r.botIdx]; if (a) feed(r, a);
    }
  }
}
const pack = (r) => [f2(r.x), f2(r.z), f2(r.y), f2(r.h), f2(r.speed), r.laps, r.idx, r.finished ? (f2(r.finishT) || 0.01) : 0, r.boost > 0 ? 1 : 0, r.drifting ? 1 : 0, f2(r.steer)];
function sendState() {
  if (state !== 'count' && state !== 'race' && state !== 'done') return;
  if (tNow - online.sentAt < 33) return;
  online.sentAt = tNow;
  const patch = { s: pack(player) };
  if (outbox.f || outbox.x) { Object.assign(patch, outbox); outbox = {}; }
  if (isHost()) {
    patch.bots = racers.filter((r) => r.kind === 'bot').sort((a, b) => a.botIdx - b.botIdx).map(pack);
    if (botEvDirty) { patch.bf = botFireLog.map((e) => e.slice()); patch.bx = botBlastLog.map((e) => e.slice()); botEvDirty = false; }
  }
  online.room.presence(patch).catch(() => {});
}

$('online').addEventListener('click', () => { $('nick').value = $('nick').value || savedNick(); $('joinmsg').textContent = ''; $('menu').hidden = true; $('join').hidden = false; });
$('joinback').addEventListener('click', () => { $('join').hidden = true; $('menu').hidden = false; });
$('create').addEventListener('click', () => joinRoom(makeCode(), true));
$('joinbtn').addEventListener('click', () => joinRoom($('code').value, false));
$('startonline').addEventListener('click', () => hostStart('live'));
$('tolobby').addEventListener('click', () => hostStart('lobby'));
$('leave').addEventListener('click', () => leaveRoom());
$('copycode').addEventListener('click', () => {
  const m = $('copymsg');
  try { navigator.clipboard.writeText(online.code).then(() => { m.textContent = 'Copied'; }, () => { m.textContent = 'Select the code to copy it'; }); } catch (e) { m.textContent = 'Select the code to copy it'; }
});

/* ---------- engine sound (Web Audio, one voice per kart) ---------- */
let audio = null, soundOn = true;
const camDir = new THREE.Vector3();
function makeVoice() { // a saw through a gentle low-pass for the growl, plus a triangle one octave down for body
  const c = audio.ctx, g = c.createGain(), pan = c.createStereoPanner ? c.createStereoPanner() : null;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 450; lp.Q.value = 0.4;
  const o1 = c.createOscillator(), o2 = c.createOscillator();
  o1.type = 'sawtooth'; o2.type = 'triangle';
  const g1 = c.createGain(), g2 = c.createGain(); g1.gain.value = 0.55; g2.gain.value = 0.8;
  o1.connect(g1); g1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g);
  if (pan) { g.connect(pan); pan.connect(audio.master); } else g.connect(audio.master);
  g.gain.value = 0; o1.start(); o2.start();
  return { o1, o2, g, pan, lp, sp: 0, boost: 0, level: 0, pn: 0 };
}
function ensureAudio() {
  if (audio) { if (audio.ctx.state === 'suspended' && soundOn) audio.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  try {
    const ctx = new AC(), master = ctx.createGain(), comp = ctx.createDynamicsCompressor();
    if (comp.threshold) { comp.threshold.value = -16; comp.knee.value = 24; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.35; } // gentle, so six engines do not pump
    master.gain.value = soundOn ? 0.5 : 0; master.connect(comp); comp.connect(ctx.destination);
    audio = { ctx, master, voices: new Map() };
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) { audio = null; }
}
function setSoundLabel() { $('snd').textContent = soundOn ? 'Sound on' : 'Sound off'; }
function toggleSound() {
  soundOn = !soundOn; setSoundLabel(); ensureAudio();
  if (audio) { audio.master.gain.setTargetAtTime(soundOn ? 0.5 : 0, audio.ctx.currentTime, 0.03); if (soundOn && audio.ctx.state === 'suspended') audio.ctx.resume(); }
}
function tone(freq, at, dur, type, vol) {
  const c = audio.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime + at;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(audio.master); o.start(t); o.stop(t + dur + 0.05);
}
function playChime() { // two bell-like notes, a fifth apart
  if (!audio || !soundOn) return;
  tone(1318.5, 0, 0.7, 'sine', 0.5); tone(1975.5, 0.11, 0.9, 'sine', 0.42);
}
function playFanfare() { // short rising arpeggio ending on a bright chord
  if (!audio || !soundOn) return;
  [[523.25, 0], [659.25, 0.12], [783.99, 0.24]].forEach(([f, at]) => tone(f, at, 0.28, 'triangle', 0.5));
  [[1046.5, 0.36], [1318.5, 0.36], [1568, 0.36]].forEach(([f, at]) => tone(f, at, 1.3, 'triangle', 0.4));
  tone(2093, 0.48, 0.9, 'sine', 0.22); tone(2637, 0.6, 0.9, 'sine', 0.18);
}
function updateAudio(dt) {
  if (!audio || !soundOn) return;
  const t = audio.ctx.currentTime, quiet = state === 'lobby' || state === 'menu';
  camera.getWorldDirection(camDir);
  const rx = camDir.z, rz = -camDir.x; // camera right on the ground plane
  for (const r of racers) {
    let v = audio.voices.get(r);
    if (!v) { v = makeVoice(); audio.voices.set(r, v); }
    // every control value is eased in code first, so speed changes, boosts and collisions glide instead of stepping
    const sp = Math.min(1, Math.abs(r.speed) / 45), live = !r.gone && !quiet && !(r.dead > 0), ease = (k) => Math.min(1, k * dt);
    v.sp += (sp - v.sp) * ease(5); v.boost += ((r.boost > 0 ? 1 : 0) - v.boost) * ease(4);
    const f = 50 + v.sp * 100 + v.boost * 12;
    const dx = r.x - camera.position.x, dz = r.z - camera.position.z, d = Math.hypot(dx, dz);
    const vol = r === player ? 0.5 : 0.55 / (1 + d * d / 260);
    const target = live ? vol * (0.35 + 0.65 * v.sp) * (r.finished && r.speed < 0.5 ? 0.4 : 1) : 0;
    v.level += (target - v.level) * ease(8);
    v.pn += ((r === player ? 0 : clamp((dx * rx + dz * rz) / (d + 6), -0.9, 0.9)) - v.pn) * ease(6);
    v.o1.frequency.setTargetAtTime(f, t, 0.08); v.o2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    v.lp.frequency.setTargetAtTime(380 + v.sp * 900 + v.boost * 150, t, 0.1);
    v.g.gain.setTargetAtTime(v.level * 0.3, t, 0.08);
    if (v.pan) v.pan.pan.setTargetAtTime(v.pn, t, 0.08);
  }
  for (const [r, v] of audio.voices) if (!racers.includes(r)) { try { v.o1.stop(); v.o2.stop(); } catch (e) {} v.g.disconnect(); audio.voices.delete(r); }
}
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => ensureAudio(), true);
$('snd').addEventListener('click', (e) => { toggleSound(); e.currentTarget.blur(); });
$('rsp').addEventListener('click', (e) => { respawnKey(); e.currentTarget.blur(); });
$('fire').addEventListener('click', (e) => { if (tNow - lastFireAt > 350) { lastFireAt = tNow; fireRocket(player); } e.currentTarget.blur(); });
if ($('ver')) $('ver').textContent = 'Version ' + VERSION;
document.addEventListener('visibilitychange', () => { if (!audio) return; if (document.hidden) audio.ctx.suspend(); else if (soundOn) audio.ctx.resume(); });

/* ---------- chaos mode: obstacles, rockets and explosions ---------- */
const ROCKETS = 3;                  // rockets each car carries per race
const ROCKET_SPEED = 90;            // metres per second, straight ahead
const ROCKET_OFF_SECS = 5;          // a rocket disappears after this long continuously off the course
const ROCKETS_STOPPED_BY_OBSTACLES = true; // false: rockets fly straight through rocks, barrels, ice and wrecks
const BLAST_SECS = 3;               // a destroyed car respawns after this long
const SAFE_SECS = 1.5;              // ...and cannot be hit again for this long
const LAG_COMP = 0.06;              // seconds a remote player's rocket is advanced to cover network delay
let chaosOn = false, chaosSeed = 1, fireHeld = false, lastFireAt = -1e9, shake = 0;
const chaosGroup = new T.Group(); scene.add(chaosGroup);
let obstacles = [], rockets = [], parts = [], outbox = {}, botFireLog = [], botBlastLog = [], botEvDirty = false;
const seenEv = new Set();
const rid = (r) => (r.e !== undefined ? r.e : racers.indexOf(r));
const uid = () => 1 + Math.floor(Math.random() * 1e9);
const okNums = (a, min, max) => Array.isArray(a) && a.length >= min && a.length <= max && a.every((v) => typeof v === 'number' && isFinite(v));
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const lam = (c, o) => new T.MeshLambertMaterial(Object.assign({ color: c }, o || {}));
const OB = {
  rock: new T.DodecahedronGeometry(1, 0), rockMat: lam(0x737985),
  barrel: new T.CylinderGeometry(0.6, 0.6, 1.3, 12), band: new T.CylinderGeometry(0.62, 0.62, 0.12, 12), bandMat: lam(0x2a2a30),
  barrelMats: [0xc23b2a, 0x2f6fb0, 0xd9a520, 0x3f8f4f].map((c) => lam(c)),
  ice: new T.BoxGeometry(2.3, 1.6, 2.1), iceMat: lam(0xa9e4f7, { emissive: 0x16384a, transparent: true, opacity: 0.88 }),
  carBody: new T.BoxGeometry(1.9, 0.7, 3.9), carCab: new T.BoxGeometry(1.6, 0.55, 1.8), carWheel: new T.CylinderGeometry(0.42, 0.42, 0.4, 10).rotateZ(Math.PI / 2),
  patch: new T.BoxGeometry(0.7, 0.1, 0.9), rust: lam(0x4a2b1c), char: lam(0x1b1a19), ember: new T.MeshBasicMaterial({ color: 0xff6a1a }),
  rocketBody: new T.CylinderGeometry(0.17, 0.17, 1.3, 8).rotateX(Math.PI / 2), rocketNose: new T.ConeGeometry(0.17, 0.5, 8).rotateX(Math.PI / 2),
  rocketFin: new T.BoxGeometry(0.6, 0.05, 0.3), rocketFlame: new T.ConeGeometry(0.14, 0.7, 6).rotateX(-Math.PI / 2),
  white: lam(0xe9e9ef), red: lam(0xe04a3a), flame: new T.MeshBasicMaterial({ color: 0xffa93a }),
};
const PART = {
  box: new T.BoxGeometry(1, 1, 1), ball: new T.SphereGeometry(1, 10, 8),
  fire: new T.MeshBasicMaterial({ color: 0xff6a1a }), hot: new T.MeshBasicMaterial({ color: 0xffd34a }),
  smoke: new T.MeshBasicMaterial({ color: 0x3b3b42, transparent: true, opacity: 0.42, depthWrite: false }), junk: new T.MeshBasicMaterial({ color: 0x1b1b1f }),
};

function makeObstacle(kind, rnd) {
  const g = new T.Group(), part = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  let r = 1.5;
  if (kind === 'rock') {
    const s = 1.0 + rnd() * 0.6, m = part(OB.rock, OB.rockMat, 0, s * 0.55, 0);
    m.scale.set(s * 1.2, s * 0.85, s); m.rotation.set(rnd() * 0.5, rnd() * 6.28, rnd() * 0.5); r = s * 1.3 + 0.2;
    const s2 = s * 0.5, m2 = part(OB.rock, OB.rockMat, s * 0.95, s2 * 0.5, s * 0.35); m2.scale.set(s2, s2 * 0.8, s2); m2.rotation.y = rnd() * 6.28;
  } else if (kind === 'barrels') {
    const n = 1 + Math.floor(rnd() * 3), at = [[[0, 0]], [[-0.66, 0], [0.66, 0]], [[-0.66, 0.4], [0.66, 0.4], [0, -0.7]]][n - 1], mat = OB.barrelMats[Math.floor(rnd() * OB.barrelMats.length)];
    for (const [x, z] of at) { part(OB.barrel, mat, x, 0.65, z); part(OB.band, OB.bandMat, x, 0.3, z); part(OB.band, OB.bandMat, x, 1.0, z); }
    r = [0.85, 1.4, 1.55][n - 1];
  } else if (kind === 'ice') {
    part(OB.ice, OB.iceMat, 0, 0.8, 0).rotation.y = rnd() * 6.28;
    const m = part(OB.ice, OB.iceMat, 1.1, 0.5, 0.9); m.scale.set(0.55, 0.6, 0.55); m.rotation.set(0.2, rnd() * 6.28, 0.25); r = 1.75;
  } else { // wreck: a burnt-out car with glowing embers
    part(OB.carBody, OB.rust, 0, 0.6, 0); const cab = part(OB.carCab, OB.char, 0, 1.15, -0.3); cab.rotation.z = 0.08;
    part(OB.carWheel, OB.char, -1.0, 0.42, 1.2); part(OB.carWheel, OB.char, 1.0, 0.42, -1.2); part(OB.carWheel, OB.char, -1.0, 0.42, -1.2);
    part(OB.patch, OB.ember, 0.3, 0.98, 1.2); part(OB.patch, OB.ember, -0.4, 0.98, 0.4); part(OB.patch, OB.ember, 0.1, 1.5, -0.4).scale.set(0.6, 1, 0.6);
    r = 2.15;
  }
  if (kind !== 'rock') g.rotation.y = rnd() * 6.28;
  return { mesh: g, r };
}
function clearChaos() {
  while (chaosGroup.children.length) chaosGroup.remove(chaosGroup.children[0]);
  obstacles = []; rockets = []; parts = [];
}
function buildObstacles(seed) {
  clearChaos();
  const rnd = rng(seed), mpi = trackLen / N, kinds = ['rock', 'barrels', 'ice', 'wreck'], pick = () => kinds[Math.floor(rnd() * kinds.length)];
  const first = Math.ceil(80 / mpi), last = N - Math.ceil(70 / mpi); // none on the grid or just after the start line
  const put = (kind, ob, i, off) => {
    const p = pts[i], x = p.x + nrm[i].x * off, z = p.z + nrm[i].z * off;
    if (pads.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < 100)) return; // keep boost pads clear
    ob.mesh.position.set(x, p.y, z); chaosGroup.add(ob.mesh);
    obstacles.push({ x, z, y: p.y, r: ob.r, idx: i, off, kind, smokeT: rnd() * 0.3 });
  };
  for (let i = first; i < last; i += Math.max(4, Math.round((24 + rnd() * 34) / mpi))) {
    const ka = pick(), a = makeObstacle(ka, rnd);
    if (rnd() < 0.22) { // a pair with a gap of at least 6 m between them
      const kb = pick(), b = makeObstacle(kb, rnd), gap = 6 + rnd() * 2.5, room = 2 * HALF - 0.6 - (2 * a.r + 2 * b.r + gap);
      if (room > 0) { const s0 = -HALF + 0.3 + a.r + rnd() * room; put(ka, a, i, s0); put(kb, b, i, s0 + a.r + gap + b.r); continue; }
    }
    put(ka, a, i, (rnd() * 2 - 1) * Math.max(0, HALF - a.r - 0.3));
  }
}
function hitObstacles(r) { // obstacles are walls: push the kart out and take speed off in proportion to how head-on the hit was
  for (const o of obstacles) {
    const dx = r.x - o.x, dz = r.z - o.z, min = o.r + 1.15;
    if (dx > min || dx < -min || dz > min || dz < -min) continue;
    const d2 = dx * dx + dz * dz; if (d2 >= min * min) continue;
    const d = Math.sqrt(d2) || 0.001, nx = dx / d, nz = dz / d;
    r.x = o.x + nx * min; r.z = o.z + nz * min;
    const dir = r.speed < 0 ? -1 : 1, into = Math.max(0, -(Math.sin(r.h) * nx + Math.cos(r.h) * nz) * dir), before = Math.abs(r.speed);
    r.speed *= into > 0.12 ? 1 - 0.85 * into : 0.985;
    if (into > 0.12) { // glance off: swing the heading towards the way along the obstacle, so a kart slides round it instead of sticking
      const side = (Math.sin(r.h) * -nz + Math.cos(r.h) * nx) * dir >= 0 ? 1 : -1, ta = Math.atan2(-nz * side, nx * side) + (dir < 0 ? Math.PI : 0);
      r.h += angDiff(ta - r.h) * Math.min(1, into * 0.6);
    }
    if (into > 0.5) { r.boost = 0; r.drift = 0; }
    if (before - Math.abs(r.speed) > 6 && tNow - (r.thumpAt || -1e9) > 250) { r.thumpAt = tNow; playThump(r); }
  }
}
function botLane(r, dt) { // bots aim for the lane they like, unless an obstacle is in the way: then the nearest free lane
  const mpi = trackLen / N;
  let want = clamp(r.lane, -HALF * 0.6, HALF * 0.6);
  if (r.ammo > 0 && raceT > 3) { // still holding rockets: line up behind the nearest kart ahead
    let best = 1e9, tgt = null;
    for (const o of racers) { if (o === r || o.gone || o.dead > 0 || o.safe > 0 || o.finished) continue; const d = ((o.idx - r.idx + N) % N) * mpi; if (d > 10 && d < 70 && d < best) { best = d; tgt = o; } }
    if (tgt) want = clamp((tgt.x - pts[tgt.idx].x) * nrm[tgt.idx].x + (tgt.z - pts[tgt.idx].z) * nrm[tgt.idx].z, -HALF * 0.75, HALF * 0.75);
  }
  let aim = want;
  if (obstacles.length) {
    const look = Math.ceil((28 + Math.abs(r.speed) * 1.0) / mpi), near = obstacles.filter((o) => { const d = (o.idx - r.idx + N) % N; return d <= look || d >= N - 2; });
    const blocked = (l) => near.some((o) => Math.abs(l - o.off) < o.r + 2.4), lim = HALF - 1.0;
    if (near.length && blocked(want)) {
      const first = near[0].off > want ? -1 : 1;
      search: for (let s = 0.5; s <= 2 * lim; s += 0.5) for (const sg of [first, -first]) { const l = want + sg * s; if (Math.abs(l) <= lim && !blocked(l)) { aim = l; break search; } }
    }
  }
  if (r.laneNow === undefined) r.laneNow = want;
  r.laneNow += (aim - r.laneNow) * Math.min(1, 6 * dt);
  return r.laneNow;
}
function botFire(r, dt) {
  if (!chaosOn || r.ammo <= 0 || r.dead > 0 || r.finished || raceT < 4) return;
  r.fireCd -= dt; if (r.fireCd > 0) return;
  const hx = Math.sin(r.h), hz = Math.cos(r.h);
  for (const o of racers) {
    if (o === r || o.gone || o.dead > 0 || o.safe > 0 || o.finished) continue;
    const dx = o.x - r.x, dz = o.z - r.z, ahead = dx * hx + dz * hz, side = Math.abs(dx * hz - dz * hx);
    if (ahead < 8 || ahead > 90 || side > 2.3) continue;
    if (obstacles.some((q) => { const qx = q.x - r.x, qz = q.z - r.z, t = qx * hx + qz * hz; return t > 0 && t < ahead && Math.abs(qx * hz - qz * hx) < q.r + 0.4; })) continue; // blocked
    if (Math.random() < 3 * dt) { fireRocket(r); r.fireCd = 3 + Math.random() * 5; }
    return;
  }
}

/* rockets */
function makeRocketMesh() {
  const g = new T.Group(), add = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(OB.rocketBody, OB.white, 0, 0, 0); add(OB.rocketNose, OB.red, 0, 0, 0.9); add(OB.rocketFin, OB.red, 0, 0, -0.5); add(OB.rocketFin, OB.red, 0, 0, -0.5).rotation.z = Math.PI / 2;
  add(OB.rocketFlame, OB.flame, 0, 0, -1.0);
  g.scale.setScalar(1.7);
  return g;
}
function spawnRocket(owner, shot, x, z, y, h, lag) {
  shot = clamp(Math.floor(shot) || 0, 0, ROCKETS - 1);
  const id = rid(owner) * ROCKETS + shot;
  if (rockets.some((q) => q.id === id)) return null;
  const mesh = makeRocketMesh(); chaosGroup.add(mesh);
  const rk = { id, owner, x, z, y: y + 0.9, h, dx: Math.sin(h), dz: Math.cos(h), off: 0, age: 0, mesh };
  if (lag > 0) { rk.x += rk.dx * ROCKET_SPEED * lag; rk.z += rk.dz * ROCKET_SPEED * lag; }
  mesh.position.set(rk.x, rk.y, rk.z); mesh.rotation.y = h; rockets.push(rk);
  return rk;
}
function removeRocket(rk) { const i = rockets.indexOf(rk); if (i >= 0) { rockets.splice(i, 1); chaosGroup.remove(rk.mesh); } }
function fireRocket(r) {
  if (!chaosOn || r.ammo <= 0 || r.dead > 0 || r.finished || state !== 'race') return false;
  const shot = ROCKETS - r.ammo; r.ammo--;
  const x = r.x + Math.sin(r.h) * 2.6, z = r.z + Math.cos(r.h) * 2.6;
  spawnRocket(r, shot, x, z, r.y, r.h, 0);
  if (online.on) {
    if (r === player) outbox.f = [uid(), shot, f2(x), f2(z), f2(r.y), f2(r.h)];
    else if (r.kind === 'bot' && isHost()) { botFireLog.push([uid(), r.botIdx, shot, f2(x), f2(z), f2(r.y), f2(r.h)]); if (botFireLog.length > 6) botFireLog.shift(); botEvDirty = true; }
  }
  playLaunch(x, z);
  return true;
}
let nrIdx = 0, nrDist = 0;
function nearestRoad(x, z) { let b = 1e12, bi = 0; for (let i = 0; i < N; i++) { const dx = pts[i].x - x, dz = pts[i].z - z, q = dx * dx + dz * dz; if (q < b) { b = q; bi = i; } } nrIdx = bi; nrDist = Math.sqrt(b); }
function updateRockets(dt) {
  for (let k = rockets.length - 1; k >= 0; k--) {
    const rk = rockets[k]; rk.age += dt;
    const n = Math.max(1, Math.ceil((ROCKET_SPEED * dt) / 1.0)), sd = (ROCKET_SPEED * dt) / n;
    let done = false;
    for (let s = 0; s < n && !done; s++) {
      rk.x += rk.dx * sd; rk.z += rk.dz * sd;
      if (ROCKETS_STOPPED_BY_OBSTACLES) for (const o of obstacles) {
        const ox = rk.x - o.x, oz = rk.z - o.z;
        if (ox * ox + oz * oz < (o.r + 0.25) ** 2) { explosionFx(rk.x, rk.y, rk.z, false); done = true; break; }
      }
      if (done) break;
      for (const r of racers) { // only karts this browser simulates can be hit here; remote players report their own hits
        if (r.kind === 'remote' || r.gone || r.dead > 0 || r.safe > 0 || r.finished || r === rk.owner) continue;
        if ((r.x - rk.x) ** 2 + (r.z - rk.z) ** 2 < 3.6 && Math.abs(r.y + 0.7 - rk.y) < 2.6) { blowUp(r, rk); done = true; break; }
      }
    }
    if (done) { removeRocket(rk); continue; }
    nearestRoad(rk.x, rk.z);
    const out = nrDist - (HALF + 1.4), road = pts[nrIdx].y, ground = out <= 0 ? road : Math.max(0, road - out / bankRun);
    rk.y += (ground + 0.9 - rk.y) * Math.min(1, 15 * dt);
    rk.off = nrDist > HALF + 1.2 ? rk.off + dt : 0;
    if (rk.off >= ROCKET_OFF_SECS || rk.age > 30) { removeRocket(rk); continue; }
    rk.mesh.position.set(rk.x, rk.y, rk.z);
    const sx = rk.x - rk.dx * 1.2, sz = rk.z - rk.dz * 1.2;
    puff('smoke', sx, rk.y, sz, (Math.random() - 0.5) * 1.5, 0.8, (Math.random() - 0.5) * 1.5, 0.3, 0.55, 0);
    puff('hot', sx, rk.y, sz, 0, 0, 0, 0.32, 0.1, 0);
    puff('fire', sx - rk.dx * 0.5, rk.y, sz - rk.dz * 0.5, 0, 0, 0, 0.4, 0.14, 0);
  }
}

/* destroyed cars */
function blowUp(r, rk) {
  explosionFx(r.x, r.y + 0.8, r.z, true);
  r.dead = BLAST_SECS; r.speed = 0; r.boost = 0; r.drift = 0; r.drifting = false; r.steer = 0;
  r.hitBy = rk && rk.owner ? rk.owner.name : '';
  if (online.on && rk) {
    if (r === player) outbox.x = [uid(), rk.id, f2(r.x), f2(r.z), f2(r.y)];
    else if (r.kind === 'bot' && isHost()) { botBlastLog.push([uid(), r.botIdx, rk.id, f2(r.x), f2(r.z), f2(r.y)]); if (botBlastLog.length > 6) botBlastLog.shift(); botEvDirty = true; }
  }
}
function remoteBlast(r, rocketId, x, z, y) { // a player (or a bot on the host) says it was hit
  const rk = rockets.find((q) => q.id === rocketId); if (rk) removeRocket(rk);
  explosionFx(x, y + 0.8, z, true); r.dead = BLAST_SECS;
}
function respawnAfterBlast(r) { // back on the road centre close to where it blew up, stepping back if a obstacle is there
  let i = r.idx;
  for (let t = 0; t < 8 && obstacles.some((o) => Math.hypot(o.x - pts[i].x, o.z - pts[i].z) < o.r + 3.4); t++) i = (i - 1 + N) % N;
  const p = pts[i];
  Object.assign(r, { x: p.x, z: p.z, y: p.y, vy: 0, h: headingOf(tan[i]), speed: 10, steer: 0, boost: 0, drift: 0, dist: 0, idx: i, drifting: false, safe: SAFE_SECS, dead: 0 });
  if (r === player) { camH = r.h; lostT = 0; missed = false; grassT = 0; }
}

/* particles */
function puff(kind, x, y, z, vx, vy, vz, size, life, g) {
  if (parts.length > 260) { const old = parts.shift(); chaosGroup.remove(old.m); }
  const m = new T.Mesh(kind === 'flash' || kind === 'smoke' ? PART.ball : PART.box, kind === 'flash' ? PART.hot : PART[kind]);
  m.position.set(x, y, z); m.scale.setScalar(size); chaosGroup.add(m);
  parts.push({ m, vx, vy, vz, size, life, t: 0, g, kind });
}
function explosionFx(x, y, z, big) {
  const n = big ? 30 : 12, sp = big ? 14 : 7;
  puff('flash', x, y, z, 0, 0, 0, big ? 1.1 : 0.6, 0.3, 0);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, u = Math.random(), s = sp * (0.3 + u * 0.7);
    puff(i % 3 ? 'fire' : 'hot', x, y, z, Math.cos(a) * s, 2 + Math.random() * sp * 0.6, Math.sin(a) * s, 0.28 + Math.random() * 0.4, 0.45 + Math.random() * 0.45, 9);
  }
  if (big) for (let i = 0; i < 10; i++) { const a = Math.random() * 6.283, s = 4 + Math.random() * 10; puff('junk', x, y, z, Math.cos(a) * s * 0.8, 6 + Math.random() * 9, Math.sin(a) * s * 0.8, 0.14 + Math.random() * 0.2, 1.3, 24); }
  for (let i = 0; i < (big ? 5 : 3); i++) { const a = Math.random() * 6.283; puff('smoke', x, y, z, Math.cos(a) * 2, 2 + Math.random() * 3, Math.sin(a) * 2, 0.6 + Math.random() * 0.5, 1.5 + Math.random(), 0); }
  const d = Math.hypot(x - camera.position.x, z - camera.position.z);
  playBlast(big ? 0.9 : 0.5, d);
  if (big && d < 30) shake = Math.max(shake, 0.6 * (1 - d / 30));
}
function updateChaos(dt) {
  if (shake > 0) shake = Math.max(0, shake - dt * 1.4);
  updateRockets(dt);
  for (const o of obstacles) { // wrecks smoulder
    if (o.kind !== 'wreck') continue;
    const d = Math.hypot(o.x - camera.position.x, o.z - camera.position.z); if (d > 110) continue;
    o.smokeT -= dt; if (o.smokeT <= 0) { o.smokeT = 0.18 + Math.random() * 0.15; puff('smoke', o.x + (Math.random() - 0.5), o.y + 1.5, o.z + (Math.random() - 0.5), 0.3, 1.6, 0.2, 0.5, 1.6, 0); }
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.t += dt;
    if (p.t >= p.life) { chaosGroup.remove(p.m); parts.splice(i, 1); continue; }
    p.vy -= p.g * dt; p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
    const u = p.t / p.life;
    const s = p.kind === 'smoke' ? p.size * (1 + u * 1.6) * (u > 0.7 ? (1 - u) / 0.3 : 1) : p.kind === 'flash' ? p.size * (0.4 + u * 1.9) * (1 - u * u) : p.size * (1 - u);
    p.m.scale.setScalar(Math.max(0.01, s));
  }
}
function pollChaos() { // rockets and hits reported by other players
  if (!chaosOn) return;
  for (const r of racers) {
    if (r.kind !== 'remote' || !r.label) continue;
    const p = online.byLabel.get(r.label); if (!p) continue;
    const f = p.presence.f, x = p.presence.x;
    if (okNums(f, 6, 8) && !seenEv.has(f[0])) { seenEv.add(f[0]); if (spawnRocket(r, f[1], f[2], f[3], f[4], f[5], LAG_COMP)) { r.ammo = Math.min(r.ammo, ROCKETS - 1 - clamp(Math.floor(f[1]), 0, ROCKETS - 1)); playLaunch(f[2], f[3]); } }
    if (okNums(x, 5, 8) && !seenEv.has(x[0])) { seenEv.add(x[0]); remoteBlast(r, x[1], x[2], x[3], x[4]); }
  }
  const hp = online.hostPeer && online.hostPeer.presence;
  if (hp && !isHost()) {
    const bot = (i) => racers.find((q) => q.kind === 'remote' && !q.label && q.botIdx === i);
    if (Array.isArray(hp.bf)) for (const e of hp.bf) if (okNums(e, 7, 8) && !seenEv.has(e[0])) { seenEv.add(e[0]); const r = bot(e[1]); if (r && spawnRocket(r, e[2], e[3], e[4], e[5], e[6], LAG_COMP)) { r.ammo = Math.min(r.ammo, ROCKETS - 1 - clamp(Math.floor(e[2]), 0, ROCKETS - 1)); playLaunch(e[3], e[4]); } }
    if (Array.isArray(hp.bx)) for (const e of hp.bx) if (okNums(e, 6, 8) && !seenEv.has(e[0])) { seenEv.add(e[0]); const r = bot(e[1]); if (r) remoteBlast(r, e[2], e[3], e[4], e[5]); }
  }
}
function markSeen() { // events already in the room (from an earlier race) must not replay
  seenEv.clear();
  const add = (e) => { if (Array.isArray(e) && typeof e[0] === 'number') seenEv.add(e[0]); };
  online.byLabel.forEach((p) => { add(p.presence.f); add(p.presence.x); });
  const hp = online.hostPeer && online.hostPeer.presence;
  if (hp) { (Array.isArray(hp.bf) ? hp.bf : []).forEach(add); (Array.isArray(hp.bx) ? hp.bx : []).forEach(add); }
  botFireLog = []; botBlastLog = []; botEvDirty = false; outbox = {};
}

/* chaos sounds */
let noiseBuf = null;
function noise(vol, f0, f1, dur, kind) {
  if (!audio || !soundOn || vol < 0.02) return;
  try {
    const c = audio.ctx, t = c.currentTime;
    if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = kind; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(audio.master); s.start(t); s.stop(t + dur + 0.05);
  } catch (e) { /* sound is optional */ }
}
const nearVol = (x, z, base) => base / (1 + ((x - camera.position.x) ** 2 + (z - camera.position.z) ** 2) / 1600);
function playBlast(vol, d) { if (!audio || !soundOn) return; const v = vol / (1 + (d * d) / 1600); noise(v, 2600, 70, 1.1, 'lowpass'); if (v > 0.03) tone(52, 0, 0.7, 'sine', v * 0.9); }
function playLaunch(x, z) { if (!audio || !soundOn) return; noise(nearVol(x, z, 0.5), 500, 3200, 0.5, 'bandpass'); }
function playThump(r) { if (!audio || !soundOn) return; const v = r === player ? 0.5 : nearVol(r.x, r.z, 0.4); if (v > 0.03) tone(85, 0, 0.18, 'triangle', v); }

/* ---------- loop ---------- */
function update(dt) {
  const gridStill = state === 'menu' || state === 'lobby' || state === 'count';
  const inp = state === 'race' ? readInput() : { steer: 0, gas: false, brake: false, drift: false };
  if (chaosOn && state === 'race') { const f = !!(keys.KeyF || touch.fire); if (f && !fireHeld && !player.finished && tNow - lastFireAt > 350) { lastFireAt = tNow; fireRocket(player); } fireHeld = f; }
  if (state === 'count') {
    cd -= dt; $('count').hidden = false; $('count').textContent = String(Math.max(1, Math.ceil(cd)));
    if (cd <= 0) { state = 'race'; goT = 0.9; $('count').textContent = 'GO'; }
  } else if (goT > 0) { goT -= dt; if (goT <= 0) $('count').hidden = true; }
  if (state === 'race' || state === 'done') raceT += dt;
  if (online.on) { pollRoom(); pollChaos(); }
  if (!gridStill) {
    for (const r of racers) {
      if (r.dead > 0) { r.dead -= dt; if (r.kind !== 'remote') { r.speed = 0; if (r.dead <= 0) respawnAfterBlast(r); } else smoothRemote(r, dt); continue; } // wrecked: out for a few seconds
      if (r.safe > 0) r.safe -= dt;
      if (r.kind === 'remote') { smoothRemote(r, dt); continue; }
      step(r, r.kind === 'bot' ? botInput(r, dt) : inp, dt);
      if (chaosOn) { hitObstacles(r); if (r.kind === 'bot') botFire(r, dt); }
    }
    for (let i = 0; i < racers.length; i++) for (let j = i + 1; j < racers.length; j++) {
      const a = racers[i], b = racers[j];
      if (a.gone || b.gone || a.dead > 0 || b.dead > 0 || (a.kind === 'remote' && b.kind === 'remote')) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d < 2.4 && d > 0.001) {
        const fa = a.kind === 'remote' ? 0 : 1, fb = b.kind === 'remote' ? 0 : 1, push = (2.4 - d) / (fa + fb), nx = dx / d, nz = dz / d;
        a.x -= nx * push * fa; a.z -= nz * push * fa; b.x += nx * push * fb; b.z += nz * push * fb;
        if (fa) a.speed *= 0.99;
        if (fb) b.speed *= 0.99;
      }
    }
    for (const r of racers) {
      if (r.kind === 'remote') continue;
      if (r.dead > 0) { if (r === player) lostT = 0; continue; }
      for (const p of pads) if ((r.x - p.x) ** 2 + (r.z - p.z) ** 2 < 16) r.boost = Math.max(r.boost, 0.9);
      locate(r);
      if (r === player && state === 'race') checkLost(dt);
    }
  } else if (online.on) { for (const r of racers) if (r.kind === 'remote') smoothRemote(r, dt); }
  for (const r of racers) {
    if (r.kind !== 'remote') { // follow the road, slide down the embankment, and fall off a ledge instead of hovering
      const out = r.dist - (HALF + 1.4), road = pts[r.idx].y, ground = out <= 0 ? road : Math.max(0, road - out / bankRun);
      if (ground < r.y - 0.05) { r.vy = (r.vy || 0) - 30 * dt; r.y += r.vy * dt; if (r.y <= ground) { r.y = ground; r.vy = 0; } }
      else { r.vy = 0; r.y += (ground - r.y) * Math.min(1, 12 * dt); }
    }
    r.mesh.visible = !r.gone && !(r.dead > 0);
    r.mesh.position.set(r.x, r.y, r.z);
    r.mesh.rotation.y = r.h + (r.drifting ? r.steer * 0.35 : 0);
  }
  updateChaos(dt);
  if (online.on) sendState();
  updateAudio(dt);
  if (endTimer > 0 && state === 'race') { endTimer -= dt; if (endTimer <= 0) showResults(); }
  if (state === 'done' && !$('results').hidden) { boardT -= dt; if (boardT <= 0) { boardT = 0.5; renderBoard(); resultButtons(); } }
}
function updateCamera(dt) {
  const p = player;
  if (state === 'menu' || state === 'lobby' || state === 'done') {
    orbit += dt * 0.18;
    camera.position.set(p.x + Math.cos(orbit) * 26, p.y + 9, p.z + Math.sin(orbit) * 26); camera.lookAt(p.x, p.y + 1.5, p.z);
    camera.fov = 68; camera.updateProjectionMatrix(); return;
  }
  camH += angDiff(p.h - camH) * Math.min(1, 5 * dt);
  const back = 8.5 + Math.min(Math.max(p.speed, 0), 45) * 0.04;
  camera.position.set(p.x - Math.sin(camH) * back, p.y + 4.4, p.z - Math.cos(camH) * back);
  if (shake > 0) camera.position.add({ x: (Math.random() - 0.5) * shake * 2, y: (Math.random() - 0.5) * shake * 2, z: (Math.random() - 0.5) * shake * 2 });
  camera.lookAt(p.x + Math.sin(camH) * 6, p.y + 1.6, p.z + Math.cos(camH) * 6);
  const fov = 68 + (p.boost > 0 ? 9 : 0) + Math.min(Math.max(p.speed, 0), 40) * 0.1;
  camera.fov += (fov - camera.fov) * Math.min(1, 6 * dt); camera.updateProjectionMatrix();
}
function updateHud() {
  if ($('hud').hidden) return;
  $('lap').textContent = `${clamp(player.laps + 1, 1, LAPS)}/${LAPS}`;
  $('pos').textContent = `${ranking().indexOf(player) + 1}/${racers.length}`;
  $('time').textContent = fmt(state === 'count' ? 0 : raceT);
  $('spd').textContent = String(Math.round(Math.abs(player.speed) * 3));
  const bar = $('driftbar'); bar.style.width = `${clamp(player.drift / 1.8, 0, 1) * 100}%`; bar.className = player.drift > 0.9 ? 'ready' : '';
  $('flag').hidden = !(player.boost > 0);
  $('ammochip').hidden = !chaosOn; if (chaosOn) $('ammo').textContent = String(player.ammo);
  $('boom').hidden = !(player.dead > 0); if (player.dead > 0) $('boomt').textContent = (player.hitBy ? 'Hit by ' + player.hitBy + '. ' : '') + 'Back in ' + Math.ceil(player.dead);
  $('warn').hidden = !(lostT > 0 && state === 'race'); $('warnt').textContent = lostWhy;
  drawMap();
}
let last = performance.now();
assignSolo(); buildCourse(COURSES[0]); resetRacers(); buildMap(); renderPicker(); describe(); probeRoom(); loadCourseFiles();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; tNow = now;
  update(dt); updateCamera(dt); updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
