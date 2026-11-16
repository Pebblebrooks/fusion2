// Release rule: package.json version and the newest CHANGELOG.md entry must match.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the newest changelog entry is the package.json version', () => {
  const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  // A pre-release on a working branch is allowed: 3.4.0-studio.1
  const first = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').match(/^## (\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)/m);
  assert.match(version, /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/);
  assert.equal(first && first[1], version, 'add a CHANGELOG.md entry for this version');
});
