// Sounddesign komplett im Browser erzeugt (Web Audio): Stein, Stahl, Magie, Donner – keine Sounddateien.
// Jeder Effekt ist eine Funktion (bus, zeitpunkt), die ein paar Oszillatoren und gefiltertes Rauschen plant.
// bus = { ctx, dry, wet }: dry geht direkt raus, wet durch einen Hall.

const NOISE = new WeakMap();
const rnd = (a, b) => a + Math.random() * (b - a);
export const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const PENTA = [74, 77, 79, 81, 84, 86, 89, 91, 93].map(midi);   // d-Moll-Pentatonik, hohe Lage

function noiseBuffer(ctx) {
  if (!NOISE.has(ctx)) {
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    NOISE.set(ctx, b);
  }
  return NOISE.get(ctx);
}

// Nachhall: Rauschen, das exponentiell ausklingt
function impulse(ctx, sec = 2.2, decay = 3) {
  const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

export function makeBus(ctx, dest, level = 1) {
  const dry = ctx.createGain(), wet = ctx.createGain(), hall = ctx.createConvolver();
  dry.gain.value = wet.gain.value = level;
  hall.buffer = impulse(ctx);
  dry.connect(dest);
  wet.connect(hall).connect(dest);
  return { ctx, dry, wet };
}

function send(bus, node, wet) {
  node.connect(bus.dry);
  if (wet > 0) {
    const g = bus.ctx.createGain();
    g.gain.value = wet;
    node.connect(g).connect(bus.wet);
  }
}

function envelope(g, t, attack, dur, peak) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
}

// gefilterter Rauschstoß (Zischen, Krachen, Rumpeln)
function noise(bus, t, { dur = 0.2, type = 'bandpass', freq = 1000, to = freq, q = 1, gain = 0.5, attack = 0.005, wet = 0.2 } = {}) {
  const { ctx } = bus, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuffer(ctx);
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (to !== freq) f.frequency.exponentialRampToValueAtTime(to, t + attack + dur);
  envelope(g, t, attack, dur, gain);
  src.connect(f).connect(g);
  send(bus, g, wet);
  src.start(t, Math.random());
  src.stop(t + attack + dur + 0.05);
}

// Ton mit Tonhöhenverlauf
function tone(bus, t, { type = 'sine', freq = 440, to = freq, dur = 0.3, gain = 0.3, attack = 0.005, wet = 0.2 } = {}) {
  const { ctx } = bus, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to !== freq) o.frequency.exponentialRampToValueAtTime(to, t + attack + dur);
  envelope(g, t, attack, dur, gain);
  o.connect(g);
  send(bus, g, wet);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

// Metall: unharmonische Teiltöne wie bei Glocke oder Klinge
function metal(bus, t, { freq = 600, dur = 0.8, gain = 0.25, wet = 0.35 } = {}) {
  for (const [r, a] of [[1, 1], [2.76, 0.6], [5.4, 0.4], [8.93, 0.25], [13.3, 0.15]])
    tone(bus, t, { freq: freq * r, dur: dur / Math.sqrt(r), gain: gain * a, wet });
  noise(bus, t, { dur: 0.04, type: 'highpass', freq: 3000, gain: gain * 1.2, wet: 0.1 });
}

function chord(bus, t, notes, { type = 'triangle', dur = 0.6, gain = 0.08, gap = 0, wet = 0.4 } = {}) {
  notes.forEach((n, i) => tone(bus, t + i * gap, { type, freq: midi(n), dur, gain, attack: 0.01, wet }));
}

export const SFX = {
  // Figur setzt auf: Stein auf Holz
  move: (b, t) => {
    tone(b, t, { freq: rnd(170, 200), to: 90, dur: 0.09, gain: 0.5, wet: 0.05 });
    noise(b, t, { dur: 0.05, freq: rnd(1600, 2200), q: 2, gain: 0.35, wet: 0.08 });
  },
  select: (b, t) => noise(b, t, { dur: 0.035, type: 'highpass', freq: 3500, gain: 0.12, wet: 0.05 }),
  whoosh: (b, t) => noise(b, t, { dur: 0.26, freq: 400, to: 2600, q: 1.5, gain: 0.9, attack: 0.08, wet: 0.15 }),
  step: (b, t) => {
    tone(b, t, { freq: rnd(95, 125), to: 50, dur: 0.11, gain: 0.25, wet: 0.05 });
    noise(b, t, { dur: 0.04, freq: 900, q: 2, gain: 0.08, wet: 0.05 });
  },
  hoof: (b, t) => {
    tone(b, t, { freq: rnd(150, 180), to: 80, dur: 0.07, gain: 0.3, wet: 0.08 });
    noise(b, t, { dur: 0.03, freq: rnd(2200, 2800), q: 3, gain: 0.2, wet: 0.08 });
  },
  // Klinge trifft Schild oder Klinge
  clang: (b, t) => metal(b, t, { freq: rnd(520, 680), dur: 0.9, gain: 0.2 }),
  // schwerer Aufprall (Hufe, Stein)
  thud: (b, t) => {
    tone(b, t, { freq: 110, to: 38, dur: 0.35, gain: 0.7, wet: 0.15 });
    noise(b, t, { dur: 0.18, type: 'lowpass', freq: 600, to: 120, gain: 0.5, wet: 0.2 });
  },
  stomp: (b, t) => {
    SFX.thud(b, t);
    noise(b, t, { dur: 0.12, freq: 1400, to: 500, q: 1, gain: 0.35, wet: 0.2 });
  },
  impact: (b, t) => {
    tone(b, t, { freq: 220, to: 60, dur: 0.3, gain: 0.5, wet: 0.15 });
    noise(b, t, { dur: 0.25, freq: 1200, to: 300, gain: 0.45, wet: 0.3 });
  },
  magicHit: (b, t) => {
    SFX.impact(b, t);
    for (const f of [1500, 2250, 3000]) tone(b, t, { freq: f, to: f * 0.5, dur: 0.45, gain: 0.05, wet: 0.7 });
  },
  cannon: (b, t) => {
    tone(b, t, { freq: 70, to: 28, dur: 1.1, gain: 0.6, wet: 0.35 });
    noise(b, t, { dur: 0.9, type: 'lowpass', freq: 900, to: 80, gain: 0.6, attack: 0.002, wet: 0.4 });
    noise(b, t, { dur: 0.06, type: 'highpass', freq: 2500, gain: 0.5, wet: 0.1 });
  },
  charge: (b, t) => {
    for (let i = 0; i < 6; i++) tone(b, t + i * 0.08, { freq: 400 * Math.pow(1.19, i), dur: 0.25, gain: 0.13, wet: 0.6 });
  },
  zap: (b, t) => {
    tone(b, t, { type: 'triangle', freq: 300, to: 1400, dur: 0.25, gain: 0.18, wet: 0.4 });
    tone(b, t + 0.02, { freq: 1800, to: 600, dur: 0.3, gain: 0.08, wet: 0.5 });
  },
  shards: (b, t) => {
    for (let i = 0; i < 5; i++) tone(b, t + i * 0.07, { freq: rnd(1800, 3200), to: rnd(600, 900), dur: 0.18, gain: 0.16, wet: 0.5 });
  },
  // magische Barriere fängt einen Treffer ab
  barrier: (b, t) => {
    for (const f of [880, 1320, 1760, 2640]) tone(b, t, { freq: f * rnd(0.99, 1.01), dur: 0.7, gain: 0.06, attack: 0.01, wet: 0.6 });
    noise(b, t, { dur: 0.15, freq: 3000, q: 4, gain: 0.15, wet: 0.5 });
  },
  // Figur zerspringt
  shatter: (b, t) => {
    for (let i = 0; i < 22; i++) noise(b, t + Math.pow(Math.random(), 1.8) * 0.7, { dur: rnd(0.02, 0.06), type: 'highpass', freq: rnd(2500, 7000), gain: rnd(0.08, 0.22), wet: 0.3 });
    tone(b, t, { freq: 140, to: 50, dur: 0.3, gain: 0.4, wet: 0.1 });
    for (let i = 0; i < 4; i++) tone(b, t + rnd(0, 0.2), { freq: rnd(2000, 4000), dur: 0.5, gain: 0.035, wet: 0.6 });
  },
  // Turm zerfällt
  crumble: (b, t) => {
    noise(b, t, { dur: 1.2, type: 'lowpass', freq: 400, to: 100, gain: 1.4, attack: 0.05, wet: 0.3 });
    tone(b, t, { freq: 80, to: 35, dur: 0.6, gain: 0.45, wet: 0.2 });
    for (let i = 0; i < 14; i++) noise(b, t + rnd(0, 1), { dur: rnd(0.03, 0.08), freq: rnd(500, 1500), q: 3, gain: rnd(0.3, 0.6), wet: 0.2 });
  },
  // Figur erwacht: aufsteigendes Schimmern
  awaken: (b, t) => {
    tone(b, t, { type: 'triangle', freq: 220, to: 660, dur: 0.6, gain: 0.18, attack: 0.15, wet: 0.6 });
    noise(b, t, { dur: 0.6, freq: 800, to: 4000, q: 2, gain: 0.16, attack: 0.3, wet: 0.5 });
    for (let i = 0; i < 5; i++) tone(b, t + 0.15 + i * 0.07, { freq: PENTA[i + 2], dur: 0.4, gain: 0.045, wet: 0.7 });
  },
  // zurück zur Figur: absteigendes Schimmern
  settle: (b, t) => {
    tone(b, t, { type: 'triangle', freq: 660, to: 220, dur: 0.5, gain: 0.15, attack: 0.05, wet: 0.6 });
    for (let i = 0; i < 4; i++) tone(b, t + i * 0.07, { freq: PENTA[6 - i], dur: 0.35, gain: 0.06, wet: 0.7 });
  },
  capture: (b, t) => {
    SFX.impact(b, t);
    for (let i = 0; i < 8; i++) noise(b, t + rnd(0, 0.3), { dur: 0.03, type: 'highpass', freq: rnd(3000, 6000), gain: 0.12, wet: 0.3 });
  },
  topple: (b, t) => {
    SFX.thud(b, t);
    for (let i = 0; i < 5; i++) SFX.move(b, t + 0.08 + i * 0.07 * (1 + i * 0.4));
  },
  check: (b, t) => {
    tone(b, t, { type: 'triangle', freq: 880, dur: 0.16, gain: 0.22, wet: 0.3 });
    tone(b, t + 0.14, { type: 'triangle', freq: 660, dur: 0.3, gain: 0.22, wet: 0.3 });
  },
  start: (b, t) => {
    metal(b, t, { freq: 110, dur: 2.5, gain: 0.12, wet: 0.6 });
    for (let i = 0; i < 4; i++) tone(b, t + 0.2 + i * 0.09, { freq: PENTA[i], dur: 0.6, gain: 0.04, wet: 0.7 });
  },
  win: (b, t) => {
    chord(b, t, [60, 64, 67, 72], { gap: 0.12, dur: 0.5, gain: 0.1 });
    chord(b, t + 0.6, [60, 64, 67, 72, 76], { dur: 1.8, gain: 0.07, type: 'sine', wet: 0.6 });
  },
  lose: (b, t) => {
    chord(b, t, [69, 65, 62], { gap: 0.28, dur: 0.6, gain: 0.1 });
    chord(b, t + 0.9, [50, 57, 62, 65], { dur: 2, gain: 0.06, type: 'sine', wet: 0.6 });
  },
  draw: (b, t) => {
    chord(b, t, [62, 69], { dur: 0.6, gain: 0.08 });
    chord(b, t + 0.45, [64, 67, 71], { dur: 1.4, gain: 0.06, type: 'sine', wet: 0.6 });
  },
  tick: (b, t) => noise(b, t, { dur: 0.02, freq: 3000, q: 6, gain: 0.7, wet: 0.05 }),
  pop: (b, t) => tone(b, t, { freq: 600, to: 1200, dur: 0.08, gain: 0.12, wet: 0.15 }),
};

// ---------- Hintergrundmusik: langsame Mollakkorde, ab und zu ein Glockenton; im Kampf mit Trommel ----------
const CHORDS = [[50, 57, 62, 65], [46, 53, 58, 62], [41, 48, 53, 57], [48, 55, 60, 64]];   // Dm · B · F · C
const BAR = 8;

class Music {
  constructor(bus, gain) {
    this.bus = bus;
    this.gain = gain;            // Ausgangsregler der Musik (für Ein-/Ausblenden)
    this.on = false;
    this.intense = false;
    this.bar = 0;
    this.beats = 0;
  }

  start() {
    if (this.on) return;
    const t = this.bus.ctx.currentTime;
    this.on = true;
    this.next = this.beat = t + 0.1;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(1, t, 0.8);
    this.timer = setInterval(() => this.#schedule(), 250);
  }

  stop() {
    if (!this.on) return;
    this.on = false;
    clearInterval(this.timer);
    this.gain.gain.setTargetAtTime(0.0001, this.bus.ctx.currentTime, 0.4);
  }

  setIntensity(on) {
    this.intense = on;
    if (this.on) this.gain.gain.setTargetAtTime(on ? 1.6 : 1, this.bus.ctx.currentTime, 0.6);
  }

  #schedule() {
    const ahead = this.bus.ctx.currentTime + 1;
    while (this.next < ahead) { this.#pad(this.next); this.next += BAR; }
    while (this.beat < ahead) {
      if (this.intense) this.#drum(this.beat, this.beats % 4 === 0);
      if (Math.random() < 0.08) this.#bell(this.beat);
      this.beat += 0.5;
      this.beats++;
    }
  }

  #pad(t) {
    const { ctx } = this.bus;
    for (const n of CHORDS[this.bar++ % CHORDS.length]) for (const [type, detune] of [['triangle', -6], ['sawtooth', 7]]) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = type;
      o.frequency.value = midi(n);
      o.detune.value = detune;
      f.type = 'lowpass';
      f.frequency.value = 700;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(type === 'sawtooth' ? 0.012 : 0.022, t + 2.5);
      g.gain.setValueAtTime(type === 'sawtooth' ? 0.012 : 0.022, t + BAR - 0.5);
      g.gain.linearRampToValueAtTime(0.0001, t + BAR + 2.5);
      o.connect(f).connect(g);
      send(this.bus, g, 0.6);
      o.start(t);
      o.stop(t + BAR + 2.6);
    }
  }

  #bell(t) {
    const f = PENTA[Math.floor(Math.random() * PENTA.length)];
    tone(this.bus, t, { freq: f, dur: 2.2, gain: 0.025, wet: 0.85 });
    tone(this.bus, t, { freq: f * 2.76, dur: 0.9, gain: 0.008, wet: 0.85 });
  }

  #drum(t, accent) {
    tone(this.bus, t, { freq: accent ? 85 : 70, to: 42, dur: 0.3, gain: accent ? 0.22 : 0.12, wet: 0.3 });
    noise(this.bus, t, { dur: 0.08, type: 'lowpass', freq: 500, gain: accent ? 0.12 : 0.06, wet: 0.2 });
  }
}

// ---------- Mischpult ----------
export class Sound {
  constructor({ sfx = true, music = true } = {}) {
    this.sfxOn = sfx;
    this.musicOn = music;
    this.ctx = null;
  }

  // Browser erlauben Ton erst nach einer Nutzeraktion – daher bei jedem Klick/Tippen aufrufen
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = this.ctx = new Ctx();
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.ratio.value = 8;
      limiter.connect(ctx.destination);
      this.sfx = makeBus(ctx, limiter, 0.8);
      const musicGain = ctx.createGain();
      musicGain.gain.value = 0.0001;
      musicGain.connect(limiter);
      this.music = new Music(makeBus(ctx, musicGain, 0.55), musicGain);
      if (this.musicOn) this.music.start();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  play(name, delay = 0) {
    if (!this.sfxOn || this.ctx?.state !== 'running' || !SFX[name]) return;
    SFX[name](this.sfx, this.ctx.currentTime + 0.01 + delay);
  }

  setSfx(on) { this.sfxOn = on; }

  setMusic(on) {
    this.musicOn = on;
    if (!this.music) return;
    on ? this.music.start() : this.music.stop();
  }

  intensity(on) { this.music?.setIntensity(on); }
}
