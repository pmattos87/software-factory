// Names the work on the integration branch, not yet in production, that touches
// the given files: what a split's Subtasks may depend on. From the project's
// repo root, after `git fetch origin`:
//   node check-unreleased.mjs <file...>
// Prints one line per Story (or per commit made outside a Feature branch);
// exits 2 when the branches can't be read.

import { loadConfig } from './lib/config.mjs';
import { readUnreleased, unreleasedOverlap } from './lib/unreleased.mjs';

const ascii = (s) => s.replace(/[^\x20-\x7e]/g, '?');

const root = process.cwd();
const config = loadConfig(root);
const files = process.argv.slice(2);
if (!config) {
  console.log('No .claude/factory.json here.');
  process.exit(2);
}
const entries = readUnreleased(root, config.branches);
if (!entries) {
  console.log(`Can't read origin/${config.branches.production}..origin/${config.branches.integration}; fetch first.`);
  process.exit(2);
}
const found = unreleasedOverlap(entries, files, config.boardKey);
if (!found.length) console.log('No unreleased work touches these files.');
for (const g of found) {
  const name = g.story ? `${g.story} (${g.branch})` : `${g.hash} (not from a Feature branch)`;
  const commits = g.commits.map((c) => `${c.hash} ${c.subject}`).join('; ');
  console.log(ascii(`${name}: files ${g.files.join(', ')}; commits ${commits}`));
}
