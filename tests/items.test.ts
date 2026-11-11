import { describe, expect, it } from 'vitest';
import { ITEMS, RECIPES, RARITY_COLORS } from '../src/sim/items';
describe('item catalogue', () => {
  it('retains equipment, consumable and stack rules', () => {
    expect(ITEMS.pistol).toMatchObject({ type: 'weapon', slot: 'secondary', stack: 1 });
    expect(ITEMS.ammo_9mm.stack).toBe(240);
    expect(ITEMS.military_backpack.slots).toBe(12);
    expect(ITEMS.military_vest.armor).toBe(0.30);
    expect(ITEMS.bandage.use).toMatchObject({ heal: 15, stopBleed: true });
    for (const item of Object.values(ITEMS)) expect(item.color).toBe(RARITY_COLORS[item.rarity]);
  });
  it('has valid recipes and the legacy station requirements', () => {
    expect(RECIPES).toHaveLength(10);
    expect(RECIPES.find(r => r.id === 'ammo_9mm')).toMatchObject({ in: { gunpowder: 2, scrap: 3 }, out: { id: 'ammo_9mm', qty: 24 }, station: 'workbench' });
    expect(RECIPES.find(r => r.id === 'bandage')?.station).toBeNull();
    for (const r of RECIPES) for (const id of [r.out.id, ...Object.keys(r.in)]) expect(ITEMS[id]).toBeDefined();
  });
});
