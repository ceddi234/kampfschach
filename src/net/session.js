// Eine laufende Partie samt Gegenüber: lokal (beide am selben Gerät), als Gastgeber oder als Gast.
// Die Verbindung (transport) ist austauschbar – im Spiel PeerJS, in den Tests ein Fake.
import { Match, other, toLan, fromLan } from '../game/match.js';
import { PROTOCOL, valid } from './protocol.js';

class Emitter {
  #handlers = {};
  on(event, fn) { (this.#handlers[event] ||= []).push(fn); return this; }
  emit(event, ...args) { for (const fn of this.#handlers[event] || []) fn(...args); }
}

const noOffers = () => ({ drawSent: false, drawReceived: false, rematchSent: false, rematchReceived: false });

export class Session extends Emitter {
  // mode: 'local' | 'host' | 'guest'
  constructor({ mode, transport = null, code = null, myName = 'Spieler', opponentName = null,
                hostColor = 'w', moves = [], result = null, game = 1 }) {
    super();
    this.mode = mode;
    this.code = code;
    this.transport = transport;
    this.hostColor = hostColor;          // Farbe des Gastgebers; der Gast hat die andere
    this.game = game;                    // zählt bei Revanche hoch, damit alte Nachrichten ins Leere laufen
    this.names = { me: myName, opponent: opponentName };
    this.match = new Match(moves, result);
    this.offers = noOffers();
    this.connection = mode === 'local' ? 'connected' : 'connecting';
    if (transport) {
      transport.onMessage((m) => this.#receive(m));
      transport.onStatus((s) => this.#status(s));
    }
  }

  get online() { return this.mode !== 'local'; }
  get connected() { return this.connection === 'connected'; }
  get myColor() { return this.mode === 'local' ? null : this.mode === 'host' ? this.hostColor : other(this.hostColor); }

  // Gehört eine Figur dieser Farbe gerade "mir"? Lokal: immer die Seite am Zug.
  isMine(color) { return this.online ? color === this.myColor : color === this.match.turn; }
  canMove() { return !this.match.over && this.connected && this.isMine(this.match.turn); }

  move({ from, to, promotion }) {
    if (!this.canMove()) return null;
    const ply = this.match.ply;
    const m = this.match.move({ from, to, promotion });
    if (!m) return null;
    this.#clearDrawOffers();
    this.#send({ t: 'move', lan: toLan(m), ply, game: this.game });
    this.emit('move', m);
    this.#changed();
    return m;
  }

  resign() {
    if (this.match.over) return;
    this.match.resign(this.online ? this.myColor : this.match.turn);
    this.#send({ t: 'resign', game: this.game });
    this.#changed();
  }

  offerDraw() {
    if (this.match.over || this.offers.drawSent) return;
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

  snapshot() {
    return { mode: this.mode, code: this.code, hostColor: this.hostColor, game: this.game,
             moves: this.match.moves, result: this.match.result, names: this.names };
  }

  close() { this.transport?.close(); }

  // ---------- intern ----------
  #send(msg) { this.transport?.send(msg); }
  #changed() { this.emit('change'); }
  #clearDrawOffers() { this.offers.drawSent = this.offers.drawReceived = false; }

  #status(s) {
    this.connection = s;
    if (s === 'connected' && this.mode === 'guest') this.#send({ t: 'hello', v: PROTOCOL, name: this.names.me });
    this.emit('status', s);
    this.#changed();
  }

  #sendState() {
    this.#send({ t: 'state', moves: this.match.moves, result: this.match.result, hostColor: this.hostColor,
                 game: this.game, name: this.names.me });
  }

  // nur der Gastgeber startet neue Partien; Farben werden getauscht
  #newGame() {
    if (this.online) this.hostColor = other(this.hostColor);
    this.game += 1;
    this.match = new Match();
    this.offers = noOffers();
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
        this.names.opponent = msg.name.slice(0, 24);
        this.#sendState();
        this.#changed();
        return;
      case 'state':
        if (this.mode !== 'guest') return;
        this.hostColor = msg.hostColor;
        this.game = msg.game;
        this.names.opponent = msg.name.slice(0, 24);
        this.match = new Match(msg.moves, msg.result);
        this.offers = noOffers();
        this.emit('reset');
        this.#changed();
        return;
      case 'sync-request':
        if (this.mode === 'host') this.#sendState();
        return;
      case 'move': {
        if (msg.ply !== this.match.ply || this.match.turn !== opponent) return this.#resync();
        const m = this.match.move(fromLan(msg.lan));
        if (!m) return this.#resync();
        this.#clearDrawOffers();
        this.emit('move', m);
        this.#changed();
        return;
      }
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
      case 'full':
        this.emit('full');
        return;
    }
  }
}
