// Eine laufende Partie samt Gegenüber: lokal (beide am selben Gerät), als Gastgeber oder als Gast.
// Die Verbindung (transport) ist austauschbar – im Spiel PeerJS, in den Tests ein Fake.
import { Match, other, toLan, fromLan } from '../game/match.js';
import { Clock } from '../game/clock.js';
import { PROTOCOL, EMOTES, valid } from './protocol.js';

class Emitter {
  #handlers = {};
  on(event, fn) { (this.#handlers[event] ||= []).push(fn); return this; }
  emit(event, ...args) { for (const fn of this.#handlers[event] || []) fn(...args); }
}

const noOffers = () => ({ drawSent: false, drawReceived: false, rematchSent: false, rematchReceived: false, undoSent: false, undoReceived: null });
const HOST_FLAG_GRACE = 2000;   // so lange wartet der Gastgeber auf die Zeitmeldung des Gasts, bevor er selbst abpfeift

export class Session extends Emitter {
  // mode: 'local' | 'host' | 'guest' | 'cpu' (gegen den Computer; hostColor = Farbe des Menschen)
  // clock: { base, inc, times? } oder null (ohne Uhr) · level: Stärke des Computers
  constructor({ mode, transport = null, code = null, myName = 'Spieler', opponentName = null,
                hostColor = 'w', moves = [], result = null, game = 1, clock = null, timeLog = [], level = null, now }) {
    super();
    this.mode = mode;
    this.code = code;
    this.transport = transport;
    this.hostColor = hostColor;          // Farbe des Gastgebers; der Gast hat die andere
    this.game = game;                    // zählt bei Revanche hoch, damit alte Nachrichten ins Leere laufen
    this.names = { me: myName, opponent: opponentName };
    this.match = new Match(moves, result);
    this.offers = noOffers();
    this.now = now;                      // Uhrzeit-Quelle (Tests)
    this.clock = this.#makeClock(clock);
    this.timeLog = [...timeLog];         // Restzeiten nach jedem Halbzug – fürs Zurücknehmen
    this.chat = [];                      // { me, text }
    this.level = level;
    this.cpuAcceptsDraw = () => false;   // gegen den Computer: entscheidet main.js anhand der Engine-Bewertung
    this.connection = this.online ? 'connecting' : 'connected';
    if (transport) {
      transport.onMessage((m) => this.#receive(m));
      transport.onStatus((s) => this.#status(s));
    }
    this.#runClock();
  }

  get online() { return this.mode === 'host' || this.mode === 'guest'; }
  get connected() { return this.connection === 'connected'; }
  get myColor() { return this.mode === 'local' ? null : this.mode === 'guest' ? other(this.hostColor) : this.hostColor; }

  // Gehört eine Figur dieser Farbe gerade "mir"? Lokal: immer die Seite am Zug.
  isMine(color) { return this.mode === 'local' ? color === this.match.turn : color === this.myColor; }
  canMove() { return !this.match.over && this.connected && this.isMine(this.match.turn); }

  // gegen den Computer: ist er dran?
  engineTurn() { return this.mode === 'cpu' && !this.match.over && this.match.turn !== this.myColor; }

  engineMove(lan) {
    if (!this.engineTurn()) return null;
    const ply = this.match.ply, mover = this.match.turn;
    const m = this.match.move(fromLan(lan));
    if (!m) return null;
    this.#clearOffers();
    this.#clockAfterMove(mover, ply);
    this.emit('move', m);
    this.#changed();
    return m;
  }

  move({ from, to, promotion }) {
    if (!this.canMove()) return null;
    const ply = this.match.ply, mover = this.match.turn;
    const m = this.match.move({ from, to, promotion });
    if (!m) return null;
    this.#clearOffers();
    this.#clockAfterMove(mover, ply);
    this.#send({ t: 'move', lan: toLan(m), ply, game: this.game, left: this.clock?.times[mover] });
    this.emit('move', m);
    this.#changed();
    return m;
  }

  resign() {
    if (this.match.over) return;
    this.match.resign(this.mode === 'local' ? this.match.turn : this.myColor);
    this.#send({ t: 'resign', game: this.game });
    this.#changed();
  }

  offerDraw() {
    if (this.match.over || this.offers.drawSent) return;
    if (this.mode === 'cpu') {
      if (this.cpuAcceptsDraw()) this.match.agreeDraw();
      else this.emit('declined', 'draw');
      this.#changed();
      return;
    }
    if (!this.online) { this.match.agreeDraw(); this.#changed(); return; }
    this.offers.drawSent = true;
    this.#send({ t: 'draw-offer', game: this.game });
    this.#changed();
  }

  answerDraw(accept) {
    if (!this.offers.drawReceived) return;
    this.offers.drawReceived = false;
    this.#send({ t: 'draw-reply', accept, game: this.game });
    if (accept) this.match.agreeDraw();
    this.#changed();
  }

  offerRematch() {
    if (!this.match.over) return;
    if (!this.online) { this.#newGame(); return; }
    this.offers.rematchSent = true;
    this.#send({ t: 'rematch-offer', game: this.game });
    this.#changed();
  }

  answerRematch(accept) {
    if (!this.offers.rematchReceived) return;
    this.offers.rematchReceived = false;
    this.#send({ t: 'rematch-reply', accept, game: this.game });
    if (accept && this.mode === 'host') this.#newGame();
    else this.#changed();
  }

  // ---------- Zug zurücknehmen ----------
  // online: nur mit Zustimmung und nur, wenn darunter ein eigener Zug ist; lokal: sofort einen Halbzug;
  // gegen den Computer: sofort bis vor den eigenen letzten Zug
  canUndo() {
    if (this.match.over || this.match.ply === 0) return false;
    if (this.mode === 'local') return true;
    if (this.mode === 'cpu') return this.#undoCount(this.myColor) > 0;
    return this.connected && !this.offers.undoSent && this.#undoCount(this.myColor) > 0;
  }

  requestUndo() {
    if (!this.canUndo()) return;
    if (this.mode === 'local') return this.#applyUndo(1);
    if (this.mode === 'cpu') return this.#applyUndo(this.#undoCount(this.myColor));
    this.offers.undoSent = true;
    this.#send({ t: 'undo-offer', ply: this.match.ply, game: this.game });
    this.#changed();
  }

  answerUndo(accept) {
    const ply = this.offers.undoReceived;
    if (ply === null) return;
    this.offers.undoReceived = null;
    this.#send({ t: 'undo-reply', accept, game: this.game });
    // der Gastgeber setzt den Stand zurück; nimmt der Gast an, macht es der Gastgeber beim Empfang der Antwort
    if (accept && this.mode === 'host' && ply === this.match.ply) this.#applyUndo(this.#undoCount(other(this.myColor)));
    else this.#changed();
  }

  // ---------- Schachuhr ----------
  // regelmäßig aufrufen: merkt, wenn die Zeit abgelaufen ist
  tick() {
    const c = this.clock?.running;
    if (!c || this.match.over) return;
    const left = this.clock.overdue(c), mine = !this.online || c === this.myColor;
    if ((mine && left <= 0) || (this.mode === 'host' && left <= -HOST_FLAG_GRACE)) this.#timeout(c);
  }

  // ---------- Chat & Emotes ----------
  say(text) {
    const t = String(text).trim().slice(0, 200);
    if (!t || !this.online) return;
    this.chat.push({ me: true, text: t });
    this.#send({ t: 'chat', text: t });
    this.emit('chat', this.chat.at(-1));
  }

  emote(e) {
    if (!EMOTES.includes(e) || !this.online) return;
    this.#send({ t: 'emote', e });
    this.emit('emote', { me: true, e });
  }

  snapshot() {
    return { mode: this.mode, code: this.code, hostColor: this.hostColor, game: this.game,
             moves: this.match.moves, result: this.match.result, names: this.names,
             clock: this.clock?.config() ?? null, timeLog: this.timeLog, level: this.level };
  }

  close() { this.transport?.close(); }

  // ---------- intern ----------
  #send(msg) { this.transport?.send(msg); }
  #changed() { this.#runClock(); this.emit('change'); }
  #clearOffers() { Object.assign(this.offers, { drawSent: false, drawReceived: false, undoSent: false, undoReceived: null }); }

  #makeClock(c) { return c?.base ? new Clock({ ...c, ...(this.now && { now: this.now }) }) : null; }

  // die Uhr läuft ab dem zweiten Halbzug für die Seite am Zug – nicht nach Spielende und nicht ohne Verbindung
  #runClock() {
    if (!this.clock) return;
    const live = !this.match.over && this.connected && this.match.ply >= 2;
    if (!live) this.clock.stop();
    else if (this.clock.running !== this.match.turn) this.clock.start(this.match.turn);
  }

  #clockAfterMove(mover, ply, reported) {
    if (this.clock) this.clock.moved(mover, { reported, bonus: ply >= 2 });
    this.timeLog.push(this.clock ? { ...this.clock.times } : null);
  }

  #timeout(color) {
    this.clock.stop();
    this.clock.times[color] = 0;
    this.match.timeout(color);
    this.#send({ t: 'flag', color, game: this.game });
    this.#changed();
  }

  // wie viele Halbzüge zurück, damit der Anfragende wieder am Zug ist (0 = er hat noch nichts zum Zurücknehmen)
  #undoCount(color) {
    const n = this.match.turn === color ? 2 : 1;
    return n <= this.match.ply ? n : 0;
  }

  #applyUndo(n) {
    if (n <= 0) return this.#changed();
    this.match.undo(n);
    this.timeLog.length = Math.max(0, this.timeLog.length - n);
    if (this.clock) {
      this.clock.stop();
      this.clock.times = { ...(this.timeLog.at(-1) || { w: this.clock.base, b: this.clock.base }) };
    }
    this.#clearOffers();
    this.#sendState();
    this.emit('undo');
    this.#changed();
  }

  #status(s) {
    this.connection = s;
    if (s === 'connected' && this.mode === 'guest') this.#send({ t: 'hello', v: PROTOCOL, name: this.names.me });
    this.emit('status', s);
    this.#changed();
  }

  #sendState() {
    this.#send({ t: 'state', moves: this.match.moves, result: this.match.result, hostColor: this.hostColor,
                 game: this.game, name: this.names.me, clock: this.clock?.config() ?? null });
  }

  // nur der Gastgeber startet neue Partien; Farben werden getauscht, die Uhr fängt von vorn an
  #newGame() {
    if (this.online) this.hostColor = other(this.hostColor);
    this.game += 1;
    this.match = new Match();
    this.offers = noOffers();
    this.clock = this.#makeClock(this.clock && { base: this.clock.base, inc: this.clock.inc });
    this.timeLog = [];
    this.#sendState();
    this.emit('reset');
    this.#changed();
  }

  #resync() {
    if (this.mode === 'host') this.#sendState();
    else this.#send({ t: 'sync-request' });
  }

  #receive(msg) {
    if (!valid(msg)) return;
    if ('game' in msg && msg.t !== 'state' && msg.game !== this.game) return;   // Nachricht aus einer alten Partie
    const opponent = other(this.myColor);
    switch (msg.t) {
      case 'hello':
        if (this.mode !== 'host') return;
        if (msg.v !== PROTOCOL) return this.#send({ t: 'outdated' });
        this.names.opponent = msg.name.slice(0, 24);
        this.#sendState();
        this.#changed();
        return;
      case 'state': {
        if (this.mode !== 'guest') return;
        const before = this.match.moves;
        const undone = msg.game === this.game && msg.moves.length < before.length && msg.moves.every((x, i) => x === before[i]);
        this.hostColor = msg.hostColor;
        this.game = msg.game;
        this.names.opponent = msg.name.slice(0, 24);
        this.match = new Match(msg.moves, msg.result);
        this.clock = this.#makeClock(msg.clock ?? null);
        this.offers = noOffers();
        this.emit(undone ? 'undo' : 'reset');
        this.#changed();
        return;
      }
      case 'sync-request':
        if (this.mode === 'host') this.#sendState();
        return;
      case 'move': {
        if (msg.ply !== this.match.ply || this.match.turn !== opponent) return this.#resync();
        const m = this.match.move(fromLan(msg.lan));
        if (!m) return this.#resync();
        this.#clearOffers();
        this.#clockAfterMove(opponent, msg.ply, msg.left);
        this.emit('move', m);
        this.#changed();
        return;
      }
      case 'flag':
        if (this.match.over) return;
        this.clock?.stop();
        if (this.clock) this.clock.times[msg.color] = 0;
        this.match.timeout(msg.color);
        this.#changed();
        return;
      case 'resign':
        this.match.resign(opponent);
        this.#changed();
        return;
      case 'draw-offer':
        if (this.match.over) return;
        this.offers.drawReceived = true;
        this.emit('offer', 'draw');
        this.#changed();
        return;
      case 'draw-reply':
        if (!this.offers.drawSent) return;
        this.offers.drawSent = false;
        if (msg.accept) this.match.agreeDraw();
        else this.emit('declined', 'draw');
        this.#changed();
        return;
      case 'undo-offer':
        if (this.match.over || msg.ply !== this.match.ply) return;
        this.offers.undoReceived = msg.ply;
        this.emit('offer', 'undo');
        this.#changed();
        return;
      case 'undo-reply':
        if (!this.offers.undoSent) return;
        this.offers.undoSent = false;
        if (!msg.accept) { this.emit('declined', 'undo'); this.#changed(); }
        else if (this.mode === 'host') this.#applyUndo(this.#undoCount(this.myColor));   // der Gast wartet auf den "state"
        return;
      case 'rematch-offer':
        this.offers.rematchReceived = true;
        this.emit('offer', 'rematch');
        this.#changed();
        return;
      case 'rematch-reply':
        if (!this.offers.rematchSent) return;
        this.offers.rematchSent = false;
        if (!msg.accept) { this.emit('declined', 'rematch'); this.#changed(); }
        else if (this.mode === 'host') this.#newGame();      // der Gast wartet auf den neuen "state"
        return;
      case 'chat':
        this.chat.push({ me: false, text: msg.text.slice(0, 200) });
        this.emit('chat', this.chat.at(-1));
        return;
      case 'emote':
        this.emit('emote', { me: false, e: msg.e });
        return;
      case 'outdated':
        this.emit('outdated');
        return;
      case 'full':
        this.emit('full');
        return;
    }
  }
}
