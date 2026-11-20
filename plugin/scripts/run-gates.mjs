// Runs the project's Gates for QA's Verify, keeping the full log and recording
// evidence the PR gate can reuse. From the project's repo root:
//   node run-gates.mjs [--scoped] <log file>
// Each Gate (`gates` in .claude/factory.json) runs in order; its whole output
// and exit code are appended to the log. A passing Gate is recorded only while
// the tree is still the one the run started on: once a Gate changes it, no
// later pass counts (it proves nothing about the tree it ran on). A failing
// Gate forgets any earlier pass of the same command. Exits 0 when every Gate
// passes, 1 when one fails, 2 when the project has no config, 3 when a Gate
// failed for an environment reason (SF-146).
//
// Every Gate runs from the repo root as git reports it, whatever directory the
// script was started in.
//
// A failing Gate whose output matches a known environment signature
// (lib/environment.mjs: no node_modules, a locked build artifact, a test
// runner that never started) stops the run with exit 3, naming the signature
// and its fix; it says nothing about the code, so it records no evidence and
// forgets none. A failing test Gate is rerun once on just the failing tests
// (vitest files, cargo test names): when they pass, the Gate passes marked
// `flaky`, listing the tests, and records no evidence (it proves nothing
// about the whole tree); when they fail again the failure is real.
//
// --scoped is a Subtask's Verify (SF-141): a Gate with `paths` is skipped when
// nothing changed under them, and one with `related` runs that command on the
// changed files instead. Only a Gate run with its full command records
// evidence: a skip or a related run proves nothing about the whole tree. The
// full Gates run once per Story, after Simplify, and that run's evidence is
// what the PR gate reuses.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig, CONFIG_PATH } from './lib/config.mjs';
import { treeKey, toolchain, recordPass, forget } from './lib/gate-evidence.mjs';
import { changedFiles, scopeGate, existsIn } from './lib/scope.mjs';
import { gateRoot } from './lib/git.mjs';
import { matchEnvironment, failingTests, rerunCommand } from './lib/environment.mjs';

const ascii = (s) => s.replace(/[^\x20-\x7e]/g, '?');

const root = gateRoot(process.cwd());
const args = process.argv.slice(2);
const scoped = args.includes('--scoped');
const log = args.find((a) => a !== '--scoped');
if (!log) {
  console.log('Usage: run-gates.mjs [--scoped] <log file>');
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
const passes = [];
const flaky = [];
let treeChanged = false;
let failed = false;
let environment = null;
const changed = scoped ? changedFiles(root) : null;
if (scoped) {
  const what = changed === null ? 'unknown (every Gate runs in full)' : `${changed.length} file(s)`;
  fs.appendFileSync(log, `scoped run: changed files ${what}\n${(changed ?? []).map((f) => `  ${f}\n`).join('')}\n`);
  console.log(ascii(`scoped run: changed files ${what}`));
}
for (const gate of config.gateScopes) {
  const cmd = gate.run;
  const plan = scoped ? scopeGate(gate, changed, { exists: existsIn(root) }) : { action: 'full', cmd };
  if (plan.action === 'skip') {
    fs.appendFileSync(log, `skip ${cmd} (${plan.reason})\n\n`);
    console.log(ascii(`skip ${cmd} (${plan.reason})`));
    continue;
  }
  if (plan.reason) fs.appendFileSync(log, `full ${cmd} (${plan.reason})\n`);
  const run = (command) => {
    const r = spawnSync(command, { cwd: root, shell: true, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    const code = r.status ?? r.error?.code ?? 'killed';
    const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    fs.appendFileSync(log, `$ ${command}\n${output}\n[exit ${code}]\n\n`);
    return { code, output };
  };
  let { code, output } = run(plan.cmd);
  const tag = plan.action === 'related' ? ', related' : '';
  let isFlaky = false;
  let flakyHere = [];
  if (code !== 0) {
    const signature = matchEnvironment(output, { root, action: plan.action });
    if (signature) {
      environment = signature;
      fs.appendFileSync(log, `environment failure: ${signature.name}. ${signature.fix}\n\n`);
      console.log(ascii(`environment  ${plan.cmd}  (exit ${code}${tag})`));
      break;
    }
    // A failing test Gate gets one rerun of only the failing tests.
    const failures = failingTests(output);
    const again = rerunCommand(cmd, failures);
    if (again) {
      fs.appendFileSync(log, `rerun the failing tests once: ${failures.names.join(', ')}\n`);
      const second = run(again);
      if (second.code === 0) {
        isFlaky = true;
        code = 0;
        flaky.push(...failures.names);
        flakyHere = failures.names;
      }
    }
  }
  console.log(ascii(`${isFlaky ? 'flaky' : code === 0 ? 'pass' : 'fail'}  ${plan.cmd}  (exit ${code}${tag}${isFlaky ? `; failed, then passed on rerun: ${flakyHere.join(', ')}` : ''})`));
  // Every Gate, pass or fail, is followed by a tree check: from the first
  // change on, nothing more is recorded.
  if (!treeChanged && (!before || treeKey(root) !== before)) treeChanged = true;
  // A related run that fails forgets the full command's pass too: the latest
  // word on that Gate is a failure.
  if (code !== 0) {
    failed = true;
    forget(root, cmd);
  } else if (!treeChanged && plan.action === 'full' && !isFlaky) {
    passes.push(cmd);
  }
}

// Evidence is recorded only once the run ends without an environment failure.
if (!environment) for (const cmd of passes) recordPass(root, cmd, before, tools, 'qa');
const recorded = environment ? 0 : passes.length;
if (recorded) console.log(`evidence recorded for ${recorded} Gate(s) on tree ${before.slice(0, 12)}`);
if (!before) console.log('No tree key here (a submodule, or git unreadable): no evidence recorded.');
else if (treeChanged) console.log('The tree changed while the Gates ran: no evidence recorded from then on.');
if (flaky.length) console.log(ascii(`flaky tests (failed, then passed alone on rerun): ${flaky.join(', ')}`));
console.log(`log: ${log}`);
if (environment) {
  console.log(ascii(`environment failure: ${environment.name}. ${environment.fix}`));
  process.exit(3);
}
process.exit(failed ? 1 : 0);
