import { describe, it, expect, vi, afterEach } from 'vitest';
import { newState, phys, rand } from '../src/sim/core';
import type { GameState, Player, Zombie, InputState, Container, Bullet, Structure } from '../src/sim/types';
import * as inv from '../src/sim/inventory';
vi.mock('../src/sim/zombies', () => ({
  noise: vi.fn(),
  damage: vi.fn((_s: GameState, z: Zombie, n: number) => { z.hp -= n; if (z.hp <= 0) z.dead = true; }),
  knockMul: (z: Zombie) => z.boss ? 0 : Math.max(0, 1 - (Number(z.knockRes) || 0)),
}));
vi.mock('../src/sim/game', () => ({ isNight: (s: GameState) => s.clock.t >= 420, skipToMorning: vi.fn(), save: vi.fn(() => true) }));
vi.mock('../src/sim/player', () => ({ damage: vi.fn() }));
vi.mock('../src/sim/world', () => ({ buildingAt: vi.fn(() => null) }));
function state(seed = 1) {
  const s = newState(seed);
  s.player = { x: 128, y: 128, prevX: 128, prevY: 128, prevAngle: 0, vx: 0, vy: 0, r: 14, angle: 0, speed: 190,
    hp: 100, maxHp: 100, stamina: 100, maxStamina: 100, food: 100, water: 100, invuln: 0, dead: false,
    inv: inv.createPlayer(s), active: 'secondary', fireCooldown: 0, reloadTimer: 0, reloadTotal: 0, swingTimer: 0, swingTotal: 0,
    lastShotT: -99, xp: 0, level: 1, sp: 0, tech: {}, spawn: { x: 128, y: 128 }, sprinting: false, flashlight: true, bleeding: 0 };
  return s;
}
function input(extra: Partial<InputState> = {}): InputState { return { moveX: 0, moveY: 0, aimX: 512, aimY: 128, fire: false, firePressed: false, altPressed: false, sprint: false, interactHeld: false, pressed: new Set(), ...extra }; }
function zombie(id: string, x: number, y = 128): Zombie { return { id, x, y, r: 12, hp: 1000, maxHp: 1000, dead: false, burn: 0, type: 'walker' } as Zombie; }
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
import * as combat from '../src/sim/combat';
import * as zombies from '../src/sim/zombies';
function arm(s: GameState, id = 'pistol', mag = 12) { s.player.inv.equip.secondary = { id, qty: 1, mag }; return s.player.inv.equip.secondary; }
function bullet(extra: Partial<Bullet> = {}): Bullet { return { x: 100, y: 128, prevX: 100, prevY: 128, vx: 1000, vy: 0, angle: 0, damage: 100, life: 1, r: 3, pierce: 0, ricochet: 0, explosive: 0, incendiary: false, hit: null, dead: false, color: '#fff', weapon: 'pistol', ...extra }; }
describe('combat', () => {
  it('fires while held, paces shots, emits muzzle data and spends one round', () => {
    const s = state(); const stack = arm(s); s.time = 12;
    combat.update(s, input({ fire: true }), 1 / 60);
    expect(stack.mag).toBe(11); expect(s.player.lastShotT).toBe(12); expect(s.bullets).toHaveLength(1);
    expect(s.bullets[0].prevX).toBeGreaterThan(s.player.x);
    expect(s.events).toContainEqual({ t: 'shot', x: 160, y: 128, angle: 0, weapon: 'pistol', cls: 'handgun' });
    combat.update(s, input({ fire: true }), 1 / 60); expect(stack.mag).toBe(11);
    expect(zombies.noise).toHaveBeenCalledWith(s, 128, 128, 650);
  });
  it('reloads only missing rounds at completion and cancels on weapon switch', () => {
    const s = state(), stack = arm(s, 'pistol', 7); inv.add(s.player.inv, 'ammo_9mm', 20);
    expect(combat.reload(s)).toBe(true); expect(inv.totalAmmo(s, 'ammo_9mm')).toBe(20);
    combat.update(s, input(), 1.3);
    expect(stack.mag).toBe(12); expect(inv.totalAmmo(s, 'ammo_9mm')).toBe(15);
    expect(s.events).toContainEqual({ t: 'reloadDone', weapon: 'pistol' });
    stack.mag = 4; combat.reload(s); combat.switchTo(s, 'melee'); combat.update(s, input(), 2);
    expect(stack.mag).toBe(4); expect(inv.totalAmmo(s, 'ammo_9mm')).toBe(15);
  });
  it('reloads partial reserves and auto-reloads an empty magazine', () => {
    const s = state(), stack = arm(s, 'pistol', 0); inv.add(s.player.inv, 'ammo_9mm', 3);
    combat.update(s, input({ firePressed: true }), 0);
    expect(s.events).toContainEqual({ t: 'empty' }); expect(s.player.reloadTimer).toBe(1.3);
    combat.update(s, input(), 1.3); expect(stack.mag).toBe(3); expect(inv.totalAmmo(s, 'ammo_9mm')).toBe(0);
  });
  it('a burst spends two rounds and switching cancels the followup', () => {
    const s = state(), stack = arm(s); s.player.tech.handgun_burst = true;
    combat.update(s, input({ firePressed: true }), 0); combat.update(s, input(), 0.07);
    expect(stack.mag).toBe(10); expect(s.events.filter(e => e.t === 'shot')).toHaveLength(2);
    s.player.fireCooldown = 0; combat.update(s, input({ fire: true }), 0); combat.switchTo(s, 'melee'); combat.update(s, input(), 0.1);
    expect(stack.mag).toBe(9);
  });
  it('pierces in distance order with damage falloff and stops at walls', () => {
    const s = state(), a = zombie('a', 160), b = zombie('b', 210), c = zombie('c', 290);
    s.zombies = [c, b, a]; const shot = bullet({ pierce: 2 }); s.bullets.push(shot);
    phys.addSolid(s, { x: 250, y: 100, w: 10, h: 100, kind: 'wall', sub: 'brick' });
    combat._bullets(s, 0.25);
    expect(a.hp).toBe(900); expect(b.hp).toBe(915); expect(c.hp).toBe(1000);
    expect(shot.hit).toEqual(new Set(['a', 'b'])); expect(s.bullets).toHaveLength(0);
    expect(s.events).toContainEqual(expect.objectContaining({ t: 'bulletHit', surface: 'wall' }));
  });
  it('ricochets off the entered slab axis and loses damage', () => {
    const s = state(), shot = bullet({ ricochet: 1 }); s.bullets.push(shot);
    phys.addSolid(s, { x: 180, y: 100, w: 10, h: 100, kind: 'car' });
    combat._bullets(s, 0.1);
    expect(shot.vx).toBe(-1000); expect(shot.ricochet).toBe(0); expect(shot.damage).toBe(80); expect(shot.dead).toBe(false);
    expect(s.events).toContainEqual(expect.objectContaining({ t: 'bulletHit', surface: 'metal' }));
    combat._bullets(s, 0.01); expect(shot.dead).toBe(false);
  });
  it('checks the segment from player to muzzle against nearby walls', () => {
    const s = state(); arm(s);
    phys.addSolid(s, { x: 148, y: 100, w: 10, h: 100, kind: 'furniture' });
    combat.update(s, input({ fire: true }), 0);
    expect(s.bullets).toHaveLength(0); expect(s.events).toContainEqual(expect.objectContaining({ t: 'bulletHit', surface: 'wood' }));
  });
  it('melee sets animation timers, hits an arc and cannot hit through a wall', () => {
    const s = state(); arm(s, 'knife', 0); const a = zombie('a', 170), b = zombie('b', 80); s.zombies = [a, b];
    combat.update(s, input({ fire: true }), 0);
    expect(a.hp).toBe(978); expect(b.hp).toBe(1000); expect(s.player.swingTimer).toBe(s.player.swingTotal);
    expect(s.events).toContainEqual({ t: 'swing', x: 128, y: 128, angle: 0, weapon: 'knife' });
    phys.addSolid(s, { x: 150, y: 100, w: 10, h: 100, kind: 'wall' }); s.player.fireCooldown = 0;
    combat.update(s, input({ fire: true }), 0); expect(a.hp).toBe(978);
  });
  it('right-click swings the equipped upgraded melee weapon without switching or spending gun ammo', () => {
    const s=state(),gun=arm(s),target=zombie('near',170);s.zombies=[target];
    s.player.inv.equip.melee={id:'knife',qty:1,lvl:3};s.player.tech.melee_dmg1=true;
    const reference=state();arm(reference,'knife',0)!.lvl=3;reference.player.tech.melee_dmg1=true;
    const other=zombie('near',170);reference.zombies=[other];combat.update(reference,input({fire:true}),0);
    s.player.fireCooldown=.8;
    combat.update(s,input({altPressed:true,fire:true,firePressed:true}),0);
    expect(target.hp).toBe(other.hp);expect(target.hp).toBeLessThan(978);
    expect(s.player.active).toBe('secondary');expect(gun.mag).toBe(12);expect(s.bullets).toHaveLength(0);
    expect(combat.playerWeaponVisual(s.player)).toBe('knife');
    combat.update(s,input(),s.player.swingTotal+.01);
    expect(combat.playerWeaponVisual(s.player)).toBe('pistol');expect(s.player.active).toBe('secondary');
  });
  it('paces quick swings and lets the selected gun fire again after recovery', () => {
    const s=state(),gun=arm(s);s.player.inv.equip.melee={id:'knife',qty:1};
    combat.update(s,input({altPressed:true}),0);
    combat.update(s,input({altPressed:true,fire:true}),.1);
    expect(s.events.filter(e=>e.t==='swing')).toHaveLength(1);expect(gun.mag).toBe(12);
    combat.update(s,input({fire:true}),1);
    expect(gun.mag).toBe(11);expect(s.player.active).toBe('secondary');
    combat.update(s,input({altPressed:true}),0);
    expect(s.events.filter(e=>e.t==='swing')).toHaveLength(2);
  });
  it('interrupts reload without consuming reserves and cancels queued burst shots', () => {
    const s=state(),gun=arm(s,'pistol',7);s.player.inv.equip.melee={id:'bat',qty:1};inv.add(s.player.inv,'ammo_9mm',20);
    combat.reload(s);
    combat.update(s,input({altPressed:true,pressed:new Set(['reload'])}),1.3);
    expect(s.player.reloadTimer).toBe(0);expect(s.player.reloadTotal).toBe(0);
    expect(gun.mag).toBe(7);expect(inv.totalAmmo(s,'ammo_9mm')).toBe(20);
    expect(s.events.some(e=>e.t==='reloadDone')).toBe(false);
    combat.update(s,input(),1);s.player.tech.handgun_burst=true;
    combat.update(s,input({fire:true}),0);expect(gun.mag).toBe(6);
    combat.update(s,input({altPressed:true}),.07);
    expect(s.player.burstQueue).toBe(0);expect(gun.mag).toBe(6);
  });
  it('quick melee falls back to fists and still respects walls and facing', () => {
    const s=state();arm(s);const near=zombie('near',170),behind=zombie('behind',80);s.zombies=[near,behind];
    combat.update(s,input({altPressed:true}),0);
    expect(near.hp).toBeLessThan(1000);expect(behind.hp).toBe(1000);expect(s.player.active).toBe('secondary');
    expect(s.events).toContainEqual(expect.objectContaining({t:'swing',weapon:'unarmed'}));
    const hp=near.hp;phys.addSolid(s,{x:150,y:100,w:10,h:100,kind:'wall'});
    combat.update(s,input({altPressed:true}),1);expect(near.hp).toBe(hp);
  });
  it('does not quick-melee through menus, build mode, pause, or death', () => {
    for(const ui of ['inventory','build','pause'] as const){const s=state();arm(s);s.ui=ui;combat.update(s,input({altPressed:true}),0);expect(s.events.some(e=>e.t==='swing')).toBe(false);}
    for(const flag of ['paused','dead'] as const){const s=state();arm(s);if(flag==='paused')s.paused=true;else s.player.dead=true;combat.update(s,input({altPressed:true}),0);expect(s.events.some(e=>e.t==='swing')).toBe(false);}
  });
  it('explosive hits damage neighbors and incendiary rounds burn', () => {
    const s = state(), a = zombie('a', 160), b = zombie('b', 180, 160); s.zombies = [a, b];
    s.bullets.push(bullet({ explosive: 70, incendiary: true })); combat._bullets(s, 0.1);
    expect(a.burn).toBe(3); expect(b.hp).toBeLessThan(1000);
    expect(s.events.some(e => e.t === 'explosion')).toBe(true);
    const before = a.hp; combat.update(s, input(), 0.5); expect(a.hp).toBe(before - 4);
  });
  it('thorns applies to the nearest zombie and starts the combat timer', () => {
    const s = state(), a = zombie('a', 160), b = zombie('b', 200); s.zombies = [b, a]; s.player.tech.armor_thorns = true;
    combat.onPlayerHurt(s); expect(a.hp).toBe(988); expect(b.hp).toBe(1000); expect(s.player.combatTimer).toBe(6);
  });
});
