/**
 * Unit conversions.
 *
 * The model is SI internally (m, K, Pa, W, K/W). The interface shows mm for
 * geometry and Torr / mTorr for pressure because those are the units the
 * quantities are normally specified in. Conversion happens only at the
 * boundary between the UI and the model; nothing in src/model/ uses these.
 */

import { TORR_TO_PA } from './constants.js';

/** @param {number} pa @returns {number} Torr */
export const paToTorr = (pa) => pa / TORR_TO_PA;

/** @param {number} torr @returns {number} Pa */
export const torrToPa = (torr) => torr * TORR_TO_PA;

/** @param {number} pa @returns {number} mTorr */
export const paToMilliTorr = (pa) => (pa / TORR_TO_PA) * 1000;

/** @param {number} mtorr @returns {number} Pa */
export const milliTorrToPa = (mtorr) => (mtorr / 1000) * TORR_TO_PA;

/** @param {number} m @returns {number} mm */
export const mToMm = (m) => m * 1000;

/** @param {number} mm @returns {number} m */
export const mmToM = (mm) => mm / 1000;

/** @param {number} k @returns {number} degrees Celsius */
export const kelvinToCelsius = (k) => k - 273.15;
