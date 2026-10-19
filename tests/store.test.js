/**
 * Store behaviour: memo invalidation, sensitivity screening and reset.
 *
 * The store runs headlessly because it guards every `window` access, so the
 * cache behaviour that the interface depends on can be tested directly rather
 * than inferred from a chart looking wrong.
 *
 * A stale memo is the characteristic failure of an interactive model: the
 * numbers move and a plot does not. These tests pin the dependency of each
 * derived quantity on each input.
 */

import { assert, describe, it } from './harness.js';
import { DEFAULT_INPUTS } from '../src/model/constants.js';
import { calculateCryostat } from '../src/model/solver.js';
import { createStore } from '../src/state/store.js';
import { sweepWarning } from '../src/ui/analysis.js';

describe('store: single-point result', () => {
  it('starts from the default inputs', () => {
    const store = createStore();
    for (const [key, value] of Object.entries(DEFAULT_INPUTS)) {
      assert.close(store.inputs[key], value, 1e-15, `default ${key}`);
    }
    assert.ok(store.derived.calc.ok);
    assert.equal(store.ui.targetHeatLeak, 2.2, 'approved illustrative inverse target');
  });

  it('recomputes when an input changes', () => {
    const store = createStore();
    const before = store.derived.calc.result.Q;
    store.setInput('P_vacuum', 10);
    assert.ok(Math.abs(store.derived.calc.result.Q - before) > 0, 'Q should move');
  });

  it('reuses the cached result when nothing changed', () => {
    const store = createStore();
    assert.ok(store.derived.calc === store.derived.calc, 'should return the cached object');
  });

  it('notifies subscribers once per change and not at all for a no-op', () => {
    const store = createStore();
    let calls = 0;
    store.subscribe(() => { calls++; });

    store.setInput('n_mli', 30);
    assert.equal(calls, 1);

    store.setInput('n_mli', 30); // same value
    assert.equal(calls, 1, 'setting the same value must not notify');

    store.setUi({ analysisTab: 'mli' });
    assert.equal(calls, 2);
  });

  it('stops notifying after unsubscribe', () => {
    const store = createStore();
    let calls = 0;
    const off = store.subscribe(() => { calls++; });
    store.setInput('n_mli', 31);
    off();
    store.setInput('n_mli', 32);
    assert.equal(calls, 1);
  });
});

describe('store: memo invalidation', () => {
  /**
   * Every input except the swept one must invalidate the pressure sweep.
   * This is the test that would fail if a dependency were dropped from the
   * cache key.
   */
  it('invalidates the pressure sweep for every input except pressure', () => {
    const perturbations = Object.fromEntries(
      Object.entries(DEFAULT_INPUTS)
        .filter(([key]) => !['P_vacuum', 'max_iterations', 'tolerance'].includes(key))
        .map(([key, value]) => [key, key === 'n_mli' ? value + 4 : value * 1.2]),
    );

    for (const [key, value] of Object.entries(perturbations)) {
      const store = createStore();
      const before = store.derived.pressureSweep.map((p) => p.result.Q);
      store.setInput(key, value);
      const after = store.derived.pressureSweep.map((p) => p.result.Q);

      const moved = after.some((q, i) => q !== before[i]);
      assert.ok(moved, `changing ${key} must invalidate the pressure sweep`);
    }
  });

  it('does not recompute the pressure sweep when only the pressure changes', () => {
    const store = createStore();
    const first = store.derived.pressureSweep;
    store.setInput('P_vacuum', 42);
    assert.ok(
      store.derived.pressureSweep === first,
      'the swept variable must not invalidate its own sweep',
    );
  });

  it('updates cached pressure-sweep gas and contact branches when MLI changes', () => {
    const store = createStore();
    const first = store.derived.pressureSweep;
    const transition = first.findIndex((p) => p.result.regime === 'transition');
    assert.ok(transition >= 0);
    store.setInput('n_mli', 32);
    const second = store.derived.pressureSweep;
    assert.ok(first !== second);
    assert.less(second[transition].result.k_eff_gas, first[transition].result.k_eff_gas);
    assert.ok(second[transition].result.Q_solid_MLI !== first[transition].result.Q_solid_MLI);
  });

  it('updates both cached sweeps and sensitivity when inner-gap temperature changes', () => {
    const store = createStore();
    const pressure = store.derived.pressureSweep;
    const mli = store.derived.mliSweep;
    const sensitivity = store.derived.sensitivity;
    store.setInput('T_inner_gap', 90);
    assert.ok(store.derived.pressureSweep !== pressure);
    assert.ok(store.derived.mliSweep !== mli);
    assert.ok(store.derived.sensitivity !== sensitivity);
    assert.ok(store.derived.pressureSweep[0].result.k_eff_gap !== pressure[0].result.k_eff_gap);
  });

  it('keeps the MLI sweep independent of the layer count', () => {
    const store = createStore();
    const first = store.derived.mliSweep;
    store.setInput('n_mli', 55);
    assert.ok(store.derived.mliSweep === first, 'layer count must not invalidate the MLI sweep');
  });

  it('invalidates the MLI sweep when the pressure it is evaluated at changes', () => {
    const store = createStore();
    const before = store.derived.mliSweep.points.map((p) => p.result.Q);
    store.setInput('P_vacuum', 1e-4);
    const after = store.derived.mliSweep.points.map((p) => p.result.Q);
    assert.ok(after.some((q, i) => q !== before[i]), 'sweep should follow the current pressure');
  });

  it('holds the MLI sweep at the reference pressure when asked to', () => {
    const store = createStore();
    store.setUi({ mliSweepPressure: 'reference' });
    const before = store.derived.mliSweep;
    store.setInput('P_vacuum', 1e-5);
    assert.ok(
      store.derived.mliSweep === before,
      'a reference-pressure sweep must not follow the current pressure',
    );
  });

  it('invalidates the sensitivity screening when an input changes', () => {
    const store = createStore();
    const before = store.derived.sensitivity;
    store.setInput('eps_al', 0.4);
    assert.ok(store.derived.sensitivity !== before, 'sensitivity must be recomputed');
  });

  it('evaluates every sweep point at its own swept value', () => {
    const store = createStore();
    for (const point of store.derived.pressureSweep) {
      assert.close(point.result.P_vacuum, point.x, 1e-15);
    }
    for (const point of store.derived.mliSweep.points) {
      assert.equal(point.result.n_mli, point.x);
    }
  });
});

describe('store: invalid input', () => {
  it('reports errors and withholds derived data', () => {
    const store = createStore();
    store.setInput('t_inner_wall', 0);

    assert.equal(store.derived.calc.ok, false);
    assert.equal(store.derived.calc.result, null);
    assert.greater(store.derived.calc.errors.length, 0);
    assert.equal(store.derived.pressureSweep.length, 0, 'no sweep from invalid inputs');
    assert.equal(store.derived.mliSweep.points.length, 0);
    assert.equal(store.derived.sensitivity.length, 0);
  });

  it('recovers when the input is corrected', () => {
    const store = createStore();
    store.setInput('t_inner_wall', 0);
    store.setInput('t_inner_wall', DEFAULT_INPUTS.t_inner_wall);

    assert.ok(store.derived.calc.ok);
    assert.greater(store.derived.pressureSweep.length, 0);
  });
});

describe('store: sensitivity screening', () => {
  it('ranks parameters by how much they move the heat leak', () => {
    const store = createStore();
    const rows = store.derived.sensitivity;

    assert.greater(rows.length, 0);
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i - 1].span >= rows[i].span, 'rows must be sorted by span');
    }
    for (const row of rows) {
      assert.finite(row.low);
      assert.finite(row.high);
      assert.finite(row.span);
    }
  });

  it('skips a parameter whose perturbation would be invalid', () => {
    // Raising this cold boundary by 20 percent would put it above ambient,
    // which the model rejects; the row must be dropped rather than reported
    // as a null change.
    const store = createStore();
    store.setInput('T_cold', 280);

    const cold = store.derived.sensitivity.find((r) => r.key === 'T_cold');
    assert.equal(cold, undefined, 'an unevaluable perturbation must be skipped');
    assert.greater(store.derived.sensitivity.length, 0, 'other rows still reported');
  });

  it('omits an unconverged perturbation even when the selected solve converges', () => {
    // A low cap creates a distinct, reproducible perturbation-only failure.
    const store = createStore();
    store.setInputs({
      n_mli: 52, eps_al: 0.9, P_vacuum: 0.3, d_vacuum_gap: 0.0017,
      P_inner_gap: 0.0003, T_inner_gap: 210, T_amb: 330, T_cold: 184,
      max_iterations: 4,
    });
    assert.ok(store.derived.calc.ok && store.derived.calc.result.converged);
    const perturbed = calculateCryostat({ ...store.inputs, d_air: store.inputs.d_air * 1.2 });
    assert.ok(perturbed.ok && !perturbed.result.converged, 'the perturbation must exhaust the cap');
    assert.equal(store.derived.sensitivity.find((row) => row.key === 'd_air'), undefined);
    assert.greater(store.derived.sensitivity.length, 0, 'other converged rows remain available');
  });

  it('withholds the screening when the base solution does not converge', () => {
    const store = createStore();
    store.setInput('max_iterations', 1);
    assert.ok(store.derived.calc.ok && !store.derived.calc.result.converged);
    assert.equal(store.derived.sensitivity.length, 0);
  });

  it('uses at least a one-layer MLI perturbation, clamped at zero', () => {
    for (const n of [0, 1, 2, 16]) {
      const store = createStore();
      store.setInput('n_mli', n);
      const row = store.derived.sensitivity.find((candidate) => candidate.key === 'n_mli');
      assert.ok(row, `MLI row for ${n} layers`);
      const step = Math.max(1, Math.round(n * 0.2));
      assert.equal(row.lowValue, Math.max(0, n - step));
      assert.equal(row.highValue, n + step);
      assert.ok(row.highValue > row.nominal, 'the upper perturbation must change the layer count');
      if (n > 0) assert.ok(row.lowValue < row.nominal, 'the lower perturbation must change the layer count');
      const lower = calculateCryostat({ ...store.inputs, n_mli: row.lowValue });
      const upper = calculateCryostat({ ...store.inputs, n_mli: row.highValue });
      assert.close(row.low, lower.result.Q_per_length - store.derived.calc.result.Q_per_length, 1e-12);
      assert.close(row.high, upper.result.Q_per_length - store.derived.calc.result.Q_per_length, 1e-12);
      assert.greater(row.span, 0, `the ${n}-layer screening must not report a false zero span`);
    }
  });
});

describe('analysis: sweep convergence warnings', () => {
  it('reports failed counts and avoids double-counting each point', () => {
    const points = [
      { result: { converged: true, finite: true } },
      { result: { converged: false, finite: true } },
      { result: { converged: false, finite: false } },
      { result: { converged: true, finite: false } },
    ];
    assert.equal(sweepWarning(points, 'Pressure'),
      'Pressure sweep: 3 of 4 points did not converge or produced non-finite results. Failed points are omitted from plots. CSV retains them with diagnostic flags.');
    assert.ok(sweepWarning(points, 'MLI').startsWith('MLI sweep: 3 of 4'));
    assert.equal(sweepWarning(points.slice(0, 1), 'Pressure'), null);
    assert.equal(sweepWarning([], 'Pressure'), null);
  });
});

describe('store: reset', () => {
  it('restores every default', () => {
    const store = createStore();
    store.setInputs({ P_vacuum: 1e-5, n_mli: 90, eps_al: 0.6, d_vacuum_gap: 0.055 });
    store.reset();

    for (const [key, value] of Object.entries(DEFAULT_INPUTS)) {
      assert.close(store.inputs[key], value, 1e-15, `${key} after reset`);
    }
  });
});

describe('store: URL state', () => {
  it('preserves precise values and does not silently round invalid layer counts', () => {
    if (typeof URL === 'undefined') return; // JavaScriptCore without Web APIs
    const previous = globalThis.window;
    try {
      globalThis.window = { location: { href: 'http://localhost/', hash: '#rcu=0.012345678912345&N=2.5' } };
      const store = createStore();
      assert.equal(store.inputs.r_cu, 0.012345678912345);
      assert.equal(store.inputs.n_mli, 2.5);
      assert.equal(store.derived.calc.ok, false);
      const shared = new URL(store.shareableUrl());
      assert.ok(shared.hash.includes('rcu=0.012345678912345'));
      assert.ok(shared.hash.includes('N=2.5'));
    } finally {
      if (previous === undefined) delete globalThis.window;
      else globalThis.window = previous;
    }
  });
});
