// Stable public filenames need the same revision for metadata, textures and previews.
// Development gets a fresh revision on reload so regenerating art is visible immediately.
const artVersion = import.meta.env.DEV ? Date.now().toString(36) : import.meta.env.VITE_ART_VERSION;

export function assetUrl(path: string): string {
  return `${path}?v=${encodeURIComponent(artVersion)}`;
}
