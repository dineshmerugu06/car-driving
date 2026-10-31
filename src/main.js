// main.js — glue: renderer, physics loop, chase camera (+FOV kick), zone/star
// glue, audio feed, quality toggle, smoke-test hooks.
// Boot is async (Rapier WASM) and failure-tolerant: if physics fails, the
// world still renders and the car drives in lite kinematic mode — never a
// silent black screen (window.__showError surfaces any failure on-page).
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, ZONES, SUN_DIR } from './world/World.js';
import { Car, input } from './car/Car.js';
import { createHud } from './ui/Hud.js';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { Dust } from './fx/Dust.js';

const SMOKE = new URLSearchParams(location.search).has('smoke');
const container = document.getElementById('app');
const smokeEl = document.getElementById('smoke');

// Finishing composite — V8: a gentle vignette ONLY. The samsy film
// grain / scanline / RGB split are gone for good (Dinesh: "no pixel") —

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(innerWidth, innerHeight) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    varying vec2 vUv;
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float d = distance(vUv, vec2(0.5)) * 1.28;
      float vig = smoothstep(1.05, 0.32, d);
      col *= mix(0.78, 1.0, vig);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

async function boot() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 6000);
  camera.position.set(0, 9, 108);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92; // morning: tame the sky blowout a touch
  container.appendChild(renderer.domElement);

  // Image-based lighting generated from the SAME sky the player sees (the
  // folio/showroom technique: environment from a real sky, not a studio) —
  // sky-blue reflections on car paint/glass, warm ground bounce, one
  // consistent light story across every PBR material.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(100);
  envSky.material.uniforms.turbidity.value = 5;
  envSky.material.uniforms.rayleigh.value = 1.6;
  envSky.material.uniforms.mieCoefficient.value = 0.004;
  envSky.material.uniforms.mieDirectionalG.value = 0.8;
  envSky.material.uniforms.sunPosition.value.copy(SUN_DIR);
  envScene.add(envSky);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  scene.environmentIntensity = 0.55;

  // --- post chain (3d-ninja recipe, WebGL form) ---
  // RenderPass (linear HDR) -> UnrealBloom fed only by authored emissive
  // (threshold .82 stands in for his MRT emissive channel: scene surfaces
  // stay under it, signs/lamps/windows/rings are authored over it) ->
  // finishing grade -> OutputPass (ACES + sRGB).
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(devicePixelRatio, 2));
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(innerWidth, innerHeight), 0.34, 0.27 * Math.min(devicePixelRatio, 2), 0.82);
  composer.addPass(bloomPass);
  const gradePass = new ShaderPass(GradeShader);
  composer.addPass(gradePass);
  composer.addPass(new OutputPass());

  let physics = null;
  try {
    physics = await PhysicsWorld.create();
  } catch (err) {
    console.warn('Rapier failed to initialise — lite mode:', err);
    if (window.__showError) window.__showError('Physics engine failed to load — running in lite mode.');
  }

  const audio = new AudioEngine();
  const { floaters, drifters, stars, sun, reflector } = buildWorld(scene, physics);
  const car = new Car(scene, physics, audio);
  const dust = new Dust(scene);
  floaters.forEach((f) => { f.userData.baseY = f.position.y; });

  let starCount = 0;
  const hud = createHud(document.getElementById('hud'), car, {
    onStart: () => { audio.ensure(); audio.uiClick(); },
    onZoneEnter: (zone, first) => {
      if (first) { audio.ensure(); audio.chime(); hud.toast(`Discovered: ${zone.title}`); }
    },
    onMute: (m) => audio.setMuted(m),
    onQuality: (high) => setQuality(high),
  });
  if (!physics) setTimeout(() => hud.toast('Lite mode: physics offline — driving still works'), 800);

  function setQuality(high) {
    const dpr = high ? Math.min(devicePixelRatio, 2) : 1;
    renderer.setPixelRatio(dpr);
    composer.setPixelRatio(dpr);
    bloomPass.enabled = high;
    if (reflector) reflector.visible = high;
    sun.castShadow = high;
    if (car.headlightSpots) for (const s of car.headlightSpots) s.visible = high;
  }

  // --- camera orbit offset: mouse drag + wheel/pinch zoom ---
  let orbitYaw = 0, orbitPitch = 0.3, camDist = 58, dragging = false, px = 0, py = 0;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => { dragging = true; px = e.clientX; py = e.clientY; });
  addEventListener('pointerup', () => { dragging = false; });
  addEventListener('pointermove', (e) => {
    if (!dragging) return;
    orbitYaw -= (e.clientX - px) * 0.005;
    orbitPitch = THREE.MathUtils.clamp(orbitPitch + (e.clientY - py) * 0.004, 0.08, 1.1);
    px = e.clientX; py = e.clientY;
  });
  el.addEventListener('wheel', (e) => { e.preventDefault(); camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.05, 24, 120); }, { passive: false });
  let lastPinch = 0;
  el.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (lastPinch) camDist = THREE.MathUtils.clamp(camDist - (d - lastPinch) * 0.08, 24, 120);
      lastPinch = d;
    }
  }, { passive: true });
  el.addEventListener('touchend', () => { lastPinch = 0; });

  const camTarget = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const clock = new THREE.Clock();
  let elapsed = 0, fov = 58, smokeT = 0;

  window.__game = { car, physics, hud, input, THREE }; // QA/diagnostics handle
  if (SMOKE) hud.start(true);

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;

    // --- smoke self-test: scripted drive (accel, then steer) ---
    if (SMOKE) {
      smokeT += dt;
      input.accel = smokeT < 6.5;
      input.right = smokeT > 3.5 && smokeT < 5.2;
      if (smokeEl) {
        smokeEl.style.display = 'block';
        smokeEl.textContent = JSON.stringify({
          t: +smokeT.toFixed(1), started: hud.started, physics: !!physics,
          x: +car.pos.x.toFixed(1), z: +car.pos.z.toFixed(1), y: +car.y.toFixed(2),
          speed: +car.speed.toFixed(1), kmh: car.kmh, grounded: car.grounded,
          zones: ZONES.length, stars: starCount, model: car.modelLoaded,
          drawCalls: renderer.info.render.calls,
          errors: window.__errors ? window.__errors.length : -1,
        });
      }
    }

    // --- simulation order: input/control -> physics -> sync -> fx -> camera ---
    if (physics) {
      physics.step(dt, hud.started ? (h) => car.control(h) : null);
      car.syncVisual(dt);
    } else if (hud.started) {
      car.updateFallback(dt);
    } else {
      car.syncVisual(dt);
    }

    // world life
    floaters.forEach((f, i) => { f.position.y = f.userData.baseY + Math.sin(elapsed * 1.3 + i * 2.1) * 0.45; });
    for (const z of ZONES) if (z.ring) { const s = 1 + Math.sin(elapsed * 2.2) * 0.018; z.ring.scale.set(s, s, 1); }
    for (const c of drifters) { c.position.x += dt * 0.8; if (c.position.x > 280) c.position.x = -280; }
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      if (s.taken) continue;
      s.mesh.rotation.y += dt * 1.9;
      s.mesh.position.y = s.baseY + Math.sin(elapsed * 2 + i * 1.7) * 0.25;
      const dx = car.pos.x - s.zone.x, dz = car.pos.z - s.zone.z;
      if (dx * dx + dz * dz < 11 && car.y < 4.5) {
        s.taken = true; s.mesh.visible = false; starCount++;
        hud.setStars(starCount);
        audio.ensure(); audio.star();
        hud.toast(starCount === stars.length ? 'ALL STARS COLLECTED — WORLD COMPLETE ★' : `★ Star collected — ${s.zone.name} (${starCount}/${stars.length})`);
        dust.spawn(s.zone.x, 2.4, s.zone.z, 16, 2.6, 2.4);
      }
    }

    // game feel: dust for drift / landing / impacts
    if (car.drifting) {
      const back = 20; // drift dust at the rear of a 50-long car
      dust.spawn(car.pos.x + Math.sin(car.heading) * back, 0.25, car.pos.z + Math.cos(car.heading) * back, 3, 1.8, 1.2);
    }
    if (car.consumeLanding()) dust.spawn(car.pos.x, 0.3, car.pos.z, 18, 3.2, 1.4);
    const impact = car.consumeImpact();
    if (impact) dust.spawn(car.pos.x, 0.8, car.pos.z, Math.round(8 + impact * 10), 2.6, 2);
    dust.update(dt);

    // audio feed
    if (hud.started) audio.update(car.speedRatio, car.drifting);

    // chase camera + FOV kick with speed
    const targetFov = 58 + car.speedRatio * 16; // bigger kick: speed must READ at size 50
    if (Math.abs(targetFov - fov) > 0.05) { fov += (targetFov - fov) * Math.min(1, dt * 4); camera.fov = fov; camera.updateProjectionMatrix(); }
    const backYaw = car.heading + orbitYaw;
    desired.set(
      car.pos.x + Math.sin(backYaw) * Math.cos(orbitPitch) * camDist,
      car.y + 5 + Math.sin(orbitPitch) * camDist,
      car.pos.z + Math.cos(backYaw) * Math.cos(orbitPitch) * camDist,
    );
    if (desired.y < 1.5) desired.y = 1.5; // never clip into the ground
    camera.position.lerp(desired, 1 - Math.pow(0.0001, dt));
    if (camera.position.y < 1.2) camera.position.y = 1.2;
    camTarget.set(car.pos.x, car.y + 5, car.pos.z);
    camera.lookAt(camTarget);
    if (!dragging) orbitYaw *= Math.pow(0.4, dt);

    hud.update(car);
    gradePass.uniforms.uTime.value = elapsed;
    composer.render();
  }
  animate();

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    gradePass.uniforms.uResolution.value.set(innerWidth, innerHeight);
  });
}

boot().catch((err) => {
  console.error(err);
  if (window.__showError) window.__showError('Boot failed: ' + (err && err.message ? err.message : err));
});
