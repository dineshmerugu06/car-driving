// Dust.js — tiny CPU particle pool for drift / landing / impact puffs.
// Particles are Points with per-point size attenuation; dead points park
// below the world. No shaders, no allocation in the hot loop.
import * as THREE from 'three';

const MAX = 260;

export class Dust {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX); // seconds remaining
    this.head = 0;
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -60;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    // soft round puff sprite — raw PointsMaterial renders hard squares
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g2 = c.getContext('2d');
    const grad = g2.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(0.55, 'rgba(255,255,255,0.38)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g2.fillStyle = grad; g2.fillRect(0, 0, 64, 64);
    const mat = new THREE.PointsMaterial({
      color: 0xd8c9a8, size: 0.85, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.55,
      depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(x, y, z, n = 6, spread = 1.6, up = 1.6) {
    for (let k = 0; k < n; k++) {
      const i = this.head; this.head = (this.head + 1) % MAX;
      this.pos[i * 3] = x + (Math.random() - 0.5) * 0.7;
      this.pos[i * 3 + 1] = y + Math.random() * 0.25;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.7;
      this.vel[i * 3] = (Math.random() - 0.5) * spread;
      this.vel[i * 3 + 1] = Math.random() * up;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * spread;
      this.life[i] = 0.45 + Math.random() * 0.4;
    }
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -60; continue; }
      this.vel[i * 3 + 1] += 0.6 * dt; // dust billows slightly upward then settles
      this.vel[i * 3] *= (1 - 1.8 * dt); this.vel[i * 3 + 2] *= (1 - 1.8 * dt);
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    if (any) this.points.geometry.attributes.position.needsUpdate = true;
  }
}
