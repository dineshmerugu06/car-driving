// Hud.js — intro overlay, help, zone panel, speedometer, minimap, touch controls.
import { input } from '../car/Car.js';
import { ZONES, WORLD_SIZE } from '../world/World.js';

export function createHud(root, car) {
  root.innerHTML = `
    <div id="intro">
      <div class="intro-card">
        <div class="eyebrow">VIBE CODER &middot; AI BUILDER &middot; INDIA</div>
        <h1>MERUGU</h1>
        <p class="tag">Drive to explore my world.</p>
        <p class="controls-list">W / &uarr; accelerate &middot; S / &darr; brake &amp; reverse<br/>
        A D / &larr; &rarr; steer &middot; SPACE handbrake + jump &middot; R respawn &middot; H honk<br/>
        Drag mouse to orbit camera &middot; scroll to zoom &middot; touch pedals on mobile</p>
        <button id="startBtn">START DRIVING &rarr;</button>
      </div>
    </div>
    <div id="topbar"><span class="logo">MERUGU<b>.</b></span><span class="hint">Drive into orange rings</span></div>
    <div id="zonePanel" class="hidden"><h2 id="zoneTitle"></h2><p id="zoneBody"></p></div>
    <div id="help">W/S drive &middot; A/D steer &middot; SPACE brake/jump<br/>R respawn &middot; H honk &middot; drag = camera</div>
    <div id="speed"><span id="kmh">0</span><small>KM/H</small></div>
    <canvas id="minimap" width="176" height="176"></canvas>
    <div id="touch">
      <div class="tgroup">
        <button class="tbtn" data-k="left">&#9664;</button>
        <button class="tbtn" data-k="right">&#9654;</button>
      </div>
      <div class="tgroup">
        <button class="tbtn small" id="jumpBtn">JUMP</button>
        <button class="tbtn small" id="honkBtn">HONK</button>
        <button class="tbtn pedal brake" data-k="brake">BRAKE</button>
        <button class="tbtn pedal accel" data-k="accel">ACCEL</button>
      </div>
    </div>`;

  let started = false;
  root.querySelector('#startBtn').addEventListener('click', () => {
    started = true;
    root.querySelector('#intro').classList.add('gone');
  });

  // touch / mouse pedal buttons -> same input state as keyboard
  root.querySelectorAll('[data-k]').forEach((btn) => {
    const k = btn.dataset.k;
    const on = (e) => { e.preventDefault(); input[k] = true; btn.classList.add('active'); };
    const off = (e) => { e.preventDefault(); input[k] = false; btn.classList.remove('active'); };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointerleave', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  root.querySelector('#honkBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); car.honk(); });
  root.querySelector('#jumpBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); if (car.y === 0) car.vy = 7.5; });

  const panel = root.querySelector('#zonePanel');
  const title = root.querySelector('#zoneTitle');
  const body = root.querySelector('#zoneBody');
  const kmhEl = root.querySelector('#kmh');
  const mm = root.querySelector('#minimap').getContext('2d');
  let currentZone = null;

  const toMap = (v) => ((v + WORLD_SIZE / 2) / WORLD_SIZE) * 176;

  return {
    get started() { return started; },
    update(carRef) {
      kmhEl.textContent = carRef.kmh;
      // zone detection
      let found = null;
      for (const z of ZONES) {
        const dx = carRef.pos.x - z.x, dz = carRef.pos.z - z.z;
        if (dx * dx + dz * dz < z.r * z.r) { found = z; break; }
      }
      if (found !== currentZone) {
        currentZone = found;
        if (found) { title.textContent = found.title; body.textContent = found.body; panel.classList.remove('hidden'); }
        else panel.classList.add('hidden');
      }
      // minimap
      mm.fillStyle = '#121212'; mm.fillRect(0, 0, 176, 176);
      mm.strokeStyle = '#3a3a3a'; mm.strokeRect(4, 4, 168, 168);
      mm.fillStyle = '#e9e9e6';
      for (const z of ZONES) { mm.beginPath(); mm.arc(toMap(z.x), toMap(z.z), z === found ? 6 : 3.5, 0, 7); mm.fillStyle = z === found ? '#ff5a00' : '#e9e9e6'; mm.fill(); }
      // car dot + heading tick
      const cx = toMap(carRef.pos.x), cy = toMap(carRef.pos.z);
      mm.beginPath(); mm.arc(cx, cy, 5, 0, 7); mm.fillStyle = '#ff5a00'; mm.fill();
      mm.strokeStyle = '#ffffff'; mm.beginPath(); mm.moveTo(cx, cy);
      mm.lineTo(cx - Math.sin(carRef.heading) * 10, cy - Math.cos(carRef.heading) * 10); mm.stroke();
    },
  };
}
