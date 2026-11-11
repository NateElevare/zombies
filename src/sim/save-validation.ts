// Dependency-free JSON boundary shared with the Node server.
import { validCampaign } from './campaign-save.ts';
export const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
export function validSaveCore(data: unknown): boolean {
  return record(data) && data.version === 2 && Number.isInteger(data.seed) && data.seed >= 0 && data.seed <= 4294967295 &&
    record(data.player) && Number.isFinite(data.player.x) && Number.isFinite(data.player.y) && record(data.player.inv) && Array.isArray(data.player.inv.slots) &&
    (data.campaign === undefined || validCampaign(data.campaign));
}
export function validCloudSave(data: unknown): boolean {
  if (!validSaveCore(data) || !record(data)) return false;
  const uint = (n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 4294967295;
  const inventory = (v: unknown) => record(v) && uint(v.size) && v.size <= 4096 && Array.isArray(v.slots) && v.slots.length === v.size;
  return uint(data.rngState) && record(data.clock) && uint(data.clock.day) && Number.isFinite(data.clock.t) &&
    record(data.stats) && ['kills', 'containersLooted', 'deaths', 'daysSurvived'].every(k => uint(data.stats[k])) &&
    inventory(data.player.inv) && record(data.player.inv.equip) && uint(data.player.level) &&
    record(data.containers) && Object.values(data.containers).every(c => record(c) && typeof c.searched === 'boolean' && (c.inv === null || inventory(c.inv))) &&
    Array.isArray(data.drops) && data.drops.every(d => record(d) && typeof d.id === 'string' && Number.isFinite(d.x) && Number.isFinite(d.y) && inventory(d.inv) &&
      (Number.isFinite(d.life) || (record(d.life) && Object.keys(d.life).length === 1 && d.life.numberValue === 'Infinity'))) &&
    Array.isArray(data.structures) && data.structures.every(s => record(s) && typeof s.id === 'string' && typeof s.type === 'string' &&
      ['x', 'y', 'w', 'h', 'hp', 'maxHp', 'rot'].every(k => Number.isFinite(s[k])) && (s.inv === undefined || inventory(s.inv))) && record(data.base) &&
    (data.salvaged === undefined || (Array.isArray(data.salvaged) && data.salvaged.length <= 20000 && data.salvaged.every(k => typeof k === 'string' && k.length <= 64))) &&
    (data.explored === undefined || (typeof data.explored === 'string' && data.explored.length <= 8192 && /^[A-Za-z0-9+/=]*$/.test(data.explored)));
}
