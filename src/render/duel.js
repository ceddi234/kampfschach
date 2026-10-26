// Ablauf eines Schlagzugs: Angreifer rückt heran, beide Figuren erwachen, 1–3 Schlagabtausche, die abgewehrt werden
// (auch der Verteidiger greift an), dann der entscheidende Treffer – der Verlierer zerspringt, der Sieger geht aufs
// Zielfeld und wird wieder zur Figur. Wie viele Abtausche es gibt, folgt aus dem Zug selbst: online sehen beide
// Spieler denselben Kampf. Alles läuft über die Tweens des Bretts und lässt sich daher jederzeit überspringen.
import { makeRig } from './rigs.js';
import { ATTACK, BLOCK, BLOCK_KIND, DEFEAT, GUARD, RANGED, sample } from './clips.js';
import { V3, ease, easeBack } from './util.js';

const turn = (a) => Math.atan2(Math.sin(a), Math.cos(a));   // Winkel auf −π…π
const BULK = { n: 0.25, r: 0.1 };                            // große Figuren brauchen etwas mehr Abstand
const EXCHANGE_SPEED = 1.25;                                 // abgewehrte Angriffe laufen etwas zügiger

// Reihenfolge der abgewehrten Angriffe vor dem Treffer (A = Angreifer, V = Verteidiger schlägt zurück)
const ROUNDS = { 1: ['V'], 2: ['A', 'V'], 3: ['V', 'A', 'V'] };

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export const exchangesFor = (m) => 1 + (hash(`${m.before ?? ''}${m.from}${m.to}`) % 3);

// Geräusche und Effekte des Angreifers, zeitlich passend zum Clip; impact() = wo es einschlägt
const CHOREO = {
  p: (b, P, Q, T) => b.sfx('whoosh', T.hit - 0.22),
  n: (b, P, Q, T, side, impact, blocked) => {
    b.sfx('whoosh', T.hit * 0.45);
    b.at(T.hit, () => {
      b.fx.shockwave(P.world('hoof'), side, { size: blocked ? 0.9 : 1.3 });
      b.sfx('stomp');
    });
  },
  b: (b, P, Q, T, side, impact) => {
    b.fx.charge(() => P.world('orb'), side, { dur: T.launch - 0.1, delay: 0.1 });
    b.sfx('charge', 0.1);
    b.sfx('zap', T.launch);
    b.fx.projectile(() => P.world('orb'), impact, side, { delay: T.launch, dur: T.hit - T.launch, arc: 0.12 });
  },
  r: (b, P, Q, T, side, impact) => {
    b.at(T.launch, () => {
      b.fx.burst(P.world('muzzle'), side, { n: 26, speed: 0.6 });
      b.fx.flash(P.world('muzzle'), side, { intensity: 5 });
      b.sfx('cannon');
    });
    b.fx.projectile(() => P.world('muzzle'), impact, side, { delay: T.launch, dur: T.hit - T.launch, arc: 0.7, size: 0.09 });
  },
  q: (b, P, Q, T, side, impact) => {
    b.fx.volley(() => P.world('center'), impact, side, { start: 0.4, launch: T.launch, hit: T.hit });
    b.sfx('shards', T.launch);
  },
  k: (b, P, Q, T, side) => {
    b.sfx('whoosh', T.hit - 0.2);
    b.fx.slash(() => P.world('shoulder'), P.root.rotation.y, side, { delay: T.hit - 0.15 });
  },
};

// wo ein abgewehrter Angriff landet: vor dem Verteidiger – beim Ausweichen daneben ins Leere
function guardPoint(Q, P, kind) {
  const hit = Q.world('hit'), toP = P.root.position.clone().sub(Q.root.position).setY(0).normalize();
  if (kind === 'dodge') return hit.add(V3(-toP.z, 0, toP.x).multiplyScalar(0.5)).setY(0.25);
  return hit.addScaledVector(toP, kind === 'wall' ? 0.15 : 0.32);
}

// Abwehr sichtbar und hörbar machen
function blockFx(b, P, Q, kind) {
  const point = guardPoint(Q, P, kind), toP = P.root.position.clone().sub(Q.root.position).setY(0).normalize();
  if (kind === 'barrier') {
    b.fx.barrier(Q.world('hit'), toP, Q.color);
    b.fx.burst(point, Q.color, { n: 24, speed: 0.7, size: 0.06 });
    b.sfx('barrier');
  }
  if (kind === 'shield' || kind === 'blade') {
    b.fx.burst(point, P.color, { n: 34, speed: 0.9, size: 0.06 });
    b.fx.flash(point, P.color, { intensity: 5 });
    b.sfx('clang');
  }
  if (kind === 'wall') { b.fx.dust(point); b.fx.burst(point, P.color, { n: 20, speed: 0.7 }); b.sfx('thud'); }
  if (kind === 'dodge') { b.fx.dust(point.setY(0.1)); b.sfx('whoosh'); }
}

function hitFx(b, P, Q) {
  const point = Q.world('hit');
  b.fx.burst(point, P.color, { n: 50, speed: 1.2 });
  b.fx.flash(point, P.color, { intensity: 8 });
  b.sfx(RANGED[P.type] ? 'magicHit' : 'impact');
}

// Clip abspielen und danach weich in die Ruhelage zurückgleiten
async function act(b, rig, clip, speed = 1) {
  await b.play(rig, clip, { speed });
  const end = sample(clip, clip.dur);
  await b.tween(0.22, (k) => rig.pose(Object.fromEntries(Object.entries(end).map(([ch, v]) => [ch, v.map((x) => x * (1 - k))]))));
}

// ein Angriff von P auf Q – abgewehrt oder als entscheidender Treffer
async function strike(b, P, Q, { blocked }) {
  const c = ATTACK[P.type], speed = blocked ? EXCHANGE_SPEED : 1;
  const T = { hit: c.hit / speed, launch: (c.launch ?? 0) / speed }, kind = BLOCK_KIND[Q.type];
  const impact = () => (blocked ? guardPoint(Q, P, kind) : Q.world('hit'));
  CHOREO[P.type](b, P, Q, T, P.color, impact, blocked);
  b.at(T.hit, () => (blocked ? blockFx(b, P, Q, kind) : hitFx(b, P, Q)));
  const reaction = blocked
    ? b.at(Math.max(0, T.hit - 0.15), () => {}).then(() => act(b, Q, BLOCK[Q.type]))
    : b.play(Q, GUARD[Q.type], { dur: T.hit }).then(() => b.play(Q, DEFEAT[Q.type]));
  await Promise.all([blocked ? act(b, P, c, speed) : b.play(P, c), reaction]);
}

export async function duel(b, m, fig, victim, to) {
  const side = m.color, foe = side === 'w' ? 'b' : 'w';
  const from = fig.position.clone().setY(0), cap = victim.position.clone().setY(0);
  const dir = cap.clone().sub(from).normalize();
  const atk = ATTACK[m.piece], def = DEFEAT[m.captured];
  // Nahkämpfer laufen bis kurz vors Opfer, Fernkämpfer bleiben auf Abstand (oder stehen schon nah genug)
  const reach = atk.reach + (BULK[m.captured] || 0);
  const stand = from.distanceTo(cap) <= reach + 0.05 ? from.clone() : cap.clone().addScaledVector(dir, -reach);
  const yaw = -Math.atan2(dir.z, dir.x);

  const camIn = b.cinemaIn(stand, cap);
  if (stand.distanceTo(from) > 0.01) await b.slideTo(fig, from, stand, m.piece === 'n');
  await camIn;

  const A = makeRig(m.piece, side), V = makeRig(m.captured, foe);
  A.root.position.copy(stand);
  A.root.rotation.y = yaw;
  V.root.position.copy(cap);
  V.root.rotation.y = yaw + Math.PI;
  b.sfx('awaken');
  await Promise.all([awaken(b, fig, A), awaken(b, victim, V)]);

  // Schlagabtausch: beide greifen an, beide wehren ab
  for (const who of ROUNDS[exchangesFor(m)]) {
    const [P, Q] = who === 'A' ? [A, V] : [V, A];
    const dist = P.root.position.distanceTo(Q.root.position);
    const gap = dist - ATTACK[P.type].reach - (BULK[Q.type] || 0);
    const home = P.root.position.clone(), advance = gap > 0.1 && !RANGED[P.type];
    if (advance) await walk(b, P, home.clone().lerp(Q.root.position, gap / dist));
    await strike(b, P, Q, { blocked: true });
    if (advance) await walk(b, P, home, { backwards: true });
  }

  // der entscheidende Treffer
  const defeated = strike(b, A, V, { blocked: false });
  const shattered = defeated.then(() => {
    b.sfx(def.boxes ? 'crumble' : 'shatter');
    return b.fx.shatter(V, dir, { boxes: def.boxes, motes: def.motes });
  }).then(() => {
    V.dispose();
    victim.removeFromParent();
  });
  await defeated;

  // der Sieger geht schon los, während die Splitter noch fliegen
  A.bake();
  if (A.root.position.distanceTo(to) > 0.05) await walk(b, A, to, { face: true });
  await settle(b, A, fig, to);
  await shattered;
  await b.cinemaOut();
}

// Figur spannt sich, Lichtwirbel – und an ihrer Stelle steht das erwachte Wesen
async function awaken(b, fig, rig) {
  const p = fig.position.clone();
  b.fx.swirl(p, rig.color);
  await b.tween(0.4, (k) => fig.scale.set(1 - 0.15 * k, 1 + 0.12 * k, 1 - 0.15 * k));
  b.fx.flash(p.clone().setY(0.5), rig.color, { intensity: 5 });
  b.fx.burst(p.clone().setY(0.4), rig.color, { n: 24, speed: 0.6 });
  fig.visible = false;
  fig.scale.setScalar(1);
  rig.pose({});
  b.scene.add(rig.root);
  await b.tween(0.35, (k) => rig.root.scale.setScalar(0.55 + 0.45 * easeBack(k)));
}

// zurück zur Figur auf dem Zielfeld
async function settle(b, rig, fig, to) {
  b.fx.swirl(to, rig.color, { dur: 0.6 });
  b.sfx('settle');
  await b.tween(0.3, (k) => rig.root.scale.setScalar(1 - 0.45 * ease(k)));
  rig.dispose();
  fig.position.copy(to);
  fig.visible = true;
  b.fx.flash(to.clone().setY(0.5), rig.color, { intensity: 4 });
  await b.tween(0.35, (k) => fig.scale.setScalar(0.6 + 0.4 * easeBack(k)));
}

// ein paar Schritte (bzw. Galopp); face = in Laufrichtung drehen, backwards = rückwärts mit Blick nach vorn
function walk(b, rig, to, { face = false, backwards = false } = {}) {
  const a = rig.root.position.clone(), d = a.distanceTo(to);
  const yaw0 = rig.root.rotation.y, dYaw = face ? turn(-Math.atan2(to.z - a.z, to.x - a.x) - yaw0) : 0;
  const steps = Math.max(1, Math.round(d * 3)), dur = 0.25 + d * (backwards ? 0.35 : 0.45), dir = backwards ? -1 : 1;
  for (let i = 0; i < steps * 2; i++) b.sfx(rig.type === 'n' ? 'hoof' : 'step', ((i + 0.5) / (steps * 2)) * dur);
  return b.tween(dur, (k) => {
    rig.root.position.lerpVectors(a, to, ease(k));
    rig.root.rotation.y = yaw0 + dYaw * Math.min(1, k * 3);
    const s = Math.sin(k * Math.PI * 2 * steps) * (1 - k) * dir;
    rig.pose({
      legL: [0, 0, 0.45 * s], legR: [0, 0, -0.45 * s], frontL: [0, 0, 0.5 * s], frontR: [0, 0, -0.5 * s],
      hindL: [0, 0, -0.3 * s], hindR: [0, 0, 0.3 * s], 'all.p': [0, Math.abs(s) * 0.04, 0],
    });
  });
}
