// The Hive Below, the cells beyond the Warrens: the eight later insects, the nine later weapons, the six later bosses,
// the cell hazards and the places the missions happen at. Driven through the sim (no Phaser), like tests/hive.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';
// whole missions are simulated here: on a busy machine a case can take longer than vitest's five seconds
vi.setConfig({ testTimeout: 60_000 });
import * as core from '../src/sim/core';
import * as road from '../src/sim/road';
import * as zombies from '../src/sim/zombies';
import * as hive from '../src/sim/hive';
import * as bugsMod from '../src/sim/hive-bugs';
import * as arms from '../src/sim/hive-arms';
import * as hiveBosses from '../src/sim/hive-bosses';
import * as bosses from '../src/sim/bosses';
import * as combat from '../src/sim/combat';
import * as inv from '../src/sim/inventory';
import * as game from '../src/sim/game';
import { HIVE_MISSIONS } from '../src/sim/hive-data';
import { TILE, isFloor, zoneAt } from '../src/sim/hive-world';
import { vents } from '../src/sim/hive-sites';
import { ITEMS, RARITY_COLORS } from '../src/sim/items';
import type { GameState, InputState, Zombie, ZombieType } from '../src/sim/types';

type HBug = bugsMod.HBug;
const input = (s: GameState, extra: Partial<InputState> = {}): InputState => ({ moveX: 0, moveY: 0, aimX: s.player.x + 100, aimY: s.player.y, fire: false, firePressed: false, altPressed: false, sprint: false, interactHeld: false, pressed: new Set(), ...extra } as InputState);
const tick = (s: GameState, extra: Partial<InputState> = {}) => road.stepRoad(s, input(s, extra), core.SIM_DT);
const run = (s: GameState, n: number, extra: Partial<InputState> = {}) => { for (let i = 0; i < n; i++) tick(s, extra); };
const secs = (s: GameState, t: number, extra: Partial<InputState> = {}) => run(s, Math.round(t * 60), extra);
const bugs = (s: GameState) => s.zombies.filter(z => !z.dead && !z.boss && !zombies.isInert(z));
const clear = (s: GameState) => { for (const z of s.zombies) if (!z.boss) z.dead = true; run(s, 1); hive.reset(s); };
const teleport = (s: GameState, p: { x: number; y: number }) => { s.player.x = s.player.prevX = p.x; s.player.y = s.player.prevY = p.y; };
const mid = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const idx = (id: string) => HIVE_MISSIONS.findIndex(m => m.id === id);

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k), clear: () => store.clear() };
});
function start(): GameState {
  road.devUnlockHiveBelow();
  const s = road.newHiveBelow()!;
  s.dev = { god: true } as GameState['dev'];
  return s;
}
/** A mission of the campaign, playing, with nothing on the map but its fixtures. `at` is the middle of its boss arena (or of a site). */
function cell(id: string, site?: string) {
  const s = start(); road.startMission(s, idx(id)); s.ui = null; tick(s);
  clear(s);
  const w = s.road!.world, h = w.hive!, zone = HIVE_MISSIONS[idx(id)].sector || 8;
  const c = site ? mid((w.sites as Record<string, { x: number; y: number; w: number; h: number }>)[site]) : h.arenas[Math.min(zone, 7)];
  teleport(s, c);
  s.player.flashlight = true; s.player.angle = 0;
  s.road!.ambientT = 1e9;   // nothing wanders in while a test is measuring
  return { s, c, h };
}
/** An ordinary bug of the hive at an offset from the player, already hunting unless `idle`. */
function bug(s: GameState, type: ZombieType, dx: number, dy = 0, idle = false): HBug {
  const z = (idle ? zombies.spawn(s, type, s.player.x + dx, s.player.y + dy) : hive.spawnBug(s, type, s.player.x + dx, s.player.y + dy)) as HBug;
  z.angle = z.prevAngle = Math.atan2(-dy, -dx);
  z.tough = true;   // base numbers: the cell's toughness is tested on its own
  return z;
}
const mortal = (s: GameState) => { s.dev = { god: false } as GameState['dev']; s.player.hp = s.player.maxHp = 1000; s.player.invuln = 0; };
/** Arm the player with one weapon (loaded) and plenty of ichor. */
function arm(s: GameState, id: string) {
  const p = s.player, slot = ITEMS[id].slot as 'primary' | 'secondary' | 'melee';
  p.inv.slots.fill(null);
  p.inv.equip[slot] = { id, qty: 1, ...(combat.WEAPONS[id].magSize ? { mag: combat.WEAPONS[id].magSize } : {}) };
  inv.add(p.inv, 'ichor', 600);
  p.active = slot; p.fireCooldown = 0; p.reloadTimer = 0;
  return p.inv.equip[slot]!;
}
const fire = (s: GameState, n = 1) => { for (let i = 0; i < n; i++) { s.player.fireCooldown = 0; tick(s, { fire: true, firePressed: true }); } };

describe('the insects of the later cells', () => {
  it('every one is a hive type with numbers from the plan, and art to match', () => {
    const want: Record<string, [number, number, number, number]> = { hopper: [11, 18, 105, 6], shrieker: [14, 45, 55, 6], stinger: [12, 28, 120, 8], spitter: [17, 65, 50, 16], shieldback: [23, 230, 44, 28], lurker: [16, 95, 60, 32], dustwing: [13, 30, 95, 5], skitterer: [10, 22, 145, 5] };
    for (const [id, [r, hp, speed, damage]] of Object.entries(want)) {
      const t = zombies.TYPES[id as ZombieType];
      expect([t.r, t.hp, t.speed, t.damage], id).toEqual([r, hp, speed, damage]);
      expect(zombies.isHiveType(id as ZombieType)).toBe(true);
    }
    for (const t of ['walker', 'runner', 'brute', 'crawler', 'bloater'] as ZombieType[]) expect(zombies.isHiveType(t)).toBe(false);
  });
  it('a Hopper leaps up to 290 px to land beside you, every 2.5 s, and can be shot in the air', () => {
    const { s } = cell('granary'), p = s.player;
    const z = bug(s, 'hopper', 230);
    let air = 0, peak = 0;
    for (let i = 0; i < 60 && z.do !== 'leap'; i++) tick(s);
    expect(z.do).toBe('leap');
    for (let i = 0; i < 60 && z.do === 'leap'; i++) { tick(s); air++; peak = Math.max(peak, z.lift ?? 0); }
    expect(air).toBeGreaterThan(20); expect(air).toBeLessThan(40);                 // about half a second
    expect(peak).toBeGreaterThan(0.9);
    expect(Math.hypot(z.x - p.x, z.y - p.y)).toBeLessThan(p.r + z.r + 40);          // beside you, not on you
    expect(z.wait).toBeGreaterThan(2);
    // in the air it is still a target
    const y = bug(s, 'hopper', 260, 40);
    for (let i = 0; i < 60 && y.do !== 'leap'; i++) tick(s);
    run(s, 8); expect(y.do).toBe('leap');
    zombies.damage(s, y, 1e6, 0); expect(y.dead).toBe(true);
  });
  it('a Shrieker winds up for 1.2 s, then everything within 900 px comes for you a quarter faster for 6 s', () => {
    const { s } = cell('granary');
    const sh = bug(s, 'shrieker', 500), near = bug(s, 'drone', -300, 200, true), far = bug(s, 'drone', 500 + 1000, 0, true);
    for (const z of [near, far]) { z.losTimer = 99; z.state = 'idle'; }
    for (let i = 0; i < 60 && sh.do !== 'wind'; i++) tick(s);
    expect(sh.do).toBe('wind');
    expect(bosses.fx(s).tele.some(t => t.kind === 'circle' && Math.hypot(t.x - sh.x, t.y - sh.y) < 5)).toBe(true);   // you can see it coming
    secs(s, 1.0); expect(near.chorus ?? 0).toBe(0);
    secs(s, 0.6);
    expect(near.chorus).toBeGreaterThan(5); expect(near.state).toBe('chase'); expect(near.mul).toBe(bugsMod.CHORUS_MUL);
    expect(far.chorus ?? 0).toBe(0);
    secs(s, 6.5); expect(near.chorus! <= 0).toBe(true); expect(near.mul).toBe(1);
    // it hangs back rather than walking into you
    const d0 = Math.hypot(sh.x - s.player.x, sh.y - s.player.y); expect(d0).toBeGreaterThan(330);
  });
  it('a Stinger is not slowed by honey, and its sting stays in you: 3 a second per stack, three stacks, four seconds', () => {
    const { s } = cell('paper'), p = s.player;
    mortal(s);
    const z = bug(s, 'stinger', 20);
    for (let i = 0; i < 120 && !(hive.runtime(s)!.venom?.n); i++) tick(s);
    const v = hive.runtime(s)!.venom!;
    expect(v.n).toBe(1);
    z.dead = true; run(s, 1);
    const hp0 = p.hp; secs(s, 2); expect(hp0 - p.hp).toBeCloseTo(bugsMod.VENOM_DPS * 2, 0);
    secs(s, 2.5); const hp1 = p.hp; secs(s, 2); expect(p.hp).toBe(hp1);          // it wears off
    for (let i = 0; i < 5; i++) bugsMod.onBite(s, { type: 'stinger' } as Zombie);
    expect(hive.runtime(s)!.venom!.n).toBe(bugsMod.VENOM_MAX);
    // on the wing over a honey pool
    hive.runtime(s)!.pools.push({ x: p.x + 300, y: p.y, r: 80, life: 9, max: 9 });
    const fly = bug(s, 'stinger', 300), walk = bug(s, 'drone', 300, 10);
    secs(s, 0.5);
    expect(fly.mul).toBe(1); expect(walk.mul).toBe(hive.HONEY_SLOW);
    expect(fly.lift).toBeGreaterThan(0);
  });
  it('a Spitter plants its feet at 240 px, shows the cone for 0.6 s and cannot turn: stand in it and burn, step aside and it misses', () => {
    const { s } = cell('galleries'), p = s.player;
    mortal(s);
    const z = bug(s, 'spitter', 200);
    for (let i = 0; i < 90 && z.do !== 'aim'; i++) tick(s);
    expect(z.do).toBe('aim');
    expect(bosses.fx(s).tele.some(t => t.kind === 'line' && Math.abs(t.len - bugsMod.SPIT_RANGE) < 1)).toBe(true);
    const x0 = z.x, hp0 = p.hp;
    secs(s, 0.7);
    expect(Math.abs(z.x - x0)).toBeLessThan(3);                     // planted
    expect(p.hp).toBeLessThan(hp0);
    expect(bosses.fx(s).pools.some(q => q.kind === 'acid')).toBe(true);
    // again, and this time you are not where it aimed
    z.do = ''; z.wait = 0; p.invuln = 0; bosses.fx(s).pools.length = 0;
    for (let i = 0; i < 90 && z.do !== 'aim'; i++) tick(s);
    teleport(s, { x: p.x, y: p.y + 190 }); const hp1 = p.hp;
    secs(s, 0.7);
    expect(p.hp).toBe(hp1);
  });
  it('a Shieldback takes a fifth from the front, everything from behind or from fire, and acid strips the plate', () => {
    const { s } = cell('galleries');
    const z = bug(s, 'shieldback', 300); run(s, 1);
    z.angle = Math.PI;   // facing the player, who is to its west
    const hit = (angle: number, opts?: zombies.DamageOptions) => { const hp = z.hp; zombies.damage(s, z, 100, angle, opts); const d = hp - z.hp; z.hp = z.maxHp; return d; };
    expect(hit(0, { source: 'bullet' })).toBeCloseTo(100 * bugsMod.PLATE, 5);          // a shot travelling east, into its face
    expect(hit(Math.PI, { source: 'bullet' })).toBe(100);                               // into its back
    expect(hit(0, { burn: true })).toBe(100);
    expect(hit(0, { explosion: true })).toBe(100);
    for (let i = 0; i < bugsMod.PLATE_STRIP; i++) zombies.corrode(s, z);
    expect(hit(0, { source: 'bullet' })).toBe(100);
  });
  it('a Shieldback lowers its horn and charges in a straight line at 300', () => {
    const { s } = cell('galleries'), p = s.player;
    mortal(s);
    const z = bug(s, 'shieldback', 330);
    for (let i = 0; i < 120 && z.do !== 'wind'; i++) tick(s);
    expect(z.do).toBe('wind');
    secs(s, 0.75); expect(z.do).toBe('charge');
    const x0 = z.x, y0 = z.y; run(s, 12);
    expect(Math.hypot(z.x - x0, z.y - y0)).toBeCloseTo(bugsMod.CHARGE_SPEED * 12 / 60, -1);
    expect(Math.abs(z.y - y0)).toBeLessThan(6);
    const hp0 = p.hp; secs(s, 1.2); expect(p.hp).toBeLessThan(hp0);
  });
  it('a Lurker is almost invisible and does not move until your beam or your feet find it; then it lunges at 320 and a miss leaves it open', () => {
    const { s } = cell('lantern'), p = s.player;
    p.flashlight = false;
    const z = bug(s, 'lurker', 400, 0, true); z.do = 'hide';
    secs(s, 2);
    expect(z.do).toBe('hide'); expect(z.alpha).toBeLessThan(0.2); expect(Math.hypot(z.x - (p.x + 400), z.y - p.y)).toBeLessThan(1);
    // the beam
    p.flashlight = true; p.angle = 0; run(s, 2);
    expect(z.do).toBe('reveal');
    secs(s, 0.4); expect(z.do).toBe('lunge'); expect(z.alpha).toBe(1);
    teleport(s, { x: p.x, y: p.y + 260 });   // not where it aimed
    const x0 = z.x; run(s, 12);
    expect(x0 - z.x).toBeCloseTo(bugsMod.LUNGE_SPEED * 12 / 60, -1);
    secs(s, 1); expect(z.do).toBe('spent');
    secs(s, bugsMod.LURK_EXPOSED); expect(z.do).toBe('');
    // your feet
    const y = bug(s, 'lurker', -150, 0, true); y.do = 'hide'; p.flashlight = false; run(s, 2);
    expect(y.do).toBe('reveal');
  });
  it('a Dustwing comes to your lamp, loses you two seconds after it goes out, and its dust shortens the beam for six', () => {
    const { s } = cell('lantern'), p = s.player;
    const z = bug(s, 'dustwing', 700, 0, true); z.losTimer = 99;
    secs(s, 0.5); expect(z.state).toBe('chase');
    p.flashlight = false; secs(s, 2.3);
    expect(['wander', 'idle']).toContain(z.state);
    p.flashlight = true; secs(s, 0.3); expect(z.state).toBe('chase');
    expect(p.beamMul ?? 1).toBe(1);
    teleport(s, { x: z.x - 60, y: z.y }); zombies.damage(s, z, 1e6, 0); run(s, 2);
    expect(p.beamMul).toBe(bugsMod.DUST_BEAM);
    expect(bugsMod.inBeam(s, p.x + 500, p.y)).toBe(false); p.angle = 0; expect(bugsMod.inBeam(s, p.x + 250, p.y)).toBe(true);
    secs(s, bugsMod.DUST_TIME + 0.2); expect(p.beamMul).toBe(1);
  });
  it('one Skitterer in three gets back up after two seconds, once, unless it burned or was blown apart', () => {
    const { s } = cell('rot'), p = s.player;
    const kill = (opts?: zombies.DamageOptions) => { for (let i = 0; i < 300; i++) { const z = zombies.spawn(s, 'skitterer', p.x + 700 + (i % 20) * 12, p.y + Math.floor(i / 20) * 12); zombies.damage(s, z, 1e6, 0, opts); } run(s, 1); return hive.runtime(s)!.revives?.length ?? 0; };
    const shot = kill({ source: 'bullet' });
    expect(shot).toBeGreaterThan(60); expect(shot).toBeLessThan(140);
    secs(s, bugsMod.REVIVE_TIME + 0.2);
    const up = bugs(s).filter(z => z.type === 'skitterer') as HBug[];
    expect(up.length).toBe(shot); expect(up.every(z => z.revived && z.maxHp === 22)).toBe(true);   // half health (11 of 22), toughened by the cell (x2)
    // the ones that got up do not get up again
    for (const z of up) zombies.damage(s, z, 1e6, 0, { source: 'bullet' });
    run(s, 1); expect(hive.runtime(s)!.revives?.length ?? 0).toBe(0);
    expect(kill({ burn: true })).toBe(0);
    expect(kill({ explosion: true })).toBe(0);
  });
  it('a Skitterer runs sideways out of your beam', () => {
    const { s } = cell('rot'), p = s.player;
    p.angle = 0;
    const z = bug(s, 'skitterer', 300, 0, true); z.losTimer = 99; z.state = 'idle';
    const y0 = z.y; secs(s, 0.5);
    expect(Math.abs(z.y - y0)).toBeGreaterThan(25);
  });
  it('a Grub grows into an adult of the cell it is in', () => {
    const { s } = cell('paper');
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(bugsMod.adult(s));
    expect([...seen].sort()).toEqual(['honeypot', 'stinger']);
  });
});

describe('the insect weapons of the later cells', () => {
  const IDS = ['locust_repeater', 'needler', 'vespiary', 'bombardier', 'hornbreaker', 'lure_lantern', 'mantis_scythes', 'carrion_hive', 'queens_decree'];
  it('are items in the right slots, upgraded by the Hive tree, with the numbers from the plan', () => {
    const slot: Record<string, string> = { locust_repeater: 'primary', needler: 'primary', vespiary: 'secondary', bombardier: 'primary', hornbreaker: 'melee', lure_lantern: 'secondary', mantis_scythes: 'melee', carrion_hive: 'primary', queens_decree: 'secondary' };
    for (const id of IDS) {
      const it = ITEMS[id], w = combat.WEAPONS[id];
      expect(it?.type, id).toBe('weapon'); expect(it.slot, id).toBe(slot[id]);
      expect(it.color).toBe(RARITY_COLORS[it.rarity]);
      expect(w.tree, id).toBe('hive'); expect(w.arm, id).toBeTruthy();
    }
    const W = combat.WEAPONS;
    expect([W.locust_repeater.damage, W.locust_repeater.magSize]).toEqual([14, 40]);
    expect([W.needler.damage, W.needler.range, W.needler.pierce]).toEqual([60, 1100, 3]);
    expect([W.vespiary.damage, W.vespiary.magSize, W.vespiary.ammo]).toEqual([12, 24, null]);
    expect([W.bombardier.magSize, W.bombardier.range, W.bombardier.class]).toEqual([5, 260, 'shotgun']);
    expect([W.hornbreaker.damage, W.hornbreaker.fireRate]).toEqual([110, 1.0]);
    expect(W.lure_lantern.magSize).toBe(6);
    expect([W.mantis_scythes.damage, W.mantis_scythes.fireRate]).toEqual([48, 0.26]);
    expect(W.carrion_hive.magSize).toBe(3);
    expect(ITEMS.carapace_vest).toMatchObject({ type: 'armor', slot: 'body', armor: 0.33 });
    expect(ITEMS.carapace_vest.armor!).toBeGreaterThan(ITEMS.military_vest.armor!);
    // each boss hands over its own
    expect(bosses.BOSS_WEAPON).toMatchObject({ famine: 'locust_repeater', vespa: 'vespiary', goliath: 'hornbreaker', prioress: 'mantis_scythes', carrion_lord: 'carrion_hive', queen: 'queens_decree' });
    for (const id of ['famine', 'vespa', 'carrion_lord', 'queen'] as bosses.BossId[]) expect(bosses.trophyLoot(id)[0].mag).toBe(W[bosses.BOSS_WEAPON[id]].magSize);
  });
  it('the heavier guns drink ichor: a reload costs what the rounds cost', () => {
    const { s } = cell('paper'), p = s.player;
    const st = arm(s, 'needler'); st.mag = 2;
    const before = inv.count(p.inv, 'ichor');
    combat.reload(s); secs(s, 2.2);
    expect(st.mag).toBe(8); expect(before - inv.count(p.inv, 'ichor')).toBe(6 * 4);
    // not enough for one round: no reload
    st.mag = 0; inv.remove(p.inv, 'ichor', inv.count(p.inv, 'ichor') - 3);
    expect(combat.reload(s)).toBe(false);
    expect(combat.ammoPerMag('needler')).toBe(32); expect(combat.ammoPerMag('formic_sprayer')).toBe(80);
  });
  it('Locust Repeater: a hit hops on to two more bugs within 140 px at 60% damage', () => {
    const { s } = cell('granary');
    arm(s, 'locust_repeater');
    const a = bug(s, 'drone', 200, 0, true), b = bug(s, 'drone', 200, 100, true), c = bug(s, 'drone', 200, -110, true), far = bug(s, 'drone', 200, 300, true);
    for (const z of [a, b, c, far]) { z.hp = z.maxHp = 5000; z.losTimer = 99; z.base = 0; }
    fire(s); run(s, 12);
    const lost = (z: Zombie) => 5000 - z.hp, hit = lost(a);
    expect(hit).toBeGreaterThan(10);
    expect(lost(b)).toBeCloseTo(hit * arms.HOP_DAMAGE, 3); expect(lost(c)).toBeCloseTo(hit * arms.HOP_DAMAGE, 3);
    expect(lost(far)).toBe(0);
  });
  it('Needler: the needle goes through three bugs and poisons each for 30 over four seconds', () => {
    const { s } = cell('paper');
    arm(s, 'needler');
    const row = [150, 220, 290, 360, 430].map(d => { const z = bug(s, 'drone', d, 0, true); z.hp = z.maxHp = 5000; z.losTimer = 99; z.base = 0; return z; });
    fire(s); run(s, 20);
    expect(row.map(z => z.hp < 5000)).toEqual([true, true, true, true, false]);      // through three, into a fourth
    const hp0 = row[0].hp; secs(s, arms.NEEDLE_VENOM + 0.6);
    expect(hp0 - row[0].hp).toBeCloseTo(30, 0);
    expect(row[4].hp).toBe(5000);
  });
  it('The Vespiary: hornets steer at a bug you are not aiming at; it never reloads and breeds its own, 2 a second holstered, 1 in your hand once you stop firing', () => {
    const { s } = cell('paper'), p = s.player;
    const st = arm(s, 'vespiary');
    p.inv.equip.melee = { id: 'knife', qty: 1 };
    const z = bug(s, 'drone', 260, 150, true); z.hp = z.maxHp = 5000; z.losTimer = 99; z.base = 0;
    p.angle = 0; fire(s, 1); secs(s, 1.2);
    expect(z.hp).toBeLessThan(5000);                                                 // aimed due east, it found the bug 30 degrees off
    expect(combat.reload(s)).toBe(false);
    // in your hand, firing: nothing comes back
    st.mag = 3; for (let i = 0; i < 30 && st.mag! > 0; i++) fire(s);
    expect(st.mag).toBe(0); secs(s, 0.8); expect(st.mag).toBe(0);
    // stop firing: one a second after a second's pause
    secs(s, 4.3); expect(st.mag).toBeGreaterThanOrEqual(3); expect(st.mag).toBeLessThanOrEqual(5);
    // holstered: two a second, up to 24
    st.mag = 0; combat.switchTo(s, 'melee'); secs(s, 3);
    expect(st.mag).toBeGreaterThanOrEqual(5); expect(st.mag).toBeLessThanOrEqual(7);
    secs(s, 12); expect(st.mag).toBe(arms.VESPIARY_MAG);
  });
  it('Bombardier: a short cone that sets bugs alight and shoves them back', () => {
    const { s } = cell('galleries');
    arm(s, 'bombardier');
    const z = bug(s, 'drone', 120, 0, true), far = bug(s, 'drone', 420, 0, true);
    for (const o of [z, far]) { o.hp = o.maxHp = 5000; o.losTimer = 99; o.state = 'idle'; o.base = 0; o.speed = 0; }
    const x0 = z.x; fire(s); run(s, 10);
    expect(z.hp).toBeLessThan(5000); expect(z.burn).toBeGreaterThan(0); expect(z.x - x0).toBeGreaterThan(arms.CONE_SHOVE - 1);
    expect(far.hp).toBe(5000);                                                       // out of reach: 260 px
  });
  it('Hornbreaker: every swing sends a shock line 300 px forward that knocks a column flat', () => {
    const { s } = cell('galleries'), p = s.player;
    arm(s, 'hornbreaker'); p.angle = 0;
    const col = [110, 180, 250, 300].map(d => bug(s, 'drone', d, 8, true)), side = bug(s, 'drone', 200, 120, true), beyond = bug(s, 'drone', 400, 0, true);
    for (const z of [...col, side, beyond]) { z.hp = z.maxHp = 5000; z.losTimer = 99; }
    fire(s);
    for (const z of col) { expect(z.hp, `${Math.round(z.x - p.x)} px`).toBeLessThan(5000); expect(z.stunT).toBeGreaterThan(0.9); }
    expect(side.hp).toBe(5000); expect(beyond.hp).toBe(5000);
    const x0 = col[1].x; secs(s, 0.8); expect(Math.abs(col[1].x - x0)).toBeLessThan(2);   // flat on its back
  });
  it('Lure Lantern: every ordinary bug within 500 px goes for the lure for six seconds, then it bursts for 120', () => {
    const { s } = cell('lantern'), p = s.player;
    const st = arm(s, 'lure_lantern'); p.angle = 0;
    fire(s); expect(st.mag).toBe(5);
    secs(s, 0.6);
    const lure = hive.runtime(s)!.lures![0];
    expect(lure.x - p.x).toBeGreaterThan(200);
    const near = [bug(s, 'drone', -200), bug(s, 'drone', -120, 150), bug(s, 'hopper', 100, -250)], far = bug(s, 'drone', lure.x - p.x + 1300, 0);
    for (const z of [...near, far]) { z.hp = z.maxHp = 5000; }
    const d0 = near.map(z => Math.hypot(z.x - lure.x, z.y - lure.y));
    mortal(s); const hp0 = p.hp;
    secs(s, 4);
    near.forEach((z, i) => expect(Math.hypot(z.x - lure.x, z.y - lure.y), `bug ${i}`).toBeLessThan(d0[i] - 100));
    expect(p.hp).toBe(hp0);                                                          // nothing touched you on its way past
    expect(far.lureT ?? 0).toBeLessThanOrEqual(0);
    secs(s, 2);
    expect(hive.runtime(s)!.lures).toHaveLength(0);
    expect(near.filter(z => z.hp < 5000 - 60).length).toBeGreaterThanOrEqual(2);     // they were standing on it
  });
  it('Mantis Scythes: each swing steps you forward, hits twice as hard from behind, and gives a little health back', () => {
    const { s } = cell('lantern'), p = s.player;
    mortal(s); arm(s, 'mantis_scythes'); p.angle = 0;
    const front = bug(s, 'drone', 70, 0, true); front.hp = front.maxHp = 5000; front.angle = Math.PI; front.losTimer = 99; front.base = 0;
    run(s, 40); p.hp = 40; const x0 = p.x;   // (the skill sync has put the health cap back to 100 by now)
    fire(s);
    const facing = 5000 - front.hp; expect(facing).toBeGreaterThan(40);
    expect(p.hp).toBeGreaterThan(40);
    front.dead = true; run(s, 30);
    const back = bug(s, 'drone', 70, 0, true); back.hp = back.maxHp = 5000; back.angle = 0; back.losTimer = 99; back.base = 0;   // looking away from you
    const x1 = p.x; fire(s);
    expect(5000 - back.hp).toBeCloseTo(facing * arms.SCYTHE_BACK, 3);
    back.dead = true; run(s, 30); const x2 = p.x; fire(s);
    expect(p.x - x2).toBeCloseTo(arms.SCYTHE_STEP, 0);                               // nothing in the way: a step
    void x0; void x1;
  });
  it('Carrion Hive: a cloud of flies for six seconds at 25 a second, and what dies in it bursts on its neighbours', () => {
    const { s } = cell('rot'), p = s.player;
    const st = arm(s, 'carrion_hive'); p.angle = 0;
    fire(s); expect(st.mag).toBe(2); secs(s, 0.6);
    const cloud = hive.runtime(s)!.clouds![0];
    const z = zombies.spawn(s, 'drone', cloud.x, cloud.y) as HBug, out = zombies.spawn(s, 'drone', cloud.x + 400, cloud.y) as HBug;
    for (const o of [z, out]) { o.hp = o.maxHp = 5000; o.losTimer = 99; o.tough = true; o.base = 0; }
    secs(s, 2);
    expect(5000 - z.hp).toBeCloseTo(arms.CLOUD_DPS * 2, -1); expect(out.hp).toBe(5000);
    const weak = zombies.spawn(s, 'drone', cloud.x + 30, cloud.y) as HBug; weak.hp = weak.maxHp = 5; weak.tough = true; weak.base = 0;
    const hp0 = z.hp; secs(s, 0.6);
    expect(weak.dead).toBe(true); expect(hp0 - z.hp).toBeGreaterThanOrEqual(arms.CLOUD_BURST);
    secs(s, 4); expect(hive.runtime(s)!.clouds).toHaveLength(0);
  });
  it("Queen's Decree: the swarm turns on a marked bug for six seconds; a marked boss takes a quarter more", () => {
    const { s } = cell('seals', 'q_ante'), p = s.player;
    mortal(s); arm(s, 'queens_decree'); p.angle = 0;
    const target = bug(s, 'honeypot', 220, 0, true); target.hp = target.maxHp = 5000; target.losTimer = 99; target.base = 0;
    fire(s); run(s, 12);
    expect(target.markT).toBeGreaterThan(5);
    const pack = [-40, 0, 40].map(dy => bug(s, 'drone', 120, dy));
    const hp0 = target.hp, me = p.hp;
    secs(s, 3);
    expect(target.hp).toBeLessThan(hp0);                                             // they are biting it
    expect(p.hp).toBe(me);                                                           // not you
    for (const z of pack) expect(Math.hypot(z.x - target.x, z.y - target.y)).toBeLessThan(80);
    secs(s, 4); expect(target.markT! <= 0).toBe(true);
    // a boss
    const b = bosses.spawnBossOf(s, 'marshal', 0, p.x + 300, p.y, 1) as Zombie & HBug; b.hp = b.maxHp = 100000;
    zombies.damage(s, b, 100, NaN); const plain = 100000 - b.hp;
    b.markT = 6; zombies.damage(s, b, 100, NaN);
    expect(100000 - b.hp - plain).toBeCloseTo(plain * 1.25, 3);
  });
});

describe('the bosses of the later cells', () => {
  /** The mission's boss, awake, with the player 300 px from it in its arena. */
  function arena(id: string) {
    const { s, h } = cell(id);
    const def = HIVE_MISSIONS[idx(id)], at = def.objectives.findIndex(o => o.kind === 'boss');
    for (let i = 0; i < at; i++) road.devSkip(s);
    clear(s);
    const o = def.objectives[at] as { boss: bosses.BossId }, c = road.currentRun(s)!.point;
    teleport(s, { x: c.x - 300, y: c.y }); run(s, 4);
    const boss = s.zombies.find(z => z.boss === o.boss)! as Zombie & { act: string; actT: number; stage: number; alpha?: number; leapK?: number; raged?: boolean };
    expect(boss, `${o.boss} stands in its arena`).toBeTruthy();
    teleport(s, { x: boss.x - 300, y: boss.y }); run(s, 4);
    return { s, h, boss, c: { x: boss.x, y: boss.y } };
  }
  /** Fight for `t` seconds, staying in the open at mid range, and list every special it used. */
  function watch(s: GameState, boss: Zombie & { act: string }, c: { x: number; y: number }, t: number, each?: (i: number) => void) {
    const seen = new Set<string>(), h = s.road!.world.hive!;
    for (let i = 0; i < t * 60 && !boss.dead; i++) {
      if (i % 240 === 0) teleport(s, { x: c.x + (Math.floor(i / 240) % 2 ? 320 : -320), y: c.y + (Math.floor(i / 480) % 2 ? 120 : -120) });
      tick(s);
      if (boss.act) seen.add(boss.act);
      if (!isFloor(h, boss.x, boss.y)) throw new Error(`${boss.boss} left the cave at ${Math.round(boss.x)},${Math.round(boss.y)} during ${boss.act}`);
      for (const z of s.zombies) if (!z.dead && !isFloor(h, z.x, z.y)) throw new Error(`${z.type} outside the cave`);
      each?.(i);
      if (i % 300 === 299) for (const z of bugs(s)) z.dead = true;
    }
    return seen;
  }
  it('the Queen has 24,000 health in her own mission, not a multiple of it', () => {
    const s = start(); road.startMission(s, idx('queen')); s.ui = null; run(s, 3);
    const q = s.zombies.find(z => z.boss === 'queen')!;
    expect(q.maxHp).toBe(24000);
    // 600 ichor at your feet before the fight (the nearest crate is picked up as you stand up)
    expect(s.drops.flatMap(d => d.inv.slots).reduce((n, st) => n + (st?.id === 'ichor' ? st.qty : 0), 0) + inv.count(s.player.inv, 'ichor')).toBe(600);
  });
  it('are story bosses with the numbers from the plan', () => {
    const want: Record<string, [number, number]> = { famine: [34, 4500], vespa: [36, 5200], goliath: [48, 7500], prioress: [34, 5000], carrion_lord: [42, 6000], queen: [64, 24000] };
    for (const [id, [r, hp]] of Object.entries(want)) {
      const d = bosses.BOSSES[id as bosses.BossId];
      expect([d.r, d.hp], id).toEqual([r, hp]);
      expect(bosses.STORY_BOSSES.has(id as bosses.BossId)).toBe(true); expect(bosses.BOSS_IDS).not.toContain(id);
      expect(hiveBosses.IDS.has(id as bosses.BossId)).toBe(true);
    }
  });
  it('Famine leaps out of reach onto a marked spot, lands with a shockwave and is stuck; it sweeps a marked lane; in a rage it leaps three times', () => {
    const { s, boss, c } = arena('granary');
    let untouchable = false, marked = false;
    const seen = watch(s, boss, c, 40, () => {
      if (boss.act === 'leaping' && boss.actT > 0.3 && boss.actT < 0.7) { const hp = boss.hp; zombies.damage(s, boss, 50, 0); if (boss.hp === hp) untouchable = true; }
      if (boss.act === 'leaping' && bosses.fx(s).tele.some(t => t.kind === 'circle' && t.r === 130)) marked = true;
    });
    expect([...seen]).toEqual(expect.arrayContaining(['skyWind', 'leaping', 'stuck', 'frontWind']));
    expect(untouchable).toBe(true); expect(marked).toBe(true);
    zombies.damage(s, boss, boss.maxHp * 0.6, 0);
    let chain = 0, best = 0, last = '';
    watch(s, boss, c, 40, () => { if (boss.act !== last) { if (boss.act === 'leaping') chain++; else if (boss.act === '' || boss.act === 'frontWind') chain = 0; best = Math.max(best, chain); last = boss.act; } });
    expect(boss.raged).toBe(true); expect(best).toBe(3);
  });
  it('Matriarch Vespa strafes a marked lane, lobs venom, and lights three comb cells that hatch four Stingers each unless you break them', () => {
    const { s, boss, c } = arena('paper');
    let combs = 0, hatched = 0;
    const seen = watch(s, boss, c, 60, () => {
      combs = Math.max(combs, s.zombies.filter(z => !z.dead && z.type === 'egg' && (z as HBug).roadTag === 'comb').length);
      hatched = Math.max(hatched, bugs(s).filter(z => z.type === 'stinger').length);
    });
    expect([...seen]).toEqual(expect.arrayContaining(['strafeWind', 'strafing', 'volleyWind', 'hatchWind']));
    expect(combs).toBe(3); expect(hatched).toBe(12);
    expect(bosses.fx(s).pools.length + 1).toBeGreaterThan(0);
    // break them in time and nothing hatches
    for (const z of s.zombies) if (!z.boss) z.dead = true;
    run(s, 1);
    let most = 0;
    watch(s, boss, c, 45, () => { for (const z of s.zombies) if (!z.dead && z.type === 'egg' && (z as HBug).roadTag === 'comb') zombies.damage(s, z, 1e6, 0); most = Math.max(most, bugs(s).filter(z => z.type === 'stinger').length); });
    expect(most).toBe(0);
    // hurt enough, she lands and dashes
    zombies.damage(s, boss, boss.maxHp * 0.6, 0);
    expect([...watch(s, boss, c, 30)]).toEqual(expect.arrayContaining(['dashWind', 'dashing']));
  });
  it('Goliath takes 15% from the front, buries its horn in the rock when it misses, and its back takes double while it is stuck', () => {
    const { s, boss, c } = arena('galleries');
    boss.angle = Math.PI;
    const hit = (angle: number) => { const hp = boss.hp; zombies.damage(s, boss, 100, angle, { source: 'bullet' }); return hp - boss.hp; };
    expect(hit(0)).toBeCloseTo(100 * hiveBosses.GOLIATH_PLATE, 4); expect(hit(Math.PI)).toBe(100);
    let stuck = 0, doubled = false;
    const seen = watch(s, boss, c, 70, () => { if (boss.act === 'stuck') { stuck++; if (!doubled) { const hp = boss.hp; zombies.damage(s, boss, 100, boss.angle + Math.PI, { source: 'bullet' }); doubled = hp - boss.hp === 200; } } });
    expect([...seen]).toEqual(expect.arrayContaining(['ramWind', 'ramming', 'quakeWind']));
    expect(stuck).toBeGreaterThan(60); expect(doubled).toBe(true);                   // it ran into the rock at least once
    // behind it and close: the scalding cone
    boss.act = ''; (boss as unknown as { cd: Record<string, number> }).cd.b = 0;
    teleport(s, { x: boss.x - Math.cos(boss.angle) * 200, y: boss.y - Math.sin(boss.angle) * 200 }); run(s, 3);
    expect(boss.act).toBe('ventWind');
  });
  it('the Prioress cannot be seen outside your beam; she dashes two crossing lanes, reaps up close, and calls moths', () => {
    const { s, boss, c } = arena('lantern'), p = s.player;
    p.flashlight = false;
    let faint = 1, moths = 0;
    const seen = watch(s, boss, c, 50, () => { if (!boss.act && Math.hypot(boss.x - p.x, boss.y - p.y) > 200) faint = Math.min(faint, boss.alpha ?? 1); moths = Math.max(moths, bugs(s).filter(z => z.type === 'dustwing').length); });
    expect(faint).toBeLessThan(0.2);
    expect([...seen]).toEqual(expect.arrayContaining(['crossWind', 'dashing', 'tired']));
    expect(moths).toBeGreaterThanOrEqual(4);
    // in the beam she is there
    p.flashlight = true; boss.act = ''; teleport(s, { x: boss.x - 400, y: boss.y }); p.angle = 0;
    (boss as unknown as { cd: Record<string, number> }).cd = { a: 9, b: 9, c: 9, d: 9 };
    secs(s, 0.6); expect(boss.alpha).toBe(1);
    // up close: the reap
    (boss as unknown as { cd: Record<string, number> }).cd.b = 0; teleport(s, { x: boss.x - 80, y: boss.y }); run(s, 3);
    expect(boss.act).toBe('reapWind');
  });
  it('the Carrion Lord has a toxic aura, lays heaps that burst into Grubs unless you destroy them, floods bile that spreads, and flies a zig-zag', () => {
    const { s, boss, c } = arena('rot'), p = s.player;
    let heaps = 0, grubs = 0, widest = 0;
    const seen = watch(s, boss, c, 60, () => {
      heaps = Math.max(heaps, s.zombies.filter(z => !z.dead && z.type === 'egg' && (z as HBug).roadTag === 'heap').length);
      grubs = Math.max(grubs, bugs(s).filter(z => z.type === 'grub').length);
      for (const q of bosses.fx(s).pools) if (q.kind === 'toxic') widest = Math.max(widest, q.r);
    });
    expect([...seen]).toEqual(expect.arrayContaining(['buzzWind', 'buzzing', 'bileWind', 'infestWind']));
    expect(heaps).toBe(3); expect(grubs).toBe(9);
    expect(widest).toBeGreaterThan(100);
    mortal(s); boss.act = 'infestWind'; boss.actT = 0; teleport(s, { x: boss.x - 100, y: boss.y });
    const hp0 = p.hp; run(s, 40); expect(p.hp).toBeLessThan(hp0);                     // standing in the stench
  });
  it('the Queen: resin until the four conduits are down, then the brood, then unbound, then the anchor; no stage can be skipped', () => {
    const { s, boss, c } = arena('queen'), p = s.player;
    teleport(s, { x: boss.x - 500, y: boss.y }); run(s, 5);
    expect(boss.announced).toBe(true);
    const cons = hiveBosses.conduits(s);
    expect(cons).toHaveLength(hiveBosses.QUEEN_CONDUITS);
    for (const k of cons) expect(isFloor(s.road!.world.hive!, k.x, k.y)).toBe(true);
    // 1. the Court: nothing marks her
    zombies.damage(s, boss, 1e6, 0); expect(boss.hp).toBe(boss.maxHp); expect(boss.stage).toBe(0);
    const x0 = boss.x; let guards = 0;
    watch(s, boss, c, 14, () => { guards = Math.max(guards, bugs(s).length); });
    expect(boss.x).toBe(x0); expect(guards).toBeGreaterThanOrEqual(6);
    for (const k of cons.slice(0, 3)) zombies.damage(s, k, 1e6, 0);
    run(s, 5); expect(boss.stage).toBe(0);
    zombies.damage(s, cons[3], 1e6, 0); run(s, 3);
    // 2. the Brood
    expect(boss.stage).toBe(1); expect(boss.hp).toBe(Math.round(boss.maxHp * 0.75));
    const laid = new Set<string>();
    watch(s, boss, c, 30, () => { for (const z of bugs(s)) laid.add(z.type); });
    expect(laid.size).toBeGreaterThanOrEqual(3);                                     // each cell's bugs in turn
    expect(boss.x).toBe(x0);
    zombies.damage(s, boss, 1e7, NaN); run(s, 2);
    // 3. Unbound: one huge hit ended the stage and no more
    expect(boss.stage).toBe(2); expect(boss.hp).toBeCloseTo(boss.maxHp * 0.5, -2);
    teleport(s, { x: c.x - 600, y: c.y }); const far = Math.hypot(p.x - c.x, p.y - c.y);
    const seen = watch(s, boss, { x: c.x, y: c.y }, 0.5);
    expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeLessThan(far);                       // the rift pulls
    const acts = watch(s, boss, c, 45);
    expect([...acts, ...seen]).toEqual(expect.arrayContaining(['ramWind', 'ramming', 'skyWind', 'leaping', 'screamWind']));
    zombies.damage(s, boss, 1e7, NaN); run(s, 2);
    // 4. the Anchor: she falls back onto it and the roof comes down
    expect(boss.stage).toBe(3); expect(boss.hp).toBeCloseTo(boss.maxHp * 0.25, -2);
    secs(s, 2.5);
    expect(Math.hypot(boss.x - x0, boss.y - c.y)).toBeLessThan(40); expect(boss.act).toBe('down');
    const hp = boss.hp; zombies.damage(s, boss, 100, NaN); expect(hp - boss.hp).toBe(150);   // the heart is open
    let rocks = 0; watch(s, boss, c, 6, () => { rocks = Math.max(rocks, bosses.fx(s).shots.filter(q => q.kind === 'rock').length); });
    expect(rocks).toBeGreaterThanOrEqual(2);
    zombies.damage(s, boss, 1e7, NaN); run(s, 3);
    expect(boss.dead).toBe(true);
    expect(s.drops.some(d => d.inv.slots.some(st => st?.id === 'queens_decree'))).toBe(true);
  });
});

describe('the cells', () => {
  it('every stop of every mission is on carved floor, in its own cell, and can be walked to once the seals before it are open', () => {
    const s = start(), w = s.road!.world, h = w.hive!;
    const sites = w.sites as Record<string, { x: number; y: number; w: number; h: number; name: string }>;
    for (const g of w.gates) g.open = true;
    // flood from the start over floor tiles
    const n = h.n, seen = new Uint8Array(n * n), q = [Math.floor(w.start.y / TILE) * n + Math.floor(w.start.x / TILE)]; seen[q[0]] = 1;
    for (let i = 0; i < q.length; i++) { const x = q[i] % n, y = Math.floor(q[i] / n); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (y + dy) * n + x + dx; if (h.floor[k] && !seen[k]) { seen[k] = 1; q.push(k); } } }
    const walk = (p: { x: number; y: number }) => seen[Math.floor(p.y / TILE) * n + Math.floor(p.x / TILE)] === 1;
    HIVE_MISSIONS.forEach((def, m) => {
      const zone = def.sector || 8;
      for (const o of def.objectives) {
        if (!('at' in o) || o.at === 'camp' || o.at === 'entry' || o.at === 'prevCamp') continue;
        const site = sites[o.at]; expect(site, `${def.id}: site ${o.at}`).toBeTruthy();
        const c = mid(site);
        expect(isFloor(h, c.x, c.y), `${def.id}: ${o.at} is floor`).toBe(true);
        expect(walk(c), `${def.id}: ${o.at} can be reached`).toBe(true);
        expect(zoneAt(h, c.x, c.y), `${def.id}: ${o.at} is in its cell`).toBe(zone);
      }
      const camp = road.campOf(s, m);
      expect(isFloor(h, camp.x, camp.y) && walk(camp), `${def.id}: its camp`).toBe(true);
      for (const cache of def.caches) for (const it of cache.items) expect(it.id === 'ammo_sidearm' || !!ITEMS[it.id], `${def.id}: ${it.id}`).toBe(true);
    });
    // the stops of a cell come in order along the way in
    const along = (id: string) => { const c = mid(sites[id]); return h.route.findIndex(k => Math.abs((k % n + 0.5) * TILE - c.x) < 1 && Math.abs((Math.floor(k / n) + 0.5) * TILE - c.y) < 1); };
    for (const ids of [['g_cross', 'g_choir', 'g_pillar'], ['p_combs', 'p_cache', 'p_atrium'], ['b_vents', 'b_cache', 'b_gallery'], ['l_dark', 'l_cache', 'l_cocoons'], ['r_cellar', 'r_heaps'], ['q_ring', 'q_ante']]) {
      const at = ids.map(along); expect(at.every(i => i >= 0), ids.join()).toBe(true);
      expect([...at].sort((a, b) => a - b)).toEqual(at);
    }
  });
  it('each cell is tougher than the last, every camp ends with a rest, and no camp of a cell has the lockbox', () => {
    const hp = HIVE_MISSIONS.slice(1, 8).map(m => (m.tough ?? hive.TOUGH).hp);
    expect([...hp].sort((a, b) => a - b)).toEqual(hp); expect(hp[6]).toBeGreaterThan(hp[0]);
    for (const def of HIVE_MISSIONS) { const camp = def.objectives[def.objectives.length - 1]; expect(camp.kind === 'camp' && !!camp.rest, def.id).toBe(true); }
    const s = start();
    for (let m = 2; m < 9; m++) {
      road.startMission(s, m); s.ui = null; tick(s);
      expect(s.road!.lockbox, `${HIVE_MISSIONS[m].id}: your kit is stored`).toBeTruthy();
      expect(road.lockboxSpots(s), `${HIVE_MISSIONS[m].id}: and stays with Mara`).toHaveLength(0);
      expect(s.player.inv.equip.primary?.id ?? '', HIVE_MISSIONS[m].id).not.toBe('smg');   // the gun you came with is in it
    }
    expect(HIVE_MISSIONS.filter(m => m.lockbox).map(m => m.id)).toEqual(['daylight']);
  });
  it('the Granary: a strip of floor is marked 1.5 s before the locusts sweep it; in the strip you are hurt, out of it you are not', () => {
    const { s } = cell('granary'), p = s.player;
    mortal(s);
    const rt = hive.runtime(s)!;
    for (let i = 0; i < 60 * 14 && !rt.lanes?.length; i++) tick(s);
    const lane = rt.lanes![0];
    expect(lane.t).toBeGreaterThan(1.3);
    expect(bosses.fx(s).tele.some(t => t.kind === 'line' && t.len === bugsMod.LANE_LEN)).toBe(true);
    // stand on its centre line
    teleport(s, { x: lane.x + Math.cos(lane.angle) * 700, y: lane.y + Math.sin(lane.angle) * 700 });
    const hp0 = p.hp; secs(s, 1.7); expect(p.hp).toBeLessThan(hp0);
    for (let i = 0; i < 60 * 14 && !rt.lanes?.length; i++) tick(s);
    const next = rt.lanes![0];
    teleport(s, { x: next.x + Math.cos(next.angle) * 700 - Math.sin(next.angle) * 200, y: next.y + Math.sin(next.angle) * 700 + Math.cos(next.angle) * 200 });
    const hp1 = p.hp; secs(s, 1.7); expect(p.hp).toBe(hp1);
  });
  it('the Boiling Galleries: vents fire every five seconds after a warning, and scald the hive as badly as you', () => {
    const { s, h } = cell('galleries', 'b_vents'), p = s.player;
    const all = vents(h);
    expect(all.length).toBeGreaterThan(15);
    for (const v of all) { expect(isFloor(h, v.x, v.y)).toBe(true); expect(zoneAt(h, v.x, v.y)).toBe(4); expect(Math.hypot(v.x - h.arenas[4].x, v.y - h.arenas[4].y)).toBeGreaterThan(500); }
    run(s, 2);
    const v = hive.runtime(s)!.vents!.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    mortal(s); teleport(s, { x: v.x + 20, y: v.y });
    const z = zombies.spawn(s, 'drone', v.x - 20, v.y) as HBug; z.hp = z.maxHp = 5000; z.tough = true; z.base = 0; z.losTimer = 99;
    let warned = false; const hp0 = p.hp;
    for (let i = 0; i < 60 * 5.5; i++) { tick(s); if (bosses.fx(s).tele.some(t => t.kind === 'circle' && t.x === v.x && t.y === v.y)) warned = true; teleport(s, { x: v.x + 20, y: v.y }); }
    expect(warned).toBe(true); expect(p.hp).toBeLessThan(hp0); expect(z.hp).toBeLessThan(5000);
  });
  it('the Lantern Deep starts with Lurkers standing against the rock, away from the camps and the chapel', () => {
    const s = start(); road.startMission(s, idx('lantern')); s.ui = null; tick(s);
    const h = s.road!.world.hive!, lurk = s.zombies.filter(z => z.type === 'lurker') as HBug[];
    expect(lurk.length).toBeGreaterThanOrEqual(8);
    for (const z of lurk) {
      expect(z.do).toBe('hide'); expect(zoneAt(h, z.x, z.y)).toBe(5); expect(isFloor(h, z.x, z.y)).toBe(true);
      for (const c of [road.campOf(s, idx('lantern') - 1), road.campOf(s, idx('lantern')), h.arenas[5]]) expect(Math.hypot(z.x - c.x, z.y - c.y)).toBeGreaterThan(600);
    }
  });
  it('brood combs hatch Stingers, corpse heaps hatch Grubs, and a cocoon holds supplies or a Lurker', () => {
    const paper = cell('paper', 'p_combs');
    road.startMission(paper.s, idx('paper')); paper.s.ui = null; tick(paper.s); road.devSkip(paper.s);
    const combs = paper.s.zombies.filter(z => z.type === 'egg' && (z as HBug).brood === 'stinger');
    expect(combs).toHaveLength(4);
    for (const z of paper.s.zombies) if (!zombies.isInert(z)) z.dead = true;
    teleport(paper.s, { x: combs[0].x + 60, y: combs[0].y }); secs(paper.s, hive.HATCH_TIME + 0.6);
    expect(bugs(paper.s).filter(z => z.type === 'stinger').length).toBeGreaterThanOrEqual(3);
    expect(road.objectiveText(paper.s)).toContain('left)');
    const lantern = cell('lantern', 'l_cocoons');
    road.startMission(lantern.s, idx('lantern')); lantern.s.ui = null; tick(lantern.s);
    const coc = lantern.s.zombies.filter(z => (z as HBug).cocoon) as HBug[];
    expect(coc).toHaveLength(3);
    teleport(lantern.s, { x: coc[0].x + 60, y: coc[0].y }); secs(lantern.s, 4);
    expect(coc[0].dead).toBe(false);                                                 // it does not open on its own
    let lurkers = 0, loot = 0;
    for (let i = 0; i < 60; i++) { const c = hive.spawnFixture(lantern.s, 'egg', { x: coc[1].x, y: coc[1].y }, 'x') as HBug; c.cocoon = true; c.noHatch = true; const n = lantern.s.zombies.length; const got = hive.onDeath(lantern.s, Object.assign(c, { dead: true })); if (lantern.s.zombies.length > n) lurkers++; if (got.length) loot++; }
    expect(lurkers).toBeGreaterThan(10); expect(loot).toBeGreaterThan(20); expect(lurkers + loot).toBe(60);
  });
  it('Ada, Ben, Kit and Lewis stand with you in the three hold-outs of the later cells, and go when it is over', () => {
    for (const id of ['granary', 'seals', 'daylight']) {
      const s = start(); road.startMission(s, idx(id)); s.ui = null; tick(s);
      const def = HIVE_MISSIONS[idx(id)], at = def.objectives.findIndex(o => o.kind === 'holdout');
      expect((def.objectives[at] as { squad?: boolean }).squad, id).toBe(true);
      for (let i = 0; i < at; i++) road.devSkip(s);
      expect(s.road!.allies, id).toHaveLength(4);
      const c = road.currentRun(s)!.point;
      for (const a of s.road!.allies) expect(Math.hypot(a.x - c.x, a.y - c.y)).toBeLessThan(160);
      road.devSkip(s);
      expect(s.road!.allies).toHaveLength(0);
    }
  });
  it('Daylight: you come up at the rift at first light, you have 45 seconds to reach the dam, and the last breaker shuts the rift on everything', () => {
    const s = start(); road.startMission(s, idx('daylight')); s.ui = null; tick(s);
    const r = s.road!, w = r.world, p = s.player;
    expect(Math.hypot(p.x - w.hive!.rift.x, p.y - w.hive!.rift.y)).toBeLessThan(60);
    expect(game.darkness(s)).toBeLessThan(0.45);                                     // daylight on the bed
    expect(road.objectiveText(s)).toMatch(/\(4[45]s\)/);
    // too slow
    secs(s, 45.5);
    expect(s.screen).toBe('dead');
    road.restart(s);
    expect(road.objectiveText(s)).toMatch(/\(45s\)/);
    teleport(s, road.currentRun(s)!.point); run(s, 3);
    expect(road.current(s)!.kind).toBe('holdout');
    road.devSkip(s);
    expect(road.current(s)!.kind).toBe('interact');
    for (let i = 0; i < 40; i++) hive.spawnBug(s, 'drone', p.x + 200 + i * 5, p.y + 200);
    teleport(s, road.currentRun(s)!.point); secs(s, 1.8, { interactHeld: true });
    expect(r.riftShut).toBe(true); expect(bugs(s)).toHaveLength(0);
    expect(road.current(s)!.kind).toBe('camp');
    expect(road.campOf(s, idx('daylight'))).toEqual(mid(w.sites.dam!));
  });
});
