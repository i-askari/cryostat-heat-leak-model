/**
 * Radial cross-section.
 *
 * The drawing is generated from the same resolved geometry the solver uses,
 * so a change to any dimension moves the picture and the physics together.
 * Radii are scaled to fit, which means the drawing shows true proportions and
 * a scale bar carries the absolute size.
 *
 * Heat flow is drawn along the left-hand radius. Series elements get one
 * arrow; the two parallel pairs get two arrows whose widths are set by the
 * branch heat rates the solver returns, so the picture of which mechanism
 * dominates is the calculated one.
 */

import { INTERFACE_POINTS } from '../data/interfacePoints.js';
import { resolveGeometry } from '../model/geometry.js';
import { svg } from '../utils/dom.js';
import { millimetres, percent, sig, temperature } from '../utils/format.js';

const W = 680;
const H = 430;
const CX = 190;
const CY = 206;
const MAX_R = 160;

/**
 * The ambient ring is drawn as a band outside the cryostat. Scaling is set so
 * that this outermost drawn radius fits, which keeps the whole drawing inside
 * the canvas whatever the geometry.
 */
const AMBIENT_FACTOR = 1.2;

const LABEL_X = 392;
const LABEL_ROW_Y = [46, 88, 130, 172, 214, 256];

/**
 * @param {import('../model/solver.js').ModelResult & Record<string, any>} result
 * @param {{selectedLayer: string|null, onSelect: (id: string) => void}} options
 * @returns {SVGElement}
 */
export function renderCrossSection(result, options) {
  const geom = resolveGeometry(result.inputs);
  const inputs = result.inputs;

  // Scale so the outermost drawn radius, the ambient band, fills the space.
  const scale = MAX_R / (geom.r_ow_ow * AMBIENT_FACTOR);
  const px = (r) => r * scale;

  const root = svg('svg', {
    class: 'cross-section',
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label':
      `Radial cross-section. Cold mass radius ${millimetres(geom.r_cu)} millimetres at `
      + `${temperature(inputs.T_cold)} kelvin, ambient at ${temperature(inputs.T_amb)} kelvin. `
      + `Heat leak ${sig(result.Q_per_length, 3)} watts per metre.`,
  });

  root.appendChild(defs());

  // --- layers, outermost first ----------------------------------------
  const layers = [
    {
      id: 'ambient', rOuter: geom.r_ow_ow * AMBIENT_FACTOR, rInner: geom.r_ow_ow,
      fill: 'var(--panel-sunken)', label: 'Ambient', clickable: true,
    },
    {
      id: 'outer-wall', rOuter: geom.r_ow_ow, rInner: geom.r_ow_in,
      fill: 'url(#hatch-metal)', stroke: 'var(--metal-dark)', label: 'Outer wall', clickable: true,
    },
    {
      id: 'vacuum-gap', rOuter: geom.r_ow_in, rInner: geom.r_in_ow,
      fill: 'url(#stipple-vacuum)', stroke: 'var(--border)', label: 'Vacuum', clickable: true,
    },
    {
      id: 'inner-wall', rOuter: geom.r_in_ow, rInner: geom.r_in_in,
      fill: 'url(#hatch-metal)', stroke: 'var(--metal-dark)', label: 'Inner wall', clickable: true,
    },
    {
      id: 'inner-gap', rOuter: geom.r_in_in, rInner: geom.r_cu,
      fill: 'var(--panel-sunken)', stroke: 'var(--border)', label: 'Inner gas gap', clickable: true,
    },
  ];

  const layerGroup = svg('g', {});

  for (const layer of layers) {
    layerGroup.appendChild(svg('path', {
      d: annulus(CX, CY, px(layer.rOuter), px(layer.rInner)),
      'fill-rule': 'evenodd',
      fill: layer.fill,
      stroke: layer.stroke ?? 'none',
      'stroke-width': layer.stroke ? 1 : 0,
    }));
  }

  // Cold mass.
  layerGroup.appendChild(svg('circle', {
    cx: CX, cy: CY, r: px(geom.r_cu),
    fill: 'var(--copper)', stroke: 'var(--copper)', 'stroke-width': 1, opacity: 0.85,
  }));

  root.appendChild(layerGroup);

  // MLI, drawn as a band of reflective layers wrapped on the inner wall.
  if (inputs.n_mli > 0) {
    root.appendChild(mliBand(px(geom.r_in_ow), px(geom.r_ow_in), inputs.n_mli));
  }

  // --- heat flow -------------------------------------------------------
  root.appendChild(heatFlow(result, geom, px));

  // --- interactive hit areas ------------------------------------------
  const hits = svg('g', {});
  for (const layer of layers) {
    if (!layer.clickable) continue;
    const selected = options.selectedLayer === layer.id;

    const hit = svg('path', {
      class: 'layer-hit',
      d: annulus(CX, CY, px(layer.rOuter), px(layer.rInner)),
      'fill-rule': 'evenodd',
      fill: 'transparent',
      tabindex: '0',
      role: 'button',
      'aria-label': `${layer.label} details`,
      'aria-pressed': selected ? 'true' : 'false',
      onclick: () => options.onSelect(layer.id),
      onkeydown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          options.onSelect(layer.id);
        }
      },
    });

    hits.appendChild(hit);
    hits.appendChild(svg('path', {
      class: `layer-outline${selected ? ' selected' : ''}`,
      d: annulus(CX, CY, px(layer.rOuter), px(layer.rInner)),
      'fill-rule': 'evenodd',
    }));
  }

  // The cold mass is selectable too.
  const coldSelected = options.selectedLayer === 'cold-mass';
  hits.appendChild(svg('circle', {
    class: 'layer-hit', cx: CX, cy: CY, r: px(geom.r_cu), fill: 'transparent',
    tabindex: '0', role: 'button', 'aria-label': 'Cold mass details',
    'aria-pressed': coldSelected ? 'true' : 'false',
    onclick: () => options.onSelect('cold-mass'),
    onkeydown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        options.onSelect('cold-mass');
      }
    },
  }));
  hits.appendChild(svg('circle', {
    class: `layer-outline${coldSelected ? ' selected' : ''}`,
    cx: CX, cy: CY, r: px(geom.r_cu),
  }));

  root.appendChild(hits);

  // --- callouts --------------------------------------------------------
  root.appendChild(callouts(result, geom, px));
  root.appendChild(scaleBar(scale));

  return root;
}

/** Annulus as a single evenodd path, so it can be filled and hit-tested. */
function annulus(cx, cy, rOuter, rInner) {
  return `${circlePath(cx, cy, rOuter)} ${circlePath(cx, cy, rInner)}`;
}

function circlePath(cx, cy, r) {
  return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
}

function defs() {
  const d = svg('defs');

  // Metal hatch, the drafting convention for a sectioned solid.
  const hatch = svg('pattern', {
    id: 'hatch-metal', width: 6, height: 6,
    patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)',
  }, [
    svg('rect', { width: 6, height: 6, fill: 'var(--metal)', opacity: 0.55 }),
    svg('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: 'var(--metal-dark)', 'stroke-width': 1.1 }),
  ]);

  // Sparse stipple for the evacuated region.
  const stipple = svg('pattern', {
    id: 'stipple-vacuum', width: 14, height: 14, patternUnits: 'userSpaceOnUse',
  }, [
    svg('rect', { width: 14, height: 14, fill: 'var(--vacuum)' }),
    svg('circle', { cx: 3, cy: 3, r: 0.9, fill: 'var(--border-strong)', opacity: 0.55 }),
    svg('circle', { cx: 10, cy: 9, r: 0.9, fill: 'var(--border-strong)', opacity: 0.4 }),
  ]);

  // One marker per channel colour. markerUnits is userSpaceOnUse so the head
  // stays a fixed size: the default scales it by stroke width, which would
  // make a dominant branch's arrowhead swamp the drawing.
  for (const [id, color] of [
    ['arrow-gas', 'var(--gas)'],
    ['arrow-rad', 'var(--radiation)'],
    ['arrow-conv', 'var(--convection)'],
    ['arrow-solid', 'var(--warm)'],
  ]) {
    d.appendChild(svg('marker', {
      id, viewBox: '0 0 10 10', refX: 7.5, refY: 5,
      markerWidth: 9, markerHeight: 9,
      markerUnits: 'userSpaceOnUse', orient: 'auto',
    }, [svg('path', { d: 'M 0 1.5 L 9 5 L 0 8.5 z', fill: color })]));
  }

  d.appendChild(hatch);
  d.appendChild(stipple);
  return d;
}

/**
 * MLI band: one drawn line per layer up to a readable maximum, then a
 * representative subset. The label always states the real count.
 */
function mliBand(rInnerWallPx, rVacuumOuterPx, nLayers) {
  const g = svg('g', { 'aria-hidden': 'true' });
  const available = Math.max(rVacuumOuterPx - rInnerWallPx - 4, 4);
  // Keep the blanket visibly thinner than the gap it sits in, and keep the
  // lines far enough apart to read as separate layers.
  const drawn = Math.min(nLayers, 10);
  const bandWidth = Math.min(available * 0.35, 2.2 * drawn);

  for (let i = 0; i < drawn; i++) {
    const r = rInnerWallPx + 2.5 + (bandWidth * (i + 0.5)) / drawn;
    g.appendChild(svg('circle', {
      cx: CX, cy: CY, r,
      fill: 'none', stroke: 'var(--mli)',
      'stroke-width': 1,
      opacity: 0.4 + 0.45 * (1 - i / Math.max(drawn - 1, 1)),
    }));
  }

  return g;
}

/**
 * Heat-flow arrows along the left radius.
 *
 * Widths encode the calculated branch heat rates: in each parallel pair the
 * two arrows are sized by their share of the flow through that pair, so the
 * drawing changes when the dominant mechanism changes.
 */
function heatFlow(result, geom, px) {
  const g = svg('g', { 'aria-hidden': 'true', class: 'heat-flow' });

  const x = (r) => CX - px(r);
  const total = Math.max(result.Q, 1e-30);

  /**
   * Arrow width from a branch's share of the flow. Square-rooted so a branch
   * carrying a few percent is still visible as a thin line rather than
   * vanishing, and capped so the widest arrow stays inside its layer.
   */
  const widthFor = (share) => 1.2 + 4.8 * Math.sqrt(Math.min(Math.max(share, 0), 1));

  /**
   * @param {number} rFrom outer radius [m]
   * @param {number} rTo inner radius [m]
   */
  const segment = (rFrom, rTo, y, color, share, marker, animate = true) => {
    const x1 = x(rFrom);
    const x2 = x(rTo);
    if (x2 - x1 < 3) return; // too thin to draw honestly
    const fraction = Math.min(Math.max(share, 0), 1);
    const opacity = 0.25 + 0.75 * Math.min(1, Math.sqrt(fraction) * 1.4);

    const line = svg('line', {
      class: `flow-arrow${animate && fraction > 0.02 ? ' flow-animated' : ''}`,
      x1, y1: y, x2, y2: y,
      stroke: color,
      'stroke-width': widthFor(fraction),
      'stroke-dasharray': '8 4',
      opacity,
      'marker-end': `url(#${marker})`,
    });

    // Dash speed carries the same quantity the width does. A constant speed
    // would read as a flow rate while encoding nothing.
    line.style.animationDuration = `${(2.6 - 1.8 * Math.sqrt(fraction)).toFixed(2)}s`;

    g.appendChild(line);
  };

  // Ambient: convection and radiation in parallel, drawn as two arrows.
  const ambientOuter = geom.r_ow_ow * AMBIENT_FACTOR;
  segment(ambientOuter, geom.r_ow_ow, CY - 13, 'var(--convection)',
    result.Q_conv / total, 'arrow-conv');
  segment(ambientOuter, geom.r_ow_ow, CY + 13, 'var(--radiation)',
    result.Q_rad_ambient / total, 'arrow-rad');

  // Outer wall: a single series path carrying all of Q.
  segment(geom.r_ow_ow, geom.r_ow_in, CY, 'var(--warm)', 1, 'arrow-solid', false);

  // Vacuum gap: residual gas and radiation in parallel.
  segment(geom.r_ow_in, geom.r_in_ow, CY - 13, 'var(--gas)',
    result.Q_gas / total, 'arrow-gas');
  segment(geom.r_ow_in, geom.r_in_ow, CY + 13, 'var(--radiation)',
    result.Q_rad_vacuum / total, 'arrow-rad');

  // Inner wall and inner gap: series again. Every series element carries the
  // whole of Q, so they share one colour and one legend entry rather than
  // implying a distinction the network does not make.
  segment(geom.r_in_ow, geom.r_in_in, CY, 'var(--warm)', 1, 'arrow-solid', false);
  segment(geom.r_in_in, geom.r_cu, CY, 'var(--warm)', 1, 'arrow-solid');

  // Branch share labels, only where there is room and a story to tell.
  const vacuumMidX = (x(geom.r_ow_in) + x(geom.r_in_ow)) / 2;
  if (x(geom.r_in_ow) - x(geom.r_ow_in) > 54) {
    g.appendChild(svg('text', {
      class: 'dim-text', x: vacuumMidX, y: CY - 20, 'text-anchor': 'middle',
      fill: 'var(--gas)', text: `gas ${percent(result.gas_fraction)} of gap Q`,
    }));
    g.appendChild(svg('text', {
      class: 'dim-text', x: vacuumMidX, y: CY + 30, 'text-anchor': 'middle',
      fill: 'var(--radiation)', text: `rad ${percent(result.radiation_fraction)} of gap Q`,
    }));
  }

  return g;
}

/** Leader lines from each interface to a label column on the right. */
function callouts(result, geom, px) {
  const g = svg('g', {});
  const inputs = result.inputs;

  // Radius and callout angle for each interface, in the order INTERFACE_POINTS
  // declares them. Colours and wording come from that shared list so the
  // drawing, the results table and the temperature plot always agree.
  const geometryForPoint = {
    T_amb: { angle: 96, r: geom.r_ow_ow * AMBIENT_FACTOR, detail: 'fixed boundary' },
    T1: { angle: 74, r: geom.r_ow_ow },
    T2: { angle: 56, r: geom.r_ow_in },
    T3: { angle: 36, r: geom.r_in_ow },
    T4: { angle: 20, r: geom.r_in_in },
    T_cold: { angle: 6, r: geom.r_cu },
  };

  const rows = INTERFACE_POINTS.map((point) => {
    const place = geometryForPoint[point.key];
    return {
      angle: place.angle,
      r: place.r,
      title: point.solved ? `${point.symbol} ${point.name.toLowerCase()}` : point.name,
      detail: place.detail ?? `r = ${millimetres(place.r)} mm`,
      temp: point.solved ? result[point.key] : inputs[point.key],
      color: point.color,
    };
  });

  rows.forEach((row, i) => {
    const rad = (row.angle * Math.PI) / 180;
    const rPx = px(row.r);
    const x1 = CX + rPx * Math.cos(rad);
    const y1 = CY - rPx * Math.sin(rad);
    const x2 = CX + (rPx + 12) * Math.cos(rad);
    const y2 = CY - (rPx + 12) * Math.sin(rad);
    const rowY = LABEL_ROW_Y[i];

    g.appendChild(svg('polyline', {
      class: 'dim-line',
      points: `${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${LABEL_X - 8},${rowY}`,
      fill: 'none',
    }));

    g.appendChild(svg('circle', { cx: x1, cy: y1, r: 2.2, fill: row.color }));

    g.appendChild(svg('text', {
      class: 'layer-label', x: LABEL_X, y: rowY - 2, text: row.title,
    }));
    g.appendChild(svg('text', {
      class: 'dim-text', x: LABEL_X, y: rowY + 11, text: row.detail,
    }));
    g.appendChild(svg('text', {
      class: 'temp-label', x: W - 12, y: rowY + 4, 'text-anchor': 'end',
      fill: row.color, text: `${temperature(row.temp)} K`,
    }));
  });

  // Gap annotations, placed in the lower-left quadrant where the flow arrows
  // are not.
  const gapLabels = [
    { rOuter: geom.r_ow_in, rInner: geom.r_in_ow, text: `vacuum gap ${millimetres(geom.d_vacuum_gap)} mm` },
    { rOuter: geom.r_in_in, rInner: geom.r_cu, text: `inner gap ${millimetres(geom.d_inner_gap)} mm` },
  ];

  gapLabels.forEach((gap, i) => {
    const rMid = px((gap.rOuter + gap.rInner) / 2);
    const angle = (i === 0 ? 242 : 292) * (Math.PI / 180);
    const tx = CX + rMid * Math.cos(angle);
    const ty = CY - rMid * Math.sin(angle);
    const labelY = H - 44 + i * 15;

    g.appendChild(svg('polyline', {
      class: 'dim-line',
      points: `${tx.toFixed(1)},${ty.toFixed(1)} ${tx.toFixed(1)},${labelY - 8} ${LABEL_X - 120},${labelY - 8}`,
      fill: 'none',
    }));
    g.appendChild(svg('text', {
      class: 'dim-text', x: LABEL_X - 116, y: labelY - 5, text: gap.text,
    }));
  });

  if (result.inputs.n_mli > 0) {
    g.appendChild(svg('text', {
      class: 'dim-text', x: LABEL_X, y: H - 26,
      fill: 'var(--mli)',
      text: `MLI: ${result.inputs.n_mli} layers on the inner wall`,
    }));
  }

  return g;
}

/** Scale bar: the drawing is proportional, so absolute size needs a reference. */
function scaleBar(scale) {
  // Choose a round number of millimetres that is a sensible bar length.
  const targetPx = 70;
  const candidates = [1, 2, 5, 10, 20, 50, 100, 200];
  const mmPerPx = 1 / (scale / 1000);
  const lengthMm = candidates.reduce((best, c) =>
    Math.abs(c / mmPerPx - targetPx) < Math.abs(best / mmPerPx - targetPx) ? c : best, candidates[0]);
  const lengthPx = lengthMm / mmPerPx;

  const y = H - 22;
  const x0 = 24;

  return svg('g', { 'aria-hidden': 'true' }, [
    svg('line', { class: 'dim-line', x1: x0, y1: y, x2: x0 + lengthPx, y2: y, 'stroke-width': 1.2 }),
    svg('line', { class: 'dim-line', x1: x0, y1: y - 4, x2: x0, y2: y + 4 }),
    svg('line', { class: 'dim-line', x1: x0 + lengthPx, y1: y - 4, x2: x0 + lengthPx, y2: y + 4 }),
    svg('text', { class: 'dim-text', x: x0 + lengthPx + 7, y: y + 3.5, text: `${lengthMm} mm` }),
  ]);
}

/**
 * Legend keys, kept next to the drawing so every colour used has a stated
 * meaning.
 * @returns {{label: string, color: string, shape: 'line'|'dot'}[]}
 */
export function crossSectionLegend() {
  return [
    { label: 'Series path: all of Q', color: 'var(--warm)', shape: 'line' },
    { label: 'Convection branch', color: 'var(--convection)', shape: 'line' },
    { label: 'Radiation branch', color: 'var(--radiation)', shape: 'line' },
    { label: 'Residual gas branch', color: 'var(--gas)', shape: 'line' },
    { label: 'MLI layers', color: 'var(--mli)', shape: 'dot' },
    { label: 'Cold mass', color: 'var(--copper)', shape: 'dot' },
  ];
}
