// hive-arms.ts — what the insect weapons of the later cells do that an ordinary gun or blade does not.
// sim/combat.ts owns firing, magazines, bullets and swings; a weapon with `arm` set in WEAPONS calls in here:
//   hop     Locust Repeater  every hit hops on to two more bugs within 140 px at 60% damage
//   needle  Needler          the needle goes through three bugs and poisons each (30 damage over 4 s)
//   homing  The Vespiary     hornets steer at the nearest bug; no ammunition: it holds 100 and breeds 2 a second, always
//   cone    Bombardier       a short cone of boiling spray: sets alight (combat's incendiary) and shoves back
//   shock   Hornbreaker      every swing sends a shock line 300 px forward that knocks a column flat
//   lure    Lure Lantern     lobs a lure: every ordinary bug within 500 px goes for it for 6 s, then it bursts for 120
//   scythe  Mantis Scythes   each swing steps you forward; double damage from behind (the heal is combat's lifesteal)
//   pod     Carrion Hive     lobs a pod: a cloud of flies for 6 s, 25 damage a second; what dies in it bursts
//   mark    Queen's Decree   the swarm turns on the marked bug for 6 s; a marked boss takes 25% more damage instead
// Pure sim (rand(state) only). Thrown things and clouds live in hive.HiveRuntime, so a mission restart clears them.
import { angleDiff, emit, phys, sound } from './core';
import type { Bullet, GameState, Vec, Zombie } from './types';
import * as zombies from './zombies';
import * as hive from './hive';
import { isFloor } from './hive-world';
import type { HBug } from './hive-bugs';
import type { WeaponStats } from './combat';

export type Arm = 'hop' | 'needle' | 'homing' | 'cone' | 'shock' | 'lure' | 'scythe' | 'pod' | 'mark';
type ArmBullet = Bullet & { arm?: Arm };
type RT = hive.HiveRuntime & { markAcc?: number };

export const HOP_RANGE = 140, HOP_COUNT = 2, HOP_DAMAGE = 0.6;
export const NEEDLE_VENOM = 4;
export const HOME_RANGE = 420, HOME_TURN = 7, BREED_RATE = 2;
export const CONE_SHOVE = 26;
export const SHOCK_LEN = 300, SHOCK_HALF = 36, SHOCK_STUN = 1.1, SHOCK_DAMAGE = 0.5;
export const LOB_RANGE = 320, LOB_TIME = 0.45, LURE_RANGE = 500, LURE_TIME = 6, LURE_BURST = 120, LURE_BLAST = 110;
export const SCYTHE_STEP = 22, SCYTHE_BACK = 2;
export const CLOUD_R = 105, CLOUD_TIME = 6, CLOUD_DPS = 25, CLOUD_BURST = 30, CLOUD_BURST_R = 70;
export const MARK_TIME = 6, MARK_RANGE = 450;

const COLOR: Partial<Record<Arm, string>> = { hop: '#b7e04a', needle: '#f2d25a', homing: '#ffcf4a', cone: '#ff8a3a', mark: '#d77cff' };
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const ordinary = (z: Zombie) => !z.dead && !z.boss && !z.inert;
const onFloor = (state: GameState, x: number, y: number) => { const h = state.road?.world.hive; return !h || isFloor(h, x, y); };
const rtOf = (state: GameState) => hive.runtime(state) as RT | null;

/** Extra fields for a bullet fired by an insect gun (combat.fireShot spreads these over its own). */
export function bullet(arm: Arm): Partial<ArmBullet> {
  return { arm, ...(COLOR[arm] ? { color: COLOR[arm] } : {}), ...(arm === 'homing' ? { r: 4 } : {}) };
}
/** A bullet from an insect gun has hit `z` for `dmg`. */
export function onHit(state: GameState, b: Bullet, z: Zombie, dmg: number) {
  const arm = (b as ArmBullet).arm, t = z as HBug;
  if (arm === 'hop') {
    const near = state.zombies.filter(o => o !== z && !o.dead && dist(o, z) < HOP_RANGE + o.r).sort((p, q) => dist(p, z) - dist(q, z)).slice(0, HOP_COUNT);
    for (const o of near) {
      emit(state, { t: 'bulletHit', x: o.x, y: o.y, angle: Math.atan2(o.y - z.y, o.x - z.x), surface: 'flesh', acid: true });
      zombies.damage(state, o, dmg * HOP_DAMAGE, Math.atan2(o.y - z.y, o.x - z.x), { source: 'hop' });
    }
  } else if (arm === 'needle') { if (!z.dead) t.venomT = NEEDLE_VENOM; }
  else if (arm === 'cone') {
    if (ordinary(z)) { const nx = z.x + Math.cos(b.angle) * CONE_SHOVE, ny = z.y + Math.sin(b.angle) * CONE_SHOVE; if (phys.isFree(state, nx, ny, z.r) && onFloor(state, nx, ny)) { z.x = nx; z.y = ny; } }
  } else if (arm === 'mark') {
    if (!z.dead && !z.inert) { t.markT = MARK_TIME; emit(state, { t: 'hive', kind: 'rally', x: z.x, y: z.y }); sound(state, 'horde', z.x, z.y); }
  }
}
/** The Lure Lantern and the Carrion Hive throw instead of shooting. True when this weapon was thrown. */
export function lob(state: GameState, arm: Arm): boolean {
  if (arm !== 'lure' && arm !== 'pod') return false;
  const rt = rtOf(state), p = state.player; if (!rt) return true;
  // as far as the throw goes before rock
  let tx = p.x, ty = p.y;
  for (let d = 30; d <= LOB_RANGE; d += 15) { const x = p.x + Math.cos(p.angle) * d, y = p.y + Math.sin(p.angle) * d; if (!phys.isFree(state, x, y, 8) || !onFloor(state, x, y)) break; tx = x; ty = y; }
  (rt.lobs ??= []).push({ kind: arm, x: p.x, y: p.y, sx: p.x, sy: p.y, tx, ty, t: 0, T: LOB_TIME });
  sound(state, 'swing', p.x, p.y);
  return true;
}
/** Damage multiplier of a melee hit on `z` (the Mantis Scythes from behind). */
export function meleeMul(state: GameState, arm: Arm | undefined, z: Zombie): number {
  if (arm !== 'scythe') return 1;
  const p = state.player, blow = Math.atan2(z.y - p.y, z.x - p.x);
  return Math.cos(z.angle - blow) > 0.3 ? SCYTHE_BACK : 1;   // it is facing away from you
}
/** After a melee swing with an insect weapon. */
export function onSwing(state: GameState, ws: WeaponStats) {
  const p = state.player, arm = ws.arm;
  if (arm === 'scythe') {
    const x = p.x + Math.cos(p.angle) * SCYTHE_STEP, y = p.y + Math.sin(p.angle) * SCYTHE_STEP;
    if (phys.isFree(state, x, y, p.r) && onFloor(state, x, y) && !state.zombies.some(z => !z.dead && Math.hypot(z.x - x, z.y - y) < z.r + p.r - 2)) { p.x = x; p.y = y; }
  } else if (arm === 'shock') {
    const dx = Math.cos(p.angle), dy = Math.sin(p.angle);
    // the line stops at rock
    let len = SHOCK_LEN; const wall = phys.raycast(state, p.x, p.y, p.x + dx * SHOCK_LEN, p.y + dy * SHOCK_LEN, 1, o => o.solid !== false && o.blocksBullets !== false); if (wall) len = SHOCK_LEN * wall.t;
    for (const z of state.zombies as HBug[]) {
      if (z.dead) continue;
      const along = (z.x - p.x) * dx + (z.y - p.y) * dy, across = Math.abs((z.x - p.x) * dy - (z.y - p.y) * dx);
      if (along < 20 || along > len + z.r || across > SHOCK_HALF + z.r) continue;
      zombies.damage(state, z, ws.damage * SHOCK_DAMAGE, p.angle, { source: 'shock', explosion: true });
      if (ordinary(z)) z.stunT = SHOCK_STUN;
    }
    for (let k = 1; k <= 4; k++) emit(state, { t: 'hive', kind: 'erupt', x: p.x + dx * len * k / 4, y: p.y + dy * len * k / 4 });
    state.shake = Math.max(state.shake, 7);
  }
}

function burst(state: GameState, at: Vec, r: number, dmg: number) {
  emit(state, { t: 'explosion', x: at.x, y: at.y, radius: r });
  for (const z of state.zombies) if (!z.dead && dist(z, at) < r + z.r) zombies.damage(state, z, dmg * (1 - 0.4 * dist(z, at) / (r + z.r)), Math.atan2(z.y - at.y, z.x - at.x), { explosion: true, source: 'player' });
}

/** Once per road tick, from hive.update. */
export function update(state: GameState, dt: number) {
  const rt = rtOf(state), p = state.player; if (!rt) return;
  // ---- things in the air
  if (rt.lobs?.length) {
    for (const l of rt.lobs) {
      l.t += dt; const k = Math.min(1, l.t / l.T);
      l.x = l.sx + (l.tx - l.sx) * k; l.y = l.sy + (l.ty - l.sy) * k;
      if (k < 1) continue;
      if (l.kind === 'lure') { (rt.lures ??= []).push({ x: l.tx, y: l.ty, life: LURE_TIME, dmg: LURE_BURST }); emit(state, { t: 'hive', kind: 'rally', x: l.tx, y: l.ty }); }
      else { (rt.clouds ??= []).push({ x: l.tx, y: l.ty, r: CLOUD_R, life: CLOUD_TIME, acc: 0, dps: CLOUD_DPS }); emit(state, { t: 'hive', kind: 'hatch', x: l.tx, y: l.ty }); }
    }
    rt.lobs = rt.lobs.filter(l => l.t < l.T);
  }
  // ---- lures: everything ordinary nearby goes for the light, then it bursts
  if (rt.lures?.length) {
    for (const l of rt.lures) {
      l.life -= dt;
      for (const z of state.zombies as HBug[]) if (ordinary(z) && z.do !== 'hide' && dist(z, l) < LURE_RANGE) { z.lureT = 0.3; z.lx = l.x; z.ly = l.y; }
      if (l.life <= 0) { burst(state, l, LURE_BLAST, l.dmg); state.shake = Math.max(state.shake, 8); sound(state, 'explosion', l.x, l.y); }
    }
    rt.lures = rt.lures.filter(l => l.life > 0);
  }
  // ---- clouds of flies
  if (rt.clouds?.length) {
    for (const c of rt.clouds) {
      c.life -= dt; c.acc += dt;
      if (c.acc < 0.5) continue;
      c.acc -= 0.5;
      const died: Zombie[] = [];
      for (const z of state.zombies) {
        if (z.dead || dist(z, c) > c.r + z.r) continue;
        zombies.damage(state, z, c.dps * 0.5, NaN, { burn: true, source: 'flies' });
        if (z.dead && !z.inert) died.push(z);
      }
      // what dies in the cloud bursts and hurts what stands beside it (one generation per pulse)
      for (const d of died) { emit(state, { t: 'hive', kind: 'hatch', x: d.x, y: d.y }); for (const z of state.zombies) if (!z.dead && z !== d && dist(z, d) < CLOUD_BURST_R + z.r) zombies.damage(state, z, CLOUD_BURST, Math.atan2(z.y - d.y, z.x - d.x), { explosion: true, source: 'flies' }); }
    }
    rt.clouds = rt.clouds.filter(c => c.life > 0);
  }
  // ---- the Queen's Decree: the swarm turns on a marked bug
  rt.markAcc = (rt.markAcc ?? 0) + dt;
  const pulse = rt.markAcc >= 0.5; if (pulse) rt.markAcc -= 0.5;
  for (const m of state.zombies as HBug[]) {
    if (m.dead || m.boss || !((m.markT ?? 0) > 0)) continue;
    let bites = 0;
    for (const z of state.zombies as HBug[]) {
      if (z === m || !ordinary(z) || z.do === 'hide' || (z.markT ?? 0) > 0 || dist(z, m) > MARK_RANGE) continue;
      z.lureT = 0.3; z.lx = m.x; z.ly = m.y;
      if (pulse && dist(z, m) < z.r + m.r + 10) { bites += z.damage; z.attackT = 0; }
    }
    if (bites > 0) zombies.damage(state, m, bites, NaN, { source: 'swarm' });
  }
  // ---- hornets steer at the nearest bug in front of them
  for (const b of state.bullets as ArmBullet[]) {
    if (b.dead || b.arm !== 'homing') continue;
    let best: Zombie | null = null, bd = HOME_RANGE;
    for (const z of state.zombies) {
      if (z.dead || (b.hit && b.hit.has(z.id))) continue;
      const d = dist(z, b); if (d >= bd || Math.abs(angleDiff(b.angle, Math.atan2(z.y - b.y, z.x - b.x))) > 1.3) continue;
      best = z; bd = d;
    }
    if (!best) continue;
    const want = Math.atan2(best.y - b.y, best.x - b.x), turn = Math.max(-HOME_TURN * dt, Math.min(HOME_TURN * dt, angleDiff(b.angle, want))), sp = Math.hypot(b.vx, b.vy);
    b.angle += turn; b.vx = Math.cos(b.angle) * sp; b.vy = Math.sin(b.angle) * sp;
  }
  // ---- the Vespiary breeds its own: 2 a second, always, in your hand or holstered, up to 100
  for (const key of ['primary', 'secondary'] as const) {
    const st = p.inv.equip[key] as (typeof p.inv.equip.secondary & { brood?: number }) | null;
    if (st?.id !== 'vespiary' || (st.mag ?? 0) >= VESPIARY_MAG) continue;
    st.brood = (st.brood ?? 0) + BREED_RATE * dt;
    if (st.brood >= 1) { const n = Math.floor(st.brood); st.brood -= n; st.mag = Math.min(VESPIARY_MAG, (st.mag ?? 0) + n); }
  }
}
export const VESPIARY_MAG = 100;
