// hive-data.ts — authored missions of "The Hive Below" (step 1 of 4: the Breach and the Warrens).
// Same shape as road-data.ts; sim/road.ts runs them on the map built by sim/hive-world.ts.
import type { MissionDef, Weights } from './road-data';

const DRONES: Weights = { drone: 1 };
const WARRENS: Weights = { drone: 10, honeypot: 1.3 };

export const HIVE_MISSIONS: MissionDef[] = [
  {
    id: 'breach', title: 'The Water Is Gone', sector: 0, clock: 400, tagline: 'The reservoir drained in one night. Something is climbing out of the mud.',
    density: 2, types: DRONES, pressure: 1, scouts: 9,
    intro: [
      { who: 'ruth', text: 'Dam watch to anyone awake. The reservoir is gone. All of it, since midnight.', mood: 'worried' },
      { who: 'eli', text: "There is a tear in the mud where the deep end was. It glows. I don't have a word for it.", mood: 'worried' },
      { who: 'june', text: 'Things are climbing out of it. Six legs, big as a person. Get the floodlights on so we can see what we are shooting at.', mood: 'firm' },
    ],
    objectives: [
      { kind: 'reach', at: 'dam', r: 150, text: 'Get to the floodlights on the dam', line: { who: 'june', text: 'The breaker is at the foot of the dam wall, north across the bed. The ones walking alone are scouts. Drop a scout before it sees you and the rest never know.', mood: 'neutral' } },
      { kind: 'interact', at: 'dam', label: 'Throw the breaker', hold: 1.2, text: 'Switch on the floodlights', line: { who: 'eli', text: 'Big red handle. Throw it and hold it until the lamps catch.', mood: 'firm' } },
      { kind: 'holdout', at: 'dam', from: 'rift', seconds: 60, every: 6, count: 7, types: DRONES, text: 'Hold the dam wall', line: { who: 'ruth', text: 'Lights are up. Oh no. There is a whole column of them coming out of the tear. Hold the wall!', mood: 'worried' } },
      { kind: 'reach', at: 'rift', r: 130, text: 'Go down to the rift', line: { who: 'eli', text: 'They have stopped coming, and it is still open. Something on the far side is holding it open. Go and look. Carefully.', mood: 'worried' } },
      { kind: 'camp', text: 'Make camp at the mouth of the rift', line: { who: 'mara', text: 'Ada and Ben are bringing a lamp and the crates down to you. Catch your breath. You are going in.', mood: 'firm' } },
    ],
    outro: [
      { who: 'june', text: 'I have started a new map. Page one: a hole.', mood: 'neutral' },
      { who: 'mara', text: 'I hold the dam with the wounded. Ruth has the radio. You still have the gun.', mood: 'firm' },
    ],
    caches: [
      { at: 'dam', items: [{ id: 'ammo_9mm', qty: 48 }, { id: 'ammo_12g', qty: 12 }, { id: 'bandage', qty: 2 }] },
      { at: 'camp', items: [{ id: 'ammo_9mm', qty: 48 }, { id: 'ammo_556', qty: 60 }, { id: 'medkit' }] },
    ],
  },
  {
    id: 'warrens', title: 'Follow the Column', sector: 1, clock: 480, tagline: 'Amber light, narrow tunnels, and the sound of a thousand feet.',
    density: 3, types: WARRENS, bossHp: 1, scouts: 16, swarm: { cap: 60, every: 20, size: [8, 14] },
    intro: [
      { who: 'june', text: 'Their trail runs from the rift straight down. They walk it nose to tail. Follow the column.', mood: 'neutral' },
      { who: 'eli', text: 'The walls are resin, and the resin glows. Look for holes in it: that is where they come out. A hole can be caved in.', mood: 'firm' },
      { who: 'ruth', text: 'You are breaking up down there. If you lose me, keep going down.', mood: 'worried' },
    ],
    objectives: [
      { kind: 'reach', at: 'trail', r: 150, text: 'Follow the pheromone trail into the Warrens', line: { who: 'mara', text: 'The pale clusters are eggs. Do not stand near them. Break them from a distance or leave them be.', mood: 'firm' } },
      { kind: 'burrows', at: 'nursery', count: 3, text: 'Collapse the three burrows in the nursery', line: { who: 'eli', text: 'That chamber is where they hatch, and three burrows feed it. Shoot the mouths until they fall in.', mood: 'firm' } },
      { kind: 'pickup', at: 'cache', item: 'formic_sprayer', text: 'Take the Formic Sprayer from the dragged-down crates', line: { who: 'june', text: "They dragged half of Bellwether's stores down here. One of those crates is not ours. Take what is in it.", mood: 'neutral' } },
      { kind: 'boss', at: 'parade', boss: 'marshal', hp: 1, fixed: true, text: 'Kill the Marshal', line: { who: 'ruth', text: 'Something big is standing in the next chamber. It is not moving. It is waiting for you.', mood: 'worried' } },
      { kind: 'camp', text: 'Make camp at the seal', line: { who: 'eli', text: 'The seal on the door has gone dull. It was alive, that seal, and it is dying with the big one. Make camp. It will have fallen in by the time you have eaten.', mood: 'relieved' } },
    ],
    outro: [
      { who: 'eli', text: 'One lock on the far door just went dark. There are six. Five more of those things.', mood: 'worried' },
      { who: 'mara', text: 'Kit is bringing the camp down to you. Eat something. Sleep if you can.', mood: 'firm' },
    ],
    caches: [
      { at: 'trail', items: [{ id: 'ammo_9mm', qty: 48 }, { id: 'ammo_556', qty: 60 }, { id: 'bandage', qty: 2 }] },
      { at: 'cache', items: [{ id: 'ichor', qty: 160 }, { id: 'ichor', qty: 80 }, { id: 'medkit' }, { id: 'ammo_12g', qty: 16 }] },
      { at: 'camp', items: [{ id: 'ichor', qty: 120 }, { id: 'royal_jelly' }, { id: 'medkit' }, { id: 'ammo_556', qty: 60 }, { id: 'ammo_9mm', qty: 48 }] },
    ],
  },
];
