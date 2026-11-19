// A Client project's two data environments (the top-level `environments` key of
// .claude/factory.json): `integration`, what Pedro tests the integration branch with,
// and `release`, what the client installs and every beta runs on. Each has a `launch`,
// an optional `build` and a `data` folder; the two never share a data folder, so the
// integration branch's migrations never move the database a beta runs on.

import path from 'node:path';

export const ENVIRONMENTS = ['integration', 'release'];

// `%NAME%` and a leading `~` expanded; { path } or { missing: NAME } for an unset variable.
export function expandPath(value, env = process.env, home = env.USERPROFILE || env.HOME) {
  let missing = null;
  let out = value.replace(/%([^%]+)%/g, (all, name) => {
    const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
    if (key === undefined) {
      missing ??= name;
      return all;
    }
    return env[key];
  });
  if (/^~(?=$|[\\/])/.test(out)) {
    if (!home) missing ??= 'HOME';
    else out = home + out.slice(1);
  }
  return missing ? { missing } : { path: out };
}

// A folder as compared: resolved against the repo root, with no trailing separator,
// in one case (Windows paths are case-insensitive).
const comparable = (p, root) => path.resolve(root, p).replace(/[\\/]+$/, '').toLowerCase();

const within = (child, parent) => child.startsWith(parent + path.sep);

// Problems with the environments; empty when both exist, each with its launch and
// data, and their data folders are apart.
export function checkEnvironments(environments, root, env = process.env) {
  const problems = [];
  const data = {};
  for (const name of ENVIRONMENTS) {
    const e = environments?.[name];
    if (!e) {
      problems.push(`environments.${name} is required on a Client project: integration testing and the client's betas never share a data folder`);
      continue;
    }
    if (!e.launch) problems.push(`environments.${name}.launch is required: the command or URL that starts it`);
    if (e.build !== undefined && !Array.isArray(e.build)) problems.push(`environments.${name}.build must be a list of commands`);
    if (!e.data) {
      problems.push(`environments.${name}.data is required: the folder that holds its database`);
      continue;
    }
    const expanded = expandPath(e.data, env);
    if (expanded.missing) problems.push(`environments.${name}.data ${e.data} uses %${expanded.missing}%, which isn't set on this machine`);
    else data[name] = comparable(expanded.path, root);
  }
  const [a, b] = [data.integration, data.release];
  if (a && b) {
    const { integration, release } = environments;
    if (a === b) problems.push(`environments.integration.data and environments.release.data are the same folder (${integration.data}, ${release.data}): give each its own`);
    else if (within(a, b) || within(b, a)) problems.push(`environments.integration.data ${integration.data} and environments.release.data ${release.data} are nested: one is inside the other`);
  }
  return problems;
}
