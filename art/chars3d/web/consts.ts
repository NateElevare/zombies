// art/chars3d/web/consts.ts — shared by the browser renderer and the node generator (no DOM / three imports).
/** camera height (m): straight down, narrow FOV => slight perspective (heads ~14% larger than feet) */
export const CAM_H = 12;
/** texture px per meter at ground level (ART_SCALE 2 => ~60 world px per meter). Characters are drawn ~15% larger
 * than true scale against the 2D world so they keep the presence the old 1.3x-scaled 2D figures had. */
export const PPM0 = 121;
/** weapons render orthographically at this height (m) */
export const WEAPON_Z = 1.3;
export const PPM_WEAPON = PPM0 * CAM_H / (CAM_H - WEAPON_Z);
