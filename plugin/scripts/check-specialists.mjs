// Checks a Consumer project's Specialists against the Specialist contract
// (docs/specialists.md), and its tier overrides in .claude/factory.json, from
// the project's repo root:
//   node check-specialists.mjs              every agent in .claude/agents/
//   node check-specialists.mjs <name>...    only the named ones (what a Run hands work to)
// Prints one line per agent; exits 1 when any agent or override fails.

import { checkSpecialists, checkTierOverrides, projectAgents } from './lib/specialists.mjs';
import { loadConfig } from './lib/config.mjs';

const root = process.cwd();
const names = process.argv.slice(2);
const results = [
  ...checkSpecialists(root, names),
  ...checkTierOverrides(loadConfig(root)?.agents ?? {}, projectAgents(root)),
];
if (!names.length && !projectAgents(root).length) console.log('No Specialists in .claude/agents/.');
for (const { name, problems } of results) {
  console.log(problems.length ? `FAIL ${name}: ${problems.join('; ')}` : `ok   ${name}`);
}
process.exit(results.some((r) => r.problems.length) ? 1 : 0);
