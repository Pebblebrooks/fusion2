// Golden-master tests: the engine must reproduce the recorded outputs exactly.
// The month is pinned (GOLDEN_CLOCK) because the first projection year is pro-rated to the next birthday.
// Regenerate the golden file ONLY for an intentional calculation change, and review the diff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runProjectionEngine, runRSSEngine } from '../src/engine/index.js';
import { DEFAULT_INPUTS } from '../src/inputs/defaults.js';
import { PROFILES, RSS_PROFILES } from './golden/profiles.js';

import { GOLDEN_CLOCK } from './golden/profiles.js';

const golden = JSON.parse(fs.readFileSync(new URL('./golden/engine-v171.json', import.meta.url), 'utf8'));

for (const [name, p] of Object.entries(PROFILES)) {
  test(`main engine — ${name}`, () => {
    const rows = JSON.parse(JSON.stringify(runProjectionEngine({ ...DEFAULT_INPUTS, ...GOLDEN_CLOCK, ...p })));
    assert.deepEqual(rows, golden.main[name]);
  });
}
for (const [name, p] of Object.entries(RSS_PROFILES)) {
  test(`RSS engine — ${name}`, () => {
    const rows = JSON.parse(JSON.stringify(runRSSEngine({ ...DEFAULT_INPUTS, ...GOLDEN_CLOCK, ...p })));
    assert.deepEqual(rows, golden.rss[name]);
  });
}
