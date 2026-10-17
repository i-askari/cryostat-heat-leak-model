import { assert, describe, it } from './harness.js';
import cases from '../reference/synthetic_cases.js';
import { solve } from '../src/model/solver.js';

describe('independent synthetic heat-balance oracle', () => {
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
      for (const key of ['T1', 'T2', 'T3', 'T4']) {
        assert.near(actual[key], expected[key], 2e-8, sample.name + ': ' + key);
      }
    });
  }
});
