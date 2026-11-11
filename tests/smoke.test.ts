// Scripted successor to legacy/tools/sv-smoke-test.js, using the actual sim and InputState.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import type { Action, Container, GameState, InputState, Vec } from '../src/sim/types';

const exists = ['items', 'inventory', 'loot', 'save', 'progression', 'combat', 'base'].every(name => existsSync(new URL(`../src/sim/${name}.ts`, import.meta.url)));
afterEach(() => vi.unstubAllGlobals());
describe.skipIf(!exists)('full survival smoke run', () => {
  it('loots, equips, fights, levels, unlocks, builds, crafts, survives a horde, dies and continues', async () => {
    const sim = await import('../src/sim/index');
    const { game, core, inventory: inv, progression, base, items, zombies, player } = sim;
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) });
    const s = game.newGame(12345), p = s.player;
    const input = (extra: Partial<InputState> = {}): InputState => ({ moveX: 0, moveY: 0, aimX: p.x + 100, aimY: p.y, fire: false, firePressed: false, altPressed: false, sprint: false, interactHeld: false, pressed: new Set(), ...extra });
    const tick = (extra: Partial<InputState> = {}) => game.step(s, input(extra), core.SIM_DT);
    const tap = (action: Action, extra: Partial<InputState> = {}) => tick({ pressed: new Set([action]), ...extra });
    const run = (n: number, extra: Partial<InputState> = {}) => { for (let i = 0; i < n; i++) tick(extra); };
    expect(s.buildings.length).toBeGreaterThan(50); expect(s.containers.length).toBeGreaterThan(100);

    // Find an accessible real container, just as the legacy bot teleports for each scenario.
    function standBeside(c: Container): Vec | null {
      for (let r = 16; r < 70; r += 6) for (let a = 0; a < Math.PI * 2; a += 0.15) {
        const x = c.x + c.w / 2 + Math.cos(a) * (c.w / 2 + r), y = c.y + c.h / 2 + Math.sin(a) * (c.h / 2 + r);
        const d = Math.hypot(x - core.clamp(x, c.x, c.x + c.w), y - core.clamp(y, c.y, c.y + c.h));
        if (d < 65 && core.phys.isFree(s, x, y, p.r) && core.phys.canReach(s, x, y, c)) return { x, y };
      }
      return null;
    }
    const sorted = s.containers.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    const c = sorted.find(c => standBeside(c))!, pos = standBeside(c)!;
    p.x = pos.x; p.y = pos.y; tap('interact', { interactHeld: true });
    const searched = s.search!.target;
    for (let i = 0; i < 180 && !searched.searched; i++) tick({ interactHeld: true });
    expect(searched.searched).toBe(true); expect(s.ui).toBe('loot'); expect(searched.inv).not.toBeNull();
    const lootBefore = searched.inv!.slots.filter(Boolean).length;
    inv.takeAll(searched.inv!, p.inv); expect(lootBefore).toBeGreaterThan(0); game.setUi(s, null);
    for (const ui of ['inventory', 'tech', 'craft', 'map'] as const) {
      game.setUi(s, ui); const before = s.tick; tick(); expect(s.tick).toBe(before); game.setUi(s, null);
    }

    // Choose a real clearing for repeatable combat and base placement.
    let clearing: Vec | null = null;
    for (let y = 512; y < core.WORLD.h - 512 && !clearing; y += 128) for (let x = 512; x < core.WORLD.w - 512 && !clearing; x += 128) {
      if (core.phys.isFree(s, x, y, 240)) clearing = { x, y };
    }
    expect(clearing).not.toBeNull(); p.x = clearing!.x; p.y = clearing!.y;
    inv.add(p.inv, 'bat', 1); const bat = p.inv.slots.findIndex(s => s?.id === 'bat');
    expect(inv.equip(s, bat)).toBeTruthy(); expect(p.inv.equip.melee?.id).toBe('bat');
    tap('slot3'); expect(p.active).toBe('melee'); tap('slot2'); run(15);
    const victims = [zombies.spawn(s, 'walker', p.x + 100, p.y), zombies.spawn(s, 'walker', p.x + 130, p.y + 35)];
    for (const z of victims) for (let i = 0; i < 150 && !z.dead; i++) tick({ aimX: z.x, aimY: z.y, fire: true, firePressed: i % 20 === 0 });
    expect(victims.every(z => z.dead)).toBe(true); expect(s.stats.kills).toBeGreaterThanOrEqual(2);
    expect(s.events.some(e => e.t === 'shot')).toBe(true); expect.soft(s.events.some(e => e.t === 'bulletHit' && e.surface === 'flesh')).toBe(true);
    progression.addXP(s, 2000); expect(p.level).toBeGreaterThan(1); expect(p.sp).toBeGreaterThan(0);
    const tree = progression.TECH.trees.find(t => !t.workbench)!;
    const node = tree.nodes.find(n => !n.requires.length)!;
    for (const [id, qty] of Object.entries(node.cost.items)) inv.add(p.inv, id, qty);
    expect(progression.canUnlock(s, node.id).ok).toBe(true); expect(progression.unlock(s, node.id)).toBe(true); expect(p.tech[node.id]).toBe(true);

    // Clear carried clutter into a real drop so materials fit, then drive the build controls.
    for (let i = 0; i < p.inv.slots.length; i++) if (p.inv.slots[i]) inv.drop(s, i);
    for (const [id, qty] of Object.entries({ wood: 70, nails: 30, cloth: 20, scrap: 30, gunpowder: 10 })) expect(inv.add(p.inv, id, qty)).toBe(0);
    tap('build'); expect(s.ui).toBe('build');
    tick({ firePressed: true, aimX: p.x + 64, aimY: p.y + 64 });
    expect(s.structures.some(st => st.type === 'bed')).toBe(true);
    tap('cycleNext'); tap('cycleNext'); // bed -> stash -> workbench
    tick({ firePressed: true, aimX: p.x - 96, aimY: p.y + 64 });
    tap('cycleNext'); // workbench -> wood wall
    tick({ firePressed: true, aimX: p.x - 96, aimY: p.y - 96 });
    tick({ firePressed: true, aimX: p.x + 32, aimY: p.y - 96 });
    tap('build'); expect(s.ui).toBeNull();
    expect(s.structures.filter(st => st.type === 'wood_wall')).toHaveLength(2);
    expect(base.nearStation(s, 'workbench')).not.toBeNull();
    const recipe = items.RECIPES.find(r => r.station === 'workbench' && inv.canCraft(s, r.id).ok)!;
    expect(recipe).toBeDefined(); const beforeCraft = inv.count(p.inv, recipe.out.id);
    expect(inv.craft(s, recipe.id)).toBe(true); expect(inv.count(p.inv, recipe.out.id)).toBe(beforeCraft + recipe.out.qty);

    s.clock.day = 3; s.clock.t = 420 - core.SIM_DT / 2; tick();
    expect(game.isNight(s)).toBe(true); expect(s.events.some(e => e.t === 'night')).toBe(true);
    run(35); // The population director services its spawn queue every half second.
    expect(s.events).toContainEqual({ t: 'horde', count: zombies.hordeSize(3) }); expect(s.zombies.some(z => z.horde)).toBe(true);
    const bed = s.structures.find(st => st.type === 'bed')!; base.interact(s, bed);
    expect(s.clock.day).toBe(4); expect(game.isNight(s)).toBe(false);
    p.invuln = 0; player.damage(s, 99999, 0); tick();
    expect(s.screen).toBe('dead'); const bag = s.drops.find(d => d.kind === 'deathbag')!;
    expect(bag).toBeDefined(); expect(bag.life).toBe(Infinity); expect(s.stats.deaths).toBe(1);
    const equipment = structuredClone(p.inv.equip), level = p.level;
    game.respawn(s); expect(s.screen).toBe('playing'); expect(p.hp).toBe(60);
    expect(p.inv.equip).toEqual(equipment); expect(p.level).toBe(level);
    expect(Math.hypot(p.x - (bed.x + bed.w / 2), p.y - (bed.y + bed.h / 2 + 30))).toBeLessThan(1);
    expect(game.save(s)).toBe(true); expect(sim.save.has()).toBe(true);
    const restored = game.continueGame() as GameState;
    expect(restored).not.toBeNull(); expect(restored.seed).toBe(s.seed); expect(restored.clock).toEqual(s.clock);
    expect(restored.player.level).toBe(level); expect(restored.player.tech).toEqual(p.tech); expect(restored.player.inv.equip).toEqual(equipment);
    expect(restored.containers.filter(c => c.searched).length).toBe(s.containers.filter(c => c.searched).length);
    expect(restored.structures.map(st => [st.id, st.type, st.hp])).toEqual(s.structures.map(st => [st.id, st.type, st.hp]));
    expect(restored.drops.find(d => d.kind === 'deathbag')?.life).toBe(Infinity);
    for (let i = 0; i < 120; i++) game.step(restored, input(), core.SIM_DT);
    expect(Number.isFinite(restored.player.x)).toBe(true); expect(restored.zombies.every(z => Number.isFinite(z.x) && Number.isFinite(z.y))).toBe(true);
  }, 15000);
});
