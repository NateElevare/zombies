// Native pixel FX: discrete two-pixel clusters and a small palette, never blur or gradients.
import { canvas, rng } from '../lib/core';

const BLOOD = ['#310d13', '#50121c', '#761d27', '#9b3036', '#bf4b49'];
const FIRE = ['#743022', '#b84c25', '#e68031', '#ffd16a', '#fff3bb'];
const SMOKE = ['#35363a', '#49494b', '#60605e', '#77776e'];

export function pixelEffect(name: string, width: number, height: number) {
  const { c, g } = canvas(width, height), step = 2;
  const frame = Number(name.match(/_(\d+)$/)?.[1] || 0);
  const family = name.replace(/_\d+$/, '');
  const seed = [...family].reduce((a, b) => a * 31 + b.charCodeAt(0) | 0, 77);
  const random = rng(seed + (/blood_(pool|smear)/.test(family) ? frame * 97 : 0)), cx = width / 2, cy = height / 2;
  const pixel = (x: number, y: number, color: string, size = step) => {
    g.fillStyle = color; g.fillRect(Math.floor(x / step) * step, Math.floor(y / step) * step, Math.max(step, Math.round(size / step) * step), Math.max(step, Math.round(size / step) * step));
  };
  const blob = (x: number, y: number, rx: number, ry: number, colors: string[], phase = 0) => {
    for (let yy = Math.max(0, Math.floor((y - ry) / step) * step); yy < Math.min(height, y + ry); yy += step) {
      for (let xx = Math.max(0, Math.floor((x - rx) / step) * step); xx < Math.min(width, x + rx); xx += step) {
        const dx = (xx + 1 - x) / rx, dy = (yy + 1 - y) / ry;
        const d = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
        const edge = 0.9 + 0.055 * Math.sin(angle * 7 + phase) + 0.04 * Math.sin(angle * 11 - phase);
        if (d > edge) continue;
        const shade = d > edge - 0.12 ? 0 : Math.min(colors.length - 1, Math.max(1, Math.floor((1 - d * 0.4 - (dx + dy) * 0.16) * (colors.length - 1))));
        pixel(xx, yy, colors[shade]);
      }
    }
  };
  if (family === 'blood_drop') {
    blob(cx, cy, 4 + frame * 0.65, 3 + frame * 0.6, BLOOD, frame);
  } else if (family === 'blood_pool') {
    const radius = 33 + frame * 3;
    blob(cx, cy, radius * 1.12, radius * 0.83, BLOOD.slice(0, 4), frame);
    // Small irregular dried patches and broken highlights add texture without a glossy gradient.
    for (let i = 0; i < 22; i++) {
      const x = cx + random.range(-radius * 0.65, radius * 0.65), y = cy + random.range(-radius * 0.45, radius * 0.45);
      pixel(x, y, i % 4 === 0 ? BLOOD[3] : BLOOD[1], i % 3 ? 2 : 4);
    }
    for (let i = 0; i < 18; i++) {
      const a = random.range(0, Math.PI * 2), d = random.range(radius * 0.75, radius * 1.4);
      blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, random.range(2, 6), random.range(2, 4), BLOOD.slice(0, 3), i);
    }
  } else if (family === 'blood_smear') {
    for (let i = 0; i < 7; i++) {
      const y = cy + random.range(-13, 13), start = random.range(6, 30);
      for (let x = start; x < width * 0.84; x += step) {
        if (random.next() > 0.12) pixel(x, y, BLOOD[1 + (i % 3)], 2 + (i % 2) * 2);
      }
    }
    blob(width * 0.84, cy, 16, 15, BLOOD.slice(0, 4), frame);
  } else if (family === 'blood_spray') {
    const t = (frame + 1) / 6;
    for (let i = 0; i < 32; i++) {
      const a = random.range(-0.55, 0.55), speed = random.range(0.3, 1), d = 4 + speed * width * 0.83 * t;
      const x = 4 + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      const size = Math.max(2, (1 - t * 0.5) * random.range(2, 5));
      pixel(x, y, BLOOD[1 + i % 3], size);
      if (frame < 4) pixel(x - step, y, BLOOD[1], size);
    }
  } else if (family.startsWith('muzzle_')) {
    const length = width * [0.85, 0.65, 0.4][frame];
    for (let x = 2; x < length; x += step) {
      const half = (1 - x / length) * height * (family === 'muzzle_shotgun' ? 0.38 : 0.24);
      for (let y = cy - half; y <= cy + half; y += step) {
        const edge = Math.abs(y - cy) / Math.max(1, half);
        if (edge > 0.6 && random.next() < 0.25) continue;
        pixel(x, y, FIRE[edge > 0.72 ? 2 : x < length * 0.5 && edge < 0.45 ? 4 : 3]);
      }
    }
  } else if (family === 'fire') {
    const phase = frame / 8 * Math.PI * 2, base = height * 0.74;
    for (let i = 0; i < 5; i++) {
      const x = cx + (i - 2) * 6, tall = 24 + 16 * (0.5 + 0.5 * Math.sin(phase + i * 1.7));
      for (let y = base - tall; y < base; y += step) {
        const u = (base - y) / tall, half = (1 - u) * 8;
        for (let xx = -half; xx <= half; xx += step) pixel(x + xx + Math.sin(phase + u * 4 + i) * u * 6, y, FIRE[u > 0.7 ? 1 : u > 0.4 ? 2 : Math.abs(xx) < half / 2 ? 4 : 3]);
      }
    }
  } else if (family === 'explosion' || family === 'smoke' || family === 'dust') {
    const blast = family === 'explosion', dusty = family === 'dust';
    const radius = blast ? (frame < 6 ? 22 + frame * 13 : 86 + (frame - 6) * 3) : (dusty ? 14 : 22) + frame * 3;
    const colors = blast && frame < 6 ? FIRE : dusty ? ['#514a3b', '#73664e', '#958365', '#b09e79'] : SMOKE;
    for (let i = 0; i < 9; i++) {
      const a = random.range(0, Math.PI * 2), d = random.range(0, radius * 0.6), r = radius * random.range(0.3, 0.55);
      blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, r * 0.88, colors, i);
    }
    if (blast && frame < 4) blob(cx, cy, radius * 0.5, radius * 0.45, FIRE.slice(2), frame);
  } else if (family === 'scorch') {
    blob(cx, cy, 77, 66, ['#1d1a19', '#29231f', '#332a23'], frame);
  } else if (family === 'spark' || family === 'impact_wall') {
    const wall = family === 'impact_wall';
    for (let i = 0; i < 9; i++) {
      const a = wall ? Math.PI + random.range(-1, 1) : random.range(0, Math.PI * 2);
      const d = (3 + frame * 3) * random.range(0.5, 1.25);
      pixel(cx + Math.cos(a) * d, cy + Math.sin(a) * d, wall ? ['#494847', '#79756b', '#b5a68c'][i % 3] : FIRE[2 + i % 3], i % 2 ? 2 : 4);
    }
  } else if (family === 'ember') {
    blob(cx, cy, 5 - frame, 5 - frame, FIRE.slice(1), frame);
  } else if (family === 'bullet_tracer') {
    for (let x = 2; x < width - 2; x += step) pixel(x, cy - 1, x < width * 0.4 ? '#b88238' : x < width * 0.8 ? '#ffd16a' : '#fff3bb');
  } else if (family.startsWith('shell_')) {
    const shotgun = family === 'shell_shotgun';
    g.fillStyle = shotgun ? '#8d332f' : '#bb8b36'; g.fillRect(2, 2, width - 4, height - 4);
    g.fillStyle = '#edcb71'; g.fillRect(2, 2, shotgun ? 4 : width - 4, 2);
  } else if (family === 'footprint') {
    blob(width * 0.6, cy, 8, 5, ['#29271f', '#353228'], 0);
    blob(4, cy, 3, 4, ['#29271f', '#353228'], 0);
  } else throw new Error(`No pixel FX recipe for ${name}`);
  return c;
}
