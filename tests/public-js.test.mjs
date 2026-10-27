import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// Browser scripts are served as written (no build step), so a syntax slip
// only shows up as a broken page. Parse every one.
function jsFiles(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? jsFiles(p) : p.endsWith('.js') ? [p] : [];
  });
}

test('every browser script in public/ parses', () => {
  const files = jsFiles(new URL('../public', import.meta.url).pathname);
  assert.ok(files.length > 3);
  for (const f of files) assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }), f);
});
