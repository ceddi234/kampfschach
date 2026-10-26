// Ablauf eines Schlagzugs: Angreifer rückt heran, beide Figuren erwachen, Kampf, der Verlierer zerspringt,
// der Sieger geht aufs Zielfeld und wird wieder zur Figur. Läuft komplett über die Tweens des Bretts,
// lässt sich also jederzeit überspringen (alle Tweens springen auf k = 1).
import { makeRig } from './rigs.js';
import { ATTACK, DEFEAT, GUARD } from './clips.js';
import { ease, easeBack } from './util.js';

const turn = (a) => Math.atan2(Math.sin(a), Math.cos(a));   // Winkel auf −π…π
const BULK = { n: 0.25, r: 0.1 };   // große Opfer brauchen etwas mehr Abstand

// Effekte des Angreifers, zeitlich passend zum Clip
const CHOREO = {
  p: (b, A, V, c, side) => b.at(c.hit, () => b.fx.burst(A.world('tip'), side, { n: 24, speed: 0.6 })),
  n: (b, A, V, c, side) => b.at(c.hit, () => {
    b.fx.shockwave(A.world('hoof'), side);
    b.fx.burst(A.world('hoof'), side, { n: 30, speed: 0.8 });
  }),
  b: (b, A, V, c, side) => {
    b.fx.charge(() => A.world('orb'), side, { dur: c.launch - 0.15, delay: 0.15 });
    b.fx.projectile(() => A.world('orb'), () => V.world('hit'), side, { delay: c.launch, dur: c.hit - c.launch, arc: 0.12 });
  },
  r: (b, A, V, c, side) => {
    b.at(c.launch, () => {
      b.fx.burst(A.world('muzzle'), side, { n: 26, speed: 0.6 });
      b.fx.flash(A.world('muzzle'), side, { intensity: 5 });
    });
    b.fx.projectile(() => A.world('muzzle'), () => V.world('hit'), side, { delay: c.launch, dur: c.hit - c.launch, arc: 0.7, size: 0.09 });
    b.at(c.hit, () => b.fx.shockwave(V.root.position, side, { size: 1.6 }));
  },
  q: (b, A, V, c, side) => b.fx.volley(() => A.world('center'), () => V.world('hit'), side, { start: 0.45, launch: c.launch, hit: c.hit }),
  k: (b, A, V, c, side) => b.fx.slash(() => A.world('shoulder'), A.root.rotation.y, side, { delay: c.hit - 0.15 }),
};

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
  await Promise.all([awaken(b, fig, A), awaken(b, victim, V)]);

  CHOREO[m.piece](b, A, V, atk, side);
  const defeated = b.play(V, GUARD[m.captured], atk.hit).then(() => {
    b.fx.burst(V.world('hit'), side, { n: 50, speed: 1.2 });
    b.fx.flash(V.world('hit'), side, { intensity: 8 });
    return b.play(V, def);
  });
  const shattered = defeated.then(() => b.fx.shatter(V, dir, { boxes: def.boxes, motes: def.motes })).then(() => {
    V.dispose();
    victim.removeFromParent();
  });
  await Promise.all([b.play(A, atk), defeated]);

  // der Sieger geht schon los, während die Splitter noch fliegen
  A.bake();
  if (A.root.position.distanceTo(to) > 0.05) await walk(b, A, to);
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
  await b.tween(0.3, (k) => rig.root.scale.setScalar(1 - 0.45 * ease(k)));
  rig.dispose();
  fig.position.copy(to);
  fig.visible = true;
  b.fx.flash(to.clone().setY(0.5), rig.color, { intensity: 4 });
  await b.tween(0.35, (k) => fig.scale.setScalar(0.6 + 0.4 * easeBack(k)));
}

// ein paar Schritte (bzw. Galopp) aufs Zielfeld
function walk(b, rig, to) {
  const a = rig.root.position.clone(), d = a.distanceTo(to);
  const yaw0 = rig.root.rotation.y, dYaw = turn(-Math.atan2(to.z - a.z, to.x - a.x) - yaw0), steps = Math.max(1, Math.round(d * 3));
  return b.tween(0.25 + d * 0.45, (k) => {
    rig.root.position.lerpVectors(a, to, ease(k));
    rig.root.rotation.y = yaw0 + dYaw * Math.min(1, k * 3);
    const s = Math.sin(k * Math.PI * 2 * steps) * (1 - k);
    rig.pose({
      legL: [0, 0, 0.45 * s], legR: [0, 0, -0.45 * s], frontL: [0, 0, 0.5 * s], frontR: [0, 0, -0.5 * s],
      hindL: [0, 0, -0.3 * s], hindR: [0, 0, 0.3 * s], 'all.p': [0, Math.abs(s) * 0.04, 0],
    });
  });
}
