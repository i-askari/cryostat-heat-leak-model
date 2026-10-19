/** The exact resistance network solved between ambient and copper surface. */
import { svg } from '../utils/dom.js';
import { percent, sig, temperature } from '../utils/format.js';

// The enclosing scroll area preserves readable text at narrow viewport widths.
const W = 1050;
const H = 430;

/** @param {import('../model/solver.js').ModelResult & Record<string, any>} result */
export function renderNetwork(result) {
  const root = svg('svg', {
    class: 'network', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': 'Thermal network from ambient through parallel convection and radiation, '
      + 'outer wall, three parallel vacuum paths, inner wall and residual-gas conduction '
      + 'in the inner gap to the prescribed copper outer surface. The LN₂ coolant '
      + 'temperature is a separate assumption; no copper resistance or inner-gap radiation is calculated.'
      + (result.inputs.n_mli === 0 ? ' MLI contact is absent with zero layers.' : ''),
  });
  const y = 195;
  const nodes = [
    { x: 35, label: 'Ambient', temp: result.inputs.T_amb, color: 'var(--warm)' },
    { x: 210, label: 'T1', temp: result.T1 },
    { x: 325, label: 'T2', temp: result.T2 },
    { x: 650, label: 'T3', temp: result.T3 },
    { x: 765, label: 'T4', temp: result.T4 },
    { x: 1000, label: 'Copper outer', temp: result.T_copper_outer, color: 'var(--cold)', prescribedCold: true },
  ];

  root.appendChild(parallelBlock({ x0: 35, x1: 210, y,
    heading: 'External exchange', total: result.R_ambient,
    branches: [
      { y: 70, label: 'Convection', color: 'var(--convection)', R: result.R_conv,
        Q: result.Q_conv, share: result.conv_fraction },
      { y: 255, label: 'Radiation', color: 'var(--radiation)', R: result.R_rad_ambient,
        Q: result.Q_rad_ambient, share: result.ambient_radiation_fraction },
    ],
  }));
  root.appendChild(seriesBlock({ x0: 210, x1: 325, y, label: 'Outer wall', R: result.R_cond_ow }));
  root.appendChild(parallelBlock({ x0: 325, x1: 650, y,
    heading: 'Main vacuum gap', total: result.R_vacuum,
    branches: [
      { y: 70, label: 'Residual gas', color: 'var(--gas)', R: result.R_gas,
        Q: result.Q_gas, share: result.gas_fraction },
      { y: 160, label: `Radiation / MLI (${result.inputs.n_mli} layers)`, color: 'var(--radiation)',
        R: result.R_rad, Q: result.Q_rad_vacuum, share: result.radiation_fraction },
      { y: 255, label: 'MLI solid / contact', color: 'var(--mli-contact)', R: result.R_solid_MLI,
        Q: result.Q_solid_MLI, share: result.fraction_solid_MLI, disabled: !Number.isFinite(result.R_solid_MLI) },
    ],
  }));
  root.appendChild(seriesBlock({ x0: 650, x1: 765, y, label: 'Inner wall', R: result.R_cond_iw }));
  root.appendChild(seriesBlock({ x0: 765, x1: 1000, y, label: 'Inner gap: residual gas only', R: result.R_gap }));

  // Keep all node temperatures in a common row below the branches, instead of
  // laying labels on wires or neighbouring resistance boxes.
  for (const node of nodes) {
    root.appendChild(svg('circle', { cx: node.x, cy: y, r: 4.5,
      fill: node.color ?? 'var(--panel)', stroke: node.color ?? 'var(--border-strong)', 'stroke-width': 1.5 }));
    root.appendChild(svg('line', { x1: node.x, y1: y + 6, x2: node.x, y2: 316,
      stroke: 'var(--border)', 'stroke-width': 0.7, 'stroke-dasharray': '2 4' }));
    root.appendChild(svg('text', { class: 'node-label', x: node.x, y: 333,
      'text-anchor': 'middle', text: node.label }));
    root.appendChild(svg('text', { class: 'value', x: node.x, y: 349,
      'text-anchor': 'middle', text: `${node.prescribedCold ? node.temp.toFixed(2) : temperature(node.temp)} K` }));
  }

  root.appendChild(svg('text', { class: 'value', x: W / 2, y: 382, 'text-anchor': 'middle',
    text: `Q = (T_ambient − T_copper outer) / R_total = ${sig(result.driving_difference, 4)} K / `
      + `${sig(result.R_total, 4)} K/W = ${sig(result.Q, 4)} W` }));
  root.appendChild(svg('text', { class: 'value', x: W / 2, y: 404, 'text-anchor': 'middle',
    text: `LN₂ coolant: ${result.T_coolant.toFixed(2)} K (prescribed 0.01 K below copper outer surface); copper resistance not modelled.` }));
  return root;
}

function seriesBlock({ x0, x1, y, label, R }) {
  const g = svg('g', {});
  const width = x1 - x0;
  const boxWidth = Math.min(width - 8, 150);
  const boxX = x0 + (width - boxWidth) / 2;
  g.appendChild(svg('line', { class: 'wire', x1: x0, y1: y, x2: boxX, y2: y }));
  g.appendChild(svg('line', { class: 'wire', x1: boxX + boxWidth, y1: y, x2: x1, y2: y }));
  g.appendChild(svg('rect', { x: boxX, y: y - 11, width: boxWidth, height: 22, rx: 2,
    fill: 'var(--panel-sunken)', stroke: 'var(--border-strong)', 'stroke-width': 1 }));
  g.appendChild(svg('text', { x: (x0 + x1) / 2, y: y - 18, 'text-anchor': 'middle', text: label }));
  g.appendChild(svg('text', { class: 'value', x: (x0 + x1) / 2, y: y + 4,
    'text-anchor': 'middle', text: `${sig(R, 3)} K/W` }));
  return g;
}

function parallelBlock({ x0, x1, y, heading, total, branches }) {
  const g = svg('g', {});
  const splitX = x0 + 12;
  const joinX = x1 - 12;
  const boxX = splitX + 6;
  const boxWidth = joinX - splitX - 12;
  g.appendChild(svg('text', { class: 'node-label', x: (x0 + x1) / 2, y: 24,
    'text-anchor': 'middle', text: heading }));
  g.appendChild(svg('line', { class: 'wire', x1: x0, y1: y, x2: splitX, y2: y }));
  g.appendChild(svg('line', { class: 'wire', x1: joinX, y1: y, x2: x1, y2: y }));
  for (const branch of branches) {
    g.appendChild(svg('path', { class: 'wire', d: `M ${splitX} ${y} L ${splitX} ${branch.y} L ${boxX} ${branch.y}`,
      'stroke-dasharray': branch.disabled ? '3 3' : null }));
    g.appendChild(svg('path', { class: 'wire', d: `M ${boxX + boxWidth} ${branch.y} L ${joinX} ${branch.y} L ${joinX} ${y}`,
      'stroke-dasharray': branch.disabled ? '3 3' : null }));
    g.appendChild(svg('rect', { x: boxX, y: branch.y - 11, width: boxWidth, height: 22, rx: 2,
      fill: branch.color, 'fill-opacity': branch.disabled ? 0 : 0.06 + 0.18 * Math.min(1, branch.share),
      stroke: branch.color, 'stroke-width': 1.2, 'stroke-dasharray': branch.disabled ? '3 3' : null }));
    g.appendChild(svg('text', { x: (splitX + joinX) / 2, y: branch.y - 17,
      'text-anchor': 'middle', fill: branch.color, text: branch.label }));
    g.appendChild(svg('text', { class: 'value', x: (splitX + joinX) / 2, y: branch.y + 4,
      'text-anchor': 'middle', text: branch.disabled ? 'No blanket' : `R = ${sig(branch.R, 3)} K/W` }));
    g.appendChild(svg('text', { class: 'value', x: (splitX + joinX) / 2, y: branch.y + 25,
      'text-anchor': 'middle', fill: branch.color, text: `${sig(branch.Q, 3)} W · ${percent(branch.share)} of Q` }));
  }
  g.appendChild(svg('text', { class: 'value', x: (x0 + x1) / 2, y: 301,
    'text-anchor': 'middle', text: `Combined ${sig(total, 3)} K/W` }));
  return g;
}
