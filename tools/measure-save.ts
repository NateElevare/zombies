// No database or network access. Populate the actual seeded world's containers and a large base.
import { newGame } from '../src/sim/game';
import { serialize } from '../src/sim/save';
import { fill, makeDrop } from '../src/sim/loot';
import { create, add } from '../src/sim/inventory';
import { validCloudSave } from '../src/sim/save-validation.ts';
import { inspectJSON } from '../server/auth.ts';
const state = newGame(12345), freshBytes = Buffer.byteLength(serialize(state));
for (const container of state.containers) { fill(state, container); container.searched = true; }
for (let i = 0; i < 500; i++) {
  const inv = create(24); add(inv, 'wood', 500);
  state.structures.push({ id: `stash${i}`, type: 'stash', x: 1000 + i * 32, y: 1000, w: 32, h: 32, hp: 100, maxHp: 100, rot: 0, inv });
}
makeDrop(state, 1000, 1000, [{ id: 'scrap', qty: 10 }], 'deathbag');
const raw = serialize(state), data: unknown = JSON.parse(raw); inspectJSON(data);
if (!validCloudSave(data)) throw Error('Real simulation save failed cloud validation');
console.log(JSON.stringify({ seed: state.seed, freshBytes, searchedContainers: state.containers.length, structures: state.structures.length, populatedBytes: Buffer.byteLength(raw), requestCapBytes: 4 * 1024 * 1024 }));
