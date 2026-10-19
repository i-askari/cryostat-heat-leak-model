import { assert, describe, it } from './harness.js';
import { COPPER_COOLANT_OFFSET, DEFAULT_INPUTS } from '../src/model/constants.js';
import { calculateCryostat, solve } from '../src/model/solver.js';

const withInputs = (overrides) => ({ ...DEFAULT_INPUTS, ...overrides });

describe('prescribed copper and coolant boundary', () => {
  it('uses 77.01 K for the solved boundary and reports the independently imposed 77.00 K coolant', () => {
    const r = solve(DEFAULT_INPUTS);
    assert.equal(COPPER_COOLANT_OFFSET, 0.01);
    assert.equal(DEFAULT_INPUTS.T_cold, 77.01);
    assert.equal(r.T_copper_outer, 77.01);
    assert.near(r.T_coolant, 77.00, 1e-12);
    assert.near(r.driving_difference, DEFAULT_INPUTS.T_amb - 77.01, 1e-12);
    assert.near(r.Q, (DEFAULT_INPUTS.T_amb - 77.01) / r.R_total, 1e-12);
    assert.ok(Math.abs(r.Q - (DEFAULT_INPUTS.T_amb - 77.00) / r.R_total) > 1e-8,
      'coolant is not the boundary of the calculated network');
    assert.near(r.dT_inner_gap, r.T4 - r.T_copper_outer, 1e-12);
    assert.near(r.Q_inner_gap, r.dT_inner_gap / r.R_gap, 1e-12);
    assert.near(r.Q_inner_gap * r.R_gap, r.Q * r.R_gap, DEFAULT_INPUTS.tolerance);
    assert.equal('R_copper' in r, false, 'the imposed copper drop must not create a fitted resistance');
    assert.equal('R_gap_rad' in r, false, 'inner-gap radiation is neglected');
  });

  it('keeps T_cold compatible with arbitrary notebook/reference boundary inputs', () => {
    for (const T_cold of [77, 105, 130]) {
      const r = solve(withInputs({ T_cold }));
      assert.equal(r.T_copper_outer, T_cold);
      assert.near(r.T_coolant, T_cold - COPPER_COOLANT_OFFSET, 1e-12);
      assert.near(r.Q, (DEFAULT_INPUTS.T_amb - T_cold) / r.R_total, 1e-12);
    }
  });
});

describe('solver convergence', () => {
  it('converges at every pressure across twelve decades', () => {
    for (let exp = -7; exp <= 5; exp++) {
      const r = solve(withInputs({ P_vacuum: 10 ** exp }));
      assert.ok(r.converged, `should converge at 10^${exp} Pa`);
      assert.less(r.iterations, DEFAULT_INPUTS.max_iterations, `10^${exp} Pa iteration count`);
    }
  });

  it('reports the iteration count it actually used', () => {
    const r = solve(DEFAULT_INPUTS);
    assert.greater(r.iterations, 0);
    assert.ok(Number.isInteger(r.iterations));
  });

  it('reports non-convergence rather than pretending to converge', () => {
    // One iteration cannot satisfy the chosen tolerance from the initial guess.
    const r = solve(withInputs({ max_iterations: 1 }));
    assert.equal(r.converged, false);
    assert.equal(r.iterations, 1);

    const wrapped = calculateCryostat(withInputs({ max_iterations: 1 }));
    assert.ok(wrapped.ok, 'a non-converged solve still returns a result');
    assert.ok(
      wrapped.warnings.some((w) => w.key === 'solver'),
      'non-convergence must surface as a warning',
    );
  });

  it('produces only finite numbers', () => {
    for (const inputs of [
      DEFAULT_INPUTS,
      withInputs({ P_vacuum: 1e-7 }),
      withInputs({ P_vacuum: 100000 }),
      withInputs({ n_mli: 0 }),
      withInputs({ n_mli: 500 }),
      withInputs({ eps_al: 1 }),
      withInputs({ T_cold: 4 }),
      withInputs({ length: 1e-3 }),
      withInputs({ length: 1e3 }),
    ]) {
      const r = solve(inputs);
      for (const [key, value] of Object.entries(r)) {
        if (typeof value === 'number') {
          // An open contact path is intentionally represented by Infinity.
          if (key === 'R_solid_MLI' && inputs.n_mli === 0) {
            assert.equal(value, Infinity);
            continue;
          }
          assert.finite(value, `${key} should be finite for P=${inputs.P_vacuum}`);
        }
      }
    }
  });
});

describe('energy balance', () => {
  it('drives the same heat flow through every series element', () => {
    // The solver stops once every interface temperature moves by less than
    // `tolerance`, so each leg reproduces Q to within that temperature
    // tolerance rather than to machine precision. Asserting in the
    // temperature domain states exactly the guarantee the solver gives.
    for (const P of [1e-6, 1e-3, 1, 100, 100000]) {
      const inputs = withInputs({ P_vacuum: P });
      const r = solve(inputs);
      const tol = inputs.tolerance;

      assert.near(r.dT_ambient, r.Q * r.R_ambient, tol, `ambient leg at ${P} Pa`);
      assert.near(r.dT_outer_wall, r.Q * r.R_cond_ow, tol, `outer wall at ${P} Pa`);
      assert.near(r.dT_vacuum, r.Q * r.R_vacuum, tol, `vacuum gap at ${P} Pa`);
      assert.near(r.dT_inner_wall, r.Q * r.R_cond_iw, tol, `inner wall at ${P} Pa`);
      assert.near(r.dT_inner_gap, r.Q * r.R_gap, tol, `inner gap at ${P} Pa`);

      // The temperature drops must account for the whole boundary difference
      // exactly, because they are constructed as a partition of it.
      const total = r.dT_ambient + r.dT_outer_wall + r.dT_vacuum + r.dT_inner_wall + r.dT_inner_gap;
      assert.close(total, inputs.T_amb - inputs.T_cold, 1e-12, `temperature drops at ${P} Pa`);
    }
  });

  it('splits heat between parallel branches so they sum to the parallel flow', () => {
    for (const P of [1e-6, 1e-2, 1, 1e4]) {
      const inputs = withInputs({ P_vacuum: P });
      const r = solve(inputs);

      // Exact: each parallel network's branches partition its flow.
      assert.close(
        r.Q_conv + r.Q_rad_ambient, r.dT_ambient / r.R_ambient, 1e-12,
        `ambient branches at ${P} Pa`,
      );
      assert.close(
        r.Q_gas + r.Q_rad_vacuum + r.Q_solid_MLI, r.dT_vacuum / r.R_vacuum, 1e-12,
        `vacuum branches at ${P} Pa`,
      );
      assert.close(r.gas_fraction + r.radiation_fraction + r.fraction_solid_MLI, 1, 1e-12, `fractions at ${P} Pa`);

      // And that pair carries the series heat flow, to solver tolerance.
      assert.near(
        r.Q_gas + r.Q_rad_vacuum + r.Q_solid_MLI, r.Q, r.Q * 1e-4,
        `vacuum branch total against series Q at ${P} Pa`,
      );
    }
  });

  it('orders the interface temperatures monotonically from warm to cold', () => {
    for (const P of [1e-7, 1e-2, 1, 1e5]) {
      const r = solve(withInputs({ P_vacuum: P }));
      assert.ok(r.T1 <= DEFAULT_INPUTS.T_amb, 'T1 below ambient');
      assert.ok(r.T2 <= r.T1, 'T2 below T1');
      assert.ok(r.T3 <= r.T2, 'T3 below T2');
      assert.ok(r.T4 <= r.T3, 'T4 below T3');
      assert.ok(r.T4 >= DEFAULT_INPUTS.T_cold, 'T4 above the cold boundary');
    }
  });

  it('reproduces R_total from its parts', () => {
    const r = solve(DEFAULT_INPUTS);
    const rebuilt = r.R_ambient + r.R_cond_ow + r.R_vacuum + r.R_cond_iw + r.R_gap;
    assert.close(rebuilt, r.R_total, 1e-12);
    assert.close(1 / (1 / r.R_gas + 1 / r.R_rad + 1 / r.R_solid_MLI), r.R_vacuum, 1e-12);
  });

  it('removes the MLI contact branch only when no blanket exists', () => {
    for (const P of [1e-6, 0.75, 1e4]) {
      const absent = solve(withInputs({ n_mli: 0, P_vacuum: P }));
      const single = solve(withInputs({ n_mli: 1, P_vacuum: P }));
      assert.ok(absent.finite && absent.converged);
      assert.equal(absent.R_solid_MLI, Infinity);
      assert.equal(absent.Q_solid_MLI, 0);
      assert.equal(absent.fraction_solid_MLI, 0);
      const checked = calculateCryostat(withInputs({ n_mli: 0, P_vacuum: P }));
      assert.ok(checked.ok, 'an open contact path is a valid physical case');
      assert.equal(checked.result.Q_solid_MLI, 0);
      assert.greater(single.Q_solid_MLI, 0);
      assert.close(1 / (1 / absent.R_gas + 1 / absent.R_rad), absent.R_vacuum, 1e-12);
    }
  });
});

describe('length scaling', () => {
  it('makes Q exactly proportional to length', () => {
    const q1 = solve(withInputs({ length: 1 })).Q;
    const q2 = solve(withInputs({ length: 2 })).Q;
    const qHalf = solve(withInputs({ length: 0.5 })).Q;
    assert.close(q2, 2 * q1, 1e-12);
    assert.close(qHalf, 0.5 * q1, 1e-12);
  });

  it('leaves heat leak per unit length independent of the modelled length', () => {
    const a = solve(withInputs({ length: 1 })).Q_per_length;
    const b = solve(withInputs({ length: 7.3 })).Q_per_length;
    assert.close(a, b, 1e-12, 'W/m must not depend on the section length chosen');
  });

  it('leaves interface temperatures independent of length', () => {
    const a = solve(withInputs({ length: 1 }));
    const b = solve(withInputs({ length: 5 }));
    assert.close(a.T3, b.T3, 1e-12);
  });
});

describe('validated entry point', () => {
  it('returns ok with a result for valid input', () => {
    const out = calculateCryostat(DEFAULT_INPUTS);
    assert.ok(out.ok);
    assert.ok(out.result !== null);
    assert.equal(out.errors.length, 0);
  });

  it('returns errors and no result for invalid input', () => {
    const out = calculateCryostat(withInputs({ d_vacuum_gap: -1 }));
    assert.equal(out.ok, false);
    assert.equal(out.result, null);
    assert.greater(out.errors.length, 0);
    assert.ok(typeof out.errors[0].message === 'string' && out.errors[0].message.length > 0);
  });

  it('never returns NaN in place of a failure', () => {
    const out = calculateCryostat(withInputs({ T_cold: NaN }));
    assert.equal(out.ok, false);
    assert.equal(out.result, null);
  });

  it('rejects overflow in derived quantities even when heat flow is finite', () => {
    const out = calculateCryostat(withInputs({ P_vacuum: 1e-320 }));
    assert.equal(out.ok, false);
    assert.equal(out.result, null);
  });

  it('warns when absolute-temperature convergence leaves a large relative heat imbalance', () => {
    const out = calculateCryostat(withInputs({
      T_cold: DEFAULT_INPUTS.T_amb - 0.001, P_vacuum: 1e-5, n_mli: 64,
      tolerance: 0.001,
    }));
    assert.ok(out.ok && out.result.converged);
    assert.ok(out.warnings.some((w) => w.key === 'solver' && w.message.includes('differs')));
  });

  it('does not let the illustrative clearance warning alter any solver result', () => {
    // Same physical inputs: one path adds a warning and the other solves directly.
    // MLI layer count itself is a thermal input; the 0.2 mm warning heuristic is not.
    const inputs = withInputs({ n_mli: 110 });
    const direct = solve(inputs);
    const checked = calculateCryostat(inputs);
    assert.ok(checked.ok);
    assert.ok(checked.warnings.some((w) => w.key === 'n_mli' && w.message.includes('0.2 mm')));
    assert.ok(direct.finite && direct.converged);
    for (const [key, value] of Object.entries(direct)) {
      if (typeof value === 'number') {
        assert.equal(checked.result[key], value, 'clearance warning changed ' + key);
      }
    }
    assert.equal(checked.result.regime, direct.regime);
    assert.equal(checked.result.converged, direct.converged);
  });
});

describe('physical direction of the result', () => {
  it('gives zero heat leak in the limit of no temperature difference', () => {
    const r = solve(withInputs({ T_cold: DEFAULT_INPUTS.T_amb - 1e-6 }));
    assert.less(Math.abs(r.Q), 1e-3);
  });

  it('increases heat leak as the cold boundary gets colder', () => {
    const warm = solve(withInputs({ T_cold: 200 })).Q;
    const cold = solve(withInputs({ T_cold: 65 })).Q;
    assert.greater(cold, warm);
  });

  it('carries more heat as the vacuum degrades, then plateaus', () => {
    // These coarse samples increase; the inherited hard regime switches can
    // introduce local discontinuities between them.
    let previous = -Infinity;
    for (const exp of [-7, -5, -3, -2, -1, 0, 1, 2, 3, 5]) {
      const q = solve(withInputs({ P_vacuum: 10 ** exp })).Q;
      assert.ok(q >= previous, `Q should never fall as pressure rises (10^${exp} Pa)`);
      previous = q;
    }

    for (const exp of [-7, -5, -3, -2, -1, 0]) {
      const lower = solve(withInputs({ P_vacuum: 10 ** exp })).Q;
      const higher = solve(withInputs({ P_vacuum: 10 ** (exp + 1) })).Q;
      assert.greater(higher, lower, `Q should strictly rise below continuum (10^${exp} Pa)`);
    }
  });

  it('saturates at a radiation-and-contact floor as pressure approaches zero', () => {
    const a = solve(withInputs({ P_vacuum: 1e-9 })).Q;
    const b = solve(withInputs({ P_vacuum: 1e-11 })).Q;
    assert.close(a, b, 1e-3, 'below the gas contribution, radiation and contact remain');
    assert.greater(a, 0);
  });

  it('saturates at a continuum-limited ceiling above about 100 Pa', () => {
    const a = solve(withInputs({ P_vacuum: 1e3 })).Q;
    const b = solve(withInputs({ P_vacuum: 100000 })).Q;
    assert.close(a, b, 1e-9, 'continuum conductivity is pressure independent');
  });
});
