// Finds a Chromium browser for printing a client deck to PDF, and the flags
// that print it the same way every time (learned in the SF trial, 2026-10-27).

import fs from 'node:fs';
import path from 'node:path';

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
    pathToUrl(htmlFile),
  ];
}

function pathToUrl(file) {
  const abs = path.resolve(file).split(path.sep).join('/');
  return encodeURI(`file://${abs.startsWith('/') ? '' : '/'}${abs}`);
}
