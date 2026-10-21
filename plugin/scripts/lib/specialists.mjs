// The Specialist contract (docs/specialists.md): what a Consumer project's own
// agent in .claude/agents/ must declare before a Run may hand it a Subtask.

import fs from 'node:fs';
import path from 'node:path';

export const AGENTS_DIR = '.claude/agents';

export const ROLE_AGENTS = ['task-splitter', 'implementer', 'qa', 'docs'];
const MODELS = ['opus', 'sonnet', 'haiku'];
const SECTIONS = ['scope', 'definition of done'];

// Splits a Markdown agent file into its frontmatter fields and its body.
export function parseAgent(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { fields: null, body: text };
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (kv) fields[kv[1]] = kv[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return { fields, body: m[2] };
}

// Problems with one agent file against the contract; empty when it complies.
export function checkSpecialist(file, text) {
  const expected = path.basename(file, '.md');
  const { fields, body } = parseAgent(text);
  if (!fields) return ['no frontmatter block'];

  const problems = [];
  if (fields.name !== expected) problems.push(`name must be "${expected}", the file name`);
  if (ROLE_AGENTS.includes(expected)) problems.push(`"${expected}" is a Role agent's name`);
  if (!fields.description) problems.push('description is missing');
  if (!fields.model) problems.push(`model is missing (one of ${MODELS.join(', ')})`);
  else if (!MODELS.includes(fields.model)) problems.push(`model "${fields.model}" must be an alias: ${MODELS.join(', ')}`);

  const headings = [...body.matchAll(/^##\s+(.+?)\s*$/gm)].map((h) => h[1].toLowerCase());
  for (const section of SECTIONS) {
    if (!headings.includes(section)) problems.push(`"## ${section[0].toUpperCase()}${section.slice(1)}" section is missing`);
  }
  return problems;
}

// Problems with the tier overrides in factory.json's `agents`: each names a Role
// agent or one of the project's agents, with a model alias and a stated reason.
export function checkTierOverrides(agents, projectAgents = []) {
  return Object.entries(agents).flatMap(([name, o]) => {
    const problems = [];
    if (!ROLE_AGENTS.includes(name) && !projectAgents.includes(name)) problems.push('no such agent');
    if (!MODELS.includes(o?.model)) problems.push(`model must be an alias: ${MODELS.join(', ')}`);
    if (!o?.reason?.trim()) problems.push('a reason is required');
    return problems.length ? [{ name: `agents.${name}`, problems }] : [];
  });
}

// The project's agent names in .claude/agents/.
export function projectAgents(root) {
  const dir = path.join(root, AGENTS_DIR);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)) : [];
}

// Every agent file in the project, or only the named ones, with its problems.
// A named agent with no file is reported as missing.
export function checkSpecialists(root, names = []) {
  const dir = path.join(root, AGENTS_DIR);
  const all = projectAgents(root);
  return (names.length ? names : all).map((name) => {
    if (!all.includes(name)) return { name, problems: [`no ${AGENTS_DIR}/${name}.md`] };
    const file = path.join(dir, `${name}.md`);
    return { name, problems: checkSpecialist(file, fs.readFileSync(file, 'utf8')) };
  });
}
