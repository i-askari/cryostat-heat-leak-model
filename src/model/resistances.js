/**
 * Thermal resistances of each element of the radial network [K/W].
 *
 * Every resistance here is for the whole modelled length L, not per metre.
 * Because each one carries a 1/L factor, the total resistance scales as 1/L
 * and the heat leak Q scales exactly linearly with L. That is why Q/L is
 * independent of the chosen length, and why reporting W/m is meaningful.
 */

import { SIGMA } from './constants.js';
import { effectiveGasConductivity, innerGapConductivity, meanFreePathFitted, meanFreePathKinetic } from './gas.js';

/**
 * Conduction through a cylindrical shell: R = ln(r_o / r_i) / (2 pi k L).
 * @param {number} rOuter [m]
 * @param {number} rInner [m]
 * @param {number} k Thermal conductivity [W/(m K)]
 * @param {number} L Length [m]
 * @returns {number} Resistance [K/W]
 */
export function cylindricalConductionResistance(rOuter, rInner, k, L) {
  return Math.log(rOuter / rInner) / (2 * Math.PI * k * L);
}

/**
 * External convection and linearised radiation conductances [W/K].
 *
 * These two act in parallel between the ambient environment and the outer
 * surface: heat arrives by both routes at once, so their conductances add.
 * Radiation is linearised by factoring T_s^4 - T_amb^4 into
 * (T_s^2 + T_amb^2)(T_s + T_amb)(T_s - T_amb), which makes the radiative term
 * a conductance multiplying a temperature difference like any other.
 *
 * @param {number} Tsurface Outer surface temperature [K]
 * @param {import('./constants.js').ModelInputs} inputs
 * @param {import('./geometry.js').Geometry} geom
 * @returns {{G_conv: number, G_rad: number, R_ambient: number}}
 */
export function ambientResistance(Tsurface, inputs, geom) {
  const area = 2 * Math.PI * geom.r_ow_ow * geom.length; // [m^2]
  const G_conv = area * inputs.h_conv;
  const G_rad =
    area *
    SIGMA *
    inputs.eps_al *
    (Tsurface * Tsurface + inputs.T_amb * inputs.T_amb) *
    (Tsurface + inputs.T_amb);

  return { G_conv, G_rad, R_ambient: 1 / (G_conv + G_rad) };
}

/**
 * Linearised radiation resistance across the vacuum gap, including MLI [K/W].
 *
 * The numerator is the gray-body factor for two concentric cylinders,
 * referenced to the inner surface area. MLI is represented by multiplying the
 * single-gap resistance by (N + 1): N reflective layers create N + 1
 * radiation gaps in series, each of which must be crossed.
 *
 * @param {number} Thot Inner surface of the outer wall, T2 [K]
 * @param {number} Tcold Outer surface of the inner wall, T3 [K]
 * @param {number} nMli Number of MLI layers [-]
 * @param {import('./constants.js').ModelInputs} inputs
 * @param {import('./geometry.js').Geometry} geom
 * @returns {number} Resistance [K/W]
 */
export function radiationResistance(Thot, Tcold, nMli, inputs, geom) {
  // S is the linearisation factor: T_h^4 - T_c^4 = S (T_h - T_c).
  const S =
    Thot * Thot * Thot +
    Thot * Thot * Tcold +
    Thot * Tcold * Tcold +
    Tcold * Tcold * Tcold;

  const numerator =
    1 / inputs.eps_al + (geom.r_in_ow / geom.r_ow_in) * (1 / inputs.eps_al - 1);
  const denominator = 2 * Math.PI * geom.r_in_ow * geom.length * SIGMA * S;

  return (numerator / denominator) * (nMli + 1);
}

/**
 * Notebook contact-conduction correlation: density is fixed at 20 layers/cm.
 * The empirical coefficient's units and provenance are not specified in the
 * notebook. This correlation does not use the clearance-screen thickness.
 * The notebook gives finite conductance at zero layers; a physically absent
 * blanket is deliberately represented here by an open circuit instead.
 * @returns {number} Resistance [K/W], or Infinity for an absent blanket
 */
export function solidMliResistance(Thot, Tcold, nMli, geom) {
  if (nMli === 0) return Infinity;
  const area = 2 * Math.PI * geom.r_in_ow * geom.length;
  return (2 * (nMli + 1)) / (8.95e-8 * 20 ** 2.63 * (Thot + Tcold) * area);
}

/**
 * Residual-gas conduction across the main vacuum gap.
 * @param {number} P Pressure [Pa]
 * @param {import('./constants.js').ModelInputs} inputs
 * @param {import('./geometry.js').Geometry} geom
 * @returns {{R_gas: number, Kn: number, k_eff: number, lambda: number}}
 */
export function vacuumGasResistance(P, inputs, geom) {
  const lambda = meanFreePathFitted(P, inputs.mfp_coefficient);
  const Kn = lambda / geom.d_vacuum_gap;
  const k_eff = effectiveGasConductivity(inputs.k_air, lambda, geom.d_vacuum_gap, inputs.C, inputs.n_mli);
  const R_gas = Math.log(geom.r_ow_in / geom.r_in_ow) / (2 * Math.PI * k_eff * geom.length);
  return { R_gas, Kn, k_eff, lambda };
}

/**
 * Gas conduction across the inner copper-to-wall gap.
 *
 * Held at a fixed pressure and evaluated once per solve: unlike the main
 * vacuum, this volume is not swept. The notebook models conduction only here,
 * with no radiation term.
 *
 * @param {import('./constants.js').ModelInputs} inputs
 * @param {import('./geometry.js').Geometry} geom
 * @returns {{R_gap: number, Kn_gap: number, k_air_gap: number, k_eff_gap: number, lambda_gap: number}}
 */
export function innerGapResistance(inputs, geom) {
  const lambda_gap = meanFreePathKinetic(inputs.T_inner_gap, inputs.P_inner_gap, inputs.d_air);
  const Kn_gap = lambda_gap / geom.d_inner_gap;
  const k_air_gap = innerGapConductivity(inputs.T_inner_gap);
  const k_eff_gap = effectiveGasConductivity(k_air_gap, lambda_gap, geom.d_inner_gap, inputs.C);
  const R_gap = Math.log(geom.r_in_in / geom.r_cu) / (2 * Math.PI * k_eff_gap * geom.length);
  return { R_gap, Kn_gap, k_air_gap, k_eff_gap, lambda_gap };
}

/**
 * Resistances in parallel: reciprocals (conductances) add.
 * @param {...number} resistances [K/W]
 * @returns {number} [K/W]
 */
export function parallel(...resistances) {
  return 1 / resistances.reduce((sum, resistance) => sum + 1 / resistance, 0);
}

/**
 * Resistances in series.
 * @param {...number} resistances [K/W]
 * @returns {number} [K/W]
 */
export function series(...resistances) {
  return resistances.reduce((sum, r) => sum + r, 0);
}
