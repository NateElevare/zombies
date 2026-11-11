// road-data.ts — authored content for "The Long Road": missions, objectives, dialogue and supply caches.
// Positions are symbolic (site ids); sim/road.ts resolves them against the generated map.
import type { SiteId } from './road-world';
import type { BossId } from './bosses';
import type { ZombieType } from './types';

export type Speaker = 'mara' | 'eli' | 'june' | 'ruth';
export interface Line { who: Speaker; text: string; mood?: 'neutral' | 'worried' | 'firm' | 'relieved' }
export const CAST: Record<Speaker, { name: string; role: string }> = {
  mara: { name: 'Mara Velez', role: 'Medic' },
  eli: { name: 'Eli Mercer', role: 'Engineer' },
  june: { name: 'June Park', role: 'Keeps the map' },
  ruth: { name: 'Ruth Calder', role: 'North Ridge radio' },
};

/** Where an objective happens. Building sites resolve to their door (reach) or an indoor spot (pickups). */
export type Place = SiteId | 'camp' | 'entry' | 'prevCamp';
export type Weights = Partial<Record<ZombieType, number>>;

export type ObjectiveDef =
  | { kind: 'reach'; at: Place; text: string; r?: number; line?: Line }
  | { kind: 'pickup'; at: Place; item: string; qty?: number; text: string; line?: Line }
  | { kind: 'clear'; at: Place; count: number; types?: Weights; text: string; r?: number; indoor?: boolean; line?: Line }
  | { kind: 'holdout'; at: Place; seconds: number; every: number; count: number; types?: Weights; text: string; line?: Line; /** The Hive Below: every wave climbs out here, in plain sight, and never loses your trail */ from?: Place }
  /** The Hive Below: collapse the burrows of this place (they are on the map from the start of the mission). */
  | { kind: 'burrows'; at: Place; count: number; text: string; line?: Line }
  | { kind: 'interact'; at: Place; label: string; text: string; hold?: number; line?: Line; offset?: { x: number; y: number } }
  | { kind: 'rescue'; at: Place; text: string; line?: Line }
  | { kind: 'escort'; at: Place; text: string; r?: number; line?: Line }
  | { kind: 'boss'; at: Place; boss: BossId; text: string; hp: number; line?: Line; /** a return match: 2x health, 2.5x damage */ second?: boolean; /** spawn in the open, out of sight, instead of inside the site's building */ outdoors?: boolean; /** The Hive Below: it is already standing in its arena, waiting */ fixed?: boolean }
  | { kind: 'camp'; text: string; line?: Line };

export interface CacheDef { at: Place; items: { id: string; qty?: number }[]; spread?: number }
export interface MissionDef {
  id: string; title: string; sector: number;
  /** time of day in clock seconds (0 = 06:00, 420 = night) */
  clock: number;
  tagline: string;
  intro: Line[];
  outro: Line[];
  objectives: ObjectiveDef[];
  caches: CacheDef[];
  /** ambient pressure: zombies per minute around the player, and the mix */
  density: number; types: Weights; bossHp?: number;
  /** overrides the global PRESSURE dial (ambient rate, clear counts, hold-out waves, building packs) */
  pressure?: number;
  /** Sequel checkpoints may run back along the route before returning to the ridge. */
  checkpoint?: SiteId | 'entry' | 'exit';
  /** The Hive Below: columns sent from the burrows near the player (sim/hive.ts), and wanderers placed at the start. */
  swarm?: import('./hive').SwarmDef; scouts?: number;
}

const WALKERS: Weights = { walker: 7, crawler: 2, runner: 1 };
const MIXED: Weights = { walker: 5, runner: 3, crawler: 2, bloater: 1 };
const HEAVY: Weights = { walker: 4, runner: 3, brute: 1, bloater: 1, crawler: 1 };
const NIGHT: Weights = { walker: 4, runner: 2, crawler: 4, bloater: 1 };
const FOREST: Weights = { runner: 6, walker: 2, crawler: 2 };
const FORT: Weights = { walker: 3, runner: 3, brute: 2, bloater: 2 };

export const MISSIONS: MissionDef[] = [
  {
    id: 'haven', title: 'Last Night at Haven', sector: 0, clock: 352, tagline: 'The station is lost. Get everyone out the back.',
    density: 4, types: WALKERS, pressure: 0.8,   // the warm-up sector: roughly half the pressure of the rest of the road
    intro: [
      { who: 'mara', text: "They're through the yard wall. Eli is at the rear gate with June, but the chain is rusted shut.", mood: 'worried' },
      { who: 'eli', text: 'Grab the shotgun from the engine bay before you come. You will want it.', mood: 'firm' },
      { who: 'june', text: 'Ruth said the convoy leaves North Ridge in four days. Four days, across the whole city.', mood: 'worried' },
    ],
    objectives: [
      { kind: 'pickup', at: 'haven', item: 'shotgun', text: 'Take the shotgun from the engine bay' },
      { kind: 'clear', at: 'havenYard', count: 9, types: WALKERS, text: 'Clear the station yard', r: 420, line: { who: 'mara', text: 'More are coming off the avenue. Hold them here, I will get June ready.', mood: 'firm' } },
      { kind: 'holdout', at: 'camp', seconds: 45, every: 7, count: 3, types: WALKERS, text: 'Hold the rear gate while Eli cuts the chain', line: { who: 'eli', text: 'Cutting now. Keep them off my back for a minute.', mood: 'firm' } },
      { kind: 'camp', text: 'Go through the gate with the others', line: { who: 'eli', text: "It's open. Everyone through, now." } },
    ],
    outro: [
      { who: 'june', text: 'That was home.', mood: 'worried' },
      { who: 'mara', text: 'It was a building. Home is wherever the four of us are standing. Keep walking.', mood: 'firm' },
    ],
    caches: [
      { at: 'haven', items: [{ id: 'ammo_12g', qty: 16 }, { id: 'ammo_9mm', qty: 36 }, { id: 'bandage', qty: 2 }] },
      { at: 'camp', items: [{ id: 'ammo_12g', qty: 12 }, { id: 'medkit' }] },
    ],
  },
  {
    id: 'cedar', title: 'Cedar Hills', sector: 1, clock: 60, tagline: "June's fever is climbing. The pharmacy is on the way.",
    density: 7, types: WALKERS,
    intro: [
      { who: 'mara', text: "June's cut is infected. Without antibiotics she will not make it past downtown.", mood: 'worried' },
      { who: 'eli', text: 'CarePlus Pharmacy, north of the avenue. The school gym past it has a locking door; we shelter there until you clear it.', mood: 'neutral' },
    ],
    objectives: [
      { kind: 'pickup', at: 'pharmacy', item: 'antibiotics', text: 'Find antibiotics in CarePlus Pharmacy', line: { who: 'mara', text: 'Amoxicillin, anything ending in -cillin. Check behind the counter.' } },
      { kind: 'reach', at: 'school', text: 'Meet the group at Cedar Hills High School', line: { who: 'june', text: "I'm fine. I'm fine. Okay, I'm not fine.", mood: 'worried' } },
      { kind: 'clear', at: 'school', count: 10, types: WALKERS, indoor: true, text: 'Clear the school so the group can rest', line: { who: 'eli', text: 'They are in the classrooms. Room by room.' } },
      { kind: 'camp', text: 'Reach the sector gate', line: { who: 'mara', text: 'Her fever broke. Thank you. Now, the Interchange.', mood: 'relieved' } },
    ],
    outro: [
      { who: 'june', text: 'I drew the next part of the map while you were gone. The Interchange is... a lot of cars.', mood: 'neutral' },
      { who: 'eli', text: 'A lot of cars means a lot of fuel. We will need it for the base later.', mood: 'neutral' },
    ],
    caches: [
      { at: 'pharmacy', items: [{ id: 'medkit' }, { id: 'bandage', qty: 3 }, { id: 'bat' }] },
      { at: 'school', items: [{ id: 'ammo_12g', qty: 16 }, { id: 'ammo_9mm', qty: 48 }, { id: 'bandage', qty: 2 }] },
      { at: 'camp', items: [{ id: 'ammo_12g', qty: 12 }, { id: 'ammo_9mm', qty: 24 }] },
    ],
  },
  {
    id: 'interchange', title: 'The Interchange', sector: 2, clock: 150, tagline: 'The overpass is choked with wrecks, and something lives in them.',
    density: 9, types: MIXED, bossHp: 0.4,
    intro: [
      { who: 'eli', text: 'Highway Gas first: a full can for the generator at the fort. Then north over the overpass to the toll plaza.', mood: 'neutral' },
      { who: 'june', text: 'People on the radio used to talk about the overpass. Then they stopped.', mood: 'worried' },
    ],
    objectives: [
      { kind: 'pickup', at: 'gas', item: 'fuel_can', text: 'Get a fuel can from Highway Gas', line: { who: 'eli', text: 'Should be a jerrycan in the back room. Try not to shoot near the pumps.' } },
      { kind: 'reach', at: 'overpass', text: 'Reach the overpass', r: 160 },
      { kind: 'boss', at: 'overpass', boss: 'howler', hp: 0.4, outdoors: true, text: 'Kill the thing in the wrecks', line: { who: 'june', text: 'What was that sound?', mood: 'worried' } },
      { kind: 'interact', at: 'toll', label: 'Raise the toll barrier', hold: 3, text: 'Raise the toll barrier for the group' },
      { kind: 'camp', text: 'Go through the toll gate' },
    ],
    outro: [
      { who: 'mara', text: 'Downtown next. Eli, tell them.', mood: 'firm' },
      { who: 'eli', text: 'Police HQ has an armory. Dispatch has a radio strong enough to reach Ruth. We need both.', mood: 'neutral' },
    ],
    caches: [
      { at: 'gas', items: [{ id: 'smg' }, { id: 'ammo_9mm', qty: 60 }, { id: 'bandage', qty: 2 }] },
      { at: 'overpass', items: [{ id: 'ammo_12g', qty: 16 }, { id: 'medkit' }, { id: 'ammo_9mm', qty: 30 }], spread: 500 },
      { at: 'camp', items: [{ id: 'ammo_12g', qty: 12 }, { id: 'ammo_9mm', qty: 40 }, { id: 'bandage', qty: 2 }] },
    ],
  },
  {
    id: 'downtown', title: 'Downtown Crossing', sector: 3, clock: 220, tagline: 'Guns at Police HQ, a voice at Dispatch.',
    density: 11, types: HEAVY,
    intro: [
      { who: 'eli', text: 'The precinct armory is in the back. The dispatch center is across the avenue; its radio runs on a battery bank we can wake up.' },
      { who: 'mara', text: 'Downtown is loud. Whatever you shoot will be heard three blocks away.', mood: 'worried' },
    ],
    objectives: [
      { kind: 'pickup', at: 'precinct', item: 'assault_rifle', text: 'Take a rifle from the Police HQ armory', line: { who: 'eli', text: 'Armory is through the back offices. Grab a vest while you are there.' } },
      { kind: 'reach', at: 'dispatch', text: 'Get to the Emergency Dispatch Center' },
      { kind: 'interact', at: 'dispatch', label: 'Start the dispatch radio', hold: 4, text: 'Start the dispatch radio', offset: { x: 0, y: 0 } },
      { kind: 'holdout', at: 'dispatch', seconds: 60, every: 6, count: 4, types: HEAVY, text: 'Hold the dispatch center while Eli talks to Ruth', line: { who: 'ruth', text: 'Bellwether, this is North Ridge. I hear you. Keep coming. We are holding the convoy as long as we can.', mood: 'relieved' } },
      { kind: 'camp', text: 'Reach the sector gate', line: { who: 'ruth', text: 'Three days. Do not stop for anything.', mood: 'firm' } },
    ],
    outro: [
      { who: 'june', text: 'She sounded tired.', mood: 'worried' },
      { who: 'mara', text: "She sounded alive. St. Mercy is next, and I need what's inside it.", mood: 'firm' },
    ],
    caches: [
      { at: 'precinct', items: [{ id: 'ammo_556', qty: 90 }, { id: 'police_vest' }, { id: 'riot_helmet' }, { id: 'revolver' }, { id: 'ammo_357', qty: 24 }] },
      { at: 'dispatch', items: [{ id: 'ammo_556', qty: 60 }, { id: 'medkit' }, { id: 'ammo_12g', qty: 16 }] },
      { at: 'camp', items: [{ id: 'ammo_556', qty: 60 }, { id: 'bandage', qty: 3 }] },
    ],
  },
  {
    id: 'mercy', title: 'St. Mercy', sector: 4, clock: 330, tagline: 'The emergency wing never emptied.',
    density: 10, types: HEAVY, bossHp: 0.6,
    intro: [
      { who: 'mara', text: 'The ER has a trauma kit: surgical, proper. If anyone takes a bullet or a bite in the forest, that kit is the difference.', mood: 'firm' },
      { who: 'eli', text: 'Hospitals were where the sick went. The sick are still there.', mood: 'worried' },
    ],
    objectives: [
      { kind: 'reach', at: 'hospital', text: 'Reach St. Mercy Hospital' },
      { kind: 'clear', at: 'hospital', count: 14, types: HEAVY, indoor: true, text: 'Clear the wards', line: { who: 'mara', text: 'Something in there is making the rest of them sick. Be careful.' } },
      { kind: 'boss', at: 'hospital', boss: 'plague', hp: 0.6, text: 'Kill the Plague Lord', line: { who: 'june', text: 'The air coming out of the doors is green.', mood: 'worried' } },
      { kind: 'pickup', at: 'hospital', item: 'medical_crate', text: 'Recover the trauma kit' },
      { kind: 'camp', text: 'Reach the sector gate', line: { who: 'mara', text: 'Got it. Whatever happens from here, I can work with this.', mood: 'relieved' } },
    ],
    outro: [
      { who: 'eli', text: 'Rustwater Yard. The freight depot has truck batteries. With one of those and the fuel, the fort generator starts.' },
      { who: 'mara', text: 'And it gets dark soon. Everything in the yard will come out.', mood: 'worried' },
    ],
    caches: [
      { at: 'hospital', items: [{ id: 'medkit' }, { id: 'medkit' }, { id: 'bandage', qty: 4 }, { id: 'ammo_556', qty: 60 }, { id: 'ammo_12g', qty: 20 }] },
      { at: 'camp', items: [{ id: 'ammo_556', qty: 60 }, { id: 'ammo_9mm', qty: 40 }, { id: 'medkit' }] },
    ],
  },
  {
    id: 'rustwater', title: 'Rustwater Yard', sector: 5, clock: 380, tagline: 'Dusk in the freight yard. The depot door is the only way through.',
    density: 12, types: HEAVY, bossHp: 0.7,
    intro: [
      { who: 'eli', text: 'Freight depot, south of the avenue. The battery is on the charging rack inside. The roll-up door is chained from the inside, so you go in through the office.' },
      { who: 'june', text: 'Eli, the big one from the radio chatter. The Butcher. People said it was at the yard.', mood: 'worried' },
    ],
    objectives: [
      { kind: 'reach', at: 'depot', text: 'Reach Rustwater Freight Depot' },
      { kind: 'pickup', at: 'depot', item: 'bus_battery', text: 'Take the truck battery from the charging rack' },
      { kind: 'boss', at: 'depot', boss: 'butcher', hp: 0.7, text: 'Kill the Butcher', line: { who: 'eli', text: 'That is not a zombie. That is a wall with a cleaver.', mood: 'worried' } },
      { kind: 'interact', at: 'depot', label: 'Raise the roll-up door', hold: 4, text: 'Raise the roll-up door' },
      { kind: 'camp', text: 'Reach the north gate', line: { who: 'mara', text: 'Through. Keep moving, the light is going.', mood: 'firm' } },
    ],
    outro: [
      { who: 'eli', text: 'Rustwater North lost power on the first night and never got it back. Flashlight. Stay on the road.', mood: 'firm' },
      { who: 'june', text: 'I hate the dark.', mood: 'worried' },
    ],
    caches: [
      { at: 'depot', items: [{ id: 'machete' }, { id: 'ammo_556', qty: 90 }, { id: 'ammo_12g', qty: 24 }, { id: 'medkit' }] },
      { at: 'camp', items: [{ id: 'ammo_556', qty: 60 }, { id: 'bandage', qty: 3 }, { id: 'lantern' }] },
    ],
  },
  {
    id: 'dark', title: 'The Dark Mile', sector: 6, clock: 470, tagline: 'No power. No moon. A mile of yards between you and the pumping station.',
    density: 13, types: NIGHT,
    intro: [
      { who: 'eli', text: 'The pumping station has its own backup lights. Get there and switch them on, then we cross.' },
      { who: 'mara', text: 'They hunt by sound at night. Walk when you can.', mood: 'firm' },
    ],
    objectives: [
      { kind: 'reach', at: 'railcut', text: 'Cross the rail cut', r: 200, line: { who: 'june', text: 'Crawlers. In the gravel. I can hear them.', mood: 'worried' } },
      { kind: 'clear', at: 'railcut', count: 16, types: NIGHT, text: 'Clear the rail cut', r: 700 },
      { kind: 'reach', at: 'pumping', text: 'Reach the Municipal Pumping Station' },
      { kind: 'interact', at: 'pumping', label: 'Switch on the backup lights', hold: 3, text: 'Switch on the backup lights', line: { who: 'eli', text: 'Lights. Thank you. Now everything within a mile knows where we are, so move.', mood: 'relieved' } },
      { kind: 'holdout', at: 'pumping', seconds: 50, every: 5, count: 4, types: NIGHT, text: 'Hold the pumping station until the group crosses' },
      { kind: 'camp', text: 'Reach the forest gate' },
    ],
    outro: [
      { who: 'mara', text: 'Dawn in an hour. The forest road is quieter, Ruth says. Quieter is not quiet.', mood: 'neutral' },
      { who: 'ruth', text: 'Blackpine ranger station has a rifle locker. Then it is the fort, and then me.', mood: 'neutral' },
    ],
    caches: [
      { at: 'railcut', items: [{ id: 'ammo_556', qty: 60 }, { id: 'ammo_12g', qty: 16 }, { id: 'bandage', qty: 3 }], spread: 600 },
      { at: 'pumping', items: [{ id: 'medkit' }, { id: 'ammo_556', qty: 90 }, { id: 'ammo_9mm', qty: 40 }] },
      { at: 'camp', items: [{ id: 'ammo_556', qty: 60 }, { id: 'medkit' }] },
    ],
  },
  {
    id: 'blackpine', title: 'Blackpine Road', sector: 7, clock: 20, tagline: 'Runners in the trees. Something is nesting in the clearing.',
    density: 10, types: FOREST, bossHp: 0.8,
    intro: [
      { who: 'ruth', text: 'The ranger station is north of the road. The clearing south of it is where the fast ones come from. I would not go there, but the road to the fort runs right past it.' },
      { who: 'eli', text: 'A hunting rifle would be nice before the fort.' },
    ],
    objectives: [
      { kind: 'reach', at: 'ranger', text: 'Reach Blackpine Ranger Station' },
      { kind: 'pickup', at: 'ranger', item: 'hunting_rifle', text: 'Take the hunting rifle from the locker' },
      { kind: 'reach', at: 'clearing', text: 'Investigate the clearing', r: 300, line: { who: 'june', text: "The trees are... moving. Those aren't trees.", mood: 'worried' } },
      { kind: 'boss', at: 'clearing', boss: 'broodmother', hp: 0.8, outdoors: true, text: 'Destroy the Broodmother' },
      { kind: 'camp', text: 'Reach the fort gate', line: { who: 'ruth', text: 'I can see your light from the ridge. One more sector.', mood: 'relieved' } },
    ],
    outro: [
      { who: 'eli', text: 'Fort Ashgrove. The motor pool keys get us a truck; the truck gets us up the ridge road with everything we carried.' },
      { who: 'mara', text: 'And whatever the army left inside the walls is still inside the walls.', mood: 'worried' },
    ],
    caches: [
      { at: 'ranger', items: [{ id: 'ammo_308', qty: 30 }, { id: 'medkit' }, { id: 'ammo_12g', qty: 16 }] },
      { at: 'clearing', items: [{ id: 'ammo_556', qty: 60 }, { id: 'ammo_308', qty: 20 }, { id: 'bandage', qty: 3 }], spread: 500 },
      { at: 'camp', items: [{ id: 'ammo_308', qty: 20 }, { id: 'ammo_556', qty: 60 }, { id: 'medkit' }] },
    ],
  },
  {
    id: 'fort', title: 'Fort Ashgrove', sector: 8, clock: 180, tagline: 'The army is still here. It just stopped being an army.',
    density: 12, types: FORT, bossHp: 0.9,
    intro: [
      { who: 'eli', text: 'Through the gate, across the parade ground, the motor pool is in the far corner. The keys are in the dispatcher cage.' },
      { who: 'ruth', text: 'Something huge has been walking the walls at night. I hear it from the ridge.', mood: 'worried' },
    ],
    objectives: [
      { kind: 'reach', at: 'fort', text: 'Breach Fort Ashgrove', r: 260 },
      { kind: 'clear', at: 'fort', count: 18, types: FORT, text: 'Clear the parade ground', r: 900 },
      { kind: 'boss', at: 'motorpool', boss: 'juggernaut', hp: 0.9, outdoors: true, text: 'Kill the Juggernaut' },
      { kind: 'pickup', at: 'motorpool', item: 'bus_keys', text: 'Take the motor pool keys' },
      { kind: 'camp', text: 'Meet the group at the ridge road', line: { who: 'mara', text: 'Truck is running. Last stretch.', mood: 'relieved' } },
    ],
    outro: [
      { who: 'ruth', text: 'The convoy is on the dam road. I need thirty minutes on the relay to bring them in, and the relay is on the one hill every dead thing in the valley can see.', mood: 'firm' },
      { who: 'june', text: 'Then we hold the hill.', mood: 'firm' },
    ],
    caches: [
      { at: 'fort', items: [{ id: 'military_backpack' }, { id: 'military_vest' }, { id: 'military_helmet' }, { id: 'ammo_556', qty: 120 }, { id: 'ammo_12g', qty: 24 }, { id: 'medkit' }], spread: 500 },
      { at: 'motorpool', items: [{ id: 'assault_rifle' }, { id: 'ammo_556', qty: 90 }, { id: 'medkit' }, { id: 'ammo_308', qty: 20 }] },
      { at: 'camp', items: [{ id: 'medkit' }, { id: 'medkit' }, { id: 'ammo_556', qty: 90 }, { id: 'ammo_12g', qty: 24 }, { id: 'ammo_308', qty: 24 }] },
    ],
  },
  {
    id: 'ridge', title: 'North Ridge', sector: 8, clock: 390, tagline: 'Hold the relay until the convoy arrives.',
    density: 14, types: FORT, bossHp: 1,
    intro: [
      { who: 'ruth', text: 'Up the ridge road, past the reservoir. When you get here I start the relay, and then we do not stop shooting until the trucks are at the gate.', mood: 'firm' },
      { who: 'mara', text: "Everything we carried across the city is for the next half hour. Don't save anything.", mood: 'firm' },
    ],
    objectives: [
      { kind: 'reach', at: 'relay', text: 'Reach the North Ridge Relay', line: { who: 'ruth', text: 'There you are. Starting the relay. Here they come.', mood: 'relieved' } },
      { kind: 'holdout', at: 'relay', seconds: 90, every: 6, count: 5, types: FORT, text: 'Hold the relay: first wave' },
      { kind: 'boss', at: 'relay', boss: 'butcher', hp: 0.7, second: true, outdoors: true, text: 'Hold the relay: the Butcher returns', line: { who: 'eli', text: 'They followed us. All of them followed us.', mood: 'worried' } },
      { kind: 'holdout', at: 'relay', seconds: 90, every: 5, count: 6, types: FORT, text: 'Hold the relay: second wave', line: { who: 'ruth', text: 'Convoy is at the dam. Ten minutes. Hold.', mood: 'firm' } },
      { kind: 'boss', at: 'relay', boss: 'juggernaut', hp: 0.9, second: true, outdoors: true, text: 'Hold the relay: the Juggernaut returns' },
      { kind: 'holdout', at: 'relay', seconds: 60, every: 4, count: 6, types: FORT, text: 'Hold the relay: last wave', line: { who: 'june', text: 'Lights on the dam road. Trucks! Those are trucks!', mood: 'relieved' } },
      { kind: 'boss', at: 'relay', boss: 'warden', hp: 1, outdoors: true, text: 'Kill the Warden', line: { who: 'eli', text: "That is not something from the fort. That IS the fort. Everything you have, now.", mood: 'worried' } },
      { kind: 'camp', text: 'Get to the trucks', line: { who: 'ruth', text: 'Gate is open. Everyone in. We kept the promise.', mood: 'relieved' } },
    ],
    outro: [
      { who: 'mara', text: 'Four days. Nine sectors. All four of us.', mood: 'relieved' },
      { who: 'june', text: 'I am going to draw a new map. One with roads on it.', mood: 'relieved' },
    ],
    caches: [
      { at: 'relay', items: [{ id: 'medkit' }, { id: 'medkit' }, { id: 'medkit' }, { id: 'ammo_556', qty: 150 }, { id: 'ammo_12g', qty: 40 }, { id: 'ammo_308', qty: 40 }, { id: 'ammo_9mm', qty: 80 }], spread: 260 },
    ],
  },
];

/** Quest items are keys, not inventory: picking one up completes the objective. Names for the HUD and icons. */
export const QUEST_ITEMS: Record<string, string> = {
  antibiotics: 'Antibiotics', fuel_can: 'Fuel Can', medical_crate: 'Trauma Kit', bus_battery: 'Truck Battery', bus_keys: 'Motor Pool Keys', lantern: 'Lantern',
};
