import { assert, describe, it } from './harness.js';
import { DEFAULT_INPUTS } from '../src/model/constants.js';
import { resolveGeometry, validateInputs } from '../src/model/geometry.js';

const withInputs = (overrides) => ({ ...DEFAULT_INPUTS, ...overrides });

describe('geometry', () => {
  it('stacks radii outward from the copper radius', () => {
    const g = resolveGeometry(withInputs({
      r_cu: 0.011, d_inner_gap: 0.004, t_inner_wall: 0.002,
      d_vacuum_gap: 0.018, t_outer_wall: 0.001,
    }));
    assert.close(g.r_cu, 0.011, 1e-15);
    assert.close(g.r_in_in, 0.015, 1e-15);
    assert.close(g.r_in_ow, 0.017, 1e-15);
    assert.close(g.r_ow_in, 0.035, 1e-15);
    assert.close(g.r_ow_ow, 0.036, 1e-15);
  });

  it('keeps radii strictly nested for any positive thicknesses', () => {
    const g = resolveGeometry(withInputs({
      r_cu: 0.004, d_inner_gap: 0.001, t_inner_wall: 0.0005,
      d_vacuum_gap: 0.09, t_outer_wall: 0.012,
    }));
    assert.ok(g.r_cu < g.r_in_in, 'copper inside inner wall bore');
    assert.ok(g.r_in_in < g.r_in_ow, 'inner wall has thickness');
    assert.ok(g.r_in_ow < g.r_ow_in, 'vacuum gap is open');
    assert.ok(g.r_ow_in < g.r_ow_ow, 'outer wall has thickness');
  });

  it('reports gap thicknesses consistently with the radii it produced', () => {
    const inputs = withInputs({ d_vacuum_gap: 0.031, d_inner_gap: 0.007 });
    const g = resolveGeometry(inputs);
    assert.close(g.r_ow_in - g.r_in_ow, g.d_vacuum_gap, 1e-12);
    assert.close(g.r_in_in - g.r_cu, g.d_inner_gap, 1e-12);
  });
});

describe('validation', () => {
  it('accepts the default inputs', () => {
    const { errors } = validateInputs(DEFAULT_INPUTS);
    assert.equal(errors.length, 0, `unexpected errors: ${JSON.stringify(errors)}`);
  });

  it('rejects zero and negative dimensions', () => {
    for (const key of ['r_cu', 'd_inner_gap', 't_inner_wall', 'd_vacuum_gap', 't_outer_wall', 'length']) {
      const zero = validateInputs(withInputs({ [key]: 0 }));
      assert.ok(zero.errors.some((e) => e.key === key), `${key} = 0 should be rejected`);
      const negative = validateInputs(withInputs({ [key]: -0.01 }));
      assert.ok(negative.errors.some((e) => e.key === key), `${key} < 0 should be rejected`);
    }
  });

  it('rejects non-finite input', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const { errors } = validateInputs(withInputs({ d_vacuum_gap: bad }));
      assert.ok(errors.some((e) => e.key === 'd_vacuum_gap'), `${bad} should be rejected`);
    }
    const missing = validateInputs(withInputs({ P_vacuum: undefined }));
    assert.ok(missing.errors.some((e) => e.key === 'P_vacuum'));
  });

  it('rejects a cold boundary at or above ambient', () => {
    assert.ok(validateInputs(withInputs({ T_cold: DEFAULT_INPUTS.T_amb })).errors.some((e) => e.key === 'T_cold'));
    assert.ok(validateInputs(withInputs({ T_cold: DEFAULT_INPUTS.T_amb + 5 })).errors.some((e) => e.key === 'T_cold'));
    assert.equal(validateInputs(withInputs({ T_cold: DEFAULT_INPUTS.T_amb - 1 })).errors.length, 0);
  });

  it('requires a positive coolant temperature after the prescribed offset', () => {
    for (const T_cold of [0, 0.005, 0.01]) {
      assert.ok(validateInputs(withInputs({ T_cold })).errors.some((e) => e.key === 'T_cold'));
    }
    assert.equal(validateInputs(withInputs({ T_cold: 0.02 })).errors.length, 0);
  });

  it('rejects emissivity outside (0, 1]', () => {
    assert.ok(validateInputs(withInputs({ eps_al: 0 })).errors.some((e) => e.key === 'eps_al'));
    assert.ok(validateInputs(withInputs({ eps_al: 1.5 })).errors.some((e) => e.key === 'eps_al'));
    assert.equal(validateInputs(withInputs({ eps_al: 1 })).errors.length, 0);
  });

  it('rejects fractional and negative MLI counts but allows zero', () => {
    assert.ok(validateInputs(withInputs({ n_mli: 2.5 })).errors.some((e) => e.key === 'n_mli'));
    assert.ok(validateInputs(withInputs({ n_mli: -1 })).errors.some((e) => e.key === 'n_mli'));
    assert.equal(validateInputs(withInputs({ n_mli: 0 })).errors.length, 0);
  });

  it('rejects invalid solver controls', () => {
    for (const value of [0, -1, NaN, Infinity]) {
      assert.ok(validateInputs(withInputs({ tolerance: value })).errors.some((e) => e.key === 'tolerance'));
    }
    for (const value of [0, -1, 1.5, NaN, Infinity]) {
      assert.ok(validateInputs(withInputs({ max_iterations: value })).errors.some((e) => e.key === 'max_iterations'));
    }
  });

  it('warns without blocking when a blanket cannot fit in the gap', () => {
    const { errors, warnings } = validateInputs(withInputs({ n_mli: 300, d_vacuum_gap: 0.005 }));
    assert.equal(errors.length, 0, 'should not block');
    assert.ok(warnings.some((w) => w.key === 'n_mli'), 'should warn about blanket thickness');
  });

  it('warns when C is outside the range the bridging form is quoted for', () => {
    assert.ok(validateInputs(withInputs({ C: 17 })).warnings.some((w) => w.key === 'C'));
    assert.equal(validateInputs(withInputs({ C: 2 })).warnings.filter((w) => w.key === 'C').length, 0);
  });
});
