// Evidence that a Gate passed on a tree, so the PR gate can skip re-proving
// what QA already verified (SF-103). The key is the working tree minus
// doc-only paths, so a Docs commit on top of a verified tree still matches;
// anything else (a code change, a merge resolution, a new toolchain, a changed
// command) misses and the Gate runs again. CI runs every Gate regardless.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { git } from './git.mjs';

// Paths that never change what a Gate proves. Shared with ci.mjs's docs-only skip.
export const DOCS = /(^docs\/|\.md$|^LICENSE)/;

// A hash of every tracked and untracked (not ignored) file outside the
// doc-only paths, as it is in the working tree: its content and its mode (the
// index's, or the working tree's when an unstaged change altered it). Null when
// git can't list them, or when the repo has a submodule, whose checkout the key
// can't represent: then nothing is ever reused.
export function treeKey(root) {
  const staged = git(root, 'ls-files', '-s', '-z');
  const listed = git(root, 'ls-files', '-co', '--exclude-standard', '--deduplicate', '-z');
  const raw = git(root, 'diff', '--raw', '-z');
  if (staged === null || listed === null || raw === null) return null;

  const modes = new Map();
  for (const entry of staged.split('\0').filter(Boolean)) {
    const [meta, file] = entry.split('\t');
    const mode = meta.split(' ')[0];
    if (mode === '160000') return null;
    modes.set(file, mode);
  }
  // `git diff --raw -z`: ":old new oldsha newsha status\0path\0" per unstaged change.
  const parts = raw.split('\0');
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const [, newMode] = parts[i].replace(/^:/, '').split(' ');
    if (newMode && newMode !== '000000') modes.set(parts[i + 1], newMode);
  }

  const files = [...new Set(listed.split('\0').filter(Boolean))]
    .filter((f) => !DOCS.test(f) && fs.existsSync(path.join(root, f)) && fs.statSync(path.join(root, f)).isFile())
    .sort();
  const hashes = files.length
    ? spawnSync('git', ['hash-object', '--stdin-paths'], { cwd: root, input: files.join('\n'), encoding: 'utf8' })
    : { status: 0, stdout: '' };
  if (hashes.status !== 0) return null;
  const lines = hashes.stdout.trim().split('\n').filter(Boolean);
  const sum = crypto.createHash('sha256');
  files.forEach((f, i) => sum.update(`${f}\0${modes.get(f) ?? 'untracked'}\0${lines[i]}\n`));
  return sum.digest('hex');
}

// The versions a Gate's result depends on beyond the tree, probed in `root`,
// where the Gates run (a rustup override is per directory).
export function toolchain(root) {
  const version = (cmd) => {
    const r = spawnSync(cmd, ['--version'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32', windowsHide: true });
    return r.status === 0 ? r.stdout.trim() : null;
  };
  return { node: version('node'), rustc: version('rustc') };
}

const file = (root) => {
  const p = git(root, 'rev-parse', '--git-path', 'factory/gates/evidence.json');
  return p && path.resolve(root, p);
};

export function readEvidence(root) {
  try {
    return JSON.parse(fs.readFileSync(file(root), 'utf8'));
  } catch {
    return {};
  }
}

// Records that `command` passed on `key` with `tools`, run by `by` (qa, pr-gate).
export function recordPass(root, command, key, tools, by) {
  const p = file(root);
  if (!p || !key) return;
  const all = readEvidence(root);
  all[command] = { key, toolchain: tools, by, at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(all, null, 2));
}

// Forgets `command`'s evidence: its latest result was a failure.
export function forget(root, command) {
  const p = file(root);
  const all = readEvidence(root);
  if (!p || !(command in all)) return;
  delete all[command];
  fs.writeFileSync(p, JSON.stringify(all, null, 2));
}

// The evidence that lets `command` be skipped on `key` with `tools`, or null.
export function matchingEvidence(evidence, command, key, tools) {
  const e = evidence[command];
  if (!e || !key || e.key !== key) return null;
  if (e.toolchain?.node !== tools.node || e.toolchain?.rustc !== tools.rustc) return null;
  return e;
}
