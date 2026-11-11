import type { GameState } from './types';
import { toast, sound, emit } from './core';
import { ITEMS } from './items';
import * as inv from './inventory';
import * as base from './base';
import * as augments from './augments';
import { WEAPONS, type WeaponStats } from './combat';
export interface TechCost { sp: number; items: Record<string, number> }
export interface TechEffect { [key: string]: number | boolean | undefined }
export interface TechNode { id: string; name: string; desc: string; tier: number; col: number; row: number; effect: TechEffect; requires: string[]; cost: TechCost }
export interface TechTree { id: string; name: string; icon: string; workbench: boolean; nodes: TechNode[] }
const TREES: TechTree[] = [
  {
    "id": "handgun",
    "name": "Handguns",
    "icon": "P",
    "workbench": true,
    "nodes": [
      {
        "id": "handgun_dmg1",
        "name": "Hot Loads I",
        "desc": "+15% damage.",
        "tier": 1,
        "col": 1,
        "row": 0,
        "effect": {
          "dmg": 0.15
        },
        "requires": [],
        "cost": {
          "sp": 1,
          "items": {}
        }
      },
      {
        "id": "handgun_reload1",
        "name": "Quick Hands",
        "desc": "Reload 20% faster.",
        "tier": 2,
        "col": 0,
        "row": 1,
        "effect": {
          "reload": 0.2
        },
        "requires": [
          "handgun_dmg1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "handgun_stab",
        "name": "Steady Grip",
        "desc": "Spread -30%.",
        "tier": 2,
        "col": 1,
        "row": 1,
        "effect": {
          "spread": 0.3
        },
        "requires": [
          "handgun_dmg1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "handgun_mag1",
        "name": "Extended Mag",
        "desc": "+4 rounds per magazine (+2 revolver).",
        "tier": 2,
        "col": 2,
        "row": 1,
        "effect": {
          "magAdd": 4
        },
        "requires": [
          "handgun_dmg1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "handgun_dmg2",
        "name": "Hot Loads II",
        "desc": "+20% damage.",
        "tier": 2,
        "col": 0,
        "row": 2,
        "effect": {
          "dmg": 0.2
        },
        "requires": [
          "handgun_reload1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "handgun_rate",
        "name": "Trigger Job",
        "desc": "Fire rate +25%.",
        "tier": 3,
        "col": 1,
        "row": 2,
        "effect": {
          "rate": 0.25
        },
        "requires": [
          "handgun_stab"
        ],
        "cost": {
          "sp": 2,
          "items": {
            "gun_parts": 1,
            "scrap": 8
          }
        }
      },
      {
        "id": "handgun_crit",
        "name": "Dead Eye",
        "desc": "12% chance for double damage.",
        "tier": 3,
        "col": 2,
        "row": 2,
        "effect": {
          "crit": 0.12
        },
        "requires": [
          "handgun_mag1"
        ],
        "cost": {
          "sp": 2,
          "items": {
            "gun_parts": 1,
            "scrap": 8
          }
        }
      },
      {
        "id": "handgun_burst",
        "name": "Double Tap",
        "desc": "Each trigger pull fires 2 rounds in quick succession (uses 2 rounds).",
        "tier": 4,
        "col": 0,
        "row": 3,
        "effect": {
          "burst": 2
        },
        "requires": [
          "handgun_dmg2",
          "handgun_rate"
        ],
        "cost": {
          "sp": 3,
          "items": {
            "gun_parts": 2,
            "electronics": 2
          }
        }
      },
      {
        "id": "handgun_pierce",
        "name": "Hollow Points",
        "desc": "Bullets pass through 1 extra zombie and hit 15% harder.",
        "tier": 4,
        "col": 2,
        "row": 3,
        "effect": {
          "pierce": 1,
          "dmg": 0.15
        },
        "requires": [
          "handgun_rate",
          "handgun_crit"
        ],
        "cost": {
          "sp": 3,
          "items": {
            "gun_parts": 2,
            "electronics": 2
          }
        }
      }
    ]
  },
  {
    "id": "smg",
    "name": "SMGs",
    "icon": "S",
    "workbench": true,
    "nodes": [
      {
        "id": "smg_dmg1",
        "name": "Hot Loads I",
        "desc": "+15% damage.",
        "tier": 1,
        "col": 1,
        "row": 0,
        "effect": {
          "dmg": 0.15
        },
        "requires": [],
        "cost": {
          "sp": 1,
          "items": {}
        }
      },
      {
        "id": "smg_stab",
        "name": "Recoil Springs",
        "desc": "Spread -30%.",
        "tier": 2,
        "col": 0,
        "row": 1,
        "effect": {
          "spread": 0.3
        },
        "requires": [
          "smg_dmg1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "smg_reload1",
        "name": "Speed Loader",
        "desc": "Reload 20% faster.",
        "tier": 2,
        "col": 1,
        "row": 1,
        "effect": {
          "reload": 0.2
        },
        "requires": [
          "smg_dmg1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "smg_mag1",
        "name": "Extended Drum",
        "desc": "+15 rounds per magazine.",
        "tier": 2,
        "col": 2,
        "row": 1,
        "effect": {
          "magAdd": 15
        },
        "requires": [
          "smg_dmg1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "smg_dmg2",
        "name": "Hot Loads II",
        "desc": "+20% damage.",
        "tier": 2,
        "col": 0,
        "row": 2,
        "effect": {
          "dmg": 0.2
        },
        "requires": [
          "smg_stab"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "smg_rate",
        "name": "Hair Trigger",
        "desc": "Fire rate +20%.",
        "tier": 3,
        "col": 1,
        "row": 2,
        "effect": {
          "rate": 0.2
        },
        "requires": [
          "smg_reload1"
        ],
        "cost": {
          "sp": 2,
          "items": {
            "gun_parts": 1,
            "scrap": 8
          }
        }
      },
      {
        "id": "smg_mag2",
        "name": "Casket Magazine",
        "desc": "+20 more rounds per magazine.",
        "tier": 3,
        "col": 2,
        "row": 2,
        "effect": {
          "magAdd": 20
        },
        "requires": [
          "smg_mag1"
        ],
        "cost": {
          "sp": 2,
          "items": {
            "gun_parts": 1,
            "scrap": 8
          }
        }
      },
      {
        "id": "smg_ricochet",
        "name": "Ricochet Rounds",
        "desc": "Bullets bounce off walls once.",
        "tier": 4,
        "col": 0,
        "row": 3,
        "effect": {
          "ricochet": 1
        },
        "requires": [
          "smg_dmg2",
          "smg_rate"
        ],
        "cost": {
          "sp": 3,
          "items": {
            "gun_parts": 2,
            "electronics": 2
          }
        }
      },
      {
        "id": "smg_dmg3",
        "name": "Overpressure",
        "desc": "+30% damage, 8% crit chance.",
        "tier": 4,
        "col": 2,
        "row": 3,
        "effect": {
          "dmg": 0.3,
          "crit": 0.08
        },
        "requires": [
          "smg_rate",
          "smg_mag2"
        ],
        "cost": {
          "sp": 3,
          "items": {
            "gun_parts": 2,
            "electronics": 2
          }
        }
      }
    ]
  },
  {
    "id": "shotgun",
    "name": "Shotguns",
    "icon": "G",
    "workbench": true,
    "nodes": [
      {
        "id": "shotgun_dmg1",
        "name": "Heavy Shot I",
        "desc": "+15% damage.",
        "tier": 1,
        "col": 1,
        "row": 0,
        "effect": {
          "dmg": 0.15
        },
        "requires": [],
        "cost": {
          "sp": 1,
          "items": {}
        }
      },
      {
        "id": "shotgun_reload1",
        "name": "Shell Loops",
        "desc": "Reload 20% faster.",
        "tier": 2,
        "col": 0,
        "row": 1,
        "effect": {
          "reload": 0.2
        },
        "requires": [
          "shotgun_dmg1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "shotgun_choke",
        "name": "Tight Choke",
        "desc": "Spread -35%.",
        "tier": 2,
        "col": 1,
        "row": 1,
        "effect": {
          "spread": 0.35
        },
        "requires": [
          "shotgun_dmg1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "shotgun_mag1",
        "name": "Tube Extension",
        "desc": "+2 shells.",
        "tier": 2,
        "col": 2,
        "row": 1,
        "effect": {
          "magAdd": 2
        },
        "requires": [
          "shotgun_dmg1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "shotgun_pellets",
        "name": "Magnum Load",
        "desc": "+2 pellets per shot.",
        "tier": 3,
        "col": 0,
        "row": 2,
        "effect": {
          "pellets": 2
        },
        "requires": [
          "shotgun_reload1"
        ],
        "cost": {
          "sp": 2,
          "items": {
            "gun_parts": 1,
            "scrap": 8
          }
        }
      },
      {
        "id": "shotgun_rate",
        "name": "Pump Action",
        "desc": "Fire rate +25%.",
        "tier": 3,
        "col": 1,
        "row": 2,
        "effect": {
          "rate": 0.25
        },
        "requires": [
          "shotgun_choke"
        ],
        "cost": {
          "sp": 2,
          "items": {
            "gun_parts": 1,
            "scrap": 8
          }
        }
      },
      {
        "id": "shotgun_dmg2",
        "name": "Heavy Shot II",
        "desc": "+25% damage.",
        "tier": 2,
        "col": 2,
        "row": 2,
        "effect": {
          "dmg": 0.25
        },
        "requires": [
          "shotgun_mag1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "shotgun_dragon",
        "name": "Dragon Breath",
        "desc": "Pellets ignite zombies.",
        "tier": 4,
        "col": 0,
        "row": 3,
        "effect": {
          "incendiary": true
        },
        "requires": [
          "shotgun_pellets"
        ],
        "cost": {
          "sp": 3,
          "items": {
            "gun_parts": 2,
            "electronics": 2
          }
        }
      },
      {
        "id": "shotgun_slug",
        "name": "Slug Mode",
        "desc": "Fire a single heavy, tight slug that pierces 1 zombie.",
        "tier": 4,
        "col": 1,
        "row": 3,
        "effect": {
          "slug": true,
          "pierce": 1
        },
        "requires": [
          "shotgun_rate",
          "shotgun_choke"
        ],
        "cost": {
          "sp": 3,
          "items": {
            "gun_parts": 2,
            "electronics": 2
          }
        }
      },
      {
        "id": "shotgun_mag2",
        "name": "Drum Feed",
        "desc": "+4 more shells, reload 15% faster.",
        "tier": 4,
        "col": 2,
        "row": 3,
        "effect": {
          "magAdd": 4,
          "reload": 0.15
        },
        "requires": [
          "shotgun_dmg2"
        ],
        "cost": {
          "sp": 3,
          "items": {
            "gun_parts": 2,
            "electronics": 2
          }
        }
      }
    ]
  },
  {
    "id": "rifle",
    "name": "Rifles",
    "icon": "R",
    "workbench": true,
    "nodes": [
      {
        "id": "rifle_dmg1",
        "name": "Match Grade I",
        "desc": "+15% damage.",
        "tier": 1,
        "col": 1,
        "row": 0,
        "effect": {
          "dmg": 0.15
        },
        "requires": [],
        "cost": {
          "sp": 1,
          "items": {}
        }
      },
      {
        "id": "rifle_reload1",
        "name": "Speed Reload",
        "desc": "Reload 20% faster.",
        "tier": 2,
        "col": 0,
        "row": 1,
        "effect": {
          "reload": 0.2
        },
        "requires": [
          "rifle_dmg1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "rifle_stab",
        "name": "Bipod Stability",
        "desc": "Spread -35%.",
        "tier": 2,
        "col": 1,
        "row": 1,
        "effect": {
          "spread": 0.35
        },
        "requires": [
          "rifle_dmg1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "rifle_mag1",
        "name": "High-Cap Mag",
        "desc": "+10 rounds (assault rifle), +3 (hunting rifle).",
        "tier": 2,
        "col": 2,
        "row": 1,
        "effect": {
          "magAdd": 10,
          "magAddBolt": 3
        },
        "requires": [
          "rifle_dmg1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "rifle_dmg2",
        "name": "Match Grade II",
        "desc": "+25% damage.",
        "tier": 2,
        "col": 0,
        "row": 2,
        "effect": {
          "dmg": 0.25
        },
        "requires": [
          "rifle_reload1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "rifle_rate",
        "name": "Action Tune",
        "desc": "Fire rate +20%.",
        "tier": 3,
        "col": 1,
        "row": 2,
        "effect": {
          "rate": 0.2
        },
        "requires": [
          "rifle_stab"
        ],
        "cost": {
          "sp": 2,
          "items": {
            "gun_parts": 1,
            "scrap": 8
          }
        }
      },
      {
        "id": "rifle_ap",
        "name": "Armor-Piercing",
        "desc": "Bullets pierce 2 extra zombies.",
        "tier": 3,
        "col": 2,
        "row": 2,
        "effect": {
          "pierce": 2
        },
        "requires": [
          "rifle_mag1"
        ],
        "cost": {
          "sp": 2,
          "items": {
            "gun_parts": 1,
            "scrap": 8
          }
        }
      },
      {
        "id": "rifle_explosive",
        "name": "Explosive Rounds",
        "desc": "Bullets detonate on impact (small radius).",
        "tier": 4,
        "col": 0,
        "row": 3,
        "effect": {
          "explosive": 70
        },
        "requires": [
          "rifle_dmg2",
          "rifle_rate"
        ],
        "cost": {
          "sp": 3,
          "items": {
            "gun_parts": 2,
            "electronics": 2
          }
        }
      },
      {
        "id": "rifle_marksman",
        "name": "Marksman",
        "desc": "25% crit chance, +15% damage.",
        "tier": 4,
        "col": 1,
        "row": 3,
        "effect": {
          "crit": 0.25,
          "dmg": 0.15
        },
        "requires": [
          "rifle_rate"
        ],
        "cost": {
          "sp": 3,
          "items": {
            "gun_parts": 2,
            "electronics": 2
          }
        }
      },
      {
        "id": "rifle_dmg3",
        "name": "Match Grade III",
        "desc": "+35% damage.",
        "tier": 4,
        "col": 2,
        "row": 3,
        "effect": {
          "dmg": 0.35
        },
        "requires": [
          "rifle_ap"
        ],
        "cost": {
          "sp": 3,
          "items": {
            "gun_parts": 2,
            "electronics": 2
          }
        }
      }
    ]
  },
  {
    "id": "melee",
    "name": "Melee",
    "icon": "M",
    "workbench": true,
    "nodes": [
      {
        "id": "melee_dmg1",
        "name": "Brute Force I",
        "desc": "+20% melee damage.",
        "tier": 1,
        "col": 1,
        "row": 0,
        "effect": {
          "dmg": 0.2
        },
        "requires": [],
        "cost": {
          "sp": 1,
          "items": {}
        }
      },
      {
        "id": "melee_speed1",
        "name": "Quick Swing",
        "desc": "Swing speed +20%.",
        "tier": 2,
        "col": 0,
        "row": 1,
        "effect": {
          "rate": 0.2
        },
        "requires": [
          "melee_dmg1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "melee_arc1",
        "name": "Wide Swing",
        "desc": "Swing arc +30%.",
        "tier": 2,
        "col": 1,
        "row": 1,
        "effect": {
          "arc": 0.3
        },
        "requires": [
          "melee_dmg1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "melee_knock",
        "name": "Heavy Hands",
        "desc": "Knockback +50%, reach +10%.",
        "tier": 2,
        "col": 2,
        "row": 1,
        "effect": {
          "knock": 0.5,
          "range": 0.1
        },
        "requires": [
          "melee_dmg1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "melee_dmg2",
        "name": "Brute Force II",
        "desc": "+30% melee damage.",
        "tier": 2,
        "col": 0,
        "row": 2,
        "effect": {
          "dmg": 0.3
        },
        "requires": [
          "melee_speed1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "melee_crit",
        "name": "Killing Blow",
        "desc": "15% chance for double damage.",
        "tier": 3,
        "col": 1,
        "row": 2,
        "effect": {
          "crit": 0.15
        },
        "requires": [
          "melee_arc1"
        ],
        "cost": {
          "sp": 2,
          "items": {
            "gun_parts": 1,
            "scrap": 8
          }
        }
      },
      {
        "id": "melee_speed2",
        "name": "Flurry",
        "desc": "Swing speed +25%.",
        "tier": 3,
        "col": 2,
        "row": 2,
        "effect": {
          "rate": 0.25
        },
        "requires": [
          "melee_knock"
        ],
        "cost": {
          "sp": 2,
          "items": {
            "gun_parts": 1,
            "scrap": 8
          }
        }
      },
      {
        "id": "melee_lifesteal",
        "name": "Bloodthirst",
        "desc": "Heal 8% of melee damage dealt.",
        "tier": 4,
        "col": 0,
        "row": 3,
        "effect": {
          "lifesteal": 0.08
        },
        "requires": [
          "melee_dmg2",
          "melee_crit"
        ],
        "cost": {
          "sp": 3,
          "items": {
            "gun_parts": 2,
            "cloth": 4
          }
        }
      },
      {
        "id": "melee_arc2",
        "name": "Whirlwind",
        "desc": "Swing arc +60%, damage +15%.",
        "tier": 4,
        "col": 2,
        "row": 3,
        "effect": {
          "arc": 0.6,
          "dmg": 0.15
        },
        "requires": [
          "melee_crit",
          "melee_speed2"
        ],
        "cost": {
          "sp": 3,
          "items": {
            "gun_parts": 2,
            "electronics": 2
          }
        }
      }
    ]
  },
  {
    "id": "armor",
    "name": "Armor & Defense",
    "icon": "A",
    "workbench": true,
    "nodes": [
      {
        "id": "armor_hp1",
        "name": "Tough I",
        "desc": "+15 max HP.",
        "tier": 1,
        "col": 1,
        "row": 0,
        "effect": {
          "maxHp": 15
        },
        "requires": [],
        "cost": {
          "sp": 1,
          "items": {}
        }
      },
      {
        "id": "armor_eff1",
        "name": "Fitted Plates",
        "desc": "Equipped armor +20% effective.",
        "tier": 2,
        "col": 0,
        "row": 1,
        "effect": {
          "armorMul": 0.2
        },
        "requires": [
          "armor_hp1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "armor_dr1",
        "name": "Padding",
        "desc": "Flat damage reduction 5%.",
        "tier": 2,
        "col": 1,
        "row": 1,
        "effect": {
          "dmgReduction": 0.05
        },
        "requires": [
          "armor_hp1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "armor_bleed1",
        "name": "Clotting",
        "desc": "Bleed resistance +30%.",
        "tier": 2,
        "col": 2,
        "row": 1,
        "effect": {
          "bleedResist": 0.3
        },
        "requires": [
          "armor_hp1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "armor_hp2",
        "name": "Tough II",
        "desc": "+20 max HP.",
        "tier": 2,
        "col": 0,
        "row": 2,
        "effect": {
          "maxHp": 20
        },
        "requires": [
          "armor_eff1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "armor_regen",
        "name": "Second Wind",
        "desc": "Regenerate 1 HP/s after 6s out of combat.",
        "tier": 3,
        "col": 1,
        "row": 2,
        "effect": {
          "regen": 1
        },
        "requires": [
          "armor_dr1"
        ],
        "cost": {
          "sp": 2,
          "items": {
            "gun_parts": 1,
            "scrap": 8
          }
        }
      },
      {
        "id": "armor_thorns",
        "name": "Barbed Wear",
        "desc": "Zombies hitting you take 12 damage.",
        "tier": 3,
        "col": 2,
        "row": 2,
        "effect": {
          "thorns": 12
        },
        "requires": [
          "armor_bleed1"
        ],
        "cost": {
          "sp": 2,
          "items": {
            "gun_parts": 1,
            "scrap": 8
          }
        }
      },
      {
        "id": "armor_eff2",
        "name": "Reinforced",
        "desc": "Equipped armor +35% effective.",
        "tier": 3,
        "col": 0,
        "row": 3,
        "effect": {
          "armorMul": 0.35
        },
        "requires": [
          "armor_hp2"
        ],
        "cost": {
          "sp": 2,
          "items": {
            "gun_parts": 1,
            "scrap": 8
          }
        }
      },
      {
        "id": "armor_dr2",
        "name": "Juggernaut",
        "desc": "Damage reduction +10%, +25 max HP.",
        "tier": 4,
        "col": 1,
        "row": 3,
        "effect": {
          "dmgReduction": 0.1,
          "maxHp": 25
        },
        "requires": [
          "armor_regen",
          "armor_eff2"
        ],
        "cost": {
          "sp": 3,
          "items": {
            "gun_parts": 2,
            "electronics": 2
          }
        }
      },
      {
        "id": "armor_regen2",
        "name": "Adrenal Gland",
        "desc": "Regen +1.5 HP/s, bleed resistance +40%.",
        "tier": 4,
        "col": 2,
        "row": 3,
        "effect": {
          "regen": 1.5,
          "bleedResist": 0.4
        },
        "requires": [
          "armor_regen",
          "armor_thorns"
        ],
        "cost": {
          "sp": 3,
          "items": {
            "gun_parts": 2,
            "electronics": 2
          }
        }
      }
    ]
  },
  {
    "id": "survival",
    "name": "Survival",
    "icon": "V",
    "workbench": false,
    "nodes": [
      {
        "id": "survival_pack1",
        "name": "Pack Rat I",
        "desc": "+2 inventory slots.",
        "tier": 1,
        "col": 1,
        "row": 0,
        "effect": {
          "invSlots": 2
        },
        "requires": [],
        "cost": {
          "sp": 1,
          "items": {}
        }
      },
      {
        "id": "survival_stam1",
        "name": "Lungs",
        "desc": "+25 max stamina.",
        "tier": 1,
        "col": 0,
        "row": 1,
        "effect": {
          "maxStamina": 25
        },
        "requires": [
          "survival_pack1"
        ],
        "cost": {
          "sp": 1,
          "items": {}
        }
      },
      {
        "id": "survival_hunger1",
        "name": "Efficient Metabolism",
        "desc": "Hunger and thirst 20% slower.",
        "tier": 1,
        "col": 1,
        "row": 1,
        "effect": {
          "hungerMult": 0.2
        },
        "requires": [
          "survival_pack1"
        ],
        "cost": {
          "sp": 1,
          "items": {}
        }
      },
      {
        "id": "survival_search1",
        "name": "Quick Fingers",
        "desc": "Search 25% faster.",
        "tier": 1,
        "col": 2,
        "row": 1,
        "effect": {
          "searchMult": 0.25
        },
        "requires": [
          "survival_pack1"
        ],
        "cost": {
          "sp": 1,
          "items": {}
        }
      },
      {
        "id": "survival_stam2",
        "name": "Second Lungs",
        "desc": "Stamina regenerates 40% faster, +25 max stamina.",
        "tier": 2,
        "col": 0,
        "row": 2,
        "effect": {
          "maxStamina": 25,
          "staminaRegen": 0.4
        },
        "requires": [
          "survival_stam1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "survival_pack2",
        "name": "Pack Rat II",
        "desc": "+4 inventory slots.",
        "tier": 2,
        "col": 1,
        "row": 2,
        "effect": {
          "invSlots": 4
        },
        "requires": [
          "survival_hunger1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "survival_luck1",
        "name": "Scavenger",
        "desc": "Better loot luck, search 10% faster.",
        "tier": 2,
        "col": 2,
        "row": 2,
        "effect": {
          "lootLuck": 0.25,
          "searchMult": 0.1
        },
        "requires": [
          "survival_search1"
        ],
        "cost": {
          "sp": 1,
          "items": {
            "scrap": 6
          }
        }
      },
      {
        "id": "survival_sneak",
        "name": "Soft Steps",
        "desc": "Your noise radius is 30% smaller.",
        "tier": 3,
        "col": 0,
        "row": 3,
        "effect": {
          "noise": 0.3
        },
        "requires": [
          "survival_stam2"
        ],
        "cost": {
          "sp": 2,
          "items": {
            "gun_parts": 1,
            "scrap": 8
          }
        }
      },
      {
        "id": "survival_hunger2",
        "name": "Camel",
        "desc": "Hunger/thirst 25% slower, +5% move speed.",
        "tier": 3,
        "col": 1,
        "row": 3,
        "effect": {
          "hungerMult": 0.25,
          "speed": 0.05
        },
        "requires": [
          "survival_pack2"
        ],
        "cost": {
          "sp": 2,
          "items": {
            "gun_parts": 1,
            "scrap": 8
          }
        }
      },
      {
        "id": "survival_luck2",
        "name": "Lucky Find",
        "desc": "Much better loot luck, search 15% faster.",
        "tier": 3,
        "col": 2,
        "row": 3,
        "effect": {
          "lootLuck": 0.5,
          "searchMult": 0.15
        },
        "requires": [
          "survival_luck1"
        ],
        "cost": {
          "sp": 2,
          "items": {
            "gun_parts": 1,
            "scrap": 8
          }
        }
      }
    ]
  },
  // The Hive Below: the insect weapons (combat.ts WEAPONS with tree: 'hive') have a tree of their own, shown only in that story.
  {
    "id": "hive",
    "name": "Hive Weapons",
    "icon": "H",
    "workbench": false,
    "nodes": [
      {
        "id": "hive_dmg1",
        "name": "Ripe Ichor I",
        "desc": "+15% damage with insect weapons.",
        "tier": 1,
        "col": 1,
        "row": 0,
        "effect": {
          "dmg": 0.15
        },
        "requires": [],
        "cost": {
          "sp": 1,
          "items": {}
        }
      },
      {
        "id": "hive_tank",
        "name": "Swollen Tank",
        "desc": "Formic Sprayer: +30 to a tank.",
        "tier": 2,
        "col": 0,
        "row": 1,
        "effect": {
          "magAdd": 30
        },
        "requires": [
          "hive_dmg1"
        ],
        "cost": {
          "sp": 1,
          "items": {}
        }
      },
      {
        "id": "hive_corrode1",
        "name": "Stronger Acid",
        "desc": "Corrosion burns 50% harder.",
        "tier": 2,
        "col": 1,
        "row": 1,
        "effect": {
          "corrodeDmg": 0.5
        },
        "requires": [
          "hive_dmg1"
        ],
        "cost": {
          "sp": 1,
          "items": {}
        }
      },
      {
        "id": "hive_reach",
        "name": "Longer Jaws",
        "desc": "Mandible Shears: reach +15%, arc +25%.",
        "tier": 2,
        "col": 2,
        "row": 1,
        "effect": {
          "range": 0.15,
          "arc": 0.25
        },
        "requires": [
          "hive_dmg1"
        ],
        "cost": {
          "sp": 1,
          "items": {}
        }
      },
      {
        "id": "hive_dmg2",
        "name": "Ripe Ichor II",
        "desc": "+20% damage with insect weapons.",
        "tier": 2,
        "col": 0,
        "row": 2,
        "effect": {
          "dmg": 0.2
        },
        "requires": [
          "hive_tank"
        ],
        "cost": {
          "sp": 1,
          "items": {}
        }
      },
      {
        "id": "hive_corrode2",
        "name": "Deep Burn",
        "desc": "Corrosion stacks 3 higher and lasts 2 seconds longer.",
        "tier": 3,
        "col": 1,
        "row": 2,
        "effect": {
          "corrodeMax": 3,
          "corrodeTime": 2
        },
        "requires": [
          "hive_corrode1"
        ],
        "cost": {
          "sp": 2,
          "items": {}
        }
      },
      {
        "id": "hive_cleave",
        "name": "Clean Through",
        "desc": "Mandible Shears: a kill cuts through to 2 more bugs, and knockback +50%.",
        "tier": 3,
        "col": 2,
        "row": 2,
        "effect": {
          "cleave": 2,
          "knock": 0.5
        },
        "requires": [
          "hive_reach"
        ],
        "cost": {
          "sp": 2,
          "items": {}
        }
      },
      {
        "id": "hive_harvest",
        "name": "Harvester",
        "desc": "Bugs drop ichor twice as often. Burrows and egg clusters give half again as much.",
        "tier": 4,
        "col": 0,
        "row": 3,
        "effect": {
          "ichorDrop": 1
        },
        "requires": [
          "hive_dmg2",
          "hive_corrode2"
        ],
        "cost": {
          "sp": 3,
          "items": {}
        }
      },
      {
        "id": "hive_venom",
        "name": "Queen's Venom",
        "desc": "+25% damage and a 10% chance of double damage with insect weapons.",
        "tier": 4,
        "col": 2,
        "row": 3,
        "effect": {
          "dmg": 0.25,
          "crit": 0.1
        },
        "requires": [
          "hive_corrode2",
          "hive_cleave"
        ],
        "cost": {
          "sp": 3,
          "items": {}
        }
      }
    ]
  }
];
const NODES: Record<string, TechNode> = Object.fromEntries(TREES.flatMap(t => t.nodes.map(n => [n.id,n])));
const TREE_OF: Record<string, TechTree> = Object.fromEntries(TREES.flatMap(t => t.nodes.map(n => [n.id,t])));
export const TECH = { trees: TREES, nodes: NODES };
  function techOf(state: GameState) { return (state && state.player && state.player.tech) || {}; }
  /** Sum of one effect over every unlocked perk, for effects read outside weaponStats and playerMods (corrosion, ichor). */
  export function perkSum(state: GameState, key: string) {
    const tech = techOf(state); let v = 0;
    for (const tr of TREES) for (const n of tr.nodes) if (tech[n.id] && n.effect[key]) v += Number(n.effect[key]);
    return v;
  }
  /** The Hive Weapons tree belongs to The Hive Below: the other modes never see it. */
  const showsHiveTree = (state: GameState) => state.road?.story === 'hive-below';


  // XP needed to go from level l to l+1. player.xp is progress within the current level.
  export function xpForLevel(l: number) { return Math.round(100 * Math.pow(l, 1.5)); };

  export function addXP(state: GameState, n: number) {
    const p = state && state.player;
    if (!p || !(n > 0)) return;
    p.xp = (p.xp || 0) + n;
    if (!p.level) p.level = 1;
    let leveled = false;
    while (p.xp >= xpForLevel(p.level)) {
      p.xp -= xpForLevel(p.level);
      p.level++;
      const bonus = p.level % 5 === 0 ? 1 : 0;
      p.sp = (p.sp || 0) + 1 + bonus;
      leveled = true;
      emit(state, { t: 'levelUp', level: p.level });
      toast(state, 'LEVEL UP! Level ' + p.level + ' - skill point gained' + (bonus ? ' (+1 bonus)' : ''), '#ffd36b');
    }
    if (leveled) sound(state, 'levelUp');
  };

  /** Material costs apply to the open-world campaign; The Long Road spends skill points only (no crafting, no workbench). */
  export function itemCost(state: GameState, node: TechNode): Record<string, number> { return state.mode === 'survival' ? node.cost.items : {}; }
  /** Arcade uses banked cores for permanent skills; story keeps its own SP economy. */
  export const coreCost = (node: TechNode) => [0,25,45,85,150][node.tier] ?? 150;
  export const skillBalance = (state: GameState) => state.mode === 'arcade' ? augments.load().cores : state.player.sp || 0;
  export const skillCost = (state: GameState, node: TechNode) => state.mode === 'arcade' ? coreCost(node) : node.cost.sp;
  /** Perks that do nothing in The Long Road (no hunger, no searching, no loot luck, no bleeding): hidden there, and
   *  anything that required them requires their parents instead. */
  const ROAD_HIDDEN = new Set(['survival_hunger1', 'survival_hunger2', 'survival_search1', 'survival_luck1', 'survival_luck2', 'armor_bleed1']);
  const ARCADE_HIDDEN = new Set([...ROAD_HIDDEN, 'survival_stam1', 'survival_stam2', 'survival_sneak', 'armor_eff1', 'armor_eff2']);
  export const hiddenIn = (state: GameState, id: string) => state.mode === 'road' ? ROAD_HIDDEN.has(id) : state.mode === 'arcade' && ARCADE_HIDDEN.has(id);
  export function restoreArcadeSkills(state: GameState) {
    if (state.mode !== 'arcade') return;
    const saved = augments.load().tech || {}, tech: Record<string,true> = {};
    // Accept only supported skills with their prerequisite chain intact.
    for (let pass=0;pass<10;pass++) for (const node of Object.values(NODES)) {
      if (saved[node.id] && !hiddenIn(state,node.id) && requiresFor(state,node).every(id=>tech[id])) tech[node.id]=true;
    }
    state.player.tech=tech;
  }
  export function requiresFor(state: GameState, node: TechNode): string[] {
    const out: string[] = [];
    const walk = (ids: string[]) => { for (const id of ids) { if (hiddenIn(state, id)) walk(NODES[id]?.requires ?? []); else if (!out.includes(id)) out.push(id); } };
    walk(node.requires);
    return out;
  }
  const treeCache = new Map<string, TechTree[]>();
  /** The trees as this mode shows them (hidden perks removed, prerequisites rewired). */
  export function treesFor(state: GameState): TechTree[] {
    const hive = showsHiveTree(state), key = state.mode + (hive ? ':hive' : '');
    let trees = treeCache.get(key);
    if (!trees) {
      trees = TREES.filter(t => t.id !== 'hive' || hive).map(t => ({ ...t, nodes: t.nodes.filter(n => !hiddenIn(state, n.id)).map(n => ({ ...n, requires: requiresFor(state, n) })) }));
      treeCache.set(key, trees);
    }
    return trees;
  }
  export function canUnlock(state: GameState, nodeId: string) {
    const p = state && state.player, node = NODES[nodeId];
    if (!p || !node) return { ok: false, reason: 'Unknown node' };
    if (TREE_OF[nodeId].id === 'hive' && !showsHiveTree(state)) return { ok: false, reason: 'Only in The Hive Below' };
    if (hiddenIn(state, nodeId)) return { ok: false, reason: 'Not available in this mode' };
    if (p.tech && p.tech[nodeId] || state.mode === 'arcade' && augments.load().tech?.[nodeId]) return { ok: false, reason: 'Already unlocked' };
    for (const r of requiresFor(state, node)) {
      if (!(p.tech && p.tech[r])) return { ok: false, reason: 'Requires ' + (NODES[r] ? NODES[r].name : r) };
    }
    if (skillBalance(state) < skillCost(state,node)) return { ok: false, reason: 'Need ' + skillCost(state,node) + (state.mode === 'arcade' ? ' banked cores' : ' skill point' + (node.cost.sp > 1 ? 's' : '')) };
    for (const id in itemCost(state, node)) {
      const have = p.inv ? inv.count(p.inv, id) : 0;
      if (have < node.cost.items[id]) return { ok: false, reason: 'Need ' + node.cost.items[id] + ' ' + id.replace(/_/g, ' ') + ' (have ' + have + ')' };
    }
    if (TREE_OF[nodeId].workbench && state.mode === 'survival' && base && base.nearStation && !base.nearStation(state, 'workbench')) {
      return { ok: false, reason: 'Must be near a workbench' };
    }
    return { ok: true, reason: '' };
  };

  export function unlock(state: GameState, nodeId: string) {
    const c = canUnlock(state, nodeId);
    if (!c.ok) { toast(state, c.reason, '#ff7a6b'); return false; }
    const p = state.player, node = NODES[nodeId];
    if (state.mode === 'arcade') {
      const m=augments.load();
      m.cores-=coreCost(node); m.tech={...m.tech,[nodeId]:true};
      if (!augments.save(m)) { toast(state,'Upgrade not purchased: storage could not save it.','#ff7a6b'); return false; }
    }
    const items = itemCost(state, node);
    for (const id in items) inv.remove(p.inv, id, items[id]);
    if (state.mode !== 'arcade') p.sp -= node.cost.sp;
    p.tech = p.tech || {};
    p.tech[nodeId] = true;
    sync(state);
    if (inv && inv.recalcSize) inv.recalcSize(state);
    toast(state, 'Unlocked: ' + node.name, '#9be37a');
    sound(state, 'craft');
    emit(state, { t: 'techUnlocked', id: nodeId });
    return true;
  };

  // Push derived maxHp / maxStamina onto the player (heals by the increase). Cheap; safe to call often.
  export function sync(state: GameState) {
    const p = state && state.player;
    if (!p) return;
    const m = playerMods(state);
    if (p.maxHp !== m.maxHp) {
      const d = m.maxHp - (p.maxHp || m.maxHp);
      p.maxHp = m.maxHp;
      p.hp = d > 0 ? Math.min(p.maxHp, (p.hp || 0) + d) : Math.min(p.hp, p.maxHp);
    }
    if (p.maxStamina !== m.maxStamina) {
      const d = m.maxStamina - (p.maxStamina || m.maxStamina);
      p.maxStamina = m.maxStamina;
      p.stamina = d > 0 ? Math.min(p.maxStamina, (p.stamina || 0) + d) : Math.min(p.stamina, p.maxStamina);
    }
  };

  /** `lvl` is the weapon's gear upgrade level (Stack.lvl, 1..5). */
  export function weaponStats(state: GameState, weaponId: string, lvl: number = 1) {
    const W = WEAPONS || {};
    const base = W[weaponId] || W.unarmed || {};
    const s = Object.assign({}, base) as WeaponStats;
    if (base.melee) s.melee = Object.assign({}, base.melee);
    s.id = weaponId;
    s.pierce = base.pierce || 0; s.ricochet = 0; s.burst = 0; s.explosive = base.explosive || 0; s.incendiary = !!base.incendiary;
    s.crit = 0; s.critMul = 2; s.lifesteal = base.lifesteal || 0; s.slug = false;
    const a = state.mode === 'arcade' ? state.arcade?.run?.aug : undefined;
    if (a) {
      s.crit += a.crit || 0;
      s.bulletSpeed *= 1 + (a.velocity || 0);
    }
    const tr = TREES.find((x) => x.id === base.class), also = base.tree && base.tree !== base.class ? TREES.find((x) => x.id === base.tree) : undefined;   // insect weapons take the Hive Weapons tree on top of the tree of their class
    const up = Math.max(0, Math.min(4, Math.floor(Number(lvl) || 1) - 1));
    if (!tr) { if (up) { s.damage = base.damage * (1 + 0.12 * up); s.fireRate = base.fireRate / (1 + 0.04 * up); s.reloadTime = base.reloadTime * (1 - 0.05 * up); } return s; }
    const tech = techOf(state);
    let dmg = 0.12 * up, rate = 0.04 * up, reload = 0.05 * up, spread = a?.stability || 0, magAdd = a?.magazine && base.magSize ? Math.max(Math.round(a.magazine*10),Math.round(base.magSize*a.magazine)) : 0, pellets = 0, arc = 0, knock = a?.knock || 0, range = 0;
    for (const n of also ? [...tr.nodes, ...also.nodes] : tr.nodes) {
      if (!tech[n.id]) continue;
      const e = n.effect as Record<string, number>;
      dmg += e.dmg || 0; rate += e.rate || 0; reload += e.reload || 0; spread += e.spread || 0;
      if (e.magAdd) {
        if (weaponId === 'hunting_rifle' && e.magAddBolt !== undefined) magAdd += e.magAddBolt;
        else if (weaponId === 'revolver') magAdd += Math.ceil(e.magAdd / 2);
        else magAdd += e.magAdd;
      }
      pellets += e.pellets || 0; arc += e.arc || 0; knock += e.knock || 0; range += e.range || 0;
      s.pierce += e.pierce || 0; s.ricochet += e.ricochet || 0; s.burst = Math.max(s.burst, e.burst || 0);
      s.explosive = Math.max(s.explosive, e.explosive || 0);
      if (e.incendiary) s.incendiary = true;
      s.crit += e.crit || 0; s.lifesteal += e.lifesteal || 0;
      if (e.slug) s.slug = true;
      if (e.cleave && s.cleave) s.cleave += e.cleave;
    }
    s.damage = base.damage * (1 + dmg);
    s.fireRate = base.fireRate / (1 + rate);
    s.reloadTime = base.reloadTime * Math.max(0.35, 1 - reload);
    s.spread = base.spread * Math.max(0.1, 1 - spread);
    s.magSize = base.magSize ? base.magSize + magAdd : 0;
    s.pellets = (base.pellets || 1) + pellets;
    if (s.slug && base.class === 'shotgun') {
      s.damage = s.damage * (base.pellets || 1) * 0.75;
      s.pellets = 1; s.spread = base.spread * 0.2; s.range = base.range * 1.6; s.bulletSpeed = base.bulletSpeed * 1.4 * (1+(a?.velocity||0));
    } else s.slug = false;
    s.crit = Math.min(0.75, s.crit);
    if (base.melee) {
      s.melee!.arc = base.melee.arc * (1 + arc);
      s.melee!.knock = base.melee.knock * (1 + knock);
      s.melee!.range = base.melee.range * (1 + range);
    }
    if (base.melee || s.burst < 2) s.burst = 0;
    return s;
  };

  export function playerMods(state: GameState) {
    const p = state && state.player, tech = techOf(state);
    const sum = (k: string) => {
      let v = 0;
      for (const tr of TREES) for (const n of tr.nodes) if (tech[n.id] && n.effect[k]) v += Number(n.effect[k]);
      return v;
    };
    let armor = 0;
    if (p && p.inv && p.inv.equip && ITEMS) {
      for (const slot of ['head', 'body'] as const) {
        const st = p.inv.equip[slot];
        if (st && ITEMS[st.id] && ITEMS[st.id].armor) armor += inv.gearArmor(st);
      }
    }
    armor = Math.min(0.75, armor * (1 + sum('armorMul')));
    const inCombat = !!p && (p.combatTimer || 0) > 0;
    const run=state.mode==='arcade'?state.arcade?.run:undefined;
    const arcadeHp=(run?.aug?.hp||0)+20*(run?.passives.find(q=>q.id==='kevlar')?.level||0);
    return {
      maxHp: 100 + sum('maxHp') + arcadeHp,
      armor,
      dmgReduction: Math.min(0.5, sum('dmgReduction')),
      regen: inCombat ? 0 : sum('regen'),
      speedMult: (1 + sum('speed')) * (p && p.hp < p.maxHp*.35 ? 1+(run?.aug?.escape||0) : 1),
      maxStamina: 100 + sum('maxStamina'),
      staminaRegenMult: 1 + sum('staminaRegen'),
      hungerMult: Math.max(0.3, 1 - sum('hungerMult')),
      searchMult: Math.max(0.3, 1 - sum('searchMult')),
      lootLuck: sum('lootLuck'),
      invSlots: sum('invSlots'),
      noiseMult: Math.max(0.3, 1 - sum('noise')),
      thorns: sum('thorns'),
      bleedResist: Math.min(0.9, sum('bleedResist')),
    };
  };
