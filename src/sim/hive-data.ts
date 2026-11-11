// hive-data.ts — authored missions of "The Hive Below": the Breach, the six brood cells, the Royal Cell and the way back up.
// After the Breach you hand over everything but your belt (sim/hive-kit.ts). It stays with Mara for the whole of the hive
// and comes back once, in the lockbox on the dam wall, at the camp of the last mission (`lockbox`).
// Same shape as road-data.ts; sim/road.ts runs them on the map built by sim/hive-world.ts.
import type { MissionDef, Weights } from './road-data';

const DRONES: Weights = { drone: 1 };
const WARRENS: Weights = { drone: 10, honeypot: 1.3 };
const GRANARY: Weights = { hopper: 8, drone: 4, shrieker: 0.35 };
const PAPER: Weights = { stinger: 7, honeypot: 1, grub: 2 };
const GALLERIES: Weights = { drone: 6, spitter: 1.6, shieldback: 0.8 };
const LANTERN: Weights = { dustwing: 5, skitterer: 4 };
const ROT: Weights = { skitterer: 6, grub: 3, honeypot: 1 };
const ROYAL: Weights = { drone: 4, hopper: 2, stinger: 2, spitter: 1, shieldback: 0.6, skitterer: 2, honeypot: 0.6 };
const LAST: Weights = { drone: 5, hopper: 3, skitterer: 2, stinger: 1 };

export const HIVE_MISSIONS: MissionDef[] = [
  {
    id: 'breach', title: 'The Water Is Gone', sector: 0, clock: 400, tagline: 'The reservoir drained in one night. Something is climbing out of the mud.',
    density: 2, types: DRONES, pressure: 1, scouts: 9,
    intro: [
      { who: 'ruth', text: 'Dam watch to anyone awake. The reservoir is gone. All of it, since midnight.', mood: 'worried' },
      { who: 'eli', text: "There is a tear in the mud where the deep end was. It glows. I don't have a word for it.", mood: 'worried' },
      { who: 'june', text: 'Things are climbing out of it. Six legs, big as a person. Get the floodlights on so we can see what we are shooting at.', mood: 'firm' },
    ],
    // the hold-out is the last fight with everything you own: 28 Drones every 6 s for a minute (about 280, four times the first build),
    // one unbroken column out of the rift; hive.SWARM_CAP (240 alive) holds a wave back if you fall behind
    objectives: [
      { kind: 'reach', at: 'dam', r: 150, text: 'Get to the floodlights on the dam', line: { who: 'june', text: 'The breaker is at the foot of the dam wall, north across the bed. The ones walking alone are scouts. Drop a scout before it sees you and the rest never know.', mood: 'neutral' } },
      { kind: 'interact', at: 'dam', label: 'Throw the breaker', hold: 1.2, text: 'Switch on the floodlights', line: { who: 'eli', text: 'Big red handle. Throw it and hold it until the lamps catch.', mood: 'firm' } },
      { kind: 'holdout', at: 'dam', from: 'rift', seconds: 60, every: 6, count: 28, types: DRONES, text: 'Hold the dam wall', line: { who: 'ruth', text: 'Lights are up. Oh no. There is a whole column of them coming out of the tear. Hold the wall!', mood: 'worried' } },
      { kind: 'reach', at: 'rift', r: 130, text: 'Go down to the rift', line: { who: 'eli', text: 'They have stopped coming, and it is still open. Something on the far side is holding it open. Go and look. Carefully.', mood: 'worried' } },
      // the hand-over: what is on your belt when you rest is what goes down with you (sim/hive-kit.ts)
      { kind: 'camp', rest: 'Hand over the long guns and rest', text: 'Make camp at the mouth of the rift, then rest', line: { who: 'mara', text: 'The way down is a rope, and a rope takes you and your belt. Sidearm, blade, what you are wearing. Leave me the long guns: I need them to hold this wall. You get every piece back when that thing is shut.', mood: 'firm' } },
    ],
    outro: [
      { who: 'june', text: 'I have started a new map. Page one: a hole.', mood: 'neutral' },
      { who: 'mara', text: 'I hold the dam with the wounded and your rifles. Ruth has the radio. You have a handgun and three hundred rounds. Make them count.', mood: 'firm' },
    ],
    caches: [
      { at: 'dam', items: [{ id: 'ammo_9mm', qty: 48 }, { id: 'ammo_12g', qty: 12 }, { id: 'bandage', qty: 2 }] },
      { at: 'camp', items: [{ id: 'ammo_9mm', qty: 48 }, { id: 'ammo_556', qty: 60 }, { id: 'medkit' }] },
    ],
  },
  {
    id: 'warrens', title: 'Follow the Column', sector: 1, clock: 480, tagline: 'Amber light, narrow tunnels, and the sound of a thousand feet.',
    density: 3, types: WARRENS, bossHp: 1, scouts: 16, swarm: { cap: 60, every: 20, size: [8, 14] }, handOver: true,
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
      { kind: 'camp', rest: 'Rest at the camp', text: 'Make camp at the seal, then rest', line: { who: 'eli', text: 'The seal on the door has gone dull. It was alive, that seal, and it is dying with the big one. Make camp. It will have fallen in by the time you have eaten.', mood: 'relieved' } },
    ],
    outro: [
      { who: 'eli', text: 'One lock on the far door just went dark. There are six. Five more of those things.', mood: 'worried' },
      { who: 'mara', text: 'Kit is bringing the camp down to you. What they carry is what you fight with now: your rifles stay on this wall. Eat something. Sleep if you can.', mood: 'firm' },
    ],
    caches: [
      // the first crate is the only one with bullets: you have no insect gun yet. 'ammo_sidearm' is whatever the handgun on your belt
      // fires, counted in pistol magazines (60 = five reloads). Every crate after it holds ichor.
      { at: 'trail', items: [{ id: 'ammo_sidearm', qty: 60 }, { id: 'ammo_sidearm', qty: 60 }, { id: 'bandage', qty: 2 }] },
      { at: 'cache', items: [{ id: 'ichor', qty: 160 }, { id: 'ichor', qty: 80 }, { id: 'medkit' }, { id: 'ichor', qty: 120 }] },
      { at: 'camp', items: [{ id: 'ichor', qty: 120 }, { id: 'ichor', qty: 120 }, { id: 'ichor', qty: 120 }, { id: 'royal_jelly' }, { id: 'medkit' }] },
    ],
  },
  // ------------------------------------------------------------------ steps 2 to 4: the cells beyond the Warrens.
  // Your old kit is with Mara for all of them, so every crate holds ichor (and what heals), never bullets. Every camp ends
  // with a held key (`rest`), each cell is tougher than the last (`tough`), and the swarm is bigger.
  {
    id: 'granary', title: 'The Choir', sector: 2, clock: 480, tagline: 'One vast cavern, rows of fungus, and no wall to put your back against.',
    density: 3, types: GRANARY, pressure: 1, bossHp: 1, scouts: 20, swarm: { cap: 110, every: 16, size: [10, 16] }, tough: { hp: 1.6, dmg: 1.35 }, hazard: 'lanes',
    intro: [
      { who: 'june', text: 'Green light. One room, bigger than the reservoir was. Rows of something growing, and rock pillars.', mood: 'neutral' },
      { who: 'eli', text: 'The ones that jump do not care about a doorway. Keep moving sideways, and use anything that hits more than one.', mood: 'firm' },
      { who: 'ruth', text: 'When a strip of the floor lights up, a cloud of them is about to sweep it. Step out of the strip.', mood: 'worried' },
    ],
    objectives: [
      { kind: 'reach', at: 'g_cross', r: 160, text: 'Cross the open cavern', line: { who: 'june', text: 'There is a sound in there, under the wings. Three of them, taking turns. Find them.', mood: 'neutral' } },
      { kind: 'clear', at: 'g_choir', count: 3, types: { shrieker: 1 }, r: 330, text: 'Silence the three Shriekers', line: { who: 'eli', text: 'Every time one of those screams, everything in earshot comes at a run. They glow before they do it. Kill them first.', mood: 'firm' } },
      { kind: 'holdout', at: 'g_pillar', seconds: 70, every: 6, count: 16, types: { hopper: 5, drone: 2 }, squad: true, text: 'Hold the rock pillar while the cloud passes', line: { who: 'ruth', text: 'Ada, Ben, Kit and Lewis are coming down to you. Put the pillar at your backs. Here comes the cloud.', mood: 'worried' } },
      { kind: 'boss', at: 'g_arena', boss: 'famine', hp: 1, fixed: true, text: 'Kill Famine', line: { who: 'mara', text: 'It leaves the ground and you lose it. Watch the floor for its shadow, then hit it while it is stuck.', mood: 'firm' } },
      { kind: 'camp', rest: 'Rest at the camp', text: 'Make camp at the seal, then rest', line: { who: 'eli', text: 'Second lock is dark. Four to go.', mood: 'relieved' } },
    ],
    outro: [
      { who: 'june', text: 'Page three. I am drawing the rows in. I do not want to know what they were growing them for.', mood: 'neutral' },
      { who: 'mara', text: 'The next one is yellow, and it hums. Check your pockets for bandages before you go in.', mood: 'firm' },
    ],
    caches: [
      { at: 'g_cross', items: [{ id: 'ichor', qty: 120 }, { id: 'ichor', qty: 100 }, { id: 'ichor', qty: 120 }, { id: 'bandage', qty: 2 }] },
      { at: 'g_pillar', items: [{ id: 'ichor', qty: 160 }, { id: 'ichor', qty: 120 }, { id: 'medkit' }] },
      { at: 'camp', items: [{ id: 'ichor', qty: 160 }, { id: 'royal_jelly' }, { id: 'medkit' }, { id: 'ichor', qty: 180 }] },
    ],
  },
  {
    id: 'paper', title: 'Paper Walls', sector: 3, clock: 480, tagline: 'Six-sided rooms, yellow light through the walls, and wings.',
    density: 3, types: PAPER, pressure: 1, bossHp: 1, scouts: 16, swarm: { cap: 100, every: 16, size: [8, 12] }, tough: { hp: 1.7, dmg: 1.4 },
    intro: [
      { who: 'june', text: 'A comb. Small rooms, six sides each, one after another, and the light comes through the walls.', mood: 'neutral' },
      { who: 'mara', text: 'These ones fly, and every sting stays in you for a few seconds. Three stings at once is a lot. Do not stand in a crowd of them.', mood: 'firm' },
      { who: 'eli', text: 'Back into a doorway so they can only come from one side. A shotgun was made for this.', mood: 'firm' },
    ],
    objectives: [
      { kind: 'reach', at: 'p_combs', r: 160, text: 'Find the brood combs', line: { who: 'june', text: 'The cells in the next rooms are capped. Something is finishing growing in them.', mood: 'worried' } },
      { kind: 'burrows', at: 'p_combs', count: 4, fixture: 'comb', text: 'Destroy the four brood combs', line: { who: 'eli', text: 'Break them from the doorway. If you stand next to one, it opens.', mood: 'firm' } },
      { kind: 'pickup', at: 'p_cache', item: 'needler', text: 'Take the Needler from the paper store', line: { who: 'june', text: 'Something long and yellow in that store. It is not one of ours. Take it.', mood: 'neutral' } },
      { kind: 'reach', at: 'p_atrium', r: 150, text: 'Cross the comb to the atrium', line: { who: 'ruth', text: 'The big room at the end has no cells in it at all. She is in there.', mood: 'worried' } },
      { kind: 'boss', at: 'p_arena', boss: 'vespa', hp: 1, fixed: true, text: 'Kill Matriarch Vespa', line: { who: 'mara', text: 'When her comb lights up, shoot the cells before they open. She holds still while they ripen. That is your chance.', mood: 'firm' } },
      { kind: 'camp', rest: 'Rest at the camp', text: 'Make camp at the seal, then rest', line: { who: 'eli', text: 'Three dark. Halfway round.', mood: 'relieved' } },
    ],
    outro: [
      { who: 'ruth', text: 'You are halfway round the ring. I can hear you better than I could at the start. I do not know why.', mood: 'neutral' },
      { who: 'eli', text: 'The next one is hot. I can feel it through the rope from up here.', mood: 'worried' },
    ],
    caches: [
      { at: 'p_combs', items: [{ id: 'ichor', qty: 120 }, { id: 'ichor', qty: 120 }, { id: 'bandage', qty: 3 }] },
      { at: 'p_cache', items: [{ id: 'ichor', qty: 200 }, { id: 'medkit' }] },
      { at: 'camp', items: [{ id: 'ichor', qty: 160 }, { id: 'royal_jelly' }, { id: 'medkit' }, { id: 'ichor', qty: 200 }] },
    ],
  },
  {
    id: 'galleries', title: 'Pressure', sector: 4, clock: 480, tagline: 'Three rings of gallery around a core of steam.',
    density: 3, types: GALLERIES, pressure: 1, bossHp: 1, scouts: 18, swarm: { cap: 120, every: 15, size: [10, 16] }, tough: { hp: 1.8, dmg: 1.45 }, hazard: 'vents',
    intro: [
      { who: 'eli', text: 'Steam vents, on a clock. The floor glows before one goes. It scalds them as badly as it scalds you, so let them walk into it.', mood: 'firm' },
      { who: 'june', text: 'The big beetles have a plate in front and nothing gets through it. Go round, burn them, or let acid eat it.', mood: 'neutral' },
      { who: 'mara', text: 'The ones that spray plant their feet first and cannot turn once they start. Step aside and hit them from the side.', mood: 'firm' },
    ],
    objectives: [
      { kind: 'reach', at: 'b_vents', r: 160, text: 'Get into the galleries past the steam vents', line: { who: 'eli', text: 'Count them. Five seconds, each one. Walk when it has just fired.', mood: 'firm' } },
      { kind: 'pickup', at: 'b_cache', item: 'bombardier', text: 'Take the Bombardier from the scalded crates', line: { who: 'june', text: 'There is something in those crates that burns. You are going to want it for the plated ones.', mood: 'neutral' } },
      { kind: 'burrows', at: 'b_gallery', count: 3, text: 'Collapse the three burrows in the long gallery', line: { who: 'mara', text: 'That gallery is straight and wide. It is where they build up speed. Close the holes before you walk down it.', mood: 'firm' } },
      { kind: 'boss', at: 'b_arena', boss: 'goliath', hp: 1, fixed: true, text: 'Kill Goliath', line: { who: 'ruth', text: 'It is as big as the truck. Shots to the front do nothing. Get rock between you and it and let it run.', mood: 'worried' } },
      { kind: 'camp', rest: 'Rest at the camp', text: 'Make camp at the seal, then rest', line: { who: 'eli', text: 'Four. And that horn is yours now, if you can lift it.', mood: 'relieved' } },
    ],
    outro: [
      { who: 'june', text: 'The next page of the map is black. I have nothing to draw. There is no light in it at all.', mood: 'worried' },
      { who: 'mara', text: 'Your lamp is the only light in the next one, and things come to it. Remember you can switch it off.', mood: 'firm' },
    ],
    caches: [
      { at: 'b_vents', items: [{ id: 'ichor', qty: 160 }, { id: 'ichor', qty: 120 }, { id: 'bandage', qty: 3 }] },
      { at: 'b_gallery', items: [{ id: 'carapace_vest' }, { id: 'ichor', qty: 160 }, { id: 'medkit' }] },
      { at: 'camp', items: [{ id: 'ichor', qty: 200 }, { id: 'royal_jelly' }, { id: 'medkit' }, { id: 'ichor', qty: 120 }] },
    ],
  },
  {
    id: 'lantern', title: 'Lights Out', sector: 5, clock: 480, tagline: 'A forest of stone, and no light but yours.',
    density: 2, types: LANTERN, pressure: 1, bossHp: 1, scouts: 12, swarm: { cap: 70, every: 18, size: [6, 10] }, tough: { hp: 1.9, dmg: 1.5 }, lurkers: 12,
    intro: [
      { who: 'june', text: 'Thin pillars, hundreds of them, and nothing glows. Your lamp is all there is.', mood: 'worried' },
      { who: 'eli', text: 'The moths come to the lamp. Switch it off and they lose you in a couple of seconds. Their dust shortens the beam.', mood: 'firm' },
      { who: 'mara', text: 'Some of them stand against the pillars and wait. You will not see one until the beam is on it. Sweep the stone before you walk past.', mood: 'firm' },
    ],
    objectives: [
      { kind: 'reach', at: 'l_dark', r: 160, text: 'Cross the pillar forest', line: { who: 'ruth', text: 'There is a click, just before one of them moves. Listen for it.', mood: 'worried' } },
      { kind: 'pickup', at: 'l_cache', item: 'lure_lantern', text: 'Find the lantern flares', line: { who: 'eli', text: 'Something down there throws light of its own. If it draws them the way your lamp does, I want you to have it.', mood: 'neutral' } },
      { kind: 'burrows', at: 'l_cocoons', count: 3, fixture: 'cocoon', text: 'Cut down the three cocoons', line: { who: 'mara', text: 'Silk. Some of those have our supplies in them. Some have something folded up inside. Open them from as far away as you can.', mood: 'firm' } },
      { kind: 'boss', at: 'l_arena', boss: 'prioress', hp: 1, fixed: true, text: 'Kill the Prioress', line: { who: 'ruth', text: 'I can hear her on your radio and you cannot see her. Keep the beam on her. Outside the light she is not there.', mood: 'worried' } },
      { kind: 'camp', rest: 'Rest at the camp', text: 'Make camp at the seal, then rest', line: { who: 'eli', text: 'Five. One more, and the middle opens.', mood: 'relieved' } },
    ],
    outro: [
      { who: 'ruth', text: 'You have been down there a long time. Say something now and then, so I know.', mood: 'worried' },
      { who: 'june', text: 'The last one before the middle smells. I can smell it on the rope.', mood: 'neutral' },
    ],
    caches: [
      { at: 'l_dark', items: [{ id: 'ichor', qty: 160 }, { id: 'ichor', qty: 200 }, { id: 'bandage', qty: 3 }] },
      { at: 'l_cache', items: [{ id: 'ichor', qty: 200 }, { id: 'medkit' }] },
      { at: 'camp', items: [{ id: 'ichor', qty: 200 }, { id: 'royal_jelly' }, { id: 'medkit' }, { id: 'ichor', qty: 180 }] },
    ],
  },
  {
    id: 'rot', title: 'What They Keep', sector: 6, clock: 480, tagline: 'Low cellars, grey light, and everything the hive has killed.',
    density: 3, types: ROT, pressure: 1, bossHp: 1, scouts: 20, swarm: { cap: 130, every: 13, size: [10, 18] }, tough: { hp: 2, dmg: 1.55 },
    intro: [
      { who: 'june', text: 'This is where they keep what they have killed. Do not look at it for long.', mood: 'worried' },
      { who: 'eli', text: 'The roaches run from your light and come round behind you. One in three gets back up, unless it burned or was blown apart.', mood: 'firm' },
      { who: 'mara', text: 'Fire and acid. Keep your back to the rock.', mood: 'firm' },
    ],
    objectives: [
      { kind: 'reach', at: 'r_cellar', r: 160, text: 'Go down into the cellars', line: { who: 'ruth', text: 'There is a larder further in. June says it is the biggest room on her page.', mood: 'worried' } },
      { kind: 'burrows', at: 'r_heaps', count: 4, fixture: 'heap', text: 'Destroy the four corpse heaps before they hatch', line: { who: 'eli', text: 'Those heaps are full of grubs. Burn them or blow them apart before you get close.', mood: 'firm' } },
      { kind: 'boss', at: 'r_arena', boss: 'carrion_lord', hp: 1, fixed: true, text: 'Kill the Carrion Lord', line: { who: 'mara', text: 'It lays in the dead. Every heap you leave is three more grubs. Break the heaps when they light up, and stay out of the bile.', mood: 'firm' } },
      { kind: 'camp', rest: 'Rest at the camp', text: 'Make camp at the seal, then rest', line: { who: 'eli', text: 'Six. All six. The door to the middle is open.', mood: 'relieved' } },
    ],
    outro: [
      { who: 'eli', text: 'I have built something. Kit and Lewis will carry it down. It goes under the floor of her room.', mood: 'firm' },
      { who: 'mara', text: 'Everything you have met is in the middle at once. Load every insect gun you have, and fill up on ichor.', mood: 'firm' },
    ],
    caches: [
      { at: 'r_cellar', items: [{ id: 'ichor', qty: 160 }, { id: 'ichor', qty: 120 }, { id: 'bandage', qty: 3 }] },
      { at: 'r_heaps', items: [{ id: 'ichor', qty: 200 }, { id: 'medkit' }, { id: 'ichor', qty: 120 }] },
      { at: 'camp', items: [{ id: 'ichor', qty: 240 }, { id: 'royal_jelly' }, { id: 'medkit' }, { id: 'medkit' }, { id: 'ichor', qty: 200 }] },
    ],
  },
  {
    id: 'seals', title: 'Six Seals', sector: 7, clock: 480, tagline: 'All six locks are dark. Her guard is waiting.',
    density: 4, types: ROYAL, pressure: 1, scouts: 34, swarm: { cap: 150, every: 12, size: [12, 18] }, tough: { hp: 2.1, dmg: 1.6 }, campSite: 'q_ante',
    intro: [
      { who: 'june', text: 'A ring round the outside, three ways in from the ring, and one room in the middle. Violet light. That is the rift, under her.', mood: 'neutral' },
      { who: 'eli', text: 'The charge has to sit under her floor. Clear the ring, then hold the way in while it is carried down.', mood: 'firm' },
      { who: 'ruth', text: 'Everyone who can walk is coming to the door with you. Nobody is staying at the dam for this.', mood: 'firm' },
    ],
    objectives: [
      { kind: 'reach', at: 'q_ring', r: 170, text: 'Enter the Royal Cell', line: { who: 'mara', text: 'That is her guard. Do not let the plated ones pin you against the wall.', mood: 'firm' } },
      { kind: 'clear', at: 'q_ring', count: 28, r: 430, text: 'Break through the guard ring', line: { who: 'eli', text: 'Thin them out. I need that ring quiet before four people carry something heavy round it.', mood: 'firm' } },
      { kind: 'holdout', at: 'q_ante', seconds: 90, every: 6, count: 26, squad: true, text: 'Hold the antechamber while the charge is carried down', line: { who: 'ruth', text: "Kit and Lewis have Eli's charge on a pole between them. Ninety seconds. Hold that door.", mood: 'worried' } },
      { kind: 'camp', rest: 'Rest at the camp', text: 'Make camp in the antechamber, then rest', line: { who: 'eli', text: 'It is set. It will not do any good while she is sitting on the anchor. Getting her off it is you.', mood: 'firm' } },
    ],
    outro: [
      { who: 'mara', text: 'She is sealed in resin and four things feed her. That is all we know. Eat. Load everything.', mood: 'firm' },
      { who: 'ruth', text: 'We kept a promise once, the four of us. Come back up and we will have kept two.', mood: 'neutral' },
    ],
    caches: [
      { at: 'q_ring', items: [{ id: 'ichor', qty: 200 }, { id: 'ichor', qty: 180 }, { id: 'ichor', qty: 120 }, { id: 'bandage', qty: 3 }] },
      { at: 'camp', items: [{ id: 'ichor', qty: 300 }, { id: 'royal_jelly' }, { id: 'royal_jelly' }, { id: 'medkit' }, { id: 'medkit' }, { id: 'ichor', qty: 200 }, { id: 'ichor', qty: 240 }] },
    ],
  },
  {
    id: 'queen', title: 'The Queen', sector: 7, clock: 480, tagline: 'She is holding it open.',
    // her health is not multiplied (tough.hp 1): 24,000, of which the first quarter is the four conduits, so 18,000 to shoot through,
    // the last 6,000 at 150%. It was 60,000 until Nate fought her: thousands of rounds for half of it.
    density: 2, types: ROYAL, pressure: 1, bossHp: 1, scouts: 0, tough: { hp: 1, dmg: 1.6 }, campSite: 'q_throne',
    intro: [
      { who: 'eli', text: 'Four conduits round the room, pumping jelly into the resin. While any of them stands, nothing you have will mark her.', mood: 'firm' },
      { who: 'mara', text: 'When the resin goes she will lay. When she tears loose she will come for you, and the rift will pull at your feet.', mood: 'firm' },
      { who: 'june', text: 'When she falls, she falls on the anchor. Then you can see the heart. Page ten. Last page.', mood: 'neutral' },
    ],
    objectives: [
      { kind: 'boss', at: 'q_throne', boss: 'queen', hp: 1, fixed: true, text: 'Kill the Queen', line: { who: 'ruth', text: 'All of North Ridge is on this channel. Go.', mood: 'firm' } },
      { kind: 'camp', rest: 'Catch your breath', text: 'Take what she dropped, then catch your breath', line: { who: 'eli', text: 'She is off the anchor. The rift is closing on its own, and it will take the whole hive with it. You have minutes. The shaft the charge came down is the fast way up.', mood: 'worried' } },
    ],
    outro: [
      { who: 'mara', text: 'Up the shaft. Now. Everything that is left down there is coming up behind you.', mood: 'worried' },
      { who: 'ruth', text: 'The sky is going grey out here. Run toward it.', mood: 'relieved' },
    ],
    caches: [
      { at: 'q_ante', items: [{ id: 'ichor', qty: 300 }, { id: 'ichor', qty: 300 }, { id: 'royal_jelly' }, { id: 'medkit' }] },   // at your feet when you set out
      { at: 'camp', items: [{ id: 'ichor', qty: 300 }, { id: 'royal_jelly' }, { id: 'medkit' }, { id: 'medkit' }, { id: 'ichor', qty: 240 }, { id: 'ichor', qty: 120 }] },
    ],
  },
  {
    id: 'daylight', title: 'Daylight', sector: 0, clock: 30, tagline: 'The rift is closing, with everything that is left behind you.',
    density: 4, types: LAST, pressure: 1, scouts: 0, tough: { hp: 2.2, dmg: 1.6 }, startAt: 'rift', campSite: 'dam', dawn: true, lockbox: true,
    intro: [
      { who: 'ruth', text: 'You are out. I can see you. Do not stop: they are coming out of the tear behind you.', mood: 'worried' },
      { who: 'eli', text: 'The charge fires from the breaker on the dam wall. Get to the wall. We hold it until the tear is small enough, then you throw the handle.', mood: 'firm' },
      { who: 'mara', text: 'Everyone is on the wall. Run.', mood: 'firm' },
    ],
    objectives: [
      { kind: 'reach', at: 'dam', r: 170, limit: 45, text: 'Run for the dam wall', line: { who: 'june', text: 'North, across the bed. The floodlights. You know the way.', mood: 'firm' } },
      { kind: 'holdout', at: 'dam', from: 'rift', seconds: 75, every: 5, count: 30, squad: true, text: 'Hold the dam wall until the rift is small enough', line: { who: 'ruth', text: 'Here is all of it. Everything that was left. Hold the wall!', mood: 'worried' } },
      { kind: 'interact', at: 'dam', label: 'Throw the breaker', hold: 1.5, text: "Fire Eli's charge", line: { who: 'eli', text: 'Now. The red handle. Throw it and hold it.', mood: 'firm' } },
      { kind: 'camp', rest: 'Sit down', text: 'It is over. Take your kit back from the lockbox, then sit down on the wall.', line: { who: 'mara', text: 'It is shut. Look at it. It is just mud. Your guns are in the box by the breaker, every piece, like I said.', mood: 'relieved' } },
    ],
    outro: [
      { who: 'june', text: 'I am going to keep the map. Nobody will believe the map.', mood: 'neutral' },
      { who: 'ruth', text: 'Two promises. Come and eat.', mood: 'relieved' },
    ],
    caches: [
      { at: 'dam', items: [{ id: 'ichor', qty: 300 }, { id: 'ichor', qty: 240 }, { id: 'ichor', qty: 120 }, { id: 'ichor', qty: 200 }, { id: 'medkit' }] },
    ],
  },
];
