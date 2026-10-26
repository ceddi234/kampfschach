// Alles Sichtbare außer dem 3D-Brett: Startmenü, Spielanzeige, Dialoge und kurze Hinweise.
// Buttons tragen data-act="<aktion>" (+ optional data-arg); die Aktionen kommen aus main.js.
import { COLOR_NAME, RESULT_TEXT, other } from '../game/match.js';

const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START = { q: 1, r: 2, b: 2, n: 2, p: 8 };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Zugliste mit deutschen Figurenkürzeln: D(ame), T(urm), L(äufer), S(pringer)
const german = (san) => san.replace(/[QRBN]/g, (c) => ({ Q: 'D', R: 'T', B: 'L', N: 'S' })[c]);
const glyph = (type, color) => `<span class="glyph ${color}">${GLYPH[type]}︎</span>`;

export const STATUS_TEXT = {
  connecting: 'Verbinde mit dem Server …',
  waiting: 'Warte auf deinen Gegner …',
  connected: 'Verbunden',
  reconnecting: 'Verbindung unterbrochen – verbinde neu …',
  'host-offline': 'Raum nicht gefunden – ist dein Gegner noch online?',
  offline: 'Keine Verbindung zum Server – prüf dein Internet',
  full: 'Der Raum ist schon besetzt.',
  'bad-code': 'Der Code hat 5 Zeichen.',
};

// Material auf dem Brett zählen: was fehlt einer Seite, und wer steht wie viel besser?
function material(board) {
  const count = { w: { q: 0, r: 0, b: 0, n: 0, p: 0, k: 0 }, b: { q: 0, r: 0, b: 0, n: 0, p: 0, k: 0 } }, score = { w: 0, b: 0 };
  for (const row of board) for (const p of row) if (p) { count[p.color][p.type]++; score[p.color] += VALUE[p.type]; }
  const lost = (c) => Object.entries(START).flatMap(([t, n]) => Array(Math.max(0, n - count[c][t])).fill(t));
  return { lost: { w: lost('w'), b: lost('b') }, diff: score.w - score.b };
}

export class Hud {
  constructor(root, actions) {
    this.actions = actions;
    this.screen = null;
    this.sideOpen = false;
    root.innerHTML = '<div id="screen"></div><div id="overlay"></div><div id="toast" class="toast"></div>';
    this.el = { screen: root.querySelector('#screen'), overlay: root.querySelector('#overlay'), toast: root.querySelector('#toast') };
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b && !b.disabled) actions[b.dataset.act]?.(b.dataset.arg);
    });
    root.addEventListener('submit', (e) => {
      e.preventDefault();
      actions[e.target.dataset.submit]?.();
    });
    root.addEventListener('input', (e) => { if (e.target.name === 'name') actions.name?.(e.target.value); });
  }

  value(name) { return this.el.screen.querySelector(`[name="${name}"]`)?.value ?? ''; }

  #show(screen, html) {
    this.screen = screen;
    this.el.screen.innerHTML = html;
    this.el.screen.querySelector('[autofocus]')?.focus();
  }

  // ---------- Startmenü ----------
  home({ name, saved }) {
    const resume = saved ? `
      <button class="resume" data-act="resume">
        <b>Partie fortsetzen</b>
        <span>${saved.mode === 'local' ? 'Am selben Gerät' : `Online gegen ${esc(saved.names?.opponent || 'deinen Gegner')}`} · ${Math.ceil(saved.moves.length / 2)} Züge</span>
      </button>` : '';
    this.#show('home', `
      <section class="card lobby">
        <h1>Kampfschach</h1>
        <p class="tag">Schach in 3D – zu zweit, online oder am selben Gerät.</p>
        <label class="field"><span>Dein Name</span><input name="name" value="${esc(name)}" maxlength="24" placeholder="z. B. Cedrik" autocomplete="nickname"></label>
        ${resume}
        <button class="btn primary" data-act="create">Online-Spiel erstellen</button>
        <button class="btn" data-act="joinForm">Mit Code beitreten</button>
        <button class="btn" data-act="local">Am selben Gerät spielen</button>
        <p class="fine">Version 0.2 · beim Schlagen erwachen die Figuren – ein Klick aufs Brett überspringt den Kampf</p>
      </section>`);
  }

  create() {
    this.#show('create', `
      <section class="card lobby">
        <h2>Neues Online-Spiel</h2>
        <p class="tag">Welche Farbe willst du spielen?</p>
        <div class="choice">
          <button class="btn" data-act="open" data-arg="w">${glyph('k', 'w')} Weiß</button>
          <button class="btn" data-act="open" data-arg="random">🎲 Zufall</button>
          <button class="btn" data-act="open" data-arg="b">${glyph('k', 'b')} Schwarz</button>
        </div>
        <button class="btn ghost" data-act="home">Zurück</button>
      </section>`);
  }

  waiting({ code, link, status }) {
    this.#show('waiting', `
      <section class="card lobby">
        <h2>Raum ist offen</h2>
        <div class="code">${esc(code)}</div>
        <p class="tag">Schick deinem Gegner diesen Link – er landet direkt im Spiel:</p>
        <div class="link"><input readonly value="${esc(link)}" onfocus="this.select()"><button class="btn" data-act="copy">Kopieren</button></div>
        ${navigator.share ? '<button class="btn" data-act="share">Teilen …</button>' : ''}
        <p class="status" id="status"></p>
        <button class="btn ghost" data-act="cancel">Abbrechen</button>
      </section>`);
    this.setStatus(status);
  }

  join({ code, name }) {
    this.#show('join', `
      <form class="card lobby" data-submit="join">
        <h2>Spiel beitreten</h2>
        <label class="field"><span>Code</span><input name="code" class="mono" value="${esc(code)}" maxlength="6" placeholder="K7F2P" autocomplete="off" autocapitalize="characters" ${code ? '' : 'autofocus'}></label>
        <label class="field"><span>Dein Name</span><input name="name" value="${esc(name)}" maxlength="24" placeholder="z. B. Max" autocomplete="nickname" ${code ? 'autofocus' : ''}></label>
        <button class="btn primary" type="submit">Beitreten</button>
        <p class="status" id="status"></p>
        <button class="btn ghost" type="button" data-act="home">Zurück</button>
      </form>`);
  }

  setStatus(key) {
    const el = this.el.screen.querySelector('#status');
    if (!el) return;
    el.textContent = STATUS_TEXT[key] || key || '';
    el.dataset.state = key || '';
  }

  // ---------- Spiel ----------
  game() {
    this.#show('game', '<div class="hud" id="hud"></div>');
  }

  update(s) {
    if (this.screen !== 'game') return;
    const m = s.match, over = m.over, mat = material(m.board());
    const nameOf = (c) => !s.online ? COLOR_NAME[c] : c === s.myColor ? `${esc(s.names.me)} <i>(du)</i>` : esc(s.names.opponent || 'Gegner');
    const left = s.online ? s.myColor : 'w', right = other(left);
    const player = (c, side) => {
      const adv = c === 'w' ? mat.diff : -mat.diff;
      return `
        <div class="player ${side} ${!over && m.turn === c ? 'active' : ''}">
          <div class="who"><span class="dot ${c}"></span>${nameOf(c)}${s.online ? ` <small>${COLOR_NAME[c]}</small>` : ''}</div>
          <div class="caps">${mat.lost[other(c)].map((t) => glyph(t, other(c))).join('')}${adv > 0 ? `<em>+${adv}</em>` : ''}</div>
        </div>`;
    };

    let line;
    if (over) line = this.#resultLine(s);
    else if (m.inCheck()) line = '<b class="warn">Schach!</b>';
    else if (!s.online) line = `${COLOR_NAME[m.turn]} ist am Zug`;
    else line = m.turn === s.myColor ? '<b>Du bist am Zug</b>' : `${esc(s.names.opponent || 'Gegner')} ist am Zug`;

    const conn = s.online && !s.connected
      ? `<div class="conn">${STATUS_TEXT[s.connection] || s.connection}${s.mode === 'host' && s.connection === 'waiting' ? ` · Code <b class="mono">${esc(s.code)}</b> <button class="mini" data-act="copy">Link kopieren</button>` : ''}</div>`
      : '';

    let banner = '';
    if (s.offers.drawReceived) banner = this.#banner(`${esc(s.names.opponent || 'Dein Gegner')} bietet Remis an.`, 'drawYes', 'drawNo');
    else if (s.offers.rematchReceived) banner = this.#banner(`${esc(s.names.opponent || 'Dein Gegner')} möchte eine Revanche.`, 'rematchYes', 'rematchNo');

    const san = m.san.map(german);
    let rows = '';
    for (let i = 0; i < san.length; i += 2) rows += `<li><span class="n">${i / 2 + 1}.</span><span>${san[i]}</span><span>${san[i + 1] || ''}</span></li>`;

    const actions = over
      ? `<button class="btn primary" data-act="rematch" ${s.offers.rematchSent ? 'disabled' : ''}>${s.offers.rematchSent ? 'Revanche angefragt …' : 'Revanche'}</button>
         <button class="btn" data-act="result">Ergebnis</button>`
      : `<button class="btn" data-act="draw" title="Remis anbieten" ${s.offers.drawSent || (s.online && !s.connected) ? 'disabled' : ''}>${s.offers.drawSent ? 'Remis …' : 'Remis'}</button>
         <button class="btn" data-act="resign">Aufgeben</button>`;

    this.el.screen.querySelector('#hud').innerHTML = `
      <header class="bar">${player(left, 'left')}${player(right, 'right')}</header>
      <div class="line">${line}</div>
      ${conn}
      ${banner}
      <aside class="side ${this.sideOpen ? 'open' : ''}">
        <h3>Züge</h3>
        <ol class="moves">${rows || '<li class="empty">noch keine</li>'}</ol>
      </aside>
      <nav class="actions">
        ${actions}
        <button class="btn" data-act="fights" title="Kampf-Animationen beim Schlagen an/aus">⚔︎ ${this.fights ? 'an' : 'aus'}</button>
        <button class="btn" data-act="view" title="Blick zurücksetzen">Ansicht</button>
        <button class="btn only-small" data-act="moves">Züge</button>
        <button class="btn" data-act="menu">Menü</button>
      </nav>`;
    const list = this.el.screen.querySelector('.moves');
    list.scrollTop = list.scrollHeight;
    if (this.modal === 'end') this.showEnd(s);
  }

  toggleSide() {
    this.sideOpen = !this.sideOpen;
    this.el.screen.querySelector('.side')?.classList.toggle('open', this.sideOpen);
  }

  #banner(text, yes, no) {
    return `<div class="banner"><span>${text}</span><button class="btn primary" data-act="${yes}">Annehmen</button><button class="btn" data-act="${no}">Ablehnen</button></div>`;
  }

  #resultLine(s) {
    const r = s.match.result;
    if (!r.winner) return `<b>Remis</b> · ${RESULT_TEXT[r.reason]}`;
    const who = s.online ? (r.winner === s.myColor ? 'Du gewinnst' : `${esc(s.names.opponent || 'Gegner')} gewinnt`) : `${COLOR_NAME[r.winner]} gewinnt`;
    return `<b>${who}</b> · ${RESULT_TEXT[r.reason]}`;
  }

  // ---------- Dialoge ----------
  #modal(kind, html, onBackdrop) {
    this.modal = kind;
    this.el.overlay.innerHTML = `<div class="backdrop"><div class="card modal">${html}</div></div>`;
    const bd = this.el.overlay.firstElementChild;
    bd.addEventListener('click', (e) => { if (e.target === bd) onBackdrop?.(); });
    return bd;
  }

  closeModal() {
    this.modal = null;
    this.el.overlay.innerHTML = '';
  }

  askPromotion(color) {
    return new Promise((resolve) => {
      const done = (v) => { this.closeModal(); resolve(v); };
      const bd = this.#modal('promo', `
        <h2>Umwandlung</h2>
        <p class="tag">Zu welcher Figur wird dein Bauer?</p>
        <div class="promo">${['q', 'r', 'b', 'n'].map((t) => `<button class="btn" data-pick="${t}">${glyph(t, color)}</button>`).join('')}</div>`, () => done(null));
      bd.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => done(b.dataset.pick)));
    });
  }

  confirm({ title, text, yes, no = 'Abbrechen' }) {
    return new Promise((resolve) => {
      const done = (v) => { this.closeModal(); resolve(v); };
      const bd = this.#modal('confirm', `
        <h2>${title}</h2>${text ? `<p class="tag">${text}</p>` : ''}
        <div class="row"><button class="btn primary" data-yes>${yes}</button><button class="btn" data-no>${no}</button></div>`, () => done(false));
      bd.querySelector('[data-yes]').addEventListener('click', () => done(true));
      bd.querySelector('[data-no]').addEventListener('click', () => done(false));
    });
  }

  showEnd(s) {
    const r = s.match.result;
    if (!r) return this.closeModal();
    let title = 'Remis';
    if (r.winner) title = !s.online ? `${COLOR_NAME[r.winner]} gewinnt` : r.winner === s.myColor ? 'Gewonnen!' : 'Verloren';
    let why = RESULT_TEXT[r.reason];
    if (r.reason === 'resign') why = !s.online ? `${COLOR_NAME[other(r.winner)]} hat aufgegeben` : r.winner === s.myColor ? `${esc(s.names.opponent || 'Dein Gegner')} hat aufgegeben` : 'Du hast aufgegeben';
    this.#modal('end', `
      <h2 class="big">${title}</h2>
      <p class="tag">${why}</p>
      <div class="col">
        <button class="btn primary" data-act="rematch" ${s.offers.rematchSent ? 'disabled' : ''}>${s.offers.rematchSent ? 'Revanche angefragt …' : 'Revanche'}</button>
        ${s.offers.rematchReceived ? '<button class="btn primary" data-act="rematchYes">Revanche annehmen</button>' : ''}
        <button class="btn" data-act="closeModal">Brett ansehen</button>
        <button class="btn ghost" data-act="menu">Menü</button>
      </div>`, () => this.closeModal());
  }

  toast(text, ms = 2200) {
    const t = this.el.toast;
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }
}
