// Code-native pixel props: every shape is rasterized onto an integer pixel grid.
import { canvas, type Canvas, type Ctx } from '../lib/core';

const ink = '#201a17', dark = '#38241b', amber = '#6a3c24', light = '#a16b3d';
function rect(g: Ctx, color: string, x: number, y: number, w: number, h: number) {
  g.fillStyle = color; g.fillRect(x, y, w, h);
}
function disc(g: Ctx, color: string, x: number, y: number, r: number) {
  g.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy));
    g.fillRect(x - half, y + dy, half * 2 + 1, 1);
  }
}
function bubble(g: Ctx, x: number, y: number, r: number) {
  disc(g, '#744c30', x, y, r); disc(g, '#c2a477', x, y - 1, Math.max(1, r - 1));
  if (r > 2) disc(g, '#eee0b9', x - 1, y - 2, r - 2);
  rect(g, '#fff1d3', x - 1, y - r + 1, 2, 1);
}

export function bottle(firing = false): Canvas {
  const { c, g } = canvas(64, 32);
  // Ribbed base, broad liquid-filled body, tapered shoulder, and open neck (+x).
  rect(g, ink, 5, 8, 35, 17); rect(g, ink, 3, 10, 39, 13);
  rect(g, ink, 40, 10, 5, 13); rect(g, ink, 45, 12, 5, 9); rect(g, ink, 50, 13, 9, 7);
  rect(g, dark, 5, 10, 36, 13); rect(g, amber, 7, 9, 31, 13);
  rect(g, light, 7, 10, 30, 3); rect(g, '#c5a975', 9, 10, 25, 1);
  rect(g, '#4a2c1e', 7, 21, 32, 3); rect(g, '#8b562f', 8, 18, 31, 2);
  for (const x of [6, 10, 14]) { rect(g, '#36271f', x, 11, 1, 11); rect(g, '#b28b58', x + 1, 11, 1, 3); }
  rect(g, amber, 39, 11, 5, 10); rect(g, '#b28b58', 39, 11, 3, 2);
  rect(g, '#754d30', 44, 13, 6, 6); rect(g, '#bda578', 44, 13, 4, 1);
  rect(g, '#5b422c', 49, 14, 8, 5); rect(g, '#dbd7bc', 53, 12, 4, 9);
  rect(g, '#8d8c78', 54, 18, 3, 3); rect(g, '#f3ebcf', 53, 13, 3, 2);
  rect(g, '#241b15', 57, 14, 2, 5); rect(g, '#9c7344', 57, 15, 1, 3);
  // Weathered paper label, with small cream graphics instead of tiny unreadable text.
  rect(g, '#461d19', 20, 8, 17, 17); rect(g, '#8b2c25', 21, 9, 15, 15);
  rect(g, '#c44d39', 22, 10, 13, 3); rect(g, '#5f2520', 21, 22, 15, 2);
  rect(g, '#e8d6ad', 22, 15, 5, 3); rect(g, '#e8d6ad', 27, 14, 8, 3);
  rect(g, '#a85a42', 24, 20, 9, 1); rect(g, '#c99167', 22, 9, 2, 1);
  rect(g, '#6e3b29', 35, 18, 2, 3); rect(g, '#d7b384', 20, 21, 2, 2);
  if (firing) { bubble(g, 58, 15, 3); bubble(g, 60, 18, 2); bubble(g, 60, 13, 2); }
  return c;
}

function mint(g: Ctx, x: number, y: number, r = 5) {
  disc(g, '#343d38', x, y, r); disc(g, '#b3b9a1', x, y, r - 1);
  disc(g, '#eee8cb', x, y - 1, r - 2); rect(g, '#fff5dc', x - 2, y - 3, 3, 1);
}
function mintRoll(g: Ctx, x: number, y: number) {
  rect(g, '#263a3c', x, y + 2, 34, 12); rect(g, '#263a3c', x + 3, y, 28, 16);
  rect(g, '#738d88', x + 2, y + 2, 30, 12); rect(g, '#c1cbbc', x + 4, y + 1, 25, 4);
  rect(g, '#345d60', x + 9, y + 4, 19, 9); rect(g, '#528887', x + 10, y + 4, 17, 3);
  rect(g, '#e4e8d5', x + 13, y + 6, 10, 3); rect(g, '#8cae9c', x + 15, y + 7, 6, 1);
  for (const dx of [3, 6, 29, 31]) { rect(g, '#e0e2cd', x + dx, y + 3, 1, 9); rect(g, '#566e6b', x + dx, y + 11, 1, 3); }
  mint(g, x + 32, y + 8, 6);
}
function upscale(c: Canvas, size = 96) {
  const out = canvas(size, size); out.g.imageSmoothingEnabled = false;
  out.g.drawImage(c, 0, 0, size, size); return out.c;
}
export function colaIcon() {
  const { c, g } = canvas(64, 64);
  g.imageSmoothingEnabled = false;
  g.save(); g.translate(29, 29); g.rotate(-Math.PI / 4); g.drawImage(bottle(true), -32, -16); g.restore();
  g.save(); g.translate(20, 44); g.rotate(-0.3); mintRoll(g, 0, 0); g.restore();
  mint(g, 17, 53, 5); mint(g, 9, 47, 4);
  return upscale(c);
}
export function mintsIcon() {
  const { c, g } = canvas(64, 64); g.imageSmoothingEnabled = false;
  g.save(); g.translate(10, 31); g.rotate(-0.45); mintRoll(g, 0, 0); g.restore();
  mint(g, 45, 34, 6); mint(g, 49, 46, 6); mint(g, 34, 49, 5);
  return upscale(c);
}
export function foam(frame: number, splash = false) {
  const size = splash ? 64 : 24, { c, g } = canvas(size, size), mid = size / 2;
  const count = splash ? 12 : 6;
  if (splash) { disc(g, dark, mid, mid, 12 + frame * 4); disc(g, amber, mid - 2, mid - 2, 11 + frame * 3); }
  for (let i = 0; i < count; i++) {
    const a = i * 2.4 + frame * 0.7, rad = splash ? 5 + (i % 4) * (4 + frame) : 2 + i % 3;
    const x = Math.round(mid + Math.cos(a) * rad), y = Math.round(mid + Math.sin(a) * rad);
    bubble(g, x, y, splash ? 3 + i % 3 : 3 + (i + frame) % 2);
  }
  if (splash) for (let i = 0; i < 7; i++) {
    const a = i * 2.1 + frame, radius = 21 + frame * 3;
    disc(g, i % 2 ? light : amber, Math.round(mid + Math.cos(a) * radius), Math.round(mid + Math.sin(a) * radius), 1 + i % 2);
  }
  return c;
}
