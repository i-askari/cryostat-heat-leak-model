import { assert, describe, it } from './harness.js';
import { resistanceLogDomain } from '../src/plots/charts.js';

describe('resistance plot domain', () => {
  it('includes radiation and the parallel equivalent, not just gas', () => {
    const domain = resistanceLogDomain([
      { result: { R_gas: 10, R_rad: 1000, R_vacuum: 9 } },
      { result: { R_gas: 100, R_rad: 5000, R_vacuum: 80 } },
    ]);
    assert.equal(domain[0], 1);
    assert.equal(domain[1], 10000);
  });
});
