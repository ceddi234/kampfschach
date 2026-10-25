import { describe, it, expect } from 'vitest';
import { Session } from '../src/net/session.js';
import { valid } from '../src/net/protocol.js';

// zwei verbundene Fake-Verbindungen; Nachrichten gehen wie im echten Kanal als JSON durch
function fakePair() {
  const make = () => ({
    msg: [], stat: [], peer: null, sent: [], down: false,
    send(m) { this.sent.push(m); if (!this.down) this.peer.msg.forEach((f) => f(JSON.parse(JSON.stringify(m)))); },
    onMessage(f) { this.msg.push(f); },
    onStatus(f) { this.stat.push(f); },
    status(s) { this.stat.forEach((f) => f(s)); },
    close() {},
  });
  const a = make(), b = make();
  a.peer = b; b.peer = a;
  return [a, b];
}

function online({ hostColor = 'w' } = {}) {
  const [th, tg] = fakePair();
  const host = new Session({ mode: 'host', transport: th, code: 'ABCDE', myName: 'Cedrik', hostColor });
  const guest = new Session({ mode: 'guest', transport: tg, code: 'ABCDE', myName: 'Max' });
  th.status('connected');
  tg.status('connected');          // Gast schickt "hello", Gastgeber antwortet mit "state"
  return { host, guest, th, tg };
}

describe('Session online', () => {
  it('verbindet: Namen und Farben kommen beim Gast an', () => {
    const { host, guest } = online({ hostColor: 'b' });
    expect(host.names.opponent).toBe('Max');
    expect(guest.names.opponent).toBe('Cedrik');
    expect(host.myColor).toBe('b');
    expect(guest.myColor).toBe('w');
    expect(guest.canMove()).toBe(true);
    expect(host.canMove()).toBe(false);
  });

  it('spielt Züge abwechselnd und spiegelt sie auf beiden Seiten', () => {
    const { host, guest } = online();
    const seen = [];
    guest.on('move', (m) => seen.push(m.san));
    expect(guest.move({ from: 'e7', to: 'e5' })).toBeNull();     // Gast ist Schwarz, nicht am Zug
    host.move({ from: 'e2', to: 'e4' });
    guest.move({ from: 'e7', to: 'e5' });
    host.move({ from: 'g1', to: 'f3' });
    expect(guest.match.moves).toEqual(host.match.moves);
    expect(seen).toEqual(['e4', 'e5', 'Nf3']);
    expect(host.move({ from: 'f3', to: 'g5' })).toBeNull();       // Gastgeber ist gerade nicht dran
  });

  it('zieht nicht, solange die Verbindung weg ist', () => {
    const { host, th } = online();
    th.status('reconnecting');
    expect(host.canMove()).toBe(false);
    expect(host.move({ from: 'e2', to: 'e4' })).toBeNull();
  });

  it('gleicht nach verlorener Nachricht über den Gastgeber ab', () => {
    const { host, guest, th } = online();
    th.down = true;                                               // Zug geht verloren
    host.move({ from: 'd2', to: 'd4' });
    th.down = false;
    expect(guest.match.ply).toBe(0);
    host.move({ from: 'e2', to: 'e4' });                          // nicht erlaubt: Weiß ist nicht dran
    expect(host.match.ply).toBe(1);
    // Gast verbindet sich neu → bekommt den vollständigen Stand
    guest.transport.status('connected');
    expect(guest.match.moves).toEqual(['d2d4']);
    expect(guest.canMove()).toBe(true);
  });

  it('verwirft Züge mit falscher Zugnummer und fordert den Stand an', () => {
    const { host, guest, tg } = online();
    host.move({ from: 'e2', to: 'e4' });
    tg.peer.msg.forEach((f) => f({ t: 'move', lan: 'e4e5', ply: 7, game: 1 }));   // Unsinn an den Gastgeber
    expect(host.match.moves).toEqual(['e2e4']);
    expect(guest.match.moves).toEqual(['e2e4']);
  });

  it('Remis anbieten, ablehnen und annehmen', () => {
    const { host, guest } = online();
    const declined = [];
    host.on('declined', (k) => declined.push(k));
    host.offerDraw();
    expect(guest.offers.drawReceived).toBe(true);
    guest.answerDraw(false);
    expect(declined).toEqual(['draw']);
    expect(host.match.over).toBe(false);
    host.offerDraw();
    guest.answerDraw(true);
    expect(host.match.result).toEqual({ winner: null, reason: 'agreement' });
    expect(guest.match.result).toEqual({ winner: null, reason: 'agreement' });
  });

  it('ein Zug lehnt ein offenes Remisangebot stillschweigend ab', () => {
    const { host, guest } = online();
    guest.offerDraw();
    host.move({ from: 'e2', to: 'e4' });
    expect(host.offers.drawReceived).toBe(false);
    expect(guest.offers.drawSent).toBe(false);
  });

  it('Aufgabe beendet die Partie auf beiden Seiten', () => {
    const { host, guest } = online();
    guest.resign();
    expect(host.match.result).toEqual({ winner: 'w', reason: 'resign' });
    expect(guest.match.result).toEqual({ winner: 'w', reason: 'resign' });
  });

  it('Revanche tauscht die Farben und ignoriert alte Nachrichten', () => {
    const { host, guest, tg } = online();
    host.move({ from: 'e2', to: 'e4' });
    host.resign();
    const resets = [];
    guest.on('reset', () => resets.push(guest.myColor));
    guest.offerRematch();
    host.answerRematch(true);
    expect(host.game).toBe(2);
    expect(guest.game).toBe(2);
    expect(host.myColor).toBe('b');
    expect(resets).toEqual(['w']);
    expect(guest.match.ply).toBe(0);
    tg.peer.msg.forEach((f) => f({ t: 'move', lan: 'e2e4', ply: 0, game: 1 }));   // verspäteter Zug aus Partie 1
    expect(host.match.ply).toBe(0);
    guest.move({ from: 'e2', to: 'e4' });
    expect(host.match.moves).toEqual(['e2e4']);
  });
});

describe('Session lokal', () => {
  it('beide Seiten ziehen am selben Gerät, Revanche startet neu', () => {
    const s = new Session({ mode: 'local' });
    expect(s.canMove()).toBe(true);
    s.move({ from: 'f2', to: 'f3' });
    expect(s.isMine('b')).toBe(true);
    s.move({ from: 'e7', to: 'e5' });
    s.move({ from: 'g2', to: 'g4' });
    s.move({ from: 'd8', to: 'h4' });
    expect(s.match.result).toEqual({ winner: 'b', reason: 'checkmate' });
    s.offerRematch();
    expect(s.match.ply).toBe(0);
    expect(s.game).toBe(2);
  });
});

describe('Protokoll', () => {
  it('prüft Nachrichten', () => {
    expect(valid({ t: 'move', lan: 'e7e8q', ply: 3, game: 1 })).toBe(true);
    expect(valid({ t: 'move', lan: 'e7e9', ply: 3, game: 1 })).toBe(false);
    expect(valid({ t: 'hello', v: 1, name: 'Max' })).toBe(true);
    expect(valid({ t: 'hello', v: 2, name: 'Max' })).toBe(false);
    expect(valid({ t: 'state', moves: ['e2e4'], hostColor: 'w', result: null, game: 1, name: 'A' })).toBe(true);
    expect(valid({ t: 'state', moves: ['x'], hostColor: 'w', result: null, game: 1, name: 'A' })).toBe(false);
    expect(valid({ t: 'unbekannt' })).toBe(false);
    expect(valid(null)).toBe(false);
  });
});
