// 3D-Brett: Szene, Kamera, Figuren, Zug-Animationen, Kämpfe, Markierungen und Klick-Erkennung.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { MAT, figurine } from './pieces.js';
import { FX } from './fx.js';
import { duel } from './duel.js';
import { sample } from './clips.js';
import { V3, hdr, ease, easeBack } from './util.js';
import { canvasTexture, radial } from './textures.js';

const FILES = 'abcdefgh';
export const squarePos = (sq, y = 0) => V3(FILES.indexOf(sq[0]) - 3.5, y, 4.5 - +sq[1]);
const squareAt = (x, z) => {
  const f = Math.floor(x + 4), r = Math.floor(4 - z) + 1;
  return f >= 0 && f < 8 && r >= 1 && r <= 8 ? FILES[f] + r : null;
};
const POLAR = 0.83;   // Kamera-Neigung (Radiant von der Senkrechten); im Hochformat steiler
const bounce = (k) => (k < 0.7 ? Math.pow(k / 0.7, 2) : 1 - Math.sin((k - 0.7) / 0.3 * Math.PI) * 0.08);

// Markierungen: flach aufs Brett gelegt, teils über 1 hell → leuchten durch den Bloom
const flat = (geo) => geo.rotateX(-Math.PI / 2);
const MARK_GEO = { tile: flat(new THREE.PlaneGeometry(1, 1)), dot: flat(new THREE.CircleGeometry(0.13, 20)), ring: flat(new THREE.RingGeometry(0.37, 0.46, 36)) };
const markMat = (color, opacity, extra = {}) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, ...extra });
const MARK_MAT = {
  last: markMat(0xffc45e, 0.2),
  selected: markMat(0xffc45e, 0.42),
  dot: markMat(hdr(0xffc45e, 2.2), 0.95),
  ring: markMat(hdr(0xffc45e, 1.6), 0.9),
  check: markMat(hdr(0xff3b30, 2.2), 1, { map: radial([[0, 'rgba(255,255,255,1)'], [0.6, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]), blending: THREE.AdditiveBlending }),
};

export class Board3D {
  constructor(container, { onSquare, canSelect }) {
    this.container = container;
    this.onSquare = onSquare;
    this.canSelect = canSelect;
    this.pieces = new Map();      // Feld → Figur
    this.tweens = [];
    this.time = 0;                // eigene Uhr in Sekunden – läuft im Bild-Takt, im Labor von Hand
    this.manual = false;
    this.fast = false;            // überspringen: jeder Tween springt sofort ans Ende
    this.fights = true;           // Schlagzüge als Kampf zeigen
    this.busy = 0;                // laufende Kämpfe
    this.sound = null;            // Mischpult (audio/sound.js), setzt main.js
    this.idle = [];               // wartet auf das Ende aller Kämpfe (whenIdle)
    this.cinematic = false;
    this.lifted = null;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.plane = new THREE.Plane(V3(0, 1, 0), 0);
    this.#setupRenderer();
    this.#setupScene();
    this.#buildBoard();
    this.#setupCamera();
    this.#setupPointer();
    this.fx = new FX(this);
    new ResizeObserver(() => this.#resize()).observe(container);
    this.#resize();
    this.renderer.setAnimationLoop((t) => this.#frame(t));
  }

  // ---------- öffentlich ----------
  // Figuren ohne Animation auf den Stand von chess.js board() bringen
  sync(board) {
    const want = new Map();
    for (const row of board) for (const p of row) if (p) want.set(p.square, p);
    for (const [sq, g] of this.pieces) {
      const p = want.get(sq);
      if (!p || p.type !== g.userData.type || p.color !== g.userData.color) { this.root.remove(g); this.pieces.delete(sq); }
    }
    for (const [sq, p] of want) if (!this.pieces.has(sq)) this.#place(figurine(p.type, p.color), sq);
    for (const [sq, g] of this.pieces) {
      g.position.copy(squarePos(sq));
      g.scale.setScalar(1);
      g.rotation.set(0, g.userData.yaw, 0);
      g.visible = true;
    }
    this.lifted = null;
  }

  // einen chess.js-Zug animieren (inkl. Kampf beim Schlagen, Rochade, en passant, Umwandlung)
  animateMove(m) {
    this.#drop();
    const g = this.pieces.get(m.from);
    if (!g) return Promise.resolve();
    const capSq = m.flags.includes('e') ? m.to[0] + m.from[1] : m.to;
    const victim = m.captured ? this.pieces.get(capSq) : null;
    this.pieces.delete(m.from);
    if (victim) this.pieces.delete(capSq);
    this.#move(g, m.to);
    const promote = () => m.promotion && this.#promote(m.to, m.promotion, m.color);
    if (victim && this.fights) {
      this.busy++;
      this.sound?.intensity(true);
      return duel(this, m, g, victim, squarePos(m.to)).finally(() => {
        if (--this.busy) return;
        this.fast = false;
        this.sound?.intensity(false);
        this.idle.splice(0).forEach((resolve) => resolve());
      }).then(promote);
    }
    const jump = m.piece === 'n', dur = this.#duration(m.from, m.to, jump);
    const jobs = [this.slideTo(g, squarePos(m.from), squarePos(m.to), jump, dur)];
    if (jump) this.sfx('whoosh');
    this.sfx('move', dur * 0.92);
    if (victim) jobs.push(this.#sink(victim, dur * 0.7));
    if (m.flags.includes('k') || m.flags.includes('q')) {
      const [rf, rt] = m.flags.includes('k') ? ['h', 'f'] : ['a', 'd'], from = rf + m.from[1], to = rt + m.from[1];
      const rook = this.pieces.get(from);
      if (rook) {
        this.pieces.delete(from);
        this.#move(rook, to);
        const rd = this.#duration(from, to, false);
        jobs.push(this.slideTo(rook, squarePos(from), squarePos(to), false, rd, 0.12));
        this.sfx('move', 0.12 + rd * 0.92);
      }
    }
    return Promise.all(jobs).then(promote);
  }

  // Schachmatt: der König kippt um
  topple(sq) {
    const g = this.pieces.get(sq);
    if (!g) return Promise.resolve();
    const yaw = g.rotation.y, base = g.position.clone(), r = 0.34, tilt = 1.42;
    this.fx.burst(base.clone().add(V3(0, 0.15, 0)), g.userData.color, { n: 30, speed: 0.7, delay: 0.75 });
    this.sfx('topple', 0.62);
    return this.tween(1.0, (k) => {
      const a = tilt * bounce(k);
      // um die Sockelkante drehen, damit die Figur nicht ins Brett sinkt
      const off = V3(r - r * Math.cos(a), r * Math.sin(a), 0).applyAxisAngle(V3(0, 1, 0), yaw);
      g.rotation.set(0, yaw, -a);
      g.position.copy(base).add(off);
    });
  }

  // alle laufenden Animationen sofort beenden (z. B. wenn ein neuer Stand vom Gastgeber kommt)
  finishAll() {
    const running = this.tweens;
    this.tweens = [];
    for (const t of running) { t.fn(1); t.resolve(); }
  }

  // Kampf überspringen: laufende Kämpfe spulen sofort bis zum Ende durch
  skip() {
    this.fast = this.busy > 0;
    this.finishAll();
  }

  // erfüllt sich, sobald kein Kampf mehr läuft
  whenIdle() {
    return this.busy ? new Promise((resolve) => this.idle.push(resolve)) : Promise.resolve();
  }

  setMarks({ selected = null, targets = [], last = null, check = null } = {}) {
    this.marks.clear();
    const add = (geo, mat, sq, y) => { const m = new THREE.Mesh(MARK_GEO[geo], mat); m.position.copy(squarePos(sq, y)); m.renderOrder = 2; this.marks.add(m); };
    if (last) { add('tile', MARK_MAT.last, last.from, 0.003); add('tile', MARK_MAT.last, last.to, 0.003); }
    if (selected) add('tile', MARK_MAT.selected, selected, 0.004);
    if (check) add('tile', MARK_MAT.check, check, 0.005);
    for (const t of targets) t.capture ? add('ring', MARK_MAT.ring, t.to, 0.006) : add('dot', MARK_MAT.dot, t.to, 0.006);
  }

  // ausgewählte Figur leicht anheben (wippt im Takt)
  lift(square) {
    this.#drop();
    this.lifted = (square && this.pieces.get(square)) || null;
  }

  setOrientation(color, animate = true) {
    this.viewColor = color;
    this.resetView(animate);
  }

  resetView(animate = true) {
    // kaputte Kamera (z. B. NaN) nicht weiterschleppen, sondern neu ansetzen
    if (!Number.isFinite(this.camera.position.length()) || this.camera.position.distanceTo(this.controls.target) < 0.01) this.camera.position.set(0, 8, 9);
    const target = this.viewColor === 'b' ? Math.PI : 0;
    const from = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
    const dTheta = ((target - from.theta) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;   // kürzester Weg
    const to = { phi: this.polar, radius: this.distance };
    const apply = (k) => {
      const e = ease(k);
      const s = new THREE.Spherical(from.radius + (to.radius - from.radius) * e, from.phi + (to.phi - from.phi) * e, from.theta + dTheta * e);
      this.camera.position.setFromSpherical(s).add(this.controls.target);
      this.camera.lookAt(this.controls.target);
    };
    if (animate) return this.tween(0.9, apply);
    apply(1);
    return Promise.resolve();
  }

  // Startmenü: Brett dreht sich langsam
  setIdle(on) { this.controls.autoRotate = on; }

  // rechts verdeckter Rand in Pixeln (Zugliste) – das Brett rückt entsprechend nach links
  setInset(right) {
    this.inset = right;
    this.#resize();
  }

  // ---------- Bausteine für Kämpfe und Effekte ----------
  tween(dur, fn, delay = 0) {
    if (this.fast) { fn(1); return Promise.resolve(); }
    return new Promise((resolve) => this.tweens.push({ start: this.time + delay, dur: Math.max(dur, 1e-4), fn, resolve }));
  }

  at(delay, fn) { return this.tween(1e-4, (k) => k >= 1 && fn(), delay); }

  // Clip abspielen (dur > clip.dur hält die letzte Pose, speed > 1 spielt schneller)
  play(rig, clip, { dur = clip.dur, speed = 1 } = {}) { return this.tween(dur / speed, (k) => rig.pose(sample(clip, k * dur))); }

  // Klang abspielen – beim Überspringen bleibt es still
  sfx(name, delay = 0) {
    if (!this.sound || this.fast) return;
    if (delay > 0) this.at(delay, () => !this.fast && this.sound.play(name));
    else this.sound.play(name);
  }

  slideTo(g, a, b, jump, dur = jump ? 0.6 : 0.25 + a.distanceTo(b) * 0.07, delay = 0) {
    const h = jump ? 0.9 : Math.min(0.12 + a.distanceTo(b) * 0.03, 0.3);
    return this.tween(dur, (k) => {
      const e = ease(k);
      g.position.lerpVectors(a, b, e);
      g.position.y = Math.sin(Math.PI * e) * h;
    }, delay);
  }

  // Kamerafahrt seitlich an den Kampf heran …
  cinemaIn(a, b) {
    this.saved = this.camera.position.clone();
    const mid = a.clone().add(b).multiplyScalar(0.5).setY(0.45);
    const dir = b.clone().sub(a).setY(0).normalize(), side = V3(-dir.z, 0, dir.x);
    if (side.dot(this.camera.position.clone().sub(mid)) < 0) side.negate();   // auf der Seite bleiben, von der man schaut
    const span = a.distanceTo(b);
    const pos = mid.clone().addScaledVector(side, 2.6 + span * 0.7).addScaledVector(dir, -0.5).setY(1.6 + span * 0.25);
    this.cinematic = true;
    this.controls.enabled = false;
    this.fill.position.copy(pos).lerp(mid, 0.25).add(V3(0, 0.6, 0));
    this.tween(0.7, (k) => { this.fill.intensity = 3.5 * k; });
    return this.#camTo(pos, mid, 0.7);
  }

  // … und zurück zur Spielansicht
  async cinemaOut() {
    if (!this.saved) return;
    this.tween(0.7, (k) => { this.fill.intensity = 3.5 * (1 - k); });
    await this.#camTo(this.saved, this.controls.target.clone(), 0.7);
    this.saved = this.look = null;
    this.cinematic = false;
    this.controls.enabled = true;
    this.controls.update();
  }

  #camTo(pos, look, dur) {
    const p0 = this.camera.position.clone(), l0 = this.look ? this.look.clone() : this.controls.target.clone();
    return this.tween(dur, (k) => {
      const e = ease(k);
      this.camera.position.lerpVectors(p0, pos, e);
      this.look = l0.clone().lerp(look, e);
      this.camera.lookAt(this.look);
    });
  }

  // Uhr weiterdrehen, Tweens ausführen, Bild rendern (im Labor von Hand aufgerufen)
  advance(dt) {
    this.time += dt;
    for (const t of [...this.tweens]) {
      if (this.time < t.start) continue;
      const k = Math.min(1, (this.time - t.start) / t.dur);
      t.fn(k);
      if (k >= 1) { this.tweens.splice(this.tweens.indexOf(t), 1); t.resolve(); }
    }
    if (this.lifted) this.lifted.position.y = 0.12 + Math.sin(this.time * 3.8) * 0.03;
    if (!this.cinematic) this.controls.update();
    this.composer.render();
  }

  // ---------- Aufbau ----------
  #setupRenderer() {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.9;
    this.container.appendChild(r.domElement);
  }

  #setupScene() {
    const s = this.scene = new THREE.Scene();
    const bg = new THREE.Color(0x0c0a10);
    s.background = bg;
    s.fog = new THREE.Fog(bg, 16, 34);
    s.environment = new THREE.PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.2;
    s.add(new THREE.HemisphereLight(0xaab6ff, 0x2a1d16, 0.45));
    const key = new THREE.DirectionalLight(0xffe0b5, 1.7);
    key.position.set(-4, 9, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 25 });
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    s.add(key);
    const rim = new THREE.DirectionalLight(0x8fa6ff, 1.0);
    rim.position.set(5, 4, -6);
    s.add(rim);
    // Aufhelllicht für die Kamerafahrt (sonst verschwinden schwarze Figuren im Dunkeln); ist immer da, nur meist aus
    this.fill = new THREE.PointLight(0xfff1dc, 0, 12, 1);
    s.add(this.fill);
    this.root = new THREE.Group();      // nur Figuren (für die Klick-Erkennung)
    this.marks = new THREE.Group();
    s.add(this.root, this.marks);
  }

  #buildBoard() {
    const add = (geo, mat, pos, rotX = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      m.rotation.x = rotX;
      m.receiveShadow = true;
      this.scene.add(m);
      return m;
    };
    const sq = new THREE.BoxGeometry(1, 0.08, 1);
    for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) add(sq, (f + r) % 2 ? MAT.sqLight : MAT.sqDark, [f - 3.5, -0.04, 3.5 - r]);
    add(new THREE.BoxGeometry(9.1, 0.16, 9.1), MAT.frame, [0, -0.09, 0]);
    for (const [w, d, x, z] of [[8.14, 0.04, 0, 4.05], [8.14, 0.04, 0, -4.05], [0.04, 8.14, 4.05, 0], [0.04, 8.14, -4.05, 0]])
      add(new THREE.BoxGeometry(w, 0.012, d), MAT.gold, [x, -0.005, z]);
    add(new THREE.PlaneGeometry(80, 80), MAT.table, [0, -0.17, 0], -Math.PI / 2);
    // Koordinaten auf dem Rahmen – jeweils lesbar von der Seite, an der sie stehen
    const tex = {};
    const label = (text, x, z, flip) => {
      tex[text] ||= canvasTexture(64, (g, s) => {
        g.fillStyle = '#c9a14a'; g.font = '600 40px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(text, s / 2, s / 2 + 2);
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: tex[text], transparent: true, depthWrite: false }));
      m.rotation.set(-Math.PI / 2, 0, flip ? Math.PI : 0);
      m.position.set(x, -0.007, z);
      this.scene.add(m);
    };
    for (let i = 0; i < 8; i++) {
      label(FILES[i], i - 3.5, 4.29, false);
      label(FILES[i], i - 3.5, -4.29, true);
      label(String(i + 1), -4.29, 3.5 - i, false);
      label(String(i + 1), 4.29, 3.5 - i, true);
    }
  }

  #setupCamera() {
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    Object.assign(this.controls, {
      enablePan: false, enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.6, autoRotateSpeed: 0.5,
      minPolarAngle: 0.2, maxPolarAngle: 1.22, minDistance: 6, maxDistance: 24,
    });
    this.viewColor = 'w';
    this.distance = 12.4;      // Startwerte, falls das Fenster beim Laden noch keine Größe hat
    this.polar = POLAR;
    this.camera.position.set(0, 8, 9);
    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.45, 1.3));
    this.composer.addPass(new OutputPass());
  }

  // Hochformat (Handy): erst den Blickwinkel weiten, dann – falls nötig – zurücktreten,
  // damit das Brett in die Breite passt. Der Nebel wandert mit.
  #fitCamera() {
    const a = this.camera.aspect, wide = 0.473;   // tan(halber horizontaler Blickwinkel) im Querformat
    this.camera.fov = a < 1.3 ? Math.min(70, THREE.MathUtils.radToDeg(2 * Math.atan(wide / a))) : 40;
    const halfW = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * a;
    this.distance = 12.4 * Math.max(1, wide / halfW);
    this.polar = a < 1 ? 0.62 : POLAR;
    this.scene.fog.near = this.distance + 3;
    this.scene.fog.far = this.distance + 21;
  }

  #resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.#fitCamera();
    if (this.inset) this.camera.setViewOffset(w, h, this.inset / 2, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.controls.maxDistance = Math.max(24, this.distance * 1.3);
    if (!this.cinematic) this.resetView(false);
  }

  #setupPointer() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const tap = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && performance.now() - down.t < 600;
      down = null;
      if (!tap) return;
      if (this.busy) return this.skip();   // Tippen während eines Kampfs überspringt ihn
      const sq = this.#pick(e);
      if (sq) this.onSquare(sq);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || e.buttons) return;
      const sq = this.busy ? null : this.#pick(e);
      el.style.cursor = this.busy ? 'pointer' : sq && this.canSelect(sq) ? 'pointer' : '';
    });
  }

  // Figur unter dem Zeiger hat Vorrang, sonst das Feld auf der Brettebene
  #pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    for (const hit of this.ray.intersectObjects(this.root.children, true)) {
      let o = hit.object;
      while (o && o.parent !== this.root) o = o.parent;
      if (o && this.pieces.get(o.userData.square) === o) return o.userData.square;
    }
    const p = this.ray.ray.intersectPlane(this.plane, V3());
    return p ? squareAt(p.x, p.z) : null;
  }

  // ---------- Animationen ----------
  #frame(now) {
    const dt = this.lastFrame === undefined ? 0 : Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (!this.manual) this.advance(dt);
  }

  #place(g, sq) {
    g.userData.yaw = (Math.random() - 0.5) * 0.4;
    g.rotation.y = g.userData.yaw;
    g.position.copy(squarePos(sq));
    this.root.add(g);
    this.#move(g, sq);
  }

  #move(g, sq) { g.userData.square = sq; this.pieces.set(sq, g); }

  #drop() {
    if (this.lifted) this.lifted.position.y = 0;
    this.lifted = null;
  }

  #duration(from, to, jump) { return jump ? 0.6 : 0.25 + squarePos(from).distanceTo(squarePos(to)) * 0.07; }

  // ohne Kampf: geschlagene Figur versinkt drehend im Brett, Funken stieben
  #sink(g, delay) {
    const yaw = g.rotation.y;
    this.fx.burst(g.position.clone().setY(0.45), g.userData.color, { delay });
    this.sfx('capture', delay);
    return this.tween(0.5, (k) => {
      g.position.y = -k * k * 1.1;
      g.rotation.y = yaw + k * 4;
      if (k >= 1) this.root.remove(g);
    }, delay);
  }

  #promote(sq, type, color) {
    const old = this.pieces.get(sq);
    if (old) this.root.remove(old);
    const g = figurine(type, color);
    this.#place(g, sq);
    this.fx.burst(squarePos(sq, 0.5), color);
    this.sfx('awaken');
    return this.tween(0.55, (k) => g.scale.setScalar(0.15 + 0.85 * easeBack(k)));
  }
}
