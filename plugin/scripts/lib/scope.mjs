// What a scoped Verify runs for each Gate (SF-141): per Subtask, only the
// Gates its changes touch, and the related-tests form where a Gate has one.
// The full Gates still run once per Story, after Simplify.

import fs from 'node:fs';
import path from 'node:path';
import { git } from './git.mjs';

// Windows' command line tops out at 8191 characters; past a safe margin the
// related form would be cut off, so the Gate runs in full instead.
const MAX_COMMAND = 8000;

// The files the Subtask changed: the working tree against HEAD (staged or
// not, deletions included) plus untracked files git doesn't ignore. Null when
// git can't tell (no HEAD yet, or git unreadable): then every Gate runs in full.
export function changedFiles(root) {
  const diff = git(root, 'diff', '--name-only', '-z', 'HEAD');
  const untracked = git(root, 'ls-files', '-o', '--exclude-standard', '-z');
  if (diff === null || untracked === null) return null;
  return [...new Set(`${diff}\0${untracked}`.split('\0').filter(Boolean))].sort();
}

// True when `file` is one of `paths` or inside one (paths are normalized by config.mjs).
export const under = (file, paths) => paths.some((p) => file === p || file.startsWith(`${p}/`));

// `file` as one shell word for spawnSync's shell, or null when it can't be
// quoted safely there. POSIX sh: single quotes, each ' closed and escaped.
// cmd.exe: double quotes keep & | < > ^ literal, but nothing keeps % from
// expanding, and a file name can't hold a ".
export function quote(file, platform = process.platform) {
  if (platform === 'win32') return /[%"\r\n]/.test(file) ? null : `"${file}"`;
  return `'${file.replace(/'/g, `'\\''`)}'`;
}

// What to do with one Gate on a scoped run, given the changed files (null:
// unknown). Returns { action: 'skip', reason } | { action: 'related', cmd } |
// { action: 'full', cmd, reason? }. `exists` is injectable for tests.
export function scopeGate(gate, changed, { platform = process.platform, exists = () => true } = {}) {
  if (changed === null) return { action: 'full', cmd: gate.run, reason: 'changed files unknown' };
  const inScope = gate.paths ? changed.filter((f) => under(f, gate.paths)) : changed;
  if (gate.paths && !inScope.length) {
    return { action: 'skip', reason: `no changes under ${gate.paths.map((p) => `${p}/`).join(', ')}` };
  }
  if (!gate.related) return { action: 'full', cmd: gate.run };
  // A deleted file can't be handed to a related-tests command; what tests it
  // had is unknown, so a change made only of deletions runs the full Gate.
  const files = inScope.filter(exists);
  if (!files.length) return { action: 'full', cmd: gate.run, reason: 'no changed file to relate' };
  const quoted = files.map((f) => quote(f, platform));
  if (quoted.includes(null)) return { action: 'full', cmd: gate.run, reason: "a changed file name can't be quoted for the shell" };
  const cmd = gate.related.split('{files}').join(quoted.join(' '));
  if (cmd.length > MAX_COMMAND) return { action: 'full', cmd: gate.run, reason: 'too many changed files for one command line' };
  return { action: 'related', cmd };
}

// Exists-check against the repo root, for scopeGate.
export const existsIn = (root) => (f) => fs.existsSync(path.join(root, f));
