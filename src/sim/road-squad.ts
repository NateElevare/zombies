// Armed rescue companions. They cover the player with ordinary, wall-colliding bullets.
// Companions stay in the fight; escort objectives require everyone to arrive, not an NPC health bar.
import type { GameState, Vec } from './types';
import { emit, phys } from './core';
import * as pathing from './pathing';
import { RESCUED_GROUP } from './need-data';
import { WEAPONS } from './combat';

export interface RoadAlly extends Vec {
  name: string; look: string; r: number; angle: number;
  following: boolean; moving: boolean; cooldown: number; flash: number; trailIndex: number;
}

export function createSquad(state: GameState, at: Vec, following: boolean) {
  const r = state.road!;
  r.trail = [{ x: at.x, y: at.y }];
  r.allies = RESCUED_GROUP.map((member, i) => {
    const ally: RoadAlly = { ...member, x: at.x + (i - 1.5) * 42, y: at.y + 34,
      r: 10, angle: -Math.PI / 2, following, moving: false, cooldown: i * 0.23, flash: 0, trailIndex: 0 };
    phys.collideCircle(state, ally);
    return ally;
  });
}

export function updateSquad(state: GameState, dt: number) {
  const r = state.road!, p = state.player;
  if (!r.allies.length) return;
  const last = r.trail[r.trail.length - 1];
  if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 36) r.trail.push({ x: p.x, y: p.y });
  const follows = r.allies.some(a => a.following);
  const field = follows ? pathing.field(state, 'rescue-squad', p.x, p.y, true) : null;
  for (let i = 0; i < r.allies.length; i++) {
    const a = r.allies[i];
    a.flash = Math.max(0, a.flash - dt); a.cooldown -= dt; a.moving = false;
    const distance = Math.hypot(p.x - a.x, p.y - a.y);
    if (a.following && distance > 65 + i * 20) {
      // A breadcrumb route keeps distant companions following the actual route around buildings and gates.
      // Close to the player, a civilian flow field permits doors but never cuts through solid windows.
      while (a.trailIndex < r.trail.length - 1 && Math.hypot(r.trail[a.trailIndex].x - a.x, r.trail[a.trailIndex].y - a.y) < 55) a.trailIndex++;
      let target = r.trail[a.trailIndex] ?? p;
      const direct = !phys.raycast(state, a.x, a.y, p.x, p.y, a.r + 2, o => o.solid !== false);
      let dx = target.x - a.x, dy = target.y - a.y;
      if (direct) { dx = p.x - a.x; dy = p.y - a.y; a.trailIndex = r.trail.length - 1; }
      else if (field && distance < 720) {
        const step = pathing.step(field, a.x, a.y);
        if (step) { dx = step.x; dy = step.y; }
      }
      const d = Math.hypot(dx, dy) || 1;
      const speed = Math.max(190, Math.hypot(p.vx, p.vy) + 35) * (distance > 320 ? 1.35 : 1);
      const travel = Math.min(speed * dt, distance - 60);
      const x = a.x, y = a.y;
      a.x += dx / d * travel; a.y += dy / d * travel;
      phys.collideCircle(state, a);
      a.moving = Math.hypot(a.x - x, a.y - y) > 0.1;
      if (a.moving) a.angle = Math.atan2(dy, dx);
    }
    // Spread out when standing together without pushing companions through walls.
    for (let j = 0; j < i; j++) {
      const b = r.allies[j], dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy);
      if (d < 23 && d > 0) { a.x += dx / d * (23 - d); a.y += dy / d * (23 - d); phys.collideCircle(state, a); }
    }
    if (a.cooldown > 0) continue;
    let target = null, best = 560;
    for (const z of state.zombies) {
      if (z.dead) continue;
      const d = Math.hypot(z.x - a.x, z.y - a.y);
      if (d >= best || phys.raycast(state, a.x, a.y, z.x, z.y, 1, o => o.blocksBullets !== false && (o.solid !== false || o.blocksBullets === true))) continue;
      target = z; best = d;
    }
    if (!target) { a.cooldown = 0.15; continue; }
    a.angle = Math.atan2(target.y - a.y, target.x - a.x);
    a.cooldown = 0.9 + i * 0.13; a.flash = 0.16;
    state.bullets.push({ x: a.x, y: a.y, prevX: a.x, prevY: a.y,
      vx: Math.cos(a.angle) * 1100, vy: Math.sin(a.angle) * 1100, angle: a.angle,
      damage: 24, life: 0.6, r: 3, pierce: 0, ricochet: 0, explosive: 0, incendiary: false,
      hit: null, dead: false, color: '#9ed9dc', weapon: 'assault_rifle' });
    emit(state, { t: 'shot', x: a.x + Math.cos(a.angle) * 22, y: a.y + Math.sin(a.angle) * 22, angle: a.angle, weapon: 'assault_rifle', cls: 'rifle' });
    emit(state, { t: 'sound', name: WEAPONS.assault_rifle.sound, x: a.x, y: a.y, vol: 0.35 });
  }
}
