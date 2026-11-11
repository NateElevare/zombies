import type { Obstacle } from './math';

export const LAB_WALLS: Obstacle[] = [
  ...[0,1,2].map(i => ({x:-325+i*80,y:-230,w:80,h:12})),
  ...[0,1,2].flatMap(i => [{x:-325,y:-218+i*52,w:12,h:52},{x:-97,y:-218+i*52,w:12,h:52}]),
  {x:-325,y:-62,w:80,h:12},{x:-185,y:-62,w:100,h:12},
];
export const LAB_OBSTACLES: Obstacle[] = [...LAB_WALLS,
  {x:120,y:85,w:155,h:70}, {x:15,y:-190,w:42,h:40},
  {x:-308,y:-212,w:70,h:32}, {x:-145,y:-208,w:40,h:75}, {x:-293,y:-130,w:40,h:30},
];

