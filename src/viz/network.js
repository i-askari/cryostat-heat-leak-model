/**
 * Thermal network diagram.
 *
 * Draws the resistance ladder the solver actually assembles: three series
 * elements, with the ambient pair and the vacuum pair shown as genuine
 * parallel branches rather than as further links in the chain. Each element
 * is annotated with its current resistance, and each parallel branch with the
 * heat it carries, so the split is readable as numbers as well as topology.
 */

import { svg } from '../utils/dom.js';
import { percent, sig, temperature } from '../utils/format.js';

const W = 680;
const H = 190;

/**
 * @param {import('../model/solver.js').ModelResult & Record<string, any>} result
 * @returns {SVGElement}
 */
export function renderNetwork(result) {
  const inputs = result.inputs;

  const root = svg('svg', {
    class: 'network',
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label':
      'Thermal network: ambient, then convection and radiation in parallel, the outer wall, '
      + 'then residual gas conduction and radiation with MLI in parallel, the inner wall, '
      + 'the inner gas gap, and the cold mass.',
  });

  const yMid = 92;
  const ySplitTop = 60;
  const ySplitBottom = 124;

  // Column x positions: node, parallel block, node, series block, ...
  const nodes = [
    { x: 30, label: 'Ambient', temp: inputs.T_amb, color: 'var(--warm)' },
    { x: 168, label: 'T1', temp: result.T1 },
    { x: 268, label: 'T2', temp: result.T2 },
    { x: 434, label: 'T3', temp: result.T3 },
    { x: 524, label: 'T4', temp: result.T4 },
    { x: 650, label: 'Cold mass', temp: inputs.T_cold, color: 'var(--cold)' },
  ];

  // --- parallel block: ambient convection + radiation -------------------
  root.appendChild(parallelBlock({
    x0: nodes[0].x + 10, x1: nodes[1].x - 10, yMid, ySplitTop, ySplitBottom,
    branches: [
      {
        y: ySplitTop, label: 'Convection', color: 'var(--convection)',
        value: `R = ${sig(1 / result.G_conv, 3)} K/W`,
        share: result.Q_conv / Math.max(result.Q, 1e-30),
      },
      {
        y: ySplitBottom, label: 'Radiation', color: 'var(--radiation)',
        value: `R = ${sig(1 / result.G_rad_ambient, 3)} K/W`,
        share: result.Q_rad_ambient / Math.max(result.Q, 1e-30),
      },
    ],
    total: `R = ${sig(result.R_ambient, 3)} K/W`,
  }));

  // --- series: outer wall ----------------------------------------------
  root.appendChild(seriesBlock({
    x0: nodes[1].x + 10, x1: nodes[2].x - 10, y: yMid,
    label: 'Outer wall', value: `${sig(result.R_cond_ow, 3)} K/W`,
  }));

  // --- parallel block: vacuum gap --------------------------------------
  root.appendChild(parallelBlock({
    x0: nodes[2].x + 10, x1: nodes[3].x - 10, yMid, ySplitTop, ySplitBottom,
    branches: [
      {
        y: ySplitTop, label: 'Residual gas', color: 'var(--gas)',
        value: `R = ${sig(result.R_gas, 3)} K/W`,
        share: result.gas_fraction,
      },
      {
        y: ySplitBottom, label: `Radiation + ${inputs.n_mli} MLI`, color: 'var(--radiation)',
        value: `R = ${sig(result.R_rad, 3)} K/W`,
        share: result.radiation_fraction,
      },
    ],
    total: `R = ${sig(result.R_vacuum, 3)} K/W`,
  }));

  // --- series: inner wall, inner gap -----------------------------------
  root.appendChild(seriesBlock({
    x0: nodes[3].x + 10, x1: nodes[4].x - 10, y: yMid,
    label: 'Inner wall', value: `${sig(result.R_cond_iw, 3)} K/W`,
  }));

  root.appendChild(seriesBlock({
    x0: nodes[4].x + 10, x1: nodes[5].x - 10, y: yMid,
    label: 'Inner gas gap', value: `${sig(result.R_gap, 3)} K/W`,
  }));

  // --- nodes ------------------------------------------------------------
  for (const node of nodes) {
    root.appendChild(svg('circle', {
      cx: node.x, cy: yMid, r: 4.5,
      fill: node.color ?? 'var(--panel)',
      stroke: node.color ?? 'var(--border-strong)', 'stroke-width': 1.5,
    }));
    root.appendChild(svg('text', {
      class: 'node-label', x: node.x, y: yMid - 12, 'text-anchor': 'middle', text: node.label,
    }));
    root.appendChild(svg('text', {
      class: 'value', x: node.x, y: yMid + 20, 'text-anchor': 'middle',
      text: `${temperature(node.temp)} K`,
    }));
  }

  // --- footer: the equation the diagram represents ----------------------
  root.appendChild(svg('text', {
    class: 'value', x: W / 2, y: H - 8, 'text-anchor': 'middle',
    text:
      `Q = (T_amb − T_cold) / R_total = ${sig(inputs.T_amb - inputs.T_cold, 4)} K / `
      + `${sig(result.R_total, 4)} K/W = ${sig(result.Q, 4)} W`,
  }));

  return root;
}

function seriesBlock({ x0, x1, y, label, value }) {
  const g = svg('g', {});
  const width = x1 - x0;
  const boxWidth = Math.min(width - 6, 84);
  const boxX = x0 + (width - boxWidth) / 2;

  g.appendChild(svg('line', { class: 'wire', x1: x0, y1: y, x2: boxX, y2: y }));
  g.appendChild(svg('line', { class: 'wire', x1: boxX + boxWidth, y1: y, x2: x1, y2: y }));
  g.appendChild(svg('rect', {
    x: boxX, y: y - 11, width: boxWidth, height: 22, rx: 2,
    fill: 'var(--panel-sunken)', stroke: 'var(--border-strong)', 'stroke-width': 1,
  }));
  g.appendChild(svg('text', {
    x: boxX + boxWidth / 2, y: y - 16, 'text-anchor': 'middle', text: label,
  }));
  g.appendChild(svg('text', {
    class: 'value', x: boxX + boxWidth / 2, y: y + 4, 'text-anchor': 'middle', text: value,
  }));
  return g;
}

function parallelBlock({ x0, x1, yMid, ySplitTop, ySplitBottom, branches, total }) {
  const g = svg('g', {});
  const splitX = x0 + 16;
  const joinX = x1 - 16;
  const boxWidth = Math.max(joinX - splitX - 12, 40);
  const boxX = splitX + 6;

  // Wires into and out of the split.
  g.appendChild(svg('line', { class: 'wire', x1: x0, y1: yMid, x2: splitX, y2: yMid }));
  g.appendChild(svg('line', { class: 'wire', x1: joinX, y1: yMid, x2: x1, y2: yMid }));

  for (const branch of branches) {
    // Split and join wires.
    g.appendChild(svg('path', {
      class: 'wire',
      d: `M ${splitX} ${yMid} L ${splitX} ${branch.y} L ${boxX} ${branch.y}`,
    }));
    g.appendChild(svg('path', {
      class: 'wire',
      d: `M ${boxX + boxWidth} ${branch.y} L ${joinX} ${branch.y} L ${joinX} ${yMid}`,
    }));

    // Branch box, with a fill weight that tracks how much heat it carries.
    // The tint tracks the share of heat, but is capped: at full strength the
    // faint value text inside the box fell below a readable contrast in dark mode.
    g.appendChild(svg('rect', {
      x: boxX, y: branch.y - 11, width: boxWidth, height: 22, rx: 2,
      fill: branch.color, 'fill-opacity': 0.06 + 0.18 * Math.min(1, branch.share),
      stroke: branch.color, 'stroke-width': 1.2,
    }));

    g.appendChild(svg('text', {
      x: boxX + boxWidth / 2, y: branch.y - 15, 'text-anchor': 'middle',
      fill: branch.color, text: branch.label,
    }));
    g.appendChild(svg('text', {
      class: 'value', x: boxX + boxWidth / 2, y: branch.y + 4, 'text-anchor': 'middle',
      fill: 'var(--text)', text: branch.value,
    }));
    g.appendChild(svg('text', {
      class: 'value', x: boxX + boxWidth / 2, y: branch.y + 20, 'text-anchor': 'middle',
      fill: branch.color, text: `${percent(branch.share)} of Q`,
    }));
  }

  g.appendChild(svg('text', {
    class: 'value', x: (splitX + joinX) / 2, y: yMid + 4, 'text-anchor': 'middle',
    text: total,
  }));

  return g;
}
