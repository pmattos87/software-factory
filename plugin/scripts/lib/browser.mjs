// Finds a Chromium browser for printing a client deck to PDF, and the flags
// that print it the same way every time (learned in the SF trial, 2026-10-27).

import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Where Edge and Chrome install on Windows, macOS and Linux, in order of preference.
export function browserCandidates(env = process.env) {
  const pf = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA].filter(Boolean);
  return [
    ...pf.map((d) => path.join(d, 'Microsoft/Edge/Application/msedge.exe')),
    ...pf.map((d) => path.join(d, 'Google/Chrome/Application/chrome.exe')),
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/microsoft-edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
}

// The first browser that exists, honoring FACTORY_BROWSER; null when there is none.
export function findBrowser(env = process.env, exists = fs.existsSync) {
  if (env.FACTORY_BROWSER) return exists(env.FACTORY_BROWSER) ? env.FACTORY_BROWSER : null;
  return browserCandidates(env).find((p) => exists(p)) ?? null;
}

// Headless print of a local HTML file. The page sets its own size with @page
// (1920x1080 for a deck); the virtual-time budget lets fonts and images settle.
// A private profile keeps the print away from Pedro's own browser windows.
export function printArgs(htmlFile, pdfFile, profileDir) {
  return [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profileDir}`,
    `--print-to-pdf=${pdfFile}`,
    '--no-pdf-header-footer',
    '--virtual-time-budget=8000',
    pathToFileURL(path.resolve(htmlFile)).href,
  ];
}

// Prints `html` to `pdf` with `browser` in a private temp profile, removed
// afterwards. Edge's launcher can exit before the headless process writes the
// file, so this waits up to `waitMs` for the PDF to appear and stop growing.
// `spawn` is injectable for tests. Returns { ok, message }.
export async function printPdf({ html, pdf, browser, spawn = spawnSync, waitMs = 60000, pollMs = 500 }) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-print-'));
  const out = path.resolve(pdf);
  fs.rmSync(out, { force: true });
  const r = spawn(browser, printArgs(html, out, profile), { encoding: 'utf8', timeout: 120000, windowsHide: true });
  await settled(out, waitMs, pollMs);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* still held by the browser; it's in temp */ }

  if (!fs.existsSync(out) || fs.statSync(out).size === 0) {
    const err = (r?.stderr || '').trim().split('\n').slice(-5).join(' | ');
    return { ok: false, message: `Print failed (exit ${r?.status ?? r?.error?.code}): ${err}` };
  }
  return { ok: true, message: `${pdf}: ${Math.round(fs.statSync(out).size / 1024)} KB, printed with ${path.basename(browser)}` };
}

async function settled(file, ms, pollMs) {
  const size = () => (fs.existsSync(file) ? fs.statSync(file).size : -1);
  let last = -1;
  for (const end = Date.now() + ms; Date.now() < end; ) {
    await new Promise((r) => setTimeout(r, pollMs));
    const now = size();
    if (now > 0 && now === last) return;
    last = now;
  }
}
