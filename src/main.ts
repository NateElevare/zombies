// main.ts — boots Phaser. Owned by the orchestrator.
import * as Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { AngleLabScene } from './scenes/AngleLabScene';
import './ui/style.css';
import './ui/angle-lab.css';

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  backgroundColor: '#07080a',
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
  disableContextMenu: true,
  scene: [BootScene, GameScene, AngleLabScene],
});
(window as any).__phaser = game;
