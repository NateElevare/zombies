// BootScene — loads the generated art (manifest -> atlases), registers every animation, then starts GameScene.
import * as Phaser from 'phaser';
import { assetUrl } from '../asset-url';

export type Manifest = {
  artScale: number; atlases: string[];
  sprites: Record<string, any>; tiles: Record<string, string[]>; props: Record<string, any>;
  [k: string]: any;
};
export type AnimDef = { key: string; atlas: string; frames: string[]; frameRate: number; repeat: number };

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    for (const key of ['campaign_people','campaign_props']) this.load.atlas(key, assetUrl(`assets/${key}.png`), assetUrl(`assets/${key}.json`));
    this.load.json('storyArt', assetUrl('assets/story-art.json'));
    this.load.json('hiveArt', assetUrl('assets/hive-art.json'));
    for (const actor of ['responder','zombie']) {
      const key = `angle_${actor}_v3_256`;
      this.load.atlas(key, assetUrl(`assets/${key}.png`), assetUrl(`assets/${key}.json`));
    }
    for (const name of ['house','sedan']) this.load.image(`angle_${name}_materials`, assetUrl(`assets/angle_${name}_materials.png`));
    this.load.json('manifest', assetUrl('assets/manifest.json'));
    this.load.json('anims', assetUrl('assets/anims.json'));
  }

  create() {
    const manifest = (this.cache.json.get('manifest') || { artScale: 2, atlases: [], sprites: {}, tiles: {}, props: {} }) as Manifest;
    const storyArt=this.cache.json.get('storyArt');
    manifest.atlases=[...new Set([...manifest.atlases,'campaign_materials'])];
    manifest.tiles.campaign_water=['campaign_water_0','campaign_water_1','campaign_water_2','campaign_water_3'];
    if(storyArt){manifest.storyArt=storyArt;manifest.atlases=[...new Set([...manifest.atlases,...storyArt.atlases])];}
    const hiveArt = this.cache.json.get('hiveArt');
    if (hiveArt) {
      manifest.hiveArt = hiveArt;
      manifest.atlases = [...new Set([...manifest.atlases, ...hiveArt.atlases])];
      manifest.sprites = { ...manifest.sprites, ...hiveArt.sprites };
      this.cache.json.add('anims', [...(this.cache.json.get('anims') || []), ...hiveArt.anims]);
    }
    this.registry.set('manifest', manifest);
    for (const a of manifest.atlases) this.load.atlas(a, assetUrl(`assets/${a}.png`), assetUrl(`assets/${a}.json`));
    const bar = document.getElementById('boot-progress');
    this.load.on('progress', (p: number) => { if (bar) bar.style.width = Math.round(p * 100) + '%'; });
    this.load.once('complete', () => {
      for (const key of ['campaign_people','campaign_props', ...(hiveArt?.atlases || [])]) {
        if (this.textures.exists(key)) this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
      if (manifest.characterInfo?.zombieArt === 'reference-pixel-overhead-v1') {
        for (const key of ['zombies', 'zombies2', 'player_variants']) {
          if (this.textures.exists(key)) this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
        }
      }
      const anims = (this.cache.json.get('anims') || []) as AnimDef[];
      if (manifest.colaArt === 'pixel-v1' && this.textures.exists('cola')) this.textures.get('cola').setFilter(Phaser.Textures.FilterMode.NEAREST);
      if (manifest.bossArt === 'reference-pixel-overhead-v1' && this.textures.exists('bosses')) this.textures.get('bosses').setFilter(Phaser.Textures.FilterMode.NEAREST);
      if (this.textures.exists('warden')) this.textures.get('warden').setFilter(Phaser.Textures.FilterMode.NEAREST);
        if (this.textures.exists('zombie_climb')) this.textures.get('zombie_climb').setFilter(Phaser.Textures.FilterMode.NEAREST);
      if (manifest.effectsStyle === 'pixel-v1' && this.textures.exists('fx')) this.textures.get('fx').setFilter(Phaser.Textures.FilterMode.NEAREST);
      let made = 0;
      for (const a of anims) {
        if (!this.textures.exists(a.atlas) || this.anims.exists(a.key)) continue;
        this.anims.create({
          key: a.key,
          frames: a.frames.map((f) => ({ key: a.atlas, frame: f })),
          frameRate: a.frameRate, repeat: a.repeat,
        });
        made++;
      }
      console.info(`[boot] ${manifest.atlases.length} atlases, ${made} anims`);
      document.getElementById('boot')?.remove();
      this.scene.start('Game');
    });
    this.load.start();
  }
}
