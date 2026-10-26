// Erwachte Figuren: aus der Schachfigur wird ein lebendiges Steinwesen mit leuchtenden Adern.
// Jede Figur ist ein "Rig" aus Gelenken (Gruppen), die Clips aus clips.js drehen und verschieben.
// Lokales Koordinatensystem: +x schaut zum Gegner, +y nach oben, +z ist rechts. Alle stehen auf ihrem Sockel.
import * as THREE from 'three';
import { AWAKE, GLOW, PEDESTAL, latheGeo } from './pieces.js';
import { V3, Y_UP } from './util.js';

const RIG_SCALE = 1.15;   // erwacht etwas größer als die Figur
const cyl = (rt, rb, h, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg);
const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const cone = (r, h, seg = 4) => new THREE.ConeGeometry(r, h, seg);
const torus = (r, t, seg = 16) => new THREE.TorusGeometry(r, t, 4, seg);
const dome = (r) => new THREE.SphereGeometry(r, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2);

export class Rig {
  constructor(type, color) {
    this.type = type;
    this.color = color;
    this.mat = AWAKE[color];
    this.glow = GLOW[color];
    this.root = new THREE.Group();          // wird von außen platziert und gedreht
    const all = new THREE.Group();          // Ganzkörper-Gelenk für Clips ("all", "all.p")
    all.scale.setScalar(RIG_SCALE);
    this.root.add(all);
    this.j = { all };
    this.rest = new Map([[all, { p: all.position.clone(), r: all.rotation.clone() }]]);
    this.points = {};
  }

  joint(name, parent, pos = [0, 0, 0], rot = [0, 0, 0]) {
    const g = new THREE.Group();
    g.position.set(...pos);
    g.rotation.set(...rot);
    this.j[parent].add(g);
    this.j[name] = g;
    this.rest.set(g, { p: g.position.clone(), r: g.rotation.clone() });
    return g;
  }

  mesh(geo, parent, pos, rot, mat = this.mat) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = mat === this.mat;
    m.receiveShadow = mat === this.mat;
    if (pos) m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    this.j[parent].add(m);
    return m;
  }

  glowMesh(geo, parent, pos, rot) { return this.mesh(geo, parent, pos, rot, this.glow); }

  // Zylinder von a nach b (Glieder, Schäfte)
  limb(parent, a, b, r0, r1, seg = 6) {
    const A = V3(...a), B = V3(...b);
    const m = this.mesh(cyl(r1, r0, A.distanceTo(B), seg), parent);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(Y_UP, B.clone().sub(A).normalize());
    return m;
  }

  anchor(name, parent, pos) {
    const o = new THREE.Object3D();
    o.position.set(...pos);
    this.j[parent].add(o);
    this.points[name] = o;
  }

  world(name) {
    this.root.updateMatrixWorld(true);
    return this.points[name].getWorldPosition(V3());
  }

  // Pose: { gelenk: [rx, ry, rz], 'gelenk.p': [dx, dy, dz] } – relativ zur Ruhelage; nicht genannte Gelenke ruhen
  pose(values) {
    for (const [g, rest] of this.rest) { g.position.copy(rest.p); g.rotation.copy(rest.r); }
    for (const [ch, v] of Object.entries(values)) {
      const [name, kind] = ch.split('.'), g = this.j[name];
      if (!g) continue;
      const rest = this.rest.get(g);
      if (kind === 'p') g.position.set(rest.p.x + v[0], rest.p.y + v[1], rest.p.z + v[2]);
      else g.rotation.set(rest.r.x + v[0], rest.r.y + v[1], rest.r.z + v[2]);
    }
  }

  // Ganzkörper-Verschiebung aus dem Clip in die Platzierung übernehmen (vor dem Laufen)
  bake() {
    const off = this.j.all.position.clone().setY(0).applyAxisAngle(Y_UP, this.root.rotation.y);
    this.root.position.add(off);
    this.pose({});
  }

  dispose() {
    this.root.removeFromParent();
    this.root.traverse((o) => { if (o.isMesh && o.geometry !== PEDESTAL) o.geometry.dispose(); });
  }
}

// ---------- Bauer: Soldat mit Eisenhut (= Kugelkopf + Kragen der Figur), Schild und Speer ----------
function pawn(r) {
  r.mesh(PEDESTAL, 'all');
  r.joint('hips', 'all', [0, 0.41, 0]);
  for (const [n, z] of [['legL', -0.055], ['legR', 0.055]]) {
    r.joint(n, 'hips', [0, 0, z]);
    r.limb(n, [0, 0, 0], [0, -0.21, 0], 0.05, 0.04);
    r.mesh(box(0.11, 0.04, 0.07), n, [0.025, -0.225, 0]);
  }
  r.joint('torso', 'hips', [0, 0.01, 0]);
  r.mesh(cyl(0.09, 0.125, 0.1), 'torso', [0, -0.01, 0]);
  r.mesh(cyl(0.12, 0.09, 0.22), 'torso', [0, 0.13, 0]);
  r.joint('head', 'torso', [0, 0.32, 0]);
  r.mesh(ico(0.072, 1), 'head');
  r.mesh(dome(0.085), 'head', [0, 0.015, 0]);
  r.mesh(cyl(0.15, 0.15, 0.018, 10), 'head', [0, 0.015, 0]);
  for (const s of [-1, 1]) r.glowMesh(ico(0.013), 'head', [0.066, -0.015, s * 0.028]);
  r.joint('armL', 'torso', [0, 0.21, -0.12]);
  r.limb('armL', [0, 0, 0], [0.12, -0.06, -0.01], 0.035, 0.03);
  r.joint('shield', 'armL', [0.15, -0.04, 0]);
  r.mesh(cyl(0.17, 0.17, 0.035, 8), 'shield', null, [0, 0, -Math.PI / 2]);
  r.glowMesh(ico(0.035), 'shield', [0.025, 0, 0]);
  r.glowMesh(torus(0.115, 0.008, 24), 'shield', [0.02, 0, 0], [0, Math.PI / 2, 0]);
  r.joint('armR', 'torso', [0, 0.21, 0.12]);
  r.limb('armR', [0, 0, 0], [0.07, -0.13, 0.02], 0.035, 0.03);
  r.joint('spear', 'armR', [0.07, -0.13, 0.02], [0, 0, 0.25]);
  r.limb('spear', [-0.35, 0, 0], [0.45, 0, 0], 0.014, 0.014, 5);
  r.glowMesh(cone(0.03, 0.11), 'spear', [0.5, 0, 0], [0, 0, -Math.PI / 2]);
  r.anchor('tip', 'spear', [0.55, 0, 0]);
  r.anchor('hit', 'torso', [0.05, 0.12, 0]);
}

// ---------- Springer: steigendes Marmorpferd ----------
function knight(r) {
  r.mesh(PEDESTAL, 'all');
  const hip = [-0.22, 0.66];
  for (const [n, z] of [['hindL', -0.09], ['hindR', 0.09]]) {
    r.joint(n, 'all', [hip[0], hip[1], z]);
    r.limb(n, [0, 0, 0], [0.08, -0.24, 0], 0.075, 0.05);
    r.mesh(ico(0.05), n, [0.08, -0.24, 0]);
    r.limb(n, [0.08, -0.24, 0], [-0.04, -0.46, 0], 0.045, 0.034);
    r.mesh(cyl(0.04, 0.05, 0.05), n, [-0.04, -0.465, 0]);
  }
  r.joint('body', 'all', [hip[0], hip[1], 0]);
  r.mesh(new THREE.CapsuleGeometry(0.15, 0.34, 2, 8), 'body', [0.24, 0, 0], [0, 0, Math.PI / 2]).scale.set(1, 1, 0.82);
  r.joint('neck', 'body', [0.44, 0.04, 0]);
  r.limb('neck', [0, 0, 0], [0.2, 0.26, 0], 0.12, 0.085);
  r.mesh(ico(0.085), 'neck', [0.2, 0.26, 0]);
  const nd = V3(0.2, 0.26, 0).normalize(), nn = V3(-nd.y, nd.x, 0);
  for (let i = 0; i < 5; i++) {
    const c = r.mesh(cone(0.035, 0.11, 3), 'neck', nd.clone().multiplyScalar(0.33 * (0.1 + i * 0.2)).addScaledVector(nn, 0.08).toArray());
    c.quaternion.setFromUnitVectors(Y_UP, nn.clone().addScaledVector(nd, -0.4).normalize());
  }
  r.joint('head', 'neck', [0.2, 0.27, 0], [0, 0, -0.9]);
  r.limb('head', [0, 0, 0], [0.29, 0, 0], 0.08, 0.055);
  r.mesh(ico(0.06), 'head', [0.29, -0.005, 0]);
  for (const s of [-1, 1]) {
    r.mesh(cone(0.028, 0.1), 'head', [0.02, 0.075, s * 0.04], [s * 0.25, 0, 1.0]);
    r.glowMesh(ico(0.016), 'head', [0.1, 0.045, s * 0.062]);
  }
  for (const [n, kn, z] of [['frontL', 'kneeL', -0.075], ['frontR', 'kneeR', 0.075]]) {
    r.joint(n, 'body', [0.48, -0.06, z]);
    r.limb(n, [0, 0, 0], [0, -0.22, 0], 0.065, 0.045);
    r.joint(kn, n, [0, -0.22, 0]);
    r.mesh(ico(0.045), kn);
    r.limb(kn, [0, 0, 0], [0, -0.2, 0], 0.04, 0.032);
    r.mesh(cyl(0.036, 0.046, 0.055), kn, [0, -0.2, 0]);
  }
  r.anchor('hoof', 'kneeR', [0, -0.22, 0]);
  r.joint('tail', 'body', [-0.1, 0.05, 0]);
  r.limb('tail', [0, 0, 0], [-0.18, -0.3, 0], 0.05, 0.018);
  r.anchor('hit', 'body', [0.24, 0.02, 0]);
}

// ---------- Läufer: Magier mit Mitra (leuchtender Schlitz) und Stab ----------
function bishop(r) {
  r.mesh(PEDESTAL, 'all');
  r.joint('body', 'all', [0, 0.17, 0]);
  r.mesh(latheGeo([[0, 0], [0.22, 0], [0.2, 0.08], [0.15, 0.3], [0.12, 0.5], [0.11, 0.6], [0, 0.6]], 8), 'body');
  r.glowMesh(torus(0.118, 0.012), 'body', [0, 0.47, 0], [Math.PI / 2, 0, 0]);
  r.mesh(cyl(0.13, 0.11, 0.06, 8), 'body', [0, 0.6, 0]);
  r.joint('head', 'body', [0, 0.69, 0]);
  r.mesh(ico(0.07, 1), 'head');
  r.mesh(latheGeo([[0.075, 0], [0.085, 0.06], [0.07, 0.14], [0.035, 0.2], [0, 0.22]], 8), 'head', [0, 0.04, 0]);
  r.mesh(ico(0.03), 'head', [0, 0.27, 0]);
  r.glowMesh(box(0.012, 0.1, 0.06), 'head', [0.05, 0.15, 0], [0, 0, -0.5]);
  for (const s of [-1, 1]) r.glowMesh(ico(0.012), 'head', [0.064, 0, s * 0.026]);
  r.joint('armR', 'body', [0, 0.6, 0.13]);
  r.limb('armR', [0, 0, 0], [0.06, -0.17, 0.02], 0.035, 0.03);
  r.mesh(cone(0.06, 0.12, 6), 'armR', [0.045, -0.13, 0.015]);
  r.joint('staff', 'armR', [0.06, -0.17, 0.02]);
  r.limb('staff', [0, -0.32, 0], [0, 0.5, 0], 0.014, 0.014);
  r.mesh(torus(0.05, 0.012, 12), 'staff', [0, 0.56, 0]);
  r.glowMesh(ico(0.04, 1), 'staff', [0, 0.56, 0]);
  r.anchor('orb', 'staff', [0, 0.56, 0]);
  r.joint('armL', 'body', [0, 0.6, -0.13]);
  r.limb('armL', [0, 0, 0], [0.08, -0.15, -0.02], 0.035, 0.03);
  r.mesh(cone(0.06, 0.12, 6), 'armL', [0.06, -0.11, -0.015]);
  r.anchor('palm', 'armL', [0.1, -0.17, -0.02]);
  r.anchor('hit', 'body', [0.05, 0.42, 0]);
}

// ---------- Turm: lebendiger Wehrturm, öffnet die Zinnen und feuert eine Leuchtkugel ----------
function rook(r) {
  r.joint('body', 'all');
  r.mesh(latheGeo([[0, 0], [0.36, 0], [0.37, 0.04], [0.33, 0.08], [0.3, 0.1], [0.3, 0.14], [0.26, 0.17], [0.25, 0.22], [0.21, 0.3],
                   [0.2, 0.78], [0.26, 0.82], [0.27, 0.86], [0, 0.86]]), 'body');
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    r.glowMesh(box(0.02, 0.1, 0.035), 'body', [Math.cos(a) * 0.2, 0.55, Math.sin(a) * 0.2], [0, -a, 0]);
  }
  r.glowMesh(box(0.02, 0.08, 0.035), 'body', [0.205, 0.38, 0]);
  r.joint('top', 'body', [0, 0.86, 0]);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    r.mesh(box(0.09, 0.1, 0.13), 'top', [Math.cos(a) * 0.235, 0.05, Math.sin(a) * 0.235], [0, -a, 0]);
  }
  r.joint('cannon', 'body', [0, 0.6, 0], [0, 0, Math.PI / 2]);   // ruht senkrecht im Turm, fährt beim Angriff aus
  r.limb('cannon', [-0.08, 0, 0], [0.4, 0, 0], 0.09, 0.07, 8);
  r.glowMesh(torus(0.072, 0.014, 12), 'cannon', [0.4, 0, 0], [0, Math.PI / 2, 0]);
  r.anchor('muzzle', 'cannon', [0.44, 0, 0]);
  r.anchor('hit', 'body', [0.1, 0.5, 0]);
}

// ---------- Dame: Zauberin mit Krone und Lichtring ----------
function queen(r) {
  r.mesh(PEDESTAL, 'all');
  r.joint('body', 'all', [0, 0.17, 0]);
  r.mesh(latheGeo([[0, 0], [0.25, 0], [0.22, 0.06], [0.15, 0.3], [0.1, 0.5], [0.095, 0.58], [0, 0.58]]), 'body');
  r.mesh(cyl(0.11, 0.085, 0.16, 8), 'body', [0, 0.64, 0]);
  r.glowMesh(torus(0.1, 0.01), 'body', [0, 0.7, 0], [Math.PI / 2, 0, 0]);
  r.joint('head', 'body', [0, 0.8, 0]);
  r.mesh(ico(0.068, 1), 'head');
  for (const s of [-1, 1]) r.glowMesh(ico(0.011), 'head', [0.062, 0.005, s * 0.024]);
  r.glowMesh(torus(0.12, 0.008, 32), 'head', [0, 0.2, 0], [Math.PI / 2, 0, 0]);   // schwebender Lichtring über der Krone
  r.joint('crown', 'head', [0, 0.07, 0]);
  r.mesh(cyl(0.07, 0.06, 0.04, 10), 'crown');
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; r.mesh(cone(0.018, 0.07), 'crown', [Math.cos(a) * 0.065, 0.05, Math.sin(a) * 0.065]); }
  r.glowMesh(ico(0.022), 'crown', [0, 0.06, 0]);
  for (const [n, z] of [['armL', -0.11], ['armR', 0.11]]) {
    r.joint(n, 'body', [0, 0.69, z]);
    r.limb(n, [0, 0, 0], [0.05, -0.22, z * 0.15], 0.03, 0.024);
  }
  r.anchor('center', 'body', [0, 0.75, 0]);
  r.anchor('hit', 'body', [0.05, 0.45, 0]);
}

// ---------- König: Kriegerkönig mit Krone, Umhang und Zweihänder ----------
function king(r) {
  r.mesh(PEDESTAL, 'all');
  r.joint('hips', 'all', [0, 0.43, 0]);
  for (const [n, z] of [['legL', -0.07], ['legR', 0.07]]) {
    r.joint(n, 'hips', [0, 0, z]);
    r.limb(n, [0, 0, 0], [0, -0.23, 0], 0.06, 0.05);
    r.mesh(box(0.13, 0.05, 0.08), n, [0.03, -0.235, 0]);
  }
  r.joint('torso', 'hips', [0, 0.01, 0]);
  r.mesh(cyl(0.11, 0.14, 0.12, 8), 'torso');
  r.mesh(cyl(0.16, 0.12, 0.26, 6), 'torso', [0, 0.17, 0]);
  for (const s of [-1, 1]) r.mesh(dome(0.075), 'torso', [0, 0.29, s * 0.15]);
  r.joint('cape', 'torso', [-0.12, 0.29, 0]);
  r.mesh(box(0.025, 0.42, 0.28), 'cape', [-0.02, -0.2, 0], [0, 0, 0.12]);
  r.joint('head', 'torso', [0, 0.39, 0]);
  r.mesh(ico(0.08, 1), 'head');
  r.mesh(cyl(0.085, 0.08, 0.05, 10), 'head', [0, 0.06, 0]);
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; r.mesh(cone(0.02, 0.06), 'head', [Math.cos(a) * 0.08, 0.1, Math.sin(a) * 0.08]); }
  r.mesh(box(0.025, 0.1, 0.025), 'head', [0, 0.15, 0]);
  r.mesh(box(0.07, 0.025, 0.025), 'head', [0, 0.165, 0]);
  for (const s of [-1, 1]) r.glowMesh(ico(0.013), 'head', [0.073, 0, s * 0.03]);
  r.joint('armR', 'torso', [0, 0.27, 0.19]);
  r.limb('armR', [0, 0, 0], [0.08, -0.17, 0], 0.045, 0.038);
  r.anchor('shoulder', 'torso', [0, 0.27, 0.19]);
  r.joint('sword', 'armR', [0.08, -0.18, 0], [0, 0, -0.87]);   // Klinge ruht schräg nach vorn unten
  r.limb('sword', [-0.06, 0, 0], [0.05, 0, 0], 0.018, 0.018);
  r.mesh(box(0.03, 0.03, 0.16), 'sword', [0.05, 0, 0]);
  r.mesh(box(0.62, 0.05, 0.014), 'sword', [0.37, 0, 0]);
  r.glowMesh(box(0.6, 0.008, 0.016), 'sword', [0.37, 0.026, 0]);
  r.anchor('blade', 'sword', [0.6, 0, 0]);
  r.joint('armL', 'torso', [0, 0.27, -0.19]);
  r.limb('armL', [0, 0, 0], [0.1, -0.14, 0.02], 0.045, 0.038);
  r.mesh(ico(0.04), 'armL', [0.1, -0.15, 0.02]);
  r.anchor('hit', 'torso', [0.05, 0.15, 0]);
}

const BUILD = { p: pawn, n: knight, b: bishop, r: rook, q: queen, k: king };

export function makeRig(type, color) {
  const r = new Rig(type, color);
  BUILD[type](r);
  return r;
}
