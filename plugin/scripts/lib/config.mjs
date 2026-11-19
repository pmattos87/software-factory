// A Consumer project's Factory settings, read from .claude/factory.json at its
// repo root. Shared by the hooks and the PR checks workflow.

import fs from 'node:fs';
import path from 'node:path';
import { releaseSettings } from './release.mjs';

export const CONFIG_PATH = '.claude/factory.json';

const DEFAULT_BRANCHES = { integration: 'develop', production: 'main' };

// Returns null when the project has no config file.
export function loadConfig(root) {
  const file = path.join(root, CONFIG_PATH);
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const gateScopes = normalizeGates(raw.gates);
  return {
    ...raw,
    branches: { ...DEFAULT_BRANCHES, ...raw.branches },
    gates: gateScopes.map((g) => g.run),
    gateScopes,
    build: raw.build ?? [],
    ci: raw.ci ?? {},
    agents: raw.agents ?? {},
    release: releaseSettings(raw.release),
  };
}

// Each Gate as { run, paths, related }. A Gate is a command string (always run
// in full) or an object: `run` is the full command, `paths` the repo-relative
// paths a scoped Verify must see a change under to run it at all, `related` a
// command with {files} that a scoped Verify runs on the changed files instead
// of the full one. Only `run` is what the PR gate and CI see, so `gates` stays
// a list of full commands everywhere else. A malformed entry throws: a Gate
// read wrong would be skipped or run wrong without anyone noticing.
export function normalizeGates(gates = []) {
  const bad = (i, why) => {
    throw new Error(`${CONFIG_PATH}: gates[${i}] ${why}`);
  };
  if (!Array.isArray(gates)) throw new Error(`${CONFIG_PATH}: gates must be a list of commands.`);
  return gates.map((g, i) => {
    if (typeof g === 'string') {
      if (!g.trim()) bad(i, 'is an empty command.');
      return { run: g, paths: null, related: null };
    }
    if (!g || typeof g !== 'object' || Array.isArray(g)) bad(i, 'must be a command string or an object with a "run" command.');
    const unknown = Object.keys(g).filter((k) => !['run', 'paths', 'related'].includes(k));
    if (unknown.length) bad(i, `has unknown keys: ${unknown.join(', ')} (allowed: run, paths, related).`);
    if (typeof g.run !== 'string' || !g.run.trim()) bad(i, 'needs "run": the full command, as a non-empty string.');
    let paths = null;
    if (g.paths !== undefined) {
      if (!Array.isArray(g.paths) || !g.paths.length || g.paths.some((p) => typeof p !== 'string' || !p.trim())) {
        bad(i, '"paths" must be a non-empty list of repo-relative paths.');
      }
      // Forward slashes, no leading ./ and no trailing slash, to compare with git's paths.
      paths = g.paths.map((p) => p.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/\/+$/, ''));
      if (paths.some((p) => !p || p === '.' || p.startsWith('/') || p.split('/').includes('..'))) {
        bad(i, '"paths" must be paths inside the repo, like "src-tauri/".');
      }
    }
    if (g.related !== undefined && (typeof g.related !== 'string' || !g.related.includes('{files}'))) {
      bad(i, '"related" must be a command containing {files}, like "npx vitest related --run {files}".');
    }
    return { run: g.run, paths, related: g.related ?? null };
  });
}

// The protected branch names, with defaults when the project has no config.
export function protectedBranches(root) {
  const { integration, production } = loadConfig(root)?.branches ?? DEFAULT_BRANCHES;
  return [integration, production];
}
