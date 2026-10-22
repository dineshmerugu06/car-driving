// World.js — scene, lights, ground/roads (canvas textures), props, zones,
// signs, stars, and ALL physics registration (via PhysicsWorld).
// Everything is original geometry + canvas textures. No external assets.
import * as THREE from 'three';

export const ORANGE = 0xff5a00;
export const BLACK = 0x121212;
export const WORLD_SIZE = 240; // playable square, clamped at ±WORLD_SIZE/2

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
export const TEX = {
  ground: () => canvasTex(256, (g, s) => { g.fillStyle = '#d8d2c2'; g.fillRect(0, 0, s, s); speckle(g, s, 2600, 0.05); }, 26),
  asphalt: () => canvasTex(256, (g, s) => { g.fillStyle = '#2b2b2b'; g.fillRect(0, 0, s, s); speckle(g, s, 3200, 0.07); }, 8),
  plaza: () => canvasTex(256, (g, s) => {
    g.fillStyle = '#cfc8b4'; g.fillRect(0, 0, s, s); speckle(g, s, 1200, 0.04);
    g.strokeStyle = 'rgba(18,18,18,0.35)'; g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, s); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(s, i * 64); g.stroke(); }
  }, 6),
  facade: () => canvasTex(256, (g, s) => {
    g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 5; x++) {
      const lit = Math.random() > 0.45;
      g.fillStyle = lit ? (Math.random() > 0.3 ? '#ffd98a' : '#ffb84d') : '#333a40';
      g.fillRect(14 + x * 48, 12 + y * 31, 30, 18);
    }
  }, 1),
};

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

export function makeSign(title, lines, w = 14) {
  const grp = new THREE.Group();
  const tex = signTexture(title, lines);
  const faceM = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
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
  const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.28, 0.8), mat(ORANGE));
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
    color: ORANGE, emissive: 0xff5a00, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.3,
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

  // --- sky dome (gradient), fog, lights ---
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x6fa8cf) }, mid: { value: new THREE.Color(0xbfd6de) }, bot: { value: new THREE.Color(0xe8e0cd) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.65, h)) : mix(bot, mid, smoothstep(-0.08, 0.12, h)); gl_FragColor = vec4(c, 1.0); }',
  }));
  scene.add(sky);
  scene.background = new THREE.Color(0xbfd6de);
  scene.fog = new THREE.Fog(0xcfd8d3, 110, 380);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f6a, 0.95));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
  sun.position.set(60, 90, 40); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, far: 320 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const world = new THREE.Group(); scene.add(world);
  const floaters = [], drifters = [], stars = [];

  // --- ground + plaza ---
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE + 160, WORLD_SIZE + 160),
    new THREE.MeshStandardMaterial({ map: TEX.ground(), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; world.add(ground);
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(46, 46),
    new THREE.MeshStandardMaterial({ map: TEX.plaza(), roughness: 0.95 }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.02, 78); pad.receiveShadow = true; world.add(pad);

  // --- roads (textured asphalt) ---
  const asphalt = TEX.asphalt();
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 1 });
  const road = (w, d, x, z) => { const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat); r.rotation.x = -Math.PI / 2; r.position.set(x, 0.03, z); r.receiveShadow = true; world.add(r); };
  road(14, WORLD_SIZE, 0, 0);
  road(WORLD_SIZE, 14, 0, 8);
  road(10, 100, -52, 32); road(10, 100, 52, 32);
  road(10, 100, -52, -52); road(10, 100, 52, -52);
  road(120, 10, 0, -58);
  const dashMat = mat(ORANGE);
  for (let i = -10; i <= 10; i++) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 4), dashMat);
    d.rotation.x = -Math.PI / 2; d.position.set(0, 0.05, i * 11); world.add(d);
    const d2 = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), dashMat);
    d2.rotation.x = -Math.PI / 2; d2.position.set(i * 11, 0.05, 8); world.add(d2);
  }

  // --- zone rings, signs, stars ---
  for (const z of ZONES) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(z.r - 1.2, z.r, 48),
      new THREE.MeshBasicMaterial({ color: ORANGE, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
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

  // --- buildings: varied, lit-window facades ---
  const facadeTex = TEX.facade();
  const sideM = new THREE.MeshStandardMaterial({ map: facadeTex, roughness: 0.9 });
  const topM = mat(0x242424);
  const bandM = mat(ORANGE);
  const buildingSpots = [[-105, -85], [-92, -95], [100, 88], [108, -88], [-104, 88], [96, 96], [-40, -104], [44, 104], [110, 0], [-110, -10], [30, -108], [-28, 108], [86, -104], [-86, 104], [112, 44], [-112, -48]];
  for (const [x, z] of buildingSpots) {
    const seed = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
    const w = 11 + seed * 5, h = 12 + seed * 20, d = 11 + (1 - seed) * 5;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [sideM, sideM, topM, topM, sideM, sideM]);
    b.position.set(x, h / 2, z); b.castShadow = true; b.receiveShadow = true; world.add(b);
    const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 1, d + 0.4), bandM);
    band.position.set(x, h - 2.2, z); world.add(band);
    regBox(x, h / 2, z, w / 2, h / 2, d / 2);
  }

  // --- trees: instanced trunks + crowns (~56) ---
  const treeSpots = [[-24, 62], [30, -28], [-88, 8], [88, 12], [-18, 96], [20, -96], [-96, -52], [96, 58], [-58, 92], [60, -96], [16, 34], [-16, 30], [-38, 72], [24, 20], [-24, -16], [64, 76], [-64, 78], [100, -30], [-100, 26], [44, -84], [-46, -88], [78, 96], [-78, -100], [104, 64], [-102, -70], [12, -30], [-12, -34], [58, 18], [-58, -14], [34, 100], [-90, -24], [90, -58], [22, 84], [-34, 100], [70, -78], [-70, 58], [48, 58], [-48, 44], [102, -96], [-108, 60], [14, 56], [-14, 52], [84, 30], [-84, -36], [40, -20], [-40, -64], [66, 100], [-96, 96], [110, -64], [-110, 100], [26, -104], [-24, -100], [56, -34], [-56, 68], [98, 104], [-62, -104]];
  const trunkIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.32, 0.5, 2.6, 6), mat(0x6b4a2b), treeSpots.length);
  const crownIM = new THREE.InstancedMesh(new THREE.ConeGeometry(2.7, 6.4, 7), mat(0x3f7a3a, { roughness: 1 }), treeSpots.length);
  trunkIM.castShadow = crownIM.castShadow = true;
  { const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    treeSpots.forEach(([x, z], i) => {
      const s = 0.85 + (Math.abs(Math.sin(i * 7.3)) % 0.5);
      sc.set(s, s, s);
      p.set(x, 1.3 * s, z); m4.compose(p, q, sc); trunkIM.setMatrixAt(i, m4);
      p.set(x, (2.6 + 3.2) * s, z); m4.compose(p, q, sc); crownIM.setMatrixAt(i, m4);
      regCyl(x, z, 0.55, 2.6);
    }); }
  world.add(trunkIM); world.add(crownIM);

  // --- rocks: instanced ---
  const rockIM = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mat(0x8d8d84, { roughness: 1, flatShading: true }), 36);
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
  const lampHeadM = mat(0xffe2a0, { emissive: 0xffb84d, emissiveIntensity: 1.6 });
  const poleM = mat(BLACK);
  for (let i = -5; i <= 5; i++) for (const sx of [-1, 1]) {
    const x = sx * 8.5, z = i * 22;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.4, 6), poleM);
    pole.position.set(x, 2.7, z); pole.castShadow = true; world.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), lampHeadM);
    head.position.set(x, 5.5, z); world.add(head);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(3.4); glow.position.set(x, 5.5, z); world.add(glow);
    regCyl(x, z, 0.3, 5.4);
  }

  // --- dynamic cones (knockable!) ---
  const coneGeo = new THREE.ConeGeometry(0.55, 1.3, 10);
  const coneM = mat(ORANGE, { roughness: 0.7 });
  const coneAt = (x, z) => {
    const c = new THREE.Mesh(coneGeo, coneM);
    c.castShadow = true; c.position.set(x, 0.65, z); world.add(c);
    if (phys) phys.addDynamicCone(c, { x, y: 0.65, z, halfH: 0.65, r: 0.55 });
  };
  [[-6, 62], [6, 62], [-6, 70], [6, 70], [-34, 8], [34, 8], [-3, 30], [3, 30], [-20, -58], [20, -58]].forEach(([x, z]) => coneAt(x, z));

  // --- dynamic crates: a knock-down stack near START + singles ---
  const crateM = mat(0xb98d5f, { roughness: 0.85 });
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
    const label = new THREE.Mesh(new THREE.PlaneGeometry(11, 3), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
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

  // --- clouds (drift in the loop) ---
  const cloudM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const cl = new THREE.Group();
    const n = 2 + (i % 3);
    for (let k = 0; k < n; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(7 + k * 2.5, 1.6, 4.5), cloudM);
      b.position.set(k * 4.6 - n * 2, k % 2 * 0.7, (k % 2) * 1.6); cl.add(b);
    }
    const a = i * 2.4;
    cl.position.set(Math.cos(a) * (90 + (i % 4) * 30), 42 + (i % 3) * 6, Math.sin(a) * (90 + (i % 4) * 30));
    world.add(cl); drifters.push(cl);
  }

  // --- distant hills ---
  const hillM = mat(0x7d94a0, { roughness: 1, flatShading: true });
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + 0.3;
    const h = 16 + (Math.abs(Math.sin(i * 5.1)) % 1) * 20;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(h * 1.5, h, 6), hillM);
    hill.position.set(Math.cos(a) * 235, h / 2 - 1, Math.sin(a) * 235);
    world.add(hill);
  }

  // --- perimeter walls (physics + visual blocks) ---
  regBox(0, 1, -118, WORLD_SIZE / 2, 1, 1.2); regBox(0, 1, 118, WORLD_SIZE / 2, 1, 1.2);
  regBox(-118, 1, 0, 1.2, 1, WORLD_SIZE / 2); regBox(118, 1, 0, 1.2, 1, WORLD_SIZE / 2);
  for (let i = -5; i <= 5; i++) {
    box(9, 2, 2, BLACK, i * 22, null, -118, world); box(9, 2, 2, BLACK, i * 22, null, 118, world);
    box(2, 2, 9, BLACK, -118, null, i * 22, world); box(2, 2, 9, BLACK, 118, null, i * 22, world);
  }

  return { floaters, drifters, stars, sun };
}
