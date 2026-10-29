// Runs the project's Gates for QA's Verify, keeping the full log and recording
// evidence the PR gate can reuse. From the project's repo root:
//   node run-gates.mjs <log file>
// Each Gate (`gates` in .claude/factory.json) runs in order; its whole output
// and exit code are appended to the log. A passing Gate is recorded only while
// the tree is still the one the run started on: once a Gate changes it, no
// later pass counts (it proves nothing about the tree it ran on). A failing
// Gate forgets any earlier pass of the same command. Exits 0 when every Gate
// passes, 1 when one fails, 2 when the project has no config.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig, CONFIG_PATH } from './lib/config.mjs';
import { treeKey, toolchain, recordPass, forget } from './lib/gate-evidence.mjs';

const ascii = (s) => s.replace(/[^\x20-\x7e]/g, '?');

const root = process.cwd();
const log = process.argv[2];
if (!log) {
  console.log('Usage: run-gates.mjs <log file>');
  process.exit(2);
}
const config = loadConfig(root);
if (!config) {
  console.log(`No ${CONFIG_PATH} here.`);
  process.exit(2);
}

fs.mkdirSync(path.dirname(path.resolve(log)), { recursive: true });
const before = treeKey(root);
const tools = toolchain(root);
let recorded = 0;
let changed = false;
let failed = false;
for (const cmd of config.gates) {
  const r = spawnSync(cmd, { cwd: root, shell: true, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const code = r.status ?? r.error?.code ?? 'killed';
  fs.appendFileSync(log, `$ ${cmd}\n${r.stdout ?? ''}${r.stderr ?? ''}\n[exit ${code}]\n\n`);
  console.log(ascii(`${code === 0 ? 'pass' : 'fail'}  ${cmd}  (exit ${code})`));
  if (code !== 0) {
    failed = true;
    forget(root, cmd);
    continue;
  }
  if (!changed && before && treeKey(root) === before) {
    recordPass(root, cmd, before, tools, 'qa');
    recorded++;
  } else {
    changed = true;
  }
}

if (recorded) console.log(`evidence recorded for ${recorded} Gate(s) on tree ${before.slice(0, 12)}`);
if (changed) console.log('The tree changed while the Gates ran: no evidence recorded from then on.');
console.log(`log: ${log}`);
process.exit(failed ? 1 : 0);
