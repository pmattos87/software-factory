// Review by Codex: where codex.exe is, what it is asked, and whether its answer
// is a usable verdict. The standard and the verdict schema live in plugin/review/.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MODEL = 'gpt-6-astra';
export const EFFORT = 'high';
export const REVIEW_DIR = path.resolve(import.meta.dirname, '../../review');
export const STANDARD = path.join(REVIEW_DIR, 'standard.md');
export const SCHEMA = path.join(REVIEW_DIR, 'verdict.schema.json');

const EXE = process.platform === 'win32' ? 'codex.exe' : 'codex';

// FACTORY_CODEX, then codex on PATH, then the newest VS Code ChatGPT extension.
export function findCodex({ env = process.env, home = os.homedir() } = {}) {
  if (env.FACTORY_CODEX) return fs.existsSync(env.FACTORY_CODEX) ? env.FACTORY_CODEX : null;
  for (const dir of (env.PATH ?? env.Path ?? '').split(path.delimiter).filter(Boolean)) {
    const file = path.join(dir, EXE);
    if (fs.existsSync(file)) return file;
  }
  const extensions = path.join(home, '.vscode', 'extensions');
  if (!fs.existsSync(extensions)) return null;
  const found = fs.readdirSync(extensions)
    .filter((d) => d.startsWith('openai.chatgpt-'))
    .map((d) => path.join(extensions, d, 'bin'))
    .flatMap((bin) => (fs.existsSync(bin) ? fs.readdirSync(bin).map((p) => path.join(bin, p, EXE)) : []))
    .filter((f) => fs.existsSync(f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return found[0] ?? null;
}

// Round 1 carries the standard; a resumed session already has it.
export function buildPrompt(request, { resume = false, standard = fs.readFileSync(STANDARD, 'utf8') } = {}) {
  if (resume) return request;
  return `${standard}\n\n---\n\n# Review request\n\n${request}\n\nAnswer with the verdict JSON only.`;
}

export function codexArgs({ resume, verdictFile }) {
  return [
    'exec',
    ...(resume ? ['resume', resume] : []),
    '-m', MODEL,
    '-c', `model_reasoning_effort="${EFFORT}"`,
    '-c', 'sandbox_mode="read-only"',
    '--output-schema', SCHEMA,
    '-o', verdictFile,
    '--json',
    '-',
  ];
}

// The session id and any error from codex exec --json output.
export function readEvents(jsonl) {
  let session = null;
  const errors = [];
  for (const line of jsonl.split('\n')) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type === 'thread.started') session = e.thread_id;
    if (e.type === 'error' || e.type === 'turn.failed') errors.push(e.message ?? e.error?.message ?? JSON.stringify(e));
  }
  return { session, errors };
}

// Problems that make an answer unusable as a verdict on `head`.
export function checkVerdict(v, head) {
  const problems = [];
  if (!v || typeof v !== 'object') return ['no verdict JSON'];
  if (!['passed', 'failed'].includes(v.verdict)) problems.push(`verdict is ${JSON.stringify(v.verdict)}`);
  if (!Array.isArray(v.blocking)) problems.push('blocking is missing');
  else if ((v.verdict === 'failed') !== (v.blocking.length > 0)) problems.push(`verdict ${v.verdict} with ${v.blocking.length} blocking finding(s)`);
  if (typeof v.commit !== 'string' || !v.commit || !(head.startsWith(v.commit) || v.commit.startsWith(head))) {
    problems.push(`reviewed commit ${v.commit} is not ${head}`);
  }
  return problems;
}
