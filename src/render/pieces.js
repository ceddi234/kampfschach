// Figuren und Materialien im Low-Poly-Look (Look A aus look-entwuerfe/look.html).
// Alles prozedural: Drehkörper (Lathe) mit wenigen Segmenten + flache Schattierung = facettierter Marmor.
import * as THREE from 'three';
import { hdr, GLOW_HEX } from './util.js';

export const SEG = 10;

// Marmor-Maserung per Shader-Patch; world = Muster in Weltkoordinaten (Brett), sonst pro Figur.
// glow = Farbe der leuchtenden Adern erwachter Figuren (Stärke über uniforms.uVein animierbar).
const STONE_GLSL = `
varying vec3 vStonePos;
uniform float uMarble; uniform float uScale; uniform vec3 uVeinColor; uniform float uVein;
float waves(vec3 p, float w) {
  float t = p.y*3.1 + 1.7*sin(p.x*2.3 + p.z*1.3) + 1.1*sin(p.z*3.7 - p.y*1.9) + 0.6*sin(p.x*5.1 + p.y*4.3);
  return 1.0 - smoothstep(0.0, w, abs(sin(t)));
}
float waves2(vec3 p, float w) {
  float t = p.x*2.7 - 1.3*sin(p.y*3.1 + p.z*2.1) + 0.9*sin(p.z*4.3 + p.x*1.2) + p.z*1.9;
  return 1.0 - smoothstep(0.0, w, abs(sin(t)));
}
`;
function stone(mat, { veins, world, glow }) {
  const u = mat.userData.uniforms = {
    uMarble: { value: veins }, uScale: { value: world ? 1.6 : 6 },
    uVeinColor: { value: new THREE.Color(glow ?? 0) }, uVein: { value: glow === undefined ? 0 : 1.4 },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vStonePos;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>\n vStonePos = ${world ? '(modelMatrix * vec4(position, 1.0)).xyz' : 'position'};`);
    let frag = STONE_GLSL + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 mp = vStonePos * uScale;
      diffuseColor.rgb *= 1.0 - uMarble * (0.55 * waves(mp * 0.7, 0.35) + 0.3 * waves2(mp * 0.9, 0.25));`);
    if (glow !== undefined) frag = frag.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += uVeinColor * uVein * max(waves(mp * 0.8, 0.05), 0.6 * waves2(mp, 0.035));`);
    sh.fragmentShader = frag;
  };
  mat.customProgramCacheKey = () => `stone-${world ? 'w' : 'o'}-${glow === undefined ? 'n' : 'g'}`;
  return mat;
}
function makeMat(color, { rough = 0.45, metal = 0, veins = 0, world = false, glow } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: true });
  return veins || glow !== undefined ? stone(m, { veins, world, glow }) : m;
}

export const MAT = {
  white: makeMat(0xe2d9c8, { veins: 0.22 }),
  black: makeMat(0x2b2734, { rough: 0.22, metal: 0.05 }),
  sqLight: makeMat(0xc4b496, { rough: 0.5, veins: 0.3, world: true }),
  sqDark: makeMat(0x5c3d2a, { rough: 0.6, veins: 0.35, world: true }),
  frame: makeMat(0x2a1a12, { rough: 0.55 }),
  gold: makeMat(0xc9a14a, { rough: 0.55, metal: 1 }),
  table: makeMat(0x17121c, { rough: 0.9 }),
};
// erwachte Figuren: gleicher Stein, dazu leuchtende Adern
export const AWAKE = {
  w: makeMat(0xe8e0d0, { veins: 0.15, glow: GLOW_HEX.w }),
  b: makeMat(0x2b2734, { rough: 0.22, metal: 0.05, glow: GLOW_HEX.b }),
};
// reines Leuchten (Augen, Runen, Waffenspitzen)
export const GLOW = {
  w: new THREE.MeshBasicMaterial({ color: hdr(GLOW_HEX.w, 3) }),
  b: new THREE.MeshBasicMaterial({ color: hdr(GLOW_HEX.b, 3) }),
};

// ---------- Geometrie ----------
export const arc = (cy, r, a0, a1, n = 6) => Array.from({ length: n + 1 }, (_, i) => {
  const t = a0 + (a1 - a0) * i / n;
  return [r * Math.sin(t), cy + r * Math.cos(t)];
});
export const latheGeo = (pts, seg = SEG) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
const BASE = [[0, 0], [0.34, 0], [0.35, 0.035], [0.32, 0.07], [0.29, 0.085], [0.29, 0.12], [0.25, 0.15]];
export const PEDESTAL = latheGeo([...BASE, [0.22, 0.17], [0, 0.17]]);   // Sockel, auf dem auch die erwachten Figuren stehen
const PROFILES = {
  p: [...BASE, [0.17, 0.19], [0.115, 0.33], [0.10, 0.40], [0.165, 0.425], [0.165, 0.445], [0.09, 0.465], ...arc(0.56, 0.125, 2.45, 0)],
  r: [...BASE, [0.235, 0.18], [0.19, 0.24], [0.18, 0.52], [0.235, 0.56], [0.25, 0.60], [0.25, 0.72], [0.18, 0.72], [0.18, 0.66], [0, 0.66]],
  b: [...BASE, [0.22, 0.18], [0.15, 0.25], [0.105, 0.50], [0.175, 0.53], [0.175, 0.555], [0.095, 0.575], [0.125, 0.62], [0.135, 0.68], [0.12, 0.75], [0.085, 0.81], [0.035, 0.855], [0, 0.865]],
  q: [...BASE, [0.235, 0.18], [0.16, 0.26], [0.105, 0.60], [0.185, 0.64], [0.185, 0.665], [0.11, 0.69], [0.13, 0.78], [0.185, 0.88], [0.165, 0.895], [0.10, 0.88], [0, 0.89]],
  k: [...BASE, [0.235, 0.18], [0.16, 0.26], [0.115, 0.66], [0.195, 0.70], [0.195, 0.725], [0.125, 0.75], [0.15, 0.86], [0.165, 0.92], [0.10, 0.945], [0, 0.95]],
  n: [...BASE, [0.235, 0.18], [0.21, 0.22], [0, 0.22]],
};
const GEO = Object.fromEntries(Object.entries(PROFILES).map(([t, pts]) => [t, latheGeo(pts)]));

export const KNIGHT_HEAD = (() => {
  const P = [[-0.17, 0.20], [0.15, 0.20], [0.17, 0.30], [0.11, 0.39], [0.19, 0.46], [0.27, 0.51], [0.28, 0.575], [0.21, 0.62], [0.10, 0.70],
             [0.065, 0.77], [0.03, 0.85], [-0.03, 0.76], [-0.12, 0.68], [-0.19, 0.50]];
  const s = new THREE.Shape();
  s.moveTo(...P[0]); P.slice(1).forEach((p) => s.lineTo(...p)); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -0.07);
  return g;
})();
export const MERLON = new THREE.BoxGeometry(0.075, 0.08, 0.11);
const BALL_S = new THREE.IcosahedronGeometry(0.032, 0);
const BALL_M = new THREE.IcosahedronGeometry(0.042, 0);
const BALL_L = new THREE.IcosahedronGeometry(0.055, 0);
const CROSS_V = new THREE.BoxGeometry(0.05, 0.17, 0.05);
const CROSS_H = new THREE.BoxGeometry(0.15, 0.05, 0.05);

function part(geo, mat, parent, pos, rotY = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  if (pos) m.position.set(...pos);
  m.rotation.y = rotY;
  parent.add(m);
  return m;
}

export const KNIGHT_YAW = { w: 2.62, b: -0.52 };

// type: p r n b q k · color: w b
export function figurine(type, color) {
  const g = new THREE.Group(), mat = color === 'w' ? MAT.white : MAT.black;
  g.userData = { type, color };
  part(GEO[type], mat, g);
  if (type === 'r') for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    part(MERLON, mat, g, [Math.cos(a) * 0.215, 0.76, Math.sin(a) * 0.215], -a);
  }
  if (type === 'b') part(BALL_M, mat, g, [0, 0.9, 0]);
  if (type === 'q') {
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; part(BALL_S, mat, g, [Math.cos(a) * 0.17, 0.905, Math.sin(a) * 0.17]); }
    part(BALL_L, mat, g, [0, 0.94, 0]);
  }
  if (type === 'k') { part(CROSS_V, mat, g, [0, 1.03, 0]); part(CROSS_H, mat, g, [0, 1.05, 0]); }
  // Springer zeigen beiden Spielern ihr Profil, leicht zum Gegner gedreht
  if (type === 'n') part(KNIGHT_HEAD, mat, g, null, KNIGHT_YAW[color]);
  return g;
}
