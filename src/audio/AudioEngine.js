// AudioEngine.js — 100% synthesized WebAudio, no files. One master chain;
// every sound is an event the gameplay code fires (audio-generator skill's
// audio matrix, procedural edition):
//   engine hum (pitch <- speed) - continuous, started on first user gesture
//   skid noise (handbrake slide) - continuous, gain <- drift state
//   collision thud - event, gain <- impact strength
//   zone chime / star blip / honk - events
export class AudioEngine {
  constructor() {
    this.ctx = null; this.muted = false; this.started = false;
  }

  // Must be called from a user gesture (START button / first key / first tap).
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = this.ctx = new Ctx();
      this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(ctx.destination);

      // engine: two detuned oscillators -> lowpass -> gain
      this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 2;
      this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth'; this.osc1.frequency.value = 55;
      this.osc2 = ctx.createOscillator(); this.osc2.type = 'square'; this.osc2.frequency.value = 28;
      const g2 = ctx.createGain(); g2.gain.value = 0.5;
      this.osc1.connect(lp); this.osc2.connect(g2); g2.connect(lp);
      lp.connect(this.engGain); this.engGain.connect(this.master);
      this.osc1.start(); this.osc2.start();

      // skid: looped noise -> bandpass -> gain
      const len = ctx.sampleRate * 1.2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 850; bp.Q.value = 0.8;
      this.skidGain = ctx.createGain(); this.skidGain.gain.value = 0;
      noise.connect(bp); bp.connect(this.skidGain); this.skidGain.connect(this.master);
      noise.start();
      this.started = true;
    } catch { /* audio unavailable — game stays silent, never crashes */ }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.03);
  }

  // Continuous per-frame update. speedRatio 0..1, drifting bool.
  update(speedRatio, drifting) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const f = 52 + speedRatio * 165;
    this.osc1.frequency.setTargetAtTime(f, t, 0.06);
    this.osc2.frequency.setTargetAtTime(f * 0.5 + 1.5, t, 0.06);
    this.engGain.gain.setTargetAtTime(0.028 + speedRatio * 0.05, t, 0.09);
    this.skidGain.gain.setTargetAtTime(drifting ? 0.11 : 0, t, drifting ? 0.03 : 0.12);
  }

  blip(freqA, freqB, dur = 0.16, type = 'sine', vol = 0.14, when = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freqA, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(freqB, 1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.02);
  }

  honk() { this.ensure(); this.blip(392, 380, 0.22, 'square', 0.10); this.blip(494, 480, 0.22, 'square', 0.08); }
  chime() { this.blip(660, 660, 0.14, 'sine', 0.12); this.blip(880, 880, 0.22, 'sine', 0.12, 0.11); }
  star() { this.blip(990, 990, 0.09, 'triangle', 0.16); this.blip(1318, 1318, 0.1, 'triangle', 0.16, 0.07); this.blip(1760, 1760, 0.16, 'triangle', 0.14, 0.14); }
  uiClick() { this.blip(740, 620, 0.06, 'triangle', 0.08); }

  thud(strength = 0.5) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    // body: filtered noise burst
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.5, 0.12 + strength * 0.4), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + 0.2);
    // weight: sine drop
    this.blip(130, 38, 0.2, 'sine', Math.min(0.5, 0.15 + strength * 0.35));
  }
}
