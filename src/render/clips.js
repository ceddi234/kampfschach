// Bewegungen der erwachten Figuren als Schlüsselposen über die Zeit; dazwischen weich interpoliert.
// Kanäle: '<gelenk>' = Drehung [x, y, z] relativ zur Ruhelage, '<gelenk>.p' = Verschiebung (Rig-Einheiten).
// Faustregeln (Figur schaut nach +x): Drehung um z > 0 kippt einen Rumpf nach hinten und schwingt ein
// herabhängendes Glied nach vorn. Bei Armen an der Seite hebt Drehung um x sie seitlich an (links +, rechts −).
import { smooth } from './util.js';

const ZERO = [0, 0, 0];

function clip(dur, keys, extra = {}) {
  const tracks = new Map();
  for (const [t, pose] of keys) for (const [ch, v] of Object.entries(pose)) {
    if (!tracks.has(ch)) tracks.set(ch, t > 0 ? [[0, ZERO]] : []);   // vor dem ersten Schlüssel: Ruhelage
    tracks.get(ch).push([t, v]);
  }
  return { dur, tracks, ...extra };
}

export function sample(c, t) {
  const out = {};
  for (const [ch, track] of c.tracks) {
    const i = track.findIndex(([tk]) => tk > t);
    if (i === -1) { out[ch] = track.at(-1)[1]; continue; }
    if (i === 0) { out[ch] = track[0][1]; continue; }
    const [t0, v0] = track[i - 1], [t1, v1] = track[i], e = smooth((t - t0) / (t1 - t0));
    out[ch] = v0.map((x, j) => x + (v1[j] - x) * e);
  }
  return out;
}

// reach: Abstand zum Opfer, aus dem angegriffen wird · hit: Treffer · launch: Abschuss (Fernkampf)
export const ATTACK = {
  // Bauer: ausholen, Ausfallschritt, Speerstoß
  p: clip(1.15, [
    [0.3, { 'all.p': [-0.06, 0, 0], torso: [0, 0, 0.22], armR: [0, 0, -0.5], 'spear.p': [-0.12, 0.02, 0], legL: [0, 0, 0.25], legR: [0, 0, -0.15], armL: [0, 0, 0.3] }],
    [0.5, { 'all.p': [0.28, 0, 0], torso: [0, 0, -0.3], armR: [0, 0, 0.35], 'spear.p': [0.18, 0, 0], legL: [0, 0, -0.45], legR: [0, 0, 0.45], armL: [0, 0, 0.1] }],
    [0.75, { 'all.p': [0.24, 0, 0], torso: [0, 0, -0.15], armR: [0, 0, 0.15], 'spear.p': [0.08, 0, 0], legL: [0, 0, -0.3], legR: [0, 0, 0.3], armL: [0, 0, 0.1] }],
    [1.15, { 'all.p': [0.15, 0, 0], torso: ZERO, armR: ZERO, 'spear.p': ZERO, legL: ZERO, legR: ZERO, armL: ZERO }],
  ], { hit: 0.5, reach: 0.95 }),

  // Springer: steigt hoch, schlägt mit den Vorderhufen und stampft auf das Opfer
  n: clip(1.55, [
    [0.18, { 'all.p': [-0.05, 0, 0], body: [0, 0, -0.08], neck: [0, 0, -0.15] }],
    [0.6, { 'all.p': [0.05, 0, 0], body: [0, 0, 0.85], neck: [0, 0, -0.3], head: [0, 0, 0.35], frontL: [0, 0, 1.4], kneeL: [0, 0, -1.9], frontR: [0, 0, 1.1], kneeR: [0, 0, -1.4], tail: [0, 0, 0.6] }],
    [0.85, { 'all.p': [0.08, 0, 0], body: [0, 0, 0.95], neck: [0, 0, -0.3], head: [0, 0, 0.35], frontL: [0, 0, 1.7], kneeL: [0, 0, -1.2], frontR: [0, 0, 1.6], kneeR: [0, 0, -1.8], tail: [0, 0, 0.6] }],
    [1.05, { 'all.p': [0.3, 0, 0], body: [0, 0, 0.05], neck: [0, 0, 0.1], head: [0, 0, -0.1], frontL: [0, 0, 0.5], kneeL: [0, 0, -0.3], frontR: [0, 0, 0.7], kneeR: [0, 0, -0.2], tail: [0, 0, 0.2] }],
    [1.55, { 'all.p': [0.25, 0, 0], body: ZERO, neck: ZERO, head: ZERO, frontL: ZERO, kneeL: ZERO, frontR: ZERO, kneeR: ZERO, tail: ZERO }],
  ], { hit: 1.05, reach: 1.15 }),

  // Läufer: hebt den Stab, die Kugel lädt sich auf, Stoß nach vorn schleudert sie aufs Opfer
  b: clip(1.65, [
    [0.45, { body: [0, 0, 0.12], armR: [0, 0, 1.5], staff: [0, 0, -0.9], armL: [0, 0, 0.6], head: [0, 0, 0.1] }],
    [0.8, { 'all.p': [0.06, 0, 0], body: [0, 0, -0.18], armR: [0, 0, 1.1], staff: [0, 0, -1.4], armL: [0, 0, 1.3], head: [0, 0, 0.1] }],
    [1.1, { 'all.p': [0.06, 0, 0], body: [0, 0, -0.1], armR: [0, 0, 0.9], staff: [0, 0, -1.2], armL: [0, 0, 1.0] }],
    [1.65, { 'all.p': [0.06, 0, 0], body: ZERO, armR: ZERO, staff: ZERO, armL: ZERO, head: ZERO }],
  ], { hit: 1.15, reach: 1.7, launch: 0.8 }),

  // Turm: grollt, hebt die Zinnen, fährt die Kanone aus und feuert im Bogen
  r: clip(1.75, [
    [0.12, { body: [0.03, 0, 0.03] }], [0.24, { body: [-0.03, 0, -0.03] }], [0.36, { body: [0.025, 0, 0.02] }], [0.48, { body: ZERO }],
    [0.8, { 'top.p': [0, 0.14, 0], top: [0, 0.7, 0], 'cannon.p': [0, 0.34, 0], cannon: [0, 0, -1.2] }],
    [0.95, { 'top.p': [0, 0.14, 0], top: [0, 0.7, 0], 'cannon.p': [0, 0.34, 0], cannon: [0, 0, -1.25] }],
    [1.02, { 'cannon.p': [-0.08, 0.34, 0], cannon: [0, 0, -1.1], body: [0, 0, 0.06] }],
    [1.3, { 'top.p': [0, 0.14, 0], top: [0, 0.7, 0], 'cannon.p': [0, 0.34, 0], cannon: [0, 0, -1.2], body: ZERO }],
    [1.75, { 'top.p': ZERO, top: ZERO, 'cannon.p': ZERO, cannon: ZERO }],
  ], { hit: 1.35, reach: 2.2, launch: 0.98 }),

  // Dame: schwebt auf, Arme hoch – Lichtsplitter kreisen und schießen auf das Opfer
  q: clip(2.0, [
    [0.5, { 'all.p': [0, 0.16, 0], armL: [2.0, 0, 0], armR: [-2.0, 0, 0], head: [0, 0, 0.15] }],
    [0.95, { 'all.p': [0, 0.2, 0], armL: [2.3, 0, 0.2], armR: [-2.3, 0, 0.2], head: [0, 0, 0.15] }],
    [1.1, { 'all.p': [0.05, 0.18, 0], armL: [0.3, 0, 1.5], armR: [-0.3, 0, 1.5], body: [0, 0, -0.15], head: ZERO }],
    [1.6, { 'all.p': [0.05, 0.12, 0], armL: [0.2, 0, 1.2], armR: [-0.2, 0, 1.2], body: [0, 0, -0.08] }],
    [2.0, { 'all.p': [0.05, 0, 0], armL: ZERO, armR: ZERO, body: ZERO }],
  ], { hit: 1.35, reach: 1.9, launch: 1.05 }),

  // König: Schritt nach vorn, Schwert über den Kopf, wuchtiger Hieb
  k: clip(1.5, [
    [0.25, { 'all.p': [0.1, 0, 0], legL: [0, 0, 0.35], legR: [0, 0, -0.25], torso: [0, 0, 0.05] }],
    [0.6, { 'all.p': [0.12, 0, 0], torso: [0, 0, 0.25], armR: [0, 0, 2.7], sword: [0, 0, 0.3], armL: [0, 0, 0.6], legL: [0, 0, 0.2], legR: [0, 0, -0.2], cape: [0, 0, 0.2] }],
    [0.85, { 'all.p': [0.3, 0, 0], torso: [0, 0, -0.35], armR: [0, 0, 0.6], sword: [0, 0, -0.2], armL: [0, 0, -0.2], legL: [0, 0, -0.4], legR: [0, 0, 0.45], cape: [0, 0, 0.5] }],
    [1.1, { 'all.p': [0.28, 0, 0], torso: [0, 0, -0.2], armR: [0, 0, 0.4], sword: [0, 0, -0.1], legL: [0, 0, -0.4], legR: [0, 0, 0.45], cape: [0, 0, 0.3] }],
    [1.5, { 'all.p': [0.22, 0, 0], torso: ZERO, armR: ZERO, sword: ZERO, armL: ZERO, legL: ZERO, legR: ZERO, cape: ZERO }],
  ], { hit: 0.85, reach: 1.25 }),
};

// Abwehrhaltung des Opfers bis zum Treffer
export const GUARD = {
  p: clip(0.4, [[0.4, { torso: [0, 0, 0.1], armL: [0, 0, 0.35], 'spear.p': [-0.08, 0, 0] }]]),
  n: clip(0.4, [[0.4, { body: [0, 0, 0.15], head: [0, 0, 0.3], tail: [0, 0, 0.3] }]]),
  b: clip(0.4, [[0.4, { body: [0, 0, 0.08], armR: [0, 0, 0.5], armL: [0, 0, 0.7] }]]),
  r: clip(0.4, [[0.4, { body: [0, 0, 0.03] }]]),
  q: clip(0.4, [[0.4, { armL: [0, 0, 0.9], armR: [0, 0, 0.9], head: [0, 0, 0.1] }]]),
  k: clip(0.4, [[0.4, { torso: [0, 0, 0.1] }]]),
};

// Abwehr eines Angriffs, beginnt kurz vor dem Treffer
export const BLOCK = {
  // Schild hoch, die Wucht drückt ihn ein Stück zurück
  p: clip(0.75, [
    [0.12, { armL: [0, 0, 0.75], torso: [0, 0, 0.12], 'shield.p': [0.05, 0.05, 0] }],
    [0.28, { armL: [0, 0, 0.6], torso: [0, 0, 0.3], 'all.p': [-0.1, 0, 0], 'shield.p': [0.05, 0.05, 0] }],
    [0.75, { armL: ZERO, torso: ZERO, 'all.p': ZERO, 'shield.p': ZERO }],
  ]),
  // Pferd springt zur Seite weg und wirft den Kopf herum
  n: clip(0.8, [
    [0.15, { 'all.p': [-0.08, 0, 0.24], all: [0, 0.5, 0], body: [0, 0, 0.12], neck: [0, 0, -0.2], head: [0, 0, 0.35], frontL: [0, 0, 0.5], kneeL: [0, 0, -0.9], tail: [0, 0, 0.5] }],
    [0.4, { 'all.p': [-0.1, 0, 0.2], all: [0, 0.35, 0], body: [0, 0, 0.06], neck: [0, 0, -0.1], head: [0, 0, 0.2], frontL: [0, 0, 0.2], kneeL: [0, 0, -0.4], tail: [0, 0, 0.3] }],
    [0.8, { 'all.p': ZERO, all: ZERO, body: ZERO, neck: ZERO, head: ZERO, frontL: ZERO, kneeL: ZERO, tail: ZERO }],
  ]),
  // Stab quer vor den Körper, Lichtschild
  b: clip(0.8, [
    [0.12, { armR: [0, 0, 1.3], staff: [1.4, 0, -1.0], armL: [0, 0, 1.2], body: [0, 0, 0.08] }],
    [0.3, { armR: [0, 0, 1.2], staff: [1.4, 0, -0.9], armL: [0, 0, 1.1], body: [0, 0, 0.2], 'all.p': [-0.06, 0, 0] }],
    [0.8, { armR: ZERO, staff: ZERO, armL: ZERO, body: ZERO, 'all.p': ZERO }],
  ]),
  // Turm steckt den Treffer weg und bebt
  r: clip(0.7, [[0.1, { body: [0.04, 0, 0.06] }], [0.2, { body: [-0.04, 0, -0.03] }], [0.3, { body: [0.02, 0, 0.03] }], [0.7, { body: ZERO }]]),
  // Hände nach vorn, Lichtbarriere
  q: clip(0.8, [
    [0.12, { armL: [0.3, 0, 1.4], armR: [-0.3, 0, 1.4], body: [0, 0, 0.1] }],
    [0.3, { armL: [0.35, 0, 1.3], armR: [-0.35, 0, 1.3], body: [0, 0, 0.2], 'all.p': [-0.07, 0, 0] }],
    [0.8, { armL: ZERO, armR: ZERO, body: ZERO, 'all.p': ZERO }],
  ]),
  // Parade: Klinge quer nach oben
  k: clip(0.8, [
    [0.12, { armR: [0, 0, 1.9], sword: [0, 0, 1.2], torso: [0, 0, 0.1], armL: [0, 0, 0.5] }],
    [0.3, { armR: [0, 0, 1.8], sword: [0, 0, 1.1], torso: [0, 0, 0.25], 'all.p': [-0.08, 0, 0] }],
    [0.8, { armR: ZERO, sword: ZERO, torso: ZERO, armL: ZERO, 'all.p': ZERO }],
  ]),
};
// womit abgewehrt wird – bestimmt Effekt und Klang
export const BLOCK_KIND = { p: 'shield', k: 'blade', n: 'dodge', r: 'wall', b: 'barrier', q: 'barrier' };
export const RANGED = { b: true, r: true, q: true };

// Niederlage ab dem Treffer; am Ende zerspringt die Figur
export const DEFEAT = {
  // zurückgeworfen, sinkt auf die Knie
  p: clip(0.8, [
    [0, { torso: [0, 0, 0.1], armL: [0, 0, 0.35] }],
    [0.15, { 'all.p': [-0.18, 0, 0], torso: [0, 0, 0.55], head: [0, 0, 0.3], armL: [0, 0, -0.4], armR: [0, 0, -0.6] }],
    [0.55, { 'all.p': [-0.22, -0.08, 0], torso: [0, 0, -0.35], head: [0, 0, -0.2], legL: [0, 0, 0.9], legR: [0, 0, -0.5], armL: [0, 0, 0.2], armR: [0, 0, 0.3] }],
    [0.8, { 'all.p': [-0.22, -0.1, 0], torso: [0, 0, -0.5], head: [0, 0, -0.2], legL: [0, 0, 0.9], legR: [0, 0, -0.5] }],
  ]),
  // bäumt sich auf und kippt zur Seite
  n: clip(0.9, [
    [0, { body: [0, 0, 0.15], head: [0, 0, 0.3] }],
    [0.25, { 'all.p': [-0.15, 0, 0], body: [0, 0, 0.55], neck: [0, 0, -0.3], frontL: [0, 0, 1.0], kneeL: [0, 0, -1.4], frontR: [0, 0, 0.8], kneeR: [0, 0, -1.2] }],
    [0.7, { 'all.p': [-0.2, -0.04, 0], all: [1.2, 0, 0], body: [0, 0, 0.1], frontL: [0, 0, 0.4], frontR: [0, 0, 0.6] }],
    [0.9, { 'all.p': [-0.2, -0.06, 0], all: [1.35, 0, 0] }],
  ]),
  // taumelt, dreht sich weg, der Stab entgleitet – löst sich in Licht auf
  b: clip(1.0, [
    [0, { body: [0, 0, 0.08], armR: [0, 0, 0.5] }],
    [0.2, { 'all.p': [-0.15, 0, 0], body: [0, 0, 0.45], head: [0, 0, 0.35], armR: [0, 0, -0.6], armL: [-0.8, 0, 0.4] }],
    [0.6, { 'all.p': [-0.2, 0, 0], all: [0, 0.8, 0], body: [0, 0, -0.3], head: [0, 0, -0.2], armR: [0, 0, 0.2], 'staff.p': [0, -0.25, 0], staff: [0.9, 0, 0] }],
    [1.0, { 'all.p': [-0.2, -0.1, 0], all: [0, 1.2, 0], body: [0, 0, -0.55], 'staff.p': [0, -0.35, 0], staff: [1.4, 0, 0] }],
  ], { motes: true }),
  // bebt, Risse glühen, neigt sich nach hinten – die Zinnen rutschen ab
  r: clip(0.9, [
    [0, { body: [0, 0, 0.03] }],
    [0.1, { body: [0.05, 0, 0.06] }], [0.2, { body: [-0.05, 0, -0.04] }], [0.3, { body: [0.03, 0, 0.05] }],
    [0.9, { body: [0.12, 0, 0.35], 'top.p': [-0.08, -0.04, 0.05], top: [0.2, 0.3, 0.4] }],
  ], { boxes: true }),
  // wirbelt herum und sinkt nieder, die Krone fällt
  q: clip(1.1, [
    [0, { armL: [0, 0, 0.9], armR: [0, 0, 0.9] }],
    [0.15, { 'all.p': [-0.12, 0, 0], body: [0, 0, 0.35], head: [0, 0, 0.3], armL: [0.9, 0, 0.2], armR: [-0.9, 0, 0.2] }],
    [0.7, { 'all.p': [-0.15, -0.04, 0], all: [0, 3.4, 0], body: [0, 0, -0.1], armL: [0.4, 0, 0], armR: [-0.4, 0, 0], 'crown.p': [-0.06, 0.08, 0], crown: [0, 0, 0.6] }],
    [1.1, { 'all.p': [-0.15, -0.12, 0], all: [0, 3.6, 0], body: [0, 0, -0.45], head: [0, 0, -0.3], 'crown.p': [-0.25, -0.3, 0.05], crown: [0.4, 0, 1.6] }],
  ]),
};
DEFEAT.k = DEFEAT.p;   // ein König wird nie geschlagen – nur zur Sicherheit
