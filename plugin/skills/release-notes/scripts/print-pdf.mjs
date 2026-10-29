// Prints the filled deck to PDF with headless Edge or Chrome:
//   node print-pdf.mjs <deck.html> <out.pdf>
// Exits 0 with the PDF written; 2 when no browser is found (ask Pedro where
// one is, or to set FACTORY_BROWSER: there is no fallback); 1 when the print
// fails. Uses a private profile in a temp folder and removes it afterwards;
// it never touches a browser that is already open.

import { findBrowser, printPdf } from '../../../scripts/lib/browser.mjs';

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

const { ok, message } = await printPdf({ html, pdf, browser });
console.log(message);
process.exit(ok ? 0 : 1);
