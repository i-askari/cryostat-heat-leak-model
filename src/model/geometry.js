/**
 * Geometry resolution and input validation.
 *
 * This module is the single source of truth for the radial build. Both the
 * physics (src/model/resistances.js) and the cross-section drawing
 * (src/viz/crossSection.js) consume the same resolved geometry object, so the
 * picture cannot drift away from what is actually being solved.
 */

import { COPPER_COOLANT_OFFSET } from './constants.js';

/**
 * @typedef {object} Geometry
 * @property {number} r_cu      Copper former outer radius [m]
 * @property {number} r_in_in   Inner wall, inner radius [m]
 * @property {number} r_in_ow   Inner wall, outer radius [m]
 * @property {number} r_ow_in   Outer wall, inner radius [m]
 * @property {number} r_ow_ow   Outer wall, outer radius [m]
 * @property {number} length    Modelled axial length [m]
 * @property {number} d_inner_gap  Inner gas gap thickness [m]
 * @property {number} d_vacuum_gap Main vacuum gap thickness [m]
 * @property {number} t_inner_wall Inner wall thickness [m]
 * @property {number} t_outer_wall Outer wall thickness [m]
 */

/**
 * Build the radial stack outward from the copper radius.
 * @param {import('./constants.js').ModelInputs} inputs
 * @returns {Geometry}
 */
export function resolveGeometry(inputs) {
  const r_cu = inputs.r_cu;
  const r_in_in = r_cu + inputs.d_inner_gap;
  const r_in_ow = r_in_in + inputs.t_inner_wall;
  const r_ow_in = r_in_ow + inputs.d_vacuum_gap;
  const r_ow_ow = r_ow_in + inputs.t_outer_wall;

  return {
    r_cu,
    r_in_in,
    r_in_ow,
    r_ow_in,
    r_ow_ow,
    length: inputs.length,
    d_inner_gap: inputs.d_inner_gap,
    d_vacuum_gap: inputs.d_vacuum_gap,
    t_inner_wall: inputs.t_inner_wall,
    t_outer_wall: inputs.t_outer_wall,
  };
}

/**
 * Field-by-field constraints. `min` is exclusive: a zero-thickness wall or a
 * zero-radius copper former would make ln(r_o/r_i) degenerate, so both are
 * rejected rather than allowed to produce an infinite or zero resistance.
 */
const CONSTRAINTS = [
  { key: 'r_cu', label: 'Copper outer radius', min: 0, unit: 'm' },
  { key: 'd_inner_gap', label: 'Inner gas gap', min: 0, unit: 'm' },
  { key: 't_inner_wall', label: 'Inner wall thickness', min: 0, unit: 'm' },
  { key: 'd_vacuum_gap', label: 'Vacuum gap', min: 0, unit: 'm' },
  { key: 't_outer_wall', label: 'Outer wall thickness', min: 0, unit: 'm' },
  { key: 'length', label: 'Model length', min: 0, unit: 'm' },
  { key: 'P_vacuum', label: 'Vacuum pressure', min: 0, unit: 'Pa' },
  { key: 'P_inner_gap', label: 'Inner gap pressure', min: 0, unit: 'Pa' },
  { key: 'T_amb', label: 'Ambient temperature', min: 0, unit: 'K' },
  { key: 'T_cold', label: 'Copper outer-surface temperature', min: COPPER_COOLANT_OFFSET, unit: 'K' },
  { key: 'k_outer_wall', label: 'Outer wall conductivity', min: 0, unit: 'W/(m K)' },
  { key: 'k_inner_wall', label: 'Inner wall conductivity', min: 0, unit: 'W/(m K)' },
  { key: 'k_air', label: 'Air conductivity', min: 0, unit: 'W/(m K)' },
  { key: 'h_conv', label: 'Convection coefficient', min: 0, unit: 'W/(m^2 K)' },
  { key: 'C', label: 'Gas constant C', min: 0, unit: '-' },
  { key: 'd_air', label: 'Molecular diameter', min: 0, unit: 'm' },
  { key: 'T_inner_gap', label: 'Inner gap gas temperature', min: 0, unit: 'K' },
  { key: 'mfp_coefficient', label: 'Mean free path coefficient', min: 0, unit: 'm Pa' },
  { key: 'tolerance', label: 'Solver tolerance', min: 0, unit: 'K' },
];

/**
 * @typedef {object} ValidationIssue
 * @property {string} key    Input field the issue belongs to
 * @property {string} message Human-readable explanation
 */

/**
 * Validate an input set.
 *
 * Errors mean the model cannot produce a meaningful number and must not be
 * run. Warnings mean the model will run but the result is outside the range
 * the model's simplifying assumptions may be inappropriate.
 *
 * @param {import('./constants.js').ModelInputs} inputs
 * @returns {{errors: ValidationIssue[], warnings: ValidationIssue[]}}
 */
export function validateInputs(inputs) {
  /** @type {ValidationIssue[]} */
  const errors = [];
  /** @type {ValidationIssue[]} */
  const warnings = [];

  for (const c of CONSTRAINTS) {
    const v = inputs[c.key];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      errors.push({ key: c.key, message: `${c.label} must be a finite number.` });
    } else if (v <= c.min) {
      errors.push({
        key: c.key,
        message: c.key === 'T_cold'
          ? `Copper outer-surface temperature must exceed ${COPPER_COOLANT_OFFSET} K so the prescribed coolant is above 0 K.`
          : `${c.label} must be greater than ${c.min} ${c.unit}.`,
      });
    }
  }

  if (!Number.isSafeInteger(inputs.max_iterations) || inputs.max_iterations < 1) {
    errors.push({ key: 'max_iterations', message: 'Maximum iterations must be a positive safe integer.' });
  }

  if (!Number.isFinite(inputs.n_mli) || inputs.n_mli < 0) {
    errors.push({ key: 'n_mli', message: 'MLI layer count must be zero or more.' });
  } else if (!Number.isInteger(inputs.n_mli)) {
    errors.push({ key: 'n_mli', message: 'MLI layer count must be a whole number.' });
  }

  if (!Number.isFinite(inputs.eps_al) || inputs.eps_al <= 0 || inputs.eps_al > 1) {
    errors.push({
      key: 'eps_al',
      message: 'Emissivity must be greater than 0 and at most 1.',
    });
  }

  // Directional check: the network is driven by (T_amb - T_cold). Equal
  // temperatures give zero heat leak, reversed temperatures would make heat
  // flow outward, which the fixed ambient/cold labelling no longer describes.
  if (Number.isFinite(inputs.T_amb) && Number.isFinite(inputs.T_cold)) {
    if (inputs.T_cold >= inputs.T_amb) {
      errors.push({
        key: 'T_cold',
        message: 'Copper outer-surface temperature must be below ambient temperature.',
      });
    }
  }

  // Physical-fidelity warnings, not blocking.
  if (Number.isFinite(inputs.n_mli) && inputs.n_mli > 0 && Number.isFinite(inputs.d_vacuum_gap)) {
    // Illustrative screen only: blanket construction and compression vary.
    const minimumBlanketThickness = inputs.n_mli * 0.0002;
    if (minimumBlanketThickness > inputs.d_vacuum_gap) {
      warnings.push({
        key: 'n_mli',
        message:
          `At the illustrative assumption of 0.2 mm per layer, ${inputs.n_mli} layers ` +
          `would occupy ${(minimumBlanketThickness * 1000).toFixed(1)} mm, more than the ` +
          `${(inputs.d_vacuum_gap * 1000).toFixed(1)} mm gap. Actual thickness varies; ` +
          'the thermal model does not account for it.',
      });
    }
  }

  if (Number.isFinite(inputs.C) && (inputs.C < 1 || inputs.C > 3)) {
    warnings.push({
      key: 'C',
      message: 'C outside 1-3 is outside the range this bridging form is usually quoted for.',
    });
  }

  if (Number.isFinite(inputs.T_cold) && inputs.T_cold < 4) {
    warnings.push({
      key: 'T_cold',
      message: 'Below ~4 K the constant-property assumptions in this model are not appropriate.',
    });
  }

  return { errors, warnings };
}
