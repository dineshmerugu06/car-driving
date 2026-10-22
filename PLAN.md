# PLAN — Interactive 3D World Portfolio

## Concept
Drive a small orange car around an original low-poly 3D world. Each zone is a
portfolio section you discover by driving to it. Inspired by driveable 3D
portfolios; all code, models, signs and text are original.

## Stack
Vite + Three.js (npm). No physics engine — lean custom arcade physics.
No font/model files — signs are canvas textures, everything is geometry.

## Modules
- `src/world/World.js` — scene, lights, fog, ground, roads, props (trees,
  buildings, lamps, cones, barriers, ramps), 7 zones (START, ABOUT,
  PROJECT ZERO, PROJECTS, SKILLS, PROCESS, CONTACT), 10 skill blocks,
  6 process gates, canvas-texture signs, zone rings, circle colliders.
- `src/car/Car.js` — car built from boxes/cylinders, arcade physics
  (accelerate / brake / reverse / drag, speed-sensitive steering, visual
  front-wheel turn, jump, handbrake), keyboard + shared touch input,
  circle-collision resolution, bounds, honk (WebAudio).
- `src/ui/Hud.js` — intro overlay + START button, help panel, zone info
  panel, km/h speedometer, 2D-canvas minimap, mobile touch controls
  (◀ ▶ steering, ACCEL pedal, BRAKE pedal, JUMP, HONK).
- `src/main.js` — glue: renderer, chase camera (lerp, mouse-drag orbit,
  wheel zoom), zone detection, animation loop, resize.
- `src/style.css` — CROX palette: bone #E9E9E6, near-black #121212,
  safety orange #FF5A00, sharp corners, thick black borders.

## Palette / style
Warm bone ground, near-black structures, #FF5A00 accents.

## Verify
`npm install && npm run build` must pass; `vite preview` must serve
HTTP 200 with the page title. Then commit + push to `main`.

---

# PLAN — V2: Bruno-Level Upgrade

## Physics (Rapier, @dimforge/rapier3d-compat)
- `src/physics/PhysicsWorld.js` — RAPIER.init, fixed-timestep (1/60, clamped
  accumulator) world, EventQueue collision events, static/dynamic registration,
  downward raycast for ground/slope, dynamics sync in exactly one place.
- Car stays a *dynamic rigid body* (cuboid, rotations locked to Y, CCD on) with
  authored arcade control per physics substep: speed state (accel/brake/reverse/
  drag/handbrake) -> velocity projected onto the ground plane (so ramps climb),
  heading state -> body yaw. Physics owns contacts: dynamic cones/crates get
  knocked over, walls block + thud, ramps are rotated fixed colliders you can
  drive up and launch off. (Director/gameplay-skills pattern for arcade vehicles.)

## Car detail
Clearcoat orange paint (MeshPhysicalMaterial), glass cabin, hood/bumpers/
spoiler/mirrors, spoked wheels, real SpotLight headlights + glow, brake-light
emissive on brake, visual suspension (squash on land, pitch/roll lean).

## World detail
Canvas textures (asphalt, bone ground, plaza tiles, lit-window facades),
instanced trees (~64) + rocks (~40), more varied buildings, lamp glow sprites,
clouds drifting, perimeter hills, wedge ramps (physics colliders), dynamic
cones + crate stacks, collectible star per zone.

## Graphics
ACESFilmic tone mapping, PCFSoft shadows, gradient sky dome, fog, HUD quality
toggle (High: dpr<=2 + shadows / Low: dpr 1 + no shadows).

## Audio (all synthesized WebAudio, `src/audio/AudioEngine.js`)
Engine hum (pitch <- speed), skid noise (handbrake slide), collision thud,
zone chime, star pickup blip, honk. Master mute: L key + HUD button.

## Game feel
FOV kick with speed, dust particles (drift / landing / impacts,
`src/fx/Dust.js`), achievement toasts + star counter, animated zone panels.

## Verify
`npm run build` green + `vite preview` curl 200 -> commit -> push -> verify.
