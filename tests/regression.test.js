import { assert, describe, it } from './harness.js';
import cases from '../reference/synthetic_cases.js';
import { solve } from '../src/model/solver.js';
import { mliSweep, pressureSweep } from '../src/model/sweeps.js';

describe('independent synthetic Version 2 heat-balance oracle', () => {
  it('covers all regimes and both sides of both switches', () => {
    const regimes = new Set(cases.map((c) => c.expected.regime));
    for (const regime of ['continuum', 'transition', 'free-molecular']) {
      assert.ok(regimes.has(regime), 'missing ' + regime);
    }
    for (const name of ['molecular-below', 'molecular-above', 'continuum-below', 'continuum-above']) {
      assert.ok(cases.some((c) => c.name === name), 'missing ' + name);
    }
  });

  for (const sample of cases) {
    it('matches independent heat balance: ' + sample.name, () => {
      const actual = solve(sample.inputs);
      const expected = sample.expected;
      assert.ok(actual.finite && actual.converged, sample.name + ' must converge to finite values');
      assert.equal(actual.regime, expected.regime);
      assert.close(actual.Q, expected.Q, 1e-8, sample.name + ': heat flow');
      assert.close(actual.Kn, expected.Kn, 1e-12, sample.name + ': Knudsen number');
      for (const key of ['k_eff_gas', 'k_eff_gap', 'R_gas', 'R_gap']) {
        assert.close(actual[key], expected[key], 1e-12, sample.name + ': ' + key);
      }
      for (const key of ['Q_gas', 'Q_rad_vacuum', 'Q_solid_MLI']) {
        assert.near(actual[key], expected[key], 1e-8, sample.name + ': ' + key);
      }
      if (sample.inputs.n_mli === 0) {
        // Deliberate departure from the notebook's nonzero N=0 contact term.
        assert.equal(actual.R_solid_MLI, Infinity, 'no blanket means open contact path');
        assert.equal(actual.Q_solid_MLI, 0);
      } else {
        assert.close(actual.R_solid_MLI, expected.R_solid_MLI, 1e-8, sample.name + ': solid resistance');
      }
      for (const key of ['T1', 'T2', 'T3', 'T4']) {
        assert.near(actual[key], expected[key], 2e-8, sample.name + ': ' + key);
      }
    });
  }

  it('reproduces independent pressure cases through the pressure-sweep API', () => {
    for (const name of ['deep-vacuum', 'transition', 'continuum']) {
      const sample = cases.find((c) => c.name === name);
      const point = pressureSweep(sample.inputs, {
        min: sample.inputs.P_vacuum, max: sample.inputs.P_vacuum, count: 1,
      })[0];
      assert.close(point.result.Q, sample.expected.Q, 1e-8, name + ': sweep Q');
      assert.near(point.result.Q_solid_MLI, sample.expected.Q_solid_MLI, 1e-8);
    }
  });

  it('reproduces independent MLI cases through the MLI-sweep API', () => {
    const selected = ['no-insulation', 'one-layer', 'transition', 'more-insulation']
      .map((name) => cases.find((c) => c.name === name));
    const points = mliSweep(selected[2].inputs, {
      layers: selected.map((c) => c.inputs.n_mli), pressure: selected[2].inputs.P_vacuum,
    });
    for (let i = 0; i < points.length; i++) {
      assert.close(points[i].result.Q, selected[i].expected.Q, 1e-8, selected[i].name + ': sweep Q');
      assert.near(points[i].result.Q_solid_MLI, selected[i].expected.Q_solid_MLI, 1e-8);
    }
  });
});
