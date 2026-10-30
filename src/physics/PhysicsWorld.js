// PhysicsWorld.js — Rapier (WASM) physics: fixed-timestep world, one owner of
// stepping and of body<->mesh sync. Gameplay code registers colliders/bodies
// here; render code never touches Rapier directly.
import RAPIER from '@dimforge/rapier3d-compat';

export const FIXED_DT = 1 / 60;

export class PhysicsWorld {
  static async create() {
    await RAPIER.init();
    return new PhysicsWorld();
  }

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -22, z: 0 }); // snappier gravity = arcade feel
    this.world.timestep = FIXED_DT;
    this.queue = new RAPIER.EventQueue(true);
    this.dynamics = [];       // { mesh, body, yOff } synced after every step
    this.acc = 0;
    this.carCollider = null;  // set by Car so collisions can be attributed
    this.onCarCollision = null; // (otherHandle, started) => {}
    // world floor (also catches anything that escapes) — sized for the
    // ninja city, whose kit spans ±850
    const floor = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -1, 0));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(1500, 1, 1500).setFriction(0.9), floor);
  }

  // --- static geometry -------------------------------------------------
  addFixedBox({ x = 0, y = 0, z = 0, hx, hy, hz, ry = 0, quat = null, friction = 0.85 }) {
    const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
    if (quat) desc.setRotation(quat);
    else if (ry) desc.setRotation({ x: 0, y: Math.sin(ry / 2), z: 0, w: Math.cos(ry / 2) });
    const body = this.world.createRigidBody(desc);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(friction), body);
    return body;
  }

  addFixedCylinder({ x = 0, z = 0, r, h, friction = 0.6 }) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, h / 2, z));
    this.world.createCollider(RAPIER.ColliderDesc.cylinder(h / 2, r).setFriction(friction), body);
    return body;
  }

  // --- dynamic props -----------------------------------------------------
  addDynamicBox(mesh, { x, y, z, hx, hy, hz, density = 0.8, friction = 0.6, restitution = 0.3 }) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setAngularDamping(0.4).setLinearDamping(0.05));
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz).setDensity(density).setFriction(friction).setRestitution(restitution), body);
    this.dynamics.push({ mesh, body, yOff: 0 });
    return body;
  }

  addDynamicCone(mesh, { x, y, z, halfH, r, density = 0.35, friction = 0.5, restitution = 0.35 }) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setAngularDamping(0.3).setLinearDamping(0.05));
    // Both the Rapier cone and THREE.ConeGeometry are centred on their origin,
    // so the body spawns at y = halfH and the mesh maps 1:1 onto the body.
    this.world.createCollider(
      RAPIER.ColliderDesc.cone(halfH, r).setDensity(density).setFriction(friction).setRestitution(restitution), body);
    this.dynamics.push({ mesh, body, yOff: 0 });
    return body;
  }

  // --- queries -----------------------------------------------------------
  // Cast straight down; returns { toi, nx, ny, nz } or null. Ground/slope probe.
  castDown(x, y, z, len, excludeCollider) {
    const ray = new RAPIER.Ray({ x, y, z }, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRayAndGetNormal(ray, len, true, undefined, undefined, excludeCollider || undefined);
    return hit ? { toi: hit.timeOfImpact, nx: hit.normal.x, ny: hit.normal.y, nz: hit.normal.z } : null;
  }

  // --- stepping ------------------------------------------------------------
  // controlCb(h) runs once per fixed substep BEFORE the world steps, so the
  // car can write its velocity into its body with input latency ~0.
  step(frameDt, controlCb) {
    this.acc += Math.min(frameDt, 0.1);
    let guard = 0;
    while (this.acc >= FIXED_DT && guard++ < 5) {
      if (controlCb) controlCb(FIXED_DT);
      this.world.step(this.queue);
      if (this.onCarCollision && this.carCollider) {
        const carH = this.carCollider.handle;
        this.queue.drainCollisionEvents((h1, h2, started) => {
          if (h1 === carH) this.onCarCollision(h2, started);
          else if (h2 === carH) this.onCarCollision(h1, started);
        });
      } else {
        this.queue.drainCollisionEvents(() => {});
      }
      this.acc -= FIXED_DT;
    }
    if (this.acc > FIXED_DT) this.acc = 0; // spiral-of-death guard
    for (const d of this.dynamics) {
      const t = d.body.translation(), r = d.body.rotation();
      d.mesh.position.set(t.x, t.y + d.yOff, t.z);
      d.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }
}
