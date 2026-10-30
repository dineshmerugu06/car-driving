// World.js — scene, lights, ground/roads (canvas textures), props, zones,
// signs, stars, and ALL physics registration (via PhysicsWorld).
// Everything is original geometry + canvas textures. No external assets.
// V6 NINJA-STANDARD WORLD: the 3d-ninja/samsy recipe transferred to WebGL —
// a dark, emissive-led city: authored glow only (bloom in main.js), a wet
// reflected plaza, range fog swallowing the edges, warm lamp pools, lit
// windows and a film grade. Same layout, same colliders, same gameplay as
// V2/V3/V5; only the look changed.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

export const ORANGE = 0xff5a00;
export const BLACK = 0x121212;
export const WORLD_SIZE = 240; // playable square, clamped at ±WORLD_SIZE/2
// One sun direction shared by the Sky, the directional light AND the PMREM
// environment main.js generates from a matching Sky — reflections, ambient
// and shadows all agree, which is what makes materials read as realistic.
export const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 4), THREE.MathUtils.degToRad(132));

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.02, ...opts });

// ---------- procedural canvas textures ----------
function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const speckle = (g, s, n, alpha) => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = Math.random() > 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
    g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
};
// Deterministic hash noise (same style as the building seeds below) so the
// world looks identical on every load — Math.random textures shimmer between
// visits and read as "cheap".
const hash = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
function noiseFill(g, s, base, amp, cell = 4) {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s / cell; y++) for (let x = 0; x < s / cell; x++) {
    const v = (hash(x, y) - 0.5) * amp;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    g.fillRect(x * cell, y * cell, cell, cell);
  }
}
// --- normal maps from procedural height fields (Sobel) ---
// Flat colour textures are the #1 "cartoon" tell: real surfaces catch light
// at grazing angles. Every ground/facade material below gets a normal map
// derived from a matching procedural height field.
function heightCanvas(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size); return c;
}
function normalTexture(heightCnv, repeat, strength = 2.2) {
  const s = heightCnv.width;
  const src = heightCnv.getContext('2d').getImageData(0, 0, s, s).data;
  const out = heightCanvas(s, () => {});
  const ctx = out.getContext('2d'); const img = ctx.createImageData(s, s); const d = img.data;
  const hv = (x, y) => src[(((y + s) % s) * s + ((x + s) % s)) * 4] / 255;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (hv(x - 1, y) - hv(x + 1, y)) * strength;
    const dy = (hv(x, y - 1) - hv(x, y + 1)) * strength;
    const inv = 1 / Math.hypot(dx, dy, 1);
    const i = (y * s + x) * 4;
    d[i] = (dx * inv * 0.5 + 0.5) * 255;
    d[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
    d[i + 2] = (inv * 0.5 + 0.5) * 255;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8;
  return t;
}
// generic micro-surface normal (aggregate / grass blades / concrete grain)
function microNormal(size, repeat, strength, cell = 3) {
  const c = heightCanvas(size, (g, s) => {
    noiseFill(g, s, '#7f7f7f', 0.55, cell);
    noiseFill(g, s, 'rgba(0,0,0,0)', 0.4, 2);
  });
  return normalTexture(c, repeat, strength);
}

export const TEX = {
  groundNormal: () => microNormal(512, 110, 1.5),
  asphaltNormal: () => microNormal(512, 10, 2.6, 2),
  // grass: layered green noise + dry patches + fine speckle
  ground: () => canvasTex(1024, (g, s) => {
    noiseFill(g, s, '#4e7036', 0.16);
    for (let i = 0; i < 46; i++) { // soft patches of dry / dark grass
      const x = hash(i, 3) * s, y = hash(7, i) * s, r = 40 + hash(i, i) * 130;
      const gr = g.createRadialGradient(x, y, 4, x, y, r);
      const dry = hash(i, 21) > 0.5;
      gr.addColorStop(0, dry ? 'rgba(148,138,74,0.20)' : 'rgba(38,66,26,0.22)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    noiseFill(g, s, 'rgba(0,0,0,0)', 0.10, 2);
    speckle(g, s, 9000, 0.05);
  }, 110),
  // asphalt: dark aggregate with patches, cracks and faint repairs
  asphalt: () => canvasTex(1024, (g, s) => {
    noiseFill(g, s, '#333336', 0.13);
    noiseFill(g, s, 'rgba(0,0,0,0)', 0.12, 2);
    speckle(g, s, 15000, 0.06);
    for (let i = 0; i < 7; i++) { // tar patches / repairs
      g.fillStyle = `rgba(12,12,14,${0.10 + hash(i, 5) * 0.10})`;
      g.fillRect(hash(i, 8) * s * 0.8, hash(9, i) * s * 0.8, 90 + hash(i, i) * 190, 60 + hash(3, i) * 130);
    }
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; // hairline cracks
    for (let i = 0; i < 9; i++) {
      g.beginPath(); let x = hash(i, 31) * s, y = hash(17, i) * s; g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (hash(i, k) - 0.5) * 90; y += hash(k, i) * 46; g.lineTo(x, y); }
      g.stroke();
    }
  }, 10),
  // concrete pavers: colour + height drawn together -> grout sits recessed
  // in the normal map, slabs catch light on their bevels.
  plazaPair: () => {
    const S = 1024, n = 4, cell = S / n;
    const colorC = heightCanvas(S, () => {}); const g = colorC.getContext('2d');
    const heightC = heightCanvas(S, () => {}); const hg = heightC.getContext('2d');
    noiseFill(g, S, '#a9a294', 0.10);
    hg.fillStyle = '#8c8c8c'; hg.fillRect(0, 0, S, S);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = (hash(x * 3, y * 7) - 0.5) * 0.09;
      g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      g.fillRect(x * cell, y * cell, cell, cell);
      g.fillStyle = 'rgba(255,255,255,0.20)'; g.fillRect(x * cell, y * cell, cell, 3); g.fillRect(x * cell, y * cell, 3, cell);
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x * cell, y * cell + cell - 4, cell, 4); g.fillRect(x * cell + cell - 4, y * cell, 4, cell);
      const gv = Math.round(140 + hash(x, y * 3) * 30);
      hg.fillStyle = `rgb(${gv},${gv},${gv})`;
      hg.fillRect(x * cell + 3, y * cell + 3, cell - 6, cell - 6);
    }
    g.strokeStyle = 'rgba(40,38,34,0.55)'; g.lineWidth = 3;
    hg.strokeStyle = '#141414'; hg.lineWidth = 7;
    for (let i = 0; i <= n; i++) {
      g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, S); g.stroke(); g.beginPath(); g.moveTo(0, i * cell); g.lineTo(S, i * cell); g.stroke();
      hg.beginPath(); hg.moveTo(i * cell, 0); hg.lineTo(i * cell, S); hg.stroke(); hg.beginPath(); hg.moveTo(0, i * cell); hg.lineTo(S, i * cell); hg.stroke();
    }
    speckle(g, S, 7000, 0.045);
    const map = new THREE.CanvasTexture(colorC);
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(7, 7); map.anisotropy = 8; map.colorSpace = THREE.SRGBColorSpace;
    return { map, normalMap: normalTexture(heightC, 7, 2.0) };
  },
  // office facade: reflective glass + slab bands in colour; window frames
  // raised / glass recessed in the paired height field -> real depth in the
  // normal map when light rakes across the building.
  facadePair: (tint = '#8b93a0', glass = ['#9fb6c9', '#54687e']) => {
    const S = 1024, cols = 7, rows = 12, cw = S / cols, rh = S / rows;
    const colorC = heightCanvas(S, () => {}); const g = colorC.getContext('2d');
    const heightC = heightCanvas(S, () => {}); const hg = heightC.getContext('2d');
    const emissiveC = heightCanvas(S, () => {}); const eg = emissiveC.getContext('2d');
    eg.fillStyle = '#000'; eg.fillRect(0, 0, S, S);
    noiseFill(g, S, tint, 0.07);
    hg.fillStyle = '#7a7a7a'; hg.fillRect(0, 0, S, S);
    for (let y = 0; y < rows; y++) {
      g.fillStyle = 'rgba(0,0,0,0.30)'; g.fillRect(0, y * rh + rh - 5, S, 5); // slab shadow line
      hg.fillStyle = '#a8a8a8'; hg.fillRect(0, y * rh + rh - 6, S, 6); // slab edge raised
      for (let x = 0; x < cols; x++) {
        const px = x * cw + 9, py = y * rh + 8, pw = cw - 18, ph = rh - 20;
        const lit = hash(x * 13, y * 29) > 0.76;
        if (lit) {
          const warm = hash(x * 7, y * 11) > 0.18;
          g.fillStyle = warm ? (hash(x, y) > 0.5 ? '#ffd489' : '#ffb765') : '#c7ecff';
          g.fillRect(px, py, pw, ph);
          // Only these windows are authored into the emissive channel, so
          // only these can bloom — the samsy MRT lesson, adapted to WebGL.
          eg.fillStyle = warm ? '#ff9e45' : '#8fd8ff'; eg.fillRect(px, py, pw, ph);
        }
        else {
          const gr = g.createLinearGradient(px, py, px + pw, py + ph);
          gr.addColorStop(0, glass[0]); gr.addColorStop(0.45, glass[1]); gr.addColorStop(0.62, '#c7d6e2'); gr.addColorStop(1, glass[1]);
          g.fillStyle = gr; g.fillRect(px, py, pw, ph);
        }
        g.strokeStyle = 'rgba(15,17,20,0.65)'; g.lineWidth = 3; g.strokeRect(px, py, pw, ph);
        g.beginPath(); g.moveTo(px + pw / 2, py); g.lineTo(px + pw / 2, py + ph); g.stroke();
        hg.fillStyle = '#2e2e2e'; hg.fillRect(px, py, pw, ph); // glass recessed
        hg.strokeStyle = '#c9c9c9'; hg.lineWidth = 5; hg.strokeRect(px, py, pw, ph); // frame raised
        hg.beginPath(); hg.moveTo(px + pw / 2, py); hg.lineTo(px + pw / 2, py + ph); hg.stroke();
      }
    }
    const map = new THREE.CanvasTexture(colorC);
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8; map.colorSpace = THREE.SRGBColorSpace;
    const emissiveMap = new THREE.CanvasTexture(emissiveC);
    emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping; emissiveMap.anisotropy = 8; emissiveMap.colorSpace = THREE.SRGBColorSpace;
    return { map, normalMap: normalTexture(heightC, 1, 2.4), emissiveMap };
  },
  // crate wood: planks + grain streaks
  wood: () => canvasTex(512, (g, s) => {
    noiseFill(g, s, '#a97e4e', 0.10);
    for (let p = 0; p < 4; p++) {
      const y = p * s / 4;
      g.fillStyle = 'rgba(60,38,18,0.55)'; g.fillRect(0, y, s, 4);
      for (let i = 0; i < 26; i++) {
        g.strokeStyle = `rgba(90,58,26,${0.10 + hash(p, i) * 0.14})`; g.lineWidth = 1.5;
        g.beginPath(); const gy = y + 8 + hash(i, p) * (s / 4 - 16); g.moveTo(0, gy);
        g.bezierCurveTo(s * 0.3, gy + 4, s * 0.6, gy - 4, s, gy + 2); g.stroke();
      }
    }
  }, 1),
};

function signTexture(title, lines = [], { bg = '#121212', fg = '#e9e9e6', accent = '#ff5a00' } = {}) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 512);
  g.shadowColor = accent; g.shadowBlur = 22;
  g.fillStyle = accent; g.fillRect(0, 0, 1024, 26); g.fillRect(0, 486, 1024, 26);
  g.shadowBlur = 16;
  g.fillStyle = fg; g.textAlign = 'center';
  g.font = '900 118px system-ui, sans-serif';
  const words = title.split(' ');
  if (title.length > 10 && words.length > 1) {
    const mid = Math.ceil(words.length / 2);
    g.fillText(words.slice(0, mid).join(' '), 512, 200);
    g.fillText(words.slice(mid).join(' '), 512, 330);
  } else g.fillText(title, 512, 245);
  g.font = '600 44px system-ui, sans-serif'; g.fillStyle = accent;
  lines.slice(0, 2).forEach((l, i) => g.fillText(l, 512, 400 + i * 55));
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeSign(title, lines, w = 14) {
  const grp = new THREE.Group();
  const tex = signTexture(title, lines);
  const faceM = new THREE.MeshStandardMaterial({
    map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.2, roughness: 0.55,
  });
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, w / 2, 0.4),
    [mat(BLACK), mat(BLACK), mat(BLACK), mat(BLACK), faceM, mat(BLACK)]);
  board.position.y = w / 4 + 3.4; board.castShadow = true; grp.add(board);
  // back-to-back twin board so the sign reads correctly from BOTH directions
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, w / 2, 0.4),
    [mat(BLACK), mat(BLACK), mat(BLACK), mat(BLACK), faceM, mat(BLACK)]);
  back.rotation.y = Math.PI; back.position.set(0, w / 4 + 3.4, -0.44); back.castShadow = true; grp.add(back);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 3.6, 8), mat(BLACK));
    post.position.set(sx * w * 0.36, 1.8, 0); post.castShadow = true; grp.add(post);
  }
  return grp;
}

function box(w, h, d, color, x = 0, y = null, z = 0, parent, m = null) {
  const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || mat(color));
  mm.position.set(x, y === null ? h / 2 : y, z);
  mm.castShadow = true; mm.receiveShadow = true; parent.add(mm); return mm;
}

// Wedge ramp: rises toward -Z (drive north, launch off the top edge).
function makeRamp(w, run, h) {
  const shape = new THREE.Shape();
  shape.moveTo(-run / 2, 0); shape.lineTo(run / 2, 0); shape.lineTo(-run / 2, h); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  geo.translate(0, 0, -w / 2);
  const grp = new THREE.Group();
  const wedge = new THREE.Mesh(geo, mat(0x3a3a3a, { roughness: 0.95 }));
  wedge.rotation.y = -Math.PI / 2; // shape +X (low toe) -> world +Z, high edge -> -Z: slope rises north
  wedge.castShadow = true; wedge.receiveShadow = true; grp.add(wedge);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.28, 0.8),
    new THREE.MeshStandardMaterial({ color: ORANGE, emissive: ORANGE, emissiveIntensity: 1.5, roughness: 0.5 }));
  lip.position.set(0, h + 0.05, -run / 2 + 0.4); lip.castShadow = true; grp.add(lip);
  return { grp, slopeAngle: Math.atan2(h, run) };
}

function starMesh() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.45 : 1, a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    i ? s.lineTo(px, py) : s.moveTo(px, py);
  }
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.32, bevelEnabled: false });
  geo.center();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: ORANGE, emissive: 0xff5a00, emissiveIntensity: 1.6, roughness: 0.35, metalness: 0.3,
  }));
}

export const ZONES = [
  { id: 'start', name: 'START', x: 0, z: 78, r: 16, signX: -19, signZ: 62, title: 'START PLAZA', body: 'Welcome to Merugu\u2019s world. Drive to each zone to explore \u2014 follow the orange rings and big signs. W / \u2191 accelerate \u00b7 S / \u2193 brake & reverse \u00b7 A D steer \u00b7 SPACE handbrake. Pedals on touch screens. Collect the \u2605 in every zone!' },
  { id: 'about', name: 'ABOUT', x: -72, z: 42, r: 17, title: 'ABOUT \u2014 MERUGU', body: 'Merugu \u2014 vibe coder & AI builder from India. He learns by building: setup first, then Explore \u2192 Plan \u2192 Code \u2192 Verify \u2192 Commit.' },
  { id: 'zero', name: 'PROJECT ZERO', x: 72, z: 42, r: 17, title: 'PROJECT ZERO', body: 'Merugu\u2019s personal AI-agent operating protocol: the creator sets the objectives, verify before claiming done, protect data before any outside send, act freely on safe reversible work, confirm before anything consequential.' },
  { id: 'projects', name: 'PROJECTS', x: -72, z: -38, r: 18, title: 'PROJECTS', body: '1) PROJECT ZERO \u2014 AI-agent protocol. 2) VIBE CODING MASTERY \u2014 Claude Code course journey (SSK Techy). 3) TOP 10 CLAUDE SKILLS STACK \u2014 learned & installed. 4) This driveable 3D portfolio \u2014 zero_project1.' },
  { id: 'skills', name: 'SKILLS', x: 0, z: -78, r: 19, signX: -25, signZ: -100, title: 'SKILLS \u2014 TOP 10', body: 'Ponytail \u00b7 Taste \u00b7 Impeccable \u00b7 Emil Motion \u00b7 Superpowers \u00b7 Caveman \u00b7 Frontend Design \u00b7 UI/UX Pro Max \u00b7 GStack \u00b7 Planning-with-Files. Installed & used whenever needed.' },
  { id: 'process', name: 'PROCESS', x: 74, z: -40, r: 18, title: 'PROCESS', body: 'Drive through the six gates: SETUP \u2192 EXPLORE \u2192 PLAN \u2192 CODE \u2192 VERIFY \u2192 COMMIT. Setup is step 1 \u2014 before every task, every time.' },
  { id: 'contact', name: 'CONTACT', x: 0, z: 8, r: 14, signX: 14, signZ: -9, title: 'CONTACT', body: 'GitHub: github.com/dineshmerugu06 \u2014 repo: zero_project1. That\u2019s the door. Come say hi.' },
];

export const SKILLS = ['PONYTAIL', 'TASTE', 'IMPECCABLE', 'EMIL MOTION', 'SUPERPOWERS', 'CAVEMAN', 'FRONTEND DESIGN', 'UI/UX PRO MAX', 'GSTACK', 'PLANNING WITH FILES'];
export const PROCESS_STEPS = ['SETUP', 'EXPLORE', 'PLAN', 'CODE', 'VERIFY', 'COMMIT'];

export function buildWorld(scene, physics) {
  const phys = physics; // may be null in degraded mode (visuals still build)
  const regBox = (x, y, z, hx, hy, hz, ry = 0) => { if (phys) phys.addFixedBox({ x, y, z, hx, hy, hz, ry }); };
  const regCyl = (x, z, r, h) => { if (phys) phys.addFixedCylinder({ x, z, r, h }); };

  // --- dusk sky, black range fog, moonlight ---
  // Samsy's atmosphere is not a bright sky: it is darkness with authored
  // emissive landmarks. The Sky stays only as a deep afterglow on the
  // horizon; fog does the world-edge work and lamps/signs do the lighting.
  scene.background = new THREE.Color(0x020409);
  const sky = new Sky();
  sky.scale.setScalar(6000);
  const skyU = sky.material.uniforms;
  skyU.turbidity.value = 8; skyU.rayleigh.value = 2.8;
  skyU.mieCoefficient.value = 0.006; skyU.mieDirectionalG.value = 0.85;
  const sunPos = SUN_DIR;
  skyU.sunPosition.value.copy(sunPos);
  scene.add(sky);
  scene.fog = new THREE.Fog(0x030509, 55, 235);
  scene.add(new THREE.HemisphereLight(0x243447, 0x05070a, 0.55));
  const sun = new THREE.DirectionalLight(0x8fb6d9, 0.95); // moonlight
  sun.position.set(-70, 120, -90); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, far: 480 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const world = new THREE.Group(); scene.add(world);
  const floaters = [], drifters = [], stars = [];

  // --- ground + plaza ---
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1700, 1700),
    new THREE.MeshStandardMaterial({ map: TEX.ground(), normalMap: TEX.groundNormal(), color: 0x2a3d26, roughness: 0.92, envMapIntensity: 0.16 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; world.add(ground);
  const plazaPair = TEX.plazaPair();
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(46, 46),
    new THREE.MeshStandardMaterial({ map: plazaPair.map, normalMap: plazaPair.normalMap, color: 0x59616a, roughness: 0.65, envMapIntensity: 0.35 }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.02, 78); pad.receiveShadow = true; world.add(pad);
  // Wet reflected plaza — samsy's signature floor, in WebGL form: a planar
  // Reflector whose image is broken up by the plaza texture itself (fine
  // ripple) and masked by its grout/slabs so it reads as rain-slick stone,
  // not a mirror. 0.75-res target, exactly his resolution factor.
  const wetShader = {
    name: 'NinjaWetPlaza',
    uniforms: {
      color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, tMask: { value: null },
    },
    vertexShader: Reflector.ReflectorShader.vertexShader,
    fragmentShader: `
      uniform vec3 color;
      uniform sampler2D tDiffuse;
      uniform sampler2D tMask;
      varying vec4 vUv;
      void main() {
        vec2 planeUv = vUv.xy / max(vUv.w, 0.0001);
        vec4 maskTex = texture2D(tMask, planeUv * 7.0);
        vec4 projected = vUv;
        projected.xy += (maskTex.rg - 0.5) * 0.018 * vUv.w;
        vec3 reflection = texture2DProj(tDiffuse, projected).rgb;
        float mask = 0.05 + maskTex.g * 0.40;
        vec3 base = vec3(0.004, 0.005, 0.008);
        gl_FragColor = vec4(mix(base, reflection * color, mask), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  };
  const reflector = new Reflector(new THREE.PlaneGeometry(46, 46), {
    clipBias: 0.003,
    textureWidth: 1024,
    textureHeight: 1024,
    color: 0x66798c,
    shader: wetShader,
    multisample: 0,
  });
  reflector.material.uniforms.tMask.value = plazaPair.map;
  reflector.rotation.x = -Math.PI / 2; reflector.position.set(0, 0.055, 78); world.add(reflector);

  // --- roads: dark wet asphalt under a concrete curb bed ---
  const asphalt = TEX.asphalt();
  const roadMat = new THREE.MeshPhysicalMaterial({
    map: asphalt, normalMap: TEX.asphaltNormal(), color: 0x777d84,
    roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.32, envMapIntensity: 0.9,
  });
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x23282d, roughness: 0.95 });
  let roadN = 0;
  const road = (w, d, x, z) => {
    const lift = roadN++ * 0.0016; // mm-steps so overlapping planes never z-fight at crossings
    const curb = new THREE.Mesh(new THREE.PlaneGeometry(w + 2.4, d + 2.4), curbMat);
    curb.rotation.x = -Math.PI / 2; curb.position.set(x, 0.012 + lift, z); curb.receiveShadow = true; world.add(curb);
    const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
    r.rotation.x = -Math.PI / 2; r.position.set(x, 0.03 + lift, z); r.receiveShadow = true; world.add(r);
  };
  road(14, WORLD_SIZE, 0, 0);
  road(WORLD_SIZE, 14, 0, 8);
  road(10, 100, -52, 32); road(10, 100, 52, 32);
  road(10, 100, -52, -52); road(10, 100, 52, -52);
  road(120, 10, 0, -58);
  // --- sidewalks (raised) + white edge lines on the two main roads ---
  const walkMat = new THREE.MeshStandardMaterial({ color: 0x394047, normalMap: microNormal(512, 40, 1.1), roughness: 0.8, envMapIntensity: 0.25 });
  const walk = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), walkMat);
    m.position.set(x, 0.07, z); m.receiveShadow = true; m.castShadow = false; world.add(m);
  };
  walk(1.8, WORLD_SIZE, -8.1, 0); walk(1.8, WORLD_SIZE, 8.1, 0);
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) walk(110, 1.8, sx * 64.8, 8 + sz * 8.1);
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xaeb9bf, emissive: 0x9fb6c4, emissiveIntensity: 0.22, roughness: 0.55 });
  const edge = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), edgeMat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.048, z); m.receiveShadow = true; world.add(m);
  };
  edge(0.22, WORLD_SIZE, -6.55, 0); edge(0.22, WORLD_SIZE, 6.55, 0);
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) edge(110, 0.22, sx * 64.8, 8 + sz * 6.55);

  const dashMat = new THREE.MeshStandardMaterial({ color: ORANGE, emissive: ORANGE, emissiveIntensity: 1.15, roughness: 0.5 });
  for (let i = -10; i <= 10; i++) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 4), dashMat);
    d.rotation.x = -Math.PI / 2; d.position.set(0, 0.05, i * 11); world.add(d);
    const d2 = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), dashMat);
    d2.rotation.x = -Math.PI / 2; d2.position.set(i * 11, 0.05, 8); world.add(d2);
  }

  // --- zone rings, signs, stars ---
  for (const z of ZONES) {
    const ringMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    ringMat.color.setRGB(1.45, 0.55, 0.06); // HDR orange: authored glow, blooms without blowing out
    const ring = new THREE.Mesh(new THREE.RingGeometry(z.r - 1.2, z.r, 48), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.set(z.x, 0.06, z.z); world.add(ring);
    z.ring = ring;
    const s = makeSign(z.name, z.id === 'contact' ? ['GITHUB.COM/DINESH', 'MERUGU06'] : ['DRIVE IN TO EXPLORE'], z.id === 'skills' ? 17 : 13);
    // Signs sit OFF the drive paths (V1 put START/SKILLS/CONTACT signs in the
    // middle of roads with colliders — the car crashed into them immediately).
    const sx = z.signX !== undefined ? z.signX : z.x;
    const sz = z.signZ !== undefined ? z.signZ : z.z - z.r - 4;
    s.position.set(sx, 0, sz);
    s.lookAt(z.x, 0, z.z); s.rotateY(Math.PI);
    world.add(s);
    regBox(sx, 1.8, sz, 2.4, 1.8, 0.6);
    const star = starMesh();
    star.position.set(z.x, 2.6, z.z);
    star.castShadow = true;
    world.add(star);
    stars.push({ mesh: star, zone: z, taken: false, baseY: 2.6 });
    z.starMesh = star;
  }

  // --- buildings: 3 facade variants, reflective glass, rooftop clutter ---
  const facadeMats = [
    new THREE.MeshStandardMaterial({ ...TEX.facadePair('#454e59', ['#5f7488', '#1c2836']), emissive: 0xffffff, emissiveIntensity: 1.9, roughness: 0.46, metalness: 0.22, envMapIntensity: 0.65 }),
    new THREE.MeshStandardMaterial({ ...TEX.facadePair('#3a3f3d', ['#687d8c', '#24313d']), emissive: 0xffffff, emissiveIntensity: 1.75, roughness: 0.58, metalness: 0.14, envMapIntensity: 0.55 }),
    new THREE.MeshStandardMaterial({ ...TEX.facadePair('#232c35', ['#54748f', '#162638']), emissive: 0xffffff, emissiveIntensity: 2.05, roughness: 0.36, metalness: 0.3, envMapIntensity: 0.8 }),
  ];
  const topM = mat(0x11151a, { roughness: 0.95 });
  const bandM = new THREE.MeshStandardMaterial({ color: ORANGE, emissive: ORANGE, emissiveIntensity: 1.25, roughness: 0.5 });
  const buildingSpots = [[-105, -85], [-92, -95], [100, 88], [108, -88], [-104, 88], [96, 96], [-40, -104], [44, 104], [110, 0], [-110, -10], [30, -108], [-28, 108], [86, -104], [-86, 104], [112, 44], [-112, -48]];
  buildingSpots.forEach(([x, z], bi) => {
    const seed = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
    const w = 11 + seed * 5, h = 12 + seed * 20, d = 11 + (1 - seed) * 5;
    const sideM = facadeMats[bi % 3];
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [sideM, sideM, topM, topM, sideM, sideM]);
    b.position.set(x, h / 2, z); b.castShadow = true; b.receiveShadow = true; world.add(b);
    const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.55, d + 0.4), bandM);
    band.position.set(x, h - 2.2, z); world.add(band);
    // ground-floor storefront: dark reflective glass wrapping the base
    const store = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 3.0, d + 0.5),
      new THREE.MeshStandardMaterial({ color: 0x0d141b, emissive: 0x4fb7d9, emissiveIntensity: 0.16, roughness: 0.08, metalness: 0.35, envMapIntensity: 1.6 }));
    store.position.set(x, 1.5, z); store.castShadow = true; store.receiveShadow = true; world.add(store);
    // parapet + rooftop AC units (visual only, inside the same footprint)
    const par = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, 0.8, d + 0.35), topM);
    par.position.set(x, h + 0.3, z); par.castShadow = true; world.add(par);
    const ac = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 1.8), mat(0x394048, { roughness: 0.7, metalness: 0.35 }));
    ac.position.set(x + (seed - 0.5) * w * 0.4, h + 0.55, z + (0.5 - seed) * d * 0.35); ac.castShadow = true; world.add(ac);
    regBox(x, h / 2, z, w / 2, h / 2, d / 2);
  });

  // --- trees v2: bark trunks + smooth noise-displaced canopies, vertex-colour
  // leaf variation, 4 blobs per tree (~56 trees) + bushes. Faceted low-poly
  // blobs were the biggest cartoon tell in V4 — these use smooth shading,
  // continuous displacement noise and per-vertex colour so light wraps the
  // canopy like foliage instead of bouncing off flat facets.
  const treeSpots = [[-24, 62], [30, -28], [-88, 8], [88, 12], [-18, 96], [20, -96], [-96, -52], [96, 58], [-58, 92], [60, -96], [16, 34], [-16, 30], [-38, 72], [24, 20], [-24, -16], [64, 76], [-64, 78], [100, -30], [-100, 26], [44, -84], [-46, -88], [78, 96], [-78, -100], [104, 64], [-102, -70], [12, -30], [-12, -34], [58, 18], [-58, -14], [34, 100], [-90, -24], [90, -58], [22, 84], [-34, 100], [70, -78], [-70, 58], [48, 58], [-48, 44], [102, -96], [-108, 60], [14, 56], [-14, 52], [84, 30], [-84, -36], [40, -20], [-40, -64], [66, 100], [-96, 96], [110, -64], [-110, 100], [26, -104], [-24, -100], [56, -34], [-56, 68], [98, 104], [-62, -104]];
  const barkTex = canvasTex(256, (g, s) => {
    noiseFill(g, s, '#5d4630', 0.14, 2);
    for (let i = 0; i < 60; i++) { // vertical bark streaks
      g.strokeStyle = `rgba(30,20,10,${0.12 + hash(i, 3) * 0.22})`; g.lineWidth = 1 + hash(i, 8) * 2.5;
      const x = hash(i, 5) * s; g.beginPath(); g.moveTo(x, 0);
      g.bezierCurveTo(x + 6, s * 0.33, x - 6, s * 0.66, x + 3, s); g.stroke();
    }
  }, 2);
  const trunkIM = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.24, 0.52, 4.4, 8),
    new THREE.MeshStandardMaterial({ map: barkTex, color: 0x4a3a2c, roughness: 1 }), treeSpots.length);
  const canopyGeo = new THREE.SphereGeometry(2.35, 16, 12);
  { // continuous-noise displacement + leaf colour per vertex
    const pos = canopyGeo.attributes.position, v = new THREE.Vector3();
    const colors = new Float32Array(pos.count * 3);
    const dark = new THREE.Color(0x0d2413), light = new THREE.Color(0x2c4d27), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = Math.sin(v.x * 1.6 + 1.3) * Math.cos(v.y * 2.1 + 0.4) * 0.5
        + Math.sin(v.z * 2.3 + v.y * 1.2) * 0.35 + Math.sin((v.x + v.z) * 3.7) * 0.18;
      const d = 1 + n * 0.30;
      pos.setXYZ(i, v.x * d, v.y * d * 0.88, v.z * d);
      const t = THREE.MathUtils.clamp(0.5 + v.y / 4.4 + n * 0.35, 0, 1);
      c.lerpColors(dark, light, t);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    canopyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    canopyGeo.computeVertexNormals();
  }
  const canopyMat = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x8a9a84, roughness: 1, metalness: 0 });
  const crownIM = new THREE.InstancedMesh(canopyGeo, canopyMat, treeSpots.length * 4);
  trunkIM.castShadow = crownIM.castShadow = true; crownIM.receiveShadow = true;
  { const m4 = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    let ci = 0;
    treeSpots.forEach(([x, z], i) => {
      const s = 0.85 + (Math.abs(Math.sin(i * 7.3)) % 0.5);
      e.set(0, hash(i, 2) * Math.PI, 0); q.setFromEuler(e);
      sc.set(s, s, s);
      p.set(x, 2.2 * s, z); m4.compose(p, q, sc); trunkIM.setMatrixAt(i, m4);
      for (let k = 0; k < 4; k++) {
        const ox = (hash(i, k * 3 + 1) - 0.5) * 2.6, oz = (hash(k, i * 5) - 0.5) * 2.6;
        const oy = (4.6 + k * 0.72 + hash(i, k) * 0.6) * s;
        const bs = s * (1.18 - k * 0.15) * (0.88 + hash(k * 9, i) * 0.3);
        e.set(hash(i, k) * 0.6, hash(i * 3, k) * Math.PI * 2, hash(k, i) * 0.6); q.setFromEuler(e);
        sc.set(bs, bs * 0.9, bs);
        p.set(x + ox * s, oy, z + oz * s); m4.compose(p, q, sc); crownIM.setMatrixAt(ci, m4);
        col.setHSL(0.27 + hash(ci, 4) * 0.04, 0.28, 0.26 + hash(k, i * 13) * 0.1);
        crownIM.setColorAt(ci, col);
        ci++;
      }
      regCyl(x, z, 0.55, 2.6);
    }); }
  world.add(trunkIM); world.add(crownIM);

  // --- bushes: same canopy geometry, ground-hugging, scattered on grass ---
  const bushIM = new THREE.InstancedMesh(canopyGeo, canopyMat, 44);
  bushIM.castShadow = true;
  { const m4 = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    for (let i = 0; i < 44; i++) {
      // golden-angle ring between the roads and the perimeter, off the asphalt
      const a = i * 2.39996 + 0.7, rr = 30 + (i % 9) * 9.5;
      let x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (Math.abs(x) < 10) x += Math.sign(x || 1) * 12; // keep off the N-S road
      if (Math.abs(z - 8) < 10) z += 14;                  // keep off the E-W road
      const s = 0.32 + hash(i, 6) * 0.3;
      e.set(0, hash(i, 1) * Math.PI * 2, 0); q.setFromEuler(e);
      sc.set(s, s * 0.72, s);
      p.set(x, 0.55 * s + 0.3, z); m4.compose(p, q, sc); bushIM.setMatrixAt(i, m4);
      col.setHSL(0.27 + hash(i, 9) * 0.04, 0.26, 0.24 + hash(2, i) * 0.1);
      bushIM.setColorAt(i, col);
    } }
  world.add(bushIM);

  // --- rocks: instanced ---
  const rockIM = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mat(0x232a30, { roughness: 1, flatShading: true }), 36);
  rockIM.castShadow = true;
  { const m4 = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    for (let i = 0; i < 36; i++) {
      const a = i * 2.39996, rr = 96 + (i % 5) * 6; // golden-angle scatter near the edges
      const x = Math.cos(a) * rr * 0.98, z = Math.sin(a) * rr * 0.98;
      const s = 0.5 + (Math.abs(Math.sin(i * 3.7)) % 1.1);
      e.set(i, i * 2.1, i * 0.7); q.setFromEuler(e);
      p.set(x, s * 0.4, z); sc.set(s, s * 0.75, s);
      m4.compose(p, q, sc); rockIM.setMatrixAt(i, m4);
    } }
  world.add(rockIM);

  // --- lamps with glow sprites ---
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,205,110,0.85)'); grad.addColorStop(0.4, 'rgba(255,170,60,0.28)'); grad.addColorStop(1, 'rgba(255,160,40,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const lampHeadM = mat(0xffe2a0, { emissive: 0xffb84d, emissiveIntensity: 3.4 });
  const poleM = mat(0x05070a);
  const lampPoolIM = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(8.5, 8.5),
    new THREE.MeshBasicMaterial({ map: glowTex, color: 0xff9d45, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }),
    22);
  lampPoolIM.renderOrder = 3;
  { const m4 = new THREE.Matrix4(), e = new THREE.Euler(-Math.PI / 2, 0, 0), q = new THREE.Quaternion().setFromEuler(e), one = new THREE.Vector3(1, 1, 1);
    let li = 0;
    for (let i = -5; i <= 5; i++) for (const sx of [-1, 1]) {
      const x = sx * 8.5, z = i * 22;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.4, 6), poleM);
      pole.position.set(x, 2.7, z); pole.castShadow = true; world.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), lampHeadM);
      head.position.set(x, 5.5, z); world.add(head);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.setScalar(4.4); glow.position.set(x, 5.5, z); world.add(glow);
      m4.compose(new THREE.Vector3(x, 0.075, z), q, one); lampPoolIM.setMatrixAt(li++, m4);
      regCyl(x, z, 0.3, 5.4);
    } }
  world.add(lampPoolIM);
  // A few real point lights sell the pools on the car and nearby geometry;
  // the rest of the street lighting is emissive + bloom, like the reference.
  for (const [x, z] of [[-8.5, -44], [8.5, -22], [-8.5, 0], [8.5, 22], [-8.5, 44], [8.5, 66], [-8.5, 88]]) {
    const pl = new THREE.PointLight(0xffb469, 55, 31, 2);
    pl.position.set(x, 5.3, z); world.add(pl);
  }

  // --- dynamic cones (knockable!) ---
  const coneGeo = new THREE.ConeGeometry(0.55, 1.3, 10);
  const coneM = mat(ORANGE, { emissive: ORANGE, emissiveIntensity: 0.32, roughness: 0.7 });
  const coneBandM = mat(0xd8d8d2, { roughness: 0.55 });
  const coneAt = (x, z) => {
    // group origin = cone centre, so the physics sync moves cone + band together
    const grp = new THREE.Group(); grp.position.set(x, 0.65, z);
    const c = new THREE.Mesh(coneGeo, coneM); c.castShadow = true; grp.add(c);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.315, 0.40, 0.34, 12), coneBandM);
    band.position.y = -0.03; grp.add(band);
    world.add(grp);
    if (phys) phys.addDynamicCone(grp, { x, y: 0.65, z, halfH: 0.65, r: 0.55 });
  };
  [[-6, 62], [6, 62], [-6, 70], [6, 70], [-34, 8], [34, 8], [-3, 30], [3, 30], [-20, -58], [20, -58]].forEach(([x, z]) => coneAt(x, z));

  // --- dynamic crates: a knock-down stack near START + singles ---
  const crateM = new THREE.MeshStandardMaterial({ map: TEX.wood(), color: 0x8a7358, roughness: 0.85 });
  const crateStripeM = mat(BLACK);
  const crateAt = (x, y, z) => {
    const grp = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), crateM);
    b.castShadow = true; b.receiveShadow = true; grp.add(b);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.3, 1.56), crateStripeM); grp.add(stripe);
    grp.position.set(x, y, z); world.add(grp);
    if (phys) phys.addDynamicBox(grp, { x, y, z, hx: 0.75, hy: 0.75, hz: 0.75, density: 0.7 });
  };
  crateAt(-11, 0.75, 64); crateAt(-9.4, 0.75, 64); crateAt(-12.6, 0.75, 64);
  crateAt(-11, 2.25, 64); crateAt(-9.4, 2.25, 64); crateAt(-11, 3.75, 64);
  crateAt(58, 0.75, -58); crateAt(-58, 0.75, 20);

  // --- static barriers ---
  const barrier = (x, z, ry = 0) => {
    const g2 = new THREE.Group(); g2.position.set(x, 0, z); g2.rotation.y = ry;
    box(6, 1, 0.5, ORANGE, 0, 1.1, 0, g2); box(0.4, 1.6, 0.4, BLACK, -2.6, null, 0, g2); box(0.4, 1.6, 0.4, BLACK, 2.6, null, 0, g2);
    world.add(g2); regBox(x, 1, z, 3, 1, 0.5, ry);
  };
  barrier(-14, 44, 0.4); barrier(14, -30, -0.3); barrier(-88, -70, 0.2);

  // --- RAMPS: real drive-up wedges with rotated physics colliders ---
  const addRamp = (x, z, w, run, h) => {
    const { grp, slopeAngle } = makeRamp(w, run, h);
    grp.position.set(x, 0, z); world.add(grp);
    if (phys) {
      const quat = { x: Math.sin(slopeAngle / 2), y: 0, z: 0, w: Math.cos(slopeAngle / 2) }; // +X-rotation lifts the -Z end
      // slab centre sits mid-slope; its local -Z end rests on the ground at the top
      phys.addFixedBox({
        x, y: h / 2 - 0.25, z, hx: w / 2, hy: 0.25, hz: Math.hypot(run, h) / 2, quat, friction: 0.95,
      });
    }
    // side rails (visual + keep the car honest at the edges)
    regBox(x - w / 2 - 0.3, 0.5, z, 0.3, 0.5, run / 2);
    regBox(x + w / 2 + 0.3, 0.5, z, 0.3, 0.5, run / 2);
  };
  addRamp(26, 52, 9, 15, 3.4);   // hero jump ramp, launches you north toward CONTACT
  addRamp(-40, -58, 8, 11, 2.0); // small ramp on the west road

  // --- SKILLS zone: 10 blocks, two rows of five ---
  SKILLS.forEach((name, i) => {
    const col = i % 5, rowI = Math.floor(i / 5);
    const x = -28 + col * 14, z = -68 + rowI * 14;
    box(9, 3.2, 6, i % 2 ? BLACK : 0x3d3d3d, x, null, z, world);
    regBox(x, 1.6, z, 4.5, 1.6, 3);
    const s = makeSign(name, [], 8.5); s.position.set(x, 3.2, z - 3); s.scale.setScalar(0.6); world.add(s);
  });

  // --- PROJECTS zone: 3 display boards ---
  [['PROJECT ZERO', 'AI-AGENT PROTOCOL'], ['VIBE CODING', 'MASTERY - SSK TECHY'], ['TOP 10 SKILLS', 'STACK']].forEach(([t, sub], i) => {
    const x = -96 + i * 18, z = -50; // off the roads (V1 put one in the x=-52 road)
    const s = makeSign(t, [sub], 11); s.position.set(x, 0, z); s.lookAt(x, 0, 100); world.add(s);
    regBox(x, 1.8, z, 2.4, 1.8, 0.6);
  });

  // --- PROCESS gates: 6 arches the car drives between ---
  PROCESS_STEPS.forEach((step, i) => {
    const x = 46 + (i % 3) * 26, z = -24 - Math.floor(i / 3) * 30;
    const g2 = new THREE.Group(); g2.position.set(x, 0, z);
    box(0.8, 7, 0.8, i === 5 ? ORANGE : BLACK, -6, null, 0, g2);
    box(0.8, 7, 0.8, i === 5 ? ORANGE : BLACK, 6, null, 0, g2);
    box(13, 1.6, 1, i === 5 ? ORANGE : BLACK, 0, 6.6, 0, g2);
    const tex = signTexture(step, [`STEP ${i + 1} OF 6`], { bg: i === 5 ? '#ff5a00' : '#121212', fg: '#ffffff', accent: i === 5 ? '#121212' : '#ff5a00' });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(11, 3), new THREE.MeshStandardMaterial({
      map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.25, roughness: 0.6,
    }));
    label.position.set(0, 4.4, 0.55); g2.add(label);
    const label2 = label.clone(); label2.rotation.y = Math.PI; label2.position.z = -0.55; g2.add(label2);
    world.add(g2);
    regBox(x - 6, 3.5, z, 0.5, 3.5, 0.5); regBox(x + 6, 3.5, z, 0.5, 3.5, 0.5);
  });

  // --- floating hero signs (bobbed in the animation loop) ---
  const hero = makeSign('MERUGU', ['VIBE CODER - AI BUILDER'], 20);
  hero.position.set(0, 8, 58); world.add(hero); floaters.push(hero);
  const drive = makeSign('DRIVE!', ['EXPLORE THE WORLD'], 11);
  drive.position.set(16, 5, 34); world.add(drive); floaters.push(drive);

  // --- night sky: deterministic starfield + moon (no daytime clouds) ---
  { const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      const az = hash(i, 11) * Math.PI * 2;
      const y = 0.1 + hash(i, 23) * 0.9;
      const rxz = Math.sqrt(Math.max(0, 1 - y * y));
      starPos[i * 3] = Math.cos(az) * rxz * 2600;
      starPos[i * 3 + 1] = y * 2600;
      starPos[i * 3 + 2] = Math.sin(az) * rxz * 2600;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const skyStars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xcfe4f5, size: 7, sizeAttenuation: true, transparent: true, opacity: 0.8, fog: false, depthWrite: false,
    }));
    skyStars.frustumCulled = false; world.add(skyStars);
    const moon = new THREE.Mesh(new THREE.CircleGeometry(72, 40),
      new THREE.MeshBasicMaterial({ fog: false }));
    moon.material.color.setRGB(1.35, 1.48, 1.62);
    moon.position.set(-980, 720, -1880); moon.lookAt(0, 0, 0); world.add(moon);
    const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xaaccee, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    moonGlow.scale.setScalar(430); moonGlow.position.copy(moon.position); world.add(moonGlow); }

  // --- horizon: near green hills (vertex-colour gradient) + far mountains ---
  const hillGeo = new THREE.SphereGeometry(1, 24, 16);
  { const pos = hillGeo.attributes.position, v = new THREE.Vector3();
    const colors = new Float32Array(pos.count * 3);
    const base = new THREE.Color(0x05080a), top = new THREE.Color(0x111a20), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      c.lerpColors(base, top, THREE.MathUtils.clamp(v.y * 0.5 + 0.5, 0, 1));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    hillGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); }
  const hillM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.35;
    const hill = new THREE.Mesh(hillGeo, hillM);
    const r = 430 + hash(i, 8) * 110;
    hill.scale.set(150 + hash(i, 2) * 120, 30 + hash(3, i) * 30, 100 + hash(i, 5) * 70);
    hill.position.set(Math.cos(a) * r, -4, Math.sin(a) * r);
    world.add(hill);
  }
  const mtnM = mat(0x0a1119, { roughness: 1, flatShading: true });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.9;
    const h = 110 + hash(i, 12) * 90;
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(h * 1.35, h, 5), mtnM);
    const r = 760 + hash(6, i) * 140;
    mtn.position.set(Math.cos(a) * r, h / 2 - 6, Math.sin(a) * r);
    mtn.rotation.y = hash(i, 1) * Math.PI;
    world.add(mtn);
  }

  // --- perimeter walls (physics + visual blocks) ---
  regBox(0, 1, -118, WORLD_SIZE / 2, 1, 1.2); regBox(0, 1, 118, WORLD_SIZE / 2, 1, 1.2);
  regBox(-118, 1, 0, 1.2, 1, WORLD_SIZE / 2); regBox(118, 1, 0, 1.2, 1, WORLD_SIZE / 2);
  for (let i = -5; i <= 5; i++) {
    box(9, 2, 2, BLACK, i * 22, null, -118, world); box(9, 2, 2, BLACK, i * 22, null, 118, world);
    box(2, 2, 9, BLACK, -118, null, i * 22, world); box(2, 2, 9, BLACK, 118, null, i * 22, world);
  }

  return { floaters, drifters, stars, sun, reflector };
}
