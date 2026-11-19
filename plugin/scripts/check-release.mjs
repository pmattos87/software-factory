// Checks a Consumer project's release settings in .claude/factory.json, from the
// project's repo root:
//   node check-release.mjs            an Internal project
//   node check-release.mjs --client   a Client project, which also needs release.notes,
//                                     both asset sets (beta, production) with <version>,
//                                     and the Releases root in the user-level config
// Prints the current version or the problems; exits 1 when any setting fails.

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, CONFIG_PATH } from './lib/config.mjs';
import { checkRelease, readVersion } from './lib/release.mjs';
import { checkReleasesRoot, loadUserConfig, userConfigPath } from './lib/releases.mjs';

const root = process.cwd();
const client = process.argv.includes('--client');
const config = loadConfig(root);
if (!config) {
  console.log(`FAIL no ${CONFIG_PATH} in ${root}`);
  process.exit(1);
}
const { release } = config;
const problems = checkRelease(root, release, { client });
if (client) {
  try {
    problems.push(...checkReleasesRoot(loadUserConfig(), root, userConfigPath()));
  } catch (e) {
    problems.push(e.message);
  }
}
for (const p of problems) console.log(`FAIL ${p}`);
if (problems.length) process.exit(1);

const first = release.versionFiles[0];
console.log(`ok   version ${readVersion(first, fs.readFileSync(path.join(root, first), 'utf8'))} in ${release.versionFiles.join(', ')}`);
