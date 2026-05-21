import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
function findTests(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...findTests(p));
    else if (name.endsWith('.test.mjs')) out.push(p);
  }
  return out;
}

const files = findTests(root);
let failed = 0;
run({ files }).on('test:fail', () => { failed++; }).compose(spec).pipe(process.stdout);
process.on('exit', () => { if (failed > 0) process.exitCode = 1; });
