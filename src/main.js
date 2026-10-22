// main.js — glue: renderer, chase camera, zone glue, animation loop.
import * as THREE from 'three';
import { buildWorld, ZONES } from './world/World.js';
import { Car } from './car/Car.js';
import { createHud } from './ui/Hud.js';

const container = document.getElementById('app');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 500);
camera.position.set(0, 9, 108);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const { colliders, floaters } = buildWorld(scene);
const car = new Car(scene, colliders);
const hud = createHud(document.getElementById('hud'), car);

// --- camera orbit offset: mouse drag + wheel zoom ---
let orbitYaw = 0, orbitPitch = 0.32, camDist = 13, dragging = false, px = 0, py = 0;
const el = renderer.domElement;
el.addEventListener('pointerdown', (e) => { dragging = true; px = e.clientX; py = e.clientY; });
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointermove', (e) => {
  if (!dragging) return;
  orbitYaw -= (e.clientX - px) * 0.005;
  orbitPitch = THREE.MathUtils.clamp(orbitPitch + (e.clientY - py) * 0.004, 0.08, 1.1);
  px = e.clientX; py = e.clientY;
});
el.addEventListener('wheel', (e) => { e.preventDefault(); camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.02, 7, 26); }, { passive: false });
// two-finger touch zoom (single finger is reserved for HUD pedals / drag orbit)
let lastPinch = 0;
el.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2) {
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    if (lastPinch) camDist = THREE.MathUtils.clamp(camDist - (d - lastPinch) * 0.05, 7, 26);
    lastPinch = d;
  }
}, { passive: true });
el.addEventListener('touchend', () => { lastPinch = 0; });

const camTarget = new THREE.Vector3();
const desired = new THREE.Vector3();
const clock = new THREE.Clock();
let elapsed = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  if (hud.started) car.update(dt);

  // floating signs bob + zone rings pulse
  floaters.forEach((f, i) => { f.position.y += Math.sin(elapsed * 1.4 + i * 2) * dt * 0.55; });
  for (const z of ZONES) if (z.ring) { const s = 1 + Math.sin(elapsed * 2.2) * 0.018; z.ring.scale.set(s, s, 1); }

  // chase camera: behind car heading + user orbit offset, smoothed
  const backYaw = car.heading + orbitYaw;
  desired.set(
    car.pos.x + Math.sin(backYaw) * Math.cos(orbitPitch) * camDist,
    car.y + 1.6 + Math.sin(orbitPitch) * camDist,
    car.pos.z + Math.cos(backYaw) * Math.cos(orbitPitch) * camDist,
  );
  camera.position.lerp(desired, 1 - Math.pow(0.0001, dt)); // frame-rate independent smoothing
  camTarget.set(car.pos.x, car.y + 1.6, car.pos.z);
  camera.lookAt(camTarget);
  if (!dragging) orbitYaw *= Math.pow(0.4, dt); // orbit eases back behind the car

  hud.update(car);
  renderer.render(scene, camera);
}
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
