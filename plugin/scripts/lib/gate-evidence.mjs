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

// Each tracked file's mode, from `git ls-files -s -z` overridden by the
// unstaged changes in `git diff --raw -z` (":old new oldsha newsha status\0path\0").
// Null when the index holds a submodule (160000), whose checkout no key can
// represent.
export function fileModes(staged, raw) {
  const modes = new Map();
  for (const entry of staged.split('\0').filter(Boolean)) {
    const [meta, file] = entry.split('\t');
    const mode = meta.split(' ')[0];
    if (mode === '160000') return null;
    modes.set(file, mode);
  }
  const parts = raw.split('\0');
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const [, newMode] = parts[i].replace(/^:/, '').split(' ');
    if (newMode && newMode !== '000000') modes.set(parts[i + 1], newMode);
  }
  return modes;
}

// The mode `git add` would give an untracked file, so staging a verified file
// keeps its key: a symlink is 120000; it is 100755 only when git tracks
// executable bits (core.fileMode) and the file has one; otherwise 100644.
export function untrackedMode(stat, fileMode) {
  if (stat.isSymbolicLink()) return '120000';
  return fileMode && stat.mode & 0o111 ? '100755' : '100644';
}

// A hash of every tracked and untracked (not ignored) file outside the
// doc-only paths, as it is in the working tree: its path, its mode and its
// content. Null when git can't list them, or when the repo has a submodule:
// then nothing is ever reused.
export function treeKey(root) {
  const staged = git(root, 'ls-files', '-s', '-z');
  const listed = git(root, 'ls-files', '-co', '--exclude-standard', '--deduplicate', '-z');
  const raw = git(root, 'diff', '--raw', '-z');
  if (staged === null || listed === null || raw === null) return null;
  const modes = fileModes(staged, raw);
  if (!modes) return null;
  const fileMode = git(root, 'config', '--bool', 'core.fileMode') !== 'false';

  // A symlink (to a file or a directory) is keyed by its target, never followed:
  // retargeting it changes the key even when neither target changed.
  const lstat = (f) => {
    try {
      return fs.lstatSync(path.join(root, f));
    } catch {
      return null;
    }
  };
  const entries = [...new Set(listed.split('\0').filter(Boolean))]
    .filter((f) => !DOCS.test(f))
    .map((f) => ({ f, stat: lstat(f) }))
    .filter(({ stat }) => stat && (stat.isFile() || stat.isSymbolicLink()))
    .sort((a, b) => (a.f < b.f ? -1 : a.f > b.f ? 1 : 0));
  const files = entries.filter((e) => !e.stat.isSymbolicLink()).map((e) => e.f);
  const hashes = files.length
    ? spawnSync('git', ['hash-object', '--stdin-paths'], { cwd: root, input: files.join('\n'), encoding: 'utf8' })
    : { status: 0, stdout: '' };
  if (hashes.status !== 0) return null;
  const lines = hashes.stdout.trim().split('\n').filter(Boolean);
  const content = new Map(files.map((f, i) => [f, lines[i]]));
  const sum = crypto.createHash('sha256');
  for (const { f, stat } of entries) {
    const link = stat.isSymbolicLink();
    const mode = link ? '120000' : modes.get(f) ?? untrackedMode(stat, fileMode);
    sum.update(`${f}\0${mode}\0${link ? `link:${fs.readlinkSync(path.join(root, f))}` : content.get(f)}\n`);
  }
  return sum.digest('hex');
}

// The versions a Gate's result depends on beyond the tree, probed in `root`,
// where the Gates run (a rustup override is per directory). `spawn` is
// injectable for tests.
export function toolchain(root, spawn = spawnSync) {
  const version = (cmd) => {
    const r = spawn(cmd, ['--version'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32', windowsHide: true });
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
