import { describe, it, expect } from 'vitest';
import { sample, ATTACK, DEFEAT, GUARD } from '../src/render/clips.js';

describe('Clips', () => {
  it('interpoliert zwischen Schlüsselposen und hält danach die letzte', () => {
    const c = ATTACK.p;
    expect(sample(c, 0)['all.p']).toEqual([0, 0, 0]);                 // vor dem ersten Schlüssel: Ruhelage
    expect(sample(c, 0.5)['all.p']).toEqual([0.28, 0, 0]);            // genau auf dem Schlüssel
    const mid = sample(c, 0.4)['all.p'][0];
    expect(mid).toBeGreaterThan(-0.06);
    expect(mid).toBeLessThan(0.28);
    expect(sample(c, 99)['all.p']).toEqual([0.15, 0, 0]);
  });

  it('hat für jede Figur Angriff, Abwehr und Niederlage', () => {
    for (const t of 'pnbrqk') {
      expect(ATTACK[t].hit).toBeLessThan(ATTACK[t].dur);
      expect(ATTACK[t].reach).toBeGreaterThan(0.5);
      expect(GUARD[t]).toBeTruthy();
      expect(DEFEAT[t]).toBeTruthy();
    }
    for (const t of 'br') expect(ATTACK[t].launch).toBeLessThan(ATTACK[t].hit);   // Fernkampf: erst abfeuern, dann treffen
  });
});
