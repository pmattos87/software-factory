// Runs one Review round by Codex, from the Consumer project's repo root:
//   node codex-review.mjs --request <file> --head <sha> --out <dir> [--resume <session>] [--timeout <minutes>]
// The request is the Story-specific part (brief, commits, Verify results,
// previous findings); round 1 prepends the review standard. Codex runs headless
// in a read-only sandbox and answers in the verdict schema.
//
// Prints one JSON object and exits:
//   0  {"status":"ok","session","verdict"}         a usable verdict on --head
//   2  {"status":"unavailable","reason"}           Codex missing, failed or timed out: Review waits
//   3  {"status":"invalid","reason","session"}     an answer that isn't a verdict on --head

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { findCodex, buildPrompt, codexArgs, readEvents, checkVerdict } from './lib/review.mjs';

const opts = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) opts[argv[i].replace(/^--/, '')] = argv[++i];

const done = (code, result) => {
  console.log(JSON.stringify(result, null, 2));
  process.exit(code);
};

for (const k of ['request', 'head', 'out']) {
  if (!opts[k]) done(1, { status: 'error', reason: `--${k} is required` });
}
const codex = findCodex();
if (!codex) done(2, { status: 'unavailable', reason: 'codex not found: set FACTORY_CODEX, put codex on PATH, or install the ChatGPT VS Code extension' });

fs.mkdirSync(opts.out, { recursive: true });
const verdictFile = path.resolve(opts.out, 'verdict.json');
fs.rmSync(verdictFile, { force: true });
const minutes = Number(opts.timeout ?? 30);

const r = spawnSync(codex, codexArgs({ resume: opts.resume, verdictFile }), {
  input: buildPrompt(fs.readFileSync(opts.request, 'utf8'), { resume: Boolean(opts.resume) }),
  encoding: 'utf8',
  timeout: minutes * 60_000,
  maxBuffer: 64 * 1024 * 1024,
  windowsHide: true,
});
fs.writeFileSync(path.join(opts.out, 'events.jsonl'), r.stdout ?? '');
fs.writeFileSync(path.join(opts.out, 'stderr.txt'), r.stderr ?? '');

const { session, errors } = readEvents(r.stdout ?? '');
if (r.error?.code === 'ETIMEDOUT') done(2, { status: 'unavailable', reason: `codex timed out after ${minutes} min`, session });
if (r.error) done(2, { status: 'unavailable', reason: r.error.message, session });
if (r.status !== 0 || errors.length) {
  const tail = (r.stderr ?? '').trim().split('\n').slice(-5).join(' | ');
  done(2, { status: 'unavailable', reason: errors[0] ?? `codex exited ${r.status}: ${tail}`, session });
}

let verdict = null;
try { verdict = JSON.parse(fs.readFileSync(verdictFile, 'utf8')); } catch {}
const problems = checkVerdict(verdict, opts.head);
if (problems.length) done(3, { status: 'invalid', reason: problems.join('; '), session });
done(0, { status: 'ok', session, verdict });
