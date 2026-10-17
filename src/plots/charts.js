/**
 * Analysis charts.
 *
 * Every chart is built from sweeps of the same solver that produces the
 * single-point result, so the curves move with the parameters. Each one
 * answers a specific question, named in its caption.
 */

import { SOLVED_INTERFACES } from '../data/interfacePoints.js';
import { regimeBoundaryPressures } from '../model/gas.js';
import { paToTorr } from '../model/units.js';
import { el } from '../utils/dom.js';
import { exponential, percent, pressure as formatPressure, sig, temperature } from '../utils/format.js';
import { plot, withHover } from './plot.js';

const REGIME_COLORS = {
  continuum: 'var(--regime-continuum)',
  transition: 'var(--regime-transition)',
  'free-molecular': 'var(--regime-molecular)',
};

/**
 * Bands for the regime background of a pressure-axis plot.
 *
 * Pressure axes are drawn in Torr so that the decade ticks land on round
 * numbers in the unit shown; the model works in Pa, so every pressure is
 * converted at the point it enters the plot.
 */
function regimeBands(inputs, geom, domainTorr) {
  const { freeMolecularBelow, continuumAbove } =
    regimeBoundaryPressures(inputs.mfp_coefficient, geom.d_vacuum_gap);
  return [
    {
      from: domainTorr[0], to: paToTorr(freeMolecularBelow),
      color: REGIME_COLORS['free-molecular'], label: 'free molecular',
    },
    {
      from: paToTorr(freeMolecularBelow), to: paToTorr(continuumAbove),
      color: REGIME_COLORS.transition, label: 'transition',
    },
    {
      from: paToTorr(continuumAbove), to: domainTorr[1],
      color: REGIME_COLORS.continuum, label: 'continuum',
    },
  ];
}

/** Standard x-axis configuration for a pressure sweep, in Torr. */
function pressureAxis(domainTorr) {
  return {
    type: 'log',
    domain: domainTorr,
    label: 'Vacuum gap pressure (Torr)',
    format: (v) => exponential(v, 0),
  };
}

/* ------------------------------------------------------- heat leak vs P -- */

export function heatLeakVsPressure(store) {
  const { inputs } = store;
  const sweep = store.derived.pressureSweep;
  const current = store.derived.calc.result;
  if (!current || sweep.length === 0) return el('div');

  const geom = current.geometry;
  const domain = [paToTorr(sweep[0].x), paToTorr(sweep[sweep.length - 1].x)];
  const bands = regimeBands(inputs, geom, domain);

  const qValues = sweep.map((p) => p.result.Q_per_length);
  const yDomain = [
    10 ** Math.floor(Math.log10(Math.min(...qValues))),
    10 ** Math.ceil(Math.log10(Math.max(...qValues))),
  ];

  const built = plot({
    width: 680, height: 340,
    title: 'Heat leak against vacuum pressure',
    x: pressureAxis(domain),
    y: { type: 'log', domain: yDomain, label: 'Heat leak (W/m)' },
    bands,
    series: [{
      points: sweep.map((p) => [paToTorr(p.x), p.result.Q_per_length]),
      width: 2.2,
      segments: [
        { from: domain[0], to: bands[0].to, color: REGIME_COLORS['free-molecular'] },
        { from: bands[1].from, to: bands[1].to, color: REGIME_COLORS.transition },
        { from: bands[2].from, to: domain[1], color: REGIME_COLORS.continuum },
      ],
    }],
    markers: [{
      x: paToTorr(inputs.P_vacuum), y: current.Q_per_length,
      label: `${sig(current.Q_per_length, 3)} W/m`,
    }],
    ariaLabel:
      `Heat leak against vacuum pressure on log axes. At the selected pressure of `
      + `${formatPressure(inputs.P_vacuum).combined} the heat leak is `
      + `${sig(current.Q_per_length, 3)} watts per metre in the ${current.regime} regime.`,
  });

  const node = withHover(built, {
    records: sweep,
    xOf: (record) => paToTorr(record.x),
    describe: (record) => [
      `P  ${formatPressure(record.x).combined}`,
      `Q  ${sig(record.result.Q_per_length, 3)} W/m`,
      `Kn ${sig(record.result.Kn, 3)}`,
      record.result.regime,
    ],
  });

  return el('div', {}, [
    node,
    el('p', {
      class: 'plot-caption',
      text:
        'Below the free-molecular threshold the gas carries heat in proportion to pressure, '
        + 'so the curve falls steeply until radiation takes over and sets a floor. Above the '
        + 'continuum threshold the conductivity of the gas no longer depends on pressure, '
        + 'so the curve flattens. The regime switches create discontinuous jumps.'
        + (paToTorr(inputs.P_vacuum) < domain[0] || paToTorr(inputs.P_vacuum) > domain[1]
          ? ' The selected pressure is outside the plotted range.' : ''),
    }),
  ]);
}

/* ------------------------------------------------------- heat leak vs N -- */

export function heatLeakVsMli(store) {
  const { inputs } = store;
  const { pressure, points } = store.derived.mliSweep;
  const current = store.derived.calc.result;
  if (!current || points.length === 0) return el('div');

  const showCurrent = store.ui.mliSweepPressure === 'current';
  const qValues = points.map((p) => p.result.Q_per_length);
  if (showCurrent) qValues.push(current.Q_per_length);
  const span = Math.max(...qValues) - Math.min(...qValues);
  const pad = span > 0 ? span * 0.15 : Math.max(...qValues) * 0.1;

  const built = plot({
    width: 680, height: 320,
    title: `Heat leak against MLI layers at ${formatPressure(pressure).combined}`,
    x: {
      type: 'linear',
      domain: [0, Math.max(...points.map((p) => p.x), showCurrent ? inputs.n_mli : 0) + 5],
      label: 'MLI layers',
      format: (v) => String(Math.round(v)),
    },
    y: {
      type: 'linear',
      domain: [Math.max(0, Math.min(...qValues) - pad), Math.max(...qValues) + pad],
      label: 'Heat leak (W/m)',
    },
    series: [{
      points: points.map((p) => [p.x, p.result.Q_per_length]),
      color: 'var(--accent)',
      showPoints: true,
    }],
    markers: showCurrent
      ? [{ x: inputs.n_mli, y: current.Q_per_length, label: `current: ${inputs.n_mli}` }]
      : [],
  });

  const first = points[0];
  const last = points[points.length - 1];
  const change = (first.result.Q_per_length - last.result.Q_per_length) / first.result.Q_per_length;
  const gasShare = last.result.gas_fraction;

  return el('div', {}, [
    built.node,
    el('p', {
      class: 'plot-caption',
      text:
        `Going from ${first.x} to ${last.x} layers changes the heat leak by `
        + `${percent(change)}. At this pressure residual gas carries ${percent(gasShare)} of `
        + 'the heat crossing the vacuum gap, and MLI does nothing about gas conduction: it '
        + 'only raises the radiative resistance in the parallel branch. Adding layers helps '
        + 'in proportion to how much of the heat radiation is carrying, which is why the '
        + 'return diminishes.',
    }),
  ]);
}

/* ---------------------------------------------------- temperatures vs P -- */

export function temperaturesVsPressure(store) {
  const { inputs } = store;
  const sweep = store.derived.pressureSweep;
  const current = store.derived.calc.result;
  if (!current || sweep.length === 0) return el('div');

  const domain = [paToTorr(sweep[0].x), paToTorr(sweep[sweep.length - 1].x)];

  // Same colours and wording as the results table and the cross-section.
  const series = SOLVED_INTERFACES.map((point) => ({
    key: point.key,
    color: point.color,
    label: `${point.symbol} ${point.name.toLowerCase()}`,
  }));

  const built = plot({
    width: 680, height: 340,
    title: 'Interface temperatures against vacuum pressure',
    x: pressureAxis(domain),
    y: {
      type: 'linear',
      domain: [inputs.T_cold - 10, inputs.T_amb + 10],
      label: 'Temperature (K)',
      format: (v) => v.toFixed(0),
    },
    bands: regimeBands(inputs, current.geometry, domain),
    series: series.map((s) => ({
      points: sweep.map((p) => [paToTorr(p.x), p.result[s.key]]),
      color: s.color,
      width: 1.8,
    })),
    hLines: [
      { y: inputs.T_amb, label: `ambient ${temperature(inputs.T_amb)} K`, color: 'var(--warm)' },
      { y: inputs.T_cold, label: `cold mass ${temperature(inputs.T_cold)} K`, color: 'var(--cold)' },
    ],
    vLines: [{ x: paToTorr(inputs.P_vacuum), label: 'current' }],
  });

  const node = withHover(built, {
    records: sweep,
    xOf: (record) => paToTorr(record.x),
    describe: (record) => [
      `P  ${formatPressure(record.x).combined}`,
      `T1 ${temperature(record.result.T1)} K`,
      `T2 ${temperature(record.result.T2)} K`,
      `T3 ${temperature(record.result.T3)} K`,
      `T4 ${temperature(record.result.T4)} K`,
    ],
  });

  return el('div', {}, [
    node,
    legend(series.map((s) => ({ label: s.label, color: s.color }))),
    el('p', {
      class: 'plot-caption',
      text:
        'The walls are thin and highly conductive, so T1 sits close to T2 and T3 close to T4: '
        + 'almost the entire temperature difference appears across the vacuum gap and the inner '
        + 'gas gap. As the vacuum degrades, the vacuum gap loses its share of the drop and the '
        + 'inner wall warms toward ambient.',
    }),
  ]);
}

/* -------------------------------------------------- mechanism split vs P -- */

/** Include both branches and their parallel equivalent in the plot domain. */
export function resistanceLogDomain(sweep) {
  const values = sweep.flatMap((p) => [p.result.R_gas, p.result.R_rad, p.result.R_vacuum]);
  return [10 ** Math.floor(Math.log10(Math.min(...values))),
    10 ** Math.ceil(Math.log10(Math.max(...values)))];
}

export function mechanismSplit(store) {
  const { inputs } = store;
  const sweep = store.derived.pressureSweep;
  const current = store.derived.calc.result;
  if (!current || sweep.length === 0) return el('div');

  const domain = [paToTorr(sweep[0].x), paToTorr(sweep[sweep.length - 1].x)];

  const fractions = plot({
    width: 680, height: 260,
    title: 'Share of vacuum-gap heat carried by each parallel branch',
    x: pressureAxis(domain),
    y: {
      type: 'linear', domain: [0, 1], label: 'Fraction of gap heat flow',
      format: (v) => `${(v * 100).toFixed(0)}%`,
    },
    bands: regimeBands(inputs, current.geometry, domain),
    series: [
      {
        points: sweep.map((p) => [paToTorr(p.x), p.result.gas_fraction]),
        color: 'var(--gas)', width: 2,
      },
      {
        points: sweep.map((p) => [paToTorr(p.x), p.result.radiation_fraction]),
        color: 'var(--radiation)', width: 2,
      },
    ],
    vLines: [{ x: paToTorr(inputs.P_vacuum), label: 'current' }],
  });

  const resistances = plot({
    width: 680, height: 260,
    title: 'Branch resistances against vacuum pressure',
    x: pressureAxis(domain),
    y: {
      type: 'log',
      domain: resistanceLogDomain(sweep),
      label: 'Resistance (K/W)',
    },
    bands: regimeBands(inputs, current.geometry, domain),
    series: [
      {
        points: sweep.map((p) => [paToTorr(p.x), p.result.R_gas]),
        color: 'var(--gas)', width: 2,
      },
      {
        points: sweep.map((p) => [paToTorr(p.x), p.result.R_rad]),
        color: 'var(--radiation)', width: 2,
      },
      {
        points: sweep.map((p) => [paToTorr(p.x), p.result.R_vacuum]),
        color: 'var(--text-faint)', width: 1.6, dash: '4 3',
      },
    ],
    vLines: [{ x: paToTorr(inputs.P_vacuum), label: 'current' }],
  });

  return el('div', {}, [
    fractions.node,
    legend([
      { label: 'Residual gas conduction', color: 'var(--gas)' },
      { label: 'Radiation through MLI', color: 'var(--radiation)' },
    ]),
    el('p', {
      class: 'plot-caption',
      text:
        'The two branches always sum to the heat crossing the gap. The crossover is where '
        + 'the design stops being limited by vacuum quality and starts being limited by '
        + 'radiation, which is the point at which adding MLI begins to pay and better '
        + 'pumping stops paying.',
    }),
    resistances.node,
    legend([
      { label: 'R_gas', color: 'var(--gas)' },
      { label: 'R_radiation', color: 'var(--radiation)' },
      { label: 'R_vacuum (parallel)', color: 'var(--text-faint)' },
    ]),
    el('p', {
      class: 'plot-caption',
      text:
        'Because the branches are in parallel, the combined resistance follows whichever '
        + 'branch is smaller. Radiation is nearly flat with pressure while gas conduction '
        + 'varies over orders of magnitude, so the knee in the combined curve is the '
        + 'crossover.',
    }),
  ]);
}

/* ------------------------------------------------------------ tornado --- */

export function sensitivityChart(store) {
  const rows = store.derived.sensitivity;
  const current = store.derived.calc.result;
  if (!current || rows.length === 0) return el('div');

  const maxSpan = Math.max(...rows.map((r) => Math.max(Math.abs(r.low), Math.abs(r.high))));

  const bars = rows.map((row) => {
    const scale = (v) => (Math.abs(v) / maxSpan) * 50; // percent of half-width

    const lowWidth = scale(row.low);
    const highWidth = scale(row.high);

    return el('div', { class: 'breakdown-row' }, [
      el('span', { class: 'name', text: row.label }),
      el('div', {
        class: 'bar-track',
        style: { position: 'relative', height: '13px' },
      }, [
        el('div', {
          style: {
            position: 'absolute', left: '50%', top: '0', bottom: '0',
            width: '1px', background: 'var(--border-strong)',
          },
        }),
        el('div', {
          style: {
            position: 'absolute', top: '1px', bottom: '1px',
            left: `${row.low < 0 ? 50 - lowWidth : 50}%`,
            width: `${lowWidth}%`,
            background: 'var(--cold)', opacity: '0.75',
          },
          title: `-20%: ${row.low >= 0 ? '+' : ''}${sig(row.low, 2)} W/m`,
        }),
        el('div', {
          style: {
            position: 'absolute', top: '1px', bottom: '1px',
            left: `${row.high < 0 ? 50 - highWidth : 50}%`,
            width: `${highWidth}%`,
            background: 'var(--warm)', opacity: '0.75',
          },
          title: `+20%: ${row.high >= 0 ? '+' : ''}${sig(row.high, 2)} W/m`,
        }),
      ]),
      el('span', { class: 'num', text: `${sig(row.span, 2)}` }),
    ]);
  });

  return el('div', {}, [
    el('p', {
      class: 'plot-caption',
      style: { marginTop: '0', marginBottom: '10px' },
      text:
        `Each parameter is scaled by plus and minus 20 percent with everything else held `
        + `fixed, starting from the current heat leak of ${sig(current.Q_per_length, 3)} W/m. `
        + 'Bars show the resulting change in W/m; the right-hand number is the total span. '
        + 'Blue is the low case, red the high case. This is a one-at-a-time screening, not a '
        + 'joint uncertainty analysis: it says nothing about interactions between parameters.',
    }),
    ...bars,
  ]);
}

/* ------------------------------------------------------------- helpers --- */

function legend(items) {
  return el('div', { class: 'viz-legend' }, items.map((item) =>
    el('span', { class: 'key' }, [
      el('span', { class: 'mark', style: { background: item.color } }),
      item.label,
    ])));
}

/**
 * CSV of the current pressure sweep, for taking the numbers elsewhere.
 * @param {ReturnType<import('../state/store.js').createStore>} store
 * @returns {string}
 */
export function pressureSweepCsv(store) {
  const sweep = store.derived.pressureSweep;
  const header = [
    'P_Pa', 'P_Torr', 'Q_W', 'Q_per_m_W_per_m', 'Kn', 'regime',
    'T1_K', 'T2_K', 'T3_K', 'T4_K',
    'R_total_K_per_W', 'R_ambient', 'R_cond_outer_wall', 'R_gas', 'R_radiation',
    'R_vacuum_parallel', 'R_cond_inner_wall', 'R_inner_gap',
    'Q_gas_W', 'Q_radiation_W',
  ];

  const rows = sweep.map(({ x, result }) => [
    x, paToTorr(x), result.Q, result.Q_per_length, result.Kn, result.regime,
    result.T1, result.T2, result.T3, result.T4,
    result.R_total, result.R_ambient, result.R_cond_ow, result.R_gas, result.R_rad,
    result.R_vacuum, result.R_cond_iw, result.R_gap,
    result.Q_gas, result.Q_rad_vacuum,
  ].map((v) => (typeof v === 'number' ? v.toPrecision(10) : v)).join(','));

  return [header.join(','), ...rows].join('\n');
}
