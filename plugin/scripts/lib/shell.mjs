// Splits a shell command line into simple commands, the way the hooks need to
// see it: which git/gh invocations it holds, and in which directory each runs.
// Not a full shell parser; it honors quotes, escapes and the usual separators.

import path from 'node:path';

const SEPARATORS = ['&&', '||', ';', '|', '&', '\n', '(', ')'];

export function splitCommands(line) {
  const commands = [];
  let argv = [];
  let token = null;
  let quote = null;

  const endToken = () => {
    if (token !== null) argv.push(token);
    token = null;
  };
  const endCommand = () => {
    endToken();
    if (argv.length) commands.push(argv);
    argv = [];
  };

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      else token += c;
      continue;
    }
    if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === '\\' && '"\\$`'.includes(line[i + 1])) token += line[++i];
      else token += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      token ??= '';
      continue;
    }
    if (c === '\\' && i + 1 < line.length) {
      if (line[i + 1] !== '\n') token = (token ?? '') + line[i + 1];
      i++;
      continue;
    }
    const sep = SEPARATORS.find((s) => line.startsWith(s, i));
    if (sep) {
      endCommand();
      i += sep.length - 1;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      endToken();
      continue;
    }
    token = (token ?? '') + c;
  }
  endCommand();
  return commands.map(stripAssignments).filter((a) => a.length);
}

function stripAssignments(argv) {
  let i = 0;
  while (i < argv.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[i])) i++;
  return argv.slice(i);
}

// Git Bash hands out /c/Users/... paths; Node on Windows needs C:/Users/...
export function toNativePath(p) {
  if (process.platform === 'win32') {
    const m = /^\/([a-zA-Z])(\/.*)?$/.exec(p);
    if (m) return `${m[1].toUpperCase()}:${m[2] ?? '/'}`;
  }
  return p;
}

// Walks the commands, following `cd`, and returns each git/gh invocation with
// the directory it runs in.
export function invocations(line, cwd) {
  const found = [];
  let dir = cwd;
  for (const argv of splitCommands(line)) {
    const [cmd, ...rest] = argv;
    const name = path.basename(cmd).replace(/\.exe$/i, '');
    if (name === 'cd') {
      const target = rest.find((a) => a.toLowerCase() !== '/d'); // cmd's `cd /d X`
      if (target) dir = path.resolve(dir, toNativePath(target));
    } else if (name === 'git') {
      found.push({ tool: 'git', ...parseGit(rest, dir) });
    } else if (name === 'gh') {
      found.push({ tool: 'gh', dir, sub: rest[0], args: rest.slice(1) });
    }
  }
  return found;
}

function parseGit(args, dir) {
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    const opt = args[i];
    if (opt === '-C') dir = path.resolve(dir, toNativePath(args[++i] ?? '.'));
    else if (opt === '-c' || opt === '--git-dir' || opt === '--work-tree' || opt === '--namespace') i++;
    i++;
  }
  return { dir, sub: args[i], args: args.slice(i + 1) };
}
