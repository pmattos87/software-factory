// The PR checks workflow's logic (.github/workflows/pr-checks.yml), run from the
// Consumer project's checkout:
//   node ci.mjs plan               which checks this PR gets, written to $GITHUB_OUTPUT
//   node ci.mjs run gates|build    runs the project's commands of that kind
//   node ci.mjs conventions        branch name, PR title and commit subjects
// Reads BASE_REF, HEAD_REF, BASE_SHA, HEAD_SHA and PR_TITLE from the environment.
// On a push to the integration branch (GITHUB_EVENT_NAME=push), BASE_REF is the
// pushed branch, BASE_SHA the commit before the push and HEAD_SHA the one after.

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { git } from './lib/git.mjs';
import { loadConfig, CONFIG_PATH } from './lib/config.mjs';
import { checkPullRequest } from './lib/conventions.mjs';
import { DOCS } from './lib/gate-evidence.mjs';

const { BASE_REF, HEAD_REF, BASE_SHA, HEAD_SHA, PR_TITLE, GITHUB_OUTPUT, GITHUB_EVENT_NAME } = process.env;
const root = process.cwd();
const config = loadConfig(root);
if (!config?.boardKey) fail(`${CONFIG_PATH} with a boardKey is missing; the Factory can't tell which checks to run.`);


switch (process.argv[2]) {
  case 'plan': {
    // Which checks run into which branch: docs/spec/issues/10-pr-checks.md
    // A push runs only the gates, to warm the caches PRs restore (guardrails.md, Actions).
    const push = GITHUB_EVENT_NAME === 'push';
    const intoProduction = BASE_REF === config.branches.production;
    // A failed diff (first push, before = 000...) lists nothing, so the gates run.
    const changed = (git(root, 'diff', '--name-only', `${BASE_SHA}...${HEAD_SHA}`) ?? '').split('\n').filter(Boolean);
    const docsOnly = changed.length > 0 && changed.every((f) => DOCS.test(f));

    // A docs-only diff still lists the gates, so the `gates` check rulesets require
    // reports; the workflow skips its steps and says why (SF-90).
    const kinds = [];
    if (config.gates.length) kinds.push('gates');
    if (config.build.length && intoProduction && !push) kinds.push('build');
    output({
      kinds: JSON.stringify(kinds),
      'docs-only': String(docsOnly),
      'secret-scan': String(!intoProduction && !push),
      conventions: String(!intoProduction && !push),
      node: config.ci.node ?? '',
      rust: config.ci.rust ?? '',
      'rust-workspace': config.ci.rustWorkspace ?? '.',
      apt: (config.ci.apt ?? []).join(' '),
    });
    console.log(`${push ? 'Push to' : 'Into'} ${BASE_REF}: ${kinds.join(', ') || 'no commands'}${docsOnly ? ' (docs-only diff, gates skipped)' : ''}.`);
    break;
  }
  case 'run': {
    const kind = process.argv[3];
    for (const cmd of [...(config.ci.install ?? []), ...config[kind]]) {
      console.log(`::group::${cmd}`);
      const r = spawnSync(cmd, { cwd: root, shell: true, stdio: 'inherit' });
      console.log('::endgroup::');
      if (r.status !== 0) fail(`\`${cmd}\` failed (exit ${r.status}).`);
    }
    break;
  }
  case 'conventions': {
    const subjects = (git(root, 'log', '--no-merges', '--format=%s', `${BASE_SHA}..${HEAD_SHA}`) ?? '').split('\n').filter(Boolean);
    const problems = checkPullRequest({ ...config, head: HEAD_REF, base: BASE_REF, title: PR_TITLE, subjects });
    for (const p of problems) console.log(`::error::${p}`);
    if (problems.length) process.exit(1);
    console.log('Conventions followed.');
    break;
  }
  default:
    fail(`Unknown command ${process.argv[2]}.`);
}

function output(values) {
  const lines = Object.entries(values).map(([k, v]) => `${k}=${v}`);
  if (GITHUB_OUTPUT) fs.appendFileSync(GITHUB_OUTPUT, lines.join('\n') + '\n');
  else console.log(lines.join('\n'));
}

function fail(message) {
  console.log(`::error::${message}`);
  process.exit(1);
}
