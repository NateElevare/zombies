/** Shared contract for the authored overhead campaign pack. */
export const CAMPAIGN_ART_STYLE = 'reference-pixel-overhead-v2';
export const CAMPAIGN_FRAME_SIZE = 128;
export const NAMED_CAMPAIGN_POSES: Record<string, number> = {
  idle:2, walk:4, run:4, work:4, talk:2, sit:1, sleep:1, hit:2,
  death:4, corpse:1, shoot:2, carry:4, cower:2, injured:2, treat:4,
};
export const RESIDENT_CAMPAIGN_POSES: Record<string, number> = {idle:1, walk:4, work:2, sit:1};
export function campaignFrame(look:string, pose:string, time:number) {
  const poses = look.startsWith('resident') ? RESIDENT_CAMPAIGN_POSES : NAMED_CAMPAIGN_POSES;
  const key = poses[pose] ? pose : 'idle';
  return `${look}_${key}_${Math.floor(time * (key === 'walk' ? 8 : 2)) % poses[key]}`;
}
