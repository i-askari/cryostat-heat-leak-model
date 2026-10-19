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

/**
 * Split a pressure-sweep series at regime changes and failed solves.
 * Keep each sampled point on its actual branch, including points exactly at a
 * threshold: the transition regime owns both endpoints. The resulting gaps
 * avoid drawing an invented interpolation across a discontinuous switch.
 *
 * @param {Array<{x: number, result: Record<string, any>}>} sweep
 * @param {string} key Model-result field to plot
 * @param {{color: string|function(string): string, width?: number, dash?: string}} style
 * @returns {Array<{regime: string, points: number[][], color: string, width: number, dash?: string}>}
 */
export function pressureRegimeSeries(sweep, key, style) {
  const groups = [];
  let group = null;
  for (const point of sweep) {
    if (!usablePoint(point, key)) {
      group = null;
      continue;
    }
    const regime = point.result.regime;
    if (!group || group.regime !== regime) {
      group = {
        regime,
        points: [],
        color: typeof style.color === 'function' ? style.color(regime) : style.color,
        width: style.width ?? 2,
        ...(style.dash ? { dash: style.dash } : {}),
      };
      groups.push(group);
    }
    group.points.push([paToTorr(point.x), point.result[key]]);
  }
  // An isolated valid sample cannot form a line, so show it as a point.
  for (const group of groups) if (group.points.length === 1) group.showPoints = true;
  return groups;
}

/** Include only explicitly converged, finite solver results. */
function usablePoint(point, key) {
  return point?.result?.converged === true && point.result.finite === true &&
    Number.isFinite(point.x) && (key === undefined || Number.isFinite(point.result[key]));
}

/** Split MLI points at failed solves and between an absent and present blanket. */
export function mliSweepSeries(sweep, key, style) {
  const groups = [];
  let group = null;
  for (const point of sweep) {
    if (!usablePoint(point, key)) {
      group = null;
      continue;
    }
    const absent = point.x === 0;
    if (!group || group.absent !== absent) {
      group = { absent, points: [], color: style.color, width: style.width ?? 2, showPoints: true };
      groups.push(group);
    }
    group.points.push([point.x, point.result[key]]);
  }
  return groups;
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

  const valid = sweep.filter((p) => usablePoint(p, 'Q_per_length') && p.result.Q_per_length > 0);
  if (valid.length === 0) return el('p', { text: 'No converged, finite pressure-sweep points are available to plot.' });
  const qValues = valid.map((p) => p.result.Q_per_length);
  const yDomain = [
    10 ** Math.floor(Math.log10(Math.min(...qValues))),
    10 ** Math.ceil(Math.log10(Math.max(...qValues))),
  ];
  if (yDomain[0] === yDomain[1]) yDomain[1] *= 10;

  const built = plot({
    width: 680, height: 340,
    title: 'Heat leak against vacuum pressure',
    x: pressureAxis(domain),
    y: { type: 'log', domain: yDomain, label: 'Heat leak (W/m)' },
    bands,
    series: pressureRegimeSeries(sweep, 'Q_per_length', {
      color: (regime) => REGIME_COLORS[regime], width: 2.2,
    }),
    markers: current.converged && current.finite ? [{
      x: paToTorr(inputs.P_vacuum), y: current.Q_per_length,
      label: `${sig(current.Q_per_length, 3)} W/m`,
    }] : [],
    ariaLabel: current.converged && current.finite
      ? `Heat leak against vacuum pressure on log axes. At the selected pressure of `
        + `${formatPressure(inputs.P_vacuum).combined} the heat leak is `
        + `${sig(current.Q_per_length, 3)} watts per metre in the ${current.regime} regime.`
      : 'Heat leak against vacuum pressure on log axes. The selected point did not converge.',
  });

  const node = withHover(built, {
    records: valid,
    xOf: (record) => paToTorr(record.x),
    describe: (record) => [
      `P  ${formatPressure(record.x).combined}`,
      `Q  ${sig(record.result.Q_per_length, 3)} W/m`,
      `Kn ${sig(record.result.Kn, 3)}`,
      record.result.regime,
      `Gas ${sig(record.result.Q_gas, 3)} W`,
      `Radiation ${sig(record.result.Q_rad_vacuum, 3)} W`,
      `MLI contact ${sig(record.result.Q_solid_MLI, 3)} W`,
    ],
  });

  return el('div', {}, [
    node,
    el('p', {
      class: 'plot-caption',
      text:
        'Below the free-molecular threshold the gas carries heat in proportion to pressure, '
        + 'so the curve approaches the radiation and MLI contact contribution. Above the '
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

  const valid = points.filter((p) => usablePoint(p, 'Q_per_length'));
  if (valid.length === 0) return el('p', { text: 'No converged, finite MLI-sweep points are available to plot.' });
  const showCurrent = store.ui.mliSweepPressure === 'current' && current.converged && current.finite;
  const qValues = valid.map((p) => p.result.Q_per_length);
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
    // No blanket has a different solid-path rule. Do not join that point to
    // the positive-layer curve as if the model were continuous through zero.
    series: mliSweepSeries(points, 'Q_per_length', { color: 'var(--accent)' }),
    markers: showCurrent
      ? [{ x: inputs.n_mli, y: current.Q_per_length, label: `current: ${inputs.n_mli}` }]
      : [],
  });

  const first = points[0];
  const last = points[points.length - 1];
  const endpointsValid = usablePoint(first, 'Q_per_length') && usablePoint(last, 'Q_per_length');
  const change = endpointsValid
    ? (last.result.Q_per_length - first.result.Q_per_length) / first.result.Q_per_length : null;
  const node = withHover(built, {
    records: valid,
    xOf: (record) => record.x,
    describe: (record) => [
      `${record.x} MLI layers`,
      `Q ${sig(record.result.Q_per_length, 3)} W/m`,
      `Gas ${sig(record.result.Q_gas, 3)} W`,
      `Radiation ${sig(record.result.Q_rad_vacuum, 3)} W`,
      `MLI contact ${sig(record.result.Q_solid_MLI, 3)} W`,
    ],
  });

  return el('div', {}, [
    node,
    el('p', {
      class: 'plot-caption',
      text:
        (endpointsValid ? `Going from ${first.x} to ${last.x} layers changes the heat leak by ${percent(change)}. `
          : 'A sweep endpoint did not converge, so its change cannot be summarized. ')
        + 'Layer count affects radiation, rarefied-gas conduction, and '
        + 'the empirical solid/contact path. Points show selected whole layer counts; zero '
        + 'layers has no blanket conduction path and is not joined to positive counts.',
    }),
  ]);
}

/* ---------------------------------------------------- temperatures vs P -- */

export function temperaturesVsPressure(store) {
  const { inputs } = store;
  const sweep = store.derived.pressureSweep;
  const current = store.derived.calc.result;
  if (!current || sweep.length === 0) return el('div');
  const valid = sweep.filter((p) => usablePoint(p));
  if (valid.length === 0) return el('p', { text: 'No converged, finite pressure-sweep points are available to plot.' });

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
    series: series.flatMap((s) => pressureRegimeSeries(sweep, s.key, {
      color: s.color, width: 1.8,
    })),
    hLines: [
      { y: inputs.T_amb, label: `ambient ${temperature(inputs.T_amb)} K`, color: 'var(--warm)' },
      { y: current.T_copper_outer, label: `copper surface ${temperature(current.T_copper_outer)} K`, color: 'var(--cold)' },
    ],
    vLines: [{ x: paToTorr(inputs.P_vacuum), label: 'current' }],
  });

  const node = withHover(built, {
    records: valid,
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
        'Each curve is an interface temperature calculated at the plotted vacuum pressure. '
        + 'The ambient and prescribed copper outer-surface boundaries frame the profile; the spacing between '
        + 'curves shows how the temperature drops change with the selected parameters. '
        + 'Curves are separated at discontinuous regime switches.',
    }),
  ]);
}

/* -------------------------------------------------- mechanism split vs P -- */

/** Include finite branches and their parallel equivalent in the plot domain. */
export function resistanceLogDomain(sweep) {
  const values = sweep.filter((p) => usablePoint(p)).flatMap((p) => [p.result.R_gas, p.result.R_rad,
    p.result.R_solid_MLI, p.result.R_vacuum]).filter((v) => Number.isFinite(v) && v > 0);
  if (values.length === 0) return [1, 10];
  const lo = 10 ** Math.floor(Math.log10(Math.min(...values)));
  const hi = 10 ** Math.ceil(Math.log10(Math.max(...values)));
  return [lo, hi > lo ? hi : lo * 10];
}

export function mechanismSplit(store) {
  const { inputs } = store;
  const sweep = store.derived.pressureSweep;
  const current = store.derived.calc.result;
  if (!current || sweep.length === 0) return el('div');
  const valid = sweep.filter((p) => usablePoint(p));
  if (valid.length === 0) return el('p', { text: 'No converged, finite pressure-sweep points are available to plot.' });

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
      ...pressureRegimeSeries(sweep, 'gas_fraction', { color: 'var(--gas)' }),
      ...pressureRegimeSeries(sweep, 'radiation_fraction', { color: 'var(--radiation)' }),
      ...pressureRegimeSeries(sweep, 'fraction_solid_MLI', { color: 'var(--mli-contact)' }),
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
      ...pressureRegimeSeries(sweep, 'R_gas', { color: 'var(--gas)' }),
      ...pressureRegimeSeries(sweep, 'R_rad', { color: 'var(--radiation)' }),
      ...pressureRegimeSeries(sweep, 'R_solid_MLI', { color: 'var(--mli-contact)' }),
      ...pressureRegimeSeries(sweep, 'R_vacuum', { color: 'var(--text-faint)', width: 1.6, dash: '4 3' }),
    ],
    vLines: [{ x: paToTorr(inputs.P_vacuum), label: 'current' }],
  });

  return el('div', {}, [
    withHover(fractions, {
      records: valid,
      xOf: (record) => paToTorr(record.x),
      describe: (record) => [
        `P ${formatPressure(record.x).combined}`,
        `Gas ${percent(record.result.gas_fraction)}`,
        `Radiation ${percent(record.result.radiation_fraction)}`,
        `MLI contact ${percent(record.result.fraction_solid_MLI)}`,
      ],
    }),
    legend([
      { label: 'Residual gas conduction', color: 'var(--gas)' },
      { label: 'Radiation through MLI', color: 'var(--radiation)' },
      { label: 'MLI solid / contact', color: 'var(--mli-contact)' },
    ]),
    el('p', {
      class: 'plot-caption',
      text:
        'The three parallel branch heat rates sum to the heat crossing the gap in a '
        + 'converged solution. Their shares vary with pressure and layer count. '
        + 'Curves are separated at discontinuous regime switches.',
    }),
    withHover(resistances, {
      records: valid,
      xOf: (record) => paToTorr(record.x),
      describe: (record) => [
        `P ${formatPressure(record.x).combined}`,
        `R gas ${sig(record.result.R_gas, 3)} K/W`,
        `R radiation ${sig(record.result.R_rad, 3)} K/W`,
        `R MLI ${Number.isFinite(record.result.R_solid_MLI) ? `${sig(record.result.R_solid_MLI, 3)} K/W` : 'absent'}`,
        `R combined ${sig(record.result.R_vacuum, 3)} K/W`,
      ],
    }),
    legend([
      { label: 'R_gas', color: 'var(--gas)' },
      { label: 'R_radiation', color: 'var(--radiation)' },
      { label: 'R_MLI contact', color: 'var(--mli-contact)' },
      { label: 'R_vacuum (parallel)', color: 'var(--text-faint)' },
    ]),
    el('p', {
      class: 'plot-caption',
      text:
        'Because the branches are in parallel, the combined resistance is smaller than '
        + 'each active branch and tends toward the smallest. Radiation changes with the '
        + 'solved temperatures while gas conduction '
        + 'varies over orders of magnitude. At zero MLI layers the infinite contact '
        + 'resistance is omitted from this logarithmic plot.',
    }),
  ]);
}

/* ------------------------------------------------------------ tornado --- */

/** Label actual integer MLI cases instead of misrepresenting them as +/-20%. */
export function sensitivityTooltip(row, side) {
  const change = row[side];
  const layers = row[`${side}Value`];
  const label = row.key === 'n_mli'
    ? `${layers} ${layers === 1 ? 'layer' : 'layers'}`
    : (side === 'low' ? '-20%' : '+20%');
  return `${label}: ${change >= 0 ? '+' : ''}${sig(change, 2)} W/m`;
}

export function sensitivityChart(store) {
  const rows = store.derived.sensitivity;
  const current = store.derived.calc.result;
  if (!current || rows.length === 0) return el('div');

  const maxSpan = Math.max(...rows.map((r) => Math.max(Math.abs(r.low), Math.abs(r.high))));

  const bars = rows.map((row) => {
    const scale = (v) => maxSpan === 0 ? 0 : (Math.abs(v) / maxSpan) * 50; // percent of half-width

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
          title: sensitivityTooltip(row, 'low'),
        }),
        el('div', {
          style: {
            position: 'absolute', top: '1px', bottom: '1px',
            left: `${row.high < 0 ? 50 - highWidth : 50}%`,
            width: `${highWidth}%`,
            background: 'var(--warm)', opacity: '0.75',
          },
          title: sensitivityTooltip(row, 'high'),
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
        `Each parameter is scaled by approximately plus and minus 20 percent with everything else held `
        + `fixed, starting from the current heat leak of ${sig(current.Q_per_length, 3)} W/m. `
        + 'MLI changes use whole layers with a step of at least one, clamped at zero; '
        + 'at zero layers the comparison is one-sided from 0 to 1 layer. '
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
    'P_Pa', 'P_Torr', 'Q_W', 'Q_per_m_W_per_m', 'Kn', 'regime', 'converged', 'finite', 'iterations',
    'T1_K', 'T2_K', 'T3_K', 'T4_K',
    'R_total_K_per_W', 'R_ambient', 'R_cond_outer_wall', 'R_gas', 'R_radiation', 'R_MLI_contact',
    'R_vacuum_parallel', 'R_cond_inner_wall', 'R_inner_gap',
    'Q_gas_W', 'Q_radiation_W', 'Q_MLI_contact_W',
  ];

  const rows = sweep.map(({ x, result }) => [
    x, paToTorr(x), result.Q, result.Q_per_length, result.Kn, result.regime,
    result.converged, result.finite, result.iterations,
    result.T1, result.T2, result.T3, result.T4,
    result.R_total, result.R_ambient, result.R_cond_ow, result.R_gas, result.R_rad, result.R_solid_MLI,
    result.R_vacuum, result.R_cond_iw, result.R_gap,
    result.Q_gas, result.Q_rad_vacuum, result.Q_solid_MLI,
  ].map((v) => (typeof v === 'number' ? v.toPrecision(10) : v)).join(','));

  return [header.join(','), ...rows].join('\n');
}
