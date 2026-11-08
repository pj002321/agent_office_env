// The building: an island, a lobby, one floor per project, a roof. Enter a floor and its front wall swings
// open like a dollhouse while the floors above lift away. Villagers act out OfficeEvents on their own floor.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ICON } from './icons.js';

// ---------- renderer ----------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 400);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('stage').appendChild(renderer.domElement);
const labels = new CSS2DRenderer();
labels.setSize(innerWidth, innerHeight);
labels.domElement.className = 'labels';
document.getElementById('stage').appendChild(labels.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableDamping = true;
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = 1.35;
// keep the building centered in the space between the left elevator panel and the right column
const PANEL_L = 260, PANEL_R = 346;
function fit() {
  camera.aspect = innerWidth / innerHeight;
  camera.setViewOffset(innerWidth, innerHeight, (PANEL_R - PANEL_L) / 2, 0, innerWidth, innerHeight);
  renderer.setSize(innerWidth, innerHeight); labels.setSize(innerWidth, innerHeight);
}
addEventListener('resize', fit);
fit();

scene.add(new THREE.HemisphereLight(0xfff4e0, 0x9fc9a8, 1.6));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
sun.position.set(18, 30, 22);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 40, bottom: -12, near: 1, far: 90 });
scene.add(sun, sun.target);

// ---------- materials & helpers ----------
const ramp = new THREE.DataTexture(new Uint8Array([110, 185, 255]), 3, 1, THREE.RedFormat);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
ramp.needsUpdate = true;
const mats = new Map();
const toon = (color, map) => {
  const key = color + (map ? map.uuid : '');
  if (!mats.has(key)) mats.set(key, new THREE.MeshToonMaterial({ color, gradientMap: ramp, map }));
  return mats.get(key);
};
const INK = 0x5a4636;
const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
const V = (x, z) => new THREE.Vector3(x, 0, z);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function add(parent, geo, mat, x = 0, y = 0, z = 0, { shadow = true, outline = 0 } = {}) {
  const m = new THREE.Mesh(geo, Array.isArray(mat) || mat?.isMaterial ? mat : toon(mat));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = shadow;
  if (outline) { const o = new THREE.Mesh(geo, inkMat); o.scale.setScalar(1 + outline); m.add(o); }
  parent.add(m);
  return m;
}
const rbox = (w, h, d, r = 0.08) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2));
const sphere = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);

function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  return t;
}
const woodTex = canvasTex(256, 256, (g, w, h) => {
  const tones = ['#e7c193', '#deb584', '#ecc99e', '#d9ad7b'];
  for (let row = 0; row < 8; row++) {
    let x = -(row % 2) * 64;
    while (x < w) {
      g.fillStyle = tones[(row * 3 + x / 64 + 4) % 4 | 0];
      g.fillRect(x, row * 32, 128, 32);
      g.fillStyle = '#c99e6e';
      g.fillRect(x, row * 32, 2, 32);
      x += 128;
    }
    g.fillRect(0, row * 32, w, 2);
  }
}, [3, 2]);
function wallpaper(base, dot) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = dot;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      g.beginPath(); g.arc(x * 32 + (y % 2) * 16 + 8, y * 32 + 16, 3.2, 0, 7); g.fill();
    }
  }, [6, 1.6]);
}
const awningTex = canvasTex(256, 64, (g, w, h) => {
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#ff8f7a'; g.fillRect(i * 32, 0, 32, h); }
}, [3, 1]);

// ---------- tweens ----------
const tweens = new Set();
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
function tween(ms, step) {
  return new Promise(done => tweens.add({ t0: performance.now(), ms, step, done }));
}

// ---------- island & sky ----------
const island = new THREE.Group();
scene.add(island);
add(island, new THREE.CylinderGeometry(24, 21, 2.4, 48), [toon(0xb08a64), toon(0x9fd685), toon(0x9fd685)], 0, -1.2, 2);
add(island, new THREE.CylinderGeometry(3.2, 3.2, 0.06, 32), 0xf3e4c4, 0, 0.03, 13);   // plaza
for (let i = 0; i < 6; i++) add(island, new THREE.CylinderGeometry(0.75, 0.75, 0.06, 20), 0xeee0c0, (i % 2 ? 0.35 : -0.35), 0.03, 6 + i * 1.15);
const sway = [];
function tree(x, z, s = 1, tint = 0x7cc58a) {
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.scale.setScalar(s);
  add(g, new THREE.CylinderGeometry(0.22, 0.32, 1.6, 10), 0x9a6b4a, 0, 0.8, 0);
  add(g, sphere(1.15), tint, 0, 2.2, 0, { outline: 0.03 });
  add(g, sphere(0.85), tint, 0.55, 2.9, 0.2, { outline: 0.04 });
  add(g, sphere(0.75), tint, -0.6, 2.75, -0.1, { outline: 0.04 });
  for (let i = 0; i < 3; i++) add(g, sphere(0.12, 10, 8), 0xff9e9e, Math.sin(i * 2.3) * 0.9, 2.4 + i * 0.25, 0.85);
  island.add(g);
  sway.push(g);
}
[[-12, 2, 1.2], [-15, 9, 1], [12.5, 3, 1.15], [15, 10, 0.95, 0x9ad08f], [-9, 15, 0.85, 0x9ad08f], [9.5, 15.5, 0.9],
 [-17, -4, 1.1, 0x6fbf86], [17, -5, 1.05, 0x6fbf86]].forEach(t => tree(...t));
const FLOWER = [0xffffff, 0xffd45e, 0xff9fb2, 0xc9b3f5];
for (let i = 0; i < 70; i++) {
  const a = i * 2.4, r = 9 + (i * 37 % 11);
  const x = Math.cos(a) * r, z = Math.sin(a) * r + 3;
  if (Math.abs(x) < 9 && z < 10) continue;
  add(island, sphere(0.14, 8, 6), FLOWER[i % 4], x, 0.12, z, { shadow: false });
}
function lamp(x, z) {
  add(island, new THREE.CylinderGeometry(0.07, 0.09, 2.4, 8), 0x4a5a6a, x, 1.2, z);
  add(island, sphere(0.28), new THREE.MeshBasicMaterial({ color: 0xfff1b8 }), x, 2.5, z, { shadow: false });
}
lamp(-3.6, 9); lamp(3.6, 9);
add(island, rbox(2.2, 0.16, 0.6, 0.06), 0xc98f5a, 5.5, 0.55, 12.2);                 // bench
add(island, rbox(2.2, 0.6, 0.12, 0.05), 0xc98f5a, 5.5, 0.9, 11.95);

const clouds = [];
for (let i = 0; i < 7; i++) {
  const c = new THREE.Group();
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: ramp, transparent: true, opacity: 0.95 });
  for (let k = 0; k < 4; k++) add(c, sphere(1.4 + (k % 2) * 0.6), mat, k * 1.4 - 2, (k % 2) * 0.6, 0, { shadow: false });
  c.position.set(-60 + i * 19, 15 + (i % 3) * 4, -42 + (i % 2) * 10);
  c.userData.speed = 0.6 + (i % 3) * 0.3;
  scene.add(c);
  clouds.push(c);
}

// ---------- building ----------
export const FW = 14, FD = 9, FH = 3.4;
const LOBBY = FH;
const LANE = -1.4;
const ELEV = V(-6.4, LANE);
const THEMES = [
  { wall: '#bfe9d6', dot: '#a6dcc4', face: 0x8fd3b6, rug: 0xfff0b8 },
  { wall: '#ffe9ad', dot: '#ffdc86', face: 0xffcf6b, rug: 0xcfe8ff },
  { wall: '#ffd8c6', dot: '#ffc4ab', face: 0xffa98a, rug: 0xd8f0d0 },
  { wall: '#e3d6f6', dot: '#d3c1f0', face: 0xbba3e8, rug: 0xffe2ea },
  { wall: '#cfe6fb', dot: '#b8d9f7', face: 0x8fc0ef, rug: 0xfff4c9 },
];
const building = new THREE.Group();
scene.add(building);
const floors = new Map();          // id → floor
let order = [];                    // floor ids bottom → top
let current = null;                // floor id when inside

// lobby: doors, awning, sign
const lobby = new THREE.Group();
building.add(lobby);
add(lobby, rbox(FW + 0.8, 0.4, FD + 0.8, 0.12), 0xf3e4c4, 0, -0.2, 0);
const lobbyWall = [toon(0xfff3dc), toon(0xfff3dc), toon(0xfff3dc), toon(0xfff3dc), toon(0xfff3dc), toon(0xfff3dc)];
add(lobby, new THREE.BoxGeometry(FW, LOBBY - 0.3, FD), lobbyWall, 0, (LOBBY - 0.3) / 2, 0);
add(lobby, rbox(3.2, 2.3, 0.2, 0.08), 0x9a6b4a, 0, 1.15, FD / 2 + 0.05);                       // door frame
add(lobby, rbox(1.4, 2.05, 0.12, 0.05), 0xc6ecff, -0.72, 1.03, FD / 2 + 0.14);
add(lobby, rbox(1.4, 2.05, 0.12, 0.05), 0xc6ecff, 0.72, 1.03, FD / 2 + 0.14);
const awning = add(lobby, new THREE.BoxGeometry(5, 0.12, 1.6), toon(0xffffff, awningTex), 0, 2.5, FD / 2 + 0.75);
awning.rotation.x = 0.28;
for (const x of [-4.8, 4.8]) {
  add(lobby, rbox(2.2, 1.5, 0.14, 0.06), 0xc6ecff, x, 1.5, FD / 2 + 0.04);
  add(lobby, rbox(2.3, 0.3, 0.5, 0.08), 0xb5835a, x, 0.65, FD / 2 + 0.25);
  for (let k = 0; k < 5; k++) add(lobby, sphere(0.16, 10, 8), FLOWER[k % 4], x - 0.9 + k * 0.45, 0.88, FD / 2 + 0.3, { shadow: false });
}
const drawSign = (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#5a4636'; g.beginPath(); g.roundRect(0, 0, w, h, 40); g.fill();
  g.fillStyle = '#fff3dc'; g.font = '64px Jua'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('AGENT OFFICE', w / 2, h / 2 + 4);
};
const signTex = canvasTex(512, 128, drawSign);
add(lobby, new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }), 0, 2.95, FD / 2 + 0.2, { shadow: false });
export async function ready() {   // redraw the sign once the self-hosted font is in
  await document.fonts.load('64px Jua');
  drawSign(signTex.image.getContext('2d'), 512, 128);
  signTex.needsUpdate = true;
}

// roof
const roof = new THREE.Group();
building.add(roof);
add(roof, rbox(FW + 1.2, 0.35, FD + 1.2, 0.15), 0xfff3dc, 0, 0.17, 0);
const gableShape = new THREE.Shape([new THREE.Vector2(-FD / 2 - 0.7, 0), new THREE.Vector2(FD / 2 + 0.7, 0), new THREE.Vector2(0, 2.8)]);
add(roof, new THREE.ExtrudeGeometry(gableShape, { depth: FW + 1.4, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1, bevelSegments: 2 })
  .rotateY(Math.PI / 2).translate(-(FW + 1.4) / 2, 0.35, 0), 0xff8f7a);
add(roof, rbox(0.9, 1.8, 0.9, 0.1), 0xc4725c, 4, 2.2, -1.2);
const smoke = [];
for (let i = 0; i < 5; i++) {
  const m = add(roof, sphere(0.35), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }), 4, 3.2, -1.2, { shadow: false });
  m.userData.phase = i / 5;
  smoke.push(m);
}

// a floor = one project
function makeFloor(info, index) {
  const th = THEMES[index % THEMES.length];
  const g = new THREE.Group();
  building.add(g);
  const paper = toon(0xffffff, wallpaper(th.wall, th.dot));
  const face = toon(th.face);
  const trim = toon(0xffffff);

  add(g, rbox(FW + 0.6, 0.3, FD + 0.6, 0.1), trim, 0, -0.15, 0);
  add(g, new THREE.PlaneGeometry(FW, FD).rotateX(-Math.PI / 2), toon(0xffffff, woodTex), 0, 0.01, 0, { shadow: false }).receiveShadow = true;
  const H = FH - 0.3;
  // box faces: +x, -x, +y, -y, +z, -z
  add(g, new THREE.BoxGeometry(FW, H, 0.2), [face, face, trim, trim, paper, face], 0, H / 2, -FD / 2);
  add(g, new THREE.BoxGeometry(0.2, H, FD), [paper, face, trim, trim, face, face], -FW / 2, H / 2, 0);
  add(g, new THREE.BoxGeometry(0.2, H, FD), [face, paper, trim, trim, face, face], FW / 2, H / 2, 0);

  // elevator on the left wall
  add(g, rbox(0.12, 2.4, 1.9, 0.05), 0xd9c3a0, -FW / 2 + 0.12, 1.2, LANE);
  const doorL = add(g, rbox(0.06, 2.1, 0.8, 0.03), 0xb9c7d6, -FW / 2 + 0.2, 1.05, LANE - 0.4);
  const doorR = add(g, rbox(0.06, 2.1, 0.8, 0.03), 0xb9c7d6, -FW / 2 + 0.2, 1.05, LANE + 0.4);

  // decor
  add(g, new THREE.CylinderGeometry(3.6, 3.6, 0.02, 40).scale(1.5, 1, 0.75), th.rug, 0, 0.02, 1.5, { shadow: false }).receiveShadow = true;
  add(g, rbox(1.7, 1.9, 0.45, 0.06), 0xb5835a, -1.4, 0.95, -FD / 2 + 0.35);                     // bookshelf
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++)
    add(g, rbox(0.22, 0.42, 0.3, 0.03), [0xff8f7a, 0x8fc0ef, 0xffd45e, 0x8fd3b6][(r + k) % 4], -2 + k * 0.32 + r * 0.05, 0.4 + r * 0.58, -FD / 2 + 0.62);
  add(g, new THREE.CylinderGeometry(0.42, 0.42, 0.06, 28).rotateX(Math.PI / 2), 0xffffff, 1.6, 2.4, -FD / 2 + 0.13, { outline: 0.06 });   // clock
  add(g, rbox(0.05, 0.26, 0.03, 0.01), 0x5a4636, 1.6, 2.5, -FD / 2 + 0.18, { shadow: false });
  add(g, rbox(0.2, 0.05, 0.03, 0.01), 0x5a4636, 1.68, 2.4, -FD / 2 + 0.18, { shadow: false });
  add(g, rbox(1.6, 0.9, 0.6, 0.08), 0xfff3dc, 5.6, 0.45, -FD / 2 + 0.4);                        // coffee counter
  add(g, rbox(0.5, 0.6, 0.4, 0.08), 0x6d5a4a, 5.3, 1.2, -FD / 2 + 0.4);
  add(g, new THREE.CylinderGeometry(0.1, 0.08, 0.16, 12), 0xffffff, 6.1, 0.98, -FD / 2 + 0.4);
  for (const [x, z] of [[-6.3, 3.9], [6.3, 3.9], [6.4, -0.6]]) {
    add(g, new THREE.CylinderGeometry(0.3, 0.24, 0.5, 14), 0xe9a07a, x, 0.25, z);
    add(g, sphere(0.5), 0x7cc58a, x, 0.9, z, { outline: 0.04 });
  }

  // desks
  const desk = (x, z) => {
    add(g, rbox(1.4, 0.1, 0.8, 0.05), 0xe2b07e, x, 0.72, z);
    add(g, rbox(0.1, 0.68, 0.7, 0.03), 0xc99566, x - 0.6, 0.34, z);
    add(g, rbox(0.1, 0.68, 0.7, 0.03), 0xc99566, x + 0.6, 0.34, z);
    add(g, rbox(0.62, 0.42, 0.06, 0.04), 0xfdfaf3, x, 1.04, z - 0.18);
    const screen = add(g, new THREE.PlaneGeometry(0.52, 0.32), new THREE.MeshBasicMaterial({ color: 0x3d4a5c }), x, 1.04, z - 0.22, { shadow: false });
    screen.rotation.y = Math.PI;
    add(g, new THREE.CylinderGeometry(0.24, 0.2, 0.36, 16), 0xff9f8a, x, 0.18, z - 0.8);        // stool
    const seat = V(x, z - 0.8);
    return { screen, seat, rot: 0, owner: null, approach: null };
  };
  const ceoDesk = desk(-4.6, -3.2);
  const leadDesk = desk(1.6, -3.2);
  ceoDesk.approach = V(-3.5, -4.0);
  leadDesk.approach = V(2.7, -4.0);
  const staffDesks = [-5, -2.5, 0, 2.5, 5].map(x => desk(x, 0.7));

  // lounge in front: sofa, armchairs, round table, lamp
  add(g, rbox(3, 0.45, 0.85, 0.16), 0xff9f8a, 0, 0.32, 2.35);
  add(g, rbox(3, 0.8, 0.3, 0.14), 0xff9f8a, 0, 0.62, 1.95);
  for (const s of [-1, 1]) add(g, rbox(0.3, 0.6, 0.85, 0.12), 0xf48772, s * 1.5, 0.48, 2.35);
  for (let k = 0; k < 2; k++) add(g, rbox(0.55, 0.45, 0.18, 0.08), [0xfff3dc, 0xcfe6fb][k], -0.6 + k * 1.2, 0.75, 2.12).rotation.x = -0.25;
  add(g, new THREE.CylinderGeometry(0.6, 0.6, 0.08, 28), 0xe2b07e, 0, 0.5, 3.5);
  add(g, new THREE.CylinderGeometry(0.08, 0.14, 0.5, 12), 0xc99566, 0, 0.25, 3.5);
  add(g, new THREE.CylinderGeometry(0.11, 0.09, 0.14, 12), 0xffffff, 0.2, 0.61, 3.45);
  for (const s of [-1, 1]) {
    const chair = new THREE.Group();
    chair.position.set(s * 2.3, 0, 3.4);
    chair.rotation.y = -s * 1.2;
    add(chair, rbox(1, 0.42, 0.9, 0.16), 0xffd45e, 0, 0.3, 0);
    add(chair, rbox(1, 0.75, 0.25, 0.12), 0xffd45e, 0, 0.6, -0.36);
    g.add(chair);
  }
  add(g, new THREE.CylinderGeometry(0.04, 0.05, 1.7, 8), 0x8a6a52, -4.4, 0.85, 3.6);
  add(g, new THREE.CylinderGeometry(0.22, 0.34, 0.36, 16, 1, true), 0xfff3dc, -4.4, 1.82, 3.6);

  // facade: hinged on its left edge so it can swing open
  const hinge = new THREE.Group();
  hinge.position.set(-FW / 2 - 0.1, 0, FD / 2);
  g.add(hinge);
  const fg = new THREE.Group();
  fg.position.x = FW / 2 + 0.1;
  hinge.add(fg);
  const glass = new THREE.MeshBasicMaterial({ color: 0xcfefff, transparent: true, opacity: 0.42, depthWrite: false });
  const WIN = [-4.8, -1.6, 1.6, 4.8], WW = 2.3, WY0 = 0.85, WH = 1.55;
  add(fg, new THREE.BoxGeometry(FW + 0.2, WY0, 0.2), face, 0, WY0 / 2, 0);
  add(fg, new THREE.BoxGeometry(FW + 0.2, H - WY0 - WH, 0.2), face, 0, WY0 + WH + (H - WY0 - WH) / 2, 0);
  const edges = [-FW / 2 - 0.1, ...WIN.flatMap(x => [x - WW / 2, x + WW / 2]), FW / 2 + 0.1];
  for (let i = 0; i < edges.length; i += 2) {
    const w = edges[i + 1] - edges[i];
    add(fg, new THREE.BoxGeometry(w, WH, 0.2), face, (edges[i] + edges[i + 1]) / 2, WY0 + WH / 2, 0);
  }
  for (const x of WIN) {
    add(fg, rbox(WW + 0.2, 0.14, 0.4, 0.05), trim, x, WY0, 0.15);
    add(fg, new THREE.PlaneGeometry(WW, WH), glass, x, WY0 + WH / 2, 0.02, { shadow: false });
    add(fg, new THREE.BoxGeometry(0.08, WH, 0.05), trim, x, WY0 + WH / 2, 0.06);
    add(fg, rbox(WW - 0.3, 0.24, 0.32, 0.06), 0xb5835a, x, WY0 - 0.2, 0.32);                   // flower box
    for (let k = 0; k < 4; k++) add(fg, sphere(0.13, 10, 8), FLOWER[(k + index) % 4], x - 0.7 + k * 0.47, WY0 - 0.02, 0.34, { shadow: false });
  }

  // exterior sign + alert balloon
  const signEl = document.createElement('button');
  signEl.className = 'floor-sign';
  signEl.innerHTML = `<span class="fl"></span><span class="nm"></span><span class="st"></span>`;
  signEl.onclick = () => enter(info.id);
  const signObj = new CSS2DObject(signEl);
  signObj.position.set(FW / 2 + 0.6, FH / 2, FD / 2);
  signObj.center.set(0, 0.5);
  g.add(signObj);
  const alertEl = document.createElement('div');
  alertEl.className = 'alert-balloon';
  alertEl.textContent = '!';
  const alertObj = new CSS2DObject(alertEl);
  alertObj.position.set(-FW / 2 - 0.9, FH * 0.5, FD / 2);
  g.add(alertObj);

  const f = { id: info.id, info, g, hinge, glass, doorL, doorR, ceoDesk, leadDesk, staffDesks, signEl, signObj, alertObj,
              agents: new Map(), live: new Set(), asks: new Map(), busy: false, lift: 0, open: 0, base: 0, made: 0 };
  f.me = villager(f, '나', '대표', 'cat', ceoDesk.seat);
  sitAt(f.me, ceoDesk);
  f.lead = villager(f, LEAD_NAMES[index % LEAD_NAMES.length], '팀장', SPECIES_ORDER[(index + 1) % SPECIES_ORDER.length], leadDesk.seat);
  sitAt(f.lead, leadDesk);
  f.agents.set('lead', f.lead);
  f.lead.idleT = 4 + Math.random() * 6;
  return f;
}

// ---------- villagers ----------
const SPECIES = {
  bear: { fur: 0xc9925f, snout: 0xf1d3b0 },
  cat: { fur: 0xf3b562, snout: 0xfff1dc },
  rabbit: { fur: 0xf6efe6, snout: 0xffffff },
  frog: { fur: 0x8fd18a, snout: 0xc9efb8 },
  pup: { fur: 0xe6c9a8, snout: 0xfff1dc },
};
const SPECIES_ORDER = Object.keys(SPECIES);
const RANKS = { 대표: 0xffd45e, 팀장: 0x5b8def, 대리: 0x7cc58a, 사원: 0xff9fb2 };
const LEAD_NAMES = ['보리', '마루', '두부', '호두', '단비'];
const STAFF_NAMES = ['콩이', '모모', '라떼', '쿠키', '토리', '버터', '감자', '솜이', '찹쌀', '도토리', '깨비', '나비'];

function villager(f, name, rank, species, at) {
  const sp = SPECIES[species];
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  add(body, sphere(0.33), RANKS[rank], 0, 0.42, 0, { outline: 0.05 }).scale.set(1, 0.95, 0.88);
  const head = new THREE.Group();
  head.position.y = 1.0;
  body.add(head);
  add(head, sphere(0.38, 24, 18), sp.fur, 0, 0, 0, { outline: 0.045 }).scale.set(1.05, 0.95, 0.95);
  if (species !== 'frog') add(head, sphere(0.14), sp.snout, 0, -0.08, 0.31).scale.set(1.3, 0.85, 0.8);
  add(head, sphere(0.045, 10, 8), 0x5a4636, 0, -0.04, 0.42, { shadow: false });
  const frog = species === 'frog';
  const [ex, ey, ez] = frog ? [0.17, 0.33, 0.19] : [0.14, 0.06, 0.33];
  for (const s of [-1, 1]) {
    const eye = add(head, sphere(0.055, 12, 10), 0x2b211b, s * ex, ey, ez, { shadow: false });
    eye.scale.set(0.85, 1.25, 0.6);
    add(head, sphere(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), s * ex - 0.01, ey + 0.03, ez + 0.04, { shadow: false });
    add(head, sphere(0.06, 10, 8), 0xffa3a3, s * 0.23, -0.07, 0.29, { shadow: false }).scale.set(1, 0.6, 0.4);
    if (species === 'bear') add(head, sphere(0.12), sp.fur, s * 0.27, 0.3, -0.02, { outline: 0.08 });
    if (species === 'cat') add(head, new THREE.ConeGeometry(0.12, 0.24, 4), sp.fur, s * 0.22, 0.36, 0, { outline: 0.08 }).rotation.z = -s * 0.3;
    if (species === 'rabbit') {
      const ear = add(head, new THREE.CapsuleGeometry(0.07, 0.38, 4, 10), sp.fur, s * 0.13, 0.5, -0.04, { outline: 0.08 });
      ear.rotation.z = -s * 0.15;
    }
    if (frog) add(head, sphere(0.13), sp.fur, s * 0.17, 0.3, 0.08, { outline: 0.06 });
    if (species === 'pup') add(head, sphere(0.12), 0xb98a5e, s * 0.36, 0.05, -0.02, { outline: 0.06 }).scale.set(0.6, 1.4, 0.8);
  }
  if (rank === '대표') {
    add(head, new THREE.CylinderGeometry(0.17, 0.2, 0.14, 5, 1, true), 0xffd45e, 0, 0.42, 0, { outline: 0.06 });
    for (let i = 0; i < 5; i++) add(head, sphere(0.04, 8, 6), 0xff8f7a, Math.cos(i * 1.256) * 0.18, 0.5, Math.sin(i * 1.256) * 0.18, { shadow: false });
  }
  if (rank === '팀장') add(body, new THREE.ConeGeometry(0.07, 0.3, 4), 0x2f4f9c, 0, 0.55, 0.3).rotation.x = Math.PI + 0.25;
  if (rank === '대리') add(body, new THREE.TorusGeometry(0.22, 0.06, 8, 20).rotateX(Math.PI / 2), 0xffd45e, 0, 0.72, 0);
  const arms = [-1, 1].map(s => add(body, sphere(0.11), sp.fur, s * 0.33, 0.48, 0.06, { outline: 0.08 }));
  for (const s of [-1, 1]) add(body, sphere(0.11), sp.fur, s * 0.14, 0.07, 0.06).scale.set(1, 0.6, 1.2);

  const el = document.createElement('div');
  el.className = 'tag';
  el.innerHTML = `<div class="bubble"></div><div class="doing"></div><div class="name"><b></b><i class="rank r-${rank}">${rank}</i></div>`;
  el.querySelector('b').textContent = name;
  const label = new CSS2DObject(el);
  label.position.y = 1.85;
  g.add(label);
  g.position.copy(at);
  f.g.add(g);
  const a = { f, name, rank, g, body, head, arms, label, path: [], q: Promise.resolve(), exitPts: null,
              bubble: el.querySelector('.bubble'), doing: el.querySelector('.doing'), phase: Math.random() * 6 };
  f.live.add(a);
  label.visible = current === f.id;
  return a;
}
function sitAt(a, d) { a.desk = d; d.owner = a; a.g.position.copy(d.seat); a.g.rotation.y = d.rot; a.exitPts = d.approach ? [d.approach] : null; }

function route(a, dest, approach) {
  const pts = [...(a.exitPts || [])];
  const from = pts.length ? pts.at(-1) : a.g.position;
  pts.push(V(from.x, LANE));
  const entry = approach || dest;
  pts.push(V(entry.x, LANE));
  if (approach) pts.push(approach.clone());
  pts.push(dest.clone());
  a.exitPts = approach ? [approach] : null;
  return pts;
}
function go(a, dest, look) {
  const atDesk = a.desk && dest === a.desk.seat;
  return new Promise(done => {
    a.sitting = false;
    a.path = route(a, dest, atDesk ? a.desk.approach : null);
    a.look = atDesk ? a.desk.rot : look;
    a.arrive = done;
  });
}
const face = (a, b) => a.g.rotation.y = Math.atan2(b.g.position.x - a.g.position.x, b.g.position.z - a.g.position.z);
function say(a, text, ms = 2600) {
  a.bubble.textContent = text;
  a.bubble.classList.add('on');
  clearTimeout(a.sayT);
  a.sayT = setTimeout(() => a.bubble.classList.remove('on'), ms);
  return sleep(ms);
}
function iconText(el, icon, text) {
  el.innerHTML = ICON[icon] || '';
  el.append(text);
}
const act = (a, fn) => a.q = a.q.then(fn).catch(console.error);
const toDesk = async a => { await go(a, a.desk.seat); a.typing = true; a.sitting = true; };
function remove(a) {
  a.g.remove(a.label);
  a.f.g.remove(a.g);
  a.f.live.delete(a);
  if (a.desk) { a.desk.owner = null; a.desk.screen.material.color.setHex(0x3d4a5c); }
}
async function elevator(f, open) {
  f.elevBusy = (f.elevBusy || 0) + (open ? 1 : -1);
  if (!open && f.elevBusy > 0) return;
  const from = f.doorL.position.z, to = LANE - 0.4 - (open ? 0.75 : 0);
  await tween(350, t => { f.doorL.position.z = from + (to - from) * t; f.doorR.position.z = 2 * LANE - f.doorL.position.z; });
}

// ---------- events → behavior ----------
// returns a short log line (or null) so the UI can record it
export function handle(e) {
  const f = floors.get(e.floor);
  if (!f) return null;
  const a = f.agents.get(e.agent);
  const lead = f.lead;
  switch (e.kind) {
    case 'busy':
      setBusy(f, true);
      return null;
    case 'start':
      act(lead, () => { say(lead, '바로 시작하겠습니다!'); });
      return null;
    case 'say':
      if (a) act(a, () => { say(a, e.text, 3800); });
      return null;
    case 'work':
      if (!a) return null;
      act(a, async () => { iconText(a.doing, e.icon, e.text); if (!a.typing) await toDesk(a); });
      return { who: a, text: e.text, tone: 'work', icon: e.icon };
    case 'hire': {
      const sp = SPECIES_ORDER[(f.made + 2) % SPECIES_ORDER.length];
      const s = villager(f, STAFF_NAMES[f.made++ % STAFF_NAMES.length], f.made % 3 ? '사원' : '대리', sp, ELEV.clone());
      s.g.rotation.y = Math.PI / 2;
      // ponytail: 5 desks per floor; extra staff share the last desk — grow the floor plan when swarms get big
      s.desk = f.staffDesks.find(d => !d.owner) || f.staffDesks.at(-1);
      s.desk.owner = s;
      f.agents.set(e.agent, s);
      act(s, async () => {
        await elevator(f, true);
        await go(s, V(lead.desk.seat.x - 0.9 + (f.made % 3) * 0.9, -2.2)); face(s, lead);
        elevator(f, false);
        say(s, `"${e.text}" 맡을게요!`, 1600);
        await sleep(900);
        await toDesk(s);
      });
      return { who: s, text: `출근 · ${e.text}`, tone: 'hire' };
    }
    case 'leave':
      if (!a) return null;
      f.agents.delete(e.agent);
      act(a, async () => {
        a.typing = false; a.doing.textContent = '';
        await go(a, V(lead.desk.seat.x - 0.9 + (f.made % 3) * 0.9, -2.2)); face(a, lead);
        say(a, '완료 보고드려요!', 1100);
        await sleep(900);
        say(a, '퇴근합니다! 👋', 1200);
        await elevator(f, true);
        await go(a, ELEV.clone());
        elevator(f, false);
        remove(a);
      });
      return { who: a, text: '보고하고 퇴근', tone: 'leave' };
    case 'ask': {
      const who = a || lead;
      f.asks.set(e.id, who);
      refreshAlert(f);
      act(who, async () => {
        who.typing = false;
        const slot = [...f.asks.values()].indexOf(who);
        await go(who, V(-4.6 + 1.1 + slot * 0.85, -2.2)); face(who, f.me);
        iconText(who.bubble, e.icon, e.text);
        who.bubble.classList.add('on', 'ask');
        who.asking = true;
      });
      return { who, text: `승인 요청 · ${e.text}`, tone: 'ask', icon: e.icon };
    }
    case 'answer': {
      const who = f.asks.get(e.id);
      f.asks.delete(e.id);
      refreshAlert(f);
      if (!who) return null;
      act(who, async () => {
        who.asking = false;
        who.bubble.classList.remove('ask');
        say(who, e.ok ? '감사합니다!' : '알겠습니다…', 900);
        await sleep(700);
        await toDesk(who);
      });
      return { who, text: e.ok ? '승인됨' : '거절됨', tone: e.ok ? 'ok' : 'no' };
    }
    case 'done':
      act(lead, async () => {
        lead.typing = false; lead.doing.textContent = '';
        await go(lead, V(-4.6 - 1.1, -2.2)); face(lead, f.me);
        say(lead, e.ok ? e.text : `문제가 있었어요: ${e.text}`, 4200);
        await sleep(2600);
        say(f.me, '수고했어요!', 1500);
        await sleep(900);
        await go(lead, lead.desk.seat);
      });
      return { who: lead, text: e.text, tone: e.ok ? 'done' : 'no' };
    case 'exit':
      setBusy(f, false);
      for (const [id, s] of f.agents) {   // stopped mid-task: everyone left goes home
        if (id === 'lead') continue;
        f.agents.delete(id);
        act(s, async () => {
          s.typing = s.asking = false; s.bubble.classList.remove('on', 'ask'); s.doing.textContent = '';
          await go(s, ELEV.clone()); remove(s);
        });
      }
      act(lead, async () => { lead.typing = false; lead.doing.textContent = ''; });
      return e.code ? { who: lead, text: `작업이 멈췄어요 (코드 ${e.code}) ${e.text || ''}`, tone: 'no' } : null;
  }
  return null;
}
function setBusy(f, on) {
  f.busy = on;
  f.glass.color.setHex(on ? 0xffe7a3 : 0xcfefff);
  f.glass.opacity = on ? 0.62 : 0.42;
  refreshSign(f);
}
function refreshAlert(f) {
  f.alertObj.element.textContent = f.asks.size > 1 ? `!${f.asks.size}` : '!';
  f.alertObj.visible = f.asks.size > 0 && current !== f.id;
  refreshSign(f);
}
function refreshSign(f) {
  const n = order.indexOf(f.id) + 2;
  f.signEl.querySelector('.fl').textContent = `${n}F`;
  f.signEl.querySelector('.nm').textContent = f.info.name;
  const st = f.signEl.querySelector('.st');
  st.textContent = f.asks.size ? '승인 대기' : f.busy ? '작업 중' : '쉬는 중';
  st.dataset.state = f.asks.size ? 'ask' : f.busy ? 'busy' : 'idle';
}
export const floorState = id => {
  const f = floors.get(id);
  return f && { busy: f.busy, asks: f.asks.size, staff: f.agents.size - 1, lead: f.lead.name };
};

// ---------- floors in / out ----------
export function setFloors(list) {
  for (const [id, f] of floors) if (!list.some(x => x.id === id)) { building.remove(f.g); floors.delete(id); }
  order = list.map(x => x.id);
  list.forEach((info, i) => {
    let f = floors.get(info.id);
    if (!f) { f = makeFloor(info, i); floors.set(info.id, f); }
    f.info = info;
    f.base = LOBBY + i * FH;
    refreshSign(f);
    refreshAlert(f);
  });
  roofBase = LOBBY + order.length * FH;
  if (current && !floors.has(current)) current = null;
  layout();
  if (!current) frameOutside(600);
}
let roofBase = LOBBY;
function layout() {
  for (const f of floors.values()) {
    f.g.position.y = f.base + f.lift;
    f.g.visible = f.lift < 11;
    f.hinge.rotation.y = -1.9 * f.open;
    f.hinge.visible = f.open < 0.98;
    const inside = current === f.id;
    for (const a of f.live) a.label.visible = inside;
    f.signObj.visible = !current;
    f.alertObj.visible = f.asks.size > 0 && !inside;
  }
  roof.position.y = roofBase + roofLift;
  roof.visible = roofLift < 11;
}
let roofLift = 0;

function frameOutside(ms) {
  const h = roofBase + 3.5;
  const dist = Math.max(h * 1.9, 36);
  const target = new THREE.Vector3(0, h * 0.45, 0);
  return fly(target.clone().add(new THREE.Vector3(0.42, 0.32, 1).normalize().multiplyScalar(dist)), target, ms);
}
let flying = null;
function fly(pos, target, ms) {
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  controls.enabled = false;
  const run = tween(ms, t => {
    camera.position.lerpVectors(p0, pos, t);
    controls.target.lerpVectors(t0, target, t);
  }).then(() => { if (flying === run) controls.enabled = true; });
  flying = run;
  return run;
}

export async function enter(id) {
  if (id === current) return;
  const prev = current;
  current = id;
  onChange?.(id);
  const idx = id ? order.indexOf(id) : order.length;
  const lifts = [...floors.values()].map(f => ({ f, from: f.lift, to: order.indexOf(f.id) > idx ? 14 : 0, of: f.open, ot: f.id === id ? 1 : 0 }));
  const r0 = roofLift, r1 = id ? 14 : 0;
  if (id) {
    const f = floors.get(id);
    fly(new THREE.Vector3(0, f.base + 14, 14.5), new THREE.Vector3(0, f.base, 0.2), 1100);
  } else frameOutside(1100);
  if (prev && floors.has(prev)) floors.get(prev).alertObj.visible = floors.get(prev).asks.size > 0;
  await tween(1000, t => {
    for (const x of lifts) { x.f.lift = x.from + (x.to - x.from) * t; x.f.open = x.of + (x.ot - x.of) * t; }
    roofLift = r0 + (r1 - r0) * t;
    layout();
  });
}
export const currentFloor = () => current;
let onChange = null;
export const onFloorChange = cb => onChange = cb;

// click a floor from outside to enter it
const ray = new THREE.Raycaster();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', e => downAt = [e.clientX, e.clientY]);
renderer.domElement.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5 || current) return;
  ray.setFromCamera(new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  const hit = ray.intersectObjects([...floors.values()].map(f => f.g), true)[0];
  if (!hit) return;
  for (const f of floors.values()) {
    let o = hit.object;
    while (o && o !== f.g) o = o.parent;
    if (o) return enter(f.id);
  }
});

// ---------- loop ----------
const SPEED = 3.4;
const clock = new THREE.Clock();
camera.position.set(30, 20, 40);
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
  const now = performance.now();
  for (const tw of tweens) {
    const k = Math.min(1, (now - tw.t0) / tw.ms);
    tw.step(ease(k));
    if (k >= 1) { tweens.delete(tw); tw.done(); }
  }
  for (const f of floors.values()) {
    for (const a of f.live) {
      const p = a.g.position;
      a.head.rotation.z = 0;
      let bob = 0, swing = 0, squash = 1;
      if (a.path.length) {
        const d = a.path[0].clone().sub(p); d.y = 0;
        const dist = d.length(), step = SPEED * dt;
        if (dist <= step) {
          p.copy(a.path.shift());
          if (!a.path.length) { if (a.look !== undefined) a.g.rotation.y = a.look; a.arrive(); }
        } else {
          p.addScaledVector(d.normalize(), step);
          a.g.rotation.y = Math.atan2(d.x, d.z);
        }
        bob = Math.abs(Math.sin(t * 12 + a.phase)) * 0.12;
        swing = Math.sin(t * 12 + a.phase) * 0.12;
      } else if (a.asking) {
        bob = Math.abs(Math.sin(t * 7)) * 0.35;
        squash = 1 - Math.max(0, 0.12 - bob) * 0.8;
        swing = 0.18;
      } else if (a.typing) {
        a.head.rotation.z = Math.sin(t * 2.2 + a.phase) * 0.06;
        swing = Math.sin(t * 26 + a.phase) * 0.025;
      } else {
        squash = 1 + Math.sin(t * 2 + a.phase) * 0.015;    // breathing
      }
      p.y = (a.sitting && !a.path.length ? 0.34 : 0) + bob;
      a.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      a.arms[0].position.y = 0.48 + swing;
      a.arms[1].position.y = 0.48 - swing;
      if (a.desk) a.desk.screen.material.color.setHex(a.typing && a.sitting && !a.path.length ? (Math.sin(t * 9 + a.phase) > 0 ? 0x9fd8ff : 0x8ccbf5) : 0x3d4a5c);
    }
    // idle lead fetches coffee now and then
    const lead = f.lead;
    if (!f.busy && !lead.asking && !lead.path.length && (lead.idleT -= dt) < 0) {
      lead.idleT = 10 + Math.random() * 10;
      act(lead, async () => {
        lead.typing = false;
        await go(lead, V(5.2, -2.6), Math.PI);
        say(lead, ['커피 한 잔 ☕', '오늘 날씨 좋다~', '음~ 좋은 향기'][Math.random() * 3 | 0], 1800);
        await sleep(2600);
        if (!f.busy) await go(lead, lead.desk.seat);
      });
    }
  }
  for (const s of smoke) {
    const k = (t * 0.25 + s.userData.phase) % 1;
    s.position.set(4 + Math.sin(k * 6) * 0.3, 3.2 + k * 3, -1.2);
    s.scale.setScalar(0.5 + k * 1.2);
    s.material.opacity = 0.75 * (1 - k);
  }
  for (const c of clouds) { c.position.x += c.userData.speed * dt; if (c.position.x > 70) c.position.x = -70; }
  sway.forEach((g, i) => g.rotation.z = Math.sin(t * 0.9 + i) * 0.025);
  controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
});
