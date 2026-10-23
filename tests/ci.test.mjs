// ci.mjs plan: which checks a PR, or a push to the integration branch, gets.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const CI = path.resolve(import.meta.dirname, '../plugin/scripts/ci.mjs');

const git = (dir, ...args) => {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};

function commit(dir, file, message) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), message + '\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', message);
  return git(dir, 'rev-parse', 'HEAD');
}

// Runs `ci.mjs plan` and returns its outputs as an object.
function plan(dir, env) {
  const { GITHUB_OUTPUT, GITHUB_EVENT_NAME, ...rest } = process.env;
  const r = spawnSync('node', [CI, 'plan'], { cwd: dir, encoding: 'utf8', env: { ...rest, ...env } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return Object.fromEntries(r.stdout.split('\n').filter((l) => l.includes('=')).map((l) => l.split(/=(.*)/s).slice(0, 2)));
}

let dir, base, code, docs;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-ci-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.mkdirSync(path.join(dir, '.claude'));
  fs.writeFileSync(path.join(dir, '.claude/factory.json'), JSON.stringify({
    boardKey: 'FB',
    gates: ['npm test'],
    build: ['npm run build'],
  }));
  base = commit(dir, 'README.md', 'chore: init');
  code = commit(dir, 'src/a.js', 'feat: code');
  docs = commit(dir, 'docs/a.md', 'docs: notes');
});

test('ci plan: a PR into develop gets gates, secret scan and conventions', () => {
  const out = plan(dir, { GITHUB_EVENT_NAME: 'pull_request', BASE_REF: 'develop', BASE_SHA: base, HEAD_SHA: docs });
  assert.deepEqual(JSON.parse(out.kinds), ['gates']);
  assert.equal(out['secret-scan'], 'true');
  assert.equal(out.conventions, 'true');
});

test('ci plan: a PR into main also builds, without secret scan or conventions', () => {
  const out = plan(dir, { GITHUB_EVENT_NAME: 'pull_request', BASE_REF: 'main', BASE_SHA: base, HEAD_SHA: docs });
  assert.deepEqual(JSON.parse(out.kinds), ['gates', 'build']);
  assert.equal(out['secret-scan'], 'false');
  assert.equal(out.conventions, 'false');
});

test('ci plan: a push to develop runs only the gates', () => {
  const out = plan(dir, { GITHUB_EVENT_NAME: 'push', BASE_REF: 'develop', BASE_SHA: base, HEAD_SHA: docs });
  assert.deepEqual(JSON.parse(out.kinds), ['gates']);
  assert.equal(out['secret-scan'], 'false');
  assert.equal(out.conventions, 'false');
});

test('ci plan: a push to main never builds', () => {
  const out = plan(dir, { GITHUB_EVENT_NAME: 'push', BASE_REF: 'main', BASE_SHA: base, HEAD_SHA: docs });
  assert.deepEqual(JSON.parse(out.kinds), ['gates']);
});

test('ci plan: a docs-only push skips the gates', () => {
  const out = plan(dir, { GITHUB_EVENT_NAME: 'push', BASE_REF: 'develop', BASE_SHA: code, HEAD_SHA: docs });
  assert.deepEqual(JSON.parse(out.kinds), []);
});

test('ci plan: a push with no usable before commit runs the gates', () => {
  for (const before of ['0'.repeat(40), '']) {
    const out = plan(dir, { GITHUB_EVENT_NAME: 'push', BASE_REF: 'develop', BASE_SHA: before, HEAD_SHA: docs });
    assert.deepEqual(JSON.parse(out.kinds), ['gates'], `before=${JSON.stringify(before)}`);
  }
});
