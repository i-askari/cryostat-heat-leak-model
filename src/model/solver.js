/**
 * Steady-state solver for the radial thermal-resistance network.
 *
 * The network, from the warm side inward:
 *
 *   T_amb ─┬─ convection ─┬─ T1 ─ outer wall ─ T2 ─┬─ residual gas ──┬─ T3 ─ inner wall ─ T4 ─ inner gas gap ─ T_cold
 *          └─ radiation ──┘                        ├─ radiation+MLI ─┤
 *                                                  └─ MLI contact ──┘
 * T_cold is the prescribed copper outer-surface boundary. Coolant is a
 * separately prescribed 0.01 K below it; copper resistance is not solved.
 *
 * Three resistances depend on the temperatures being solved for: the
 * external radiation conductance depends on T1, and vacuum-gap radiation and
 * MLI contact resistances depend on T2 and T3. The system is
 * solved by fixed-point iteration: evaluate the resistances at the current
 * temperature estimate, get Q from the series network, walk the temperature
 * drops back down from ambient, and repeat until the interface temperatures
 * stop moving.
 *
 * The convergence check happens before the temperature assignment. When the
 * solver converges, the returned temperatures are the iterate that produced
 * the returned Q. If it exhausts the iteration limit, the returned temperatures
 * have advanced once beyond the resistances and Q and may be inconsistent.
 * Temperature-drop and heat-flow balances hold only
 * to the iteration tolerance, not exactly; relative errors can be larger when
 * a temperature drop or heat flow is very small.
 */

import { COPPER_COOLANT_OFFSET } from './constants.js';
import { classifyRegime } from './gas.js';
import { resolveGeometry, validateInputs } from './geometry.js';
import {
  ambientResistance,
  cylindricalConductionResistance,
  innerGapResistance,
  parallel,
  radiationResistance,
  series,
  solidMliResistance,
  vacuumGasResistance,
} from './resistances.js';

/**
 * @typedef {object} ModelResult
 * @property {number} Q            Heat leak through the modelled section [W]
 * @property {number} Q_per_length Heat leak per unit length [W/m]
 * @property {number} R_total      Total series resistance [K/W]
 * @property {number} R_ambient    External convection+radiation resistance [K/W]
 * @property {number} R_cond_ow    Outer wall conduction resistance [K/W]
 * @property {number} R_gas        Vacuum-gap residual gas resistance [K/W]
 * @property {number} R_rad        Vacuum-gap radiation resistance incl. MLI [K/W]
 * @property {number} R_solid_MLI MLI contact resistance [K/W], Infinity at zero layers
 * @property {number} R_vacuum     Parallel gas, radiation and solid resistance [K/W]
 * @property {number} R_cond_iw    Inner wall conduction resistance [K/W]
 * @property {number} R_gap        Inner gas gap resistance [K/W]
 * @property {number} T1 Outer surface of outer wall [K]
 * @property {number} T2 Inner surface of outer wall [K]
 * @property {number} T3 Outer surface of inner wall [K]
 * @property {number} T4 Inner surface of inner wall [K]
 * @property {number} T_copper_outer Prescribed copper outer-surface boundary [K]
 * @property {number} T_coolant Prescribed coolant temperature [K], not a solved node
 * @property {number} Kn Vacuum-gap Knudsen number [-]
 * @property {import('./constants.js').Regime} regime
 * @property {boolean} converged
 * @property {number} iterations
 */

/**
 * Solve the network for one input set.
 *
 * Assumes the inputs are already valid; call {@link calculateCryostat} for the
 * validated entry point.
 *
 * @param {import('./constants.js').ModelInputs} inputs
 * @returns {ModelResult & Record<string, any>}
 */
export function solve(inputs) {
  const geom = resolveGeometry(inputs);

  // Temperature-independent resistances: evaluated once.
  const R_cond_ow = cylindricalConductionResistance(
    geom.r_ow_ow, geom.r_ow_in, inputs.k_outer_wall, geom.length,
  );
  const R_cond_iw = cylindricalConductionResistance(
    geom.r_in_ow, geom.r_in_in, inputs.k_inner_wall, geom.length,
  );
  const { R_gap, Kn_gap, k_air_gap, k_eff_gap, lambda_gap } = innerGapResistance(inputs, geom);
  const { R_gas, Kn, k_eff, lambda } = vacuumGasResistance(inputs.P_vacuum, inputs, geom);

  // Illustrative initialization scaled to the selected boundary temperatures.
  const temperatureSpan = inputs.T_amb - inputs.T_cold;
  let T1 = inputs.T_amb - 0.05 * temperatureSpan;
  let T2 = inputs.T_amb - 0.10 * temperatureSpan;
  let T3 = inputs.T_amb - 0.70 * temperatureSpan;
  let T4 = inputs.T_amb - 0.85 * temperatureSpan;

  let converged = false;
  let iterations = 0;
  let Q = NaN;
  let G_conv = NaN;
  let G_rad_ambient = NaN;
  let R_ambient = NaN;
  let R_rad = NaN;
  let R_solid_MLI = NaN;
  let R_vacuum = NaN;
  let R_total = NaN;

  for (let i = 0; i < inputs.max_iterations; i++) {
    iterations = i + 1;

    ({ G_conv, G_rad: G_rad_ambient, R_ambient } = ambientResistance(T1, inputs, geom));
    R_rad = radiationResistance(T2, T3, inputs.n_mli, inputs, geom);
    R_solid_MLI = solidMliResistance(T2, T3, inputs.n_mli, geom);
    R_vacuum = parallel(R_gas, R_rad, R_solid_MLI);
    R_total = series(R_ambient, R_cond_ow, R_vacuum, R_cond_iw, R_gap);

    // The same Q flows through every series element.
    Q = (inputs.T_amb - inputs.T_cold) / R_total;

    // Walk the temperature drops inward from the ambient boundary.
    const T1n = inputs.T_amb - Q * R_ambient;
    const T2n = T1n - Q * R_cond_ow;
    const T3n = T2n - Q * R_vacuum;
    const T4n = T3n - Q * R_cond_iw;

    const moved = Math.max(
      Math.abs(T1n - T1), Math.abs(T2n - T2),
      Math.abs(T3n - T3), Math.abs(T4n - T4),
    );

    if (moved < inputs.tolerance) {
      converged = true;
      break;
    }

    T1 = T1n;
    T2 = T2n;
    T3 = T3n;
    T4 = T4n;
  }

  // Ambient and vacuum branch sums should each match the series heat flow,
  // within iteration tolerance; the vacuum network has three branches.
  const Q_conv = G_conv * (inputs.T_amb - T1);
  const Q_rad_ambient = G_rad_ambient * (inputs.T_amb - T1);
  const dT_vacuum = T2 - T3;
  const Q_gas = dT_vacuum / R_gas;
  const Q_rad_vacuum = dT_vacuum / R_rad;
  const Q_solid_MLI = dT_vacuum / R_solid_MLI;
  const Q_vacuum_branches = Q_gas + Q_rad_vacuum + Q_solid_MLI;

  const result = {
    // Primary result
    Q,
    Q_per_length: Q / geom.length,
    driving_difference: temperatureSpan,

    // Resistances [K/W]
    R_total, R_ambient, R_conv: 1 / G_conv, R_rad_ambient: 1 / G_rad_ambient,
    R_cond_ow, R_gas, R_rad, R_solid_MLI, R_vacuum, R_cond_iw, R_gap,

    // Interface temperatures [K]
    T1, T2, T3, T4,
    T_copper_outer: inputs.T_cold,
    T_coolant: inputs.T_cold - COPPER_COOLANT_OFFSET,

    // Temperature drops across each series element [K]
    dT_ambient: inputs.T_amb - T1,
    dT_outer_wall: T1 - T2,
    dT_vacuum,
    vacuum_drop_fraction: dT_vacuum / temperatureSpan,
    dT_inner_wall: T3 - T4,
    dT_inner_gap: T4 - inputs.T_cold,
    Q_inner_gap: (T4 - inputs.T_cold) / R_gap,

    // Gas state
    Kn, regime: classifyRegime(Kn), k_eff_gas: k_eff, lambda_gas: lambda,
    Kn_gap, regime_gap: classifyRegime(Kn_gap), k_air_gap, k_eff_gap, lambda_gap,

    // Parallel branch detail
    G_conv, G_rad_ambient,
    Q_conv, Q_rad_ambient,
    Q_gas, Q_rad_vacuum, Q_solid_MLI,
    gas_fraction: Q_gas / Q_vacuum_branches,
    radiation_fraction: Q_rad_vacuum / Q_vacuum_branches,
    fraction_solid_MLI: Q_solid_MLI / Q_vacuum_branches,
    conv_fraction: Q_conv / (Q_conv + Q_rad_ambient),
    ambient_radiation_fraction: Q_rad_ambient / (Q_conv + Q_rad_ambient),
    resistance_shares: {
      R_ambient: R_ambient / R_total,
      R_cond_ow: R_cond_ow / R_total,
      R_vacuum: R_vacuum / R_total,
      R_cond_iw: R_cond_iw / R_total,
      R_gap: R_gap / R_total,
    },

    // Pass-through context so consumers never have to rebuild it
    geometry: geom,
    inputs,
    P_vacuum: inputs.P_vacuum,
    P_inner_gap: inputs.P_inner_gap,
    T_inner_gap: inputs.T_inner_gap,
    n_mli: inputs.n_mli,

    // Solver diagnostics
    converged,
    iterations,
  };
  // Derived branch flows and resistances can overflow even when Q is finite.
  // Do not let a partially non-finite result through the validated entry point.
  result.finite = Object.entries(result).every(([key, value]) =>
    typeof value !== 'number' || Number.isFinite(value) ||
    (key === 'R_solid_MLI' && inputs.n_mli === 0 && value === Infinity));
  return result;
}

/**
 * Validated entry point.
 *
 * Returns a discriminated result rather than throwing, so the UI can render a
 * useful message instead of a blank chart when the parameters are impossible.
 *
 * @param {import('./constants.js').ModelInputs} inputs
 * @returns {{ok: boolean, result: (ModelResult & Record<string, any>)|null,
 *            errors: import('./geometry.js').ValidationIssue[],
 *            warnings: import('./geometry.js').ValidationIssue[]}}
 */
export function calculateCryostat(inputs) {
  const { errors, warnings } = validateInputs(inputs);
  if (errors.length > 0) {
    return { ok: false, result: null, errors, warnings };
  }

  const result = solve(inputs);

  if (!result.finite) {
    return {
      ok: false,
      result: null,
      errors: [{
        key: 'model',
        message: 'The model produced a non-finite result for these parameters.',
      }],
      warnings,
    };
  }

  if (!result.converged) {
    warnings.push({
      key: 'solver',
      message:
        `The temperature iteration did not converge within ${inputs.max_iterations} ` +
        'iterations. The reported values are the last iterate.',
    });
  } else {
    // A small absolute temperature residual does not guarantee a small
    // relative heat-flow residual, especially across a low-resistance film.
    const balanceError = Math.max(
      Math.abs(result.Q_conv + result.Q_rad_ambient - result.Q),
      Math.abs(result.Q_gas + result.Q_rad_vacuum + result.Q_solid_MLI - result.Q),
    ) / Math.abs(result.Q);
    if (balanceError > 1e-3) {
      warnings.push({
        key: 'solver',
        message: `Temperature iteration converged, but a parallel-branch heat total differs ` +
          `from the series heat flow by ${(100 * balanceError).toPrecision(3)}%. ` +
          'Branch heat rates may be inaccurate at the current temperature tolerance.',
      });
    }
  }

  return { ok: true, result, errors: [], warnings };
}
