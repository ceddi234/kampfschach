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

// reach: Abstand zum Opfer, aus dem angegriffen wird · hit: Treffer · launch: Abschuss (nur der Turm schießt)
export const ATTACK = {
  // Bauer: ausholen, Ausfallschritt, Speerstoß
  p: clip(1.15, [
    [0.3, { 'all.p': [-0.06, 0, 0], torso: [0, 0, 0.22], armR: [0, 0, -0.5], 'spear.p': [-0.12, 0.02, 0], legL: [0, 0, 0.25], legR: [0, 0, -0.15], armL: [0, 0, 0.3] }],
    [0.5, { 'all.p': [0.28, 0, 0], torso: [0, 0, -0.3], armR: [0, 0, 0.35], 'spear.p': [0.18, 0, 0], legL: [0, 0, -0.45], legR: [0, 0, 0.45], armL: [0, 0, 0.1] }],
    [0.75, { 'all.p': [0.24, 0, 0], torso: [0, 0, -0.15], armR: [0, 0, 0.15], 'spear.p': [0.08, 0, 0], legL: [0, 0, -0.3], legR: [0, 0, 0.3], armL: [0, 0, 0.1] }],
    [1.15, { 'all.p': [0.15, 0, 0], torso: ZERO, armR: ZERO, 'spear.p': ZERO, legL: ZERO, legR: ZERO, armL: ZERO }],
  ], { hit: 0.5, reach: 0.95 }),

  // Springer: Reiter senkt die Lanze, das Pferd steigt kurz, prescht vor – Lanzenstoß
  n: clip(1.6, [
    [0.25, { 'all.p': [-0.08, 0, 0], body: [0, 0, 0.35], neck: [0, 0, -0.2], head: [0, 0, 0.25], frontL: [0, 0, 0.9], kneeL: [0, 0, -1.3], frontR: [0, 0, 0.6], kneeR: [0, 0, -1.0], lance: [0, 0, -0.9], rider: [0, 0, -0.15] }],
    [0.6, { 'all.p': [0.12, 0, 0], body: [0, 0, -0.05], neck: [0, 0, 0.1], head: [0, 0, -0.1], frontL: [0, 0, -0.5], kneeL: [0, 0, -0.3], frontR: [0, 0, 0.6], kneeR: [0, 0, -0.8], hindL: [0, 0, 0.4], hindR: [0, 0, -0.3], lance: [0, 0, -0.95], rider: [0, 0, -0.2], tail: [0, 0, 0.4] }],
    [1.0, { 'all.p': [0.45, 0, 0], body: [0, 0, -0.1], neck: [0, 0, 0.15], head: [0, 0, -0.1], frontL: [0, 0, 0.5], kneeL: [0, 0, -0.6], frontR: [0, 0, -0.4], kneeR: [0, 0, -0.2], hindL: [0, 0, -0.3], hindR: [0, 0, 0.3], lance: [0, 0, -1.0], rider: [0, 0, -0.3], tail: [0, 0, 0.5] }],
    [1.25, { 'all.p': [0.38, 0, 0], body: [0, 0, 0.12], lance: [0, 0, -0.7], rider: [0, 0, 0.05] }],
    [1.6, { 'all.p': [0.3, 0, 0], body: ZERO, neck: ZERO, head: ZERO, frontL: ZERO, kneeL: ZERO, frontR: ZERO, kneeR: ZERO, hindL: ZERO, hindR: ZERO, lance: ZERO, rider: ZERO, tail: ZERO }],
  ], { hit: 1.0, reach: 1.25 }),

  // Läufer: holt mit dem Streitkolben weit über die Schulter aus und schmettert ihn herunter
  b: clip(1.5, [
    [0.35, { 'all.p': [-0.05, 0, 0], body: [0, 0, 0.25], armR: [0, 0, 2.5], mace: [0, 0, 0.5], armL: [0, 0, 0.8], head: [0, 0, 0.1] }],
    [0.85, { 'all.p': [0.25, 0, 0], body: [0, 0, -0.4], armR: [0, 0, 0.75], mace: [0, 0, -0.9], armL: [0, 0, 0.2], head: [0, 0, -0.15] }],
    [1.1, { 'all.p': [0.22, 0, 0], body: [0, 0, -0.3], armR: [0, 0, 0.65], mace: [0, 0, -0.8], armL: [0, 0, 0.2] }],
    [1.5, { 'all.p': [0.15, 0, 0], body: ZERO, armR: ZERO, mace: ZERO, armL: ZERO, head: ZERO }],
  ], { hit: 0.85, reach: 1.05 }),

  // Turm: grollt, hebt die Zinnen, fährt die Kanone aus und feuert im Bogen
  r: clip(1.75, [
    [0.12, { body: [0.03, 0, 0.03] }], [0.24, { body: [-0.03, 0, -0.03] }], [0.36, { body: [0.025, 0, 0.02] }], [0.48, { body: ZERO }],
    [0.8, { 'top.p': [0, 0.14, 0], top: [0, 0.7, 0], 'cannon.p': [0, 0.34, 0], cannon: [0, 0, -1.2] }],
    [0.95, { 'top.p': [0, 0.14, 0], top: [0, 0.7, 0], 'cannon.p': [0, 0.34, 0], cannon: [0, 0, -1.25] }],
    [1.02, { 'cannon.p': [-0.08, 0.34, 0], cannon: [0, 0, -1.1], body: [0, 0, 0.06] }],
    [1.3, { 'top.p': [0, 0.14, 0], top: [0, 0.7, 0], 'cannon.p': [0, 0.34, 0], cannon: [0, 0, -1.2], body: ZERO }],
    [1.75, { 'top.p': ZERO, top: ZERO, 'cannon.p': ZERO, cannon: ZERO }],
  ], { hit: 1.35, reach: 2.2, launch: 0.98 }),

  // Dame: dreht sich mit ausgestreckter Glefe einmal um sich selbst – die Klinge fegt durch den Gegner
  q: clip(1.7, [
    [0.3, { 'all.p': [-0.05, 0, 0], body: [0, -0.7, 0.12], armR: [0, 0, 1.4], glaive: [0, 0, -1.5], armL: [0.6, 0, 0.4] }],
    [0.75, { 'all.p': [0.12, 0, 0], body: [0, 2.6, -0.05], armR: [0, 0, 1.5], glaive: [0, 0, -1.6], armL: [0.9, 0, 0.2] }],
    [1.05, { 'all.p': [0.2, 0, 0], body: [0, 6.283, -0.2], armR: [0, 0, 1.5], glaive: [0, 0, -1.65], armL: [0.8, 0, 0.3] }],
    [1.3, { 'all.p': [0.2, 0, 0], body: [0, 6.6, -0.15], armR: [0, 0, 1.3], glaive: [0, 0, -1.4], armL: [0.5, 0, 0.3] }],
    [1.7, { 'all.p': [0.15, 0, 0], body: [0, 6.283, 0], armR: ZERO, glaive: ZERO, armL: ZERO }],
  ], { hit: 1.05, reach: 1.35 }),

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
  n: clip(0.4, [[0.4, { body: [0, 0, 0.1], head: [0, 0, 0.2], lance: [0, 0, -0.5], shield: [0, -0.4, 0] }]]),
  b: clip(0.4, [[0.4, { body: [0, 0, 0.06], armR: [0, 0, 0.6], mace: [0, 0, -0.3], armL: [0, 0, 0.5] }]]),
  r: clip(0.4, [[0.4, { body: [0, 0, 0.03] }]]),
  q: clip(0.4, [[0.4, { armR: [0, 0, 0.6], glaive: [0, 0, -0.5], armL: [0, 0, 0.4], head: [0, 0, 0.1] }]]),
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
  // Reiter reißt den Schild hoch, das Pferd weicht ein Stück aus
  n: clip(0.8, [
    [0.15, { 'all.p': [-0.08, 0, 0.12], all: [0, 0.3, 0], body: [0, 0, 0.18], head: [0, 0, 0.3], shield: [0, -0.9, 0], 'shield.p': [0.05, 0.05, 0.02], rider: [0, 0, 0.15], lance: [0, 0, 0.3] }],
    [0.4, { 'all.p': [-0.1, 0, 0.1], all: [0, 0.2, 0], body: [0, 0, 0.1], head: [0, 0, 0.15], shield: [0, -0.9, 0], 'shield.p': [0.05, 0.05, 0.02], rider: [0, 0, 0.1], lance: [0, 0, 0.2] }],
    [0.8, { 'all.p': ZERO, all: ZERO, body: ZERO, head: ZERO, shield: ZERO, 'shield.p': ZERO, rider: ZERO, lance: ZERO }],
  ]),
  // Streitkolben quer vor den Körper
  b: clip(0.8, [
    [0.12, { armR: [0, 0, 1.4], mace: [1.4, 0, -0.6], armL: [0, 0, 1.3], body: [0, 0, 0.1] }],
    [0.3, { armR: [0, 0, 1.3], mace: [1.4, 0, -0.5], armL: [0, 0, 1.2], body: [0, 0, 0.22], 'all.p': [-0.07, 0, 0] }],
    [0.8, { armR: ZERO, mace: ZERO, armL: ZERO, body: ZERO, 'all.p': ZERO }],
  ]),
  // Turm steckt den Treffer weg und bebt
  r: clip(0.7, [[0.1, { body: [0.04, 0, 0.06] }], [0.2, { body: [-0.04, 0, -0.03] }], [0.3, { body: [0.02, 0, 0.03] }], [0.7, { body: ZERO }]]),
  // Glefe schräg vor den Körper
  q: clip(0.8, [
    [0.12, { armR: [-0.2, 0, 1.2], glaive: [1.1, 0, -0.4], armL: [0.2, 0, 1.2], body: [0, 0, 0.1] }],
    [0.3, { armR: [-0.2, 0, 1.1], glaive: [1.1, 0, -0.3], armL: [0.2, 0, 1.1], body: [0, 0, 0.22], 'all.p': [-0.08, 0, 0] }],
    [0.8, { armR: ZERO, glaive: ZERO, armL: ZERO, body: ZERO, 'all.p': ZERO }],
  ]),
  // Parade: Klinge quer nach oben
  k: clip(0.8, [
    [0.12, { armR: [0, 0, 1.9], sword: [0, 0, 1.2], torso: [0, 0, 0.1], armL: [0, 0, 0.5] }],
    [0.3, { armR: [0, 0, 1.8], sword: [0, 0, 1.1], torso: [0, 0, 0.25], 'all.p': [-0.08, 0, 0] }],
    [0.8, { armR: ZERO, sword: ZERO, torso: ZERO, armL: ZERO, 'all.p': ZERO }],
  ]),
};
// womit abgewehrt wird – bestimmt Effekt und Klang
export const BLOCK_KIND = { p: 'shield', n: 'shield', k: 'blade', b: 'blade', q: 'blade', r: 'wall' };
export const RANGED = { r: true };

// Niederlage ab dem Treffer; am Ende zerspringt die Figur
export const DEFEAT = {
  // zurückgeworfen, sinkt auf die Knie
  p: clip(0.8, [
    [0, { torso: [0, 0, 0.1], armL: [0, 0, 0.35] }],
    [0.15, { 'all.p': [-0.18, 0, 0], torso: [0, 0, 0.55], head: [0, 0, 0.3], armL: [0, 0, -0.4], armR: [0, 0, -0.6] }],
    [0.55, { 'all.p': [-0.22, -0.08, 0], torso: [0, 0, -0.35], head: [0, 0, -0.2], legL: [0, 0, 0.9], legR: [0, 0, -0.5], armL: [0, 0, 0.2], armR: [0, 0, 0.3] }],
    [0.8, { 'all.p': [-0.22, -0.1, 0], torso: [0, 0, -0.5], head: [0, 0, -0.2], legL: [0, 0, 0.9], legR: [0, 0, -0.5] }],
  ]),
  // Pferd bäumt sich auf, der Reiter sackt zusammen, beide kippen zur Seite
  n: clip(0.9, [
    [0, { body: [0, 0, 0.1], head: [0, 0, 0.2], lance: [0, 0, -0.5] }],
    [0.25, { 'all.p': [-0.15, 0, 0], body: [0, 0, 0.55], neck: [0, 0, -0.3], frontL: [0, 0, 1.0], kneeL: [0, 0, -1.4], frontR: [0, 0, 0.8], kneeR: [0, 0, -1.2], rider: [0, 0, 0.5], lance: [0, 0, 0.6] }],
    [0.7, { 'all.p': [-0.2, -0.04, 0], all: [1.2, 0, 0], body: [0, 0, 0.1], frontL: [0, 0, 0.4], frontR: [0, 0, 0.6], rider: [0.4, 0, 0.8], lance: [0, 0, 1.0] }],
    [0.9, { 'all.p': [-0.2, -0.06, 0], all: [1.35, 0, 0], rider: [0.5, 0, 0.9] }],
  ]),
  // taumelt, dreht sich weg, der Streitkolben entgleitet
  b: clip(1.0, [
    [0, { body: [0, 0, 0.06], armR: [0, 0, 0.6], mace: [0, 0, -0.3] }],
    [0.2, { 'all.p': [-0.15, 0, 0], body: [0, 0, 0.45], head: [0, 0, 0.35], armR: [0, 0, -0.6], armL: [-0.8, 0, 0.4] }],
    [0.6, { 'all.p': [-0.2, 0, 0], all: [0, 0.8, 0], body: [0, 0, -0.3], head: [0, 0, -0.2], armR: [0, 0, 0.2], 'mace.p': [0, -0.2, 0], mace: [0.9, 0, 0.6] }],
    [1.0, { 'all.p': [-0.2, -0.1, 0], all: [0, 1.2, 0], body: [0, 0, -0.55], 'mace.p': [0, -0.3, 0], mace: [1.4, 0, 1.2] }],
  ]),
  // bebt, Risse glühen, neigt sich nach hinten – die Zinnen rutschen ab
  r: clip(0.9, [
    [0, { body: [0, 0, 0.03] }],
    [0.1, { body: [0.05, 0, 0.06] }], [0.2, { body: [-0.05, 0, -0.04] }], [0.3, { body: [0.03, 0, 0.05] }],
    [0.9, { body: [0.12, 0, 0.35], 'top.p': [-0.08, -0.04, 0.05], top: [0.2, 0.3, 0.4] }],
  ], { boxes: true }),
  // wirbelt herum und sinkt nieder, Glefe und Krone fallen
  q: clip(1.1, [
    [0, { armR: [0, 0, 0.6], glaive: [0, 0, -0.5] }],
    [0.15, { 'all.p': [-0.12, 0, 0], body: [0, 0, 0.35], head: [0, 0, 0.3], armL: [0.9, 0, 0.2], armR: [-0.9, 0, 0.2] }],
    [0.7, { 'all.p': [-0.15, -0.04, 0], all: [0, 3.4, 0], body: [0, 0, -0.1], armL: [0.4, 0, 0], armR: [-0.4, 0, 0], 'crown.p': [-0.06, 0.08, 0], crown: [0, 0, 0.6], 'glaive.p': [0, -0.15, 0], glaive: [0.7, 0, 0.4] }],
    [1.1, { 'all.p': [-0.15, -0.12, 0], all: [0, 3.6, 0], body: [0, 0, -0.45], head: [0, 0, -0.3], 'crown.p': [-0.25, -0.3, 0.05], crown: [0.4, 0, 1.6], 'glaive.p': [0, -0.25, 0], glaive: [1.3, 0, 0.6] }],
  ]),
};
DEFEAT.k = DEFEAT.p;   // ein König wird nie geschlagen – nur zur Sicherheit
