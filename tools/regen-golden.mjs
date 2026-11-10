// Regenerates tests/golden/engine-v171.json. Run ONLY for an intended calculation change:
//   node tools/regen-golden.mjs
// then review the diff and explain the change in the commit message.
import fs from 'node:fs';
import { runProjectionEngine, runRSSEngine } from '../src/engine/index.js';
import { DEFAULT_INPUTS } from '../src/inputs/defaults.js';
import { PROFILES, RSS_PROFILES, GOLDEN_CLOCK } from '../tests/golden/profiles.js';

const run = (fn, set) => Object.fromEntries(Object.entries(set).map(([k, p]) => [k, JSON.parse(JSON.stringify(fn({ ...DEFAULT_INPUTS, ...GOLDEN_CLOCK, ...p })))]));
const out = { main: run(runProjectionEngine, PROFILES), rss: run(runRSSEngine, RSS_PROFILES) };
fs.writeFileSync(new URL('../tests/golden/engine-v171.json', import.meta.url), JSON.stringify(out));
console.log('golden written:', Object.keys(out.main).length, 'main +', Object.keys(out.rss).length, 'RSS profiles');
