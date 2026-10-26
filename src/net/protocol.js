// Nachrichten zwischen den beiden Spielern (JSON über den WebRTC-Datenkanal).
// Der Gastgeber ist maßgeblich: bei Abweichungen schickt er den kompletten Stand ("state").
export const PROTOCOL = 2;
export const EMOTES = ['👍', '👏', '😂', '😮', '😤', '🙈', '🔥', '🤝'];

const LAN = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const isColor = (c) => c === 'w' || c === 'b';
const isName = (s) => typeof s === 'string' && s.length <= 40;
const isMs = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const isClock = (c) => c === null || (typeof c === 'object' && isMs(c.base) && isMs(c.inc) && isMs(c.times?.w) && isMs(c.times?.b));
const isResult = (r) => r === null || (typeof r === 'object' && (r.winner === null || isColor(r.winner)) && typeof r.reason === 'string');

const CHECKS = {
  hello: (m) => Number.isInteger(m.v) && isName(m.name),                  // Gast → Gastgeber nach jedem (Wieder-)Verbinden
  state: (m) => Array.isArray(m.moves) && m.moves.every((x) => LAN.test(x)) // Gastgeber → Gast: kompletter Stand
    && isColor(m.hostColor) && isResult(m.result) && Number.isInteger(m.game) && isName(m.name) && isClock(m.clock ?? null),
  move: (m) => LAN.test(m.lan) && Number.isInteger(m.ply) && Number.isInteger(m.game) && (m.left === undefined || isMs(m.left)),
  flag: (m) => isColor(m.color) && Number.isInteger(m.game),             // Zeit abgelaufen
  resign: (m) => Number.isInteger(m.game),
  'draw-offer': (m) => Number.isInteger(m.game),
  'draw-reply': (m) => typeof m.accept === 'boolean' && Number.isInteger(m.game),
  'rematch-offer': (m) => Number.isInteger(m.game),
  'rematch-reply': (m) => typeof m.accept === 'boolean' && Number.isInteger(m.game),
  'undo-offer': (m) => Number.isInteger(m.ply) && Number.isInteger(m.game),
  'undo-reply': (m) => typeof m.accept === 'boolean' && Number.isInteger(m.game),
  chat: (m) => typeof m.text === 'string' && m.text.length > 0 && m.text.length <= 300,
  emote: (m) => EMOTES.includes(m.e),
  'sync-request': () => true,
  outdated: () => true,                                                      // Gegenüber hat eine andere Version
  full: () => true,                                                          // Raum ist schon besetzt
};

export const valid = (m) => !!m && typeof m === 'object' && CHECKS[m.t]?.(m) === true;
