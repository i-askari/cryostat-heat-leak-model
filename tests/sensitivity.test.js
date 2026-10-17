/**
 * Parameter sensitivity.
 *
 * Every control the interface exposes must actually move the physics. These
 * tests are what stop a control from silently becoming decorative, which is
 * the most common way an interactive model starts lying to its user.
 */

import { assert, describe, it } from './harness.js';
import { DEFAULT_INPUTS } from '../src/model/constants.js';
import { solve } from '../src/model/solver.js';
import { units } from '../src/model/index.js';

const base = solve(DEFAULT_INPUTS);
const withInputs = (overrides) => solve({ ...DEFAULT_INPUTS, ...overrides });

/** Relative change in Q against the default configuration. */
const change = (result) => Math.abs(result.Q - base.Q) / base.Q;

describe('every exposed parameter changes the result', () => {
  const perturbations = Object.fromEntries(
    Object.entries(DEFAULT_INPUTS)
      .filter(([key]) => !['max_iterations', 'tolerance'].includes(key))
      .map(([key, value]) => [key, key === 'n_mli' ? value + 4 : value * 1.2]),
  );

  for (const [key, value] of Object.entries(perturbations)) {
    it(`responds to ${key}`, () => {
      const perturbed = withInputs({ [key]: value });
      assert.ok(
        Math.abs(perturbed.Q - base.Q) > 0,
        `changing ${key} from ${DEFAULT_INPUTS[key]} to ${value} left Q unchanged`,
      );
      assert.finite(perturbed.Q);
    });
  }
});

describe('sensitivity has the right sign', () => {
  it('raises heat leak when the vacuum degrades', () => {
    assert.greater(withInputs({ P_vacuum: 10 }).Q, base.Q);
    assert.less(withInputs({ P_vacuum: 1e-4 }).Q, base.Q);
  });

  it('lowers heat leak when MLI layers are added', () => {
    assert.less(withInputs({ n_mli: 100 }).Q, withInputs({ n_mli: 5 }).Q);
  });

  it('raises heat leak when surfaces are less reflective', () => {
    assert.greater(withInputs({ eps_al: 0.5 }).Q, withInputs({ eps_al: 0.02 }).Q);
  });

  it('raises heat leak with a larger ambient-to-cold temperature difference', () => {
    assert.greater(withInputs({ T_amb: 330 }).Q, base.Q);
    assert.greater(withInputs({ T_cold: 20 }).Q, base.Q);
  });

  it('lowers heat leak when the external convection coefficient falls', () => {
    assert.less(withInputs({ h_conv: 2 }).Q, base.Q);
  });

  it('raises heat leak when the inner gap pressure rises', () => {
    assert.greater(withInputs({ P_inner_gap: 1000 }).Q, withInputs({ P_inner_gap: 1 }).Q);
  });

  it('lowers gas conduction when C rises, at fixed pressure', () => {
    const low = withInputs({ C: 1, P_vacuum: 0.1 });
    const high = withInputs({ C: 3, P_vacuum: 0.1 });
    assert.greater(high.R_gas, low.R_gas);
    assert.less(high.Q, low.Q);
  });
});

describe('relative importance of the mechanisms', () => {
  it('is dominated by residual gas at an illustrative pressure', () => {
    const r = withInputs({ P_vacuum: 1 });
    assert.greater(r.gas_fraction, 0.9, 'gas should carry most of the vacuum-gap heat at 1 Pa');
  });

  it('is dominated by radiation in a good vacuum', () => {
    const r = withInputs({ P_vacuum: 1e-6 });
    assert.greater(r.radiation_fraction, 0.9, 'radiation should dominate at 1e-6 Pa');
  });

  it('makes MLI matter much more in a good vacuum than a poor one', () => {
    const goodVacuum = (n) => withInputs({ P_vacuum: 1e-6, n_mli: n }).Q;
    const poorVacuum = (n) => withInputs({ P_vacuum: 10, n_mli: n }).Q;

    const goodEffect = (goodVacuum(6) - goodVacuum(54)) / goodVacuum(6);
    const poorEffect = (poorVacuum(6) - poorVacuum(54)) / poorVacuum(6);

    assert.greater(goodEffect, 0.5, 'MLI should be decisive when radiation dominates');
    assert.less(poorEffect, 0.05, 'MLI should barely matter when gas conduction dominates');
  });

  it('shows wall conduction is negligible compared with the gaps', () => {
    assert.less(base.R_cond_ow / base.R_total, 1e-3);
    assert.less(base.R_cond_iw / base.R_total, 1e-3);
  });

  it('changes the answer very little when wall conductivity changes', () => {
    // Aluminium walls are thin and highly conductive, so their resistance is
    // a rounding error in the series total. The control still works, but the
    // user should see that it hardly matters, which is itself the insight.
    assert.less(change(withInputs({ k_outer_wall: 100 })), 1e-4);
  });
});

describe('geometry sensitivity', () => {
  it('reflects both competing effects of widening the gas gap', () => {
    // In transition, widening the gap lowers Kn and increases effective
    // conductivity; cylindrical path length also changes the resistance.
    const narrow = withInputs({ d_vacuum_gap: 0.005 });
    const wide = withInputs({ d_vacuum_gap: 0.040 });
    assert.less(wide.Kn, narrow.Kn, 'Kn = lambda / d falls as the gap widens');
    assert.greater(wide.k_eff_gas, narrow.k_eff_gas, 'a less rarefied gap conducts better');
    // In continuum the conductivity is constant, so the wider path wins.
    const continuumNarrow = withInputs({ P_vacuum: 1000, d_vacuum_gap: 0.005 });
    const continuumWide = withInputs({ P_vacuum: 1000, d_vacuum_gap: 0.040 });
    assert.close(continuumWide.k_eff_gas, continuumNarrow.k_eff_gas, 1e-12);
    assert.greater(continuumWide.R_gas, continuumNarrow.R_gas);
  });

  it('raises the inner gap resistance when the gap widens', () => {
    assert.greater(withInputs({ d_inner_gap: 0.02 }).R_gap, withInputs({ d_inner_gap: 0.005 }).R_gap);
  });

  it('scales the external area with the outer radius', () => {
    const big = withInputs({ t_outer_wall: 0.02 });
    assert.less(big.R_ambient, base.R_ambient, 'a larger outer surface sheds heat more easily');
  });
});

describe('unit conversions used by the interface', () => {
  it('round-trips pressure through Torr', () => {
    assert.close(units.torrToPa(units.paToTorr(18.4)), 18.4, 1e-12);
    assert.close(units.milliTorrToPa(units.paToMilliTorr(0.5)), 0.5, 1e-12);
  });

  it('uses the standard Torr definition', () => {
    assert.close(units.torrToPa(1), 133.322, 1e-15);
    assert.close(units.paToMilliTorr(133.322), 1000, 1e-12);
  });

  it('round-trips length through mm', () => {
    assert.close(units.mmToM(units.mToMm(0.034)), 0.034, 1e-12);
    assert.close(units.mToMm(0.019), 19, 1e-12);
  });

  it('converts kelvin to celsius', () => {
    assert.close(units.kelvinToCelsius(298.15), 25, 1e-12);
  });
});
