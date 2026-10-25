import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { Match, toLan } from '../src/game/match.js';

// SAN-Züge ("e4", "Nf3") in LAN ("e2e4") übersetzen – so lesen sich die Testpartien leichter
const lan = (...san) => { const c = new Chess(); return san.map((s) => toLan(c.move(s))); };

describe('Match', () => {
  it('erkennt Schachmatt (Schäfermatt) und den Gewinner', () => {
    const m = new Match(lan('e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'));
    expect(m.result).toEqual({ winner: 'w', reason: 'checkmate' });
    expect(m.legalFrom('e8')).toEqual([]);
    expect(m.move({ from: 'a7', to: 'a6' })).toBeNull();
  });

  it('erkennt Patt (Sam Loyds 10-Züge-Patt)', () => {
    const m = new Match(lan('e3', 'a5', 'Qh5', 'Ra6', 'Qxa5', 'h5', 'h4', 'Rah6', 'Qxc7', 'f6', 'Qxd7+', 'Kf7',
                           'Qxb7', 'Qd3', 'Qxb8', 'Qh7', 'Qxc8', 'Kg6', 'Qe6'));
    expect(m.result).toEqual({ winner: null, reason: 'stalemate' });
  });

  it('erkennt dreifache Stellungswiederholung', () => {
    const m = new Match(lan('Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'));
    expect(m.result?.reason).toBe('repetition');
  });

  it('lehnt unerlaubte Züge ab und lässt erlaubte zu', () => {
    const m = new Match();
    expect(m.move({ from: 'e2', to: 'e5' })).toBeNull();
    expect(m.move({ from: 'e7', to: 'e5' })).toBeNull();          // Schwarz ist nicht am Zug
    expect(m.move({ from: 'e2', to: 'e4' })?.san).toBe('e4');
    expect(m.turn).toBe('b');
    expect(m.ply).toBe(1);
  });

  it('beherrscht Rochade, en passant und Umwandlung', () => {
    const castle = new Match(lan('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'));
    expect(castle.move({ from: 'e1', to: 'g1' })?.flags).toContain('k');
    expect(castle.pieceAt('f1')).toEqual({ type: 'r', color: 'w' });

    const ep = new Match(lan('e4', 'a6', 'e5', 'd5'));
    const epMove = ep.move({ from: 'e5', to: 'd6' });
    expect(epMove?.flags).toContain('e');
    expect(ep.pieceAt('d5')).toBeNull();

    const promo = new Match(lan('h4', 'g5', 'hxg5', 'Nf6', 'g6', 'Ng8', 'gxh7', 'Nc6'));
    expect(promo.legalFrom('h7').some((x) => x.to === 'g8' && x.promotion)).toBe(true);
    expect(promo.move({ from: 'h7', to: 'g8' })).toBeNull();     // ohne Figurwahl geht's nicht
    expect(promo.move({ from: 'h7', to: 'g8', promotion: 'n' })?.san).toBe('hxg8=N');
    expect(promo.pieceAt('g8')).toEqual({ type: 'n', color: 'w' });
  });

  it('stellt eine Partie aus der Zugliste wieder her', () => {
    const moves = lan('d4', 'd5', 'c4', 'e6', 'Nc3');
    const m = new Match(moves);
    expect(m.moves).toEqual(moves);
    expect(m.san.at(-1)).toBe('Nc3');
    expect(m.lastMove().to).toBe('c3');
  });

  it('kennt Aufgabe und vereinbartes Remis', () => {
    const a = new Match();
    a.resign('w');
    expect(a.result).toEqual({ winner: 'b', reason: 'resign' });
    const b = new Match();
    b.agreeDraw();
    expect(b.result).toEqual({ winner: null, reason: 'agreement' });
    b.resign('b');                                                 // nach Spielende ändert sich nichts mehr
    expect(b.result.reason).toBe('agreement');
  });

  it('findet den König', () => {
    expect(new Match().kingSquare('b')).toBe('e8');
  });
});
