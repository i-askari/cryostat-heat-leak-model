import { assert, describe, it } from './harness.js';
import { DEFAULT_INPUTS, MLI_SWEEP_LAYERS } from '../src/model/constants.js';
import { regimeBoundaryPressures } from '../src/model/gas.js';
import { solve } from '../src/model/solver.js';
import {
  findPressureForHeatLeak,
  logspace,
  mliSweep,
  parameterSweep,
  pressureSweep,
} from '../src/model/sweeps.js';

describe('logspace', () => {
  it('includes both endpoints', () => {
    const v = logspace(-7, 5, 13);
    assert.equal(v.length, 13);
    assert.close(v[0], 1e-7, 1e-12);
    assert.close(v[12], 1e5, 1e-12);
  });

  it('is geometrically spaced', () => {
    const v = logspace(0, 3, 4);
    assert.close(v[1] / v[0], v[2] / v[1], 1e-12);
    assert.close(v[1] / v[0], 10, 1e-12);
  });

  it('handles a single point', () => {
    assert.equal(logspace(2, 5, 1).length, 1);
    assert.close(logspace(2, 5, 1)[0], 100, 1e-12);
  });
});

describe('pressure sweep', () => {
  const sweep = pressureSweep(DEFAULT_INPUTS, { count: 60 });

  it('returns one full solve per point', () => {
    assert.equal(sweep.length, 60);
    for (const point of sweep) {
      assert.finite(point.x);
      assert.finite(point.result.Q);
      assert.ok(point.result.converged);
    }
  });

  it('evaluates the swept pressure, not the base pressure', () => {
    for (const point of sweep) {
      assert.close(point.result.P_vacuum, point.x, 1e-15);
    }
  });

  it('rises at these coarse sample pressures', () => {
    for (let i = 1; i < sweep.length; i++) {
      assert.ok(
        sweep[i].result.Q >= sweep[i - 1].result.Q,
        `Q fell between ${sweep[i - 1].x} and ${sweep[i].x} Pa`,
      );
    }
  });

  it('covers all three gas regimes', () => {
    const regimes = new Set(sweep.map((p) => p.result.regime));
    assert.ok(regimes.has('continuum'));
    assert.ok(regimes.has('transition'));
    assert.ok(regimes.has('free-molecular'));
  });

  it('respects an explicit range', () => {
    const narrow = pressureSweep(DEFAULT_INPUTS, { min: 1e-3, max: 1e-1, count: 10 });
    assert.close(narrow[0].x, 1e-3, 1e-12);
    assert.close(narrow[narrow.length - 1].x, 1e-1, 1e-12);
  });

  it('reflects changes to other parameters', () => {
    const shiny = pressureSweep({ ...DEFAULT_INPUTS, eps_al: 0.02 }, { count: 20 });
    const dull = pressureSweep({ ...DEFAULT_INPUTS, eps_al: 0.5 }, { count: 20 });
    assert.greater(dull[0].result.Q, shiny[0].result.Q, 'emissivity must move the whole curve');
  });
});

describe('MLI sweep', () => {
  const sweep = mliSweep(DEFAULT_INPUTS);

  it('uses the documented layer counts', () => {
    assert.equal(sweep.length, MLI_SWEEP_LAYERS.length);
    sweep.forEach((point, i) => assert.equal(point.x, MLI_SWEEP_LAYERS[i]));
  });

  it('holds pressure fixed across the sweep', () => {
    const pressures = new Set(sweep.map((p) => p.result.P_vacuum));
    assert.equal(pressures.size, 1);
  });

  it('raises radiative resistance and lowers heat leak with more layers', () => {
    for (let i = 1; i < sweep.length; i++) {
      assert.greater(sweep[i].result.R_rad, sweep[i - 1].result.R_rad);
      assert.less(sweep[i].result.Q, sweep[i - 1].result.Q);
    }
  });

  it('accepts an explicit pressure and layer list', () => {
    const custom = mliSweep(DEFAULT_INPUTS, { layers: [0, 10], pressure: 1e-6 });
    assert.equal(custom.length, 2);
    assert.equal(custom[0].result.n_mli, 0);
    assert.close(custom[1].result.P_vacuum, 1e-6, 1e-15);
    // In a good vacuum, radiation matters, so layers should do much more here.
    const change = (custom[0].result.Q - custom[1].result.Q) / custom[0].result.Q;
    assert.greater(change, 0.5, 'MLI should matter when radiation dominates');
  });
});

describe('parameter sweep', () => {
  it('varies exactly the requested key', () => {
    const points = parameterSweep(DEFAULT_INPUTS, 'eps_al', [0.02, 0.07, 0.1]);
    assert.equal(points.length, 3);
    assert.close(points[1].result.inputs.eps_al, 0.07, 1e-15);
    assert.close(points[0].result.inputs.P_vacuum, DEFAULT_INPUTS.P_vacuum, 1e-15);
  });
});

describe('inverse lookup: pressure for a target heat leak', () => {
  it('finds a pressure that reproduces the target', () => {
    const target = 5.0; // W/m
    const found = findPressureForHeatLeak(DEFAULT_INPUTS, target);
    assert.ok(found.found, found.reason);
    assert.near(found.result.Q_per_length, target, 1e-3);
    assert.greater(found.pressure, 1e-7);
    assert.less(found.pressure, 100000);
  });

  it('is self-consistent: solving at the found pressure reproduces the target', () => {
    for (const pressure of [1e-5, 1e-3, 0.2, 2, 20]) {
      const target = solve({ ...DEFAULT_INPUTS, P_vacuum: pressure }).Q_per_length;
      const found = findPressureForHeatLeak(DEFAULT_INPUTS, target);
      assert.ok(found.found, `target ${target}: ${found.reason}`);
      assert.near(found.result.Q_per_length, target, 1e-2, `target ${target} W/m`);
    }
  });

  it('explains why an unreachable target below the radiation floor fails', () => {
    const found = findPressureForHeatLeak(DEFAULT_INPUTS, 0.01);
    assert.equal(found.found, false);
    assert.equal(found.pressure, null);
    assert.ok(found.reason.length > 0, 'must explain itself');
  });

  it('explains why a target above the continuum ceiling fails', () => {
    const found = findPressureForHeatLeak(DEFAULT_INPUTS, 1000);
    assert.equal(found.found, false);
    assert.ok(found.reason.length > 0);
  });

  it('moves the required pressure when the design changes', () => {
    const base = findPressureForHeatLeak(DEFAULT_INPUTS, 3.0);
    const better = findPressureForHeatLeak({ ...DEFAULT_INPUTS, n_mli: 200 }, 3.0);
    assert.ok(base.found && better.found);
    // More MLI cuts radiation, so more gas conduction can be tolerated.
    assert.greater(better.pressure, base.pressure);
  });

  it('does not report a root in the continuum-boundary jump', () => {
    const boundary = regimeBoundaryPressures(
      DEFAULT_INPUTS.mfp_coefficient, DEFAULT_INPUTS.d_vacuum_gap,
    ).continuumAbove;
    const q = (p) => solve({ ...DEFAULT_INPUTS, P_vacuum: p }).Q_per_length;
    const before = q(boundary * (1 - 1e-8));
    const after = q(boundary * (1 + 1e-8));
    assert.greater(after, before);
    const found = findPressureForHeatLeak(DEFAULT_INPUTS, (before + after) / 2);
    assert.equal(found.found, false);
    assert.ok(found.reason.includes('jump'));
  });

  it('finds the lower-pressure root when the free-molecular jump creates two', () => {
    const boundary = regimeBoundaryPressures(
      DEFAULT_INPUTS.mfp_coefficient, DEFAULT_INPUTS.d_vacuum_gap,
    ).freeMolecularBelow;
    const q = (p) => solve({ ...DEFAULT_INPUTS, P_vacuum: p }).Q_per_length;
    const before = q(boundary * (1 - 1e-8));
    const after = q(boundary * (1 + 1e-8));
    assert.greater(before, after);
    const target = (before + after) / 2;
    const found = findPressureForHeatLeak(DEFAULT_INPUTS, target);
    assert.ok(found.found, found.reason);
    assert.equal(found.result.regime, 'free-molecular');
    assert.near(found.result.Q_per_length, target, target * 1e-5);
  });

  it('returns an endpoint root and rejects an invalid target', () => {
    const min = 1e-6;
    const max = 1e-2;
    const target = pressureSweep(DEFAULT_INPUTS, { min, max, count: 2 })[0].result.Q_per_length;
    assert.equal(findPressureForHeatLeak(DEFAULT_INPUTS, target, { min, max }).pressure, min);
    assert.equal(findPressureForHeatLeak(DEFAULT_INPUTS, NaN).found, false);
  });
});
