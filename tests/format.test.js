/**
 * Display formatting and regime boundaries.
 *
 * Formatting is where a correct model can still tell the user something
 * false: a wrong constant, a dropped unit, or a rounding that turns a small
 * non-zero share into a flat zero.
 */

import { assert, describe, it } from './harness.js';
import { TORR_TO_PA } from '../src/model/constants.js';
import { classifyRegime, regimeBoundaryPressures } from '../src/model/gas.js';
import { DEFAULT_INPUTS } from '../src/model/constants.js';
import { resolveGeometry } from '../src/model/geometry.js';
import { solve } from '../src/model/solver.js';
import { exponential, linearTick, millimetres, percent, pressure, sig, temperature } from '../src/utils/format.js';

describe('significant figures', () => {
  it('keeps the requested number of significant figures', () => {
    assert.equal(sig(42.358, 3), '42.4');
    assert.equal(sig(2.8432, 3), '2.84');
    assert.equal(sig(32.571, 4), '32.57');
    assert.equal(sig(0.08765, 3), '0.0877');
  });

  it('switches to exponential only when a decimal string would be unreadable', () => {
    assert.equal(sig(0.0001582, 3), '1.58×10⁻⁴');
    // Just inside the decimal range: plain decimal, no multiplication sign.
    assert.equal(sig(0.00101, 3), '0.00101');
    assert.ok(!sig(0.00101, 3).includes('×'), 'should not use exponential notation');
    assert.ok(sig(1e6, 3).includes('×'), 'large values should use exponential notation');
  });

  it('handles zero and non-finite values without printing rubbish', () => {
    assert.equal(sig(0, 3), '0');
    assert.equal(sig(NaN, 3), '—');
    assert.equal(sig(Infinity, 3), '—');
    assert.equal(temperature(NaN), '—');
    assert.equal(pressure(NaN).combined, '—');
  });

  it('formats exponents with a real minus sign and superscript digits', () => {
    assert.equal(exponential(1e-7, 0), '1×10⁻⁷');
    assert.equal(exponential(2.5e3, 1), '2.5×10³');
  });
});

describe('pressure display', () => {
  it('uses the shared Torr constant, not a copy of it', () => {
    // A duplicated literal here would silently disagree with the model.
    assert.equal(pressure(TORR_TO_PA).combined, '1.00 Torr');
    assert.equal(pressure(TORR_TO_PA / 1000).combined, '1.00 mTorr');
  });

  it('picks a unit that keeps the number readable', () => {
    assert.equal(pressure(100000).unit, 'Torr');
    assert.equal(pressure(0.2).unit, 'mTorr');
    assert.equal(pressure(1e-7).unit, 'mTorr');
  });

  it('formats the illustrative default vacuum pressure', () => {
    assert.equal(pressure(DEFAULT_INPUTS.P_vacuum).combined, '1.50 mTorr');
  });

  it('formats the illustrative default inner-gap pressure', () => {
    assert.equal(pressure(DEFAULT_INPUTS.P_inner_gap).combined, '75.0 mTorr');
  });
});

describe('linear plot ticks', () => {
  it('distinguishes closely spaced ticks at a large offset', () => {
    assert.equal(linearTick(32.15, 0.05), '32.15');
    assert.equal(linearTick(32.2, 0.05), '32.20');
    assert.equal(linearTick(100, 20), '100');
  });
});

describe('percentages', () => {
  it('never rounds a small non-zero share down to zero', () => {
    assert.equal(percent(0.0001), '<0.1%');
    assert.equal(percent(0.99999), '>99.9%');
    assert.equal(percent(0.535), '53.5%');
    assert.equal(percent(0), '0.0%');
  });
});

describe('millimetres', () => {
  it('converts metres for display', () => {
    assert.equal(millimetres(0.034), '34.00');
    assert.equal(millimetres(0.0005), '0.50');
  });
});

describe('regime boundary pressures', () => {
  const geom = resolveGeometry(DEFAULT_INPUTS);

  it('returns the pressures at which the Knudsen thresholds are crossed', () => {
    const { freeMolecularBelow, continuumAbove } =
      regimeBoundaryPressures(DEFAULT_INPUTS.mfp_coefficient, geom.d_vacuum_gap);

    // Solving just either side of each boundary must give the regime the
    // boundary claims, which is what ties the plotted bands to the model.
    assert.equal(solve({ ...DEFAULT_INPUTS, P_vacuum: freeMolecularBelow * 0.99 }).regime,
      'free-molecular');
    assert.equal(solve({ ...DEFAULT_INPUTS, P_vacuum: freeMolecularBelow * 1.01 }).regime,
      'transition');
    assert.equal(solve({ ...DEFAULT_INPUTS, P_vacuum: continuumAbove * 0.99 }).regime,
      'transition');
    assert.equal(solve({ ...DEFAULT_INPUTS, P_vacuum: continuumAbove * 1.01 }).regime,
      'continuum');
  });

  it('places the boundaries exactly at the Knudsen thresholds', () => {
    const { freeMolecularBelow, continuumAbove } =
      regimeBoundaryPressures(DEFAULT_INPUTS.mfp_coefficient, geom.d_vacuum_gap);

    const knAt = (P) => (DEFAULT_INPUTS.mfp_coefficient / P) / geom.d_vacuum_gap;
    assert.close(knAt(freeMolecularBelow), 10, 1e-12);
    assert.close(knAt(continuumAbove), 0.01, 1e-12);
  });

  it('moves with the gap width and the mean free path coefficient', () => {
    const narrow = regimeBoundaryPressures(0.0043, 0.007);
    const wide = regimeBoundaryPressures(0.0043, 0.034);
    assert.greater(narrow.continuumAbove, wide.continuumAbove);

    const longer = regimeBoundaryPressures(0.0086, 0.017);
    const base = regimeBoundaryPressures(0.0043, 0.017);
    assert.close(longer.continuumAbove / base.continuumAbove, 2, 1e-12);
  });

  it('agrees with classifyRegime either side of each boundary', () => {
    const { freeMolecularBelow, continuumAbove } = regimeBoundaryPressures(0.0043, 0.017);
    const knAt = (P) => (0.0043 / P) / 0.017;
    assert.equal(classifyRegime(knAt(freeMolecularBelow * 0.99)), 'free-molecular');
    assert.equal(classifyRegime(knAt(continuumAbove * 1.01)), 'continuum');
  });
});
