/**
 * Minimal test harness.
 *
 * Deliberately dependency-free so the suite runs under any ES-module
 * runtime: `node tests/run.js`, or JavaScriptCore via
 * `jsc -m tests/run.js`. Nothing here is specific to a test framework.
 */

/* eslint-disable no-console */

const out = typeof console !== 'undefined' && console.log
  ? (s) => console.log(s)
  // JavaScriptCore's shell exposes `print` instead of `console`.
  : (s) => print(s); // eslint-disable-line no-undef

/** @type {{name: string, fn: Function, suite: string}[]} */
const tests = [];
let currentSuite = '';

export function describe(name, fn) {
  const previous = currentSuite;
  currentSuite = previous ? `${previous} > ${name}` : name;
  fn();
  currentSuite = previous;
}

export function it(name, fn) {
  tests.push({ name, fn, suite: currentSuite });
}

export class AssertionError extends Error {}

function fail(message) {
  throw new AssertionError(message);
}

export const assert = {
  ok(value, message = 'expected a truthy value') {
    if (!value) fail(`${message} (got ${format(value)})`);
  },

  equal(actual, expected, message = 'values differ') {
    if (actual !== expected) {
      fail(`${message}\n    expected: ${format(expected)}\n    actual:   ${format(actual)}`);
    }
  },

  /** Relative comparison, which is the right check for physical quantities. */
  close(actual, expected, relativeTolerance = 1e-12, message = 'values differ') {
    if (!Number.isFinite(actual)) {
      fail(`${message}: actual is not finite (${format(actual)})`);
    }
    const denominator = Math.max(Math.abs(actual), Math.abs(expected), Number.MIN_VALUE);
    const relative = Math.abs(actual - expected) / denominator;
    if (relative > relativeTolerance) {
      fail(
        `${message}\n    expected: ${format(expected)}\n    actual:   ${format(actual)}` +
        `\n    relative difference: ${relative.toExponential(3)} > ${relativeTolerance.toExponential(3)}`,
      );
    }
  },

  /** Absolute comparison, for quantities where zero is a meaningful value. */
  near(actual, expected, absoluteTolerance, message = 'values differ') {
    if (!Number.isFinite(actual)) {
      fail(`${message}: actual is not finite (${format(actual)})`);
    }
    if (Math.abs(actual - expected) > absoluteTolerance) {
      fail(
        `${message}\n    expected: ${format(expected)} +/- ${absoluteTolerance}` +
        `\n    actual:   ${format(actual)}`,
      );
    }
  },

  finite(value, message = 'expected a finite number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      fail(`${message} (got ${format(value)})`);
    }
  },

  greater(actual, threshold, message = 'expected a greater value') {
    if (!(actual > threshold)) {
      fail(`${message}: ${format(actual)} is not greater than ${format(threshold)}`);
    }
  },

  less(actual, threshold, message = 'expected a smaller value') {
    if (!(actual < threshold)) {
      fail(`${message}: ${format(actual)} is not less than ${format(threshold)}`);
    }
  },

  throws(fn, message = 'expected the call to throw') {
    let threw = false;
    try {
      fn();
    } catch {
      threw = true;
    }
    if (!threw) fail(message);
  },
};

function format(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toPrecision(12);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null || value === undefined) return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Run every registered test.
 * @returns {{passed: number, failed: number}}
 */
export function run() {
  let passed = 0;
  const failures = [];
  let lastSuite = null;

  const started = Date.now();

  for (const test of tests) {
    if (test.suite !== lastSuite) {
      out(`\n  ${test.suite}`);
      lastSuite = test.suite;
    }
    try {
      test.fn();
      passed++;
      out(`    PASS  ${test.name}`);
    } catch (error) {
      failures.push({ test, error });
      out(`    FAIL  ${test.name}`);
    }
  }

  const elapsed = Date.now() - started;

  if (failures.length > 0) {
    out('\n  Failures:');
    for (const { test, error } of failures) {
      out(`\n  ${test.suite} > ${test.name}`);
      out(`    ${error && error.message ? error.message : String(error)}`);
      if (error && error.stack && !(error instanceof AssertionError)) {
        out(`    ${error.stack}`);
      }
    }
  }

  out(
    `\n  ${passed} passed, ${failures.length} failed ` +
    `(${tests.length} total) in ${elapsed} ms\n`,
  );

  return { passed, failed: failures.length };
}
