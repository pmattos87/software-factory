// Decides whether a Run's Simplify pass changed nothing, so QA can be skipped.
// From the project's repo root, with the sha recorded just before the hand-off:
//   node check-noop.mjs <sha>
// Exits 0 and prints the Verify reason when the tree is clean and HEAD is that
// sha; exits 1 with why not (then Verify as usual); exits 2 when git can't be read.

import { checkNoop } from './lib/noop.mjs';

const ascii = (s) => s.replace(/[^\x20-\x7e\n]/g, '?');

const result = checkNoop(process.cwd(), process.argv[2]);
if (!result) {
  console.log("Can't read the repo's status or HEAD.");
  process.exit(2);
}
console.log(ascii(result.reason));
process.exit(result.skip ? 0 : 1);
