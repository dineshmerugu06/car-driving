# zero_project1 — MERUGU: Driveable 3D World Portfolio

A full interactive 3D world you **drive through** — not a normal website.
Steer Merugu's Ferrari F40 (the real GLB model from the Otherlife virtual
car showroom, Rosso Corsa #FF2800, mirrored in the `cars` repo) around a
low-poly plaza and discover his portfolio
zone by zone: START, ABOUT, PROJECT ZERO, PROJECTS, SKILLS, PROCESS, CONTACT.
The procedural orange car remains as the instant spawn + fallback if the
model fails to load.

Built by Merugu (vibe coder & AI builder, India) with the workflow:
Setup → Explore → Plan → Code → Verify → Commit. See `PLAN.md`.

## Run it

```bash
npm install
npm run dev      # open the printed localhost URL
npm run build    # production build
npm run preview  # serve the production build
```

## Controls

| Input | Action |
|---|---|
| W / ↑ | Accelerator |
| S / ↓ | Brake, then reverse |
| A / D or ← / → | Steering (front wheels turn; steering is speed-sensitive) |
| SPACE | Handbrake (hold) + Jump (tap) |
| R | Respawn at START plaza |
| H | Honk |
| L | Mute / unmute all sound |
| Mouse drag | Orbit camera around the car |
| Mouse wheel / pinch | Camera zoom |
| Touch buttons | ◀ ▶ steering, ACCEL pedal, BRAKE pedal, JUMP, HONK |

Driving into an orange ring opens that zone's info panel. The HUD shows
speed (km/h), a live minimap with zone dots, and a star counter — there is a
collectible ★ in every zone. Ram the cones and crates (they're real physics
bodies), drive up the ramps and launch off them.

**Failure behaviour:** if anything fails to load, an error box appears
on-page instead of a silent black screen, and if the physics engine can't
start the game drops to a lite kinematic driving mode and says so.

**Runtime self-test:** open `/?smoke` — the game auto-starts, auto-drives
(accelerate, then steer), and prints a live JSON state report (position,
speed, grounded, draw calls, error count) into the page. That's how release
verification checks the build in a real browser, beyond "build passed".

## Structure

```
index.html            page shell + on-page error trap (never silent failure)
src/main.js           glue: ACES renderer, physics loop, chase camera + FOV
                      kick, zone/star glue, audio feed, quality toggle, smoke mode
src/physics/PhysicsWorld.js
                      Rapier world: fixed-timestep stepping, static/dynamic
                      colliders, ground raycast, collision events, mesh sync
src/world/World.js    sky dome, lights/fog/shadows, textured ground/roads,
                      buildings, instanced trees/rocks, lamps+glow, zone
                      signs/rings/stars, drive-up ramps, dynamic cones/crates
src/car/Car.js        detailed car (clearcoat paint, glass, spoked wheels,
                      spot headlights, brake lights, suspension) on a Rapier
                      rigid body with authored arcade control; lite fallback
src/audio/AudioEngine.js
                      all-synthesized WebAudio: engine hum (pitch <- speed),
                      skid noise, collision thud, zone chime, star blip, honk
src/fx/Dust.js        particle pool: drift, landing and impact dust
src/ui/Hud.js         intro overlay, help, zone panel, speedometer, minimap,
                      touch pedals, star counter, toasts, quality/mute toggles
src/style.css         CROX palette: bone #E9E9E6, near-black #121212,
                      safety orange #FF5A00; sharp bordered HUD
public/assets/        reserved folders (models/textures/sounds/images) —
                      still unused; everything is generated in code
```

## Credits & licenses

- Inspired by driveable 3D portfolios; **all code, models, signs and text in
  this repo are original** — nothing is copied from any other portfolio.
- [Three.js](https://threejs.org) (MIT) via npm; [Vite](https://vite.dev) (MIT).
- Physics: [Rapier](https://rapier.rs) via `@dimforge/rapier3d-compat`
  (Apache-2.0) — real rigid-body simulation: dynamic cones/crates, ramp
  colliders, collision events. Fixed timestep 1/60, primitive colliders only.
- Audio: all sounds are synthesized live with Web Audio — no audio files.
- V2 game-feel/graphics guidance from the installed `threejs-*` game skills
  (game-director, gameplay-systems, aaa-graphics-builder, audio-generator,
  qa-release): response curves -> contact feedback -> camera FOV -> audio
  sync; Rapier-by-default physics with authored arcade vehicle control.
- Build guidance consulted from MIT-licensed Claude skill packs (installed
  locally, not redistributed here): `threejs-game-skills` by Majid Manzarpour
  (MIT, github.com/calasdan-sketch/threejs-game-skills) and
  `threejs-architecture-effects` by Hailey (MIT,
  github.com/lhlGitHub/threejs-architecture-effects). No code or assets from
  those repos are included in this project.
- GitHub: [github.com/dineshmerugu06](https://github.com/dineshmerugu06)

## Changelog

### V2 — Bruno-level upgrade
- **Real physics (Rapier):** car is a dynamic rigid body; cones & crates are
  dynamic bodies you knock over; two wedge ramps have rotated colliders you
  can drive up and jump off; collision events drive thuds + speed loss.
- **Car detail:** Ferrari F40 GLB (48 meshes) with its wheels extracted into
  steer/spin pivots, real spotlight headlights, suspension squash + body
  roll/pitch. The fallback procedural car keeps clearcoat orange paint, glass
  cabin, spoked wheels and brake lights that flare on braking.
- **World density:** canvas textures (asphalt, plaza tiles, lit-window
  facades, speckled ground), ~56 instanced trees, instanced rocks, more
  varied buildings, lamp glow sprites, drifting clouds, perimeter hills.
- **Graphics:** ACESFilmic tone mapping, PCFSoft shadows, gradient sky dome,
  quality toggle (High = hi-dpi + shadows + headlights / Low = fast mode).
- **Audio (synthesized):** engine hum pitched by speed, skid noise, thuds,
  chimes, star blips, honk. L / SOUND button mutes.
- **Game feel:** FOV widens with speed, dust on drift/landing/impact,
  collectible star per zone with achievement toasts + HUD counter,
  animated zone panels.
- **No silent failures:** on-page error trap; `/?smoke` runtime self-test.

### V1
- First driveable world: 7 zones, custom kinematic arcade car, HUD,
  minimap, touch pedals. (Merugu's verdict: not enough. Hence V2.)
