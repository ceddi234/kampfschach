// Kleine Helfer für Szene, Effekte und Animationen (ohne DOM – auch in den Tests nutzbar)
import * as THREE from 'three';

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const Y_UP = V3(0, 1, 0);
export const hdr = (hex, k) => new THREE.Color(hex).multiplyScalar(k);   // Farbe über 1 → leuchtet im Bloom
export const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const easeBack = (k) => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);
export const smooth = (k) => k * k * (3 - 2 * k);
export const rand = (a, b) => a + Math.random() * (b - a);

// Leuchtfarben der beiden Seiten: Gold (Weiß) und Violett (Schwarz)
export const GLOW_HEX = { w: 0xffc45e, b: 0xb35cff };
