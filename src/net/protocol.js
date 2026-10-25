// Nachrichten zwischen den beiden Spielern (JSON über den WebRTC-Datenkanal).
// Der Gastgeber ist maßgeblich: bei Abweichungen schickt er den kompletten Stand ("state").
export const PROTOCOL = 1;

const LAN = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const isColor = (c) => c === 'w' || c === 'b';
const isName = (s) => typeof s === 'string' && s.length <= 40;
const isResult = (r) => r === null || (typeof r === 'object' && (r.winner === null || isColor(r.winner)) && typeof r.reason === 'string');

const CHECKS = {
  hello: (m) => m.v === PROTOCOL && isName(m.name),                       // Gast → Gastgeber nach jedem (Wieder-)Verbinden
  state: (m) => Array.isArray(m.moves) && m.moves.every((x) => LAN.test(x)) // Gastgeber → Gast: kompletter Stand
    && isColor(m.hostColor) && isResult(m.result) && Number.isInteger(m.game) && isName(m.name),
  move: (m) => LAN.test(m.lan) && Number.isInteger(m.ply) && Number.isInteger(m.game),
  resign: (m) => Number.isInteger(m.game),
  'draw-offer': (m) => Number.isInteger(m.game),
  'draw-reply': (m) => typeof m.accept === 'boolean' && Number.isInteger(m.game),
  'rematch-offer': (m) => Number.isInteger(m.game),
  'rematch-reply': (m) => typeof m.accept === 'boolean' && Number.isInteger(m.game),
  'sync-request': () => true,
  full: () => true,                                                          // Raum ist schon besetzt
};

export const valid = (m) => !!m && typeof m === 'object' && CHECKS[m.t]?.(m) === true;
