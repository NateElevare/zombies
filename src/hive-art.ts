/** The Hive Below authored overhead art contract. All creatures face +X. */
export const HIVE_ENEMY_SEQUENCES = {
  walk:{start:0,count:8,rate:12},attack:{start:8,count:6,rate:12},
  hit:{start:14,count:2,rate:8},death:{start:16,count:8,rate:10},
  corpse:{start:24,count:1,rate:1},special:{start:25,count:4,rate:8},
} as const;
export const HIVE_BOSS_SEQUENCES = {
  idle:{start:0,count:2,rate:3},walk:{start:2,count:4,rate:7},
  melee:{start:6,count:2,rate:8},windup:{start:8,count:2,rate:6},
  special:{start:10,count:2,rate:8},hit:{start:12,count:1,rate:1},death:{start:13,count:3,rate:6},
} as const;
export const HIVE_QUEEN_COURT_SEQUENCES = {
  idle:{start:0,count:4,rate:4},lay:{start:4,count:2,rate:5},
  lob:{start:6,count:2,rate:5},slam:{start:8,count:2,rate:6},
  command:{start:10,count:2,rate:5},hit:{start:12,count:1,rate:1},
  tear:{start:13,count:2,rate:4},sac:{start:15,count:1,rate:1},
} as const;
