// Prints the filled deck to PDF with headless Edge or Chrome:
//   node print-pdf.mjs <deck.html> <out.pdf>
// Exits 0 with the PDF written; 2 when no browser is found (ask Pedro where
// one is, or to set FACTORY_BROWSER: there is no fallback); 1 when the print
// fails. Uses a private profile in a temp folder and removes it afterwards;
// it never touches a browser that is already open.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { findBrowser, printArgs } from '../../../scripts/lib/browser.mjs';

const [html, pdf] = process.argv.slice(2);
if (!html || !pdf) {
  console.log('Usage: print-pdf.mjs <deck.html> <out.pdf>');
  process.exit(1);
}
const browser = findBrowser();
if (!browser) {
  console.log('No Edge or Chrome found. Ask Pedro where one is (FACTORY_BROWSER=<path>); do not fall back to another format.');
  process.exit(2);
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-print-'));
const out = path.resolve(pdf);
fs.rmSync(out, { force: true });
const r = spawnSync(browser, printArgs(html, out, profile), { encoding: 'utf8', timeout: 120000, windowsHide: true });
// Edge's launcher can exit before the headless process writes the file: wait
// for it to appear and stop growing.
await settled(out, 60000);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* still held by the browser; it's in temp */ }

if (!fs.existsSync(out) || fs.statSync(out).size === 0) {
  console.log(`Print failed (exit ${r.status ?? r.error?.code}): ${(r.stderr || '').trim().split('\n').slice(-5).join(' | ')}`);
  process.exit(1);
}
console.log(`${pdf}: ${Math.round(fs.statSync(out).size / 1024)} KB, printed with ${path.basename(browser)}`);

async function settled(file, ms) {
  const size = () => (fs.existsSync(file) ? fs.statSync(file).size : -1);
  let last = -1;
  for (const end = Date.now() + ms; Date.now() < end; ) {
    await new Promise((r) => setTimeout(r, 500));
    const now = size();
    if (now > 0 && now === last) return;
    last = now;
  }
}
