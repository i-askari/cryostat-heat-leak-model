/**
 * Radial cross-section.
 *
 * The drawing is generated from the same resolved geometry the solver uses,
 * so a change to any dimension moves the picture and the physics together.
 * Radii are scaled to fit, which means the drawing shows true proportions and
 * a scale bar carries the absolute size.
 *
 * Heat flow is drawn along the left-hand radius. Series elements get one
 * arrow; parallel branches get arrows whose widths are set by the
 * branch heat rates the solver returns, so the picture of which mechanism
 * dominates is the calculated one.
 */

import { INTERFACE_POINTS } from '../data/interfacePoints.js';
import { resolveGeometry } from '../model/geometry.js';
import { svg } from '../utils/dom.js';
import { millimetres, sig, temperature } from '../utils/format.js';

const W = 680;
const H = 490;
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
const LABEL_ROW_Y = [35, 80, 125, 170, 215, 260, 305];

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
    // Unlike role=img, group keeps the interactive regions accessible.
    role: 'group',
    'aria-label':
      `Radial cross-section. Copper former outer radius ${millimetres(geom.r_cu)} millimetres at `
      + `${result.T_copper_outer.toFixed(2)} kelvin. Schematic LN₂ channel at ${result.T_coolant.toFixed(2)} kelvin, `
      + `ambient at ${temperature(inputs.T_amb)} kelvin. `
      + `Heat leak ${sig(result.Q_per_length, 3)} watts per metre. Vacuum gap heat paths: `
      + `gas ${sig(result.Q_gas, 3)} W, radiation ${sig(result.Q_rad_vacuum, 3)} W, `
      + `MLI contact ${sig(result.Q_solid_MLI, 3)} W.`,
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

  // The source specifies the former outer radius, but not the coolant bore.
  // This inner radius is a schematic drawing proportion, never a model input.
  const borePx = px(geom.r_cu) * 0.5;
  layerGroup.appendChild(svg('path', {
    'data-region': 'copper-former',
    d: annulus(CX, CY, px(geom.r_cu), borePx), 'fill-rule': 'evenodd',
    fill: 'var(--copper)', stroke: 'var(--copper)', 'stroke-width': 1, opacity: 0.85,
  }));
  layerGroup.appendChild(svg('circle', {
    'data-region': 'coolant-channel', cx: CX, cy: CY, r: borePx,
    fill: '#9ad9e7', stroke: 'var(--cold)', 'stroke-width': 1,
  }));

  root.appendChild(layerGroup);

  // A clear radial separation is left from both walls. The 0.2 mm/layer
  // assumption is only for this illustration and the separate fit warning.
  const band = mliGeometry(geom, inputs.n_mli);
  if (band) root.appendChild(mliBand(px(band.inner), px(band.outer), inputs.n_mli));

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

  const addHit = (id, label, path) => {
    const selected = options.selectedLayer === id;
    hits.appendChild(svg('path', {
      class: 'layer-hit', d: path, 'fill-rule': 'evenodd', fill: 'transparent',
      tabindex: '0', role: 'button', 'aria-label': `${label} details`,
      'aria-pressed': selected ? 'true' : 'false', onclick: () => options.onSelect(id),
      onkeydown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          options.onSelect(id);
        }
      },
    }));
    hits.appendChild(svg('path', {
      class: `layer-outline${selected ? ' selected' : ''}`, d: path, 'fill-rule': 'evenodd',
    }));
  };
  addHit('copper-former', 'Copper former', annulus(CX, CY, px(geom.r_cu), borePx));
  addHit('coolant', 'LN₂ coolant channel', circlePath(CX, CY, borePx));
  // Add the blanket hit last so it wins over the enclosing vacuum hit area.
  if (band) {
    // Enlarge the selectable region for thin blankets, without changing the
    // illustration or allowing the hit target to leave the vacuum gap.
    const hitOuter = Math.min(px(geom.r_ow_in), px(band.outer) + 3);
    const hitInner = Math.max(px(geom.r_in_ow), px(band.inner) - 3);
    addHit('mli', 'MLI blanket', annulus(CX, CY, hitOuter, hitInner));
  }

  root.appendChild(hits);

  // --- callouts --------------------------------------------------------
  root.appendChild(callouts(result, geom, px, borePx, band));
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
    ['arrow-mli-contact', 'var(--mli-contact)'],
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

/** Display-only radial position; it does not enter any thermal resistance. */
function mliGeometry(geom, nLayers) {
  if (nLayers <= 0) return null;
  const gap = geom.d_vacuum_gap;
  const innerClearance = Math.min(0.001, gap * 0.12);
  const outerClearance = Math.min(0.00025, gap * 0.04);
  const illustrativeWidth = nLayers * 0.0002;
  const available = Math.max(gap - innerClearance - outerClearance, 0);
  const shownWidth = Math.min(illustrativeWidth, available);
  return {
    inner: geom.r_in_ow + innerClearance,
    outer: geom.r_in_ow + innerClearance + shownWidth,
    compressed: illustrativeWidth > available,
  };
}

/** Reflective circles are a representative subset at high layer counts. */
function mliBand(rInnerPx, rOuterPx, nLayers) {
  const g = svg('g', { 'aria-hidden': 'true', 'data-region': 'mli-layers' });
  const drawn = Math.min(nLayers, 10);
  for (let i = 0; i < drawn; i++) {
    const r = rInnerPx + ((rOuterPx - rInnerPx) * (i + 0.5)) / drawn;
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
 * Widths encode the calculated branch heat rates: parallel arrows are sized
 * by their share of the flow through that section, so the
 * drawing changes when the dominant mechanism changes.
 */
function heatFlow(result, geom, px) {
  const g = svg('g', { 'aria-hidden': 'true', class: 'heat-flow' });

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
    const dy = Math.abs(y - CY);
    if (dy >= px(rTo)) return;
    // Intersections are with the actual circles, not their horizontal radii.
    const x1 = CX - Math.sqrt(px(rFrom) ** 2 - dy ** 2);
    const x2 = CX - Math.sqrt(px(rTo) ** 2 - dy ** 2);
    if (x2 - x1 < 12) return; // no room for the arrowhead inside this layer
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
    result.conv_fraction, 'arrow-conv');
  segment(ambientOuter, geom.r_ow_ow, CY + 13, 'var(--radiation)',
    result.ambient_radiation_fraction, 'arrow-rad');

  // Outer wall: a single series path carrying all of Q.
  segment(geom.r_ow_ow, geom.r_ow_in, CY, 'var(--warm)', 1, 'arrow-solid', false);

  // Vacuum gap: three parallel channels. No MLI means no contact path.
  const branchOffset = Math.min(14, px(geom.r_in_ow) * 0.24);
  segment(geom.r_ow_in, geom.r_in_ow, CY - branchOffset, 'var(--gas)',
    result.gas_fraction, 'arrow-gas');
  segment(geom.r_ow_in, geom.r_in_ow, CY, 'var(--radiation)',
    result.radiation_fraction, 'arrow-rad');
  if (result.inputs.n_mli > 0) {
    segment(geom.r_ow_in, geom.r_in_ow, CY + branchOffset, 'var(--mli-contact)',
      result.fraction_solid_MLI, 'arrow-mli-contact');
  }

  // Inner wall and inner gap: series again. Every series element carries the
  // whole of Q, so they share one colour and one legend entry rather than
  // implying a distinction the network does not make.
  segment(geom.r_in_ow, geom.r_in_in, CY, 'var(--warm)', 1, 'arrow-solid', false);
  segment(geom.r_in_in, geom.r_cu, CY, 'var(--gas)', 1, 'arrow-gas');

  return g;
}

/** Leader lines from each interface to a label column on the right. */
function callouts(result, geom, px, borePx, band) {
  const g = svg('g', {});
  const inputs = result.inputs;

  // Radius and callout angle for each interface, in the order INTERFACE_POINTS
  // declares them. Colours and wording come from that shared list so the
  // drawing, the results table and the temperature plot always agree.
  const geometryForPoint = {
    T_amb: { angle: 72, r: geom.r_ow_ow * AMBIENT_FACTOR, detail: 'fixed boundary' },
    T1: { angle: 55, r: geom.r_ow_ow },
    T2: { angle: 35, r: geom.r_ow_in },
    T3: { angle: 0, r: geom.r_in_ow },
    T4: { angle: -5, r: geom.r_in_in },
    T_cold: { angle: -20, r: geom.r_cu, detail: `outer surface · r = ${millimetres(geom.r_cu)} mm` },
  };

  const rows = INTERFACE_POINTS.map((point) => {
    const place = geometryForPoint[point.key];
    return {
      angle: place.angle,
      r: place.r,
      title: point.solved ? `${point.symbol} — ${point.name}` : point.key === 'T_cold' ? 'Copper Former' : point.name,
      detail: place.detail ?? `r = ${millimetres(place.r)} mm`,
      temp: point.solved ? result[point.key] : inputs[point.key],
      prescribedCold: point.key === 'T_cold',
      color: point.color,
    };
  });

  // The channel is a physical region, not an extra solved interface. Its
  // size is schematic and deliberately has no displayed radius.
  rows.push({
    angle: -70, r: borePx / px(1) * 0.65,
    title: 'LN₂ Coolant Channel', detail: 'schematic bore · prescribed coolant',
    temp: result.T_coolant, color: 'var(--cold)', prescribedCold: true,
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
      fill: row.color, text: `${row.prescribedCold ? row.temp.toFixed(2) : temperature(row.temp)} K`,
    }));
  });

  const notes = [
    `Main vacuum gap: ${millimetres(geom.d_vacuum_gap)} mm`,
    `Inner gas gap: ${millimetres(geom.d_inner_gap)} mm`,
    `MLI: ${result.inputs.n_mli} layers within the vacuum gap`,
    !band ? 'No MLI blanket is drawn at zero layers.'
      : band.compressed ? 'MLI drawing compressed to fit the gap.'
        : 'MLI shown with illustrative clearance.',
    '0.2 mm/layer: drawing and warning only.',
    'Click regions for live physics details.',
  ];
  notes.forEach((text, i) => g.appendChild(svg('text', {
    class: 'dim-text', x: LABEL_X, y: 344 + i * 16, text,
  })));

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
    { label: 'MLI solid/contact branch', color: 'var(--mli-contact)', shape: 'line' },
    { label: 'MLI layers', color: 'var(--mli)', shape: 'dot' },
    { label: 'Copper former', color: 'var(--copper)', shape: 'dot' },
    { label: 'LN₂ coolant channel (schematic bore)', color: '#9ad9e7', shape: 'dot' },
  ];
}
