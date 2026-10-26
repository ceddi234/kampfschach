// Stockfish als Web Worker, angesprochen über das UCI-Textprotokoll.
// Die Engine (≈ 7 MB) wird erst geladen, wenn jemand gegen den Computer spielen will.
const FILE = 'stockfish/stockfish-18-lite-single.js';

// Spielstärke: "Skill Level" macht Stockfish absichtlich ungenau, die Suchtiefe begrenzt den Weitblick
export const LEVELS = [
  { id: 1, name: 'Anfänger', skill: 0, depth: 1 },
  { id: 2, name: 'Hobbyspieler', skill: 3, depth: 3 },
  { id: 3, name: 'Vereinsspieler', skill: 7, depth: 6 },
  { id: 4, name: 'Fortgeschritten', skill: 11, depth: 9 },
  { id: 5, name: 'Experte', skill: 16, depth: 12 },
  { id: 6, name: 'Großmeister', skill: 20, movetime: 1500 },
];
export const levelById = (id) => LEVELS.find((l) => l.id === id) || LEVELS[2];

export class Engine {
  constructor() {
    this.worker = null;
    this.ready = null;
    this.waiters = [];       // warten auf eine Antwortzeile, die mit "until" beginnt
    this.job = 0;            // zählt hoch, wenn eine Suche abgebrochen wird
    this.score = null;       // letzte Bewertung in Centipawns aus Sicht der Engine (Matt = ±10000)
  }

  // Engine laden (mehrfach aufrufbar)
  start() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      this.worker = new Worker(new URL(FILE, document.baseURI));
      this.worker.onmessage = (e) => this.#line(String(e.data));
      this.worker.onerror = reject;
      this.#ask('uci', 'uciok').then(() => this.#ask('isready', 'readyok')).then(resolve);
      setTimeout(() => reject(new Error('Stockfish antwortet nicht')), 30000);   // z. B. sehr alter Browser
    }).catch((e) => {
      this.worker?.terminate();
      this.worker = this.ready = null;
      throw e;
    });
    return this.ready;
  }

  // besten Zug für die Stellung (FEN) in der gewählten Stärke – null, falls abgebrochen
  async bestMove(fen, level) {
    await this.start();
    const job = ++this.job;
    this.worker.postMessage(`setoption name Skill Level value ${level.skill}`);
    this.worker.postMessage(`position fen ${fen}`);
    const line = await this.#ask(level.movetime ? `go movetime ${level.movetime}` : `go depth ${level.depth}`, 'bestmove');
    const move = line.split(' ')[1];
    return job === this.job && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move) ? move : null;
  }

  // laufende Suche abbrechen (ihr Ergebnis wird verworfen)
  cancel() {
    this.job++;
    this.worker?.postMessage('stop');
  }

  newGame() {
    this.cancel();
    this.score = null;
    this.worker?.postMessage('ucinewgame');
  }

  #ask(text, until) {
    return new Promise((resolve) => {
      this.waiters.push({ until, resolve });
      this.worker.postMessage(text);
    });
  }

  #line(l) {
    const s = l.match(/ score (cp|mate) (-?\d+)/);
    if (l.startsWith('info') && s) this.score = s[1] === 'cp' ? +s[2] : Math.sign(+s[2]) * 10000;
    const i = this.waiters.findIndex((w) => l.startsWith(w.until));
    if (i >= 0) this.waiters.splice(i, 1)[0].resolve(l);
  }
}
