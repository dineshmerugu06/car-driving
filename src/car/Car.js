// Car.js — original low-poly car + arcade physics + keyboard/touch input.
// Controls: W/up accel, S/down brake+reverse, A/D steer, Space handbrake+jump,
// R respawn, H honk. Touch buttons write into the same `input` object.
import * as THREE from 'three';
import { ORANGE, BLACK, WORLD_SIZE } from '../world/World.js';

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...opts });

export const input = { accel: false, brake: false, left: false, right: false, handbrake: false };

const KEYMAP = {
  KeyW: 'accel', ArrowUp: 'accel', KeyS: 'brake', ArrowDown: 'brake',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'handbrake',
};

export class Car {
  constructor(scene, colliders) {
    this.colliders = colliders;
    this.group = new THREE.Group();
    this.buildMesh();
    scene.add(this.group);
    this.reset();
    this.vy = 0; this.y = 0; this.audio = null;

    window.addEventListener('keydown', (e) => {
      if (KEYMAP[e.code]) { input[KEYMAP[e.code]] = true; e.preventDefault(); }
      if (e.code === 'KeyR') this.reset();
      if (e.code === 'KeyH') this.honk();
      if (e.code === 'Space' && this.y === 0) this.vy = 7.5;
    });
    window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false; });
  }

  buildMesh() {
    const g = this.group;
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 3.9), mat(ORANGE, { roughness: 0.35 }));
    body.position.y = 0.62; body.castShadow = true; g.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 1.9), mat(BLACK, { roughness: 0.2 }));
    cabin.position.set(0, 1.2, -0.2); cabin.castShadow = true; g.add(cabin);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.18, 1.1), mat(BLACK));
    stripe.position.set(0, 0.55, 1.25); g.add(stripe);
    for (const s of [-1, 1]) { // headlights
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.08), mat(0xffe9a8, { emissive: 0xffc84d, emissiveIntensity: 1.4 }));
      lamp.position.set(s * 0.65, 0.72, -1.97); g.add(lamp);
    }
    this.wheels = []; this.frontWheels = [];
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const [x, z, front] of [[-1.02, -1.3, true], [1.02, -1.3, true], [-1.02, 1.3, false], [1.02, 1.3, false]]) {
      const pivot = new THREE.Group(); pivot.position.set(x, 0.42, z);
      const w = new THREE.Mesh(wheelGeo, mat(0x1a1a1a, { roughness: 0.95 }));
      w.castShadow = true; pivot.add(w); g.add(pivot);
      this.wheels.push(w); if (front) this.frontWheels.push(pivot);
    }
  }

  reset() {
    this.pos = new THREE.Vector3(0, 0, 92);
    this.heading = 0; // mesh front is -Z; forward = (-sin h, -cos h), so h=0 drives -Z into the world
    this.speed = 0; this.steer = 0; this.y = 0; this.vy = 0;
  }

  honk() {
    try {
      this.audio = this.audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = this.audio.createOscillator(), gn = this.audio.createGain();
      o.type = 'square'; o.frequency.value = 370;
      gn.gain.setValueAtTime(0.12, this.audio.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, this.audio.currentTime + 0.28);
      o.connect(gn).connect(this.audio.destination); o.start(); o.stop(this.audio.currentTime + 0.3);
    } catch { /* audio unavailable — honk silently */ }
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    // --- steering: ease toward target, less angle at speed ---
    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    this.steer += (steerTarget * 0.55 - this.steer) * Math.min(1, dt * 10);
    const speedFactor = 1 / (1 + Math.abs(this.speed) * 0.045);

    // --- longitudinal physics ---
    const MAX_FWD = 30, MAX_REV = -11;
    if (input.accel) this.speed += 17 * dt * (this.speed < 0 ? 2.2 : 1); // accel also brakes reverse momentum
    if (input.brake) this.speed -= (this.speed > 0.5 ? 26 : 9) * dt;    // brake, then reverse
    this.speed -= this.speed * (input.handbrake ? 2.4 : 0.55) * dt;      // drag / handbrake
    if (!input.accel && !input.brake) this.speed -= this.speed * 0.35 * dt; // engine braking
    this.speed = THREE.MathUtils.clamp(this.speed, MAX_REV, MAX_FWD);
    if (Math.abs(this.speed) < 0.04 && !input.accel && !input.brake) this.speed = 0;

    // --- yaw from steering x speed ---
    if (this.speed !== 0) this.heading += this.steer * speedFactor * this.speed * dt * 0.42;

    // --- move ---
    const dx = Math.sin(this.heading) * this.speed * dt;
    const dz = Math.cos(this.heading) * this.speed * dt;
    this.pos.x -= dx; this.pos.z -= dz;

    // --- jump / gravity ---
    if (this.y > 0 || this.vy !== 0) { this.vy -= 22 * dt; this.y += this.vy * dt; if (this.y <= 0) { this.y = 0; this.vy = 0; } }

    // --- collisions: circle vs circle colliders, push out + bounce ---
    for (const c of this.colliders) {
      const ddx = this.pos.x - c.x, ddz = this.pos.z - c.z;
      const rr = c.r + 1.3, d2 = ddx * ddx + ddz * ddz;
      if (d2 < rr * rr && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        this.pos.x = c.x + (ddx / d) * rr; this.pos.z = c.z + (ddz / d) * rr;
        this.speed *= -0.25; // bounce
      }
    }

    // --- world bounds ---
    const lim = WORLD_SIZE / 2 - 4;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -lim, lim);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -lim, lim);

    // --- apply to mesh ---
    this.group.position.set(this.pos.x, this.y, this.pos.z);
    this.group.rotation.y = this.heading;
    this.group.rotation.z = -this.steer * Math.min(1, Math.abs(this.speed) / 22) * 0.07; // body lean
    for (const p of this.frontWheels) p.rotation.y = this.steer;
    for (const w of this.wheels) w.rotation.x += (this.speed * dt) / 0.42;
  }

  get kmh() { return Math.round(Math.abs(this.speed) * 3.6); }
}
