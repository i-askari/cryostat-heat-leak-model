import { assert, describe, it } from './harness.js';
import { mliSweepSeries, pressureRegimeSeries, pressureSweepCsv, resistanceLogDomain, sensitivityChart, sensitivityTooltip } from '../src/plots/charts.js';
import { DEFAULT_INPUTS } from '../src/model/constants.js';
import { pressureSweep } from '../src/model/sweeps.js';
import { paToTorr } from '../src/model/units.js';

const sample = (x, regime, value, converged = true, finite = true) => ({
  x, result: { regime, value, converged, finite },
});

describe('resistance plot domain', () => {
  it('includes radiation and the parallel equivalent, not just gas', () => {
    const domain = resistanceLogDomain([
      { x: 1, result: { R_gas: 10, R_rad: 1000, R_vacuum: 9, converged: true, finite: true } },
      { x: 2, result: { R_gas: 100, R_rad: 5000, R_vacuum: 80, converged: true, finite: true } },
    ]);
    assert.equal(domain[0], 1);
    assert.equal(domain[1], 10000);
  });

  it('includes the contact branch but omits the infinite absent-blanket branch', () => {
    const domain = resistanceLogDomain([
      { x: 1, result: { R_gas: 10, R_rad: 100, R_solid_MLI: 150000, R_vacuum: 9, converged: true, finite: true } },
      { x: 2, result: { R_gas: 100, R_rad: 500, R_solid_MLI: Infinity, R_vacuum: 80, converged: true, finite: true } },
    ]);
    assert.equal(domain[0], 1);
    assert.equal(domain[1], 1000000);
  });

  it('excludes failed results from the domain', () => {
    const domain = resistanceLogDomain([
      { x: 1, result: { R_gas: 10, R_rad: 100, R_vacuum: 9, converged: true, finite: true } },
      { x: 2, result: { R_gas: 1e20, R_rad: 1e19, R_vacuum: 1e18, converged: false, finite: true } },
    ]);
    assert.equal(domain[0], 1);
    assert.equal(domain[1], 100);
  });
});

describe('pressure-plot discontinuities', () => {
  it('splits by reported regime without interpolating across switches', () => {
    const points = [
      sample(1, 'free-molecular', 1), sample(2, 'free-molecular', 2),
      sample(3, 'transition', 3), sample(4, 'transition', 4),
      sample(5, 'continuum', 5), sample(6, 'continuum', 6),
    ];
    const curves = pressureRegimeSeries(points, 'value', { color: 'blue', width: 1.8, dash: '4 3' });
    assert.equal(curves.length, 3);
    assert.equal(curves.map((c) => c.regime).join(','), 'free-molecular,transition,continuum');
    for (let i = 0; i < curves.length; i++) {
      assert.equal(curves[i].points.length, 2);
      assert.equal(curves[i].color, 'blue');
      assert.equal(curves[i].width, 1.8);
      assert.equal(curves[i].dash, '4 3');
      for (let j = 0; j < 2; j++) {
        assert.equal(curves[i].points[j][0], paToTorr(points[2 * i + j].x));
        assert.equal(curves[i].points[j][1], points[2 * i + j].result.value);
      }
    }
  });

  it('retains a configurable colour per regime for the heat-leak chart', () => {
    const points = [sample(1, 'free-molecular', 1), sample(2, 'transition', 2), sample(3, 'continuum', 3)];
    const curves = pressureRegimeSeries(points, 'value', { color: (regime) => `color-${regime}` });
    assert.equal(curves.map((c) => c.color).join(','), 'color-free-molecular,color-transition,color-continuum');
  });

  it('leaves gaps at nonconverged, nonfinite or unplottable values even within one regime', () => {
    const points = [
      sample(1, 'transition', 1), sample(2, 'transition', 2),
      sample(3, 'transition', 3, false), sample(4, 'transition', 4),
      sample(5, 'transition', 5, true, false), sample(6, 'transition', 6),
      sample(7, 'transition', Infinity), sample(8, 'transition', 8),
    ];
    const curves = pressureRegimeSeries(points, 'value', { color: 'blue' });
    assert.equal(curves.length, 4);
    assert.equal(curves.map((c) => c.points.length).join(','), '2,1,1,1');
    assert.ok(curves.slice(1).every((c) => c.showPoints), 'isolated valid samples remain visible');
    assert.equal(curves.flatMap((c) => c.points.map((point) => point[1])).join(','), '1,2,4,6,8');
  });

  it('splits actual synthetic pressure-sweep records into their model regimes', () => {
    const sweep = pressureSweep(DEFAULT_INPUTS, { count: 60 });
    const curves = pressureRegimeSeries(sweep, 'T3', { color: 'blue' });
    assert.equal(curves.length, 3);
    assert.equal(curves.map((c) => c.regime).join(','), 'free-molecular,transition,continuum');
    assert.equal(curves.flatMap((c) => c.points).length, sweep.length);
  });
});

describe('MLI sweep validity', () => {
  it('separates zero layers and does not bridge across failed points', () => {
    const points = [
      sample(0, 'transition', 1), sample(1, 'transition', 2),
      sample(2, 'transition', 3, false), sample(3, 'transition', 4),
      sample(4, 'transition', 5), sample(5, 'transition', Infinity),
      sample(6, 'transition', 7),
    ];
    const curves = mliSweepSeries(points, 'value', { color: 'orange' });
    assert.equal(curves.length, 4);
    assert.equal(curves[0].absent, true);
    assert.equal(curves.map((c) => c.points.length).join(','), '1,1,2,1');
    assert.equal(curves.flatMap((c) => c.points.map((point) => point[1])).join(','), '1,2,4,5,7');
    assert.ok(curves.every((c) => c.showPoints && c.color === 'orange'));
  });
});

describe('pressure sweep CSV diagnostics', () => {
  it('retains numerical rows with explicit convergence, finiteness, and iteration flags', () => {
    const sweep = pressureSweep(DEFAULT_INPUTS, { count: 2 });
    sweep[1] = { ...sweep[1], result: { ...sweep[1].result, converged: false, finite: true, iterations: 3 } };
    const csv = pressureSweepCsv({ derived: { pressureSweep: sweep } });
    const [header, first, second] = csv.split('\n').map((row) => row.split(','));
    const converged = header.indexOf('converged');
    const finite = header.indexOf('finite');
    const iterations = header.indexOf('iterations');
    assert.ok(converged >= 0 && finite >= 0 && iterations >= 0);
    assert.equal(first[converged], 'true');
    assert.equal(second[converged], 'false');
    assert.equal(second[finite], 'true');
    assert.equal(Number(second[iterations]), 3);
    assert.equal(first.length, header.length);
    assert.equal(second.length, header.length);
  });
});

describe('sensitivity labels', () => {
  it('labels actual MLI layer counts, including the one-sided zero-layer case', () => {
    const row = { key: 'n_mli', lowValue: 0, highValue: 1, low: 0, high: 0.25 };
    assert.equal(sensitivityTooltip(row, 'low'), '0 layers: +0 W/m');
    assert.equal(sensitivityTooltip(row, 'high'), '1 layer: +0.25 W/m');
    assert.equal(sensitivityTooltip({ ...row, lowValue: 1 }, 'low'), '1 layer: +0 W/m');
  });

  it('uses percent labels for non-MLI parameters', () => {
    const row = { key: 'C', low: -0.25, high: 0.25 };
    assert.equal(sensitivityTooltip(row, 'low'), '-20%: -0.25 W/m');
    assert.equal(sensitivityTooltip(row, 'high'), '+20%: +0.25 W/m');
  });
});

describe('sensitivity chart scaling', () => {
  it('renders zero-width bars for zero sensitivity and scales nonzero bars normally', () => {
    const originalDocument = globalThis.document;
    try {
      // A minimal DOM exercises the actual chart styles, not a duplicate scale formula.
      globalThis.document = {
        createElement(tag) {
          return {
            tag, children: [], style: {}, attrs: {},
            setAttribute(key, value) { this.attrs[key] = value; },
            appendChild(child) { this.children.push(child); },
          };
        },
      };
      const chart = (low, high) => sensitivityChart({
        derived: {
          calc: { result: { Q_per_length: 1 } },
          sensitivity: [{ key: 'C', label: 'Gas constant', low, high, span: Math.abs(high - low) }],
        },
      });
      const track = (node) => node.children[1].children[1];
      const zero = track(chart(0, 0));
      assert.equal(zero.children[1].style.width, '0%');
      assert.equal(zero.children[2].style.width, '0%');
      assert.equal(zero.children[1].style.left, '50%');
      assert.equal(zero.children[2].style.left, '50%');

      const varied = track(chart(-2, 1));
      assert.equal(varied.children[1].style.width, '50%');
      assert.equal(varied.children[1].style.left, '0%');
      assert.equal(varied.children[2].style.width, '25%');
      assert.equal(varied.children[2].style.left, '50%');
    } finally {
      if (originalDocument === undefined) delete globalThis.document;
      else globalThis.document = originalDocument;
    }
  });
});
