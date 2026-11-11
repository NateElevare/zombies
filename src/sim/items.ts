import type { ItemType, Rarity, EquipKey, Stack } from './types';
export type { ItemType, Rarity } from './types';
export interface ItemDef { id: string; name: string; type: ItemType; rarity: Rarity; color: string; glyph: string; desc: string; stack: number;
  /** borrow another item's art (sprites + icon) until this one gets its own */ look?: string; slot?: EquipKey; armor?: number; weightless?: boolean; slots?: number; use?: { heal?: number; food?: number; water?: number; stamina?: number; stopBleed?: boolean; /** seconds of +20% damage (royal jelly) */ boost?: number; time: number } }
export interface Recipe { id: string; name: string; out: Stack; in: Record<string, number>; station: string | null; time: number }
// Data ported verbatim from legacy/js/sv/sv-items.js.
export const RARITY_COLORS: Record<Rarity, string> = {
  "common": "#bfc5ba",
  "uncommon": "#79bd73",
  "rare": "#70a9df",
  "epic": "#c48ae0",
  "legendary": "#ffb43a"
};
/** Item id whose art (in-hand sprite, icon) this item uses. */
export const lookOf = (id: string) => (Object.hasOwn(ITEMS, id) && ITEMS[id].look) || id;
// Ammunition and healing items stack three times as high as they first did (2026-11-11): a long story fills a backpack.
export const ITEMS: Record<string, ItemDef> = {
  // ---- The Hive Below
  "formic_sprayer": {
    "id": "formic_sprayer", "name": "Formic Sprayer", "type": "weapon", "rarity": "epic", "color": "#c48ae0", "glyph": "FRM",
    "desc": "Hive weapon (ant). A stream of formic acid out to 240 px that passes through the first bug. Every hit adds a stack of corrosion that keeps burning. Runs on ichor: 80 to a tank.",
    "stack": 1, "slot": "primary"
  },
  "mandible_shears": {
    "id": "mandible_shears", "name": "Mandible Shears", "type": "weapon", "rarity": "legendary", "color": "#ffb43a", "glyph": "SHR",
    "desc": "Boss trophy (The Marshal). A heavy snap in a narrow arc. A kill cuts through to two more bugs behind it.",
    "stack": 1, "slot": "melee"
  },
  "locust_repeater": {
    "id": "locust_repeater", "name": "Locust Repeater", "type": "weapon", "rarity": "legendary", "color": "#ffb43a", "glyph": "LCR",
    "desc": "Boss trophy (Famine). Fast automatic. Every hit hops on to two more bugs within 140 px at 60% damage. Runs on ichor: 40 to a drum.",
    "stack": 1, "slot": "primary"
  },
  "needler": {
    "id": "needler", "name": "Needler", "type": "weapon", "rarity": "epic", "color": "#c48ae0", "glyph": "NDL",
    "desc": "Hive weapon (wasp). A rifle whose needle passes through three bugs and poisons each one: 30 damage over 4 seconds. 4 ichor a needle, 8 to a magazine.",
    "stack": 1, "slot": "primary"
  },
  "vespiary": {
    "id": "vespiary", "name": "The Vespiary", "type": "weapon", "rarity": "legendary", "color": "#ffb43a", "glyph": "VSP",
    "desc": "Boss trophy (Matriarch Vespa). Fires hornets that steer at the nearest bug. Needs no ammunition and never reloads: it holds 24 and breeds its own, 2 a second holstered, 1 a second in your hand once you stop firing.",
    "stack": 1, "slot": "secondary"
  },
  "bombardier": {
    "id": "bombardier", "name": "Bombardier", "type": "weapon", "rarity": "epic", "color": "#c48ae0", "glyph": "BMB",
    "desc": "Hive weapon (bombardier beetle). A short cone of boiling spray out to 260 px. Sets bugs alight and shoves them back. 8 ichor a shot, 5 shots.",
    "stack": 1, "slot": "primary"
  },
  "hornbreaker": {
    "id": "hornbreaker", "name": "Hornbreaker", "type": "weapon", "rarity": "legendary", "color": "#ffb43a", "glyph": "HRN",
    "desc": "Boss trophy (Goliath). A slow hammer. Every swing sends a shock line 300 px forward that knocks a column flat.",
    "stack": 1, "slot": "melee"
  },
  "lure_lantern": {
    "id": "lure_lantern", "name": "Lure Lantern", "type": "weapon", "rarity": "epic", "color": "#c48ae0", "glyph": "LUR",
    "desc": "Hive weapon (firefly). Lobs a glowing lure: every ordinary bug within 500 px goes for it for 6 seconds, then it bursts for 120 damage. 15 ichor a lure, carries 6.",
    "stack": 1, "slot": "secondary"
  },
  "mantis_scythes": {
    "id": "mantis_scythes", "name": "Mantis Scythes", "type": "weapon", "rarity": "legendary", "color": "#ffb43a", "glyph": "SCY",
    "desc": "Boss trophy (The Prioress). Fast twin blades with a wide arc. Each swing steps you forward. Double damage from behind, and a little health back per hit.",
    "stack": 1, "slot": "melee"
  },
  "carrion_hive": {
    "id": "carrion_hive", "name": "Carrion Hive", "type": "weapon", "rarity": "legendary", "color": "#ffb43a", "glyph": "CRN",
    "desc": "Boss trophy (The Carrion Lord). Lobs a pod: a cloud of flies hangs for 6 seconds and does 25 damage a second, and any bug that dies inside it bursts. 25 ichor a pod, 3 pods.",
    "stack": 1, "slot": "primary"
  },
  "queens_decree": {
    "id": "queens_decree", "name": "Queen's Decree", "type": "weapon", "rarity": "legendary", "color": "#ffb43a", "glyph": "QDC",
    "desc": "Boss trophy (The Queen). Fires a pheromone dart: the swarm turns on the marked bug for 6 seconds. A marked boss takes 25% more damage instead. 10 ichor a dart.",
    "stack": 1, "slot": "secondary"
  },
  "carapace_vest": {
    "id": "carapace_vest", "name": "Carapace Vest", "type": "armor", "rarity": "legendary", "color": "#ffb43a", "glyph": "CV",
    "desc": "Body armour cut from a Shieldback. Reduces incoming damage by 33% before upgrades.",
    "stack": 1, "slot": "body", "armor": 0.33, "weightless": false
  },
  "ichor": {
    "id": "ichor", "name": "Ichor", "type": "ammo", "rarity": "uncommon", "color": "#79bd73", "glyph": "ICH",
    "desc": "What the hive's dead run on. Ammunition for every insect gun. Anything with six legs can drop it.",
    "stack": 1200
  },
  "royal_jelly": {
    "id": "royal_jelly", "name": "Royal Jelly", "type": "consumable", "rarity": "rare", "color": "#70a9df", "glyph": "RJ",
    "desc": "Restores 50 health and adds 20% damage for 10 seconds.",
    "stack": 30, "use": { "heal": 50, "boost": 10, "time": 1.5 }
  },
  "butcher_cleaver": {
    "id": "butcher_cleaver", "name": "Butcher's Cleaver", "type": "weapon", "rarity": "legendary", "color": "#ffb43a", "glyph": "CLV",
    "desc": "Boss trophy (The Butcher). A slab of sharpened steel: huge hits, wide arcs, and every wound it opens heals you a little.",
    "stack": 1, "slot": "melee", "look": "machete"
  },
  "brood_scattergun": {
    "id": "brood_scattergun", "name": "Brood Scattergun", "type": "weapon", "rarity": "legendary", "color": "#ffb43a", "glyph": "BRD",
    "desc": "Boss trophy (Brood Mother). Ten-pellet incendiary shells that set whole crowds alight. Holds 8.",
    "stack": 1, "slot": "primary", "look": "shotgun"
  },
  "banshee_smg": {
    "id": "banshee_smg", "name": "Banshee", "type": "weapon", "rarity": "legendary", "color": "#ffb43a", "glyph": "BNS",
    "desc": "Boss trophy (The Howler). Screaming-fast SMG whose rounds punch through the first zombie. 45-round drum.",
    "stack": 1, "slot": "primary", "look": "smg"
  },
  "rockbreaker": {
    "id": "rockbreaker", "name": "Rockbreaker", "type": "weapon", "rarity": "legendary", "color": "#ffb43a", "glyph": "RKB",
    "desc": "Boss trophy (Juggernaut). A rifle that fires exploding rounds through two zombies at once.",
    "stack": 1, "slot": "primary", "look": "hunting_rifle"
  },
  "cola_mints": {
    "id": "cola_mints",
    "name": "Cola & Mints",
    "type": "weapon",
    "rarity": "legendary",
    "color": "#ffb43a",
    "glyph": "FIZZ",
    "desc": "Boss trophy (Plague Lord). Shake, drop a mint in, aim. Sprays sticky cola foam that eats into zombies and slows them to a crawl. Short range; pierces.",
    "stack": 1,
    "slot": "primary"
  },
  "mints": {
    "id": "mints",
    "name": "Mints",
    "type": "ammo",
    "rarity": "uncommon",
    "color": "#79bd73",
    "glyph": "MNT",
    "desc": "One mint refills the Cola & Mints with a full blast.",
    "stack": 120
  },
  "pistol": {
    "id": "pistol",
    "name": "9mm Pistol",
    "type": "weapon",
    "rarity": "common",
    "color": "#bfc5ba",
    "glyph": "P",
    "desc": "Reliable sidearm using 9mm ammunition.",
    "stack": 1,
    "slot": "secondary"
  },
  "revolver": {
    "id": "revolver",
    "name": ".357 Revolver",
    "type": "weapon",
    "rarity": "uncommon",
    "color": "#79bd73",
    "glyph": "REV",
    "desc": "Hard-hitting six-shooter.",
    "stack": 1,
    "slot": "secondary"
  },
  "smg": {
    "id": "smg",
    "name": "Submachine Gun",
    "type": "weapon",
    "rarity": "rare",
    "color": "#70a9df",
    "glyph": "SMG",
    "desc": "Rapid automatic fire using 9mm ammunition.",
    "stack": 1,
    "slot": "primary"
  },
  "shotgun": {
    "id": "shotgun",
    "name": "Pump Shotgun",
    "type": "weapon",
    "rarity": "uncommon",
    "color": "#79bd73",
    "glyph": "SG",
    "desc": "Devastating spread at close range.",
    "stack": 1,
    "slot": "primary"
  },
  "assault_rifle": {
    "id": "assault_rifle",
    "name": "Assault Rifle",
    "type": "weapon",
    "rarity": "epic",
    "color": "#c48ae0",
    "glyph": "AR",
    "desc": "Automatic rifle chambered in 5.56mm.",
    "stack": 1,
    "slot": "primary"
  },
  "hunting_rifle": {
    "id": "hunting_rifle",
    "name": "Hunting Rifle",
    "type": "weapon",
    "rarity": "rare",
    "color": "#70a9df",
    "glyph": "HR",
    "desc": "Accurate long-range rifle using .308 rounds.",
    "stack": 1,
    "slot": "primary"
  },
  "knife": {
    "id": "knife",
    "name": "Survival Knife",
    "type": "weapon",
    "rarity": "common",
    "color": "#bfc5ba",
    "glyph": "KN",
    "desc": "A quick, quiet close-range blade.",
    "stack": 1,
    "slot": "melee"
  },
  "bat": {
    "id": "bat",
    "name": "Baseball Bat",
    "type": "weapon",
    "rarity": "common",
    "color": "#bfc5ba",
    "glyph": "BAT",
    "desc": "Heavy wooden club with good reach.",
    "stack": 1,
    "slot": "melee"
  },
  "machete": {
    "id": "machete",
    "name": "Machete",
    "type": "weapon",
    "rarity": "uncommon",
    "color": "#79bd73",
    "glyph": "MC",
    "desc": "A broad blade for clearing a path.",
    "stack": 1,
    "slot": "melee"
  },
  "ammo_9mm": {
    "id": "ammo_9mm",
    "name": "9mm Rounds",
    "type": "ammo",
    "rarity": "common",
    "color": "#bfc5ba",
    "glyph": "9mm",
    "desc": "Ammunition for pistols and submachine guns.",
    "stack": 720
  },
  "ammo_357": {
    "id": "ammo_357",
    "name": ".357 Rounds",
    "type": "ammo",
    "rarity": "uncommon",
    "color": "#79bd73",
    "glyph": "357",
    "desc": "Ammunition for revolvers.",
    "stack": 540
  },
  "ammo_12g": {
    "id": "ammo_12g",
    "name": "12 Gauge Shells",
    "type": "ammo",
    "rarity": "uncommon",
    "color": "#79bd73",
    "glyph": "12g",
    "desc": "Shotgun ammunition.",
    "stack": 360
  },
  "ammo_556": {
    "id": "ammo_556",
    "name": "5.56mm Rounds",
    "type": "ammo",
    "rarity": "rare",
    "color": "#70a9df",
    "glyph": "556",
    "desc": "Assault rifle ammunition.",
    "stack": 720
  },
  "ammo_308": {
    "id": "ammo_308",
    "name": ".308 Rounds",
    "type": "ammo",
    "rarity": "rare",
    "color": "#70a9df",
    "glyph": "308",
    "desc": "Hunting rifle ammunition.",
    "stack": 540
  },
  "cap": {
    "id": "cap",
    "name": "Reinforced Cap",
    "type": "armor",
    "rarity": "common",
    "color": "#bfc5ba",
    "glyph": "CAP",
    "desc": "Reduces incoming damage by 8% before upgrades.",
    "stack": 1,
    "slot": "head",
    "armor": 0.08,
    "weightless": true
  },
  "bike_helmet": {
    "id": "bike_helmet",
    "name": "Bike Helmet",
    "type": "armor",
    "rarity": "uncommon",
    "color": "#79bd73",
    "glyph": "BH",
    "desc": "Reduces incoming damage by 12% before upgrades.",
    "stack": 1,
    "slot": "head",
    "armor": 0.12,
    "weightless": true
  },
  "riot_helmet": {
    "id": "riot_helmet",
    "name": "Riot Helmet",
    "type": "armor",
    "rarity": "rare",
    "color": "#70a9df",
    "glyph": "RH",
    "desc": "Reduces incoming damage by 18% before upgrades.",
    "stack": 1,
    "slot": "head",
    "armor": 0.18,
    "weightless": false
  },
  "military_helmet": {
    "id": "military_helmet",
    "name": "Military Helmet",
    "type": "armor",
    "rarity": "epic",
    "color": "#c48ae0",
    "glyph": "MH",
    "desc": "Reduces incoming damage by 22% before upgrades.",
    "stack": 1,
    "slot": "head",
    "armor": 0.22,
    "weightless": false
  },
  "hoodie": {
    "id": "hoodie",
    "name": "Padded Hoodie",
    "type": "armor",
    "rarity": "common",
    "color": "#bfc5ba",
    "glyph": "HD",
    "desc": "Reduces incoming damage by 8% before upgrades.",
    "stack": 1,
    "slot": "body",
    "armor": 0.08,
    "weightless": true
  },
  "leather_jacket": {
    "id": "leather_jacket",
    "name": "Leather Jacket",
    "type": "armor",
    "rarity": "uncommon",
    "color": "#79bd73",
    "glyph": "LJ",
    "desc": "Reduces incoming damage by 15% before upgrades.",
    "stack": 1,
    "slot": "body",
    "armor": 0.15,
    "weightless": false
  },
  "police_vest": {
    "id": "police_vest",
    "name": "Police Vest",
    "type": "armor",
    "rarity": "rare",
    "color": "#70a9df",
    "glyph": "PV",
    "desc": "Reduces incoming damage by 24% before upgrades.",
    "stack": 1,
    "slot": "body",
    "armor": 0.24,
    "weightless": false
  },
  "military_vest": {
    "id": "military_vest",
    "name": "Military Vest",
    "type": "armor",
    "rarity": "epic",
    "color": "#c48ae0",
    "glyph": "MV",
    "desc": "Reduces incoming damage by 30% before upgrades.",
    "stack": 1,
    "slot": "body",
    "armor": 0.3,
    "weightless": false
  },
  "small_backpack": {
    "id": "small_backpack",
    "name": "Small Backpack",
    "type": "backpack",
    "rarity": "common",
    "color": "#bfc5ba",
    "glyph": "BP",
    "desc": "Adds 4 inventory slots.",
    "stack": 1,
    "slots": 4
  },
  "hiking_backpack": {
    "id": "hiking_backpack",
    "name": "Hiking Backpack",
    "type": "backpack",
    "rarity": "uncommon",
    "color": "#79bd73",
    "glyph": "HB",
    "desc": "Adds 8 inventory slots.",
    "stack": 1,
    "slots": 8
  },
  "military_backpack": {
    "id": "military_backpack",
    "name": "Military Backpack",
    "type": "backpack",
    "rarity": "rare",
    "color": "#70a9df",
    "glyph": "MB",
    "desc": "Adds 12 inventory slots.",
    "stack": 1,
    "slots": 12
  },
  "bandage": {
    "id": "bandage",
    "name": "Bandage",
    "type": "consumable",
    "rarity": "common",
    "color": "#bfc5ba",
    "glyph": "+",
    "desc": "Restores 15 health and stops bleeding.",
    "stack": 60,
    "use": {
      "heal": 15,
      "stopBleed": true,
      "time": 1
    }
  },
  "medkit": {
    "id": "medkit",
    "name": "Medical Kit",
    "type": "consumable",
    "rarity": "rare",
    "color": "#70a9df",
    "glyph": "MED",
    "desc": "Restores 60 health.",
    "stack": 30,
    "use": {
      "heal": 60,
      "time": 2.5
    }
  },
  "painkillers": {
    "id": "painkillers",
    "name": "Painkillers",
    "type": "consumable",
    "rarity": "uncommon",
    "color": "#79bd73",
    "glyph": "RX",
    "desc": "Restores 25 health.",
    "stack": 60,
    "use": {
      "heal": 25,
      "time": 1
    }
  },
  "canned_food": {
    "id": "canned_food",
    "name": "Canned Food",
    "type": "consumable",
    "rarity": "common",
    "color": "#bfc5ba",
    "glyph": "CAN",
    "desc": "Restores 35 food.",
    "stack": 20,
    "use": {
      "food": 35,
      "time": 1.5
    }
  },
  "chips": {
    "id": "chips",
    "name": "Chips",
    "type": "consumable",
    "rarity": "common",
    "color": "#bfc5ba",
    "glyph": "CH",
    "desc": "Restores 15 food.",
    "stack": 20,
    "use": {
      "food": 15,
      "time": 0.8
    }
  },
  "mre": {
    "id": "mre",
    "name": "Field Ration",
    "type": "consumable",
    "rarity": "rare",
    "color": "#70a9df",
    "glyph": "MRE",
    "desc": "Restores 65 food and 10 water.",
    "stack": 10,
    "use": {
      "food": 65,
      "water": 10,
      "time": 2
    }
  },
  "water_bottle": {
    "id": "water_bottle",
    "name": "Water Bottle",
    "type": "consumable",
    "rarity": "common",
    "color": "#bfc5ba",
    "glyph": "H2O",
    "desc": "Restores 45 water.",
    "stack": 20,
    "use": {
      "water": 45,
      "time": 1
    }
  },
  "soda": {
    "id": "soda",
    "name": "Soda",
    "type": "consumable",
    "rarity": "common",
    "color": "#bfc5ba",
    "glyph": "POP",
    "desc": "Restores 25 water and 5 food.",
    "stack": 20,
    "use": {
      "water": 25,
      "food": 5,
      "time": 0.8
    }
  },
  "energy_drink": {
    "id": "energy_drink",
    "name": "Energy Drink",
    "type": "consumable",
    "rarity": "uncommon",
    "color": "#79bd73",
    "glyph": "NRG",
    "desc": "Restores 60 stamina and 20 water.",
    "stack": 10,
    "use": {
      "stamina": 60,
      "water": 20,
      "time": 0.8
    }
  },
  "scrap": {
    "id": "scrap",
    "name": "Scrap Metal",
    "type": "material",
    "rarity": "common",
    "color": "#bfc5ba",
    "glyph": "SC",
    "desc": "Salvaged metal for ammunition, tools, and construction.",
    "stack": 100
  },
  "wood": {
    "id": "wood",
    "name": "Wood",
    "type": "material",
    "rarity": "common",
    "color": "#bfc5ba",
    "glyph": "WD",
    "desc": "Timber for structures and barricades.",
    "stack": 100
  },
  "nails": {
    "id": "nails",
    "name": "Nails",
    "type": "material",
    "rarity": "common",
    "color": "#bfc5ba",
    "glyph": "NL",
    "desc": "Fasteners for construction and crafting.",
    "stack": 100
  },
  "cloth": {
    "id": "cloth",
    "name": "Cloth",
    "type": "material",
    "rarity": "common",
    "color": "#bfc5ba",
    "glyph": "CL",
    "desc": "Clean fabric for bandages and packs.",
    "stack": 100
  },
  "gunpowder": {
    "id": "gunpowder",
    "name": "Gunpowder",
    "type": "material",
    "rarity": "uncommon",
    "color": "#79bd73",
    "glyph": "GP",
    "desc": "Propellant for crafting ammunition.",
    "stack": 80
  },
  "gun_parts": {
    "id": "gun_parts",
    "name": "Gun Parts",
    "type": "material",
    "rarity": "rare",
    "color": "#70a9df",
    "glyph": "PTS",
    "desc": "Precision components for weapon upgrades.",
    "stack": 60
  },
  "electronics": {
    "id": "electronics",
    "name": "Electronics",
    "type": "material",
    "rarity": "uncommon",
    "color": "#79bd73",
    "glyph": "EL",
    "desc": "Recovered circuits for advanced equipment.",
    "stack": 60
  },
  "chemicals": {
    "id": "chemicals",
    "name": "Chemicals",
    "type": "material",
    "rarity": "uncommon",
    "color": "#79bd73",
    "glyph": "CHM",
    "desc": "Medical and industrial reagents.",
    "stack": 60
  }
};
export const RECIPES: Recipe[] = [
  {
    "id": "bandage",
    "name": "Make Bandages",
    "out": {
      "id": "bandage",
      "qty": 1
    },
    "in": {
      "cloth": 2
    },
    "station": null,
    "time": 1
  },
  {
    "id": "medkit",
    "name": "Assemble Medical Kit",
    "out": {
      "id": "medkit",
      "qty": 1
    },
    "in": {
      "bandage": 3,
      "chemicals": 2
    },
    "station": null,
    "time": 3
  },
  {
    "id": "ammo_9mm",
    "name": "Load 9mm Rounds",
    "out": {
      "id": "ammo_9mm",
      "qty": 24
    },
    "in": {
      "gunpowder": 2,
      "scrap": 3
    },
    "station": "workbench",
    "time": 2
  },
  {
    "id": "ammo_357",
    "name": "Load .357 Rounds",
    "out": {
      "id": "ammo_357",
      "qty": 12
    },
    "in": {
      "gunpowder": 2,
      "scrap": 3
    },
    "station": "workbench",
    "time": 2
  },
  {
    "id": "ammo_12g",
    "name": "Load Shotgun Shells",
    "out": {
      "id": "ammo_12g",
      "qty": 8
    },
    "in": {
      "gunpowder": 3,
      "scrap": 3
    },
    "station": "workbench",
    "time": 2
  },
  {
    "id": "ammo_556",
    "name": "Load 5.56mm Rounds",
    "out": {
      "id": "ammo_556",
      "qty": 24
    },
    "in": {
      "gunpowder": 4,
      "scrap": 5
    },
    "station": "workbench",
    "time": 3
  },
  {
    "id": "ammo_308",
    "name": "Load .308 Rounds",
    "out": {
      "id": "ammo_308",
      "qty": 12
    },
    "in": {
      "gunpowder": 3,
      "scrap": 4
    },
    "station": "workbench",
    "time": 3
  },
  {
    "id": "nails",
    "name": "Forge Nails",
    "out": {
      "id": "nails",
      "qty": 8
    },
    "in": {
      "scrap": 2
    },
    "station": null,
    "time": 1
  },
  {
    "id": "gun_parts",
    "name": "Machine Gun Parts",
    "out": {
      "id": "gun_parts",
      "qty": 1
    },
    "in": {
      "scrap": 12,
      "electronics": 4
    },
    "station": "workbench",
    "time": 5
  },
  {
    "id": "small_backpack",
    "name": "Sew Small Backpack",
    "out": {
      "id": "small_backpack",
      "qty": 1
    },
    "in": {
      "cloth": 10,
      "nails": 2
    },
    "station": null,
    "time": 4
  }
];
