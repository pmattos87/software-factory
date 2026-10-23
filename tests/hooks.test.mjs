// Each hook against a planted violation in a throwaway repo, and the same
// action done right, which must pass.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const SCRIPTS = path.resolve(import.meta.dirname, '../plugin/scripts');

function runHook(hook, command, cwd, env = {}) {
  const r = spawnSync('node', [path.join(SCRIPTS, `${hook}.mjs`)], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd }),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { blocked: r.status === 2, status: r.status, stderr: r.stderr };
}

const git = (dir, ...args) => {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};

function repo(config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-test-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'Test');
  if (config) {
    fs.mkdirSync(path.join(dir, '.claude'));
    fs.writeFileSync(path.join(dir, '.claude/factory.json'), JSON.stringify(config));
  }
  fs.writeFileSync(path.join(dir, 'README.md'), 'hi\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'chore: init');
  git(dir, 'branch', 'develop');
  return dir;
}

// Built at runtime so this file never holds a literal token.
const fakeToken = () => 'ghp_' + crypto.randomBytes(27).toString('base64').replace(/[^a-zA-Z0-9]/g, 'x').slice(0, 36);

// A stand-in for flowboard-cli `story show`: the Stories' reviews come from
// FAKE_STORIES ({ key: review }, or "legacy" for a legacy project's Story).
const FAKE_CLI = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fake-cli-')), 'flowboard-cli.mjs');
fs.writeFileSync(FAKE_CLI, `
const key = process.argv[4];
const s = JSON.parse(process.env.FAKE_STORIES || '{}')[key];
const fail = (error) => { console.error(JSON.stringify({ error })); process.exit(1); };
if (s === 'legacy') fail(key + ' belongs to a legacy project; the Factory does not write to it');
if (!s) fail(key + ' not found');
console.log(JSON.stringify({ key, review: s }));
`);
process.env.FLOWBOARD_CLI = FAKE_CLI;
const reviewed = (key, commit, verdict = 'passed') => {
  process.env.FAKE_STORIES = JSON.stringify({ [key]: { verdict, commit, findings_url: null } });
};

let dir;
before(() => {
  dir = repo({
    boardKey: 'FB',
    branches: { integration: 'develop', production: 'main' },
    gates: ['node -e "process.exit(require(\'fs\').existsSync(\'BROKEN\') ? 1 : 0)"'],
  });
});

test('protected branches: commit on main or develop is blocked', () => {
  assert.ok(runHook('protected-branches', 'git commit -m "feat: x"', dir).blocked);
  assert.ok(runHook('protected-branches', 'git checkout develop && git commit -m "feat: x"', dir).blocked);
  assert.ok(!runHook('protected-branches', 'git checkout -b feat/FB-1-x && git commit -m "feat: x"', dir).blocked);
  assert.ok(!runHook('protected-branches', 'git status', dir).blocked);
});

test('protected branches: pushes to main or develop are blocked', () => {
  git(dir, 'checkout', '-q', '-b', 'feat/FB-1-push');
  for (const cmd of ['git push origin main', 'git push origin HEAD:develop', 'git push --all', 'git push origin :main', `git -C "${dir}" push origin main`]) {
    assert.ok(runHook('protected-branches', cmd, dir).blocked, cmd);
  }
  assert.ok(!runHook('protected-branches', 'git push -u origin feat/FB-1-push', dir).blocked);
  git(dir, 'checkout', '-q', 'main');
  assert.ok(runHook('protected-branches', 'git push', dir).blocked, 'bare push from main');
  for (const cmd of ['git push --tags', 'git push origin --tags', 'git push origin v1.6.0', 'git push origin refs/tags/v1.6.0', 'git push origin --delete release/v1.6.0']) {
    assert.ok(!runHook('protected-branches', cmd, dir).blocked, `${cmd} from main`);
  }
  assert.ok(runHook('protected-branches', 'git push origin --delete develop', dir).blocked);
  assert.ok(runHook('protected-branches', 'git push --tags origin main', dir).blocked, 'tags plus a protected branch');
  git(dir, 'branch', '-q', '-D', 'feat/FB-1-push');
});

test('protected branches: names come from the project config', () => {
  const other = repo({ boardKey: 'XX', branches: { integration: 'dev', production: 'main' } });
  git(other, 'checkout', '-q', '-b', 'dev');
  assert.ok(runHook('protected-branches', 'git commit -m "feat: x"', other).blocked);
  git(other, 'checkout', '-q', 'develop');
  assert.ok(!runHook('protected-branches', 'git commit -m "feat: x"', other).blocked);
});

test('secret scan: a staged secret blocks the commit', () => {
  git(dir, 'checkout', '-q', '-b', 'feat/FB-2-secret');
  fs.writeFileSync(path.join(dir, 'config.js'), `export const token = "${fakeToken()}";\n`);
  assert.ok(!runHook('secret-scan', 'git commit -m "feat: x"', dir).blocked, 'nothing staged yet');
  const r = runHook('secret-scan', 'git add config.js && git commit -m "feat: x"', dir);
  assert.ok(r.blocked, r.stderr);
  assert.match(r.stderr, /github-pat in config\.js/);
  assert.ok(!r.stderr.includes('ghp_'), 'the secret itself is redacted');
  assert.match(r.stderr, /fingerprint config\.js:github-pat:1\]/);
  fs.writeFileSync(path.join(dir, '.gitleaksignore'), 'config.js:github-pat:1\n');
  assert.ok(!runHook('secret-scan', 'git add config.js && git commit -m "feat: x"', dir).blocked, '.gitleaksignore is honored');
  fs.rmSync(path.join(dir, '.gitleaksignore'));
  git(dir, 'add', 'config.js');
  assert.ok(runHook('secret-scan', 'git commit -m "feat: x"', dir).blocked);
});

test('secret scan: a committed secret blocks the push', () => {
  git(dir, 'commit', '-q', '-m', 'feat: leak', '--no-verify');
  assert.ok(runHook('secret-scan', 'git push -u origin feat/FB-2-secret', dir).blocked);
  git(dir, 'reset', '-q', '--hard', 'main');
  assert.ok(!runHook('secret-scan', 'git push -u origin feat/FB-2-secret', dir).blocked);
  fs.writeFileSync(path.join(dir, 'clean.js'), 'export const x = 1;\n');
  assert.ok(!runHook('secret-scan', 'git add clean.js && git commit -m "feat: x"', dir).blocked);
  fs.rmSync(path.join(dir, 'clean.js'));
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'branch', '-q', '-D', 'feat/FB-2-secret');
});

test('PR gate: conventions and gates must pass', () => {
  const create = (title, base = 'develop') => runHook('pr-gate', `gh pr create --base ${base} --title "${title}" --body x`, dir);

  git(dir, 'checkout', '-q', '-b', 'feat/FB-7-gate');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-q', '-m', 'feat(a): add a');
  reviewed('FB-7', git(dir, 'rev-parse', 'HEAD'));
  assert.ok(!create('feat: add a (FB-7)').blocked, 'compliant PR passes');

  assert.match(create('feat: add a').stderr, /Story key FB-7/);
  assert.match(create('feat: add a (FB-7)', 'main').stderr, /PR'd into develop/);

  fs.writeFileSync(path.join(dir, 'BROKEN'), '');
  git(dir, 'add', 'BROKEN');
  git(dir, 'commit', '-q', '-m', 'oops');
  assert.match(create('feat: add a (FB-7)').stderr, /isn't a conventional commit/);
  git(dir, 'commit', '-q', '--amend', '-m', 'test: break the gate');
  reviewed('FB-7', git(dir, 'rev-parse', 'HEAD'));
  assert.match(create('feat: add a (FB-7)').stderr, /Gate failed/);

  fs.writeFileSync(path.join(dir, 'a.txt'), 'changed\n');
  assert.match(create('feat: add a (FB-7)').stderr, /uncommitted changes/);
  git(dir, 'checkout', '-q', '--', 'a.txt');

  git(dir, 'checkout', '-q', '-b', 'thing');
  assert.match(create('feat: add a (FB-7)').stderr, /doesn't follow/);
  git(dir, 'checkout', '-q', 'main');
});

test('merge guard: squash, rebase, branch deletion and --admin are blocked', () => {
  for (const cmd of ['gh pr merge 7 --squash', 'gh pr merge 7 -r', 'gh pr merge 7', 'gh pr merge 7 --merge --delete-branch', 'GH_TOKEN=$(gh auth token -u bot) gh pr merge 7 --merge --admin']) {
    assert.match(runHook('merge-guard', cmd, dir).stderr, /merge-guard/, cmd);
  }
  assert.ok(!runHook('merge-guard', 'gh pr list', dir).blocked);
});

test('PR gate: a project without config is refused', () => {
  const bare = repo(null);
  assert.match(runHook('pr-gate', 'gh pr create --base develop --title x', bare).stderr, /no \.claude\/factory\.json/);
  assert.ok(!runHook('pr-gate', 'gh pr list', bare).blocked);
});

test('PR gate: a Feature branch needs a passed Review on its head', () => {
  const create = (title, base = 'develop', env) => runHook('pr-gate', `gh pr create --base ${base} --title "${title}" --body x`, dir, env);
  git(dir, 'checkout', '-q', '-b', 'feat/FB-8-review');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b\n');
  git(dir, 'add', 'b.txt');
  git(dir, 'commit', '-q', '-m', 'feat(b): add b');
  const head = git(dir, 'rev-parse', 'HEAD');

  process.env.FAKE_STORIES = JSON.stringify({ 'FB-8': { verdict: null, commit: null } });
  assert.match(create('FB-8: add b').stderr, /FB-8 has no passed Review \(not reviewed\)/);
  reviewed('FB-8', head, 'failed');
  assert.match(create('FB-8: add b').stderr, /no passed Review \(failed\)/);
  reviewed('FB-8', git(dir, 'rev-parse', 'HEAD~1'));
  assert.match(create('FB-8: add b').stderr, /Review the new head/);
  reviewed('FB-8', head.slice(0, 7));
  assert.ok(!create('FB-8: add b').blocked, 'a passed Review on the head (short SHA) opens it');

  process.env.FAKE_STORIES = '{}';
  assert.match(create('FB-8: add b').stderr, /Can't read FB-8's Review from Flowboard: FB-8 not found/);
  assert.match(create('FB-8: add b', 'develop', { FLOWBOARD_CLI: path.join(dir, 'missing.mjs') }).stderr, /flowboard-cli not found/);
  process.env.FAKE_STORIES = JSON.stringify({ 'FB-8': 'legacy' });
  assert.ok(!create('FB-8: add b').blocked, "a legacy project's Story has no Review to require");

  // A resolution branch: develop with the reviewed Feature branch merged in.
  git(dir, 'checkout', '-q', '-b', 'feat/FB-8-review-merge', 'develop');
  git(dir, 'merge', '-q', '--no-ff', '-m', 'chore: merge feat/FB-8-review into develop', 'feat/FB-8-review');
  reviewed('FB-8', head);
  assert.ok(!create('FB-8: add b').blocked, "the Feature branch's Review covers its merge into develop");
  reviewed('FB-8', git(dir, 'rev-parse', 'HEAD^1'));
  assert.match(create('FB-8: add b').stderr, /Review the new head/);

  // The other way round, develop merged into the Feature branch, needs a new Review.
  git(dir, 'checkout', '-q', 'develop');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'chore: move develop on');
  git(dir, 'checkout', '-q', '-b', 'feat/FB-8-review-back', head);
  git(dir, 'merge', '-q', '--no-ff', '-m', 'Merge develop', 'develop');
  reviewed('FB-8', head);
  assert.match(create('FB-8: add b').stderr, /Review the new head/);
  git(dir, 'checkout', '-q', 'feat/FB-8-review');

  git(dir, 'checkout', '-q', '-b', 'release/v1.2.0');
  process.env.FAKE_STORIES = '{}';
  const rel = create('Release v1.2.0', 'main');
  assert.ok(!rel.blocked, rel.stderr);
  git(dir, 'checkout', '-q', 'main');
});
