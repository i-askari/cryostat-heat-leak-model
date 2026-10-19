import { assert, describe, it } from './harness.js';
import { DEFAULT_INPUTS } from '../src/model/constants.js';
import { solve } from '../src/model/solver.js';
import { explain, explainSteps } from '../src/data/explanations.js';
import { percent, sig } from '../src/utils/format.js';

const entries = (info) => Object.fromEntries(info.numbers);

describe('interactive physics explanations', () => {
  it('shows the three live MLI resistances, flows and shares for changed inputs', () => {
    for (const n_mli of [0, 16, 32]) {
      const r = solve({ ...DEFAULT_INPUTS, n_mli, P_vacuum: 0.7 });
      const info = explain('mli', r);
      const values = entries(info);
      assert.equal(values.Layers, String(n_mli));
      assert.equal(values['Gas resistance beside it'], `${sig(r.R_gas, 3)} K/W`);
      assert.equal(values['Radiative resistance'], `${sig(r.R_rad, 3)} K/W`);
      assert.equal(values['Gas heat flow / fraction'], `${sig(r.Q_gas, 3)} W / ${percent(r.gas_fraction)}`);
      assert.equal(values['Radiation heat flow / fraction'], `${sig(r.Q_rad_vacuum, 3)} W / ${percent(r.radiation_fraction)}`);
      assert.equal(values['Contact heat flow / fraction'], `${sig(r.Q_solid_MLI, 3)} W / ${percent(r.fraction_solid_MLI)}`);
      assert.equal(values['Contact resistance'], n_mli === 0 ? 'Absent (no layers)' : `${sig(r.R_solid_MLI, 3)} K/W`);
      assert.ok(info.limitations.includes('not used in the thermal calculation'));
    }
  });

  it('reports inner-gap state and conduction only from the solved result', () => {
    for (const P_inner_gap of [0.01, 10, 10000]) {
      const r = solve({ ...DEFAULT_INPUTS, P_inner_gap });
      const info = explain('inner-gap', r);
      const values = entries(info);
      assert.equal(values['Knudsen number'], sig(r.Kn_gap, 3));
      assert.equal(values.Regime, r.regime_gap);
      assert.equal(values.Resistance, `${sig(r.R_gap, 3)} K/W`);
      assert.equal(values['Heat flow'], `${sig(r.Q_inner_gap, 3)} W`);
      assert.ok(info.limitations.includes('Thermal radiation across the inner gas gap is neglected'));
    }
  });

  it('distinguishes the prescribed copper boundary from LN₂ without claiming a solved copper drop', () => {
    const r = solve(DEFAULT_INPUTS);
    for (const id of ['cold-mass', 'copper-former', 'coolant']) {
      const info = explain(id, r);
      const values = entries(info);
      assert.equal(values['Copper outer surface'], '77.01 K (prescribed)');
      assert.equal(values['LN₂ coolant'], '77.00 K (prescribed)');
      assert.ok(info.body.join(' ').includes('not a predicted temperature drop'));
    }
    const steps = explainSteps(r);
    assert.ok(steps[steps.length - 1].detail.includes('77.01 K'));
  });
});
