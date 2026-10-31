// World.js — V7 NINJA WORLD. The old procedural world is deleted. This is
// samsy's actual world (3d-ninja / SMSY-Gen02), rebuilt from his own data:
//   - his kit model (cyberfix.glb, 24 parts) placed by his authored layout
//     (ninja-kit/layout.json, extracted from his shipped bundle — the same
//     data his Instancer consumes: raw part geometry + per-instance
//     position/rotation/scale; the GLB authoring transforms are dropped,
//     exactly as his kitify() drops them),
//   - his black reflective floor: a planar reflection distorted + masked by
//     his own floor texture (bump-floor_fxrdig.jpg) at two scales,
//   - his atmosphere: black void, range fog, emissive-only detail — the kit
//     materials are KHR unlit, so the city is lit by its own screens.
// The V6 finishing chain in main.js (emissive-threshold bloom + grade) sits
// on top unchanged. Zone data survives as HUD discovery points only — no
// old-world geometry, signs, rings or props remain.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import layoutData from '../../ninja-kit/layout.json';

export const ORANGE = 0xff5a00;
export const BLACK = 0x121212;
export const WORLD_SIZE = 1700; // city extent for the minimap / fallback clamp
// Shared sun direction (Sky + PMREM environment in main.js): a morning sun
// (~22° up) so the one PBR object in the scene — the car — has a consistent
// sky to reflect. The kit itself is unlit and ignores it.
export const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 22), THREE.MathUtils.degToRad(125));

// Discovery points for the HUD (title/body shown on arrival, minimap dots).
// Positions sit on open floor next to kit landmarks.
export const ZONES = [
  { id: 'start', name: 'START', x: 0, z: 0, r: 40, title: 'START — SAMSY CITY', body: 'The 3d-ninja world, rebuilt from its own kit + layout data. Drive the void: towers, ramps and screens are solid — the glowing panels are not. W / \u2191 accelerate \u00b7 S / \u2193 brake & reverse \u00b7 A D steer \u00b7 SPACE handbrake.' },
  { id: 'about', name: 'ABOUT', x: -30, z: -72, r: 45, title: 'ABOUT \u2014 MERUGU', body: 'Merugu \u2014 vibe coder & AI builder from India. He learns by building: setup first, then Explore \u2192 Plan \u2192 Code \u2192 Verify \u2192 Commit.' },
  { id: 'zero', name: 'PROJECT ZERO', x: -84, z: 3, r: 45, title: 'PROJECT ZERO', body: 'Merugu\u2019s personal AI-agent operating protocol: the creator sets the objectives, verify before claiming done, protect data before any outside send, act freely on safe reversible work, confirm before anything consequential.' },
  { id: 'projects', name: 'PROJECTS', x: 128, z: -84, r: 45, title: 'PROJECTS', body: '1) PROJECT ZERO \u2014 AI-agent protocol. 2) VIBE CODING MASTERY \u2014 Claude Code course journey (SSK Techy). 3) TOP 10 CLAUDE SKILLS STACK \u2014 learned & installed. 4) This driveable 3D portfolio \u2014 zero_project1.' },
  { id: 'skills', name: 'SKILLS', x: 185, z: -160, r: 45, title: 'SKILLS \u2014 TOP 10', body: 'Ponytail \u00b7 Taste \u00b7 Impeccable \u00b7 Emil Motion \u00b7 Superpowers \u00b7 Caveman \u00b7 Frontend Design \u00b7 UI/UX Pro Max \u00b7 GStack \u00b7 Planning-with-Files. Installed & used whenever needed.' },
  { id: 'process', name: 'PROCESS', x: 235, z: -25, r: 45, title: 'PROCESS', body: 'Setup \u2192 Explore \u2192 Plan \u2192 Code \u2192 Verify \u2192 Commit. Setup is step 1 \u2014 before every task, every time.' },
  { id: 'contact', name: 'CONTACT', x: -160, z: -60, r: 45, title: 'CONTACT', body: 'GitHub: github.com/dineshmerugu06 \u2014 repo: zero_project1. That\u2019s the door. Come say hi.' },
];

// Flat ground decals: no collider, the car drives straight over them.
const NO_COLLIDE = new Set(['crossing_0', 'crossing_1']);

export function buildWorld(scene, physics) {
  const phys = physics; // may be null in degraded mode (visuals still build)
  const regBox = (x, y, z, hx, hy, hz) => { if (phys) phys.addFixedBox({ x, y, z, hx, hy, hz }); };

  // --- atmosphere: MORNING (Dinesh's call over the ninja night) ---
  // A real morning sky dome, warm low sun, pale haze on the horizon. The
  // kit's unlit textures read exactly as authored; the haze + daylight do
  // the atmosphere work the black void did at night.
  scene.background = new THREE.Color(0xaebfd2);
  const sky = new Sky();
  sky.scale.setScalar(6000);
  const skyU = sky.material.uniforms;
  skyU.turbidity.value = 5; skyU.rayleigh.value = 1.6;
  skyU.mieCoefficient.value = 0.004; skyU.mieDirectionalG.value = 0.8;
  skyU.sunPosition.value.copy(SUN_DIR);
  scene.add(sky);
  scene.fog = new THREE.Fog(0xaebfd2, 70, 950);
  scene.add(new THREE.HemisphereLight(0xbcd4ea, 0x44484d, 0.85));
  const sun = new THREE.DirectionalLight(0xffdfae, 1.7); // morning sun, for the car
  sun.position.copy(SUN_DIR).multiplyScalar(260); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, far: 700 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const world = new THREE.Group(); scene.add(world);

  // --- the floor: his signature wet-black reflection ---
  // A planar Reflector whose image is broken up by his own floor texture at
  // two scales and masked by it (bright detail = more reflection), then
  // faded into the fog colour with distance — the WebGL form of his TSL
  // floor. Under it, a plain black backstop plane so the void never tears.
  const floorTex = new THREE.TextureLoader().load(new URL('assets/floor-bump.jpg', document.baseURI).href);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  const wetShader = {
    name: 'NinjaFloor',
    uniforms: {
      color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, tMask: { value: null },
    },
    vertexShader: `
      uniform mat4 textureMatrix;
      varying vec4 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = textureMatrix * vec4(position, 1.0);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 color;
      uniform sampler2D tDiffuse;
      uniform sampler2D tMask;
      varying vec4 vUv;
      varying vec3 vWorld;
      void main() {
        vec2 wUv = vWorld.xz * 0.02;
        vec4 maskA = texture2D(tMask, wUv);
        vec4 maskB = texture2D(tMask, wUv * 0.19 + 0.37);
        // Strength follows the LARGE scale only — the fine scale's grid
        // lines must never become the pattern (round 1's failure); the fine
        // scale only smears the image, like wear on wet stone.
        float m = maskB.g;
        vec4 projected = vUv;
        projected.xy += (maskA.rg - 0.5) * 0.09 * vUv.w;
        vec3 reflection = texture2DProj(tDiffuse, projected).rgb;
        float strength = 0.10 + m * 0.38;
        // Fresnel: a wet floor mirrors at grazing angles and goes dark
        // underfoot — the long smears toward the horizon in his frames.
        vec3 vDir = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - abs(vDir.y), 1.5);
        strength *= 0.35 + fres * 1.15;
        vec3 col = reflection * color * strength + vec3(0.030, 0.034, 0.040);
        float dist = distance(cameraPosition, vWorld);
        float fogF = smoothstep(70.0, 950.0, dist);
        col = mix(col, vec3(0.408, 0.510, 0.643), fogF);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  };
  const reflector = new Reflector(new THREE.PlaneGeometry(2600, 2600), {
    clipBias: 0.003,
    textureWidth: 1024,
    textureHeight: 1024,
    color: 0xaebbc8,
    shader: wetShader,
    multisample: 0,
  });
  reflector.material.uniforms.tMask.value = floorTex;
  reflector.rotation.x = -Math.PI / 2; reflector.position.y = 0.0; world.add(reflector);
  const backstop = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000),
    new THREE.MeshBasicMaterial({ color: 0x3a4046 }));
  backstop.rotation.x = -Math.PI / 2; backstop.position.y = -0.08; world.add(backstop);

  // Invisible bounds, far beyond the fog — the car stays in the world.
  regBox(0, 6, -1150, 1150, 6, 2); regBox(0, 6, 1150, 1150, 6, 2);
  regBox(-1150, 6, 0, 2, 6, 1150); regBox(1150, 6, 0, 2, 6, 1150);

  // --- samsy's city: his kit, his layout ---
  const kitUrl = new URL('assets/models/cyberfix.glb', document.baseURI).href;
  new GLTFLoader().load(kitUrl, (gltf) => {
    try { buildKit(gltf.scene); }
    catch (e) { console.warn('Kit build failed', e); if (window.__showError) window.__showError('City kit failed to build: ' + e.message); }
  }, undefined, (err) => { console.warn('Kit failed to load', err); if (window.__showError) window.__showError('City kit failed to load.'); });

  // --- screen content (Dinesh's ask, 2026-10-31): the kit's screens are
  // unlit textured panels, so the panel shows whatever its map is — a
  // still image, a VIDEO (VideoTexture), or a live CANVAS (text/data).
  // Content is assigned per part; every placement of that part shows it.
  const coverFit = (tex, targetAspect, w, h) => {
    const ia = (w && h) ? w / h : (tex.image ? tex.image.width / tex.image.height : 1);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    if (ia > targetAspect) { tex.repeat.set(targetAspect / ia, 1); tex.offset.set((1 - targetAspect / ia) / 2, 0); }
    else { tex.repeat.set(1, ia / targetAspect); tex.offset.set(0, (1 - ia / targetAspect) / 2); }
    return tex;
  };
  const screenTex = (file, aspect) => coverFit(new THREE.TextureLoader().load(new URL('assets/screens/' + file, document.baseURI).href), aspect);
  const canvasScreen = (w, h, draw) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  };
  const SCREEN_CONTENT = {
    wall_0: () => screenTex('hero-collage.jpg', 2.44),
    wall_1: () => screenTex('hero-collage.jpg', 2.44),
    block_0: () => screenTex('hero-batman.jpg', 1.0),
    block_1: () => screenTex('deathstroke.jpg', 1.0),
    block_2: () => screenTex('media-main.jpg', 1.0),
    distributor_0: () => videoScreen(), distributor_1: () => videoScreen(),
    map: () => canvasScreen(1024, 600, (g, w, h) => {
      g.fillStyle = '#0a1420'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#7fd4ff'; g.font = '900 150px Arial'; g.textAlign = 'center';
      g.fillText('MERUGU', w / 2, 240);
      g.fillStyle = '#e8f4ff'; g.font = '700 74px Arial';
      g.fillText('PROJECT ZERO', w / 2, 360);
      g.fillStyle = '#5f7d95'; g.font = '600 52px Arial';
      g.fillText('FIND ALL 7 ZONES', w / 2, 480);
    }),
    barrier: () => canvasScreen(2048, 536, (g, w, h) => {
      g.fillStyle = '#0d0d10'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffb02e'; g.font = '900 190px Arial'; g.textAlign = 'center';
      g.fillText('PROJECT ZERO ★ DRIVE THE CITY ★ PROJECT ZERO', w / 2, 340);
    }),
  };
  function videoScreen() {
    const v = document.createElement('video');
    v.src = new URL('assets/screens/dragon-studio.mp4', document.baseURI).href;
    v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
    v.play().catch(() => {});
    const tex = new THREE.VideoTexture(v);
    tex.colorSpace = THREE.SRGBColorSpace;
    v.addEventListener('loadedmetadata', () => coverFit(tex, 1.75, v.videoWidth, v.videoHeight));
    return tex;
  }
  const screenMatCache = new Map();
  const screenMaterialFor = (part) => {
    if (!SCREEN_CONTENT[part]) return null;
    if (!screenMatCache.has(part)) {
      const m = new THREE.MeshBasicMaterial({ map: SCREEN_CONTENT[part]() });
      m.color.setRGB(1.12, 1.12, 1.12);
      screenMatCache.set(part, m);
    }
    return screenMatCache.get(part);
  };

  function buildKit(kitScene) {
    // Templates: one flat group of raw-geometry meshes per part. Screen
    // materials get a small authored boost so the bright signage crosses
    // the bloom threshold — his screens write to an emissive MRT channel;
    // this is the WebGL stand-in. Collision-proxy meshes never render.
    const screenBoost = new Map();
    const boostMat = (m) => {
      if (!m || !m.isMeshBasicMaterial) return m;
      if (!screenBoost.has(m.uuid)) {
        const c = m.clone(); c.color.multiplyScalar(1.5);
        screenBoost.set(m.uuid, c);
      }
      return screenBoost.get(m.uuid);
    };
    const templates = new Map(); // name -> { group, box }
    for (const root of kitScene.children) {
      const g = new THREE.Group();
      root.traverse((o) => {
        if (!o.isMesh) return;
        if (o.name.includes('collision')) return;
        const m = new THREE.Mesh(o.geometry, o.name.includes('screen') ? (screenMaterialFor(root.name) || boostMat(o.material)) : o.material);
        m.matrixAutoUpdate = false;
        g.add(m);
      });
      if (g.children.length) {
        g.updateMatrixWorld(true);
        templates.set(root.name, { group: g, box: new THREE.Box3().setFromObject(g) });
      }
    }
    // Instances: exactly his layout data (position / Euler rotation / scale).
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
    const corner = new THREE.Vector3();
    for (const [part, placements] of Object.entries(layoutData)) {
      if (part.startsWith('_')) continue;
      const tpl = templates.get(part);
      if (!tpl) { console.warn('Layout part missing from kit:', part); continue; }
      for (const pl of placements) {
        const inst = tpl.group.clone(true);
        inst.position.set(pl.position[0], pl.position[1], pl.position[2]);
        inst.rotation.set(pl.rotation[0], pl.rotation[1], pl.rotation[2]);
        inst.scale.set(pl.scale[0], pl.scale[1], pl.scale[2]);
        world.add(inst);
        if (!phys || NO_COLLIDE.has(part)) continue;
        // Collider: the part's world AABB (8 template-box corners through
        // the placement matrix). Floating signage (min-y high) gets none.
        inst.updateMatrixWorld(true);
        const bb = new THREE.Box3();
        const b = tpl.box;
        for (const cx of [b.min.x, b.max.x]) for (const cy of [b.min.y, b.max.y]) for (const cz of [b.min.z, b.max.z]) {
          corner.set(cx, cy, cz).applyMatrix4(inst.matrixWorld);
          bb.expandByPoint(corner);
        }
        if (bb.min.y > 8) continue;
        const c = bb.getCenter(pv), s = bb.getSize(sv);
        if (s.x < 0.05 || s.z < 0.05) continue;
        regBox(c.x, c.y, c.z, Math.max(s.x / 2 * 0.94, 0.15), Math.max(s.y / 2, 0.4), Math.max(s.z / 2 * 0.94, 0.15));
      }
    }
  }

  return { floaters: [], drifters: [], stars: [], sun, reflector };
}
