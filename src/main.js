// Verdrahtung: Startmenü → Partie (lokal / Gastgeber / Gast) → 3D-Brett + Anzeige.
import './ui/style.css';
import { Board3D, squarePos } from './render/board3d.js';
import { Session } from './net/session.js';
import { createTransport, newCode, cleanCode } from './net/peer.js';
import { Hud } from './ui/hud.js';
import { Match } from './game/match.js';
import { TIME_CONTROLS } from './game/clock.js';
import * as store from './store.js';

let session = null;
let selected = null;           // ausgewähltes Feld
let queue = Promise.resolve(); // Zug-Animationen laufen nacheinander
let pending = 0;               // noch nicht fertig animierte Züge
let gen = 0;                   // zählt hoch, wenn der Stand komplett neu gesetzt wird
let endShown = false;

const board = new Board3D(document.getElementById('stage'), { onSquare: clickSquare, canSelect: selectable });
board.fights = store.loadFights();
const hud = new Hud(document.getElementById('ui'), {
  name: (v) => store.saveName(v),
  localForm: () => hud.localSetup(),
  startLocal: () => { store.clearGame(); attach(new Session({ mode: 'local', clock: timeControl() })); enterGame(); },
  time: (id) => { hud.setTime(id); store.saveTime(id); },
  create: () => hud.create(),
  open: (pref) => openRoom(pref),
  joinForm: () => hud.join({ code: '', name: store.loadName() }),
  join: () => joinRoom(hud.value('code')),
  resume: () => resume(store.loadGame()),
  home: () => goHome(),
  cancel: () => { store.clearGame(); goHome(); },
  copy: () => copyLink(),
  share: () => navigator.share?.({ title: 'Kampfschach', text: 'Spiel eine Partie Schach mit mir!', url: linkFor(session.code) }).catch(() => {}),
  draw: () => session?.offerDraw(),
  undo: () => session?.requestUndo(),
  undoYes: () => session?.answerUndo(true),
  undoNo: () => session?.answerUndo(false),
  tab: (t) => session && hud.showTab(t, session),
  say: () => {
    session?.say(hud.value('say'));
    const input = document.querySelector('[name="say"]');
    if (input) { input.value = ''; input.focus(); }
  },
  emote: (e) => session?.emote(e),
  gear: () => session && hud.toggleGear(session),
  resign: async () => {
    if (await hud.confirm({ title: 'Wirklich aufgeben?', yes: 'Aufgeben', no: 'Weiterspielen' })) session?.resign();
  },
  drawYes: () => session?.answerDraw(true),
  drawNo: () => session?.answerDraw(false),
  rematch: () => session?.offerRematch(),
  rematchYes: () => session?.answerRematch(true),
  rematchNo: () => session?.answerRematch(false),
  result: () => hud.showEnd(session),
  closeModal: () => hud.closeModal(),
  view: () => { board.resetView(); if (session && hud.gearOpen) hud.toggleGear(session); },
  fights: () => {
    board.fights = hud.fights = !board.fights;
    store.saveFights(board.fights);
    hud.toast(board.fights ? 'Kämpfe an – ein Klick aufs Brett überspringt sie' : 'Kämpfe aus');
    if (session) hud.update(session);
  },
  moves: () => session && hud.toggleSide(session),
  menu: () => leave(),
});
hud.fights = board.fights;
hud.timeChoice = store.loadTime();

// gewählte Bedenkzeit als Uhr-Einstellung (null = ohne Uhr)
function timeControl() {
  const t = TIME_CONTROLS.find((x) => x.id === hud.timeChoice);
  return t?.base ? { base: t.base, inc: t.inc } : null;
}

// Uhr: Anzeige auffrischen und merken, wenn die Zeit abläuft
setInterval(() => {
  if (!session) return;
  session.tick();
  hud.updateClocks(session);
}, 200);

const myName = () => store.loadName().trim() || 'Spieler';
const linkFor = (code) => `${location.origin}${location.pathname}#${code}`;

// ---------- Partie starten ----------
function attach(s) {
  session?.close();
  session = s;
  gen++;
  pending = 0;
  selected = null;
  endShown = s.match.over;
  let wasConnected = s.connected;
  s.on('move', queueMove);
  s.on('change', () => {
    if (s !== session) return;
    store.saveGame(s.snapshot());
    hud.update(s);
    marks();
    checkEnd();
  });
  s.on('reset', () => {
    if (s !== session) return;
    gen++;
    pending = 0;
    selected = null;
    endShown = false;
    hud.closeModal();
    setBoard(() => s.match.board());
    if (hud.screen !== 'game') enterGame();
    else orient();
  });
  s.on('status', (st) => {
    if (s !== session) return;
    if (hud.screen === 'waiting') st === 'connected' ? enterGame() : hud.setStatus(st);
    if (hud.screen === 'join' && st !== 'connected') hud.setStatus(st);
    if (hud.screen === 'game' && st === 'connected' && !wasConnected) hud.toast('Verbunden');
    wasConnected = st === 'connected';
  });
  s.on('undo', () => {
    if (s !== session) return;
    gen++;
    pending = 0;
    selected = null;
    setBoard(() => s.match.board());
    hud.toast('Zug zurückgenommen');
  });
  s.on('offer', (kind) => hud.toast({ draw: 'Remis-Angebot', undo: 'Bitte um Zurücknahme', rematch: 'Revanche-Anfrage' }[kind]));
  s.on('declined', (kind) => hud.toast({ draw: 'Remis abgelehnt', undo: 'Zurücknahme abgelehnt', rematch: 'Revanche abgelehnt' }[kind]));
  s.on('chat', (msg) => s === session && hud.onChat(s, msg));
  s.on('emote', ({ me, e }) => s === session && hud.bubble(me ? 'left' : 'right', e));
  s.on('outdated', () => {
    if (hud.screen === 'game') hud.toast('Ihr habt verschiedene Versionen – bitte beide die Seite neu laden.', 6000);
    else hud.setStatus('outdated');
  });
  s.on('full', () => { hud.setStatus('full'); s.close(); session = null; });
  board.sync(s.match.board());
}

function openRoom(pref) {
  const code = newCode();
  const hostColor = pref === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : pref;
  attach(new Session({ mode: 'host', transport: createTransport('host', code), code, hostColor, myName: myName(), clock: timeControl() }));
  store.saveGame(session.snapshot());
  hud.waiting({ code, link: linkFor(code), status: session.connection });
}

function joinRoom(raw) {
  const code = cleanCode(raw);
  if (code.length !== 5) return hud.setStatus('bad-code');
  store.saveName(hud.value('name'));
  attach(new Session({ mode: 'guest', transport: createTransport('guest', code), code, myName: myName() }));
  hud.setStatus(session.connection);   // ins Spiel geht's, sobald der Stand vom Gastgeber da ist ("reset")
}

function resume(g) {
  if (!g) return goHome();
  const opts = { code: g.code, myName: myName(), opponentName: g.names?.opponent, hostColor: g.hostColor, moves: g.moves, result: g.result,
                 game: g.game, clock: g.clock ?? null, timeLog: g.timeLog ?? [] };
  try {
    attach(g.mode === 'local'
      ? new Session({ mode: 'local', ...opts })
      : new Session({ mode: g.mode, transport: createTransport(g.mode, g.code), ...opts }));
  } catch {
    store.clearGame();     // gespeicherter Stand ist kaputt
    return goHome();
  }
  enterGame();
}

const sideInset = () => (innerWidth > 760 ? 200 : 0);
addEventListener('resize', () => hud.screen === 'game' && board.setInset(sideInset()));

function enterGame() {
  hud.game();
  board.setInset(sideInset());
  board.setIdle(false);
  orient();
  board.sync(session.match.board());
  hud.update(session);
  marks();
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

function orient() { board.setOrientation(session.online ? session.myColor : 'w'); }

async function leave() {
  const s = session;
  if (s && !s.match.over && !(await hud.confirm({ title: 'Zurück zum Menü?', text: 'Die Partie bleibt gespeichert – du kannst sie im Menü fortsetzen.', yes: 'Zum Menü', no: 'Weiterspielen' }))) return;
  if (s?.match.over) store.clearGame();
  goHome();
}

function goHome() {
  session?.close();
  session = null;
  gen++;
  pending = 0;
  selected = null;
  hud.closeModal();
  board.setMarks();
  setBoard(() => new Match().board());
  board.setInset(0);
  board.setIdle(true);
  const saved = store.loadGame();
  hud.home({ name: store.loadName(), saved: saved && !saved.result ? saved : null });
}

function copyLink() {
  navigator.clipboard?.writeText(linkFor(session.code)).then(() => hud.toast('Link kopiert'), () => hud.toast('Kopieren ging nicht – Link markieren und kopieren'));
}

// Stand hart setzen: laufende Kämpfe spulen durch, danach noch einmal abgleichen
function setBoard(state) {
  const g = gen;
  board.skip();
  board.sync(state());
  board.whenIdle().then(() => g === gen && board.sync(state()));
}

// ---------- Züge ----------
function queueMove(m) {
  const g = gen;
  pending++;
  queue = queue
    .then(() => g === gen && board.animateMove(m))
    .then(() => {
      if (g !== gen || --pending > 0) return;
      board.sync(session.match.board());
      afterMoves();
    });
}

function afterMoves() {
  const m = session.match;
  marks();
  if (!m.over && m.inCheck()) hud.toast('Schach!');
  if (m.result?.reason === 'checkmate' && !endShown) board.topple(m.kingSquare(m.turn));   // der König fällt
  checkEnd();
}

// Ergebnis-Dialog einmal pro Partie – nach Matt erst, wenn der letzte Zug fertig animiert ist
function checkEnd() {
  if (!session?.match.over || endShown || pending) return;
  endShown = true;
  setTimeout(() => session?.match.over && hud.showEnd(session), session.match.result.reason === 'checkmate' ? 1400 : 500);
}

function marks() {
  if (!session) return;
  const m = session.match;
  board.setMarks({
    selected,
    targets: selected ? m.legalFrom(selected).map((x) => ({ to: x.to, capture: !!x.captured })) : [],
    last: m.lastMove(),
    check: m.inCheck() ? m.kingSquare(m.turn) : null,
  });
  board.lift(pending ? null : selected);
}

function ready() { return session && hud.screen === 'game' && !pending && session.canMove(); }

function selectable(sq) {
  if (!ready()) return false;
  const p = session.match.pieceAt(sq);
  return (p && session.isMine(p.color)) || (!!selected && session.match.legalFrom(selected).some((x) => x.to === sq));
}

function clickSquare(sq) {
  if (!ready()) return;
  const m = session.match, p = m.pieceAt(sq);
  if (selected && selected !== sq) {
    const legal = m.legalFrom(selected).filter((x) => x.to === sq);
    if (legal.length) {
      const from = selected;
      select(null);
      if (legal.some((x) => x.promotion)) hud.askPromotion(m.turn).then((t) => t && session?.move({ from, to: sq, promotion: t }));
      else session.move({ from, to: sq });
      return;
    }
  }
  select(p && session.isMine(p.color) && sq !== selected ? sq : null);
}

function select(sq) {
  selected = sq;
  marks();
}

// nur beim Entwickeln: Zugriff für Klick-Tests im Browser
if (import.meta.env.DEV) window.__ks = {
  board, hud, get session() { return session; }, get state() { return { pending, selected, gen }; },
  screen(sq) {
    const v = squarePos(sq).project(board.camera), r = board.renderer.domElement.getBoundingClientRect();
    return [Math.round(r.left + (v.x + 1) / 2 * r.width), Math.round(r.top + (1 - v.y) / 2 * r.height)];
  },
};

// Einladungslink in einem schon offenen Fenster (nur der #-Teil ändert sich)
addEventListener('hashchange', () => {
  const code = cleanCode(location.hash.slice(1));
  if (code.length === 5 && hud.screen !== 'game') hud.join({ code, name: store.loadName() });
});

// ---------- Start ----------
const hashCode = cleanCode(location.hash.slice(1));
const saved = store.loadGame();
if (hashCode.length === 5) {
  if (saved?.mode === 'guest' && saved.code === hashCode && !saved.result) resume(saved);
  else { board.setIdle(true); hud.join({ code: hashCode, name: store.loadName() }); }
} else goHome();
