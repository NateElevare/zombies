import { describe,it,expect } from 'vitest';
import { STORY_CAMERA,STORY_ZOOM,storyProject,storyUnproject,storyMovement,storyBounds,storyFrontDepth,storyWallSections,storyEffectOffset } from '../src/render/story-projection';

describe('angled story controls',()=>{
  it('sorts finite depths at zero rotation and divides side walls into local sections',()=>{
    const wall={x:100,y:100,w:16,h:1000};
    const parts=storyWallSections(wall);
    expect(parts.length).toBeGreaterThan(30);
    for(const part of parts){expect(part.h).toBeLessThanOrEqual(32);expect(storyFrontDepth(part,108)).toBe(part.y+part.h);}
    expect(storyFrontDepth({x:100,y:100,w:1000,h:16},300)).toBe(116);
    expect(storyEffectOffset(50).x).toBe(0);expect(storyEffectOffset(50).y).toBeCloseTo(-50);
  });
  it('puts characters outside every part of a long front wall in front of that wall',()=>{
    const wall={x:100,y:100,w:1000,h:16};
    for(const x of [120,300,600,900,1080]){
      const p={x,y:wall.y+wall.h+14},screen={x:p.x*Math.cos(Math.PI/6)-p.y*.5,y:0},actorDepth=p.x*.5+p.y*Math.cos(Math.PI/6);
      expect(actorDepth).toBeGreaterThan(storyFrontDepth(wall,screen.x,30));
    }
  });
  it('sorts correctly along the side wall as well as the front, for all actors',()=>{
    const wall={x:100,y:100,w:16,h:1000};
    for(const y of [120,300,600,900,1080]){
      const p={x:wall.x+wall.w+14,y},screen={x:p.x*Math.cos(Math.PI/6)-p.y*.5,y:0},actorDepth=p.x*.5+p.y*Math.cos(Math.PI/6);
      expect(actorDepth).toBeGreaterThan(storyFrontDepth(wall,screen.x,30));
    }
  });
  it('uses the approved camera and maps mouse coordinates back onto the collision plane',()=>{
    expect(STORY_CAMERA).toMatchObject({tilt:45,yaw:0});expect(STORY_ZOOM).toBe(1.35);
    for(const p of [{x:0,y:0},{x:2500,y:8500},{x:12000,y:10}]){
      const q=storyUnproject(storyProject(p));expect(q.x).toBeCloseTo(p.x);expect(q.y).toBeCloseTo(p.y);
    }
  });
  it('keeps WASD aligned with the screen without a diagonal speed advantage',()=>{
    for(const [x,y] of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1]]){
      const world=storyMovement(x,y),screen=storyProject(world);
      expect(Math.hypot(world.x,world.y)).toBeCloseTo(1);
      expect(screen.x*y-screen.y*x).toBeCloseTo(0);
      expect(screen.x*x+screen.y*y).toBeGreaterThan(0);
    }
    expect(storyMovement(0,0)).toEqual({x:0,y:0});
  });
  it('keeps every viewport edge inside the world culling bounds after rotation',()=>{
    const view={x:1200,y:700,w:1600/1.35,h:900/1.35},b=storyBounds(view.x,view.y,view.w,view.h);
    for(const u of [0,.25,.5,.75,1])for(const v of [0,.25,.5,.75,1]){
      const p=storyUnproject({x:view.x+u*view.w,y:view.y+v*view.h});
      expect(p.x).toBeGreaterThanOrEqual(b.x-1e-8);expect(p.x).toBeLessThanOrEqual(b.x+b.w+1e-8);
      expect(p.y).toBeGreaterThanOrEqual(b.y-1e-8);expect(p.y).toBeLessThanOrEqual(b.y+b.h+1e-8);
    }
  });
});
