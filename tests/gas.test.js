import { assert, describe, it } from './harness.js';
import { K_B } from '../src/model/constants.js';
import {
  classifyRegime,
  effectiveGasConductivity,
  meanFreePathFitted,
  meanFreePathKinetic,
} from '../src/model/gas.js';

const K_AIR = 0.031;
const C = 2.4;
const D = 0.017; // illustrative gap [m]
const MFP_COEFFICIENT = 0.0043; // illustrative [m Pa]

describe('mean free path', () => {
  it('is inversely proportional to pressure (fitted form)', () => {
    assert.close(meanFreePathFitted(1.0, MFP_COEFFICIENT), MFP_COEFFICIENT, 1e-15);
    assert.close(meanFreePathFitted(100.0, MFP_COEFFICIENT), MFP_COEFFICIENT / 100, 1e-15);
    // Halving pressure doubles the mean free path.
    assert.close(meanFreePathFitted(0.5, MFP_COEFFICIENT) / meanFreePathFitted(1.0, MFP_COEFFICIENT), 2, 1e-12);
  });

  it('matches kinetic theory for the inner gap', () => {
    const T = 120.0;
    const P = 7.0;
    const d = 4.0e-10;
    const expected = (K_B * T) / (Math.sqrt(2) * Math.PI * d * d * P);
    assert.close(meanFreePathKinetic(T, P, d), expected, 1e-15);
  });

  it('grows with temperature and shrinks with molecular size', () => {
    assert.greater(meanFreePathKinetic(160, 7, 4e-10), meanFreePathKinetic(120, 7, 4e-10));
    assert.less(meanFreePathKinetic(120, 7, 5e-10), meanFreePathKinetic(120, 7, 4e-10));
  });
});

describe('Knudsen regime classification', () => {
  it('uses 0.01 and 10 as the thresholds', () => {
    assert.equal(classifyRegime(0.009), 'continuum');
    assert.equal(classifyRegime(0.01), 'transition', 'threshold is exclusive at the low end');
    assert.equal(classifyRegime(1), 'transition');
    assert.equal(classifyRegime(10), 'transition', 'threshold is exclusive at the high end');
    assert.equal(classifyRegime(10.001), 'free-molecular');
  });

  it('classifies the physical extremes correctly', () => {
    // Atmospheric pressure in the illustrative gap.
    assert.equal(classifyRegime(meanFreePathFitted(100000, MFP_COEFFICIENT) / D), 'continuum');
    // Deep vacuum.
    assert.equal(classifyRegime(meanFreePathFitted(1e-7, MFP_COEFFICIENT) / D), 'free-molecular');
  });
});

describe('effective gas conductivity', () => {
  it('equals the continuum value when molecules collide often', () => {
    const lambda = 0.005 * D; // Kn = 0.005
    assert.close(effectiveGasConductivity(K_AIR, lambda, D, C), K_AIR, 1e-15);
  });

  it('is independent of pressure in the continuum regime', () => {
    const a = effectiveGasConductivity(K_AIR, meanFreePathFitted(1e4, MFP_COEFFICIENT), D, C);
    const b = effectiveGasConductivity(K_AIR, meanFreePathFitted(1e5, MFP_COEFFICIENT), D, C);
    assert.close(a, b, 1e-15);
  });

  it('uses the bridging form in the transition regime', () => {
    const lambda = 0.5 * D; // Kn = 0.5
    const expected = K_AIR / (1 + (C * lambda) / D);
    assert.close(effectiveGasConductivity(K_AIR, lambda, D, C), expected, 1e-15);
    assert.less(effectiveGasConductivity(K_AIR, lambda, D, C), K_AIR);
  });

  it('becomes proportional to pressure in the free-molecular regime', () => {
    const kAt = (P) => effectiveGasConductivity(K_AIR, meanFreePathFitted(P, MFP_COEFFICIENT), D, C);
    const p1 = 1e-5;
    const p2 = 2e-5;
    // lambda ~ 1/P, and k_eff ~ 1/lambda there, so k_eff should double with P.
    assert.close(kAt(p2) / kAt(p1), 2, 1e-12);
  });

  it('decreases across a coarse set of pressures', () => {
    let previous = Infinity;
    for (let exp = 5; exp >= -7; exp--) {
      const k = effectiveGasConductivity(K_AIR, meanFreePathFitted(10 ** exp, MFP_COEFFICIENT), D, C);
      assert.ok(k <= previous + 1e-18, `k_eff should not increase as pressure falls (10^${exp})`);
      previous = k;
    }
  });

  it('exposes the inherited downward jump at the molecular-to-transition boundary', () => {
    const p = MFP_COEFFICIENT / (10 * D);
    const kAt = (pressure) => effectiveGasConductivity(K_AIR, meanFreePathFitted(pressure, MFP_COEFFICIENT), D, C);
    assert.greater(kAt(p * (1 - 1e-9)), kAt(p * (1 + 1e-9)));
  });

  it('scales with the accommodation constant C in the rarefied branches', () => {
    const lambda = 5 * D; // transition
    const kC1 = effectiveGasConductivity(K_AIR, lambda, D, 1);
    const kC3 = effectiveGasConductivity(K_AIR, lambda, D, 3);
    assert.less(kC3, kC1, 'larger C means more resistance to gas conduction');
  });

  it('is finite and positive across twelve decades of pressure', () => {
    for (let exp = 5; exp >= -7; exp--) {
      const k = effectiveGasConductivity(K_AIR, meanFreePathFitted(10 ** exp, MFP_COEFFICIENT), D, C);
      assert.finite(k, `k_eff at 10^${exp} Pa`);
      assert.greater(k, 0, `k_eff at 10^${exp} Pa`);
    }
  });
});
