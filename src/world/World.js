// World.js — scene, ground, roads, props, zones, signs, colliders.
// Everything is original geometry + canvas-texture signs. No external assets.
import * as THREE from 'three';

export const ORANGE = 0xff5a00;
export const BLACK = 0x121212;
export const WORLD_SIZE = 240; // playable square, clamped at ±WORLD_SIZE/2

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.02, ...opts });

function signTexture(title, lines = [], { bg = '#121212', fg = '#e9e9e6', accent = '#ff5a00' } = {}) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 512);
  g.fillStyle = accent; g.fillRect(0, 0, 1024, 26); g.fillRect(0, 486, 1024, 26);
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

function makeSign(title, lines, w = 14) {
  const grp = new THREE.Group();
  const tex = signTexture(title, lines);
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, w / 2, 0.4),
    [mat(BLACK), mat(BLACK), mat(BLACK), mat(BLACK), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }), mat(BLACK)]);
  board.position.y = w / 4 + 3.4; board.castShadow = true; grp.add(board);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 3.6, 8), mat(BLACK));
    post.position.set(sx * w * 0.36, 1.8, 0); post.castShadow = true; grp.add(post);
  }
  return grp;
}

function box(w, h, d, color, x = 0, y = null, z = 0, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y === null ? h / 2 : y, z);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

export const ZONES = [
  { id: 'start', name: 'START', x: 0, z: 78, r: 16, title: 'START PLAZA', body: 'Welcome to Merugu\u2019s world. Drive to each zone to explore \u2014 follow the orange rings and big signs. WASD / arrows to drive, pedals on touch screens.' },
  { id: 'about', name: 'ABOUT', x: -72, z: 42, r: 17, title: 'ABOUT \u2014 MERUGU', body: 'Merugu \u2014 vibe coder & AI builder from India. He learns by building: setup first, then Explore \u2192 Plan \u2192 Code \u2192 Verify \u2192 Commit.' },
  { id: 'zero', name: 'PROJECT ZERO', x: 72, z: 42, r: 17, title: 'PROJECT ZERO', body: 'Merugu\u2019s personal AI-agent operating protocol: the creator sets the objectives, verify before claiming done, protect data before any outside send, act freely on safe reversible work, confirm before anything consequential.' },
  { id: 'projects', name: 'PROJECTS', x: -72, z: -38, r: 18, title: 'PROJECTS', body: '1) PROJECT ZERO \u2014 AI-agent protocol. 2) VIBE CODING MASTERY \u2014 Claude Code course journey (SSK Techy). 3) TOP 10 CLAUDE SKILLS STACK \u2014 learned & installed. 4) This driveable 3D portfolio \u2014 zero_project1.' },
  { id: 'skills', name: 'SKILLS', x: 0, z: -78, r: 19, title: 'SKILLS \u2014 TOP 10', body: 'Ponytail \u00b7 Taste \u00b7 Impeccable \u00b7 Emil Motion \u00b7 Superpowers \u00b7 Caveman \u00b7 Frontend Design \u00b7 UI/UX Pro Max \u00b7 GStack \u00b7 Planning-with-Files. Installed & used whenever needed.' },
  { id: 'process', name: 'PROCESS', x: 74, z: -40, r: 18, title: 'PROCESS', body: 'Drive through the six gates: SETUP \u2192 EXPLORE \u2192 PLAN \u2192 CODE \u2192 VERIFY \u2192 COMMIT. Setup is step 1 \u2014 before every task, every time.' },
  { id: 'contact', name: 'CONTACT', x: 0, z: 8, r: 14, title: 'CONTACT', body: 'GitHub: github.com/dineshmerugu06 \u2014 repo: zero_project1. That\u2019s the door. Come say hi.' },
];

export const SKILLS = ['PONYTAIL', 'TASTE', 'IMPECCABLE', 'EMIL MOTION', 'SUPERPOWERS', 'CAVEMAN', 'FRONTEND DESIGN', 'UI/UX PRO MAX', 'GSTACK', 'PLANNING WITH FILES'];
export const PROCESS_STEPS = ['SETUP', 'EXPLORE', 'PLAN', 'CODE', 'VERIFY', 'COMMIT'];

export function buildWorld(scene) {
  const colliders = []; // {x, z, r}
  const hit = (x, z, r) => colliders.push({ x, z, r });

  scene.background = new THREE.Color(0xbfd6de);
  scene.fog = new THREE.Fog(0xbfd6de, 90, 260);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f6a, 0.9));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.0);
  sun.position.set(60, 90, 40); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -140, right: 140, top: 140, bottom: -140, far: 300 });
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  const world = new THREE.Group(); scene.add(world);

  // --- ground ---
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE + 120, WORLD_SIZE + 120), mat(0xd8d2c2));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; world.add(ground);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(20, 40), mat(0xcac2ae));
  pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.02, 78); pad.receiveShadow = true; world.add(pad);

  // --- roads ---
  const roadMat = mat(0x2a2a2a, { roughness: 1 });
  const road = (w, d, x, z) => { const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat); r.rotation.x = -Math.PI / 2; r.position.set(x, 0.03, z); r.receiveShadow = true; world.add(r); };
  road(14, WORLD_SIZE, 0, 0);
  road(WORLD_SIZE, 14, 0, 8);
  road(10, 100, -52, 32); road(10, 100, 52, 32);
  road(10, 100, -52, -52); road(10, 100, 52, -52);
  road(120, 10, 0, -58);
  for (let i = -10; i <= 10; i++) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 4), mat(ORANGE));
    d.rotation.x = -Math.PI / 2; d.position.set(0, 0.05, i * 11); world.add(d);
    const d2 = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), mat(ORANGE));
    d2.rotation.x = -Math.PI / 2; d2.position.set(i * 11, 0.05, 8); world.add(d2);
  }

  // --- zone rings + signs ---
  for (const z of ZONES) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(z.r - 1.2, z.r, 48),
      new THREE.MeshBasicMaterial({ color: ORANGE, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(z.x, 0.06, z.z); world.add(ring);
    z.ring = ring;
    const s = makeSign(z.name, z.id === 'contact' ? ['GITHUB.COM/DINESH', 'MERUGU06'] : ['DRIVE IN TO EXPLORE'], z.id === 'skills' ? 17 : 13);
    s.position.set(z.x, 0, z.z - z.r - 4);
    s.lookAt(0, 0, 0); s.rotateY(Math.PI);
    world.add(s);
    hit(z.x, z.z - z.r - 4, 2.2);
  }

  // --- buildings ---
  const buildingSpots = [[-105, -85], [-92, -95], [100, 88], [108, -88], [-104, 88], [96, 96], [-40, -104], [44, 104], [110, 0], [-110, -10], [30, -108], [-28, 108]];
  for (const [x, z] of buildingSpots) {
    const h = 10 + (((x * 7 + z * 13) % 14) + 14) % 14;
    box(12, h, 12, BLACK, x, null, z, world); hit(x, z, 9);
    box(12.4, 1, 12.4, ORANGE, x, h - 2, z, world);
    for (let wy = 3; wy < h - 3; wy += 3.2) {
      const win = box(3, 0.7, 0.3, 0xffd98a, x, wy, z + 6.05, world);
      win.material = mat(0xffd98a, { emissive: 0xcc8a2d, emissiveIntensity: 0.6 });
    }
  }

  // --- trees ---
  const treeSpots = [[-24, 60], [24, 58], [-30, -30], [30, -28], [-88, 8], [88, 12], [-18, 96], [20, -96], [-96, -52], [96, 58], [-58, 92], [60, -96], [16, 34], [-16, 30], [38, 70], [-38, 72]];
  for (const [x, z] of treeSpots) {
    const t = new THREE.Group(); t.position.set(x, 0, z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.4, 7), mat(0x6b4a2b)); trunk.position.y = 1.2; trunk.castShadow = true; t.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(2.6, 6, 8), mat(0x3f7a3a)); crown.position.y = 5.2; crown.castShadow = true; t.add(crown);
    world.add(t); hit(x, z, 1.1);
  }

  // --- lamps ---
  for (let i = -5; i <= 5; i++) for (const sx of [-1, 1]) {
    const x = sx * 8.5, z = i * 22;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.4, 6), mat(BLACK));
    pole.position.set(x, 2.7, z); pole.castShadow = true; world.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), mat(0xffe2a0, { emissive: 0xffb84d, emissiveIntensity: 1.2 }));
    head.position.set(x, 5.5, z); world.add(head); hit(x, z, 0.5);
  }

  // --- cones + barriers ---
  const coneAt = (x, z) => { const c = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.3, 10), mat(ORANGE)); c.position.set(x, 0.65, z); c.castShadow = true; world.add(c); hit(x, z, 0.8); };
  [[-6, 62], [6, 62], [-6, 70], [6, 70], [-34, 8], [34, 8]].forEach(([x, z]) => coneAt(x, z));
  const barrier = (x, z, ry = 0) => {
    const g2 = new THREE.Group(); g2.position.set(x, 0, z); g2.rotation.y = ry;
    box(6, 1, 0.5, ORANGE, 0, 1.1, 0, g2); box(0.4, 1.6, 0.4, BLACK, -2.6, null, 0, g2); box(0.4, 1.6, 0.4, BLACK, 2.6, null, 0, g2);
    world.add(g2); hit(x, z, 2.4);
  };
  barrier(-14, 44, 0.4); barrier(14, -30, -0.3); barrier(-88, -70, 0.2);

  // --- ramp block ---
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(10, 2.5, 14), mat(0x3a3a3a));
  ramp.position.set(38, 1.25, 92); ramp.castShadow = true; ramp.receiveShadow = true; world.add(ramp);
  box(10.4, 0.5, 14.4, ORANGE, 38, 2.7, 92, world); hit(38, 92, 7);

  // --- SKILLS zone: 10 blocks, two rows of five ---
  SKILLS.forEach((name, i) => {
    const col = i % 5, rowI = Math.floor(i / 5);
    const x = -28 + col * 14, z = -68 + rowI * 14;
    box(9, 3.2, 6, i % 2 ? BLACK : 0x3d3d3d, x, null, z, world); hit(x, z, 4.6);
    const s = makeSign(name, [], 8.5); s.position.set(x, 3.2, z - 3); s.scale.setScalar(0.6); world.add(s);
  });

  // --- PROJECTS zone: 3 display boards ---
  [['PROJECT ZERO', 'AI-AGENT PROTOCOL'], ['VIBE CODING', 'MASTERY - SSK TECHY'], ['TOP 10 SKILLS', 'STACK']].forEach(([t, sub], i) => {
    const x = -92 + i * 20, z = -56;
    const s = makeSign(t, [sub], 11); s.position.set(x, 0, z); s.lookAt(x, 0, 100); world.add(s); hit(x, z, 2);
  });

  // --- PROCESS gates: 6 arches the car drives between ---
  PROCESS_STEPS.forEach((step, i) => {
    const x = 46 + (i % 3) * 26, z = -24 - Math.floor(i / 3) * 30;
    const g2 = new THREE.Group(); g2.position.set(x, 0, z);
    box(0.8, 7, 0.8, i === 5 ? ORANGE : BLACK, -6, null, 0, g2);
    box(0.8, 7, 0.8, i === 5 ? ORANGE : BLACK, 6, null, 0, g2);
    box(13, 1.6, 1, i === 5 ? ORANGE : BLACK, 0, 6.6, 0, g2);
    const tex = signTexture(step, [`STEP ${i + 1} OF 6`], { bg: i === 5 ? '#ff5a00' : '#121212', fg: '#ffffff', accent: i === 5 ? '#121212' : '#ff5a00' });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(11, 3), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    label.position.set(0, 4.4, 0.55); g2.add(label);
    const label2 = label.clone(); label2.rotation.y = Math.PI; label2.position.z = -0.55; g2.add(label2);
    world.add(g2);
    hit(x - 6, z, 1.2); hit(x + 6, z, 1.2);
  });

  // --- floating hero signs (bobbed in the animation loop) ---
  const floaters = [];
  const hero = makeSign('MERUGU', ['VIBE CODER - AI BUILDER'], 20);
  hero.position.set(0, 8, 58); world.add(hero); floaters.push(hero);
  const drive = makeSign('DRIVE!', ['EXPLORE THE WORLD'], 11);
  drive.position.set(16, 5, 34); world.add(drive); floaters.push(drive);

  // --- perimeter blocks ---
  for (let i = -5; i <= 5; i++) {
    box(9, 2, 2, BLACK, i * 22, null, -118, world); box(9, 2, 2, BLACK, i * 22, null, 118, world);
    box(2, 2, 9, BLACK, -118, null, i * 22, world); box(2, 2, 9, BLACK, 118, null, i * 22, world);
  }

  return { colliders, floaters, zones: ZONES };
}
