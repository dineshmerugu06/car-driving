// World.js — V9 MERIDIAN REAL. Same city as V8, rebuilt materials:
// Dinesh asked for a REALISTIC graphic world — so every surface is now a
// photographic PBR scan (CC0: Poly Haven + ambientCG) with normal maps,
// lit by a real photographic morning HDRI (Poly Haven) instead of a
// shader sky. Canvas-drawn surfaces are gone.
//
// The anti-pixel rules (his one hard requirement):
//   - textures are generated at full resolution and sampled with the
//     renderer's MAX anisotropy — no grazing-angle smear or crawl;
//   - no film grain, no scanline, no RGB split in the grade (main.js) —
//     that samsy film noise is exactly what reads as "pixel" on a phone;
//   - no low-res reflector floor; roads/buildings are PBR lit by the
//     PMREM sky, reflections come from the environment at full res;
//   - geometry is real geometry at every distance — nothing is a
//     low-res billboard pretending to be a building.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

export const ORANGE = 0xff5a00;
export const BLACK = 0x121212;
export const WORLD_SIZE = 1700;
export const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 22), THREE.MathUtils.degToRad(125));

export const ZONES = [
  { id: 'start', name: 'START', x: 0, z: 40, r: 45, title: 'START — MERIDIAN', body: 'Our own world, rebuilt as a rainy neon city at night — Punk Drive style. Hero tower north, lighthouse at the south-east point, the bay on every side. W / \u2191 accelerate \u00b7 S / \u2193 brake & reverse \u00b7 A D steer \u00b7 SPACE handbrake.' },
  { id: 'about', name: 'ABOUT', x: -120, z: -285, r: 50, title: 'ABOUT — MERUGU', body: 'Merugu — vibe coder & AI builder from India. He learns by building: setup first, then Explore \u2192 Plan \u2192 Code \u2192 Verify \u2192 Commit.' },
  { id: 'zero', name: 'PROJECT ZERO', x: -360, z: -285, r: 50, title: 'PROJECT ZERO', body: 'Merugu\u2019s personal AI-agent operating protocol: the creator sets the objectives, verify before claiming done, protect data before any outside send, act freely on safe reversible work, confirm before anything consequential.' },
  { id: 'projects', name: 'PROJECTS', x: 120, z: -285, r: 50, title: 'PROJECTS', body: '1) PROJECT ZERO — AI-agent protocol. 2) VIBE CODING MASTERY — Claude Code course journey (SSK Techy). 3) TOP 10 CLAUDE SKILLS STACK — learned & installed. 4) This driveable 3D portfolio — zero_project1.' },
  { id: 'skills', name: 'SKILLS', x: 190, z: 190, r: 50, title: 'SKILLS — TOP 10', body: 'Ponytail \u00b7 Taste \u00b7 Impeccable \u00b7 Emil Motion \u00b7 Superpowers \u00b7 Caveman \u00b7 Frontend Design \u00b7 UI/UX Pro Max \u00b7 GStack \u00b7 Planning-with-Files. Installed & used whenever needed.' },
  { id: 'process', name: 'PROCESS', x: 0, z: 330, r: 50, title: 'PROCESS', body: 'Setup \u2192 Explore \u2192 Plan \u2192 Code \u2192 Verify \u2192 Commit. Setup is step 1 — before every task, every time.' },
  { id: 'contact', name: 'CONTACT', x: 560, z: 470, r: 55, title: 'CONTACT', body: 'GitHub: github.com/dineshmerugu06 — repo: zero_project1. That\u2019s the door. Come say hi.' },
];

// --- deterministic rng so the city is the same city every load ---
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildWorld(scene, physics, renderer) {
  const phys = physics;
  const regBox = (x, y, z, hx, hy, hz) => { if (phys) phys.addFixedBox({ x, y, z, hx, hy, hz }); };
  const maxAniso = 16; // WebGL clamps to the device's real max

  // --- atmosphere: a REAL morning sky (photographic HDRI) ---
  // The HDRI is both the visible sky and the light: scene.environment is
  // its PMREM, so every PBR surface reflects and shades from the same
  // real sky the player sees. A warm directional keeps real shadows.
  scene.background = new THREE.Color(0x04060d);
  new RGBELoader().load(new URL('assets/sky/morning.hdr', document.baseURI).href, (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    // PUNK: the HDRI is NOT shown — it only lights/reflects, dimmed hard,
    // the way Punk Drive grades a day sky into a night city.
    if (renderer) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromEquirectangular(hdr).texture;
      scene.environmentIntensity = 0.14;
    }
  });
  scene.fog = new THREE.Fog(0x05060e, 55, 980);
  scene.add(new THREE.HemisphereLight(0x33456e, 0x05060a, 0.25));
  const sun = new THREE.DirectionalLight(0x8fb4ff, 0.3);
  sun.position.copy(SUN_DIR).multiplyScalar(260); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, far: 700 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const world = new THREE.Group(); scene.add(world);
  const rand = mulberry32(20261031);

  // --- photographic PBR sets (CC0 scans, full res, max anisotropy) ---
  const texLoader = new THREE.TextureLoader();
  const loadTex = (path, srgb) => {
    const t = texLoader.load(new URL(path, document.baseURI).href);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const loadSet = (dir, withRough) => ({
    map: loadTex(`assets/pbr/${dir}/map.jpg`, true),
    normal: loadTex(`assets/pbr/${dir}/normal.jpg`, false),
    rough: withRough ? loadTex(`assets/pbr/${dir}/rough.jpg`, false) : null,
  });
  const cloneSet = (set, rx, ry) => {
    const c = (t) => { if (!t) return null; const x = t.clone(); x.needsUpdate = true; x.repeat.set(rx, ry); return x; };
    return { map: c(set.map), normalMap: c(set.normal), roughnessMap: c(set.rough) };
  };
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3c4145, roughness: 0.95 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const asphaltSet = loadSet('asphalt', false);
  const sidewalkSet = loadSet('sidewalk', false);
  const FACADE_SETS = [loadSet('facade1', true), loadSet('facade2', true), loadSet('facade3', true), loadSet('facade4', true)];
  const facadeCache = new Map();
  const facadeMat = (idx, w, h) => {
    // repeats quantized + cached: windows stay one size on every tower
    const rx = Math.max(1, Math.round(w / 30)), ry = Math.max(1, Math.round(h / 30));
    const key = idx + ':' + rx + ':' + ry;
    if (!facadeCache.has(key)) {
      const maps = cloneSet(FACADE_SETS[idx], rx, ry);
      const m = new THREE.MeshStandardMaterial({ ...maps, roughness: 1.0, metalness: 0.04 });
      m.color.setScalar(0.34); // night-darkened photo…
      m.emissiveMap = maps.map; // …whose lit windows glow back (bloom food)
      m.emissive = new THREE.Color(0x8fb4e8);
      m.emissiveIntensity = 0.75;
      m.normalScale = new THREE.Vector2(0.75, 0.75);
      facadeCache.set(key, m);
    }
    return facadeCache.get(key);
  };
  const speckle = (g, w, h, n, alpha) => {
    for (let i = 0; i < n; i++) {
      const v = 118 + rand() * 60;
      g.fillStyle = `rgba(${v},${v},${v + 6},${alpha})`;
      g.fillRect(rand() * w, rand() * h, 2, 2);
    }
  };
  const canvasTex = (w, h, draw, rx = 1, ry = 1) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = maxAniso;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  // Painted road markings ONLY (transparent) laid over the real asphalt.
  const markTex = canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(232,228,218,0.92)';
    g.fillRect(6, 0, 5, h); g.fillRect(w - 11, 0, 5, h);
    g.fillRect(w / 2 - 4, 18, 8, 96);
  });
  const roadPair = (len) => {
    const rep = Math.max(1, Math.round(len / 22));
    const a = new THREE.MeshStandardMaterial({ ...cloneSet(asphaltSet, 1, rep), roughness: 0.96, metalness: 0 });
    a.color.setScalar(0.34); a.roughness = 0.3; a.envMapIntensity = 1.7; // PUNK wet street: dark + slick so neon smears across it
    const mt = markTex.clone(); mt.needsUpdate = true; mt.repeat.set(1, Math.max(1, Math.round(len / 46)));
    const b = new THREE.MeshStandardMaterial({ map: mt, transparent: true, roughness: 0.5, depthWrite: false });
    b.color.setScalar(0.75);
    return [a, b];
  };

  // --- island + sea ---
  const island = new THREE.Mesh(new THREE.BoxGeometry(1500, 6, 1500),
    new THREE.MeshStandardMaterial({ ...cloneSet(sidewalkSet, 90, 90), roughness: 0.7 }));
  island.material.color.setScalar(0.3); island.material.envMapIntensity = 0.3;
  island.position.y = -3.02; island.receiveShadow = true; world.add(island);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(1560, 2.4, 1560),
    new THREE.MeshStandardMaterial({ color: 0x23272c, roughness: 0.9 }));
  rim.position.y = -1.6; world.add(rim);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000),
    new THREE.MeshStandardMaterial({ color: 0x0a1622, roughness: 0.05, metalness: 0.05, envMapIntensity: 1.5 }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -0.9; world.add(sea);
  // perimeter: keep the car on the island
  regBox(0, 6, -745, 745, 6, 2); regBox(0, 6, 745, 745, 6, 2);
  regBox(-745, 6, 0, 2, 6, 745); regBox(745, 6, 0, 2, 6, 745);

  // --- roads ---
  const road = (cx, cz, wdt, len, alongZ, y) => {
    const [a, b] = roadPair(len);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wdt, len), a);
    m.rotation.x = -Math.PI / 2; if (!alongZ) m.rotation.z = Math.PI / 2;
    m.position.set(cx, y, cz); m.receiveShadow = true; world.add(m);
    const mk = new THREE.Mesh(new THREE.PlaneGeometry(wdt, len), b);
    mk.rotation.copy(m.rotation); mk.position.set(cx, y + 0.015, cz); mk.renderOrder = 2; world.add(mk);
  };
  for (const x of [-480, -240, 0, 240, 480]) road(x, 0, 46, 1330, true, 0.02);
  for (const z of [-480, -240, 0, 240]) road(0, z, 46, 1330, false, 0.04);
  road(0, -648, 1330, 40, false, 0.03); road(0, 648, 1330, 40, false, 0.03);
  road(-648, 0, 40, 1330, true, 0.03); road(648, 0, 40, 1330, true, 0.03);

  // --- plaza pads + buildings on the block grid ---
  const plazaMat = new THREE.MeshStandardMaterial({ ...cloneSet(sidewalkSet, 8, 8), roughness: 0.6 });
  plazaMat.color.setScalar(0.38); plazaMat.envMapIntensity = 0.35;
  const vLines = [-648, -480, -240, 0, 240, 480, 648];
  const hLines = [-648, -480, -240, 0, 240, 648];
  const cells = [];
  for (let i = 0; i < vLines.length - 1; i++) for (let j = 0; j < hLines.length - 1; j++) {
    cells.push({
      x0: vLines[i] + 26, x1: vLines[i + 1] - 26, z0: hLines[j] + 26, z1: hLines[j + 1] - 26,
    });
  }
  const building = (cx, cz, wdt, dep, hgt, matIdx) => {
    const mat = facadeMat(matIdx, wdt, hgt);
    const mats = [mat, mat, roofMat, roofMat, mat, mat];
    const m = new THREE.Mesh(boxGeo, mats);
    m.scale.set(wdt, hgt, dep); m.position.set(cx, hgt / 2 + 0.3, cz);
    m.castShadow = true; m.receiveShadow = true; world.add(m);
    regBox(cx, hgt / 2 + 0.3, cz, wdt / 2, hgt / 2 + 0.3, dep / 2);
    return m;
  };
  for (const c of cells) {
    const cw = c.x1 - c.x0, cd = c.z1 - c.z0, cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
    const pad = new THREE.Mesh(boxGeo, plazaMat);
    pad.scale.set(cw + 14, 0.3, cd + 14); pad.position.set(cx, 0.15, cz);
    pad.receiveShadow = true; world.add(pad);
    if (Math.hypot(cx, cz) < 185) continue;              // START plaza stays open
    if (cz === -360 && (cx === -360 || cx === -120 || cx === 120)) continue; // hero row placed by hand
    if (cx > 480 && cz > 380) continue;                 // lighthouse point
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const bw = 38 + rand() * (Math.min(cw, 120) - 38), bd = 38 + rand() * (Math.min(cd, 120) - 38);
      const bx = c.x0 + bw / 2 + rand() * Math.max(1, cw - bw);
      const bz = c.z0 + bd / 2 + rand() * Math.max(1, cd - bd);
      const centreBoost = Math.max(0, 1 - Math.hypot(bx, bz) / 800);
      const bh = 34 + rand() * 60 + centreBoost * 85;
      building(bx, bz, bw, bd, bh, Math.floor(rand() * 4));
    }
  }

  // --- screens: same content system as V7.6, on our own panels ---
  const coverFit = (tex, targetAspect, w, h) => {
    const ia = (w && h) ? w / h : (tex.image ? tex.image.width / tex.image.height : 1);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    if (ia > targetAspect) { tex.repeat.set(targetAspect / ia, 1); tex.offset.set((1 - targetAspect / ia) / 2, 0); }
    else { tex.repeat.set(1, ia / targetAspect); tex.offset.set(0, (1 - ia / targetAspect) / 2); }
    return tex;
  };
  const imgMat = (file, aspect) => {
    const t = coverFit(new THREE.TextureLoader().load(new URL('assets/screens/' + file, document.baseURI).href), aspect);
    t.anisotropy = maxAniso;
    const m = new THREE.MeshBasicMaterial({ map: t }); m.color.setRGB(1.45, 1.45, 1.45);
    return m;
  };
  const canvasMat = (w, h, draw) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
    const m = new THREE.MeshBasicMaterial({ map: t }); m.color.setRGB(1.45, 1.45, 1.45);
    return m;
  };
  const videoMat = () => {
    const v = document.createElement('video');
    v.src = new URL('assets/screens/dragon-studio.mp4', document.baseURI).href;
    v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
    v.play().catch(() => {});
    const tex = new THREE.VideoTexture(v);
    tex.colorSpace = THREE.SRGBColorSpace;
    v.addEventListener('loadedmetadata', () => coverFit(tex, 1.75, v.videoWidth, v.videoHeight));
    const m = new THREE.MeshBasicMaterial({ map: tex }); m.color.setRGB(1.45, 1.45, 1.45);
    return m;
  };
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.6, metalness: 0.3 });
  const panel = (cx, cy, cz, wdt, hgt, mat, ry = 0) => {
    const grp = new THREE.Group();
    const back = new THREE.Mesh(boxGeo, frameMat);
    back.scale.set(wdt + 4, hgt + 4, 2.5); grp.add(back);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(wdt, hgt), mat);
    face.position.z = 1.3; grp.add(face);
    const face2 = face.clone(); face2.rotation.y = Math.PI; face2.position.z = -1.3; grp.add(face2);
    grp.position.set(cx, cy, cz); grp.rotation.y = ry;
    world.add(grp);
    return grp;
  };

  // --- hero row (north edge, facing spawn): tower + two image towers ---
  const hero = building(-120, -360, 110, 110, 215, 1);
  panel(-120, 128, -303.5, 118, 48, imgMat('hero-collage.jpg', 2.44));
  building(-360, -360, 84, 84, 150, 0);
  panel(-360, 92, -316.5, 84, 46, imgMat('hero-batman.jpg', 1.83));
  building(120, -360, 84, 84, 168, 2);
  panel(120, 100, -316.5, 84, 46, imgMat('deathstroke.jpg', 1.83));
  void hero;

  // --- START plaza: map boards + video kiosks ---
  const mapDraw = (g, w, h) => {
    g.fillStyle = '#0a1420'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#7fd4ff'; g.font = '900 150px Arial'; g.textAlign = 'center';
    g.fillText('MERUGU', w / 2, 240);
    g.fillStyle = '#e8f4ff'; g.font = '700 74px Arial';
    g.fillText('PROJECT ZERO', w / 2, 360);
    g.fillStyle = '#5f7d95'; g.font = '600 52px Arial';
    g.fillText('FIND ALL 7 ZONES', w / 2, 480);
  };
  panel(-58, 13, -38, 30, 17, canvasMat(1024, 600, mapDraw), Math.PI / 5);
  panel(58, 13, -38, 30, 17, canvasMat(1024, 600, mapDraw), -Math.PI / 5);
  const vidMat = videoMat();
  for (const kx of [118, 168, 218, 268]) {
    const kiosk = new THREE.Mesh(boxGeo, frameMat);
    kiosk.scale.set(17, 15, 6); kiosk.position.set(kx, 7.5, 197); world.add(kiosk);
    regBox(kx, 7.5, 197, 8.5, 7.5, 3);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(15.5, 8.8), vidMat);
    scr.position.set(kx, 8.6, 193.9); scr.rotation.y = Math.PI; world.add(scr);
    const scr2 = scr.clone(); scr2.position.z = 200.1; scr2.rotation.y = 0; world.add(scr2);
  }

  // --- PROCESS gantry across the south straight ---
  const post = new THREE.Mesh(boxGeo, frameMat);
  for (const px of [-30, 30]) {
    const p = post.clone(); p.scale.set(4, 34, 4); p.position.set(px, 17, 300); world.add(p);
    regBox(px, 17, 300, 2, 17, 2);
  }
  const beam = new THREE.Mesh(boxGeo, frameMat);
  beam.scale.set(64, 13, 3); beam.position.set(0, 30, 300); world.add(beam);
  const bannerMat = canvasMat(2048, 536, (g, w, h) => {
    g.fillStyle = '#0d0d10'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffb02e'; g.font = '900 175px Arial'; g.textAlign = 'center';
    g.fillText('PROJECT ZERO ★ MERIDIAN ★ PROJECT ZERO', w / 2, 330);
  });
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(62, 12), bannerMat);
    b.position.set(0, 30, 300 + s * 1.6); if (s < 0) b.rotation.y = Math.PI;
    world.add(b);
  }

  // --- lighthouse point (CONTACT) ---
  const lightBase = new THREE.Mesh(new THREE.CylinderGeometry(16, 20, 14, 20), plazaMat);
  lightBase.position.set(600, 7, 540); world.add(lightBase);
  const stripeTex = canvasTex(256, 512, (g, w, h) => {
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#e8e4da' : '#c93a2e'; g.fillRect(0, (h / 6) * i, w, h / 6); }
  }, 3, 1);
  const lightTower = new THREE.Mesh(new THREE.CylinderGeometry(9, 13, 96, 20),
    new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.7 }));
  lightTower.position.set(600, 62, 540); lightTower.castShadow = true; world.add(lightTower);
  if (phys) phys.addFixedCylinder({ x: 600, z: 540, r: 15, h: 110 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(6.5, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.9, 1.2) }));
  lamp.position.set(600, 116, 540); world.add(lamp);

  // --- trees + lamps along the avenues ---
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4a7d43, roughness: 0.9 });
  const trunkGeo = new THREE.CylinderGeometry(0.9, 1.3, 9, 7);
  const leafGeo = new THREE.IcosahedronGeometry(6.4, 1);
  const treeAt = (x, z) => {
    const t = new THREE.Group();
    const tr = new THREE.Mesh(trunkGeo, trunkMat); tr.position.y = 4.5; t.add(tr);
    const l1 = new THREE.Mesh(leafGeo, leafMat); l1.position.y = 13; l1.castShadow = true; t.add(l1);
    const l2 = new THREE.Mesh(leafGeo, leafMat); l2.scale.setScalar(0.7); l2.position.set(3.4, 17, 2); t.add(l2);
    t.position.set(x, 0.3, z); world.add(t);
    if (phys) phys.addFixedCylinder({ x, z, r: 1.6, h: 9 });
  };
  for (const z of [-560, -380, -160, 160, 380, 560]) { treeAt(-33, z); treeAt(33, z); }
  for (const x of [-560, -380, -160, 160, 380, 560]) { treeAt(x, 581); treeAt(x, -581); }
  const lampPostGeo = new THREE.CylinderGeometry(0.5, 0.7, 17, 6);
  const lampHeadGeo = new THREE.SphereGeometry(1.7, 10, 8);
  const lampHeadMats = [
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 0.45, 2.4) }),  // magenta
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 2.1, 2.8) }),  // cyan
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.8, 1.0) }),   // warm
  ];
  let lampIdx = 0;
  const lampAt = (x, z) => {
    const p = new THREE.Mesh(lampPostGeo, frameMat); p.position.set(x, 8.5, z); world.add(p);
    const hd = new THREE.Mesh(lampHeadGeo, lampHeadMats[lampIdx++ % 3]); hd.position.set(x, 17.6, z); world.add(hd);
  };
  for (let z = -520; z <= 520; z += 173) { lampAt(-27, z); lampAt(27, z + 86); }
  for (let x = -520; x <= 520; x += 173) { lampAt(x, -27); lampAt(x + 86, 27); }

  // --- zone rings (pulsed by main.js) ---
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  for (const z of ZONES) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(9, 11.5, 40), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.set(z.x, 0.35, z.z);
    world.add(ring); z.ring = ring;
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(3.4),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 2.6, 0.4) }));
    star.position.set(z.x, 6, z.z); world.add(star);
    z.starMesh = star;
  }

  // --- clouds (drifters, moved by main.js) ---
  const cloudTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 64, 8, 128, 64, 90);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const drifters = [];
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.13, depthWrite: false, color: 0x39466a }));
    s.scale.set(280 + rand() * 160, 90 + rand() * 50, 1);
    s.position.set(-260 + rand() * 520, 230 + rand() * 90, -420 + rand() * 840);
    world.add(s); drifters.push(s);
  }

  // --- NEON GATES over the central avenue + street pylons (Punk's
  // signature: saturated emissive signage feeding the bloom) ---
  const NEON = [[255, 43, 209], [34, 211, 238], [255, 122, 24], [182, 255, 46], [255, 43, 80]];
  const neonMats = NEON.map(([r, g, b]) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r / 255 * 1.9, g / 255 * 1.9, b / 255 * 1.9) }));
  const neonGeo = new THREE.BoxGeometry(1, 1, 1);
  let neonIdx = 0;
  const neonPylon = (x, z, hgt) => {
    const m = new THREE.Mesh(neonGeo, neonMats[neonIdx++ % neonMats.length]);
    m.scale.set(1.8, hgt, 1.8); m.position.set(x, hgt / 2, z); world.add(m);
  };
  for (const z of [-420, -240, -60, 120, 300, 480]) {
    const hgt = 27 + rand() * 10;
    neonPylon(-25.4, z, hgt); neonPylon(25.4, z, hgt);
    const bar = new THREE.Mesh(neonGeo, neonMats[neonIdx++ % neonMats.length]);
    bar.scale.set(52.6, 2.4, 1.4); bar.position.set(0, hgt + 1.2, z); world.add(bar);
  }
  for (const x of [-420, -240, 240, 420]) { neonPylon(x, -25.4, 24 + rand() * 12); neonPylon(x, 25.4, 24 + rand() * 12); }

  // --- RAIN: streak points in a box that follows the camera (Punk's
  // other signature). Falls fast, wraps, never thins out. ---
  const rainTexC = document.createElement('canvas'); rainTexC.width = 16; rainTexC.height = 64;
  const rg = rainTexC.getContext('2d');
  const rgrad = rg.createLinearGradient(0, 0, 0, 64);
  rgrad.addColorStop(0, 'rgba(255,255,255,0)'); rgrad.addColorStop(0.5, 'rgba(255,255,255,0.9)'); rgrad.addColorStop(1, 'rgba(255,255,255,0)');
  rg.fillStyle = rgrad; rg.fillRect(6, 0, 4, 64);
  const RAIN_N = 1700, RAIN_H = 180;
  const rainPos = new Float32Array(RAIN_N * 3), rainSpd = new Float32Array(RAIN_N);
  for (let i = 0; i < RAIN_N; i++) {
    rainPos[i * 3] = (rand() - 0.5) * 320; rainPos[i * 3 + 1] = rand() * RAIN_H; rainPos[i * 3 + 2] = (rand() - 0.5) * 320;
    rainSpd[i] = 130 + rand() * 90;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
    size: 4.6, map: new THREE.CanvasTexture(rainTexC), transparent: true, opacity: 0.4,
    color: 0x9fc4e8, depthWrite: false, sizeAttenuation: true,
  }));
  rain.frustumCulled = false; world.add(rain);
  const tickers = [(dt, elapsed, camPos) => {
    const p = rainGeo.attributes.position.array;
    for (let i = 0; i < RAIN_N; i++) {
      p[i * 3 + 1] -= rainSpd[i] * dt;
      if (p[i * 3 + 1] < 0) p[i * 3 + 1] += RAIN_H;
    }
    rainGeo.attributes.position.needsUpdate = true;
    rain.position.set(camPos.x, 0, camPos.z);
  }];

  const stars = ZONES.map((z) => ({ taken: false, mesh: z.starMesh, baseY: 6, zone: z }));
  return { floaters: [], drifters, stars, sun, reflector: null, tickers };
}
