// hive-bosses.ts — the bosses of the cells beyond the Warrens: Famine, Matriarch Vespa, Goliath, the Prioress,
// the Carrion Lord and the Queen. They stand on the boss kit of sim/bosses.ts (telegraphs, lobbed shots, rings, pools,
// rage below half health): bosses.think hands over to think() here, and zombies.damage asks armour() about every hit.
// A special is always shown before it lands. Pure sim (rand(state) only).
import { angleDiff, emit, phys, rand, sound, toast } from './core';
import type { GameState, Vec, Zombie, ZombieType } from './types';
import type { DamageOptions } from './zombies';
import * as bosses from './bosses';
import type { BossId } from './bosses';
import * as hive from './hive';
import { isFloor } from './hive-world';
import { inBeam, type HBug } from './hive-bugs';
import type { Weights } from './road-data';

export const IDS: ReadonlySet<BossId> = new Set<BossId>(['famine', 'vespa', 'goliath', 'prioress', 'carrion_lord', 'queen']);
/** The Queen's four stages end at these shares of her health (the first ends when the four conduits are down). */
export const QUEEN_STAGE = [0.75, 0.5, 0.25];
export const GOLIATH_PLATE = 0.15, GOLIATH_STUCK = 2.5, QUEEN_CONDUITS = 4;

type B = Zombie & {
  boss: BossId; bossMul: number; baseSpeed: number; act: string; actT: number; actA: number; actX: number; actY: number;
  cd: Record<string, number>; leapN: number; hitPlayer: boolean; raged?: boolean; stage: number; drawR?: number;
  /** renderer: height of a leap 0..1, opacity */ leapK?: number; alpha?: number;
  /** set up by this module on the first tick */ ready?: boolean; tx?: number; ty?: number; homeX?: number; homeY?: number;
  shotT?: number; legs?: number; side?: number; auraT2?: number; hintT?: number; clutch?: number; biles?: bosses.BossPool[];
};
interface Ctx { enraged: boolean; m: number; hpMul: number }
const K = () => bosses.kit;
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const onFloor = (state: GameState, x: number, y: number) => { const h = state.road?.world.hive; return !h || isFloor(h, x, y); };
const open = (state: GameState, x: number, y: number, r: number) => phys.isFree(state, x, y, r) && onFloor(state, x, y);
const tele = (state: GameState, t: Omit<bosses.BossTele, 't'>) => bosses.fx(state).tele.push({ ...t, t: 0 });
const room = (state: GameState) => hive.liveBugs(state) < hive.SWARM_CAP - 20;
/** An open spot `d` px from (x,y) in direction `a`, pulled in toward the centre until it is floor. */
function spot(state: GameState, x: number, y: number, a: number, d: number, r = 20): Vec | null {
  for (let k = d; k >= 80; k -= 30) { const px = x + Math.cos(a) * k, py = y + Math.sin(a) * k; if (open(state, px, py, r)) return { x: px, y: py }; }
  return null;
}
/** A timed clutch: egg clusters that hatch `brood` after `secs` unless they are destroyed first. */
function clutch(state: GameState, z: B, n: number, brood: ZombieType, each: number, secs: number, tag: string, color: string) {
  const base = rand(state) * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const at = spot(state, z.x, z.y, base + i * Math.PI * 2 / n + (rand(state) - 0.5) * 0.5, 230 + rand(state) * 110);
    if (!at) continue;
    const e = hive.spawnFixture(state, 'egg', at, tag) as HBug;
    e.brood = brood; e.broodN = each; e.hatchTime = secs; e.hatchT = 0.01;
    tele(state, { kind: 'circle', x: at.x, y: at.y, r: 40, angle: 0, len: 0, T: secs, color });
  }
}
/** A straight dash along z.actA; false when rock stops it. */
function dash(state: GameState, z: B, speed: number, dt: number, dmg: number, shove: number) {
  const ok = K().shove(state, z as never, Math.cos(z.actA) * speed * dt, Math.sin(z.actA) * speed * dt) && onFloor(state, z.x, z.y);
  const p = state.player;
  if (!z.hitPlayer && dist(z, p) < z.r + p.r + 6) { z.hitPlayer = true; K().hurtPlayer(state, dmg, z, shove); }
  return ok;
}
function inLane(p: Vec, x: number, y: number, a: number, len: number, half: number) {
  const dx = Math.cos(a), dy = Math.sin(a), along = (p.x - x) * dx + (p.y - y) * dy, across = Math.abs((p.x - x) * dy - (p.y - y) * dx);
  return along > 0 && along < len && across < half;
}

// ------------------------------------------------------------------ hits
/** Plates, the Queen's resin, a boss that is out of reach. Returns the damage that gets through (0 = none). */
export function armour(state: GameState, zombie: Zombie, amount: number, angle: number, opts?: DamageOptions): number {
  const z = zombie as B;
  if (!IDS.has(z.boss)) return amount;
  const cooked = !!(opts?.burn || opts?.explosion);
  if (z.boss === 'goliath') {
    if (z.act === 'stuck') return amount * 2;   // horn buried in the rock: the soft back is open
    if (Number.isFinite(angle) && !cooked && Math.cos(angle - z.angle) < -0.2) { emit(state, { t: 'bulletHit', x: z.x, y: z.y, angle, surface: 'metal' }); return amount * GOLIATH_PLATE; }
  } else if (z.boss === 'famine') {
    if (z.act === 'leaping' && z.actT > 0.12 && z.actT < 0.9) return 0;   // out of sight
  } else if (z.boss === 'queen') {
    if (z.stage === 0) {
      // sealed in resin until the four conduits are broken
      if (Number.isFinite(angle)) emit(state, { t: 'bulletHit', x: z.x - Math.cos(angle) * z.r * 0.8, y: z.y - Math.sin(angle) * z.r * 0.8, angle, surface: 'wall' });
      if (!((z.hintT ?? 0) > 0)) { z.hintT = 6; toast(state, 'The resin holds. Break the four jelly conduits.', '#b48cff'); }
      return 0;
    }
    // a stage ends where it ends: one huge hit cannot skip the next one
    const floor = z.stage < 3 ? z.maxHp * QUEEN_STAGE[z.stage] - 1 : 0;
    amount *= z.stage === 3 ? 1.5 : 1;                                      // the exposed heart
    return Math.max(0.01, Math.min(amount, z.hp - floor));
  }
  return amount;
}

// ------------------------------------------------------------------ the fights
/** Called by bosses.think for the six bosses above, after rage and cooldowns have been counted. */
export function think(state: GameState, zombie: Zombie, dt: number, c: Ctx) {
  const z = zombie as B, p = state.player;
  if (!z.ready) { z.ready = true; z.homeX = z.x; z.homeY = z.y; z.cd = { a: 4, b: 7, c: 10, d: 13 }; z.side = 1; }
  // a boss that has not noticed you saves its specials (it is standing in its arena)
  if (!z.act && z.state !== 'chase' && z.boss !== 'queen') { z.speed = z.baseSpeed; return; }
  if ((z.hintT ?? 0) > 0) z.hintT! -= dt;
  switch (z.boss) {
    case 'famine': famine(state, z, dt, c); break;
    case 'vespa': vespa(state, z, dt, c); break;
    case 'goliath': goliath(state, z, dt, c); break;
    case 'prioress': prioress(state, z, dt, c); break;
    case 'carrion_lord': carrion(state, z, dt, c); break;
    case 'queen': queen(state, z, dt, c); break;
  }
  void p;
}

/** Famine: Skyfall (a leap out of sight, a shadow where it lands, a shockwave), the swarm front (a marked lane), three leaps in a rage. */
function famine(state: GameState, z: B, dt: number, c: Ctx) {
  const p = state.player, dp = dist(z, p), toP = Math.atan2(p.y - z.y, p.x - z.x), glow = bosses.BOSSES.famine.glow;
  if (z.act) {
    z.actT += dt; z.speed = 0;
    if (z.act === 'skyWind') {
      z.angle = toP;
      if (z.actT >= 0.5) { z.act = 'leaping'; z.actT = 0; z.actX = z.x; z.actY = z.y; z.tx = p.x; z.ty = p.y; tele(state, { kind: 'circle', x: p.x, y: p.y, r: 130, angle: 0, len: 0, T: 1, color: glow }); }
    } else if (z.act === 'leaping') {
      const k = Math.min(1, z.actT / 1);
      z.x = z.actX + (z.tx! - z.actX) * k; z.y = z.actY + (z.ty! - z.actY) * k; z.leapK = k;
      z.alpha = 1 - 0.95 * Math.sin(Math.PI * k);   // out of sight: only the shadow on the floor says where
      if (k >= 1) {
        z.leapK = 0; z.alpha = 1; z.act = 'stuck'; z.actT = 0;
        K().ring(state, z.x, z.y, 330, 520, 20 * c.m, 110, glow, 28);
        if (dist(z, p) < 130 + p.r) K().hurtPlayer(state, 32 * c.m, z, 120);
        state.shake = Math.max(state.shake, 14); emit(state, { t: 'explosion', x: z.x, y: z.y, radius: 110 }); sound(state, 'explosion', z.x, z.y);
      }
    } else if (z.act === 'stuck') {   // buried to the knees: the opening
      if (z.actT >= 1.2) { if (z.leapN > 0) { z.leapN--; z.act = 'skyWind'; z.actT = 0.2; } else z.act = ''; }
    } else if (z.act === 'frontWind') {
      if (z.actT >= 1.3) {
        if (inLane(p, z.actX, z.actY, z.actA, 1500, 80 + p.r)) { K().hurtPlayer(state, 20 * c.m, { x: p.x - Math.cos(z.actA), y: p.y - Math.sin(z.actA) }, 60); }
        for (let k = 0; k < 7; k++) emit(state, { t: 'hive', kind: 'erupt', x: z.actX + Math.cos(z.actA) * (k + 0.5) * 214, y: z.actY + Math.sin(z.actA) * (k + 0.5) * 214 });
        if (room(state)) hive.column(state, z, 6, { hopper: 1 }, { horde: true });
        sound(state, 'horde', z.x, z.y); z.act = '';
      }
    }
    return;
  }
  z.speed = z.baseSpeed * (c.enraged ? 1.25 : 1);
  if (z.cd.a <= 0 && dp > 140 && dp < 900) { z.cd.a = 8; z.act = 'skyWind'; z.actT = 0; z.leapN = c.enraged ? 2 : 0; }
  else if (z.cd.b <= 0 && dp < 1000) {
    z.cd.b = 12; z.act = 'frontWind'; z.actT = 0;
    const a = rand(state) * Math.PI, off = (rand(state) - 0.5) * 120;
    z.actA = a; z.actX = p.x + Math.cos(a + Math.PI / 2) * off - Math.cos(a) * 750; z.actY = p.y + Math.sin(a + Math.PI / 2) * off - Math.sin(a) * 750;
    tele(state, { kind: 'line', x: z.actX, y: z.actY, r: 80, angle: a, len: 1500, T: 1.3, color: '#9fb54a' });
  }
}

/** Matriarch Vespa: a strafing run down a marked lane, a venom volley, comb cells to shoot before they hatch; in a rage she lands and dashes. */
function vespa(state: GameState, z: B, dt: number, c: Ctx) {
  const p = state.player, dp = dist(z, p), toP = Math.atan2(p.y - z.y, p.x - z.x), glow = bosses.BOSSES.vespa.glow;
  z.leapK = c.enraged ? 0 : 0.18;   // on the wing until she is hurt enough to land
  if (z.act) {
    z.actT += dt; z.speed = 0;
    if (z.act === 'strafeWind') { if (z.actT >= 0.8) { z.act = 'strafing'; z.actT = 0; z.hitPlayer = false; z.shotT = 0; } }
    else if (z.act === 'strafing') {
      z.angle = z.actA;
      const ok = dash(state, z, 600, dt, 26 * c.m, 80);
      z.shotT = (z.shotT ?? 0) - dt;
      if (z.shotT <= 0) { z.shotT = 0.13; for (const s of [-0.5, 0.5]) K().spit(state, z as never, z.actA + Math.PI / 2 * Math.sign(s) + (rand(state) - 0.5) * 0.5, 430, 9 * c.m); }
      if (!ok || z.actT >= 1.3) { z.act = 'recover'; z.actT = 0; }
    } else if (z.act === 'volleyWind') {
      z.angle = toP;
      if (z.actT >= 0.5) { for (let i = 0; i < 3; i++) { const a = rand(state) * Math.PI * 2, r = i ? 110 + rand(state) * 60 : 0; K().lob(state, z as never, 'acid', p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 0.7 + i * 0.12, 10 * c.m); } z.act = 'recover'; z.actT = 0.2; }
    } else if (z.act === 'hatchWind') { if (z.actT >= 2.6) z.act = ''; }   // she hovers still while the combs ripen: the opening
    else if (z.act === 'dashWind') { if (z.actT < 0.4) z.actA = toP; z.angle = z.actA; if (z.actT >= 0.65) { z.act = 'dashing'; z.actT = 0; z.hitPlayer = false; } }
    else if (z.act === 'dashing') { z.angle = z.actA; const ok = dash(state, z, 620, dt, 34 * c.m, 120); if (!ok || z.actT >= 0.75) { z.act = 'recover'; z.actT = 0; } }
    else if (z.actT >= 0.5) z.act = '';
    return;
  }
  z.speed = z.baseSpeed * (c.enraged ? 1.2 : 1);
  if (c.enraged && z.cd.d <= 0 && dp > 120 && dp < 700) { z.cd.d = 6; z.act = 'dashWind'; z.actT = 0; z.actA = toP; tele(state, { kind: 'line', x: z.x, y: z.y, r: z.r, angle: toP, len: 470, T: 0.65, color: glow }); }
  else if (z.cd.a <= 0 && dp > 160 && dp < 900) {
    z.cd.a = 7.5; z.act = 'strafeWind'; z.actT = 0; z.actA = toP + (rand(state) - 0.5) * 0.3;
    tele(state, { kind: 'line', x: z.x, y: z.y, r: 70, angle: z.actA, len: 780, T: 0.8, color: glow });
  } else if (z.cd.b <= 0 && dp < 700) { z.cd.b = 6; z.act = 'volleyWind'; z.actT = 0; }
  else if (z.cd.c <= 0) { z.cd.c = 20; z.act = 'hatchWind'; z.actT = 0; clutch(state, z, 3, 'stinger', 4, 5, 'comb', '#f2d25a'); toast(state, 'Comb cells are hatching: shoot them', '#f2d25a'); sound(state, 'groan', z.x, z.y); }
}

/** Goliath: armoured in front. The ram buries its horn in rock (stuck, soft back open), a scalding cone behind it, a line of eruptions. */
function goliath(state: GameState, z: B, dt: number, c: Ctx) {
  const p = state.player, dp = dist(z, p), toP = Math.atan2(p.y - z.y, p.x - z.x), glow = bosses.BOSSES.goliath.glow;
  if (z.act) {
    z.actT += dt; z.speed = 0;
    if (z.act === 'ramWind') { if (z.actT < 0.55) z.actA = toP; z.angle = z.actA; if (z.actT >= 0.9) { z.act = 'ramming'; z.actT = 0; z.hitPlayer = false; } }
    else if (z.act === 'ramming') {
      z.angle = z.actA;
      const ok = dash(state, z, 520, dt, 40 * c.m, 130);
      if (!ok) { z.act = 'stuck'; z.actT = 0; state.shake = Math.max(state.shake, 14); emit(state, { t: 'explosion', x: z.x + Math.cos(z.actA) * z.r, y: z.y + Math.sin(z.actA) * z.r, radius: 50 }); sound(state, 'explosion', z.x, z.y); }
      else if (z.actT >= 1.25) { z.act = 'recover'; z.actT = 0; }
    } else if (z.act === 'stuck') { z.angle = z.actA; if (z.actT >= (c.enraged ? 1.6 : GOLIATH_STUCK)) z.act = ''; }
    else if (z.act === 'ventWind') {
      z.angle = z.actA;
      if (z.actT >= 0.5) {
        const back = z.actA + Math.PI;
        if (dp < 290 && Math.abs(angleDiff(back, toP)) < 1.0) K().hurtPlayer(state, 22 * c.m, z, 60);
        for (const k of [-0.5, 0.5]) { const x = z.x + Math.cos(back + k) * 150, y = z.y + Math.sin(back + k) * 150; if (onFloor(state, x, y)) bosses.fx(state).pools.push({ kind: 'acid', x, y, r: 55, life: 3, max: 3, dmg: 8 * c.m, tick: 0.3 }); }
        emit(state, { t: 'hive', kind: 'erupt', x: z.x + Math.cos(back) * 90, y: z.y + Math.sin(back) * 90 }); sound(state, 'zombieAttack', z.x, z.y);
        z.act = 'recover'; z.actT = 0.2;
      }
    } else if (z.act === 'quakeWind') {
      z.angle = toP;
      if (z.actT >= 0.6) { for (let i = 0; i < 6; i++) { const d = 120 + (dp + 60) * i / 5; K().lob(state, z as never, 'rock', z.x + Math.cos(toP) * d, z.y + Math.sin(toP) * d, 0.45 + i * 0.13, 18 * c.m); } z.act = 'recover'; z.actT = 0; }
    } else if (z.actT >= 0.5) z.act = '';
    return;
  }
  z.speed = z.baseSpeed * (c.enraged ? 1.25 : 1);
  const behind = Math.abs(angleDiff(z.angle + Math.PI, toP)) < 1.0;
  if (z.cd.b <= 0 && behind && dp < 270) { z.cd.b = 5; z.act = 'ventWind'; z.actT = 0; z.actA = z.angle; tele(state, { kind: 'circle', x: z.x + Math.cos(z.angle + Math.PI) * 140, y: z.y + Math.sin(z.angle + Math.PI) * 140, r: 150, angle: 0, len: 0, T: 0.5, color: '#ff8a3a' }); }
  else if (z.cd.a <= 0 && dp > 160 && dp < 820) { z.cd.a = 7; z.act = 'ramWind'; z.actT = 0; z.actA = toP; tele(state, { kind: 'line', x: z.x, y: z.y, r: z.r, angle: toP, len: 650, T: 0.9, color: glow }); }
  else if (z.cd.c <= 0 && dp > 200 && dp < 900) { z.cd.c = 9; z.act = 'quakeWind'; z.actT = 0; }
}

/** The Prioress: unseen outside your beam. Two dashes that cross where you stand, a wide reap up close, moths to your light. */
function prioress(state: GameState, z: B, dt: number, c: Ctx) {
  const p = state.player, dp = dist(z, p), toP = Math.atan2(p.y - z.y, p.x - z.x), glow = bosses.BOSSES.prioress.glow;
  const seen = !!z.act || dp < 150 || z.hitFlash > 0 || inBeam(state, z.x, z.y, 640, 0.5);
  z.alpha = Math.max(0.06, Math.min(1, (z.alpha ?? 1) + (seen ? 6 : -3) * dt));
  if (z.act) {
    z.actT += dt; z.speed = 0;
    if (z.act === 'crossWind') { if (z.actT < 0.45) z.actA = toP; z.angle = z.actA; if (z.actT >= 0.75) { z.act = 'dashing'; z.actT = 0; z.hitPlayer = false; z.tx = dp + 190; } }
    else if (z.act === 'dashing') {
      z.angle = z.actA;
      const ok = dash(state, z, 700, dt, 34 * c.m, 100);
      if (!ok || z.actT * 700 >= z.tx!) {
        if (z.leapN > 0) {   // the second lane crosses the first where you were standing
          z.leapN--; z.act = 'crossWind'; z.actT = 0.3; z.actA = Math.atan2(p.y - z.y, p.x - z.x);
          tele(state, { kind: 'line', x: z.x, y: z.y, r: z.r, angle: z.actA, len: dist(z, p) + 190, T: 0.45, color: glow });
        } else { z.act = 'tired'; z.actT = 0; }
      }
    } else if (z.act === 'tired') { if (z.actT >= 1.2) z.act = ''; }   // slow to recover after the cross: the opening
    else if (z.act === 'reapWind') {
      z.angle = z.actA;
      if (z.actT >= 0.45) { if (dp < 135 + p.r && Math.abs(angleDiff(z.actA, toP)) < 1.75) K().hurtPlayer(state, 30 * c.m, z, 90); state.shake = Math.max(state.shake, 6); sound(state, 'swing', z.x, z.y); z.act = 'recover'; z.actT = 0; }
    } else if (z.actT >= 0.45) z.act = '';
    return;
  }
  z.speed = z.baseSpeed * (c.enraged ? 1.2 : 1);
  if (z.cd.b <= 0 && dp < 115) { z.cd.b = 3.5; z.act = 'reapWind'; z.actT = 0; z.actA = toP; tele(state, { kind: 'circle', x: z.x, y: z.y, r: 135, angle: 0, len: 0, T: 0.45, color: glow }); }
  else if (z.cd.a <= 0 && dp > 130 && dp < 720) {
    z.cd.a = 6.5; z.act = 'crossWind'; z.actT = 0; z.actA = toP; z.leapN = c.enraged ? 2 : 1;
    tele(state, { kind: 'line', x: z.x, y: z.y, r: z.r, angle: toP, len: dp + 190, T: 0.75, color: glow });
  } else if (z.cd.c <= 0) { z.cd.c = 15; if (room(state)) hive.column(state, z, 4, { dustwing: 1 }, { horde: true }); emit(state, { t: 'hive', kind: 'rally', x: z.x, y: z.y }); sound(state, 'groan', z.x, z.y); }
}

/** The Carrion Lord: a toxic aura, heaps that burst into Grubs unless you destroy them, a puddle that keeps spreading, a zig-zag flight. */
function carrion(state: GameState, z: B, dt: number, c: Ctx) {
  const p = state.player, dp = dist(z, p), toP = Math.atan2(p.y - z.y, p.x - z.x), glow = bosses.BOSSES.carrion_lord.glow;
  z.auraT2 = (z.auraT2 ?? 0) - dt;
  if (z.auraT2 <= 0 && dp < CARRION_AURA + p.r) { z.auraT2 = 0.5; K().hurtPlayer(state, 6 * c.m, z); }
  // bile keeps spreading
  if (z.biles?.length) { for (const q of z.biles) q.r = Math.min(150, q.r + 15 * dt); z.biles = z.biles.filter(q => q.life > 0); }
  if (z.act) {
    z.actT += dt; z.speed = 0;
    if (z.act === 'bileWind') {
      z.angle = toP;
      if (z.actT >= 0.6) { const q: bosses.BossPool = { kind: 'toxic', x: z.tx!, y: z.ty!, r: 45, life: 9, max: 9, dmg: 9 * c.m, tick: 0.4 }; bosses.fx(state).pools.push(q); (z.biles ??= []).push(q); sound(state, 'zombieAttack', z.x, z.y); z.act = 'recover'; z.actT = 0.2; }
    } else if (z.act === 'buzzWind') { if (z.actT >= 0.5) { z.act = 'buzzing'; z.actT = 0; z.legs = 3; z.hitPlayer = false; z.actA = toP + 0.6 * (z.side ?? 1); } }
    else if (z.act === 'buzzing') {
      z.angle = z.actA; z.leapK = 0.2;
      const ok = dash(state, z, 520, dt, 24 * c.m, 70);
      if (!ok || z.actT >= 0.36) {
        z.legs = (z.legs ?? 1) - 1; z.actT = 0; z.side = -(z.side ?? 1); z.hitPlayer = false;
        if (z.legs <= 0) { z.act = 'recover'; z.leapK = 0; } else z.actA = Math.atan2(p.y - z.y, p.x - z.x) + 0.6 * z.side;
      }
    } else if (z.act === 'infestWind') { if (z.actT >= 0.9) z.act = ''; }
    else if (z.actT >= 0.5) z.act = '';
    return;
  }
  z.speed = z.baseSpeed * (c.enraged ? 1.2 : 1);
  if (z.cd.a <= 0 && dp > 150 && dp < 720) { z.cd.a = 8; z.act = 'buzzWind'; z.actT = 0; tele(state, { kind: 'line', x: z.x, y: z.y, r: z.r, angle: toP, len: 420, T: 0.5, color: glow }); }
  else if (z.cd.b <= 0 && dp < 620) { z.cd.b = 7; z.act = 'bileWind'; z.actT = 0; z.tx = p.x; z.ty = p.y; tele(state, { kind: 'circle', x: p.x, y: p.y, r: 60, angle: 0, len: 0, T: 0.6, color: glow }); }
  else if (z.cd.c <= 0) {
    z.cd.c = 16; z.act = 'infestWind'; z.actT = 0;
    clutch(state, z, c.enraged ? 5 : 3, 'grub', 3, 5, 'heap', '#a98bd0');   // in a rage more carcasses come down from the roof
    toast(state, 'The heaps are about to hatch: destroy them', '#a98bd0'); sound(state, 'groan', z.x, z.y);
  }
}
export const CARRION_AURA = 135;

const GUARD: Weights = { drone: 5, stinger: 2, spitter: 0.8, shieldback: 0.5 };
/** What the Queen lays in the second stage: each cell's bugs in turn. */
const CLUTCHES: Weights[] = [{ drone: 6, honeypot: 1 }, { hopper: 1 }, { stinger: 1 }, { spitter: 1, shieldback: 0.4, drone: 3 }, { dustwing: 2, skitterer: 3 }, { skitterer: 3, grub: 3 }];
const STAGE_NAME = ['THE COURT', 'THE BROOD', 'UNBOUND', 'THE ANCHOR'];
/** The conduits of the first stage that still stand. */
export const conduits = (state: GameState) => state.zombies.filter(o => !o.dead && o.type === 'burrow' && (o as HBug).roadTag === 'conduit');

/** The Queen: sealed in resin (break the four conduits), the brood, unbound (charge, leap, scream, the rift pulls), the anchor (the heart, the roof coming down). */
function queen(state: GameState, z: B, dt: number, c: Ctx) {
  const p = state.player, dp = dist(z, p), toP = Math.atan2(p.y - z.y, p.x - z.x), glow = bosses.BOSSES.queen.glow, f = bosses.fx(state);
  const home = { x: z.homeX!, y: z.homeY! };
  const next = (stage: number) => {
    z.stage = stage; z.act = ''; z.actT = 0; z.leapK = 0;
    toast(state, `THE QUEEN · ${STAGE_NAME[stage]}`, glow); state.shake = Math.max(state.shake, 18);
    emit(state, { t: 'explosion', x: z.x, y: z.y, radius: z.r + 60 }); K().ring(state, z.x, z.y, 420, 460, 16 * c.m, 120, glow, 30); sound(state, 'horde', z.x, z.y);
    z.cd.a = 3; z.cd.b = 5; z.cd.c = 7; z.cd.d = 9;
  };
  if (z.stage < 2) { z.x = home.x; z.y = home.y; z.angle = Math.PI / 2; }   // in the resin, facing the way in: nothing turns or shifts her
  if (z.stage === 0) {
    // ---- 1. the Court: she cannot be hurt; the four conduits can
    z.speed = 0;
    if (z.clutch === undefined) {
      z.clutch = 0;
      for (let i = 0; i < QUEEN_CONDUITS; i++) { const at = spot(state, z.x, z.y, Math.PI / 4 + i * Math.PI / 2, 520, 34); if (at) { const b = hive.spawnFixture(state, 'burrow', at, 'conduit'); b.maxHp = b.hp = Math.round(b.hp * 1.6); } }
    }
    if (!z.announced || dp > 1500) return;
    const left = conduits(state);
    if (!left.length) { z.hp = Math.min(z.hp, Math.round(z.maxHp * QUEEN_STAGE[0])); next(1); return; }
    if (z.act) { z.actT += dt; if (z.actT >= 0.6) z.act = ''; }
    if (z.cd.a <= 0) { z.cd.a = 3.2; z.act = 'lobWind'; z.actT = 0; K().lob(state, z as never, (z.clutch++ % 2) ? 'acid' : 'rock', p.x, p.y, 1.1, 20 * c.m); }
    if (z.cd.b <= 0 && room(state)) { z.cd.b = 10; z.act = 'commandWind'; z.actT = 0; const b = left[Math.floor(rand(state) * left.length)]; hive.column(state, b, 8, GUARD, { horde: true }); (b as HBug).eruptT = 0; emit(state, { t: 'hive', kind: 'erupt', x: b.x, y: b.y }); }
    return;
  }
  if (z.stage < 3 && z.hp <= z.maxHp * QUEEN_STAGE[z.stage]) next(z.stage + 1);
  if (z.stage === 1) {
    // ---- 2. the Brood: the egg sac is open; she lays each cell's bugs in turn and it rains acid
    z.speed = 0;
    if (z.act) { z.actT += dt; if (z.actT >= 0.7) z.act = ''; }
    if (z.cd.a <= 0 && room(state)) { z.cd.a = 8; z.act = 'layWind'; z.actT = 0; hive.column(state, z, 9, CLUTCHES[(z.clutch = (z.clutch ?? 0) + 1) % CLUTCHES.length], { horde: true }); sound(state, 'groan', z.x, z.y); }
    if (z.cd.b <= 0) { z.cd.b = 5; z.act = 'lobWind'; z.actT = 0; for (let i = 0; i < 4; i++) { const a = rand(state) * Math.PI * 2, r = rand(state) * 230; K().lob(state, z as never, 'acid', p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 0.9 + i * 0.15, 10 * c.m); } }
    return;
  }
  if (z.stage === 2) {
    // ---- 3. Unbound: she moves, and the rift pulls you toward it
    const dh = dist(p, home);
    if (dh > 200 && !p.dead) { const a = Math.atan2(home.y - p.y, home.x - p.x), nx = p.x + Math.cos(a) * 34 * dt, ny = p.y + Math.sin(a) * 34 * dt; if (phys.isFree(state, nx, ny, p.r)) { p.x = nx; p.y = ny; } }
    if (z.act) {
      z.actT += dt; z.speed = 0;
      if (z.act === 'ramWind') { if (z.actT < 0.5) z.actA = toP; z.angle = z.actA; if (z.actT >= 0.85) { z.act = 'ramming'; z.actT = 0; z.hitPlayer = false; } }
      else if (z.act === 'ramming') { z.angle = z.actA; const ok = dash(state, z, 560, dt, 46 * c.m, 140); if (!ok || z.actT >= 1.1) { z.act = 'recover'; z.actT = 0; if (!ok) state.shake = Math.max(state.shake, 12); } }
      else if (z.act === 'skyWind') { z.angle = toP; if (z.actT >= 0.6) { z.act = 'leaping'; z.actT = 0; z.actX = z.x; z.actY = z.y; z.tx = p.x; z.ty = p.y; tele(state, { kind: 'circle', x: p.x, y: p.y, r: 170, angle: 0, len: 0, T: 1.1, color: glow }); } }
      else if (z.act === 'leaping') {
        const k = Math.min(1, z.actT / 1.1); z.x = z.actX + (z.tx! - z.actX) * k; z.y = z.actY + (z.ty! - z.actY) * k; z.leapK = k;
        if (k >= 1) { z.leapK = 0; z.act = 'recover'; z.actT = -0.5; K().ring(state, z.x, z.y, 400, 520, 24 * c.m, 130, glow, 30); if (dist(z, p) < 170 + p.r) K().hurtPlayer(state, 40 * c.m, z, 140); state.shake = Math.max(state.shake, 16); emit(state, { t: 'explosion', x: z.x, y: z.y, radius: 150 }); sound(state, 'explosion', z.x, z.y); }
      } else if (z.act === 'screamWind') {
        if (z.actT >= 0.7) { K().ring(state, z.x, z.y, 520, 560, 18 * c.m, 150, glow, 34); for (const o of state.zombies as HBug[]) if (!o.dead && !o.boss && !o.inert) o.chorus = 6; state.shake = Math.max(state.shake, 12); sound(state, 'horde', z.x, z.y); z.act = 'recover'; z.actT = 0; }
      } else if (z.actT >= 0.5) z.act = '';
      return;
    }
    z.speed = z.baseSpeed * 1.15;
    if (z.cd.a <= 0 && dp > 170 && dp < 820) { z.cd.a = 6.5; z.act = 'ramWind'; z.actT = 0; z.actA = toP; tele(state, { kind: 'line', x: z.x, y: z.y, r: z.r, angle: toP, len: 640, T: 0.85, color: glow }); }
    else if (z.cd.b <= 0 && dp > 200) { z.cd.b = 9; z.act = 'skyWind'; z.actT = 0; }
    else if (z.cd.c <= 0) { z.cd.c = 11; z.act = 'screamWind'; z.actT = 0; if (room(state)) hive.column(state, home, 8, GUARD, { horde: true }); }
    return;
  }
  // ---- 4. the Anchor: she lies across the rift's anchor; the heart is open and the roof is coming down
  z.speed = 0;
  if (z.act === 'fallWind') { z.actT += dt; const k = Math.min(1, z.actT / 1); z.x = z.actX + (home.x - z.actX) * k; z.y = z.actY + (home.y - z.actY) * k; z.leapK = k; if (k >= 1) { z.leapK = 0; z.act = ''; state.shake = Math.max(state.shake, 20); emit(state, { t: 'explosion', x: z.x, y: z.y, radius: 170 }); } return; }
  if (dist(z, home) > 30 && z.act !== 'down') { z.act = 'fallWind'; z.actT = 0; z.actX = z.x; z.actY = z.y; return; }
  z.act = 'down'; z.x = home.x; z.y = home.y;
  if (z.cd.a <= 0) { z.cd.a = 1.6; for (let i = 0; i < 2; i++) { const a = rand(state) * Math.PI * 2, r = i ? 90 + rand(state) * 170 : rand(state) * 50; K().lob(state, z as never, 'rock', p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 1.0 + i * 0.25, 22 * c.m); } }
  if (z.cd.b <= 0 && room(state)) { z.cd.b = 9; hive.column(state, z, 10, CLUTCHES[(z.clutch = (z.clutch ?? 0) + 1) % CLUTCHES.length], { horde: true }); }
  void f;
}
