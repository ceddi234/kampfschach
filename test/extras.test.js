import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { Clock, formatTime } from '../src/game/clock.js';
import { Match, toLan } from '../src/game/match.js';
import { Session } from '../src/net/session.js';
import { valid } from '../src/net/protocol.js';

const lan = (...san) => { const c = new Chess(); return san.map((s) => toLan(c.move(s))); };

// verstellbare Uhr für die Tests
function fakeTime() {
  const t = { ms: 0 };
  t.now = () => t.ms;
  return t;
}

// zwei verbundene Fake-Verbindungen (wie in session.test.js)
function fakePair() {
  const make = () => ({
    msg: [], stat: [], peer: null, down: false,
    send(m) { if (!this.down) this.peer.msg.forEach((f) => f(JSON.parse(JSON.stringify(m)))); },
    onMessage(f) { this.msg.push(f); },
    onStatus(f) { this.stat.push(f); },
    status(s) { this.stat.forEach((f) => f(s)); },
    close() {},
  });
  const a = make(), b = make();
  a.peer = b; b.peer = a;
  return [a, b];
}

function online({ clock = null, time = fakeTime() } = {}) {
  const [th, tg] = fakePair();
  const host = new Session({ mode: 'host', transport: th, code: 'ABCDE', myName: 'Cedrik', hostColor: 'w', clock, now: time.now });
  const guest = new Session({ mode: 'guest', transport: tg, code: 'ABCDE', myName: 'Max', now: time.now });
  th.status('connected');
  tg.status('connected');
  return { host, guest, th, tg, time };
}

describe('Schachuhr', () => {
  it('läuft nur für die Seite am Zug und gibt Bonus nach dem Zug', () => {
    const t = fakeTime();
    const c = new Clock({ base: 60e3, inc: 2e3, now: t.now });
    c.start('w');
    t.ms = 5e3;
    expect(c.left('w')).toBe(55e3);
    expect(c.left('b')).toBe(60e3);
    c.moved('w');
    expect(c.left('w')).toBe(57e3);
    c.start('b');
    t.ms = 70e3;
    expect(c.left('b')).toBe(0);
    expect(c.overdue('b')).toBe(-5e3);
  });

  it('übernimmt gemeldete Restzeiten und formatiert lesbar', () => {
    const c = new Clock({ base: 60e3, inc: 2e3 });
    c.moved('b', { reported: 12345 });
    expect(c.times.b).toBe(12345);
    expect(formatTime(65e3)).toBe('1:05');
    expect(formatTime(9400)).toBe('0:09.4');
    expect(formatTime(-5)).toBe('0:00.0');
  });
});

describe('Partie: Zeit und Zurücknehmen', () => {
  it('Zeit abgelaufen verliert – außer der Gegner hat nur noch eine Leichtfigur', () => {
    const m = new Match();
    m.timeout('w');
    expect(m.result).toEqual({ winner: 'b', reason: 'timeout' });
    const lone = new Match();
    lone.chess.load('8/8/8/4k3/8/8/8/4K1N1 b - - 0 1');          // Weiß hat nur König + Springer
    lone.timeout('b');
    expect(lone.result).toEqual({ winner: null, reason: 'timeout-draw' });
  });

  it('nimmt Halbzüge zurück', () => {
    const m = new Match(lan('e4', 'e5', 'Nf3'));
    m.undo(2);
    expect(m.moves).toEqual(lan('e4'));
    expect(m.turn).toBe('b');
  });
});

describe('Session: Zurücknehmen mit Zustimmung', () => {
  it('Gast fragt nach seinem Zug, Gastgeber stimmt zu → ein Halbzug zurück', () => {
    const { host, guest } = online();
    host.move({ from: 'e2', to: 'e4' });
    guest.move({ from: 'e7', to: 'e5' });
    expect(guest.canUndo()).toBe(true);
    const undone = [];
    guest.on('undo', () => undone.push('gast'));
    guest.requestUndo();
    expect(host.offers.undoReceived).toBe(2);
    host.answerUndo(true);
    expect(host.match.moves).toEqual(['e2e4']);
    expect(guest.match.moves).toEqual(['e2e4']);
    expect(guest.canMove()).toBe(true);
    expect(undone).toEqual(['gast']);
  });

  it('Gastgeber fragt, nachdem der Gast schon geantwortet hat → zwei Halbzüge zurück', () => {
    const { host, guest } = online();
    host.move({ from: 'e2', to: 'e4' });
    guest.move({ from: 'e7', to: 'e5' });
    host.requestUndo();
    guest.answerUndo(true);
    expect(host.match.ply).toBe(0);
    expect(guest.match.ply).toBe(0);
    expect(host.canMove()).toBe(true);
  });

  it('Ablehnen, und ein Zug macht eine offene Anfrage hinfällig', () => {
    const { host, guest } = online();
    host.move({ from: 'e2', to: 'e4' });
    const declined = [];
    host.on('declined', (k) => declined.push(k));
    host.requestUndo();
    guest.answerUndo(false);
    expect(declined).toEqual(['undo']);
    expect(host.match.ply).toBe(1);
    host.requestUndo();
    guest.move({ from: 'e7', to: 'e5' });                       // statt zu antworten: gezogen
    expect(guest.offers.undoReceived).toBe(null);
    expect(host.offers.undoSent).toBe(false);
  });

  it('wer noch nichts gezogen hat, kann nichts zurücknehmen', () => {
    const { host, guest } = online();
    host.move({ from: 'e2', to: 'e4' });
    expect(guest.canUndo()).toBe(false);
  });

  it('lokal geht es sofort und ohne Rückfrage', () => {
    const s = new Session({ mode: 'local' });
    s.move({ from: 'e2', to: 'e4' });
    s.move({ from: 'e7', to: 'e5' });
    s.requestUndo();
    expect(s.match.moves).toEqual(['e2e4']);
  });
});

describe('Session: Schachuhr online', () => {
  it('startet nach beiden ersten Zügen, meldet Restzeiten mit und pausiert ohne Verbindung', () => {
    const { host, guest, th, time } = online({ clock: { base: 60e3, inc: 1e3 } });
    expect(guest.clock.base).toBe(60e3);                         // kommt mit dem Stand beim Gast an
    host.move({ from: 'e2', to: 'e4' });
    guest.move({ from: 'e7', to: 'e5' });
    expect(host.clock.running).toBe('w');
    time.ms = 10e3;
    host.move({ from: 'g1', to: 'f3' });
    expect(host.clock.times.w).toBe(51e3);                       // 60 − 10 + 1 Bonus
    expect(guest.clock.times.w).toBe(51e3);                      // genau so beim Gast
    expect(guest.clock.running).toBe('b');
    th.status('reconnecting');
    expect(host.clock.running).toBe(null);
  });

  it('Zeit abgelaufen beendet die Partie auf beiden Seiten', () => {
    const { host, guest, time } = online({ clock: { base: 30e3, inc: 0 } });
    host.move({ from: 'e2', to: 'e4' });
    guest.move({ from: 'e7', to: 'e5' });
    time.ms = 31e3;
    guest.tick();                                                // Weiß ist dran – das meldet der Gastgeber selbst
    expect(guest.match.over).toBe(false);
    host.tick();
    expect(host.match.result).toEqual({ winner: 'b', reason: 'timeout' });
    expect(guest.match.result).toEqual({ winner: 'b', reason: 'timeout' });
  });

  it('Zurücknehmen stellt auch die Uhr zurück', () => {
    const { host, guest, time } = online({ clock: { base: 60e3, inc: 0 } });
    host.move({ from: 'e2', to: 'e4' });
    guest.move({ from: 'e7', to: 'e5' });
    time.ms = 20e3;
    host.move({ from: 'g1', to: 'f3' });
    expect(host.clock.times.w).toBe(40e3);
    host.requestUndo();
    guest.answerUndo(true);
    expect(host.clock.times.w).toBe(60e3);
    expect(guest.clock.times.w).toBe(60e3);
  });
});

describe('Session: Chat und Emotes', () => {
  it('Nachrichten und Emotes kommen beim Gegenüber an', () => {
    const { host, guest } = online();
    const got = [];
    guest.on('chat', (c) => got.push(c));
    guest.on('emote', (e) => got.push(e));
    host.say('  Viel Glück!  ');
    host.emote('🔥');
    host.emote('<script>');                                      // nicht in der Liste → wird nicht gesendet
    expect(got).toEqual([{ me: false, text: 'Viel Glück!' }, { me: false, e: '🔥' }]);
    expect(host.chat).toEqual([{ me: true, text: 'Viel Glück!' }]);
  });

  it('Gastgeber mit anderer Version meldet "outdated"', () => {
    const [th, tg] = fakePair();
    new Session({ mode: 'host', transport: th, code: 'X', hostColor: 'w' });
    const seen = [];
    tg.onMessage((m) => seen.push(m.t));
    th.status('connected');
    th.msg.forEach((f) => f({ t: 'hello', v: 1, name: 'Alt' }));
    expect(seen).toEqual(['outdated']);
    expect(valid({ t: 'emote', e: '🤝' })).toBe(true);
    expect(valid({ t: 'chat', text: '' })).toBe(false);
  });
});
