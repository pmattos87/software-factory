// A Consumer project's Factory settings, read from .claude/factory.json at its
// repo root. Shared by the hooks and the PR checks workflow.

import fs from 'node:fs';
import path from 'node:path';

export const CONFIG_PATH = '.claude/factory.json';

const DEFAULT_BRANCHES = { integration: 'develop', production: 'main' };

// Returns null when the project has no config file.
export function loadConfig(root) {
  const file = path.join(root, CONFIG_PATH);
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    ...raw,
    branches: { ...DEFAULT_BRANCHES, ...raw.branches },
    gates: raw.gates ?? [],
    build: raw.build ?? [],
    ci: raw.ci ?? {},
    agents: raw.agents ?? {},
  };
}

// The protected branch names, with defaults when the project has no config.
export function protectedBranches(root) {
  const { integration, production } = loadConfig(root)?.branches ?? DEFAULT_BRANCHES;
  return [integration, production];
}
