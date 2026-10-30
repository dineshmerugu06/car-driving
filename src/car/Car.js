// Car.js — detailed low-poly car on a REAL Rapier dynamic rigid body.
// Arcade control is authored per physics substep (gameplay-skills pattern for
// arcade vehicles): a speed/heading state writes velocity + yaw into the body;
// Rapier owns gravity, contacts, ramps, and knocking props around.
// Falls back to a simple kinematic update if physics failed to initialise —
// the game must never be a black screen.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ORANGE, BLACK, WORLD_SIZE } from '../world/World.js';

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...opts });

export const input = { accel: false, brake: false, left: false, right: false, handbrake: false };

const KEYMAP = {
  KeyW: 'accel', ArrowUp: 'accel', KeyS: 'brake', ArrowDown: 'brake',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'handbrake',
};

const SPAWN = { x: 110, z: -30 }; // the dense pocket: ramps, tower and walls ahead
const SPAWN_Y = 0.15; // small drop-in on spawn/reset
const MAX_FWD = 30, MAX_REV = -11; // 30 u/s = 108 km/h on the speedo

export class Car {
  constructor(scene, physics, audio) {
    this.physics = physics || null;
    this.audio = audio || null;
    this.group = new THREE.Group();      // physics yaw + position
    this.bodyG = new THREE.Group();      // visual lean / pitch / suspension bounce
    this.group.add(this.bodyG);
    this.buildMesh();
    scene.add(this.group);
    this.modelLoaded = false;
    this._wheelRadius = 0.42;
    this.loadModel();

    this.heading = 0; this.speed = 0; this.steer = 0;
    this.pos = new THREE.Vector3(SPAWN.x, 0, SPAWN.z);
    this.y = 0; this.vy = 0;
    this.grounded = true; this.drifting = false;
    this.jumpQueued = false; this.squash = 0; this.wasGrounded = true; this.prevVy = 0;
    this.landedFlag = false; this.impactFlag = 0;
    this._fwd = new THREE.Vector3();

    if (this.physics) this.buildBody();
    this.reset();

    window.addEventListener('keydown', (e) => {
      if (this.audio) this.audio.ensure();
      if (KEYMAP[e.code]) { input[KEYMAP[e.code]] = true; e.preventDefault(); }
      if (e.code === 'Space') this.jumpQueued = true;
      if (e.code === 'KeyR') this.reset();
      if (e.code === 'KeyH' && this.audio) this.audio.honk();
    });
    window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false; });
    window.addEventListener('blur', () => { for (const k in input) input[k] = false; });
  }

  // ---------------- physics body ----------------
  buildBody() {
    const P = this.physics;
    this.body = P.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(SPAWN.x, SPAWN_Y, SPAWN.z)
        .setLinearDamping(0.02).setAngularDamping(0.9)
        .enabledRotations(false, true, false)
        .setCanSleep(false).setCcdEnabled(true));
    // Collider spans the whole car (wheels to roof) in the body frame, whose
    // origin is the mesh origin at ground level — so the body rests at y=0.
    // Sized for the medium car (5.2 long — see applyModel).
    this.collider = P.world.createCollider(
      RAPIER.ColliderDesc.cuboid(1.31, 0.68, 2.53).setTranslation(0, 0.68, 0)
        .setDensity(2.2).setFriction(0.25).setRestitution(0.05)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.body);
    P.carCollider = this.collider;
    P.onCarCollision = (other, started) => {
      if (!started || Math.abs(this.speed) < 4.5) return;
      const s = Math.min(1, Math.abs(this.speed) / MAX_FWD);
      if (this.audio) this.audio.thud(0.35 + s * 0.6);
      this.speed *= 0.55;
      this.impactFlag = 0.4 + s * 0.6;
    };
  }

  reset() {
    this.heading = 0; this.speed = 0; this.steer = 0; this.vy = 0; this.jumpQueued = false;
    if (this.body) {
      this.body.setTranslation({ x: SPAWN.x, y: SPAWN_Y, z: SPAWN.z }, true);
      this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    this.pos.set(SPAWN.x, 0, SPAWN.z); this.y = 0;
    this.syncVisual(0);
  }

  queueJump() { this.jumpQueued = true; }
  honk() { if (this.audio) { this.audio.ensure(); this.audio.honk(); } }

  forward(out) { return out.set(-Math.sin(this.heading), 0, -Math.cos(this.heading)); }

  // ---------------- per-substep control (physics mode) ----------------
  control(h) {
    const P = this.physics; if (!P || !this.body) return;
    const t = this.body.translation();

    // ground probe (origin above the chassis, ground rests at toi ~= 0.7)
    const hit = P.castDown(t.x, t.y + 0.7, t.z, 1.7, this.collider);
    this.grounded = !!(hit && hit.toi < 1.32);

    // steering: ease toward target, less angle at speed
    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    this.steer += (steerTarget * 0.55 - this.steer) * Math.min(1, h * 10);
    const speedFactor = 1 / (1 + Math.abs(this.speed) * 0.06);

    // longitudinal speed state (V1 tuning — it felt right, response is instant)
    if (input.accel) this.speed += 24 * h * (this.speed < 0 ? 2.4 : 1); // punchy: ~0-80 km/h in ~1.5 s
    if (input.brake) this.speed -= (this.speed > 0.5 ? 30 : 10) * h;
    this.speed -= this.speed * (input.handbrake ? 2.6 : 0.5) * h;
    if (!input.accel && !input.brake) this.speed -= this.speed * 0.3 * h;
    this.speed = THREE.MathUtils.clamp(this.speed, MAX_REV, MAX_FWD);
    if (Math.abs(this.speed) < 0.04 && !input.accel && !input.brake) this.speed = 0;

    if (this.speed !== 0) this.heading += this.steer * speedFactor * this.speed * h * 0.38 * (this.grounded ? 1 : 0.35);
    this.drifting = this.grounded && input.handbrake && Math.abs(this.speed) > 6;

    // write yaw + velocity into the body
    const yawQ = { x: 0, y: Math.sin(this.heading / 2), z: 0, w: Math.cos(this.heading / 2) };
    this.body.setRotation(yawQ, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const f = this.forward(this._fwd);
    if (this.grounded) {
      // project forward onto the ground plane (f' = f - n(f.n)) so the
      // velocity follows slopes — this is what makes ramps climbable.
      let fx = f.x, fy = 0, fz = f.z;
      if (hit && hit.ny < 0.995) {
        const d = f.x * hit.nx + f.z * hit.nz; // f.y = 0
        fx = f.x - hit.nx * d; fy = -hit.ny * d; fz = f.z - hit.nz * d;
        const len = Math.hypot(fx, fy, fz);
        if (len > 0.001) { fx /= len; fy /= len; fz /= len; } else { fx = f.x; fy = 0; fz = f.z; }
      }
      let vy = fy * this.speed;
      if (this.jumpQueued) { vy = 9.5; this.jumpQueued = false; }
      this.body.setLinvel({ x: fx * this.speed, y: vy, z: fz * this.speed }, true);
    } else {
      this.jumpQueued = false;
      // airborne: leave velocity alone — momentum carries the jump
    }
  }

  // ---------------- fallback (no physics): V1-style kinematic ----------------
  updateFallback(dt) {
    dt = Math.min(dt, 0.05);
    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    this.steer += (steerTarget * 0.55 - this.steer) * Math.min(1, dt * 10);
    const speedFactor = 1 / (1 + Math.abs(this.speed) * 0.06);
    if (input.accel) this.speed += 24 * dt * (this.speed < 0 ? 2.4 : 1);
    if (input.brake) this.speed -= (this.speed > 0.5 ? 30 : 10) * dt;
    this.speed -= this.speed * (input.handbrake ? 2.6 : 0.5) * dt;
    if (!input.accel && !input.brake) this.speed -= this.speed * 0.3 * dt;
    this.speed = THREE.MathUtils.clamp(this.speed, MAX_REV, MAX_FWD);
    if (Math.abs(this.speed) < 0.04 && !input.accel && !input.brake) this.speed = 0;
    if (this.speed !== 0) this.heading += this.steer * speedFactor * this.speed * dt * 0.38;
    this.drifting = input.handbrake && Math.abs(this.speed) > 6 && this.y === 0;
    const f = this.forward(this._fwd);
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    if (this.jumpQueued && this.y === 0) { this.vy = 8.5; this.jumpQueued = false; }
    if (this.y > 0 || this.vy !== 0) { this.vy -= 22 * dt; this.y += this.vy * dt; if (this.y <= 0) { this.y = 0; this.vy = 0; this.landedFlag = true; } }
    const lim = WORLD_SIZE / 2 - 4;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -lim, lim);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -lim, lim);
    this.grounded = this.y === 0;
    this.syncVisual(dt);
  }

  // ---------------- per-frame sync + visual life ----------------
  syncVisual(dt) {
    if (this.body) {
      const t = this.body.translation();
      const v = this.body.linvel();
      this.pos.set(t.x, 0, t.z);
      this.y = Math.max(0, t.y);
      this.vy = v.y;
      // landing?
      if (!this.wasGrounded && this.grounded && this.prevVy < -7) { this.landedFlag = true; this.squash = 1; if (this.audio) this.audio.thud(0.3); }
      this.wasGrounded = this.grounded; this.prevVy = v.y;
      this.group.position.set(t.x, t.y, t.z);
    } else {
      this.group.position.set(this.pos.x, this.y, this.pos.z);
    }
    this.group.rotation.y = this.heading;

    // suspension squash spring + lean/pitch
    this.squash = Math.max(0, this.squash - dt * 3.2);
    const squashY = -Math.sin(Math.min(this.squash, 1) * Math.PI) * 0.13;
    this.bodyG.position.y = squashY;
    const speedRatio = Math.abs(this.speed) / MAX_FWD;
    const targetRoll = -this.steer * speedRatio * 1.6;
    const targetPitch = (input.accel ? -0.03 : 0) + (input.brake && this.speed > 1 ? 0.045 : 0);
    this.bodyG.rotation.z += (targetRoll - this.bodyG.rotation.z) * Math.min(1, dt * 8);
    this.bodyG.rotation.x += (targetPitch - this.bodyG.rotation.x) * Math.min(1, dt * 6);

    // wheels: steer visual + spin
    for (const p of this.frontWheels) p.rotation.y = this.steer;
    this._spin = (this._spin || 0) + (this.speed * dt) / this._wheelRadius;
    for (const w of this.spinWheels) w.rotation.x = this._spin;

    // brake lights
    const braking = input.brake || input.handbrake;
    this.brakeMat.emissiveIntensity += ((braking ? 3.4 : 0.8) - this.brakeMat.emissiveIntensity) * Math.min(1, dt * 18);
  }

  consumeLanding() { const f = this.landedFlag; this.landedFlag = false; return f; }
  consumeImpact() { const f = this.impactFlag; this.impactFlag = 0; return f; }

  get kmh() { return Math.round(Math.abs(this.speed) * 3.6); }
  get speedRatio() { return Math.abs(this.speed) / MAX_FWD; }

  // ---------------- real model (Lamborghini Gallardo LP560 GLB) ---------
  // Visual swap only: Rapier body, collider and arcade control are unchanged.
  // The procedural car stays as the instant spawn + fallback if the GLB
  // fails to load — never a missing car.
  loadModel() {
    const url = new URL('assets/models/lamborghini.glb', document.baseURI).href;
    new GLTFLoader().load(url,
      (gltf) => { try { this.applyModel(gltf.scene); } catch (e) { console.warn('Model apply failed — keeping procedural car', e); } },
      undefined,
      (err) => console.warn('Lamborghini model failed to load — keeping procedural car', err));
  }

  applyModel(model) {
    // Normalize: the Gallardo's nose is +Z (headlights z +1.92, tails -1.86),
    // length is Z (4.72) — rotate so the nose faces -Z like the procedural
    // car, scale length to the 3.9 the collider was tuned for, rest the
    // wheels on y=0, centre x/z.
    const wrap = new THREE.Group();
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z);
    wrap.add(model);
    wrap.scale.setScalar(5.2 / size.z); // medium: 5.2 long (was 3.9, the F40 tune)
    wrap.rotation.y = Math.PI;
    // The GLB ships its paint grey (the showroom recolors at runtime). Do
    // the same: a clearcoat physical Giallo — the Gallardo colour — on both
    // paint materials, lit by the scene environment so it reads as a real
    // shell against the black city.
    const paintMat = new THREE.MeshPhysicalMaterial({
      color: 0xffbe0a, metalness: 0.05, roughness: 0.27,
      clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.95,
    });
    wrap.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      const swap = (m) => {
        if (!m) return m;
        if (m.name === 'gallardo_paint' || m.name === 'gallardo_paint.001') return paintMat;
        // tail lights glow red so the rear reads at night (brake state is
        // still driven through the dummy brakeMat, like the F40 before it)
        if (m.name.includes('taillight') && m.isMeshStandardMaterial) { m.emissive = new THREE.Color(0xff1a05); m.emissiveIntensity = 1.5; }
        return m;
      };
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    });

    // Replace the procedural shell.
    this.bodyG.clear();
    this.bodyG.add(wrap);
    this.frontWheels = []; this.spinWheels = [];
    this.brakeMat = mat(0x881111, { emissive: 0xff2211, emissiveIntensity: 0.8 }); // dummy: tail lights live in the model
    this._wheelRadius = 0.43;

    // Contact shadow: the city floor is a reflector (no shadow receiving),
    // so a soft blob grounds the car the way his avatar is grounded.
    if (!this._blob) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
      grad.addColorStop(0, 'rgba(0,0,0,0.62)'); grad.addColorStop(0.7, 'rgba(0,0,0,0.34)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
      this._blob = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 6.3),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
      this._blob.rotation.x = -Math.PI / 2; this._blob.position.y = 0.03; this._blob.renderOrder = 1;
      this.group.add(this._blob);
    }

    // Wheels: the model splits each wheel into material fragments (rims,
    // brake discs, calipers) across many meshes. Cluster the fragments by
    // corner in body space and lift each cluster into a steer/spin pivot —
    // the same trick as the F40, adapted to fragments instead of whole
    // wheel meshes.
    this.bodyG.updateWorldMatrix(true, true);
    const toBody = new THREE.Matrix4().copy(this.bodyG.matrixWorld).invert();
    const parts = [];
    wrap.traverse((o) => {
      if (!o.isMesh) return;
      const geo = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(toBody, o.matrixWorld));
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const c = bb.getCenter(new THREE.Vector3());
      const s = bb.getSize(new THREE.Vector3());
      parts.push({ mesh: o, geo, c, s, name: o.name || '' });
    });
    const inWheelZone = (p) => Math.abs(p.c.x) > 0.67 && Math.abs(p.c.x) < 1.23
      && p.c.y > 0.08 && p.c.y < 0.75 && Math.abs(p.c.z) > 0.96 && Math.abs(p.c.z) < 1.84;
    const isWheelPart = (p) => /wheel|amdb11|brake|caliper/i.test(p.name) && inWheelZone(p);
    const notBody = (p) => !/fender|body|bumper|door|skirt|spoiler|hood|mirror/i.test(p.name);
    const clusters = new Map();
    for (const p of parts.filter(isWheelPart)) {
      const key = `${Math.sign(p.c.x)},${Math.sign(p.c.z)}`;
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key).push(p);
    }
    for (const members of clusters.values()) {
      const ctr = new THREE.Vector3();
      members.forEach((p) => ctr.add(p.c)); ctr.divideScalar(members.length);
      const pivot = new THREE.Group(); pivot.position.copy(ctr); this.bodyG.add(pivot);
      const spin = new THREE.Group(); pivot.add(spin);
      const take = (p) => {
        p.geo.translate(-ctr.x, -ctr.y, -ctr.z);
        const m = new THREE.Mesh(p.geo, p.mesh.material); m.castShadow = true; spin.add(m);
        if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
        p.taken = true;
      };
      members.forEach(take);
      // any other fragment sitting at the same centre rides along
      for (const p of parts) if (!p.taken && p.mesh.parent && notBody(p) && p.c.distanceTo(ctr) < 0.4) take(p);
      this.spinWheels.push(spin);
      if (ctr.z < 0) this.frontWheels.push(pivot); // body-space front is -Z
    }

    // Keep real headlights (quality toggle in main.js uses headlightSpots).
    this.headlightSpots = [];
    const glowTexture = (rgb) => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
      grad.addColorStop(0, `rgba(${rgb},0.9)`); grad.addColorStop(0.35, `rgba(${rgb},0.32)`); grad.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    };
    const headGlowTex = glowTexture('255,215,150');
    const tailGlowTex = glowTexture('255,45,25');
    for (const s of [-1, 1]) {
      const spot = new THREE.SpotLight(0xffe2b0, 175, 52, 0.5, 0.55, 1.15);
      spot.position.set(s * 0.75, 0.69, -2.13);
      spot.target.position.set(s * 1.07, 0.03, -14);
      this.bodyG.add(spot); this.bodyG.add(spot.target);
      this.headlightSpots.push(spot);
      const headGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: headGlowTex, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      headGlow.scale.setScalar(0.73); headGlow.position.set(s * 0.75, 0.64, -2.16); this.bodyG.add(headGlow);
      const tailGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tailGlowTex, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      tailGlow.scale.set(0.73, 0.43, 1); tailGlow.position.set(s * 0.67, 0.88, 2.08); this.bodyG.add(tailGlow);
    }
    this.modelLoaded = true;
  }

  // ---------------- mesh ----------------
  buildMesh() {
    const g = this.bodyG;
    const paint = new THREE.MeshPhysicalMaterial({
      color: ORANGE, roughness: 0.32, metalness: 0.15, clearcoat: 0.85, clearcoatRoughness: 0.25,
    });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x10161f, roughness: 0.06, metalness: 0.4, clearcoat: 1 });
    const trim = mat(BLACK, { roughness: 0.5 });

    const add = (geo, material, x, y, z, parent = g) => {
      const m = new THREE.Mesh(geo, material); m.position.set(x, y, z);
      m.castShadow = true; parent.add(m); return m;
    };
    // main shell + sculpted bits (front = -Z)
    add(new THREE.BoxGeometry(2.1, 0.55, 3.9), paint, 0, 0.62, 0);
    add(new THREE.BoxGeometry(1.9, 0.34, 1.35), paint, 0, 0.48, -1.55).rotation.x = 0.1;       // hood slope
    add(new THREE.BoxGeometry(2.14, 0.3, 0.5), trim, 0, 0.4, -1.85);                            // front bumper
    add(new THREE.BoxGeometry(2.14, 0.34, 0.42), trim, 0, 0.44, 1.88);                          // rear bumper
    add(new THREE.BoxGeometry(2.16, 0.16, 3.3), trim, 0, 0.3, 0);                               // side skirts band
    add(new THREE.BoxGeometry(1.15, 0.22, 0.9), mat(BLACK, { roughness: 0.9 }), 0, 0.62, -1.93); // grille
    const cabin = add(new THREE.BoxGeometry(1.72, 0.62, 1.95), glass, 0, 1.18, -0.15);
    cabin.rotation.x = -0.04;
    add(new THREE.BoxGeometry(1.78, 0.09, 1.5), paint, 0, 1.52, -0.18);                         // roof panel
    add(new THREE.BoxGeometry(1.7, 0.09, 0.28), trim, 0, 1.28, 1.98);                           // spoiler blade
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.1, 0.09, 0.34), trim, s * 0.83, 1.24, 1.9);                    // spoiler struts
      add(new THREE.BoxGeometry(0.3, 0.12, 0.2), trim, s * 1.12, 1.12, -0.72);                  // mirrors
      const lamp = add(new THREE.BoxGeometry(0.46, 0.2, 0.08),
        mat(0xffe9a8, { emissive: 0xffc84d, emissiveIntensity: 1.6 }), s * 0.66, 0.72, -2.0);
      lamp.castShadow = false;
      // headlight glow sprite
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        color: 0xffd9a0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      glow.scale.setScalar(1.5); glow.position.set(s * 0.66, 0.72, -2.1); g.add(glow);
      // real spotlight
      const spot = new THREE.SpotLight(0xffe2b0, 90, 42, 0.52, 0.65, 1.1);
      spot.position.set(s * 0.66, 0.78, -1.9);
      spot.target.position.set(s * 0.9, 0.1, -11);
      g.add(spot); g.add(spot.target);
      this.headlightSpots = this.headlightSpots || []; this.headlightSpots.push(spot);
    }
    // brake lights (shared material so HUD of intensity is one write)
    this.brakeMat = mat(0x881111, { emissive: 0xff2211, emissiveIntensity: 0.8 });
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.5, 0.18, 0.08), this.brakeMat, s * 0.64, 0.74, 2.0).castShadow = false;

    // wheels: steer pivot -> spin group (tire + hub + spokes)
    this.spinWheels = []; this.frontWheels = [];
    const tireGeo = new THREE.TorusGeometry(0.3, 0.13, 10, 20);
    const hubGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.36, 10); hubGeo.rotateZ(Math.PI / 2);
    const spokeGeo = new THREE.BoxGeometry(0.38, 0.07, 0.46);
    for (const [x, z, front] of [[-1.04, -1.32, true], [1.04, -1.32, true], [-1.04, 1.32, false], [1.04, 1.32, false]]) {
      const pivot = new THREE.Group(); pivot.position.set(x, 0.43, z); g.add(pivot);
      const spin = new THREE.Group(); pivot.add(spin);
      const tire = new THREE.Mesh(tireGeo, mat(0x141414, { roughness: 0.95 }));
      tire.rotation.y = Math.PI / 2; tire.castShadow = true; spin.add(tire);
      spin.add(new THREE.Mesh(hubGeo, mat(0xb9b9b9, { metalness: 0.7, roughness: 0.35 })));
      for (let k = 0; k < 3; k++) {
        const sp = new THREE.Mesh(spokeGeo, mat(0x8f8f8f, { metalness: 0.6, roughness: 0.4 }));
        sp.rotation.x = (k / 3) * Math.PI; spin.add(sp);
      }
      this.spinWheels.push(spin);
      if (front) this.frontWheels.push(pivot);
    }
  }
}
