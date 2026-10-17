import { assert, describe, it } from './harness.js';
import { DEFAULT_INPUTS, SIGMA, K_B } from '../src/model/constants.js';
import { resolveGeometry } from '../src/model/geometry.js';
import {
  ambientResistance,
  cylindricalConductionResistance,
  innerGapResistance,
  parallel,
  radiationResistance,
  series,
  vacuumGasResistance,
} from '../src/model/resistances.js';

const geom = resolveGeometry(DEFAULT_INPUTS);

describe('cylindrical conduction', () => {
  it('matches ln(ro/ri) / (2 pi k L)', () => {
    const R = cylindricalConductionResistance(0.043, 0.039, 155, 1);
    assert.close(R, Math.log(0.043 / 0.039) / (2 * Math.PI * 155), 1e-15);
  });

  it('scales inversely with length and conductivity', () => {
    const base = cylindricalConductionResistance(0.043, 0.039, 155, 1);
    assert.close(cylindricalConductionResistance(0.043, 0.039, 155, 2), base / 2, 1e-12);
    assert.close(cylindricalConductionResistance(0.043, 0.039, 310, 1), base / 2, 1e-12);
  });

  it('applies the shell formula to both illustrative walls', () => {
    const Row = cylindricalConductionResistance(geom.r_ow_ow, geom.r_ow_in, DEFAULT_INPUTS.k_outer_wall, geom.length);
    const Riw = cylindricalConductionResistance(geom.r_in_ow, geom.r_in_in, DEFAULT_INPUTS.k_inner_wall, geom.length);
    assert.close(Row, Math.log(geom.r_ow_ow / geom.r_ow_in) / (2 * Math.PI * DEFAULT_INPUTS.k_outer_wall * geom.length), 1e-12);
    assert.close(Riw, Math.log(geom.r_in_ow / geom.r_in_in) / (2 * Math.PI * DEFAULT_INPUTS.k_inner_wall * geom.length), 1e-12);
  });
});

describe('external convection and radiation', () => {
  it('puts the two mechanisms in parallel, not in series', () => {
    const { G_conv, G_rad, R_ambient } = ambientResistance(289, DEFAULT_INPUTS, geom);
    assert.close(R_ambient, 1 / (G_conv + G_rad), 1e-15);
    // A parallel pair is always less resistive than either branch alone.
    assert.less(R_ambient, 1 / G_conv);
    assert.less(R_ambient, 1 / G_rad);
  });

  it('computes the convection conductance as h times the outer area', () => {
    const { G_conv } = ambientResistance(289, DEFAULT_INPUTS, geom);
    assert.close(G_conv, 2 * Math.PI * geom.r_ow_ow * DEFAULT_INPUTS.h_conv * geom.length, 1e-15);
  });

  it('reproduces sigma (Ts^4 - Tamb^4) when the linearisation is undone', () => {
    const Ts = 290.0;
    const { G_rad } = ambientResistance(Ts, DEFAULT_INPUTS, geom);
    const area = 2 * Math.PI * geom.r_ow_ow * geom.length;
    const linearised = G_rad * (Ts - DEFAULT_INPUTS.T_amb);
    const exact = area * SIGMA * DEFAULT_INPUTS.eps_al
      * (Ts ** 4 - DEFAULT_INPUTS.T_amb ** 4);
    assert.close(linearised, exact, 1e-12);
  });

  it('is dominated by convection for the illustrative inputs', () => {
    const { G_conv, G_rad } = ambientResistance(289, DEFAULT_INPUTS, geom);
    assert.greater(G_conv / G_rad, 10, 'convection should dominate for this toy case');
  });
});

describe('vacuum radiation and MLI', () => {
  it('is proportional to (N + 1)', () => {
    const r0 = radiationResistance(285, 115, 0, DEFAULT_INPUTS, geom);
    const r12 = radiationResistance(285, 115, 12, DEFAULT_INPUTS, geom);
    assert.close(r12 / r0, 13, 1e-12);
  });

  it('falls as emissivity rises', () => {
    const shiny = radiationResistance(285, 115, 12, { ...DEFAULT_INPUTS, eps_al: 0.02 }, geom);
    const dull = radiationResistance(285, 115, 12, { ...DEFAULT_INPUTS, eps_al: 0.5 }, geom);
    assert.less(dull, shiny, 'a duller surface radiates more, so resistance drops');
  });

  it('falls as temperature rises, because radiation goes as T^4', () => {
    const cold = radiationResistance(170, 115, 12, DEFAULT_INPUTS, geom);
    const hot = radiationResistance(305, 115, 12, DEFAULT_INPUTS, geom);
    assert.less(hot, cold);
  });

  it('linearises T_h^4 - T_c^4 exactly', () => {
    const Th = 290;
    const Tc = 90;
    const R = radiationResistance(Th, Tc, 0, DEFAULT_INPUTS, geom);
    const flux = (Th - Tc) / R;
    const numerator = 1 / DEFAULT_INPUTS.eps_al
      + (geom.r_in_ow / geom.r_ow_in) * (1 / DEFAULT_INPUTS.eps_al - 1);
    const exact = (2 * Math.PI * geom.r_in_ow * geom.length * SIGMA * (Th ** 4 - Tc ** 4)) / numerator;
    assert.close(flux, exact, 1e-12);
  });
});

describe('gas gaps', () => {
  it('uses the cylindrical form, not a planar gap', () => {
    const { R_gas } = vacuumGasResistance(1.0, DEFAULT_INPUTS, geom);
    const { k_eff } = vacuumGasResistance(1.0, DEFAULT_INPUTS, geom);
    const cylindrical = Math.log(geom.r_ow_in / geom.r_in_ow) / (2 * Math.PI * k_eff * geom.length);
    assert.close(R_gas, cylindrical, 1e-15);
    const planar = geom.d_vacuum_gap
      / (k_eff * 2 * Math.PI * 0.5 * (geom.r_ow_in + geom.r_in_ow) * geom.length);
    assert.ok(Math.abs(R_gas - planar) / R_gas > 1e-3, 'should differ from the planar approximation');
  });

  it('rises steeply as the vacuum improves', () => {
    const atHigh = vacuumGasResistance(1e3, DEFAULT_INPUTS, geom).R_gas;
    const atLow = vacuumGasResistance(1e-5, DEFAULT_INPUTS, geom).R_gas;
    assert.greater(atLow / atHigh, 1e4);
  });

  it('computes the inner gap from kinetic theory at its own fixed pressure', () => {
    const { R_gap, Kn_gap, k_eff_gap } = innerGapResistance(DEFAULT_INPUTS, geom);
    const lambda = K_B * DEFAULT_INPUTS.T_inner_gap /
      (Math.SQRT2 * Math.PI * DEFAULT_INPUTS.d_air ** 2 * DEFAULT_INPUTS.P_inner_gap);
    const kn = lambda / geom.d_inner_gap;
    assert.ok(kn > 0.01 && kn < 10, 'toy case must use the transition formula');
    const k = DEFAULT_INPUTS.k_air / (1 + DEFAULT_INPUTS.C * kn);
    const R = Math.log(geom.r_in_in / geom.r_cu) / (2 * Math.PI * k * geom.length);
    assert.close(Kn_gap, kn, 1e-12);
    assert.close(k_eff_gap, k, 1e-12);
    assert.close(R_gap, R, 1e-12);
  });

  it('leaves the inner gap unchanged when the main vacuum pressure changes', () => {
    const a = innerGapResistance({ ...DEFAULT_INPUTS, P_vacuum: 1e-7 }, geom).R_gap;
    const b = innerGapResistance({ ...DEFAULT_INPUTS, P_vacuum: 1e5 }, geom).R_gap;
    assert.close(a, b, 1e-15, 'the inner gap is held at its own pressure');
  });
});

describe('network combination', () => {
  it('adds series resistances', () => {
    assert.close(series(1, 2, 3.5), 6.5, 1e-15);
    assert.close(series(), 0, 1e-15);
  });

  it('combines parallel resistances reciprocally', () => {
    assert.close(parallel(2, 2), 1, 1e-15);
    assert.close(parallel(1, 1e12), 1 / (1 + 1e-12), 1e-12);
  });

  it('makes a parallel pair smaller than its smallest branch', () => {
    const p = parallel(7, 1300);
    assert.less(p, 7);
    assert.greater(p, 0);
  });
});
