// The building: an island, a lobby, one floor per project, a roof. Enter a floor and its front wall swings
// open like a dollhouse while the floors above lift away. Villagers act out OfficeEvents on their own floor.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ICON } from './icons.js';

// ---------- renderer ----------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.5, 400);   // near 0.5: depth precision for thin layers
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
controls.enableDamping = true;   // left drag orbits, right drag (or shift+drag) pans
controls.minDistance = 6;
controls.maxDistance = 70;          // frameOutside widens this as floors stack up
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

const hemi = new THREE.HemisphereLight(0xfff4e0, 0x9fc9a8, 1.6);
scene.add(hemi);
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
const ownToon = (color, map) => new THREE.MeshToonMaterial({ color, gradientMap: ramp, map });   // uncached, safe to recolor
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

// shop looks: shared wall/floor textures ('wall-theme' / 'floor-wood' fall back to each floor's own)
const WALL_TEX = {
  'wall-stripe': canvasTex(128, 128, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#bfe6d4' : '#d6f2e6'; g.fillRect(i * 16, 0, 16, h); }
  }, [6, 1.6]),
  'wall-wood': canvasTex(256, 128, (g, w, h) => {
    const tones = ['#d9b48a', '#dfbb92', '#d3ad82', '#e2c29b'];
    for (let i = 0; i < 8; i++) { g.fillStyle = tones[i % 4]; g.fillRect(i * 32, 0, 32, h); g.fillStyle = '#c99e6e'; g.fillRect(i * 32, 0, 3, h); }
  }, [3, 1]),
  'wall-night': canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#3b4a8a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffe27a';
    for (let k = 0; k < 6; k++) {
      const cx = (k * 47 + 20) % w, cy = (k * 71 + 24) % h, r = k % 2 ? 5 : 8;
      g.beginPath();
      for (let p = 0; p < 10; p++) { const a = p * Math.PI / 5 - Math.PI / 2, q = p % 2 ? r * 0.45 : r; g.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); }
      g.fill();
    }
  }, [6, 1.6]),
};
const FLOOR_TEX = {
  'floor-tile': canvasTex(256, 256, (g, w, h) => {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#bfe6d4' : '#fff3dc'; g.fillRect(x * 64, y * 64, 64, 64); }
    g.fillStyle = '#e6d8bc';
    for (let i = 0; i < 4; i++) { g.fillRect(i * 64, 0, 2, h); g.fillRect(0, i * 64, w, 2); }
  }, [3, 2]),
  'floor-carpet': canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d9c9f0'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = i % 2 ? '#e3d6f6' : '#cdbbe8'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  }, [3, 2]),
};
const LOOK_FACE = { small: 0xd98b6a, tower: 0x8fb8dc };   // house keeps each floor's THEMES face
let look = { building: 'house', wall: 'wall-theme', floor: 'floor-wood', furniture: [] };

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
function tree(x, z, s = 1, tint = 0x7cc58a, parent = island) {
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.scale.setScalar(s);
  add(g, new THREE.CylinderGeometry(0.22, 0.32, 1.6, 10), 0x9a6b4a, 0, 0.8, 0);
  add(g, sphere(1.15), tint, 0, 2.2, 0, { outline: 0.03 });
  add(g, sphere(0.85), tint, 0.55, 2.9, 0.2, { outline: 0.04 });
  add(g, sphere(0.75), tint, -0.6, 2.75, -0.1, { outline: 0.04 });
  for (let i = 0; i < 3; i++) add(g, sphere(0.12, 10, 8), 0xff9e9e, Math.sin(i * 2.3) * 0.9, 2.4 + i * 0.25, 0.85);
  parent.add(g);
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
const lampMat = new THREE.MeshBasicMaterial({ color: 0xf3ecd2 });
const haloMat = new THREE.MeshBasicMaterial({ color: 0xffd97a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
function lamp(x, z) {
  add(island, new THREE.CylinderGeometry(0.07, 0.09, 2.4, 8), 0x4a5a6a, x, 1.2, z);
  add(island, sphere(0.28), lampMat, x, 2.5, z, { shadow: false });
  add(island, sphere(0.9), haloMat, x, 2.5, z, { shadow: false });
}
lamp(-3.6, 9); lamp(3.6, 9);
add(island, rbox(2.2, 0.16, 0.6, 0.06), 0xc98f5a, 5.5, 0.55, 12.2);                 // bench
add(island, rbox(2.2, 0.6, 0.12, 0.05), 0xc98f5a, 5.5, 0.9, 11.95);
// rim: bushes and rocks all the way round
for (let i = 0; i < 28; i++) {
  const a = i * Math.PI * 2 / 28, r = 19.5 + (i % 4) * 0.8, x = Math.cos(a) * r, z = Math.sin(a) * r + 2;
  if (i % 3) add(island, sphere(0.7 + (i % 2) * 0.3, 12, 10), [0x7cc58a, 0x6fbf86, 0x9ad08f][i % 3], x, 0.3, z, { outline: 0.04 }).scale.y = 0.75;
  else add(island, new THREE.DodecahedronGeometry(0.6), 0xb9b2a6, x, 0.25, z);
}
// pond with lily pads
add(island, new THREE.CylinderGeometry(2.2, 2.2, 0.06, 32).scale(1.3, 1, 1), 0x9fd8f0, -8, 0.04, 19, { shadow: false }).receiveShadow = true;
for (const [x, z] of [[-9, 18.6], [-7.2, 19.6], [-8.4, 20]]) add(island, new THREE.CylinderGeometry(0.35, 0.35, 0.03, 14), 0x7cc58a, x, 0.09, z, { shadow: false });
// little islands drifting far out in the sky
const islets = [];
for (const [x, y, z, s] of [[-70, 4, -30, 1.4], [72, 10, -20, 1.1], [-62, -8, 40, 1], [60, -4, 50, 1.2], [8, 14, -80, 1.6]]) {
  const g = new THREE.Group();
  g.position.set(x, y, z); g.scale.setScalar(s); g.userData.y = y;
  add(g, new THREE.CylinderGeometry(4, 3.4, 0.8, 20), [toon(0xb08a64), toon(0x9fd685), toon(0x9fd685)], 0, -0.4, 0);
  add(g, new THREE.ConeGeometry(3.4, 4, 20).rotateX(Math.PI), 0x9a7656, 0, -2.8, 0);
  add(g, sphere(0.6, 12, 10), 0x6fbf86, -1.8, 0.2, 1.2, { outline: 0.04 });
  tree(0.8, -0.5, 0.9, 0x9ad08f, g);
  scene.add(g);
  islets.push(g);
}

const clouds = [];
const cloudMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: ramp, transparent: true, opacity: 0.95 });
for (let i = 0; i < 7; i++) {
  const c = new THREE.Group();
  const mat = cloudMat;
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
add(lobby, rbox(FW + 0.8, 0.4, FD + 0.8, 0.12), 0xf3e4c4, 0, -0.16, 0);   // top 0.04 above the grass, not coplanar
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
const roofs = { house: new THREE.Group(), small: new THREE.Group(), tower: new THREE.Group() };   // one per building tier
roof.add(roofs.house, roofs.small, roofs.tower);
roofs.small.visible = roofs.tower.visible = false;
const gableShape = new THREE.Shape([new THREE.Vector2(-FD / 2 - 0.7, 0), new THREE.Vector2(FD / 2 + 0.7, 0), new THREE.Vector2(0, 2.8)]);
add(roofs.house, new THREE.ExtrudeGeometry(gableShape, { depth: FW + 1.4, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1, bevelSegments: 2 })
  .rotateY(Math.PI / 2).translate(-(FW + 1.4) / 2, 0.35, 0), 0xff8f7a);
add(roofs.house, rbox(0.9, 1.8, 0.9, 0.1), 0xc4725c, 4, 2.2, -1.2);
const smoke = [];
for (let i = 0; i < 5; i++) {
  const m = add(roofs.house, sphere(0.35), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }), 4, 3.2, -1.2, { shadow: false });
  m.userData.phase = i / 5;
  smoke.push(m);
}
for (const [g, c] of [[roofs.small, 0xc4725c], [roofs.tower, 0xe8eef5]]) for (const s of [-1, 1]) {   // low parapet
  add(g, new THREE.BoxGeometry(FW + 1.2, 0.45, 0.2), c, 0, 0.57, s * (FD / 2 + 0.5));
  add(g, new THREE.BoxGeometry(0.2, 0.45, FD + 1.2), c, s * (FW / 2 + 0.5), 0.57, 0);
}
for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) add(roofs.small, new THREE.CylinderGeometry(0.06, 0.06, 0.8, 8), 0x8a7a6a, 3.5 + x, 0.75, -1.5 + z);
add(roofs.small, new THREE.CylinderGeometry(0.85, 0.85, 1.3, 24), 0x9fb8c9, 3.5, 1.8, -1.5, { outline: 0.03 });   // water tank
add(roofs.small, new THREE.ConeGeometry(0.95, 0.4, 24), 0x8aa5b8, 3.5, 2.65, -1.5, { outline: 0.03 });
const heliTex = canvasTex(128, 128, g => {
  g.fillStyle = '#6b7a8c'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
  g.strokeStyle = '#ffd45e'; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 52, 0, 7); g.stroke();
  g.fillStyle = '#ffffff'; g.fillRect(40, 34, 12, 60); g.fillRect(76, 34, 12, 60); g.fillRect(40, 58, 48, 12);
});
add(roofs.tower, new THREE.PlaneGeometry(5.5, 5.5).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: heliTex, gradientMap: ramp, transparent: true }), -2, 0.37, 0, { shadow: false }).receiveShadow = true;
add(roofs.tower, rbox(0.6, 0.3, 0.6, 0.06), 0xb9c7d6, 4.5, 0.5, -2.5);
add(roofs.tower, new THREE.CylinderGeometry(0.05, 0.1, 3, 8), 0xb9c7d6, 4.5, 2.1, -2.5);   // antenna
add(roofs.tower, rbox(0.8, 0.06, 0.06, 0.02), 0xb9c7d6, 4.5, 2.6, -2.5);
add(roofs.tower, sphere(0.14), new THREE.MeshBasicMaterial({ color: 0xff6b6b }), 4.5, 3.65, -2.5, { shadow: false });

// shop furniture: built hidden on every floor, setLook toggles it
const BULB = [0xffd45e, 0xff8f7a, 0x8fd3b6];
const bulbMats = BULB.map(color => new THREE.MeshBasicMaterial({ color }));
function makeFurniture(g) {
  const item = (x, z, ry) => { const o = new THREE.Group(); o.position.set(x, 0, z); o.rotation.y = ry; o.visible = false; g.add(o); return o; };
  // each item is built facing local +z
  const aq = item(FW / 2 - 0.55, 2.2, -Math.PI / 2);
  add(aq, rbox(1.4, 0.7, 0.6, 0.06), 0xb5835a, 0, 0.35, 0, { outline: 0.03 });
  add(aq, rbox(1.2, 0.08, 0.4, 0.03), 0xf3e4c4, 0, 0.74, 0);   // sand
  for (let k = 0; k < 3; k++) add(aq, new THREE.ConeGeometry(0.06, 0.4, 6), 0x7cc58a, -0.45 + k * 0.4, 0.95, -0.1 + (k % 2) * 0.12);
  for (let k = 0; k < 3; k++) add(aq, sphere(0.07, 10, 8), [0xff9f6b, 0xffd45e, 0xff8f7a][k], -0.3 + k * 0.3, 1.0 + (k % 2) * 0.15, 0.05, { shadow: false }).scale.set(1.5, 1, 0.6);
  add(aq, new THREE.BoxGeometry(1.3, 0.7, 0.5), new THREE.MeshBasicMaterial({ color: 0x8fd0f0, transparent: true, opacity: 0.45, depthWrite: false }), 0, 1.05, 0, { shadow: false });
  add(aq, rbox(1.4, 0.08, 0.6, 0.03), 0xfff3dc, 0, 1.44, 0);
  const ar = item(3.75, -FD / 2 + 0.4, 0);
  add(ar, rbox(0.9, 1.8, 0.6, 0.08), 0xb48ae8, 0, 0.9, 0, { outline: 0.03 });
  add(ar, rbox(0.94, 0.3, 0.64, 0.06), 0xffd45e, 0, 1.68, 0);   // marquee
  add(ar, new THREE.PlaneGeometry(0.62, 0.46), new THREE.MeshBasicMaterial({ color: 0x7fe0c4 }), 0, 1.24, 0.31, { shadow: false });
  add(ar, rbox(0.9, 0.1, 0.32, 0.04), 0x9a72d6, 0, 0.92, 0.42);   // control deck
  add(ar, new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), 0x5a4636, -0.2, 1.02, 0.44);
  add(ar, sphere(0.05, 10, 8), 0xff6b6b, -0.2, 1.09, 0.44, { shadow: false });
  for (let k = 0; k < 2; k++) add(ar, new THREE.CylinderGeometry(0.04, 0.04, 0.03, 10), [0xffd45e, 0x8fc0ef][k], 0.08 + k * 0.14, 0.98, 0.44);
  const vm = item(-FW / 2 + 0.45, 2.2, Math.PI / 2);
  add(vm, rbox(1, 1.9, 0.7, 0.08), 0xff8f7a, 0, 0.95, 0, { outline: 0.03 });
  add(vm, rbox(0.62, 1.1, 0.06, 0.03), 0xd8f2ff, -0.12, 1.2, 0.34);   // window
  for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++)
    add(vm, new THREE.CylinderGeometry(0.04, 0.04, 0.18, 10), [0x8fd3b6, 0xffd45e, 0x8fc0ef, 0xff9fb2][(r + k) % 4], -0.32 + k * 0.2, 0.85 + r * 0.33, 0.39, { shadow: false });
  add(vm, rbox(0.2, 0.5, 0.05, 0.02), 0xfff3dc, 0.33, 1.3, 0.35);   // buttons
  add(vm, rbox(0.62, 0.18, 0.05, 0.02), 0x5a4636, -0.12, 0.35, 0.35);   // slot
  // garland: scallops hooked every 1.6 so a hook sits right above the clock at x 1.6
  const li = item(0, -FD / 2 + 0.14, 0);
  const pts = [];
  for (let i = 0; i <= 64; i++) { const x = -6.4 + i * 0.2; pts.push(new THREE.Vector3(x, 3 - 0.18 * Math.abs(Math.sin(Math.PI * (x + 6.4) / 1.6)), 0)); }
  li.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: INK })));
  pts.forEach((p, i) => i % 2 || add(li, sphere(0.06, 10, 8), bulbMats[i / 2 % 3], p.x, p.y - 0.07, 0, { shadow: false }));
  return { aquarium: aq, arcade: ar, vending: vm, lights: li };
}
function applyLook(f) {
  f.faceMat.color.setHex(LOOK_FACE[look.building] ?? f.th.face);
  f.paperMat.map = WALL_TEX[look.wall] || f.paperTex;
  f.floorMat.map = FLOOR_TEX[look.floor] || woodTex;
  for (const k in f.furn) f.furn[k].visible = look.furniture.includes(k);
}

// a floor = one project
function makeFloor(info, index) {
  const th = THEMES[index % THEMES.length];
  const g = new THREE.Group();
  building.add(g);
  const paperTex = wallpaper(th.wall, th.dot);
  const paper = ownToon(0xffffff, paperTex);
  const face = ownToon(th.face);
  const ground = ownToon(0xffffff, woodTex);
  const trim = toon(0xffffff);

  add(g, rbox(FW + 0.6, 0.3, FD + 0.6, 0.1), trim, 0, -0.15, 0);
  add(g, new THREE.PlaneGeometry(FW, FD).rotateX(-Math.PI / 2), ground, 0, 0.02, 0, { shadow: false }).receiveShadow = true;
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
  add(g, new THREE.CylinderGeometry(3.6, 3.6, 0.02, 40).scale(1.5, 1, 0.75), th.rug, 0, 0.04, 1.5, { shadow: false }).receiveShadow = true;
  add(g, rbox(1.7, 1.9, 0.45, 0.06), 0xb5835a, -1.4, 0.95, -FD / 2 + 0.35);                     // bookshelf
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++)
    add(g, rbox(0.22, 0.42, 0.3, 0.03), [0xff8f7a, 0x8fc0ef, 0xffd45e, 0x8fd3b6][(r + k) % 4], -2 + k * 0.32 + r * 0.05, 0.4 + r * 0.58, -FD / 2 + 0.62);
  const clockFace = add(g, new THREE.CylinderGeometry(0.42, 0.42, 0.06, 28).rotateX(Math.PI / 2), 0xffffff, 1.6, 2.4, -FD / 2 + 0.13, { outline: 0.06 });   // clock
  const hand = len => {   // pivots at the clock center; rotation.z is set from the OS clock
    const pivot = new THREE.Group();
    pivot.position.set(1.6, 2.4, -FD / 2 + 0.18);
    add(pivot, rbox(0.05, len, 0.03, 0.01), 0x5a4636, 0, len / 2 - 0.03, 0, { shadow: false });
    g.add(pivot);
    return pivot;
  };
  const clockHands = { h: hand(0.2), m: hand(0.3) };
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

  const ceiling = new THREE.PointLight(0xffd6a0, 0, 18, 1);   // room lights, switched on at night
  ceiling.position.set(0, H - 0.2, 0.5);
  g.add(ceiling);
  const f = { id: info.id, info, g, hinge, glass, clockHands, ceiling, doorL, doorR, ceoDesk, leadDesk, staffDesks, signEl, signObj, alertObj,
              agents: new Map(), live: new Set(), asks: new Map(), busy: false, lift: 0, open: 0, base: 0, made: 0,
              crew: new Set(), spots: makeSpots(), clockFace, lifeT: 6 + Math.random() * 8,
              th, paperTex, paperMat: paper, faceMat: face, floorMat: ground, furn: makeFurniture(g) };
  applyLook(f);
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
  g.userData.who = a;
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
function go(a, dest, look, approach = null) {
  const atDesk = a.desk && dest === a.desk.seat;
  return new Promise(done => {
    a.sitting = false;
    a.path = route(a, dest, atDesk ? a.desk.approach : approach);
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
  a.f.crew.delete(a);
  if (a.spot) a.spot.who = null;
  if (a.desk) { a.desk.owner = null; a.desk.screen.material.color.setHex(0x3d4a5c); }
}
async function elevator(f, open) {
  f.elevBusy = (f.elevBusy || 0) + (open ? 1 : -1);
  if (!open && f.elevBusy > 0) return;
  const from = f.doorL.position.z, to = LANE - 0.4 - (open ? 0.75 : 0);
  await tween(350, t => { f.doorL.position.z = from + (to - from) * t; f.doorR.position.z = 2 * LANE - f.doorL.position.z; });
}


// ---------- office life: breaks, drop-in visitors, animals, easter eggs ----------
function makeSpots() {   // where idle villagers sit or hang out; the approach point keeps them off the desk row
  return [
    { pos: V(-0.8, 2.35), rot: 0, ap: V(-1.25, 1.6), sit: true }, { pos: V(0.8, 2.35), rot: 0, ap: V(1.25, 1.6), sit: true },
    { pos: V(-2.3, 3.4), rot: 1.2, ap: V(-1.25, 1.6), sit: true }, { pos: V(2.3, 3.4), rot: -1.2, ap: V(1.25, 1.6), sit: true },
    { pos: V(4.3, -2.6), rot: Math.PI, ap: null, sit: false }, { pos: V(-1.4, -2.7), rot: Math.PI, ap: null, sit: false },
  ].map(s => ({ ...s, who: null }));
}
const pick = list => list[Math.random() * list.length | 0];
function chatter() {
  const h = sky.hour, d = new Date().getDay();
  if (d === 5 && h >= 17) return pick(['불금이다!! 🎉', '오늘은 칼퇴 각!', '주말에 뭐 해요?']);
  if (h >= 11.5 && h < 13.5) return pick(['점심 뭐 먹지?', '김치찌개 어때요?', '배고파요…', '밥 먹고 합시다!']);
  if (h < 5) return pick(['졸려… 💤', '이 시간까지…?', '컵라면 먹을 사람?', '내일의 내가 하겠지…']);
  if (sky.night > 0.5) return pick(['별이 예쁘다…', '오늘도 수고했어요', '야식 먹을까?', '조금만 더 하고 가요']);
  if (h < 10) return pick(['좋은 아침이에요!', '모닝 커피 ☕', '오늘도 힘내요!']);
  return pick(['커피 한 잔 ☕', '오늘 날씨 좋다~', '음~ 좋은 향기', '버그 하나 잡았다!', '이 소파 진짜 편해요', '간식 없나…']);
}
async function rest(a) {
  const spot = pick(a.f.spots.filter(s => !s.who)) || null;
  if (!spot) return;
  spot.who = a; a.spot = spot;
  await go(a, spot.pos, spot.rot, spot.ap);
  a.sitting = spot.sit;
  say(a, chatter(), 2200);
}
async function goHome(a) {
  if (a.spot) { a.spot.who = null; a.spot = null; }
  say(a, pick(['퇴근합니다! 👋', '수고하셨어요~', '내일 봬요!', '먼저 들어가 볼게요']), 1400);
  await elevator(a.f, true);
  await go(a, ELEV.clone());
  elevator(a.f, false);
  remove(a);
}
async function arrive(a) {
  a.g.rotation.y = Math.PI / 2;
  await elevator(a.f, true);
  await go(a, V(-4.6, LANE));
  elevator(a.f, false);
}

// someone drops by the floor you're looking at: a colleague on a break, now and then an animal, rarely stranger things
function dropBy(f) {
  f.lifeT = 16 + Math.random() * 26;
  const guests = [...f.live].filter(a => a.guest);
  if (guests.length >= 3) return;
  const r = Math.random(), h = sky.hour;
  if (r < 0.14 && !guests.some(a => a.critter)) return critter(f);
  if (r < 0.19) return delivery(f);
  if (h >= 2 && h < 4 && r < 0.35) return ghost(f);
  const g = villager(f, pick(STAFF_NAMES), pick(['사원', '대리']), pick(SPECIES_ORDER), ELEV.clone());
  g.guest = true;
  act(g, async () => {
    await arrive(g);
    if (!f.lead.path.length && !f.lead.asking && Math.random() < 0.35) {   // stop by the lead's desk for a chat
      await go(g, V(f.lead.desk.seat.x - 0.9, -2.2)); face(g, f.lead);
      await say(g, pick(['팀장님 뭐 하세요?', '커피 드실래요?', '이번 주 회식 어때요?', '어제 그거 봤어요?']), 1800);
      say(f.lead, pick(['좋죠!', '나중에 얘기해요~', '음… 생각해 볼게요', 'ㅎㅎ 그러게요']), 1600);
      await sleep(1200);
    }
    await rest(g);
    for (let k = 0; k < 2; k++) { await sleep(7000 + Math.random() * 9000); if (g.spot) say(g, chatter(), 2000); }
    await goHome(g);
  });
}
function delivery(f) {
  const d = villager(f, '택배 기사', '사원', 'pup', ELEV.clone());
  d.guest = true;
  add(d.body, rbox(0.42, 0.32, 0.36, 0.04), 0xc99566, 0, 0.62, 0.38);
  act(d, async () => {
    await arrive(d);
    await go(d, V(-3.5, -2.2)); face(d, f.me);
    await say(d, '택배 왔습니다! 📦', 1600);
    say(f.me, pick(['감사합니다~', '오! 기다리던 거다', '뭐 시켰더라…?']), 1500);
    await sleep(1200);
    await goHome(d);
  });
}
function ghost(f) {
  const g = villager(f, '???', '사원', 'rabbit', ELEV.clone());
  g.guest = true; g.float = true;
  g.g.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.45; } });
  act(g, async () => {
    await arrive(g);
    await go(g, V(0, 1.6));
    await say(g, '부-우… 야근은 몸에 해로워요…', 2600);
    if (!f.busy) say(f.lead, '…방금 뭐였지?', 1600);
    await sleep(1500);
    await goHome(g);
  });
}

const CRITTERS = {
  kitten: { body: 0xf3a65a, name: '아기 고양이', hi: ['야옹~', '냐아…', '골골골'] },
  duck: { body: 0xffd45e, name: '아기 오리', hi: ['꽥!', '꽥꽥~', '삐약?'] },
  hedgehog: { body: 0xa9846a, name: '고슴도치', hi: ['킁킁', '…!', '꾸잉'] },
};
function critter(f) {
  const kind = pick(Object.keys(CRITTERS)), c = CRITTERS[kind];
  const g = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group();
  g.add(body); body.add(head);
  add(body, sphere(0.22), c.body, 0, 0.22, 0, { outline: 0.04 }).scale.set(0.9, 0.8, 1.15);
  head.position.set(0, 0.42, 0.18);
  add(head, sphere(0.17), c.body, 0, 0, 0, { outline: 0.04 });
  for (const s of [-1, 1]) add(head, sphere(0.03, 8, 6), 0x2b211b, s * 0.07, 0.03, 0.15, { shadow: false });
  if (kind === 'kitten') for (const s of [-1, 1]) add(head, new THREE.ConeGeometry(0.06, 0.12, 4), c.body, s * 0.1, 0.16, 0, { outline: 0.06 });
  if (kind === 'duck') add(head, sphere(0.06), 0xff9f4a, 0, -0.03, 0.17, { shadow: false }).scale.set(1.3, 0.5, 1);
  if (kind === 'hedgehog') for (let k = 0; k < 7; k++) add(body, new THREE.ConeGeometry(0.06, 0.18, 5), 0x6d5440, Math.cos(k) * 0.15, 0.36, -0.05 - Math.sin(k) * 0.12).rotation.x = -0.7;
  const el = document.createElement('div');
  el.className = 'tag';
  el.innerHTML = '<div class="bubble"></div><div class="doing"></div>';
  const label = new CSS2DObject(el);
  label.position.y = 0.9;
  g.add(label);
  g.position.copy(ELEV);
  f.g.add(g);
  const a = { f, name: c.name, g, body, head, arms: [new THREE.Group(), new THREE.Group()], label, path: [], q: Promise.resolve(), exitPts: null,
              guest: true, critter: c, bubble: el.querySelector('.bubble'), doing: el.querySelector('.doing'), phase: Math.random() * 6 };
  g.userData.who = a;
  f.live.add(a);
  label.visible = current === f.id;
  act(a, async () => {
    await arrive(a);
    say(a, pick(c.hi), 1400);
    const seen = [...f.live].find(v => v !== a && !v.critter && v !== f.me && !v.path.length && !v.asking);
    if (seen) { face(seen, a); say(seen, `앗, ${c.name}다!`, 1800); }
    for (let k = 0; k < 4 + (Math.random() * 3 | 0); k++) {
      await go(a, V(-5 + Math.random() * 10, -1.2 + Math.random() * 1.2));
      if (Math.random() < 0.5) say(a, pick(c.hi), 1200);
      await sleep(1500 + Math.random() * 3000);
    }
    await elevator(f, true); await go(a, ELEV.clone()); elevator(f, false); remove(a);
  });
}

// clicks inside a floor: villagers react, the wall clock tells the time
function poke(f) {
  const hits = ray.intersectObjects([...f.live].map(a => a.g).concat(f.clockFace), true);
  if (!hits.length) return;
  if (hits[0].object === f.clockFace) {
    const d = new Date();
    return say(f.lead, `지금은 ${d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}이에요!`, 2000);
  }
  let o = hits[0].object;
  while (o && !o.userData.who) o = o.parent;
  const a = o?.userData.who;
  if (!a || a.asking) return;
  const now = performance.now();
  a.pokes = now - (a.pokeAt || 0) < 1500 ? (a.pokes || 0) + 1 : 1;
  a.pokeAt = now;
  tween(420, t => { a.body.position.y = Math.sin(t * Math.PI) * 0.45; });
  if (a.pokes >= 6) {
    a.pokes = 0;
    const r0 = a.g.rotation.y;
    tween(700, t => { a.g.rotation.y = r0 + t * Math.PI * 4; });
    return say(a, '어지러워요 @_@', 1800);
  }
  if (a.critter) return say(a, `${pick(a.critter.hi)} ♥`, 1400);
  if (a === f.me) return say(a, pick(['나는 대표다!', '오늘 회식은 내가 쏜다', '다들 잘하고 있어요~', '흠흠']), 1600);
  if (a.typing) return say(a, pick(['지금 집중 중이에요!', '조금만 기다려 주세요', '거의 다 했어요!']), 1600);
  return say(a, pick(['네? 부르셨어요?', '헤헤', '간지러워요!', '오늘 기분 좋아요', chatter()]), 1600);
}
// ↑↑↓↓←→←→BA: everyone on the floor celebrates
const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
let konami = 0;
addEventListener('keydown', e => {
  if (e.target.closest?.('input, textarea')) return;
  const k = e.key.toLowerCase();
  konami = k === KONAMI[konami] ? konami + 1 : k === 'arrowup' ? (konami === 2 ? 2 : 1) : 0;
  if (konami < KONAMI.length) return;
  konami = 0;
  const f = floors.get(current);
  if (!f) return;
  for (const a of f.live) {
    const r0 = a.g.rotation.y;
    tween(1200, t => { a.g.rotation.y = r0 + t * Math.PI * 4; a.body.position.y = Math.abs(Math.sin(t * Math.PI * 3)) * 0.5; });
    say(a, pick(['🎉', '와아~!', '파티다!', '✨']), 2000);
  }
});

// ---------- day & night (follows the OS clock) ----------
// keyframes by hour: page sky gradient, light colors/intensities, and how "night" it is (0..1)
const NIGHT = { top: '#1d2552', mid: '#2e3b72', bot: '#55507f', hemi: [0x9fb0e0, 0x3a4a60, 0.95], sun: [0xa9b8ff, 0.55], night: 1 };
const DAY = { top: '#93d3f2', mid: '#c4ebf7', bot: '#ffe4cf', hemi: [0xfff4e0, 0x9fc9a8, 1.6], sun: [0xfff1dc, 2.2], night: 0 };
const SKY = [
  { h: 0, ...NIGHT }, { h: 4.8, ...NIGHT },
  { h: 6.5, top: '#f5ae8c', mid: '#fbcfb2', bot: '#ffe8cc', hemi: [0xffe2c8, 0x9fb59a, 1.2], sun: [0xffc59a, 1.4], night: 0.25 },
  { h: 9, ...DAY }, { h: 16.5, ...DAY },
  { h: 18.3, top: '#f39a7c', mid: '#f8c09f', bot: '#ffd9ae', hemi: [0xffd6bd, 0x9faf95, 1.2], sun: [0xffad78, 1.5], night: 0.3 },
  { h: 19.8, top: '#3b3f7a', mid: '#6b5b92', bot: '#c08ba2', hemi: [0xb3a6d8, 0x4a5262, 0.9], sun: [0xc9b3ff, 0.7], night: 0.8 },
  { h: 21, ...NIGHT }, { h: 24, ...NIGHT },
];
const sky = { night: 0, hour: 12 };
const starPos = [];
for (let k = 0; k < 260; k++) {
  const a = k * 2.399, y = 0.25 + (k * 0.618 % 1) * 0.7, r = Math.sqrt(1 - y * y) * 150;
  starPos.push(Math.cos(a) * r, y * 150, Math.sin(a) * r - 30);
}
const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3)),
  new THREE.PointsMaterial({ color: 0xfff6d8, size: 1.3, transparent: true, opacity: 0, depthWrite: false }));
scene.add(stars);
const moon = add(scene, sphere(4, 28, 20), new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0 }), -17, 25, -26, { shadow: false });
let hourOverride = null, lastSky = -1;
export const debugHour = h => { hourOverride = h; lastSky = -1; };   // testing hook: force a time of day
export const debugVisit = kind => { const f = floors.get(current); if (f) ({ critter, delivery, ghost, guest: g => { g.lifeT = 0; } })[kind]?.(f); };   // testing hook: force a drop-in
const mixHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
function tickSky() {
  const d = new Date();
  const h = hourOverride ?? d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  if (lastSky >= 0 && Math.abs(h - lastSky) < 1 / 360) return;   // recompute every ~10s of clock time
  lastSky = h;
  sky.hour = h;
  const i = SKY.findIndex((k, j) => SKY[j + 1] && h >= k.h && h < SKY[j + 1].h);
  const a = SKY[i], b = SKY[i + 1], t = (h - a.h) / (b.h - a.h);
  const n = sky.night = a.night + (b.night - a.night) * t;
  const css = document.documentElement.style;
  for (const key of ['top', 'mid', 'bot']) css.setProperty(`--sky-${key}`, '#' + mixHex(a[key], b[key], t).getHexString());
  hemi.color.copy(mixHex(a.hemi[0], b.hemi[0], t));
  hemi.groundColor.copy(mixHex(a.hemi[1], b.hemi[1], t));
  hemi.intensity = a.hemi[2] + (b.hemi[2] - a.hemi[2]) * t;
  sun.color.copy(mixHex(a.sun[0], b.sun[0], t));
  sun.intensity = a.sun[1] + (b.sun[1] - a.sun[1]) * t;
  // the sun arcs east → west between 6h and 19h; at night the light comes from the moon's side
  const arc = Math.min(1, Math.max(0, (h - 6) / 13)) * Math.PI;
  if (n < 0.7) sun.position.set(Math.cos(arc) * 30, 10 + Math.sin(arc) * 24, 22);
  else sun.position.set(-18, 28, 18);
  stars.material.opacity = Math.max(0, n - 0.35) / 0.65;
  moon.material.opacity = Math.max(0, n - 0.3) / 0.7;
  cloudMat.color.copy(mixHex(0xffffff, 0x8f95c4, n));
  lampMat.color.copy(mixHex(0xf3ecd2, 0xffe27a, n));
  haloMat.opacity = n * 0.35;
  bulbMats.forEach((m, i) => m.color.setHex(BULB[i]).multiplyScalar(0.8 + n * 0.5));   // garland brightens at night
  for (const f of floors.values()) {
    paintGlass(f);
    f.ceiling.intensity = n * 6;
    f.clockHands.h.rotation.z = -((h % 12) / 12) * Math.PI * 2;
    f.clockHands.m.rotation.z = -(h % 1) * Math.PI * 2;
  }
  onSky?.(sky);
}
let onSky = null;
export const onSkyChange = cb => onSky = cb;

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
      f.crew.add(s);
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
        if (!f.busy) return goHome(a);
        // the order isn't finished yet: stay around (desk wrap-up or a break) until 'exit'
        if (Math.random() < 0.6) { await toDesk(a); iconText(a.doing, 'todo', '마무리 정리 중'); }
        else { say(a, '끝날 때까지 대기할게요', 1500); await rest(a); }
      });
      return { who: a, text: '보고 완료 · 일이 끝날 때까지 남아 있어요', tone: 'leave' };
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
    case 'auto': {   // 자동 승인 floor: a quick thumbs-up instead of walking to 대표
      const who = a || lead;
      act(who, () => { iconText(who.bubble, e.icon, `자동 승인 · ${e.text}`); who.bubble.classList.add('on', 'auto'); clearTimeout(who.sayT);
        who.sayT = setTimeout(() => who.bubble.classList.remove('on', 'auto'), 1800); });
      return { who, text: `자동 승인 · ${e.text}`, tone: 'ok', icon: e.icon };
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
      for (const [id] of f.agents) if (id !== 'lead') f.agents.delete(id);
      [...f.crew].forEach((s, i) => {   // the order is over: the crew trickles out, some stay for a break first
        f.crew.delete(s);
        act(s, async () => {
          s.typing = s.asking = false; s.bubble.classList.remove('on', 'ask'); s.doing.textContent = '';
          if (!e.code && Math.random() < 0.5) { await rest(s); await sleep(6000 + Math.random() * 14000); }
          else await sleep(400 + i * 1300);
          await goHome(s);
        });
      });
      act(lead, async () => { lead.typing = false; lead.doing.textContent = ''; });
      return e.code ? { who: lead, text: `작업이 멈췄어요 (코드 ${e.code}) ${e.text || ''}`, tone: 'no' } : null;
  }
  return null;
}
function setBusy(f, on) {
  f.busy = on;
  paintGlass(f);
  refreshSign(f);
}
// windows: sky glass by day, warm lamplight at night; working floors glow brighter
const GLASS_DAY = new THREE.Color(0xcfefff), GLASS_BUSY = new THREE.Color(0xffe7a3), GLASS_NIGHT = new THREE.Color(0xffc75a);
function paintGlass(f) {
  const n = sky.night;
  f.glass.color.copy(f.busy ? GLASS_BUSY : GLASS_DAY).lerp(GLASS_NIGHT, n * (f.busy ? 1 : 0.55));
  f.glass.opacity = (f.busy ? 0.62 : 0.42) + n * (f.busy ? 0.33 : 0.2);
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
  for (const [id, f] of floors) if (!list.some(x => x.id === id)) {
    f.g.traverse(o => o.element?.remove());   // CSS2D signs/labels keep their DOM when an ancestor is removed
    building.remove(f.g); floors.delete(id);
  }
  order = list.map(x => x.id);
  list.forEach((info, i) => {
    let f = floors.get(info.id);
    if (!f) { f = makeFloor(info, i); floors.set(info.id, f); }
    f.info = info;
    f.base = LOBBY + i * FH;
    refreshSign(f);
    refreshAlert(f);
  });
  roofBase = LOBBY + order.length * FH - 0.3;   // sits on the top floor's walls (H = FH - 0.3)
  lastSky = -1;   // repaint new floors for the current time of day
  if (current && !floors.has(current)) current = null;
  layout();
  if (!current) frameOutside(600);
}
export function setLook(l) {
  look = { ...look, ...l };
  for (const k in roofs) roofs[k].visible = k === look.building;
  for (const f of floors.values()) applyLook(f);
}
let roofBase = LOBBY - 0.3;
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
  controls.maxDistance = dist * 1.4;   // zoom out a bit past the framing, never off into the void
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
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  ray.setFromCamera(new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  if (current) return poke(floors.get(current));
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
      p.y = (a.sitting && !a.path.length ? 0.34 : 0) + bob + (a.float ? 0.35 + Math.sin(t * 2 + a.phase) * 0.12 : 0);
      a.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      a.arms[0].position.y = 0.48 + swing;
      a.arms[1].position.y = 0.48 - swing;
      if (a.desk) a.desk.screen.material.color.setHex(a.typing && a.sitting && !a.path.length ? (Math.sin(t * 9 + a.phase) > 0 ? 0x9fd8ff : 0x8ccbf5) : 0x3d4a5c);
    }
    if (f.id === current && (f.lifeT -= dt) < 0) dropBy(f);
    // idle lead fetches coffee now and then
    const lead = f.lead;
    if (!f.busy && !lead.asking && !lead.path.length && (lead.idleT -= dt) < 0) {
      lead.idleT = 10 + Math.random() * 10;
      act(lead, async () => {
        lead.typing = false;
        await go(lead, V(5.2, -2.6), Math.PI);
        say(lead, chatter(), 1800);
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
  tickSky();
  for (const c of clouds) { c.position.x += c.userData.speed * dt; if (c.position.x > 70) c.position.x = -70; }
  sway.forEach((g, i) => g.rotation.z = Math.sin(t * 0.9 + i) * 0.025);
  islets.forEach((g, i) => g.position.y = g.userData.y + Math.sin(t * 0.4 + i * 1.7) * 0.5);
  controls.update();
  // keep panning over the island: clamp the orbit target and drag the camera along with it
  const tg = controls.target, was = tg.clone(), clamp = THREE.MathUtils.clamp;
  tg.set(clamp(tg.x, -12, 12), clamp(tg.y, 0, roofBase + 4), clamp(tg.z, -10, 16));
  camera.position.add(was.subVectors(tg, was));
  renderer.render(scene, camera);
  labels.render(scene, camera);
});
