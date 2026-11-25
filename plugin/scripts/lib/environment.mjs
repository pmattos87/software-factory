// What a failing Gate's output says about WHY it failed (SF-146). A Gate that
// fails for the machine's sake (no node_modules, a locked build artifact, a
// test runner that never started) says nothing about the code, so the Run
// must not send the Subtask back to a builder with nothing to fix. And a test
// that fails under load and passes alone is flaky, not broken.

import fs from 'node:fs';
import path from 'node:path';
import { quote } from './scope.mjs';
import { installCommand } from './package-manager.mjs';

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
export const stripAnsi = (s) => s.replace(ANSI, '');

// The environment signatures. One entry per cause: `test(output, ctx)` is true
// when the output shows it, `fix` is what the Orchestrator does about it (a
// string, or `fix(ctx)` when it names the project's install command, SF-151). A
// new signature is one more entry. ctx = { root, action } (action: 'full' | 'related').
export const SIGNATURES = [
  {
    name: 'no-tests-collected',
    // A related run with no related tests ends the same way and is not an environment problem.
    test: (out, { action }) => action !== 'related' && (/No test files found/i.test(out) || /^\s*Tests\s+no tests\s*$/m.test(out)),
    fix: ({ root }) =>
      `The test runner collected no tests: run the Gates from \`git rev-parse --show-toplevel\` as printed, and install dependencies (\`${installCommand(root)}\`) if node_modules is missing.`,
  },
  {
    name: 'missing-dependency',
    test: (out, { root }) => {
      const wanted = [...out.matchAll(/Cannot find (?:module|package) '([^']+)'/g)].map((m) => m[1]);
      // A relative or aliased specifier is code; a bare package that isn't installed is the machine.
      const bare = (s) => !/^[./~#]/.test(s) && !/^@\//.test(s);
      const missing = (s) => !fs.existsSync(path.join(root, 'node_modules', ...s.split('/').slice(0, s.startsWith('@') ? 2 : 1)));
      return wanted.length > 0 && wanted.every((s) => bare(s) && missing(s));
    },
    fix: ({ root }) => `A package is missing from node_modules: run \`${installCommand(root)}\`.`,
  },
  {
    name: 'missing-tool',
    test: (out) =>
      /'?(?:tsc|vitest|biome|eslint|prettier|vite)'? is not recognized as an internal or external command/i.test(out) ||
      /(?:^|[\s:])(?:tsc|vitest|biome|eslint|prettier|vite): (?:command )?not found/m.test(out),
    fix: ({ root }) => `A tool is missing from node_modules/.bin: run \`${installCommand(root)}\`.`,
  },
  {
    name: 'locked-build-artifact',
    test: (out) => /\(os error 5\)/.test(out) || /Access is denied\./i.test(out),
    fix: 'A running program holds a build artifact (a debug app in target\debug, say): ask Pedro to close it, then rerun.',
  },
  {
    name: 'test-runner-did-not-start',
    test: (out) =>
      /failed to find the runner/i.test(out) ||
      /Failed to start (?:forks|threads|worker)/i.test(out) ||
      (/Cannot read properties of undefined \(reading 'config'\)/.test(out) && /vitest/i.test(out)),
    fix: 'The test runner failed to start, often from a mistyped working directory (a lowercase drive letter): run the Gates from `git rev-parse --show-toplevel` as printed.',
  },
];

// The first signature the output shows, or null: a real failure.
export function matchEnvironment(output, ctx) {
  const out = stripAnsi(output);
  const s = SIGNATURES.find((sig) => sig.test(out, ctx));
  if (!s) return null;
  return { ...s, fix: typeof s.fix === 'function' ? s.fix(ctx) : s.fix };
}

// The tests a failed run names. Vitest: ` FAIL  src/a.test.ts > suite > name`
// (files and full names); cargo: `test mod::name ... FAILED`. Empty when the
// output names none, and then nothing is rerun.
export function failingTests(output) {
  const out = stripAnsi(output);
  const files = [];
  const names = [];
  for (const m of out.matchAll(/^\s*FAIL\s+(\S+\.(?:test|spec)\.[cm]?[jt]sx?)\b(.*)$/gm)) {
    if (!files.includes(m[1])) files.push(m[1]);
    names.push(`${m[1]} ${m[2].replace(/\s+\[.*$/, '')}`.trim().replace(/\s+/g, ' '));
  }
  if (files.length) return { kind: 'vitest', targets: files, names: [...new Set(names)] };
  const cargo = [...new Set([...out.matchAll(/^test (\S+) \.\.\. FAILED$/gm)].map((m) => m[1]))];
  if (cargo.length) return { kind: 'cargo', targets: cargo, names: cargo };
  return null;
}

// The Gate's full command narrowed to the failing tests, or null when it can't
// be done safely: vitest files appended to a vitest command (or, behind a
// package-manager script, after `--`), cargo test names appended to `cargo test`.
export function rerunCommand(gateCmd, failures, platform = process.platform) {
  if (!failures) return null;
  const quoted = failures.targets.map((t) => (failures.kind === 'cargo' ? t : quote(t, platform)));
  if (quoted.includes(null) || (failures.kind === 'cargo' && !failures.targets.every((t) => /^[\w:]+$/.test(t)))) return null;
  if (failures.kind === 'cargo') return /\bcargo test\b/.test(gateCmd) ? `${gateCmd} ${quoted.join(' ')}` : null;
  if (/\bvitest\b/.test(gateCmd) && !/\bvitest\s+related\b/.test(gateCmd)) return `${gateCmd} ${quoted.join(' ')}`;
  if (/^(?:npm|pnpm|yarn)\b.*\b(?:test|run)\b/.test(gateCmd)) return `${gateCmd} -- ${quoted.join(' ')}`;
  return null;
}
