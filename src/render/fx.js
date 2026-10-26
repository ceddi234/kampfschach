// Effekte für die Kämpfe: Funken, Wirbel, Lichtblitz, Kanonenkugel, Hiebe, Druckwelle, Staub, Zerspringen.
// Jeder Effekt ist ein Tween des Bretts und räumt bei k = 1 hinter sich auf (wichtig fürs Überspringen).
// Positionen dürfen Funktionen sein – sie werden erst beim Start ausgewertet (Figuren bewegen sich ja).
import * as THREE from 'three';
import { V3, hdr, GLOW_HEX, rand, smooth } from './util.js';
import { DOT } from './textures.js';

const at = (p) => (typeof p === 'function' ? p() : p.clone());

export class FX {
  constructor(board) {
    this.b = board;
    this.scene = board.scene;
    // feste Lichter, die nur auf- und abgedreht werden – neue Lichter würden alle Shader neu übersetzen
    this.lights = Array.from({ length: 3 }, () => {
      const l = new THREE.PointLight(0xffffff, 0, 4, 2);
      this.scene.add(l);
      return l;
    });
    this.nextLight = 0;
  }

  #points(n, color, size) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, map: DOT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    p.frustumCulled = false;
    this.scene.add(p);
    return p;
  }

  #glowMesh(geo, side, k = 3, extra = {}) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: hdr(GLOW_HEX[side], k), transparent: true, depthWrite: false, ...extra }));
    m.frustumCulled = false;
    this.scene.add(m);
    return m;
  }

  #drop(o) {
    this.scene.remove(o);
    o.geometry?.dispose();
    o.material?.dispose();
  }

  // Funken stieben in alle Richtungen
  burst(center, side, { n = 40, speed = 1, size = 0.07, life = 0.7, delay = 0, color = GLOW_HEX[side], glow = 3 } = {}) {
    let pts, c, dirs;
    return this.b.tween(life, (k) => {
      if (!pts) {
        c = at(center);
        dirs = Array.from({ length: n }, () => V3(rand(-0.5, 0.5), rand(0, 0.9), rand(-0.5, 0.5)).normalize().multiplyScalar(rand(0.4, 1.1) * speed));
        pts = this.#points(n, hdr(color, glow), size);
      }
      const a = pts.geometry.attributes.position.array;
      dirs.forEach((d, i) => a.set([c.x + d.x * k, c.y + d.y * k - 0.5 * k * k, c.z + d.z * k], i * 3));
      pts.geometry.attributes.position.needsUpdate = true;
      pts.material.opacity = 1 - k;
      if (k >= 1) this.#drop(pts);
    }, delay);
  }

  // Lichtwirbel steigt um eine Figur auf (Erwachen / zurück zur Figur)
  swirl(center, side, { dur = 0.7, radius = 0.42, height = 1.1, n = 36, delay = 0 } = {}) {
    let pts, c, seeds;
    return this.b.tween(dur, (k) => {
      if (!pts) {
        c = at(center);
        seeds = Array.from({ length: n }, (_, i) => ({ a: (i / n) * Math.PI * 6, h: rand(0, 0.5), r: rand(0.7, 1.1) }));
        pts = this.#points(n, hdr(GLOW_HEX[side], 2.5), 0.06);
      }
      const a = pts.geometry.attributes.position.array;
      seeds.forEach((s, i) => {
        const ang = s.a + k * 7, rr = radius * s.r * (1 - 0.45 * k);
        a.set([c.x + Math.cos(ang) * rr, c.y + (s.h + k * 0.7) * height, c.z + Math.sin(ang) * rr], i * 3);
      });
      pts.geometry.attributes.position.needsUpdate = true;
      pts.material.opacity = Math.sin(Math.PI * k);
      if (k >= 1) this.#drop(pts);
    }, delay);
  }

  // kurzer Lichtblitz (färbt Brett und Figuren in der Nähe)
  flash(pos, side, { intensity = 6, dur = 0.4, delay = 0 } = {}) {
    let light;
    return this.b.tween(dur, (k) => {
      if (!light) {
        light = this.lights[this.nextLight++ % this.lights.length];
        light.color.setHex(GLOW_HEX[side]);
        light.position.copy(at(pos));
      }
      light.intensity = intensity * (1 - k) * (1 - k);
    }, delay);
  }

  // Geschoss im Bogen von a nach b, mit Leuchtspur
  projectile(from, to, side, { dur = 0.35, delay = 0, arc = 0.25, size = 0.07 } = {}) {
    let ball, trail, a, b;
    const hist = [];
    return this.b.tween(dur, (k) => {
      if (!ball) {
        a = at(from); b = at(to);
        ball = this.#glowMesh(new THREE.IcosahedronGeometry(size, 1), side, 4);
        trail = this.#points(16, hdr(GLOW_HEX[side], 2.5), size * 1.6);
      }
      const p = a.clone().lerp(b, k);
      p.y += Math.sin(Math.PI * k) * arc;
      ball.position.copy(p);
      hist.unshift(p);
      hist.length = Math.min(hist.length, 16);
      const arr = trail.geometry.attributes.position.array;
      for (let i = 0; i < 16; i++) arr.set((hist[i] || p).toArray(), i * 3);
      trail.geometry.attributes.position.needsUpdate = true;
      if (k >= 1) { this.#drop(ball); this.#drop(trail); }
    }, delay);
  }

  // leuchtender Bogen eines Hiebs: senkrecht (von oben nach vorn) oder waagerecht (Rundumschlag)
  slash(center, yaw, side, { delay = 0, radius = 0.55, horizontal = false } = {}) {
    let m;
    return this.b.tween(0.35, (k) => {
      if (!m) {
        m = this.#glowMesh(new THREE.TorusGeometry(radius, 0.03, 4, 32, Math.PI * (horizontal ? 1.4 : 0.85)), side, 3,
                           { blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
        m.position.copy(at(center));
        if (horizontal) { m.rotation.order = 'YXZ'; m.rotation.set(Math.PI / 2, yaw, 0); }
        else m.rotation.set(0, yaw, -0.6);
      }
      m.scale.setScalar(0.85 + 0.3 * k);
      m.material.opacity = 1 - k;
      if (k >= 1) this.#drop(m);
    }, delay);
  }

  // Staubwolke (Stein, Aufprall)
  dust(pos, { delay = 0 } = {}) {
    return this.burst(pos, 'w', { n: 26, speed: 0.5, size: 0.09, life: 0.6, color: 0xa79a86, glow: 0.9, delay });
  }

  // Druckwelle als Ring auf dem Brett
  shockwave(pos, side, { delay = 0, size = 1.3 } = {}) {
    let m;
    return this.b.tween(0.55, (k) => {
      if (!m) {
        m = this.#glowMesh(new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2), side, 2, { blending: THREE.AdditiveBlending });
        m.position.copy(at(pos)).setY(0.015);
      }
      m.scale.setScalar(0.1 + size * k);
      m.material.opacity = 1 - k;
      if (k >= 1) this.#drop(m);
    }, delay);
  }

  // Figur zerspringt: Splitter in ihrem Material fliegen weg, rollen aus und vergehen
  shatter(rig, away, { boxes = false, n = 46, life = 1.5 } = {}) {
    let shards, geo;
    return this.b.tween(life, (k) => {
      if (!shards) {
        rig.root.updateMatrixWorld(true);
        const spots = [], center = rig.root.position.clone();
        rig.root.traverse((o) => { if (o.isMesh && o.material === rig.mat && o.geometry.type !== 'LatheGeometry') spots.push(o.getWorldPosition(V3())); });
        if (!spots.length) spots.push(center.clone().setY(0.5));
        rig.root.visible = false;
        geo = boxes ? new THREE.BoxGeometry(0.075, 0.06, 0.075) : new THREE.TetrahedronGeometry(0.055, 0);
        shards = Array.from({ length: n }, (_, i) => {
          const m = new THREE.Mesh(geo, rig.mat);
          m.castShadow = true;
          const s0 = spots[i % spots.length].clone().add(V3(rand(-0.06, 0.06), rand(-0.06, 0.06), rand(-0.06, 0.06)));
          const out = s0.clone().sub(center).setY(0).normalize().multiplyScalar(rand(0.3, 1.0));
          const v = out.addScaledVector(away, rand(0.4, 1.1)).setY(rand(0.6, 1.8));
          m.userData = { s0, v, spin: V3(rand(-9, 9), rand(-9, 9), rand(-9, 9)), size: rand(0.5, 1.4) };
          m.position.copy(s0);
          this.scene.add(m);
          return m;
        });
        this.burst(center.clone().setY(0.5), rig.color, { n: 50, speed: 1.3 });
      }
      const t = k * life;
      for (const m of shards) {
        const { s0, v, spin, size } = m.userData;
        m.position.set(s0.x + v.x * t, Math.max(0.03, s0.y + v.y * t - 2.4 * t * t), s0.z + v.z * t);
        m.rotation.set(spin.x * t, spin.y * t, spin.z * t);
        m.scale.setScalar(size * (1 - smooth(Math.max(0, (k - 0.55) / 0.45))));
      }
      if (k >= 1) { shards.forEach((m) => this.scene.remove(m)); geo.dispose(); }
    });
  }
}
