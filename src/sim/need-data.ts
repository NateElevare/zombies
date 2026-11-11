// Chapter two reuses Bellwether, travelling out from the relay and then bringing people home.
import type { CacheDef, MissionDef, Weights } from './road-data';

const STREET: Weights = { walker: 5, runner: 3, crawler: 2, bloater: 1 };
const DARK: Weights = { walker: 3, runner: 3, crawler: 4, bloater: 1 };
const SIEGE: Weights = { walker: 4, runner: 3, brute: 2, bloater: 1 };
const supplies = (at: CacheDef['at'], heavy = false): CacheDef => ({ at, items: [
  { id: 'ammo_556', qty: heavy ? 180 : 100 }, { id: 'ammo_12g', qty: 24 },
  { id: 'ammo_308', qty: 24 }, { id: 'ammo_9mm', qty: 60 }, { id: 'medkit', qty: 2 },
] });

export const NEED_MISSIONS: MissionDef[] = [
  {
    id: 'answer', title: 'One More Voice', sector: 8, clock: 45, checkpoint: 'entry',
    tagline: 'North Ridge is safe. Someone down in the city is not.', density: 9, types: STREET,
    intro: [
      { who: 'ruth', text: 'The convoy made it. We have turned the relay yard you cleared into a shelter. Then this came through: four people, trapped at St. Mercy.' },
      { who: 'mara', text: 'A nurse, a mechanic, two night porters. They have rifles, but the courtyard is surrounded. They cannot shoot their way out alone.', mood: 'worried' },
      { who: 'eli', text: 'I will keep the ridge generator running. Take your gear. Everything you learned getting here, you will need getting them back.' },
    ],
    objectives: [
      { kind: 'interact', at: 'relay', label: 'Answer the distress call', hold: 3, text: 'Answer the distress call at the relay' },
      { kind: 'pickup', at: 'motorpool', item: 'bus_battery', text: 'Collect a motor pool battery for the rescue radio' },
      { kind: 'clear', at: 'fort', count: 18, r: 700, text: 'Clear the stragglers from the fort approach' },
      { kind: 'camp', text: 'Take the west gate toward Blackpine' },
    ],
    outro: [
      { who: 'june', text: 'I put a second line on the map. This one comes back.' },
      { who: 'ruth', text: 'Their nurse is called Ada. She asked if we really meant all four of them. I told her yes.', mood: 'firm' },
    ], caches: [supplies('prevCamp'), supplies('motorpool')],
  },
  {
    id: 'backwoods', title: 'Tracks in Blackpine', sector: 7, clock: 130, checkpoint: 'entry',
    tagline: 'Follow the old road west. Leave a way home.', density: 11, types: STREET,
    intro: [
      { who: 'june', text: 'The trees look different from this direction. Ranger station first; the emergency flares should still be in the locker.' },
      { who: 'ruth', text: 'Ada says they can hear you on the hospital radio. Tell them when the route is marked.' },
    ],
    objectives: [
      { kind: 'reach', at: 'ranger', text: 'Return to Blackpine Ranger Station' },
      { kind: 'interact', at: 'ranger', label: 'Mark the return route', hold: 3, text: 'Mark a return route through the woods' },
      { kind: 'boss', at: 'clearing', boss: 'howler', hp: 0.85, outdoors: true, text: 'Silence the Howler drawing runners onto the road' },
      { kind: 'holdout', at: 'entry', seconds: 45, every: 6, count: 4, text: 'Hold the west gate while Ruth guides you through' },
      { kind: 'camp', text: 'Cross into Rustwater North' },
    ],
    outro: [{ who: 'ruth', text: 'Ada heard the flares. They know someone is coming now.', mood: 'relieved' }],
    caches: [supplies('ranger'), supplies('camp')],
  },
  {
    id: 'signal', title: 'A Light Left Burning', sector: 6, clock: 290, checkpoint: 'entry',
    tagline: 'The pumping station can light the journey home.', density: 12, types: DARK,
    intro: [
      { who: 'eli', text: 'The backup lights are out again. Reset the pump controls. We need those lamps when you come back with people who cannot see in the dark.' },
      { who: 'mara', text: 'Do not rush the rail cut. If there are crawlers down there, deal with them now.' },
    ],
    objectives: [
      { kind: 'reach', at: 'pumping', text: 'Reach the pumping station' },
      { kind: 'interact', at: 'pumping', label: 'Restore the backup lights', hold: 4, text: 'Restore the return-route lights' },
      { kind: 'holdout', at: 'pumping', seconds: 60, every: 6, count: 4, types: DARK, text: 'Hold the station while the backup power stabilizes' },
      { kind: 'clear', at: 'railcut', count: 20, r: 650, types: DARK, text: 'Sweep the rail cut for crawlers' },
      { kind: 'camp', text: 'Head south to Rustwater Yard' },
    ],
    outro: [{ who: 'eli', text: 'Lights are steady. One less thing to find by touch on the way back.', mood: 'relieved' }],
    caches: [supplies('pumping'), supplies('railcut')],
  },
  {
    id: 'approach', title: 'The Last Open Street', sector: 5, clock: 370, checkpoint: 'entry',
    tagline: 'The freight yard is between you and the hospital.', density: 13, types: SIEGE,
    intro: [
      { who: 'ruth', text: 'Their outer barricade just fell. Ada has everyone on the loading steps. They are taking turns shooting.', mood: 'worried' },
      { who: 'eli', text: 'The depot winch can clear the service lane. Make a corridor wide enough for five people, then get to Mercy.' },
    ],
    objectives: [
      { kind: 'reach', at: 'depot', text: 'Reach the depot service lane' },
      { kind: 'clear', at: 'depot', count: 22, r: 550, text: 'Clear the infected around the depot' },
      { kind: 'interact', at: 'depot', label: 'Winch the service lane open', hold: 4, text: 'Open the lane for the return journey' },
      { kind: 'holdout', at: 'entry', seconds: 55, every: 5, count: 4, text: 'Hold the east gate against the hospital spillover' },
      { kind: 'camp', text: 'Enter the St. Mercy district' },
    ],
    outro: [{ who: 'mara', text: 'Tell Ada to keep her head down. You are almost there.', mood: 'firm' }],
    caches: [supplies('depot', true), supplies('camp')],
  },
  {
    id: 'surrounded', title: 'A Group in Need', sector: 4, clock: 410, checkpoint: 'exit',
    tagline: 'Four people on the hospital steps. A whole street of dead between you.', density: 14, types: SIEGE,
    intro: [
      { who: 'ruth', text: 'Ada, Ben, Kit and Lewis. Four voices. I have been counting every time the radio comes on.', mood: 'worried' },
      { who: 'mara', text: 'Break the ring around the entrance, then get close and call them out. They have their own ammunition and will cover you on the road.' },
    ],
    objectives: [
      { kind: 'reach', at: 'hospital', text: 'Find the surrounded survivors at St. Mercy' },
      { kind: 'clear', at: 'hospital', count: 28, r: 600, text: 'Break the siege around the hospital' },
      { kind: 'boss', at: 'hospital', boss: 'plague', hp: 0.95, outdoors: true, text: 'Kill the Plague Lord blocking the escape' },
      { kind: 'rescue', at: 'hospital', text: 'Reach Ada and rally all four survivors', line: { who: 'ruth', text: 'They see you! Get them together. Nobody leaves on their own.', mood: 'relieved' } },
      { kind: 'escort', at: 'camp', text: 'Lead all four survivors to the west gate' },
      { kind: 'camp', text: 'Regroup before entering Rustwater Yard' },
    ],
    outro: [
      { who: 'ruth', text: 'Ada says they are with you. All four. She asked me to say thank you.' },
      { who: 'mara', text: 'Save the thank you for North Ridge. Now bring them home.', mood: 'firm' },
    ], caches: [supplies('hospital', true), supplies('camp')],
  },
  {
    id: 'five', title: 'Five on the Road', sector: 5, clock: 455, checkpoint: 'exit',
    tagline: 'You came alone. You leave as a squad.', density: 15, types: SIEGE,
    intro: [
      { who: 'june', text: 'Stay close enough to see each other. They will follow your route and shoot anything coming at you.' },
      { who: 'eli', text: 'The service lane is open. Get everyone to the depot, take a breath, then push north.' },
    ],
    objectives: [
      { kind: 'escort', at: 'depot', text: 'Bring the whole group to the freight depot' },
      { kind: 'holdout', at: 'depot', seconds: 65, every: 5, count: 5, text: 'Hold the depot while the group catches its breath' },
      { kind: 'boss', at: 'depot', boss: 'butcher', hp: 1, outdoors: true, text: 'Stop the Butcher pursuing the group' },
      { kind: 'escort', at: 'camp', text: 'Escort everyone to the north gate' },
      { kind: 'camp', text: 'Leave the freight yard together' },
    ],
    outro: [{ who: 'ruth', text: 'Ben says he has never been so glad to see a working gate. I told him Eli will want that in writing.', mood: 'relieved' }],
    caches: [supplies('depot', true), supplies('camp')],
  },
  {
    id: 'lamps', title: 'Under the Backup Lights', sector: 6, clock: 510, checkpoint: 'exit',
    tagline: 'Keep the group together through the dark mile.', density: 15, types: DARK,
    intro: [
      { who: 'eli', text: 'The lamps you fixed are still burning. Follow them to the pumping station.' },
      { who: 'mara', text: 'They are exhausted, but they can walk. Keep moving with them; check the map if someone falls behind.' },
    ],
    objectives: [
      { kind: 'clear', at: 'railcut', count: 24, r: 650, types: DARK, text: 'Clear the returning pack from the rail cut' },
      { kind: 'escort', at: 'pumping', text: 'Bring everyone under the pumping-station lights' },
      { kind: 'holdout', at: 'pumping', seconds: 70, every: 5, count: 5, types: DARK, text: 'Defend the group at the pumping station' },
      { kind: 'escort', at: 'camp', text: 'Guide all four survivors to the forest gate' },
      { kind: 'camp', text: 'Leave the dark mile behind' },
    ],
    outro: [{ who: 'june', text: 'Kit says the lights look like a runway. Tell her the next stop is home. Nearly.', mood: 'relieved' }],
    caches: [supplies('railcut'), supplies('pumping', true)],
  },
  {
    id: 'dawn', title: 'The Trees at Dawn', sector: 7, clock: 15, checkpoint: 'exit',
    tagline: 'The marked trail is still there. So are the runners.', density: 14, types: { runner: 6, walker: 3, crawler: 2 },
    intro: [
      { who: 'june', text: 'Your flares are burnt out, but the markers are still on the trees. Ranger station, then east to the fort.' },
      { who: 'ruth', text: 'I can hear the shooting from up here. I am leaving the gate light on.' },
    ],
    objectives: [
      { kind: 'escort', at: 'ranger', text: 'Bring the survivors to the ranger station' },
      { kind: 'holdout', at: 'ranger', seconds: 55, every: 5, count: 5, text: 'Hold the station against the runners' },
      { kind: 'boss', at: 'clearing', boss: 'broodmother', hp: 1, outdoors: true, text: 'Destroy the nest threatening the return trail' },
      { kind: 'escort', at: 'camp', text: 'Lead the squad out of Blackpine' },
      { kind: 'camp', text: 'Cross the fort gate together' },
    ],
    outro: [{ who: 'mara', text: 'I have four beds ready. Nobody is sleeping on the ground tonight.', mood: 'relieved' }],
    caches: [supplies('ranger', true), supplies('clearing')],
  },
  {
    id: 'threshold', title: 'The Last Gate', sector: 8, clock: 85, checkpoint: 'motorpool',
    tagline: 'The ridge is in sight. Open the last approach.', density: 16, types: SIEGE,
    intro: [
      { who: 'eli', text: 'The fort approach is filling up behind you. Clear a lane across the parade ground. I will open the ridge gate.' },
      { who: 'ruth', text: 'Lewis wants to know if that light on the hill is ours. Tell him yes. Tell all of them.', mood: 'relieved' },
    ],
    objectives: [
      { kind: 'clear', at: 'fort', count: 28, r: 800, text: 'Clear a lane across the parade ground' },
      { kind: 'boss', at: 'motorpool', boss: 'juggernaut', hp: 1.1, outdoors: true, text: 'Kill the Juggernaut at the ridge approach' },
      { kind: 'escort', at: 'motorpool', text: 'Get the entire group to the motor pool' },
      { kind: 'holdout', at: 'motorpool', seconds: 65, every: 5, count: 5, text: 'Hold the approach while Eli opens the ridge gate' },
      { kind: 'camp', text: 'Gather everyone for the final climb' },
    ],
    outro: [{ who: 'eli', text: 'Gate is open. Do not stop until you see Mara.', mood: 'firm' }],
    caches: [supplies('fort', true), supplies('motorpool', true)],
  },
  {
    id: 'homecoming', title: 'Room for Four More', sector: 8, clock: 160, checkpoint: 'relay',
    tagline: 'Return to the ground you won. This time, hold it together.', density: 16, types: SIEGE,
    intro: [
      { who: 'ruth', text: 'The same hill. The same relay. But this time you are not waiting for someone to rescue you.' },
      { who: 'mara', text: 'Bring them through the yard. We hold the perimeter together until Eli shuts the gate.', mood: 'firm' },
    ],
    objectives: [
      { kind: 'escort', at: 'relay', text: 'Bring all four survivors home to North Ridge' },
      { kind: 'holdout', at: 'relay', seconds: 90, every: 5, count: 6, text: 'Defend the shelter with the rescued squad' },
      { kind: 'boss', at: 'relay', boss: 'howler', hp: 1.2, outdoors: true, text: 'Silence the Howler calling the last pursuit' },
      { kind: 'holdout', at: 'relay', seconds: 75, every: 5, count: 6, text: 'Hold North Ridge until the gate is secured' },
      { kind: 'escort', at: 'camp', text: 'Bring everyone inside the safe perimeter' },
      { kind: 'camp', text: 'Welcome Ada, Ben, Kit and Lewis home' },
    ],
    outro: [
      { who: 'mara', text: 'Four beds. Four names. Four people who would not be here if you had kept walking.', mood: 'relieved' },
      { who: 'june', text: 'Ada asked what we call this place. I said North Ridge. She said she was going to call it home.', mood: 'relieved' },
      { who: 'ruth', text: 'Tomorrow I will turn the radio on again. Tonight, everyone is accounted for.', mood: 'relieved' },
    ], caches: [supplies('relay', true), supplies('camp', true)],
  },
];

export const RESCUED_GROUP = [
  { name: 'Ada', look: 'mara' }, { name: 'Ben', look: 'eli' },
  { name: 'Kit', look: 'june' }, { name: 'Lewis', look: 'ruth' },
] as const;
