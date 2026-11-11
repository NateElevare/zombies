import type { GameState } from './sim/types';

export const LEGACY_STORY_KEY = 'deadzone_legacy_story';
/** A local presentation preference, deliberately separate from saved progression. */
export function preferredLegacyStory(): boolean {
  try { return globalThis.localStorage.getItem(LEGACY_STORY_KEY) === 'true'; }
  catch { return false; }
}
export function rememberLegacyStory(legacy:boolean) {
  try { globalThis.localStorage.setItem(LEGACY_STORY_KEY,String(legacy)); }
  catch { /* The menu's in-memory choice still works without browser storage. */ }
}
export function isAngledStory(state:Pick<GameState,'mode'|'legacyStory'>) {
  return state.mode==='survival'&&!state.legacyStory;
}
