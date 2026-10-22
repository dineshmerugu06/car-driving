# zero_project1 — MERUGU: Driveable 3D World Portfolio

A full interactive 3D world you **drive through** — not a normal website.
Steer Merugu's orange car around a low-poly plaza and discover his portfolio
zone by zone: START, ABOUT, PROJECT ZERO, PROJECTS, SKILLS, PROCESS, CONTACT.

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
| Mouse drag | Orbit camera around the car |
| Mouse wheel / pinch | Camera zoom |
| Touch buttons | ◀ ▶ steering, ACCEL pedal, BRAKE pedal, JUMP, HONK |

Driving into an orange ring opens that zone's info panel. The HUD shows
speed (km/h) and a live minimap with zone dots.

## Structure

```
index.html            page shell (#app canvas + #hud overlay)
src/main.js           glue: renderer, chase camera, loop, resize
src/world/World.js    scene, lights/fog/shadows, ground, roads, props,
                      zones, canvas-texture signs, skill blocks,
                      process gates, circle colliders
src/car/Car.js        car mesh, arcade physics (accel/brake/reverse/drag,
                      speed-sensitive steering, jump), keyboard + touch
                      input, collision resolution, WebAudio honk
src/ui/Hud.js         intro overlay, help, zone panel, speedometer,
                      minimap, mobile touch controls
src/style.css         CROX palette: bone #E9E9E6, near-black #121212,
                      safety orange #FF5A00; sharp bordered HUD
public/assets/        reserved folders (models/textures/sounds/images) —
                      v1 needs none; everything is generated in code
```

## Credits & licenses

- Inspired by driveable 3D portfolios; **all code, models, signs and text in
  this repo are original** — nothing is copied from any other portfolio.
- [Three.js](https://threejs.org) (MIT) via npm; [Vite](https://vite.dev) (MIT).
- Build guidance consulted from MIT-licensed Claude skill packs (installed
  locally, not redistributed here): `threejs-game-skills` by Majid Manzarpour
  (MIT, github.com/calasdan-sketch/threejs-game-skills) and
  `threejs-architecture-effects` by Hailey (MIT,
  github.com/lhlGitHub/threejs-architecture-effects). No code or assets from
  those repos are included in this project.
- GitHub: [github.com/dineshmerugu06](https://github.com/dineshmerugu06)
