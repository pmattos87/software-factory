// The checks a builder runs before handing back (SF-149): the same per-Gate
// scoping QA's `run-gates.mjs --scoped` applies, printed as commands instead
// of run. From the project's repo root, with the Subtask's changes in the
// working tree:
//   node check-plan.mjs
// One line per Gate, in config order:
//   related <cmd>   the Gate's related-tests form on the changed files
//   full <cmd>      the whole Gate (it has no related form, or the fallback applies)
//   skip <cmd>      nothing changed under the Gate's paths: don't run it
// Exits 0, or 2 when the project has no config.

import { loadConfig, CONFIG_PATH } from './lib/config.mjs';
import { changedFiles, scopeGate, existsIn } from './lib/scope.mjs';

const ascii = (s) => s.replace(/[^\x20-\x7e]/g, '?');

const root = process.cwd();
const config = loadConfig(root);
if (!config) {
  console.log(`No ${CONFIG_PATH} here.`);
  process.exit(2);
}

const changed = changedFiles(root);
console.log(`check plan: changed files ${changed === null ? 'unknown (every Gate runs in full)' : `${changed.length} file(s)`}`);
for (const gate of config.gateScopes) {
  const plan = scopeGate(gate, changed, { exists: existsIn(root) });
  const shown = plan.action === 'skip' ? gate.run : plan.cmd;
  console.log(ascii(`${plan.action.padEnd(7)} ${shown}${plan.reason ? ` (${plan.reason})` : ''}`));
}
