import * as Phaser from 'phaser';
import { assetUrl } from '../asset-url';
import { LAB_DEFAULTS, project, unproject, depth, move, type LabCamera, type Point } from '../angle-lab/math';
import type { GameScene } from './GameScene';
import { LabScenery, LAB_OBSTACLES } from '../angle-lab/scenery';
import { LabWorld, type Actor } from '../angle-lab/world';
import { characterVisual, spriteAtlas, SPRITE_RESOLUTIONS, locomotion, type SpriteDetail, type SpriteActor } from '../angle-lab/sprite-set';

// An isolated Phaser 2D sandbox: flat world collisions, directional raster actors,
// projected prop faces, and painter's-order occlusion. No game saves or progression.
export class AngleLabScene extends Phaser.Scene {
  private panel?: HTMLElement;
  private status?: HTMLElement;
  private controls = new AbortController();
  private keys = new Set<string>();
  private settings = { ...LAB_DEFAULTS, cutaway: true, follow: true, detail: '256' as SpriteDetail };
  private camera2: LabCamera = { ...LAB_DEFAULTS, x: 0, y: 0 };
  private world = new LabWorld(LAB_OBSTACLES);
  private get player() { return this.world.player; }
  private enemies = new Map<number, Phaser.GameObjects.Image>();
  private art!: LabScenery;
  private target?: Point;
  private survivor!: Phaser.GameObjects.Image;
  private shadows!: Phaser.GameObjects.Graphics;
  private effects!: Phaser.GameObjects.Graphics;
  private floor?: Phaser.Textures.CanvasTexture;
  private rawFloor?: HTMLCanvasElement;
  private trails: { from: Point; to: Point; life: number }[] = [];
  private aim = { x: 250, y: 95 };
  private ready = false;
  private obstacles = LAB_OBSTACLES;

  constructor() { super('AngleLab'); }
  preload() {
    for (const actor of ['responder','zombie'] as SpriteActor[]) for (const detail of ['standard','256'] as SpriteDetail[]) {
      const key = spriteAtlas(actor,detail);
      if (!this.textures.exists(key)) this.load.atlas(key,assetUrl('assets/'+key+'.png'),assetUrl('assets/'+key+'.json'));
    }
    for (const name of ['house', 'sedan']) if (!this.textures.exists('angle_'+name+'_materials')) this.load.image('angle_'+name+'_materials', assetUrl('assets/angle_'+name+'_materials.png'));
  }
  create() {
    this.ready = false; this.controls = new AbortController(); this.enemies.clear(); this.trails = []; this.keys.clear();
    this.cameras.main.setBackgroundColor('#171d1c');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.makePanel();
    for (const actor of ['responder','zombie'] as SpriteActor[]) for (const detail of ['standard','256'] as SpriteDetail[]) {
      const key=spriteAtlas(actor,detail);
      if (!this.textures.exists(key)) { this.say('The character art could not load. Return to the menu and try again.'); return; }
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    this.makeGround(); this.art = new LabScenery(this);
    this.shadows = this.add.graphics().setDepth(3); this.effects = this.add.graphics().setDepth(3000);
    this.survivor = this.add.image(0, 0, spriteAtlas('responder',this.settings.detail),'lab3_responder_se_idle_0');
    this.input.on('pointermove', this.pointerAim, this);
    this.input.on('pointerdown', this.pointerDown, this);
    this.scale.on('resize', this.layout, this);
    const signal = this.controls.signal;
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.exit(); return; }
      const target = e.target as HTMLElement;
      if (target?.matches?.('textarea,input:not([type=range]):not([type=checkbox])')) return;
      // Native arrow/space interaction stays available in the settings, while WASD
      // continues to work immediately after changing a checkbox or resolution.
      if (target?.matches?.('input,select,button') && ['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyR', 'KeyE', 'KeyQ', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
        e.preventDefault(); e.stopImmediatePropagation(); this.keys.add(e.code);
        if (e.code === 'KeyR' && !e.repeat) this.resetActors();
        if (e.code === 'KeyE' && !e.repeat) this.world.reload();
        if (e.code === 'KeyQ' && !e.repeat) this.world.melee();
      }
    }, { capture: true, signal });
    window.addEventListener('keyup', e => this.keys.delete(e.code), { capture: true, signal });
    window.addEventListener('blur', () => this.keys.clear(), { signal });
    this.ready = true; this.resetActors(); this.layout();
  }
  private say(message: string) { if (this.status && this.status.textContent !== message) this.status.textContent = message; }
  private exit() {
    const game = this.scene.get('Game') as GameScene;
    this.scene.stop(); game.input2.reset(); game.scene.resume(); game.ui.attach(null as any, game.api);
  }
  private cleanup() {
    this.ready = false; this.controls.abort(); this.panel?.remove(); this.panel = undefined;
    this.scale.off('resize', this.layout, this); this.input.off('pointermove', this.pointerAim, this); this.input.off('pointerdown', this.pointerDown, this);
    this.keys.clear(); this.enemies.clear(); this.art?.destroy(); this.trails = []; this.rawFloor = undefined;
    if (this.textures.exists('angle_lab_floor')) this.textures.remove('angle_lab_floor'); this.floor = undefined;
  }
  private makePanel() {
    const panel = this.panel = document.createElement('section'); panel.id = 'angle-lab-ui';
    panel.innerHTML = `<header><div><span class="lab-eyebrow">PLAYABLE VISUAL TEST</span><h1>ANGLE LAB <small>03</small></h1></div><button data-action="back">← MAIN MENU <kbd>Esc</kbd></button></header>
      <aside><h2>Find your angle</h2><p>Explore the house and sedan. Walls fade when they hide you. One zombie arrives every 30 seconds.</p>
      <fieldset><legend>Tilt from overhead</legend><div class="lab-presets"><button data-tilt="15">15°<small>SUBTLE</small></button><button data-tilt="30">30°<small>BALANCED</small></button><button data-tilt="45">45°<small>LOWER</small></button></div></fieldset>
      <label>Street rotation <output id="lab-yaw-value"></output><input aria-label="Street rotation" id="lab-yaw" type="range" min="-30" max="45" step="15"></label>
      <label>Zoom <output id="lab-zoom-value"></output><input aria-label="Zoom" id="lab-zoom" type="range" min="0.75" max="1.5" step="0.05"></label>
      <label class="lab-detail">Sprite detail<select id="lab-detail" aria-label="Sprite detail"><option value="standard">Standard · 96 × 128</option><option value="256">Detailed · 256 × 256</option></select><small>Both characters · same size in the world</small></label>
      <label class="lab-check"><input id="lab-cutaway" type="checkbox"> Cutaway roof</label>
      <label class="lab-check"><input id="lab-follow" type="checkbox"> Zombies follow you</label>
      <div class="lab-actions"><button data-action="reset">RESET SCENE <kbd>R</kbd></button><button data-action="defaults">RESET VIEW</button></div>
      <p class="lab-readout" aria-live="polite"></p><p class="lab-note">Responder + red-eye zombie · 8 facings, designed for 45°. Shift runs · E reloads · Q shoves. R resets.</p></aside>
      <footer><span><kbd>WASD</kbd> / <kbd>↑↓←→</kbd> Move · Mouse aim · Click / <kbd>Space</kbd> Shoot</span><span class="lab-status" aria-live="polite"></span></footer>
      <div class="lab-touch"><button data-move="ArrowUp" aria-label="Move up">↑</button><button data-move="ArrowLeft" aria-label="Move left">←</button><button data-move="ArrowDown" aria-label="Move down">↓</button><button data-move="ArrowRight" aria-label="Move right">→</button><button data-action="fire">FIRE</button></div>`;
    document.body.appendChild(panel); this.status = panel.querySelector('.lab-status')!;
    const signal = this.controls.signal;
    panel.querySelector<HTMLSelectElement>('#lab-detail')!.addEventListener('change',e=>{this.settings.detail=(e.target as HTMLSelectElement).value==='standard'?'standard':'256';this.syncControls();}, {signal});
    panel.querySelector('[data-action=back]')!.addEventListener('click', () => this.exit(), { signal });
    panel.querySelector('[data-action=reset]')!.addEventListener('click', () => this.resetActors(), { signal });
    panel.querySelector('[data-action=defaults]')!.addEventListener('click', () => { Object.assign(this.settings, LAB_DEFAULTS); this.syncControls(); this.layout(); }, { signal });
    panel.querySelector('[data-action=fire]')!.addEventListener('click', () => { const z = this.world.zombies.filter(z=>z.hp>0).sort((a,b)=>Math.hypot(a.x-this.player.x,a.y-this.player.y)-Math.hypot(b.x-this.player.x,b.y-this.player.y))[0]; if(z)this.aim={x:z.x,y:z.y}; this.fire(); }, { signal });
    for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-tilt]')) button.addEventListener('click', () => { this.settings.tilt = Number(button.dataset.tilt); this.syncControls(); this.layout(); }, { signal });
    for (const key of ['yaw', 'zoom'] as const) panel.querySelector<HTMLInputElement>('#lab-' + key)!.addEventListener('input', e => { this.settings[key] = Number((e.target as HTMLInputElement).value); this.syncControls(); this.layout(); }, { signal });
    for (const key of ['cutaway', 'follow'] as const) panel.querySelector<HTMLInputElement>('#lab-' + key)!.addEventListener('change', e => { this.settings[key] = (e.target as HTMLInputElement).checked; this.layout(); }, { signal });
    for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-move]')) {
      button.addEventListener('pointerdown', e => { button.setPointerCapture(e.pointerId); this.keys.add(button.dataset.move!); }, { signal });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => this.keys.delete(button.dataset.move!), { signal });
    }
    this.syncControls();
  }
  private syncControls() {
    if (!this.panel) return;
    this.panel.querySelector<HTMLSelectElement>('#lab-detail')!.value=this.settings.detail;
    for (const b of this.panel.querySelectorAll<HTMLButtonElement>('[data-tilt]')) { const on = Number(b.dataset.tilt) === this.settings.tilt; b.classList.toggle('selected', on); b.setAttribute('aria-pressed', String(on)); }
    for (const key of ['yaw', 'zoom'] as const) this.panel.querySelector<HTMLInputElement>('#lab-' + key)!.value = String(this.settings[key]);
    for (const key of ['cutaway', 'follow'] as const) this.panel.querySelector<HTMLInputElement>('#lab-' + key)!.checked = this.settings[key];
    this.panel.querySelector('#lab-yaw-value')!.textContent = this.settings.yaw + '°';
    this.panel.querySelector('#lab-zoom-value')!.textContent = this.settings.zoom.toFixed(2) + '×';
    this.panel.querySelector('.lab-readout')!.textContent = `Tilt ${this.settings.tilt}° · Rotation ${this.settings.yaw}° · Zoom ${this.settings.zoom.toFixed(2)}×`;
  }
  private resetActors() {
    for (const image of this.enemies.values()) image.destroy(); this.enemies.clear();
    this.world.reset(); this.trails = []; this.target = undefined; this.aim = {x:180,y:-60};
    this.say(this.world.message);
  }
  private makeGround() {
    const raw = this.rawFloor = document.createElement('canvas'); raw.width = 1024; raw.height = 768;
    const g = raw.getContext('2d')!; g.imageSmoothingEnabled = false;
    const tile = (name: string, x: number, y: number, w: number, h: number, fallback: string) => {
      g.fillStyle = fallback; g.fillRect(x, y, w, h); const frame = this.textures.getFrame('env_tiles', name);
      if (!frame) return;
      g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
      for (let yy = y; yy < y + h; yy += 64) for (let xx = x; xx < x + w; xx += 64) g.drawImage(frame.source.image as CanvasImageSource, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, xx, yy, 64, 64);
      g.restore();
    };
    tile('tile_grass_dry_0', 0, 0, 1024, 768, '#4c523b');
    tile('tile_sidewalk_0', 0, 288, 1024, 256, '#8c8d80'); tile('tile_asphalt_cracked_0', 0, 312, 1024, 208, '#3b4141');
    tile('tile_concrete_0', 160, 110, 310, 200, '#77786d');
    g.fillStyle = '#b6a965'; for (let x = 0; x < 1024; x += 90) g.fillRect(x, 412, 42, 4);
    g.fillStyle = '#aaa898'; g.fillRect(0, 318, 1024, 2); g.fillRect(0, 512, 1024, 2);
    g.fillStyle = '#343d36'; g.font = 'bold 20px monospace'; g.fillText('DEAD ZONE / ANGLE STUDY', 550, 250);
    g.strokeStyle = '#6e745a'; g.lineWidth = 3; g.strokeRect(52, 74, 920, 620);
    this.floor = this.textures.createCanvas('angle_lab_floor', this.scale.width, this.scale.height)!;
    this.add.image(0, 0, 'angle_lab_floor').setOrigin(0).setDepth(0);
  }
  private layout() {
    if (!this.ready || !this.floor || !this.rawFloor) return;
    const w = this.scale.width, h = this.scale.height, narrow = w < 760;
    const available = narrow ? w - 12 : w - 310;
    const zoom = Math.min(available / 1050, (h - (narrow ? 290 : 150)) / 750) * this.settings.zoom;
    this.camera2 = { ...this.settings, zoom: Math.max(0.25, zoom), x: available / 2, y: narrow ? h * 0.64 : h * 0.56 };
    this.floor.setSize(w, h); const g = this.floor.getContext(), c = this.camera2;
    const a = c.yaw * Math.PI / 180, t = Math.cos(c.tilt * Math.PI / 180);
    g.resetTransform(); g.clearRect(0, 0, w, h); g.imageSmoothingEnabled = false;
    g.setTransform(c.zoom * Math.cos(a), c.zoom * t * Math.sin(a), -c.zoom * Math.sin(a), c.zoom * t * Math.cos(a), c.x, c.y);
    g.drawImage(this.rawFloor, -512, -384); g.resetTransform(); this.floor.refresh();
    this.art.layout(c, this.settings.cutaway);
  }
  private pointerAim(p: Phaser.Input.Pointer) {
    // A world-sized aim envelope keeps the two texture resolutions mechanically identical.
    const c=this.camera2;
    const targets=this.world.zombies.filter(z=>{const foot=project(z,0,c);return z.hp>0&&Math.abs(p.x-foot.x)<23*c.zoom&&p.y>foot.y-72*c.zoom&&p.y<foot.y+6*c.zoom;}).sort((a,b)=>depth(b,c.yaw)-depth(a,c.yaw));
    this.aim=targets.length?{x:targets[0].x,y:targets[0].y}:unproject(p,this.camera2);
  }
  private pointerDown(p: Phaser.Input.Pointer) {
    this.pointerAim(p);
    if(p.wasTouch)this.target=unproject(p,this.camera2);else this.fire();
  }
  private fire() { const trace=this.world.shoot(this.aim);if(trace)this.trails.push(trace); }
  private drawActor(kind: 'survivor'|'zombie', actor:Actor, sprite:Phaser.GameObjects.Image) {
    const c=this.camera2,point=project(actor,0,c),artKind=kind==='survivor'?'responder':'zombie';
    const visual=characterVisual(artKind,actor,c.yaw),resolution=SPRITE_RESOLUTIONS[this.settings.detail],atlas=spriteAtlas(artKind,this.settings.detail);
    if(sprite.texture.key!==atlas)sprite.setTexture(atlas,visual.frame);else sprite.setFrame(visual.frame);
    sprite.setFlipX(visual.flip).setAlpha(1).setOrigin(resolution.originX,resolution.originY);
    sprite.setPosition(point.x,point.y).setScale(c.zoom*resolution.scale).setDepth(1000+depth(actor,c.yaw));
    if(actor.flash>0)sprite.setTintMode(Phaser.TintModes.FILL).setTint(0xe1b6a0);else sprite.clearTint();
    this.shadows.fillStyle(0x101710,.35*sprite.alpha).fillEllipse(point.x,point.y,34*c.zoom,16*c.zoom*Math.cos(c.tilt*Math.PI/180));
    if(kind==='zombie'&&actor.hp>0&&actor.hp<3)this.effects.fillStyle(0x251d16).fillRect(point.x-12*c.zoom,point.y-70*c.zoom,24*c.zoom,3*c.zoom).fillStyle(0xa55943).fillRect(point.x-12*c.zoom,point.y-70*c.zoom,8*actor.hp*c.zoom,3*c.zoom);
  }
  override update(_time: number, delta: number) {
    if (!this.ready) return;
    const dt=Math.min(delta/1000,.05),p=this.player,c=this.camera2;
    let dx=Number(this.keys.has('KeyD')||this.keys.has('ArrowRight'))-Number(this.keys.has('KeyA')||this.keys.has('ArrowLeft'));
    let dy=Number(this.keys.has('KeyS')||this.keys.has('ArrowDown'))-Number(this.keys.has('KeyW')||this.keys.has('ArrowUp'));
    const a=c.yaw*Math.PI/180,px=p.x,py=p.y;
    p.running=this.keys.has('ShiftLeft')||this.keys.has('ShiftRight');const speed=p.running?205:135;
    // Braced reload/shove/hit poses plant the feet. Firing can continue while strafing.
    const planted=p.actionTime>0&&['reload','melee','hit'].includes(p.action);
    if(p.hp>0&&!planted){
      if(dx||dy){this.target=undefined;const n=Math.hypot(dx,dy);dx/=n;dy/=n;move(p,(dx*Math.cos(a)+dy*Math.sin(a))*speed*dt,(-dx*Math.sin(a)+dy*Math.cos(a))*speed*dt,13,this.obstacles);}
      else if(this.target){const d=Math.hypot(this.target.x-p.x,this.target.y-p.y);if(d<5)this.target=undefined;else move(p,(this.target.x-p.x)/d*speed*dt,(this.target.y-p.y)/d*speed*dt,13,this.obstacles);}
      p.angle=Math.atan2(this.aim.y-p.y,this.aim.x-p.x);
      if(this.keys.has('Space')||this.input.activePointer.isDown&&!this.input.activePointer.wasTouch)this.fire();
    }
    const traveled=Math.hypot(p.x-px,p.y-py);p.moving=traveled>.01;
    if(p.moving){p.moveAngle=Math.atan2(p.y-py,p.x-px);const motion=locomotion(p.angle,p.moveAngle,p.running);p.phase+=traveled/(motion==='run'?20:motion.startsWith('strafe')?10:14);}
    this.world.update(dt,delta/1000,this.settings.follow);
    this.shadows.clear();this.effects.clear();this.drawActor('survivor',p,this.survivor);
    const ids=new Set(this.world.zombies.map(z=>z.id));
    for(const [id,sprite] of this.enemies)if(!ids.has(id)){sprite.destroy();this.enemies.delete(id);}
    for(const z of this.world.zombies){
      let sprite=this.enemies.get(z.id);if(!sprite){sprite=this.add.image(0,0,spriteAtlas('zombie',this.settings.detail),'lab3_zombie_se_idle_0');this.enemies.set(z.id,sprite);}
      this.drawActor('zombie',z,sprite);
    }
    this.art.update(p,c,dt);
    this.trails=this.trails.filter(t=>(t.life-=dt)>0);
    for(const t of this.trails){const f=project(t.from,60,c),e=project(t.to,60,c);this.effects.lineStyle(2*c.zoom,0xf0d78c,t.life/.12).lineBetween(f.x,f.y,e.x,e.y);this.effects.fillStyle(0xf7dda2,t.life/.12).fillCircle(f.x,f.y,4*c.zoom);}
    const cross=project(this.aim,0,c);this.effects.lineStyle(1,0xd4cda3,.7).strokeCircle(cross.x,cross.y,5).lineBetween(cross.x-9,cross.y,cross.x-3,cross.y).lineBetween(cross.x+3,cross.y,cross.x+9,cross.y);
    this.say('HP '+p.hp+' · Ammo '+this.world.ammo+'/8 · Zombies '+this.world.zombies.filter(z=>z.hp>0).length+' · Next in '+Math.ceil(this.world.spawnIn)+'s · '+this.world.message);
  }
}
