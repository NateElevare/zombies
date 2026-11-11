// Backpack tabs on the inventory screen: ALL shows every slot; WEAPONS & GEAR, AMMO and HEALING show only the stacks
// of that kind. Tabs are views of the one backpack, so a slot in a tab still acts on its real slot.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DomNode, memoryStorage } from './helpers/dom';
import { Overlays } from '../src/ui/overlays';
import * as road from '../src/sim/road';
import * as inv from '../src/sim/inventory';
import type { ShellApi } from '../src/shell';
import type { GameState } from '../src/sim/types';
import { NEUTRAL_INPUT } from '../src/input';

vi.mock('../src/ui/mapview', () => ({ getMapImage: vi.fn(), drawFullMap: vi.fn(), worldSize: () => ({ w: 16000, h: 16000 }) }));
vi.mock('../src/net/cloud', () => ({ cloud: { user: null, status: 'signed-out', error: null, on: vi.fn(() => () => {}), pullSurvival: vi.fn(async () => 'local'), clearSurvival: vi.fn(async () => {}), onSaved: vi.fn(), flush: vi.fn(async () => {}) } }));

let root: DomNode;
beforeEach(() => {
  root = new DomNode();
  vi.stubGlobal('window', new DomNode('WINDOW')); vi.stubGlobal('innerWidth', 1280); vi.stubGlobal('innerHeight', 720);
  vi.stubGlobal('document', { body: root, getElementById: () => root, createElement: (tag: string) => new DomNode(tag.toUpperCase()), createElementNS: (_: string, tag: string) => new DomNode(tag.toUpperCase()) });
  vi.stubGlobal('Image', class extends DomNode {});
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('requestAnimationFrame', () => 1); vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const shell = (): ShellApi => ({ newSurvival: vi.fn(async () => {}), continueSurvival: vi.fn(async () => false), newArcade: vi.fn(), newRoad: vi.fn(), continueRoad: vi.fn(() => false), hasRoadSave: () => false, openAngleLab: vi.fn(),
  quitToTitle: vi.fn(() => true), hasSave: () => true, input: () => NEUTRAL_INPUT(0, 0), togglePerf: vi.fn() });
function open(): { s: GameState; tabs: () => DomNode[]; tab: (name: string) => DomNode; slots: () => DomNode[] } {
  const s = road.newRoad('survivor'), p = s.player;
  p.inv.slots.fill(null);
  // a backpack as it looks late in a story: guns, armour, three kinds of ammunition, bandages and medkits, mixed up
  for (const [id, qty] of [['ammo_9mm', 700], ['bandage', 12], ['shotgun', 1], ['ammo_556', 300], ['medkit', 3], ['military_vest', 1], ['ammo_12g', 40], ['painkillers', 2]] as const) inv.add(p.inv, id, qty);
  const overlays = new Overlays(root as unknown as HTMLElement, { close() {}, open() {} });
  overlays.attach(s, shell()); overlays.show('inventory', null);
  const tabs = () => root.querySelectorAll('.bag-tabs')[0].children;
  return { s, tabs, tab: (name: string) => tabs().find(t => label(t).startsWith(name))!, slots: () => root.querySelectorAll('.grid').at(-1)!.children.filter(n => n.classList.contains('slot')) };
}
const filled = (nodes: DomNode[]) => nodes.filter(n => n.classList.contains('filled')).length;
/** A tab's label as the browser shows it (the stub DOM keeps the raw markup). */
const label = (t: DomNode) => t.innerHTML.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

describe('backpack tabs', () => {
  it('offers ALL, WEAPONS & GEAR, AMMO and HEALING with a count of stacks on each', () => {
    const { tabs } = open();
    expect(tabs().map(label)).toEqual(['ALL 8', 'WEAPONS & GEAR 2', 'AMMO 3', 'HEALING 3']);
    expect(tabs()[0].classList.contains('active')).toBe(true);
  });
  it('ALL shows every slot of the backpack, empty ones included', () => {
    const { s, slots } = open();
    expect(slots()).toHaveLength(s.player.inv.slots.length);
    expect(filled(slots())).toBe(8);
  });
  it('a tab shows only its own stacks, and comes back the same after closing and reopening', async () => {
    const { tab, slots, tabs } = open();
    await tab('AMMO').fire('click');
    expect(slots()).toHaveLength(3); expect(filled(slots())).toBe(3);
    expect(label(tabs().find(t => t.classList.contains('active'))!)).toBe('AMMO 3');
    await tab('HEALING').fire('click'); expect(slots()).toHaveLength(3);
    await tab('WEAPONS & GEAR').fire('click'); expect(slots()).toHaveLength(2);
    await tab('ALL').fire('click'); expect(filled(slots())).toBe(8);
  });
  it('a slot in a tab acts on its real backpack slot: using a bandage from HEALING heals and uses that stack', async () => {
    const { s, tab, slots } = open(), p = s.player;
    p.hp = 40;
    await tab('HEALING').fire('click');
    await slots()[0].fire('contextmenu');   // right-click: use
    expect(p.hp).toBe(55);
    expect(inv.count(p.inv, 'bandage')).toBe(11);
    expect(inv.count(p.inv, 'ammo_9mm')).toBe(700);   // nothing else was touched
    expect(slots()).toHaveLength(3);   // still on the HEALING tab
  });
  it('shows OTHER only when something does not fit the three tabs, and says so when a tab is empty', async () => {
    const { s, tab, tabs, slots } = open(), p = s.player;
    expect(tabs().some(t => label(t).startsWith('OTHER'))).toBe(false);
    for (let i = 0; i < p.inv.slots.length; i++) if (p.inv.slots[i] && ['bandage', 'medkit', 'painkillers'].includes(p.inv.slots[i]!.id)) p.inv.slots[i] = null;
    await tab('HEALING').fire('click');
    expect(slots()).toHaveLength(0);
    expect(root.querySelectorAll('.empty').some(n => /Nothing of this kind/.test(n.textContent))).toBe(true);
  });
});
