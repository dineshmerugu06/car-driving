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
// Shared sun direction (Sky + PMREM environment in main.js): a low dusk sun
// so the one PBR object in the scene — the car — has a consistent sky to
// reflect. The kit itself is unlit and ignores it.
export const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 4), THREE.MathUtils.degToRad(132));

// Discovery points for the HUD (title/body shown on arrival, minimap dots).
// Positions sit on open floor next to kit landmarks.
export const ZONES = [
  { id: 'start', name: 'START', x: 110, z: -30, r: 16, title: 'START — SAMSY CITY', body: 'The 3d-ninja world, rebuilt from its own kit + layout data. Drive the void: towers, ramps and screens are solid — the glowing panels are not. W / \u2191 accelerate \u00b7 S / \u2193 brake & reverse \u00b7 A D steer \u00b7 SPACE handbrake.' },
  { id: 'about', name: 'ABOUT', x: -30, z: -72, r: 15, title: 'ABOUT \u2014 MERUGU', body: 'Merugu \u2014 vibe coder & AI builder from India. He learns by building: setup first, then Explore \u2192 Plan \u2192 Code \u2192 Verify \u2192 Commit.' },
  { id: 'zero', name: 'PROJECT ZERO', x: -84, z: 3, r: 15, title: 'PROJECT ZERO', body: 'Merugu\u2019s personal AI-agent operating protocol: the creator sets the objectives, verify before claiming done, protect data before any outside send, act freely on safe reversible work, confirm before anything consequential.' },
  { id: 'projects', name: 'PROJECTS', x: 128, z: -84, r: 15, title: 'PROJECTS', body: '1) PROJECT ZERO \u2014 AI-agent protocol. 2) VIBE CODING MASTERY \u2014 Claude Code course journey (SSK Techy). 3) TOP 10 CLAUDE SKILLS STACK \u2014 learned & installed. 4) This driveable 3D portfolio \u2014 zero_project1.' },
  { id: 'skills', name: 'SKILLS', x: 185, z: -160, r: 16, title: 'SKILLS \u2014 TOP 10', body: 'Ponytail \u00b7 Taste \u00b7 Impeccable \u00b7 Emil Motion \u00b7 Superpowers \u00b7 Caveman \u00b7 Frontend Design \u00b7 UI/UX Pro Max \u00b7 GStack \u00b7 Planning-with-Files. Installed & used whenever needed.' },
  { id: 'process', name: 'PROCESS', x: 185, z: -70, r: 15, title: 'PROCESS', body: 'Setup \u2192 Explore \u2192 Plan \u2192 Code \u2192 Verify \u2192 Commit. Setup is step 1 \u2014 before every task, every time.' },
  { id: 'contact', name: 'CONTACT', x: -160, z: -60, r: 15, title: 'CONTACT', body: 'GitHub: github.com/dineshmerugu06 \u2014 repo: zero_project1. That\u2019s the door. Come say hi.' },
];

// Flat ground decals: no collider, the car drives straight over them.
const NO_COLLIDE = new Set(['crossing_0', 'crossing_1']);

export function buildWorld(scene, physics) {
  const phys = physics; // may be null in degraded mode (visuals still build)
  const regBox = (x, y, z, hx, hy, hz) => { if (phys) phys.addFixedBox({ x, y, z, hx, hy, hz }); };

  // --- atmosphere: pure black void + range fog ---
  // No sky dome: his backdrop is blackness itself (main.js still builds the
  // car its PMREM environment from a private Sky — reflections keep their
  // light story, the visible world stays void).
  scene.background = new THREE.Color(0x010203);
  // His fog story: the void swallows the city edges (his IDLE fog far ~800).
  scene.fog = new THREE.Fog(0x030509, 60, 780);
  scene.add(new THREE.HemisphereLight(0x243447, 0x05070a, 0.5));
  const sun = new THREE.DirectionalLight(0x8fb6d9, 0.9); // moonlight for the car
  sun.position.set(-70, 120, -90); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, far: 480 });
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
        vec3 col = reflection * color * strength + vec3(0.002, 0.003, 0.006);
        float dist = distance(cameraPosition, vWorld);
        float fogF = smoothstep(60.0, 780.0, dist);
        col = mix(col, vec3(0.0015, 0.0025, 0.005), fogF);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  };
  const reflector = new Reflector(new THREE.PlaneGeometry(2600, 2600), {
    clipBias: 0.003,
    textureWidth: 1024,
    textureHeight: 1024,
    color: 0x8fa0b0,
    shader: wetShader,
    multisample: 0,
  });
  reflector.material.uniforms.tMask.value = floorTex;
  reflector.rotation.x = -Math.PI / 2; reflector.position.y = 0.0; world.add(reflector);
  const backstop = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000),
    new THREE.MeshBasicMaterial({ color: 0x010204 }));
  backstop.rotation.x = -Math.PI / 2; backstop.position.y = -0.08; world.add(backstop);

  // --- night sky: starfield + moon (kept from V6 — small, distant, his vibe) ---
  const hash = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
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
    const moon = new THREE.Mesh(new THREE.CircleGeometry(72, 40), new THREE.MeshBasicMaterial({ fog: false }));
    moon.material.color.setRGB(1.35, 1.48, 1.62);
    moon.position.set(-980, 720, -1880); moon.lookAt(0, 0, 0); world.add(moon); }

  // Invisible bounds, far beyond the fog — the car stays in the world.
  regBox(0, 6, -1150, 1150, 6, 2); regBox(0, 6, 1150, 1150, 6, 2);
  regBox(-1150, 6, 0, 2, 6, 1150); regBox(1150, 6, 0, 2, 6, 1150);

  // --- samsy's city: his kit, his layout ---
  const kitUrl = new URL('assets/models/cyberfix.glb', document.baseURI).href;
  new GLTFLoader().load(kitUrl, (gltf) => {
    try { buildKit(gltf.scene); }
    catch (e) { console.warn('Kit build failed', e); if (window.__showError) window.__showError('City kit failed to build: ' + e.message); }
  }, undefined, (err) => { console.warn('Kit failed to load', err); if (window.__showError) window.__showError('City kit failed to load.'); });

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
        const m = new THREE.Mesh(o.geometry, o.name.includes('screen') ? boostMat(o.material) : o.material);
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
