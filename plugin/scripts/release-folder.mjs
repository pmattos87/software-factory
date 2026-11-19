// Prints the folder that holds a Client Release's documents, from the project's repo root:
//   node release-folder.mjs <version>          <root>\<project>\Release <version>\
//   node release-folder.mjs <version> <n>      <root>\<project>\Release <version>\beta.<n>\
// --create makes the folder when it doesn't exist. The root is releasesRoot in the
// user-level config (~/.claude/factory.user.json, or FACTORY_USER_CONFIG); the project
// is release.documents.folder, or the repo folder's name. Exits 1 with FAIL lines
// when the root is missing.

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './lib/config.mjs';
import { checkDocuments, checkReleasesRoot, loadUserConfig, projectFolder, releaseFolder, userConfigPath } from './lib/releases.mjs';

const args = process.argv.slice(2);
const create = args.includes('--create');
const [version, beta, ...rest] = args.filter((a) => a !== '--create');
if (!/^\d+\.\d+\.\d+$/.test(version ?? '') || (beta !== undefined && !/^[1-9]\d*$/.test(beta)) || rest.length) {
  console.log('usage: node release-folder.mjs <version like 1.6.0> [beta number] [--create]');
  process.exit(2);
}

const root = process.cwd();
let user;
try {
  user = loadUserConfig();
} catch (e) {
  console.log(`FAIL ${e.message}`);
  process.exit(1);
}
const release = loadConfig(root)?.release;
const problems = [...checkReleasesRoot(user, root, userConfigPath()), ...checkDocuments(release)];
for (const p of problems) console.log(`FAIL ${p}`);
if (problems.length) process.exit(1);

const folder = releaseFolder(user.releasesRoot, projectFolder(root, release), version, beta);
if (create) fs.mkdirSync(folder, { recursive: true });
console.log(folder + path.sep);
