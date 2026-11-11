export const CHARACTERS = [
  { id: 'survivor', name: 'Survivor', description: 'Olive field jacket · charcoal beanie' },
  { id: 'scout', name: 'Scout', description: 'Burgundy jacket · dark ponytail' },
  { id: 'responder', name: 'Responder', description: 'Navy workwear · ochre shoulders' },
] as const;
export type CharacterId = typeof CHARACTERS[number]['id'];
export const CHARACTER_STORAGE_KEY = 'deadzone_character';
export function characterId(value: unknown): CharacterId {
  return CHARACTERS.find(c => c.id === value)?.id ?? 'survivor';
}
export function preferredCharacter(): CharacterId {
  try { return characterId(globalThis.localStorage.getItem(CHARACTER_STORAGE_KEY)); }
  catch { return 'survivor'; }
}
export function rememberCharacter(id: CharacterId) {
  try { globalThis.localStorage.setItem(CHARACTER_STORAGE_KEY, characterId(id)); } catch { /* selection still works in memory */ }
}

/** Keep old 2D / 3D builds usable when a skin atlas is unavailable. */
export function characterFrame(base: string, id: unknown, enabled: boolean, has: (name: string) => boolean) {
  const selected = base.replace(/^player_/, `player_${characterId(id)}_`);
  return enabled && has(selected) ? selected : base;
}
