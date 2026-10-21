// Plumbing for PreToolUse hooks: read the tool call, block with a reason.

import fs from 'node:fs';

export function readToolCall() {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  return { command: input.tool_input?.command ?? '', cwd: input.cwd ?? process.cwd() };
}

// Exit code 2 refuses the tool call and hands the reason back to Claude.
export function block(hook, reason) {
  process.stderr.write(`[factory:${hook}] Blocked. ${reason}\n`);
  process.exit(2);
}
