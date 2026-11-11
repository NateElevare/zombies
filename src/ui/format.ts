// format.ts — pure helpers (no DOM) so they can be unit tested.
export const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
export const pct = (n: number) => Math.round((n || 0) * 100) + '%';
export const fmt = (n: number | undefined, d = 0) => (Number.isFinite(n) ? (n as number).toFixed(d).replace(/\.0+$/, '') : '-');
export const prettyId = (id: string) => id.replace(/_/g, ' ');
/** Percentage width string, rounded to 0.5% so the DOM is only touched on visible changes. */
export const barWidth = (frac: number) => (Math.round(clamp01(frac) * 200) / 2) + '%';

export interface WeaponLike {
  damage?: number; pellets?: number; fireRate?: number; magSize?: number; reloadTime?: number; spread?: number;
  range?: number; noise?: number; ammo?: string | null; class?: string;
  melee?: { range?: number } | null;
  pierce?: number; ricochet?: number; burst?: number; explosive?: number; incendiary?: boolean; crit?: number; lifesteal?: number;
}
/** Rows for a weapon tooltip: [label, value]. */
export function weaponRows(w: WeaponLike, mag: number | undefined, ammoName: string, ammoHave: number): [string, string][] {
  const rows: [string, string][] = [];
  const melee = w.class === 'melee' || !!w.melee;
  rows.push(['Damage', fmt(w.damage) + ((w.pellets || 1) > 1 ? ' x' + w.pellets : '')]);
  if (w.fireRate) rows.push([melee ? 'Swings/min' : 'Fire rate', fmt(60 / w.fireRate) + (melee ? '' : ' rpm')]);
  if (!melee) {
    if (w.magSize) rows.push(['Magazine', (typeof mag === 'number' ? mag + ' / ' : '') + w.magSize]);
    if (w.reloadTime) rows.push(['Reload', fmt(w.reloadTime, 1) + 's']);
    if (typeof w.spread === 'number') rows.push(['Accuracy', Math.max(0, Math.round(100 - w.spread * 300)) + '%']);
    if (w.ammo) rows.push(['Ammo', ammoName + ' (' + ammoHave + ')']);
    if (w.range) rows.push(['Range', fmt(w.range)]);
  } else if (w.melee && w.melee.range) rows.push(['Reach', fmt(w.melee.range)]);
  if (w.noise) rows.push(['Noise', fmt(w.noise)]);
  const perks: string[] = [];
  if (w.pierce) perks.push('Pierce ' + w.pierce);
  if (w.ricochet) perks.push('Ricochet ' + w.ricochet);
  if ((w.burst || 0) > 1) perks.push(w.burst + '-round burst');
  if (w.explosive) perks.push('Explosive');
  if (w.incendiary) perks.push('Incendiary');
  if (w.crit) perks.push('Crit ' + pct(w.crit));
  if (w.lifesteal) perks.push('Lifesteal');
  if (perks.length) rows.push(['Perks', perks.join(', ')]);
  return rows;
}
