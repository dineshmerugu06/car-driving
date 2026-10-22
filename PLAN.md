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
