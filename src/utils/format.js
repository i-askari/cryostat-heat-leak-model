import { TORR_TO_PA } from '../model/constants.js';

/**
 * Number formatting for the interface.
 *
 * Rule of thumb applied throughout: show the precision the model can defend,
 * not the precision a float can print. Heat leak gets three significant
 * figures, temperatures one decimal, resistances three significant figures.
 */

/**
 * Format with a fixed number of significant figures, switching to exponential
 * notation only when a decimal string would be unreadable.
 * @param {number} value
 * @param {number} [sig]
 * @returns {string}
 */
export function sig(value, sig = 3) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';

  const magnitude = Math.abs(value);
  if (magnitude >= 1e5 || magnitude < 1e-3) {
    return exponential(value, sig - 1);
  }

  const decimals = Math.max(0, sig - 1 - Math.floor(Math.log10(magnitude)));
  return value.toFixed(Math.min(decimals, 12));
}

/** Format a linear-axis tick with enough decimal places to distinguish its step. */
export function linearTick(value, step) {
  if (!Number.isFinite(value) || !(step > 0) || !Number.isFinite(step)) return sig(value, 3);
  const decimals = Math.max(0, Math.ceil(-Math.log10(step) - 1e-12));
  if (decimals > 12 || Math.abs(value) >= 1e15) return value.toPrecision(15);
  return value.toFixed(decimals);
}

/**
 * Exponential notation with a times-ten-to-the exponent rather than "e".
 * @param {number} value
 * @param {number} [decimals]
 * @returns {string}
 */
export function exponential(value, decimals = 2) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const mantissa = value / 10 ** exponent;
  return `${mantissa.toFixed(decimals)}×10${superscript(exponent)}`;
}

const SUPERSCRIPT_DIGITS = {
  '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴',
  5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹',
};

/** @param {number} n @returns {string} */
function superscript(n) {
  return String(n).split('').map((c) => SUPERSCRIPT_DIGITS[c] ?? c).join('');
}

/** @param {number} kelvin @returns {string} */
export function temperature(kelvin) {
  if (!Number.isFinite(kelvin)) return '—';
  return kelvin.toFixed(1);
}

/**
 * Pressure with the unit chosen to keep the number readable.
 * @param {number} pa
 * @returns {{value: string, unit: string, combined: string}}
 */
export function pressure(pa) {
  if (!Number.isFinite(pa)) return { value: '—', unit: '', combined: '—' };

  const torr = pa / TORR_TO_PA;
  let value;
  let unit;

  if (torr >= 1) {
    value = sig(torr, 3);
    unit = 'Torr';
  } else if (torr >= 1e-3) {
    value = sig(torr * 1e3, 3);
    unit = 'mTorr';
  } else {
    value = exponential(torr * 1e3, 2);
    unit = 'mTorr';
  }

  return { value, unit, combined: `${value} ${unit}` };
}

/** @param {number} metres @returns {string} millimetres, two decimals */
export function millimetres(metres) {
  if (!Number.isFinite(metres)) return '—';
  return (metres * 1000).toFixed(2);
}

/**
 * A percentage, with a floor so that a small but non-zero share never reads
 * as exactly zero.
 * @param {number} fraction 0-1
 * @returns {string}
 */
export function percent(fraction) {
  if (!Number.isFinite(fraction)) return '—';
  const pct = fraction * 100;
  if (pct > 0 && pct < 0.1) return '<0.1%';
  if (pct < 100 && pct > 99.9) return '>99.9%';
  return `${pct.toFixed(1)}%`;
}
