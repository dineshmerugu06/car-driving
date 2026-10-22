// Hud.js — intro overlay, help, zone panel, speedometer, minimap, touch
// controls, star counter, toasts, quality + mute toggles.
import { input } from '../car/Car.js';
import { ZONES, WORLD_SIZE } from '../world/World.js';

export function createHud(root, car, callbacks = {}) {
  root.innerHTML = `
    <div id="intro">
      <div class="intro-card">
        <div class="eyebrow">VIBE CODER &middot; AI BUILDER &middot; INDIA</div>
        <h1>MERUGU</h1>
        <p class="tag">Drive to explore my world.</p>
        <p class="controls-list">W / &uarr; accelerate &middot; S / &darr; brake &amp; reverse<br/>
        A D / &larr; &rarr; steer &middot; SPACE handbrake + jump &middot; R respawn &middot; H honk &middot; L mute<br/>
        Drag mouse to orbit camera &middot; scroll to zoom &middot; touch pedals on mobile<br/>
        Ram the cones &amp; crates. Drive up the ramps. Collect a &star; in every zone.</p>
        <button id="startBtn">START DRIVING &rarr;</button>
      </div>
    </div>
    <div id="topbar">
      <span class="logo">MERUGU<b>.</b></span>
      <span class="top-right">
        <span id="starsCount" class="chip">&star; 0/${ZONES.length}</span>
        <button id="qualityBtn" class="chip btn">QUALITY: HIGH</button>
        <button id="muteBtn" class="chip btn">SOUND: ON</button>
        <span class="hint">Drive into orange rings</span>
      </span>
    </div>
    <div id="toast" class="hidden"></div>
    <div id="zonePanel" class="hidden"><h2 id="zoneTitle"></h2><p id="zoneBody"></p></div>
    <div id="help">W/S drive &middot; A/D steer &middot; SPACE brake/jump<br/>R respawn &middot; H honk &middot; L mute &middot; drag = camera</div>
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
  const start = (silent = false) => {
    if (started) return;
    started = true;
    root.querySelector('#intro').classList.add('gone');
    if (!silent && callbacks.onStart) callbacks.onStart();
  };
  root.querySelector('#startBtn').addEventListener('click', () => start(false));

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
  root.querySelector('#jumpBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); car.queueJump(); });

  // toggles
  let high = true, muted = false;
  const qBtn = root.querySelector('#qualityBtn');
  const mBtn = root.querySelector('#muteBtn');
  const setMuted = (m) => { muted = m; mBtn.textContent = m ? 'SOUND: OFF' : 'SOUND: ON'; };
  qBtn.addEventListener('click', () => { high = !high; qBtn.textContent = high ? 'QUALITY: HIGH' : 'QUALITY: LOW'; if (callbacks.onQuality) callbacks.onQuality(high); });
  mBtn.addEventListener('click', () => { setMuted(!muted); if (callbacks.onMute) callbacks.onMute(muted); });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyL') { setMuted(!muted); if (callbacks.onMute) callbacks.onMute(muted); }
  });

  // toast
  const toastEl = root.querySelector('#toast');
  let toastTimer = 0;
  const toast = (msg, ms = 2600) => {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    toastEl.classList.remove('pop'); void toastEl.offsetWidth; toastEl.classList.add('pop');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms);
  };

  const panel = root.querySelector('#zonePanel');
  const title = root.querySelector('#zoneTitle');
  const body = root.querySelector('#zoneBody');
  const kmhEl = root.querySelector('#kmh');
  const starsEl = root.querySelector('#starsCount');
  const mm = root.querySelector('#minimap').getContext('2d');
  let currentZone = null, zoneShownAt = 0;
  const discovered = new Set();

  const toMap = (v) => ((v + WORLD_SIZE / 2) / WORLD_SIZE) * 176;

  return {
    get started() { return started; },
    start,
    toast,
    setMuted,
    setStars(n) { starsEl.innerHTML = `&star; ${n}/${ZONES.length}`; },
    update(carRef) {
      kmhEl.textContent = carRef.kmh;
      let found = null;
      for (const z of ZONES) {
        const dx = carRef.pos.x - z.x, dz = carRef.pos.z - z.z;
        if (dx * dx + dz * dz < z.r * z.r) { found = z; break; }
      }
      if (found !== currentZone) {
        currentZone = found;
        zoneShownAt = Date.now();
        if (found && started) {
          title.textContent = found.title; body.textContent = found.body;
          panel.classList.remove('hidden'); panel.classList.remove('faded');
          panel.classList.remove('pop'); void panel.offsetWidth; panel.classList.add('pop');
          const first = !discovered.has(found.id);
          discovered.add(found.id);
          if (callbacks.onZoneEnter) callbacks.onZoneEnter(found, first);
        } else panel.classList.add('hidden');
      }
      if (currentZone && started) {
        panel.classList.toggle('faded', Date.now() - zoneShownAt > 7000);
      }
      // minimap
      mm.fillStyle = '#121212'; mm.fillRect(0, 0, 176, 176);
      mm.strokeStyle = '#3a3a3a'; mm.strokeRect(4, 4, 168, 168);
      for (const z of ZONES) {
        mm.beginPath(); mm.arc(toMap(z.x), toMap(z.z), z === found ? 6 : 3.5, 0, 7);
        mm.fillStyle = z.starMesh && !z.starMesh.visible ? '#7a7a72' : (z === found ? '#ff5a00' : '#e9e9e6');
        if (z === found) mm.fillStyle = '#ff5a00';
        mm.fill();
      }
      const cx = toMap(carRef.pos.x), cy = toMap(carRef.pos.z);
      mm.beginPath(); mm.arc(cx, cy, 5, 0, 7); mm.fillStyle = '#ff5a00'; mm.fill();
      mm.strokeStyle = '#ffffff'; mm.beginPath(); mm.moveTo(cx, cy);
      mm.lineTo(cx - Math.sin(carRef.heading) * 10, cy - Math.cos(carRef.heading) * 10); mm.stroke();
    },
  };
}
