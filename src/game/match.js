// Eine Partie. Alle Schachregeln (Rochade, en passant, Umwandlung, Matt, Patt, Remis) kommen aus chess.js –
// hier kommen nur Ergebnis, Aufgabe und vereinbartes Remis dazu.
import { Chess } from 'chess.js';

export const other = (c) => (c === 'w' ? 'b' : 'w');
export const toLan = (m) => m.from + m.to + (m.promotion || '');
export const fromLan = (lan) => ({ from: lan.slice(0, 2), to: lan.slice(2, 4), promotion: lan[4] });

export const COLOR_NAME = { w: 'Weiß', b: 'Schwarz' };
export const RESULT_TEXT = {
  checkmate: 'Schachmatt',
  stalemate: 'Patt',
  insufficient: 'Zu wenig Material',
  repetition: 'Dreifache Stellungswiederholung',
  fifty: '50-Züge-Regel',
  resign: 'Aufgabe',
  agreement: 'Remis vereinbart',
  timeout: 'Zeit abgelaufen',
  'timeout-draw': 'Zeit abgelaufen – der Gegner kann nicht mehr mattsetzen',
};

export class Match {
  constructor(moves = [], result = null) {
    this.chess = new Chess();
    for (const lan of moves) this.chess.move(fromLan(lan));   // wirft bei kaputtem Spielstand
    this.result = result || this.#detectEnd();
  }

  get turn() { return this.chess.turn(); }
  get ply() { return this.chess.history().length; }
  get over() { return this.result !== null; }
  get moves() { return this.chess.history({ verbose: true }).map(toLan); }
  get san() { return this.chess.history(); }

  board() { return this.chess.board(); }
  pieceAt(square) { return this.chess.get(square) || null; }
  inCheck() { return this.chess.inCheck(); }
  lastMove() { return this.chess.history({ verbose: true }).at(-1) || null; }
  legalFrom(square) { return this.over ? [] : this.chess.moves({ square, verbose: true }); }

  kingSquare(color) {
    for (const row of this.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
    return null;
  }

  // gibt den chess.js-Zug zurück oder null, wenn er nicht erlaubt ist
  move({ from, to, promotion }) {
    if (this.over) return null;
    let m;
    try { m = this.chess.move({ from, to, promotion }); } catch { return null; }
    this.result = this.#detectEnd();
    return m;
  }

  resign(color) { if (!this.over) this.result = { winner: other(color), reason: 'resign' }; }
  agreeDraw() { if (!this.over) this.result = { winner: null, reason: 'agreement' }; }

  // Zeit abgelaufen: verloren – außer der Gegner hat nichts mehr, womit er mattsetzen könnte (dann Remis)
  timeout(color) {
    if (this.over) return;
    this.result = this.#canMate(other(color)) ? { winner: other(color), reason: 'timeout' } : { winner: null, reason: 'timeout-draw' };
  }

  // n Halbzüge zurücknehmen
  undo(n = 1) {
    for (let i = 0; i < n; i++) if (!this.chess.undo()) break;
    this.result = this.#detectEnd();
  }

  #canMate(color) {
    let minor = 0;
    for (const row of this.board()) for (const p of row) {
      if (!p || p.color !== color) continue;
      if ('pqr'.includes(p.type)) return true;
      if ('bn'.includes(p.type)) minor++;
    }
    return minor >= 2;
  }

  #detectEnd() {
    const c = this.chess;
    if (c.isCheckmate()) return { winner: other(c.turn()), reason: 'checkmate' };
    if (c.isStalemate()) return { winner: null, reason: 'stalemate' };
    if (c.isInsufficientMaterial()) return { winner: null, reason: 'insufficient' };
    if (c.isThreefoldRepetition()) return { winner: null, reason: 'repetition' };
    if (c.isDrawByFiftyMoves()) return { winner: null, reason: 'fifty' };
    return null;
  }
}
