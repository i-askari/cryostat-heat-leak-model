/**
 * Test entry point.
 *
 *   node tests/run.js
 *   jsc -m tests/run.js      (JavaScriptCore, ships with macOS)
 *
 * Importing a suite registers its tests; run() executes them all.
 */

import { run } from './harness.js';

import './geometry.test.js';
import './gas.test.js';
import './format.test.js';
import './explanations.test.js';
import './charts.test.js';
import './diagrams.test.js';
import './resistances.test.js';
import './solver.test.js';
import './sweeps.test.js';
import './regression.test.js';
import './sensitivity.test.js';
import './store.test.js';

const { failed } = run();

// Report failure through the exit code where the host supports it, so CI fails.
if (failed > 0) {
  if (typeof process !== 'undefined' && process.exit) process.exit(1);
  else throw new Error(`${failed} test(s) failed`);
}
