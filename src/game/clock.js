// Schachuhr: Restzeit je Seite in Millisekunden. Es läuft nur die Uhr der Seite am Zug,
// nach jedem Zug gibt es den Fischer-Bonus (inc). Die Uhrzeit-Quelle ist austauschbar (Tests).
export const TIME_CONTROLS = [
  { id: 'none', label: 'Ohne Uhr', base: 0, inc: 0 },
  { id: '3+2', label: '3 + 2', base: 3 * 60e3, inc: 2e3 },
  { id: '5+3', label: '5 + 3', base: 5 * 60e3, inc: 3e3 },
  { id: '10+0', label: '10 Min', base: 10 * 60e3, inc: 0 },
  { id: '15+10', label: '15 + 10', base: 15 * 60e3, inc: 10e3 },
];

export class Clock {
  constructor({ base, inc = 0, times = null, now = () => Date.now() }) {
    this.base = base;
    this.inc = inc;
    this.times = times ? { ...times } : { w: base, b: base };
    this.running = null;      // Farbe, deren Uhr gerade läuft
    this.since = 0;
    this.now = now;
  }

  // Restzeit – für die laufende Seite live heruntergezählt
  left(color) { return Math.max(0, this.overdue(color)); }

  // wie left(), aber ungekappt – negativ heißt: seit so vielen ms überzogen
  overdue(color) { return this.running === color ? this.times[color] - (this.now() - this.since) : this.times[color]; }

  start(color) {
    this.stop();
    this.running = color;
    this.since = this.now();
  }

  stop() {
    if (!this.running) return;
    this.times[this.running] = this.left(this.running);
    this.running = null;
  }

  // Zug gemacht: Zeit des Ziehenden festhalten und Bonus gutschreiben.
  // reported = Restzeit, die der Gegner selbst gemeldet hat (dann gilt genau diese).
  moved(color, { reported, bonus = true } = {}) {
    this.stop();
    this.times[color] = reported ?? this.times[color] + (bonus ? this.inc : 0);
  }

  config() { return { base: this.base, inc: this.inc, times: { w: this.left('w'), b: this.left('b') } }; }
}

// 1:05 · 0:09.4 (unter zehn Sekunden mit Zehnteln)
export function formatTime(ms) {
  const s = Math.max(0, ms) / 1000;
  if (s < 10) return `0:0${s.toFixed(1)}`;
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}
