import { describe, expect, it } from 'vitest';
import * as core from '../src/sim/core';
import * as bosses from '../src/sim/bosses';
import * as player from '../src/sim/player';
import * as zombies from '../src/sim/zombies';
import type { GameState } from '../src/sim/types';

function encounter(distance = 1000, lurk = false) {
  const s = core.newState(17, 'road');
  s.player = player.create(8000, 8000);
  const w = bosses.spawnBossOf(s, 'warden', 0, 8000 - distance, 8000, 1, { lurk });
  for (const k in w.cd) w.cd[k] = 99;
  return { s, w };
}
function tick(s: GameState, count = 1, ai = false) {
  for (let i = 0; i < count; i++) {
    s.time += core.SIM_DT;
    s.player.invuln = Math.max(0, s.player.invuln - core.SIM_DT);
    if (ai) zombies.update(s, core.SIM_DT);
    bosses.update(s, core.SIM_DT, 1);
  }
}

describe('Warden anti-kiting attacks', () => {
  it('keeps pursuing outside normal zombie sight, but does not wake a lurking boss', () => {
    const { s, w } = encounter();
    w.cd.boulder = 0;
    tick(s, 60, true);
    expect(w.state).toBe('chase');
    expect(bosses.fx(s).shots).toHaveLength(3);
    const hidden = encounter(1000, true);
    hidden.w.cd.boulder = hidden.w.cd.charge = 0;
    tick(hidden.s, 60, true);
    expect(hidden.w.act).toBe('');
    expect(bosses.fx(hidden.s).shots).toHaveLength(0);
  });

  it('warns for a full windup, locks its rush lane, and closes a gap beyond the old attack range', () => {
    const { s, w } = encounter();
    w.cd.charge = 0;
    tick(s);
    const lane = bosses.fx(s).tele.find(t => t.kind === 'line')!;
    expect(w.act).toBe('chargeWind');
    expect(lane.len).toBeGreaterThan(1000);
    const start = { x: w.x, y: w.y }, angle = lane.angle;
    s.player.y += 300; // dodge after seeing the lane
    tick(s, 45);
    expect(w.act).toBe('chargeWind');
    expect(w.x).toBe(start.x);
    expect(w.y).toBe(start.y);
    expect(w.actA).toBe(angle);
    for (let i = 0; i < 180 && w.act !== 'recover'; i++) tick(s);
    expect(w.act).toBe('recover');
    expect(w.x - start.x).toBeGreaterThan(1100);
    expect(w.x - start.x + w.r).toBeCloseTo(lane.len, 5);
    expect(w.y).toBe(start.y);
    expect(s.player.hp).toBe(s.player.maxHp);
    tick(s, 30);
    expect(w.act).toBe('recover'); // punish window after a missed rush
  });

  it('a rush damages a player who stays in its lane only once', () => {
    const { s, w } = encounter();
    w.cd.charge = 0;
    tick(s, 155);
    expect(s.player.hp).toBe(62);
    expect(s.events.filter(e => e.t === 'playerHurt')).toHaveLength(1);
  });

  it('closes distance even while the player continuously sprints straight away', () => {
    const { s, w } = encounter();
    w.cd.charge = 0;
    s.player.vx = s.player.speed * 1.6;
    tick(s, 1, true);
    for (let i = 0; i < 180 && w.act !== 'recover'; i++) {
      s.player.x += s.player.vx * core.SIM_DT;
      tick(s, 1, true);
    }
    expect(w.act).toBe('recover');
    expect(s.player.x - w.x).toBeLessThan(600);
  });

  it('smashes props while rushing, but stops and becomes vulnerable at a solid wall', () => {
    const { s, w } = encounter();
    const car = core.phys.addSolid(s, { x: 7200, y: 7960, w: 80, h: 80, kind: 'car' });
    const wall = core.phys.addSolid(s, { x: 7500, y: 7800, w: 20, h: 400, kind: 'wall' });
    w.cd.charge = 0;
    tick(s);
    for (let i = 0; i < 180 && w.act !== 'stunned'; i++) tick(s);
    expect(car.solid).toBe(false);
    expect(w.act).toBe('stunned');
    expect(w.x + w.r).toBeLessThanOrEqual(wall.x);
    expect(core.phys.isFree(s, w.x, w.y, w.r)).toBe(true);
    expect(s.grid.query(wall.x, wall.y, wall.w, wall.h)).toContain(wall);
  });

  it('fires a warned barrage at full health that leads movement without homing after launch', () => {
    const { s, w } = encounter(1300);
    w.cd.boulder = 0;
    s.player.vx = 190;
    tick(s);
    const f = bosses.fx(s), targets = f.shots.map(shot => [shot.tx, shot.ty]);
    expect(w.stage).toBe(0);
    expect(targets).toEqual([[8000, 8000], [8133, 8000], [8266, 8000]]);
    expect(f.tele.map(t => [t.x, t.y])).toEqual(targets);
    expect(f.tele.every(t => t.T >= 1.1)).toBe(true);
    s.player.y += 300; s.player.vx = 0;
    tick(s, 30);
    expect(f.shots.map(shot => [shot.tx, shot.ty])).toEqual(targets);
    tick(s, 90);
    expect(f.shots).toHaveLength(0);
    expect(s.player.hp).toBe(s.player.maxHp);
  });

  it('the barrage punishes standing still at long range', () => {
    const { s, w } = encounter(1300);
    w.cd.boulder = 0;
    tick(s, 100);
    expect(s.player.hp).toBeLessThan(s.player.maxHp);
    expect(bosses.fx(s).shots).toHaveLength(0);
  });

  it('unlocks a longer quake at the second stage and keeps its warned direction', () => {
    const { s, w } = encounter(1200);
    w.hp = w.maxHp * 0.7;
    tick(s);
    for (const k in w.cd) w.cd[k] = 99;
    w.cd.quake = 0;
    tick(s);
    expect(w.act).toBe('quakeWind');
    s.player.y += 300;
    tick(s, 43);
    const rocks = bosses.fx(s).shots;
    expect(rocks).toHaveLength(14);
    expect(rocks.every(shot => shot.ty === w.y)).toBe(true);
    expect(Math.max(...rocks.map(shot => shot.tx - w.x))).toBeGreaterThanOrEqual(1200);
  });
});
