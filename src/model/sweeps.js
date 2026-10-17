/**
 * Parameter sweeps built on the solver.
 *
 * Every point in every sweep is a full solve, so the curves in the analysis
 * panel are the same physics as the single-point result, not a fit or a
 * cached approximation.
 */

import { MLI_SWEEP_LAYERS, MLI_SWEEP_PRESSURE, SWEEP_P_MAX, SWEEP_P_MIN } from './constants.js';
import { regimeBoundaryPressures } from './gas.js';
import { solve } from './solver.js';

/**
 * Logarithmically spaced values, inclusive of both endpoints.
 * @param {number} startExp log10 of the first value
 * @param {number} stopExp log10 of the last value
 * @param {number} count Number of points
 * @returns {number[]}
 */
export function logspace(startExp, stopExp, count) {
  if (count === 1) return [10 ** startExp];
  const step = (stopExp - startExp) / (count - 1);
  return Array.from({ length: count }, (_, i) => 10 ** (startExp + step * i));
}

/**
 * @typedef {object} SweepPoint
 * @property {number} x Independent variable value
 * @property {import('./solver.js').ModelResult & Record<string, any>} result
 */

/**
 * Heat leak against main-vacuum pressure.
 *
 * @param {import('./constants.js').ModelInputs} inputs
 * @param {{min?: number, max?: number, count?: number}} [options]
 * @returns {SweepPoint[]}
 */
export function pressureSweep(inputs, options = {}) {
  const min = options.min ?? SWEEP_P_MIN;
  const max = options.max ?? SWEEP_P_MAX;
  const count = options.count ?? 240;

  return logspace(Math.log10(min), Math.log10(max), count).map((P) => ({
    x: P,
    result: solve({ ...inputs, P_vacuum: P }),
  }));
}

/**
 * Heat leak against MLI layer count at a fixed pressure.
 *
 * @param {import('./constants.js').ModelInputs} inputs
 * @param {{layers?: number[], pressure?: number}} [options]
 * @returns {SweepPoint[]}
 */
export function mliSweep(inputs, options = {}) {
  const layers = options.layers ?? MLI_SWEEP_LAYERS;
  const pressure = options.pressure ?? MLI_SWEEP_PRESSURE;

  return layers.map((n) => ({
    x: n,
    result: solve({ ...inputs, n_mli: n, P_vacuum: pressure }),
  }));
}

/**
 * Sweep any single numeric input over a range, holding everything else fixed.
 * Used by the sensitivity panel.
 *
 * @param {import('./constants.js').ModelInputs} inputs
 * @param {keyof import('./constants.js').ModelInputs} key
 * @param {number[]} values
 * @returns {SweepPoint[]}
 */
export function parameterSweep(inputs, key, values) {
  return values.map((v) => ({ x: v, result: solve({ ...inputs, [key]: v }) }));
}

/**
 * Find the vacuum pressure that produces a target heat leak per unit length.
 *
 * Search each continuous Knudsen branch separately with bisection on log10(P).
 * The inherited hard switches produce jumps: some targets are unreachable and
 * others have multiple solutions. Return the lowest-pressure solution found,
 * and verify the heat leak rather than treating a jump as a root.
 *
 * @param {import('./constants.js').ModelInputs} inputs
 * @param {number} targetPerLength Target heat leak [W/m]
 * @param {{min?: number, max?: number, tolerance?: number, maxIterations?: number}} [options]
 * @returns {{found: boolean, pressure: number|null,
 *            result: (import('./solver.js').ModelResult & Record<string, any>)|null,
 *            reason?: string}}
 */
export function findPressureForHeatLeak(inputs, targetPerLength, options = {}) {
  const min = options.min ?? SWEEP_P_MIN;
  const max = options.max ?? SWEEP_P_MAX;
  const tolerance = options.tolerance ?? 1e-6; // relative
  const maxIterations = options.maxIterations ?? 200;

  const fail = (reason) => ({ found: false, pressure: null, result: null, reason });
  if (!Number.isFinite(targetPerLength) || targetPerLength <= 0 ||
      !Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= min ||
      !Number.isFinite(tolerance) || tolerance <= 0 ||
      !Number.isSafeInteger(maxIterations) || maxIterations < 1) {
    return fail('Enter a positive target and a valid pressure range and search tolerance.');
  }

  const at = (P) => solve({ ...inputs, P_vacuum: P });
  const acceptable = (result) => result.finite && result.converged &&
    Math.abs(result.Q_per_length - targetPerLength) <= Math.max(1e-12, targetPerLength * 1e-5);
  const boundaries = regimeBoundaryPressures(inputs.mfp_coefficient, inputs.d_vacuum_gap);
  const cuts = [boundaries.freeMolecularBelow, boundaries.continuumAbove]
    .filter((p) => p > min && p < max).sort((a, b) => a - b);
  // A small relative offset stays on the intended side despite floating-point
  // rounding in Kn. The exact threshold is also checked as a separate point.
  const intervals = [];
  let start = min;
  for (const cut of cuts) {
    intervals.push([start, cut * (1 - 1e-12)], [cut, cut]);
    start = cut * (1 + 1e-12);
  }
  intervals.push([start, max]);

  for (const [left, right] of intervals) {
    if (left > right) continue;
    const first = at(left);
    const last = at(right);
    if (!first.finite || !last.finite || !first.converged || !last.converged) {
      return fail('The model did not converge to finite values across the search range.');
    }
    if (acceptable(first)) return { found: true, pressure: left, result: first };
    if (left === right || targetPerLength < first.Q_per_length ||
        targetPerLength > last.Q_per_length) continue;

    let lo = Math.log10(left);
    let hi = Math.log10(right);
    for (let i = 0; i < maxIterations && hi - lo > tolerance; i++) {
      const mid = (lo + hi) / 2;
      const result = at(10 ** mid);
      if (!result.finite || !result.converged) return fail('The model did not converge during the search.');
      if (result.Q_per_length < targetPerLength) lo = mid;
      else hi = mid;
    }
    const pressure = 10 ** ((lo + hi) / 2);
    const result = at(pressure);
    if (acceptable(result)) return { found: true, pressure, result };
  }
  return fail('No matching pressure was found in the search range. The target may lie outside the range or in a jump at a gas-regime boundary.');
}
