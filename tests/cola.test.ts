import { describe, expect, it, vi } from 'vitest';
import * as game from '../src/sim/game';
import * as combat from '../src/sim/combat';
import * as zombies from '../src/sim/zombies';
import * as inv from '../src/sim/inventory';
import { SIM_DT } from '../src/sim/core';
import type { GameState, InputState, Zombie } from '../src/sim/types';

vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });

const input = (s: GameState, fire: boolean, pressed: string[] = []): InputState => ({
  moveX: 0, moveY: 0, aimX: s.player.x + 200, aimY: s.player.y, fire, firePressed: fire, altPressed: false, sprint: false, interactHeld: false, pressed: new Set(pressed) as InputState['pressed'],
});
/** A player holding Cola & Mints with a walker 120px to the right, nothing else around. */
function setup() {
  const s = game.newGame(9), p = s.player;
  inv.bind(s);
  s.zombies.length = 0;
  p.inv.equip.primary = { id: 'cola_mints', qty: 1, mag: combat.WEAPONS.cola_mints.magSize };
  inv.add(p.inv, 'mints', 3);
  combat.switchTo(s, 'primary');
  // find open ground
  for (let x = 2000; x < 14000; x += 97) if (s.grid.query(x - 300, p.y - 120, 600, 240).length === 0) { p.x = x; break; }
  return s;
}

describe('Cola & Mints', () => {
  it('sprays sticky foam that slows and eats away at zombies', () => {
    const s = setup(), p = s.player;
    const z = zombies.spawn(s, 'walker', p.x + 120, p.y) as Zombie;
    z.speed = 0; z.hp = z.maxHp = 5000;   // survive the spray so the acid can be measured
    for (let i = 0; i < 60; i++) { combat.update(s, input(s, true), SIM_DT); zombies.update(s, SIM_DT); }
    expect(Number(z.stickyStacks)).toBeGreaterThan(1);
    expect(zombies.stickySlow(z)).toBeLessThan(0.75);
    expect(s.events.some(e => e.t === 'shot')).toBe(false);          // no muzzle flash / casings
    expect(s.events.some(e => e.t === 'bulletHit' && e.sticky && e.surface === 'flesh')).toBe(true); // cola impact art
    // the acid keeps hurting after you stop spraying, then wears off
    const hp = z.hp;
    for (let i = 0; i < 60 * 2; i++) zombies.update(s, SIM_DT);
    expect(z.hp).toBeLessThan(hp);
    for (let i = 0; i < 60 * 3; i++) zombies.update(s, SIM_DT);
    expect(Number(z.sticky)).toBe(0); expect(zombies.stickySlow(z)).toBe(1);
    void hp;
  });

  it('a slowed zombie walks slower; bosses resist half', () => {
    const z = { sticky: 2, stickyStacks: 6 } as unknown as Zombie;
    expect(zombies.stickySlow(z)).toBeCloseTo(0.35);
    expect(zombies.stickySlow({ ...z, boss: 'butcher' } as unknown as Zombie)).toBeCloseTo(0.675);
  });

  it('one mint refills the whole bottle', () => {
    const s = setup(), p = s.player, st = p.inv.equip.primary!;
    st.mag = 3;
    combat.update(s, input(s, false, ['reload']), SIM_DT);
    combat.reload(s);
    for (let i = 0; i < 60 * 2; i++) combat.update(s, input(s, false), SIM_DT);
    expect(st.mag).toBe(combat.WEAPONS.cola_mints.magSize);
    expect(inv.count(p.inv, 'mints')).toBe(2);
    expect(combat.ammoPerMag('cola_mints')).toBe(1);
  });
});
