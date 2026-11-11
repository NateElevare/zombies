import { describe, it, expect, vi } from 'vitest';
import * as game from '../src/sim/game';
import * as inv from '../src/sim/inventory';
import * as progression from '../src/sim/progression';
import * as saves from '../src/sim/save';
import { ITEMS } from '../src/sim/items';

vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });

describe('gear upgrades', () => {
  it('spends one matching spare per armor level, up to level 5', () => {
    const s = game.newGame(3), p = s.player;
    inv.bind(s);
    inv.add(p.inv, 'police_vest', 6);
    const idx = p.inv.slots.findIndex(x => x?.id === 'police_vest');
    inv.equip(s, idx);
    const base = ITEMS.police_vest.armor!;
    expect(progression.playerMods(s).armor).toBeCloseTo(base);
    let u = inv.gearUpgrade(s, 'body')!;
    expect(u).toMatchObject({ level: 1, need: 1, have: 5, ok: true });
    expect(inv.upgradeGear(s, 'body')).toBe(true);
    expect(p.inv.equip.body!.lvl).toBe(2);
    expect(inv.count(p.inv, 'police_vest')).toBe(4);
    expect(progression.playerMods(s).armor).toBeCloseTo(base * 1.15);
    for (let i = 0; i < 3; i++) {
      expect(inv.gearUpgrade(s, 'body')!.need).toBe(1);
      expect(inv.upgradeGear(s, 'body')).toBe(true);
    }
    expect(p.inv.equip.body!.lvl).toBe(5);
    expect(inv.count(p.inv, 'police_vest')).toBe(1);
    u = inv.gearUpgrade(s, 'body')!;
    expect(u.ok).toBe(false); expect(u.next).toBeNull();
    expect(inv.upgradeGear(s, 'body')).toBe(false);
    expect(inv.count(p.inv, 'police_vest')).toBe(1);
    expect(progression.playerMods(s).armor).toBeCloseTo(base * 1.6);
  });

  it('levels weapons (damage up, loaded ammo refunded) and backpacks (more slots)', () => {
    const s = game.newGame(3), p = s.player;
    inv.bind(s);
    inv.add(p.inv, 'small_backpack', 2);
    inv.equip(s, p.inv.slots.findIndex(x => x?.id === 'small_backpack'));
    p.inv.equip.back!.lvl = 4; inv.recalcSize(s);
    const size0 = p.inv.size;
    expect(inv.gearUpgrade(s, 'back')).toMatchObject({ level: 4, need: 1, have: 1, ok: true });
    expect(inv.upgradeGear(s, 'back')).toBe(true);
    expect(p.inv.size).toBe(size0 + inv.PACK_STEP);
    inv.add(p.inv, 'pistol', 3, { mag: 5 });
    p.inv.equip.secondary = null;
    inv.equip(s, p.inv.slots.findIndex(x => x?.id === 'pistol'));
    const ammo0 = inv.count(p.inv, 'ammo_9mm');
    const dmg1 = progression.weaponStats(s, 'pistol').damage;
    expect(inv.gearUpgrade(s, 'secondary')).toMatchObject({ level: 1, need: 1, have: 2, stat: 'Damage' });
    expect(inv.upgradeGear(s, 'secondary')).toBe(true);
    expect(inv.gearUpgrade(s, 'secondary')).toMatchObject({ level: 2, need: 1, have: 1, ok: true });
    expect(inv.upgradeGear(s, 'secondary')).toBe(true);
    expect(inv.upgradeGear(s, 'secondary')).toBe(false);   // no matching spares left
    expect(p.inv.equip.secondary!.lvl).toBe(3);
    expect(inv.count(p.inv, 'ammo_9mm')).toBe(ammo0 + 10);
    expect(progression.weaponStats(s, 'pistol', 3).damage).toBeCloseTo(dmg1 * 1.24);
    const data = saves.deserialize(saves.serialize(s))!;
    const t = game.newGame(3);
    expect(saves.apply(t, data)).toBe(true);
    expect(t.player.inv.equip.secondary!.lvl).toBe(3);
    expect(t.player.inv.equip.back!.lvl).toBe(5);
  });

  it('refuses without enough spares or for non-armor slots, and keeps the level through a save', () => {
    const s = game.newGame(3), p = s.player;
    inv.bind(s);
    expect(inv.gearUpgrade(s, 'body')).toBeNull();
    inv.add(p.inv, 'cap', 1);
    inv.equip(s, p.inv.slots.findIndex(x => x?.id === 'cap'));
    expect(inv.upgradeGear(s, 'head')).toBe(false);
    p.inv.equip.head!.lvl = 3;
    const data = saves.deserialize(saves.serialize(s))!;
    const t = game.newGame(3);
    expect(saves.apply(t, data)).toBe(true);
    expect(t.player.inv.equip.head!.lvl).toBe(3);
  });
});
