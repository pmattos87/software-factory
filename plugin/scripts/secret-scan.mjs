// Factory hook: no commit or push that carries a secret. Scans with gitleaks
// what a `git commit` would record and the commits a `git push` would send.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readToolCall, block } from './lib/hook.mjs';
import { invocations } from './lib/shell.mjs';
import { git, repoRoot } from './lib/git.mjs';
import { parsePush } from './lib/push.mjs';

const { command, cwd } = readToolCall();
if (!/\bgit\b/.test(command)) process.exit(0);

let gitleaks; // located on first use, so other git commands don't pay for it
const stagingIn = new Set(); // repos where the command line runs `git add` before committing

for (const inv of invocations(command, cwd)) {
  if (inv.tool !== 'git') continue;
  const root = repoRoot(inv.dir);
  if (!root) continue;

  if (inv.sub === 'add') {
    stagingIn.add(root);
  } else if (inv.sub === 'commit') {
    const findings = scan(root, ['git', '--pre-commit', '--staged']);
    if (stagingIn.has(root) || commitStagesItself(inv.args)) {
      findings.push(...scan(root, ['git', '--pre-commit']), ...scanUntracked(root));
    }
    report(findings, 'commit');
  } else if (inv.sub === 'push') {
    const push = parsePush(inv.args);
    const sources = push.all ? ['--branches'] : push.refspecs.map((r) => r.src).filter(Boolean);
    const range = [...(sources.length ? sources : ['HEAD']), '--not', '--remotes'].join(' ');
    report(scan(root, ['git', `--log-opts=${range}`]), 'push');
  }
}

// `git commit -a` or `git commit <paths>` records unstaged changes too.
function commitStagesItself(args) {
  const valued = ['-m', '--message', '-F', '--file', '-C', '-c', '--author', '--date', '--fixup', '--squash', '-t', '--template'];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--all' || /^-[a-zA-Z]*a[a-zA-Z]*$/.test(a)) return true; // -a, -am…
    if (valued.includes(a)) i++;
    else if (!a.startsWith('-')) return true;
  }
  return false;
}

// Untracked files a `git add` may pick up, copied out so gitleaks scans just them.
function scanUntracked(root) {
  const files = (git(root, 'ls-files', '--others', '--exclude-standard') ?? '').split('\n').filter(Boolean);
  if (!files.length) return [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-untracked-'));
  try {
    for (const f of files) {
      fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
      fs.copyFileSync(path.join(root, f), path.join(tmp, f));
    }
    // gitleaks saw the copies, so map findings back to repo paths and apply
    // .gitleaksignore ourselves: its fingerprints name repo paths, not the copies.
    const ignorePath = path.join(root, '.gitleaksignore');
    const ignored = fs.existsSync(ignorePath) ? fs.readFileSync(ignorePath, 'utf8').split(/\r?\n/).map((l) => l.trim()) : [];
    return scan(root, ['dir', tmp])
      .map((x) => {
        const File = path.relative(tmp, x.File).split(path.sep).join('/');
        return { ...x, File, Fingerprint: `${File}:${x.RuleID}:${x.StartLine}` };
      })
      .filter((x) => !ignored.includes(x.Fingerprint));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function scan(root, args) {
  const reportFile = path.join(os.tmpdir(), `factory-gitleaks-${process.pid}-${Date.now()}.json`);
  const config = path.join(root, '.gitleaks.toml');
  gitleaks ??= findGitleaks();
  const r = spawnSync(
    gitleaks,
    [...args, '--no-banner', '--redact', '--report-format', 'json', '--report-path', reportFile,
      '--gitleaks-ignore-path', root, ...(fs.existsSync(config) ? ['--config', config] : [])],
    { cwd: root, encoding: 'utf8' },
  );
  try {
    if (r.error || (r.status !== 0 && r.status !== 1)) {
      block('secret-scan', `gitleaks failed to run, so nothing was scanned: ${r.error?.message ?? r.stderr.trim()}`);
    }
    return r.status === 1 ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : [];
  } finally {
    fs.rmSync(reportFile, { force: true });
  }
}

function report(findings, action) {
  if (!findings.length) return;
  const lines = findings.map((f) => `  - ${f.RuleID} in ${f.File}:${f.StartLine}${f.Commit ? ` (commit ${f.Commit.slice(0, 7)})` : ''} [fingerprint ${f.Fingerprint}]`);
  block(
    'secret-scan',
    `This ${action} carries ${findings.length} likely secret(s):\n${lines.join('\n')}\n` +
      'Remove the secret (and rotate it if it was ever pushed). If it is a false positive, ' +
      'add a `gitleaks:allow` comment on that line or its fingerprint to .gitleaksignore, and say so to Pedro.',
  );
}

function findGitleaks() {
  const candidates = [process.env.GITLEAKS_PATH, 'gitleaks'];
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const pkgs = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
    const dir = fs.existsSync(pkgs) && fs.readdirSync(pkgs).find((d) => d.startsWith('Gitleaks.Gitleaks_'));
    if (dir) candidates.push(path.join(pkgs, dir, 'gitleaks.exe'));
  }
  for (const c of candidates.filter(Boolean)) {
    if (!spawnSync(c, ['version']).error) return c;
  }
  block('secret-scan', 'gitleaks is not installed, so the secret scan cannot run. Install it (`winget install Gitleaks.Gitleaks`, or set GITLEAKS_PATH) and retry.');
}
