import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LAB_DEFAULTS, project, unproject, direction, move, free, wallOccludes } from '../src/angle-lab/math';
import { LAB_ANIMATIONS, labFrame, type LabActorKind } from '../src/angle-lab/animations';
import { LabWorld, actorPose, clearLine, findRoute } from '../src/angle-lab/world';
import { LAB_OBSTACLES } from '../src/angle-lab/layout';

describe('Angle Lab projection and collision', () => {
  it('keeps aiming on the ground aligned through every tilt, rotation and zoom', () => {
    for (const tilt of [15, 30, 45]) for (const yaw of [-30, 0, 15, 45]) for (const zoom of [0.3, 1, 1.5]) {
      const camera = { tilt, yaw, zoom, x: 600, y: 400 };
      for (const p of [{ x: -260, y: -90 }, { x: 120, y: 240 }]) {
        const result = unproject(project(p, 0, camera), camera);
        expect(result.x).toBeCloseTo(p.x); expect(result.y).toBeCloseTo(p.y);
        expect(project(p, 90, camera).y).toBeLessThan(project(p, 0, camera).y);
      }
    }
  });
  it('slides along walls without tunneling and keeps actors inside the small scene', () => {
    const wall = [{ x: 20, y: -100, w: 12, h: 200 }], p = { x: 0, y: 0 };
    move(p, 200, 40, 13, wall);
    expect(p.x).toBeLessThanOrEqual(7); expect(p.y).toBeCloseTo(40);
    expect(free(p, 13, wall)).toBe(true);
    move(p, -2000, 0, 13, wall); expect(p.x).toBeGreaterThan(-447);
  });
  it('wraps eight facings relative to the rotated street', () => {
    expect(direction(-Math.PI / 4, 0)).toBe(7);
    expect(direction(0, 45)).toBe(1);
    expect(direction(Math.PI * 2, 0)).toBe(0);
  });
  it('ships every facing and movement frame at all three camera tilts', () => {
    const atlas = JSON.parse(readFileSync('public/assets/angle_lab.json', 'utf8'));
    expect(Object.keys(atlas.frames)).toHaveLength(768);
    for (const tilt of [15, 30, 45]) for (const actor of ['survivor', 'zombie'] as LabActorKind[]) for (let facing = 0; facing < 8; facing++) {
      const animations = tilt === 45 ? Object.entries(LAB_ANIMATIONS[actor]) : [['idle', 1], ['walk', 4], ...(actor === 'zombie' ? [['corpse', 1]] : [])];
      for (const [pose, count] of animations as [string, number][]) for (let i = 0; i < count; i++) {
        const frame = atlas.frames[`angle_${actor}_${tilt}_${facing}_${pose}_${i}`];
        expect(frame).toBeDefined(); expect(frame.sourceSize).toEqual({ w: 96, h: 128 });
      }
    }
  });
  it('fades only walls between the actor and the camera, including outside the house', () => {
    const c={...LAB_DEFAULTS,x:0,y:0};
    const wall={x:-325,y:-62,w:80,h:12};
    expect(wallOccludes({x:-272,y:-85},wall,94,c)).toBe(true);
    expect(wallOccludes({x:-272,y:0},wall,94,c)).toBe(false);
    expect(wallOccludes({x:100,y:-85},wall,94,c)).toBe(false);
    expect(wallOccludes({x:-272,y:-85},wall,94,{...c,tilt:0})).toBe(false);
    expect(wallOccludes({x:-272,y:-260},{x:-325,y:-230,w:80,h:12},94,c)).toBe(true);
  });
});

describe('Angle Lab combat and timed spawns',()=>{
  it('adds exactly one zombie per 30 seconds and resets the countdown',()=>{
    const w=new LabWorld(LAB_OBSTACLES);expect(w.zombies).toHaveLength(1);
    w.update(0,29.99,false);expect(w.zombies).toHaveLength(1);
    w.update(0,.01,false);expect(w.zombies).toHaveLength(2);
    w.update(0,60,false);expect(w.zombies).toHaveLength(4);expect(w.spawnIn).toBeCloseTo(30);
    for(const z of w.zombies)expect(free(z,14,LAB_OBSTACLES)).toBe(true);
    w.reset();expect(w.zombies).toHaveLength(1);expect(w.spawnIn).toBe(30);
  });
  it('routes zombies around obstacles and into the house through the doorway',()=>{
    const start={x:180,y:-60},target={x:-215,y:-115},route=findRoute(start,target,LAB_OBSTACLES);
    expect(route.length).toBeGreaterThan(10);
    expect(route.some(p=>p.x>-232&&p.x<-198&&p.y>-75&&p.y<-40)).toBe(true);
    const p={...start};
    for(const point of route){expect(free(point,14,LAB_OBSTACLES)).toBe(true);move(p,point.x-p.x,point.y-p.y,14,LAB_OBSTACLES);expect(Math.hypot(p.x-point.x,p.y-point.y)).toBeLessThan(1);}
    expect(Math.hypot(p.x-target.x,p.y-target.y)).toBeLessThan(12);
  });
  it('plays shoot, hit, death, corpse and reload states with real damage and ammo',()=>{
    const w=new LabWorld(LAB_OBSTACLES),z=w.zombies[0];
    w.shoot(z);expect(actorPose(w.player)[0]).toBe('shoot');expect(actorPose(z)[0]).toBe('hit');expect(w.ammo).toBe(7);
    w.reload();expect(actorPose(w.player)[0]).toBe('reload');expect(w.shoot(z)).toBeUndefined();
    w.update(1.3,1.3,false);expect(w.ammo).toBe(8);
    w.player.cooldown=0;w.shoot(z);w.player.cooldown=0;w.shoot(z);expect(actorPose(z)[0]).toBe('death');
    w.update(.9,.9,false);expect(actorPose(z)[0]).toBe('corpse');expect(w.kills).toBe(1);
    expect(labFrame('zombie',45,2,'death',7)).toBe('angle_zombie_45_2_death_7');
    expect(labFrame('survivor',30,2,'run',7)).toBe('angle_survivor_30_2_walk_3');
  });
  it('walls stop bullets and bites even when their art is transparent',()=>{
    const w=new LabWorld(LAB_OBSTACLES),z=w.zombies[0];Object.assign(w.player,{x:-272,y:0});Object.assign(z,{x:-272,y:-85});
    expect(clearLine(w.player,z,LAB_OBSTACLES)).toBe(false);w.shoot(z);expect(z.hp).toBe(3);
    Object.assign(z,{x:w.player.x+25,y:w.player.y});w.update(.01,.01,true);expect(z.action).toBe('attack');expect(w.player.hp).toBe(90);expect(actorPose(w.player)[0]).toBe('hit');
    w.damage(w.player,100);expect(actorPose(w.player)[0]).toBe('death');expect(w.shoot(z)).toBeUndefined();
  });
});
