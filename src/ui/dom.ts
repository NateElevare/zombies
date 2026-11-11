// dom.ts — tiny DOM helpers + item icon rendering (PNG with glyph fallback).
import { ITEMS, RARITY_COLORS, lookOf, type ItemDef } from '../sim/items';
import type { Rarity } from '../sim/types';
import { assetUrl } from '../asset-url';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const itemDef = (id: string): ItemDef | undefined => (Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined);
export const itemName = (id: string) => itemDef(id)?.name ?? id.replace(/_/g, ' ');
export const rarityColor = (r?: string) => RARITY_COLORS[r as Rarity] ?? '#bfc5ba';

/** Set textContent only when it changed (cheap per-frame HUD writes). */
export function setText(node: HTMLElement, v: string) { if (node.dataset.v !== v) { node.dataset.v = v; node.textContent = v; } }
export function setW(node: HTMLElement, w: string) { if (node.dataset.w !== w) { node.dataset.w = w; node.style.width = w; } }
export function setCls(node: HTMLElement, cls: string, on: boolean) { if (node.classList.contains(cls) !== on) node.classList.toggle(cls, on); }

const BASE = ((import.meta as any).env?.BASE_URL as string | undefined) ?? './';
const imgOk = new Map<string, boolean>(); // icon file -> loaded ok?
/** Icon box for assets/icons/<file>.png; the glyph shows until/unless the image loads. */
export function iconEl(file: string, glyph: string, color: string, cls = ''): HTMLElement {
  const box = el('div', 'ico ' + cls);
  box.style.setProperty('--ic', color);
  const g = el('span', 'ico-g', glyph); box.appendChild(g);
  const known = imgOk.get(file);
  if (known === false) return box;
  const img = new Image();
  img.className = 'ico-i'; img.draggable = false; img.alt = '';
  img.onload = () => { imgOk.set(file, true); box.classList.add('has-img'); };
  img.onerror = () => { imgOk.set(file, false); img.remove(); };
  const folder=Object.hasOwn(ITEMS,file)||file.startsWith('struct_')?'story-icons':'icons';
  img.src = assetUrl(BASE + 'assets/'+folder+'/' + file + '.png');
  box.appendChild(img);
  return box;
}
export const itemIcon = (id: string, cls = '') => { const d = itemDef(id); return iconEl(lookOf(id), d?.glyph ?? '?', d?.color ?? '#999', cls); };
export const structIcon = (type: string, glyph: string, cls = '') => iconEl('struct_' + type, glyph, '#c8b88a', cls);
