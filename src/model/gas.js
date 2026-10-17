/**
 * Residual-gas transport across a gap.
 *
 * Gas conduction between two surfaces depends on how often molecules collide
 * with each other compared with how often they cross the gap. The Knudsen
 * number Kn = lambda / d measures that ratio, and the effective conductivity
 * is modelled piecewise in Kn:
 *
 *   continuum      Kn < 0.01   k_eff = k_air                  (pressure independent)
 *   transition     0.01-10     k_eff = k_air / (1 + C lambda/d)
 *   free molecular Kn > 10     k_eff = k_air d / (C lambda)   (proportional to pressure)
 *
 * The free-molecular branch is proportional to pressure because lambda is
 * inversely proportional to pressure: with fewer molecules there are fewer
 * carriers, and each crosses the gap without colliding.
 *
 * These are the Version 1 definitions, including the thresholds and the two
 * different mean-free-path expressions. See docs/PHYSICS.md for the known
 * discontinuities at the regime boundaries.
 */

import { K_B, KN_CONTINUUM_MAX, KN_MOLECULAR_MIN } from './constants.js';

/**
 * Main-gap mean free path [m] from the fitted form lambda = coefficient / P.
 * @param {number} P Pressure [Pa]
 * @param {number} coefficient [m Pa]
 * @returns {number} Mean free path [m]
 */
export function meanFreePathFitted(P, coefficient) {
  return coefficient / P;
}

/**
 * Kinetic-theory mean free path [m], used for the inner gas gap.
 * @param {number} T Gas temperature [K]
 * @param {number} P Pressure [Pa]
 * @param {number} dMolecule Effective molecular diameter [m]
 * @returns {number} Mean free path [m]
 */
export function meanFreePathKinetic(T, P, dMolecule) {
  return (K_B * T) / (Math.SQRT2 * Math.PI * dMolecule * dMolecule * P);
}

/**
 * @param {number} Kn Knudsen number [-]
 * @returns {import('./constants.js').Regime}
 */
export function classifyRegime(Kn) {
  if (Kn < KN_CONTINUUM_MAX) return 'continuum';
  if (Kn > KN_MOLECULAR_MIN) return 'free-molecular';
  return 'transition';
}

/**
 * Effective gas conductivity [W/(m K)] for a gap.
 * @param {number} kAir Continuum conductivity [W/(m K)]
 * @param {number} lambda Mean free path [m]
 * @param {number} d Gap thickness [m]
 * @param {number} C Accommodation / bridging constant [-]
 * @returns {number} Effective conductivity [W/(m K)]
 */
export function effectiveGasConductivity(kAir, lambda, d, C) {
  const Kn = lambda / d;
  if (Kn < KN_CONTINUUM_MAX) return kAir;
  if (Kn > KN_MOLECULAR_MIN) return kAir * (d / (C * lambda));
  return kAir / (1 + (C * lambda) / d);
}

/**
 * The pressures at which a gap crosses between regimes.
 *
 * Inverting Kn = lambda / d with lambda = coefficient / P gives the pressure
 * for any Knudsen threshold directly. This lives in the model rather than in
 * the plotting code so that the regime bands drawn on a chart and the regime
 * reported for a solve can never disagree about where a boundary is.
 *
 * @param {number} mfpCoefficient [m Pa]
 * @param {number} gapThickness [m]
 * @returns {{freeMolecularBelow: number, continuumAbove: number}} [Pa]
 */
export function regimeBoundaryPressures(mfpCoefficient, gapThickness) {
  return {
    freeMolecularBelow: mfpCoefficient / (gapThickness * KN_MOLECULAR_MIN),
    continuumAbove: mfpCoefficient / (gapThickness * KN_CONTINUUM_MAX),
  };
}

/**
 * Human-readable regime label.
 * @param {import('./constants.js').Regime} regime
 * @returns {string}
 */
export function regimeLabel(regime) {
  switch (regime) {
    case 'continuum':
      return 'Continuum';
    case 'free-molecular':
      return 'Free molecular';
    default:
      return 'Transition';
  }
}
