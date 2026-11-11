import { describe, expect, it } from 'vitest';
import { barWidth, fmt, pct, weaponRows } from '../src/ui/format';
import { spatial } from '../src/audio';

describe('ui format helpers', () => {
  it('formats numbers', () => {
    expect(pct(0.256)).toBe('26%');
    expect(fmt(12)).toBe('12');
    expect(fmt(1.5, 1)).toBe('1.5');
    expect(fmt(undefined)).toBe('-');
  });
  it('rounds bar widths and clamps', () => {
    expect(barWidth(0.5)).toBe('50%');
    expect(barWidth(-1)).toBe('0%');
    expect(barWidth(3)).toBe('100%');
  });
  it('builds weapon rows', () => {
    const rows = weaponRows({ damage: 26, pellets: 1, fireRate: 0.3, magSize: 12, reloadTime: 1.3, spread: 0.03, ammo: 'ammo_9mm', range: 700, noise: 650 }, 8, '9mm Rounds', 24);
    const m = Object.fromEntries(rows);
    expect(m.Damage).toBe('26');
    expect(m.Magazine).toBe('8 / 12');
    expect(m.Ammo).toBe('9mm Rounds (24)');
    const melee = Object.fromEntries(weaponRows({ damage: 30, class: 'melee', melee: { range: 50 }, fireRate: 0.5 }, undefined, '', 0));
    expect(melee.Reach).toBe('50');
    expect(melee.Magazine).toBeUndefined();
  });
});

describe('audio spatial falloff', () => {
  it('is loudest at the listener and silent when far', () => {
    expect(spatial(0, 0, 0, 0).gain).toBe(1);
    expect(spatial(0, 0, 2000, 0).gain).toBe(0);
    expect(spatial(0, 0, 300, 0).gain).toBeLessThan(1);
  });
  it('pans toward the source side', () => {
    expect(spatial(0, 0, 400, 0).pan).toBeGreaterThan(0);
    expect(spatial(0, 0, -400, 0).pan).toBeLessThan(0);
    expect(spatial(0, 0, 0, 300).pan).toBe(0);
  });
});
