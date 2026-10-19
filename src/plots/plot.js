/**
 * Minimal SVG plotting.
 *
 * Purpose-built rather than pulled from a library: these plots need log axes
 * with decade minor ticks, series segmented by gas regime, and hover readout
 * tied to model records rather than to bare coordinates. That is a small
 * amount of code to own and a large amount of control over how the physics
 * reads.
 */

import { el, svg } from '../utils/dom.js';
import { exponential, linearTick, sig } from '../utils/format.js';

/**
 * @typedef {object} AxisConfig
 * @property {'linear'|'log'} [type]
 * @property {[number, number]} domain
 * @property {string} [label]
 * @property {(v: number) => string} [format]
 * @property {number[]} [ticks]
 */

/**
 * @typedef {object} SeriesConfig
 * @property {[number, number][]} points
 * @property {string} [color]
 * @property {number} [width]
 * @property {string} [dash]
 * @property {string} [label]
 * @property {{from: number, to: number, color: string}[]} [segments]
 *   Colour the line by x-range, used for gas-regime colouring.
 */

/**
 * @param {object} config
 * @returns {{node: SVGElement, xScale: Function, yScale: Function,
 *            invertX: Function, area: {x: number, y: number, w: number, h: number}}}
 */
export function plot(config) {
  const width = config.width ?? 660;
  const height = config.height ?? 330;
  const margin = { top: 26, right: 18, bottom: 46, left: 66, ...(config.margin ?? {}) };

  const area = {
    x: margin.left,
    y: margin.top,
    w: width - margin.left - margin.right,
    h: height - margin.top - margin.bottom,
  };

  const xScale = makeScale(config.x, [area.x, area.x + area.w]);
  const yScale = makeScale(config.y, [area.y + area.h, area.y]);
  const invertX = makeInverse(config.x, [area.x, area.x + area.w]);

  const root = svg('svg', {
    class: 'plot',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': config.ariaLabel ?? config.title ?? 'plot',
  });

  if (config.title) {
    root.appendChild(svg('text', {
      class: 'plot-title', x: area.x, y: 14, text: config.title,
    }));
  }

  // --- background bands (regimes) --------------------------------------
  for (const band of config.bands ?? []) {
    const x0 = xScale(Math.max(band.from, config.x.domain[0]));
    const x1 = xScale(Math.min(band.to, config.x.domain[1]));
    if (!(x1 > x0)) continue;

    root.appendChild(svg('rect', {
      x: x0, y: area.y, width: x1 - x0, height: area.h,
      fill: band.color, 'fill-opacity': 0.07,
    }));

    if (band.label && x1 - x0 > 46) {
      root.appendChild(svg('text', {
        class: 'tick-text', x: (x0 + x1) / 2, y: area.y + 12,
        'text-anchor': 'middle', fill: band.color, text: band.label,
      }));
    }
  }

  // --- grid and axes ----------------------------------------------------
  const xTicks = axisTicks(config.x);
  const yTicks = axisTicks(config.y);

  for (const tick of xTicks.minor) {
    root.appendChild(svg('line', {
      class: 'tick-minor', x1: xScale(tick), y1: area.y, x2: xScale(tick), y2: area.y + area.h,
    }));
  }

  for (const tick of xTicks.major) {
    const x = xScale(tick);
    root.appendChild(svg('line', {
      class: 'tick-line', x1: x, y1: area.y, x2: x, y2: area.y + area.h,
    }));
    root.appendChild(svg('text', {
      class: 'tick-text', x, y: area.y + area.h + 15, 'text-anchor': 'middle',
      text: formatTick(tick, config.x, xTicks.major),
    }));
  }

  for (const tick of yTicks.minor) {
    root.appendChild(svg('line', {
      class: 'tick-minor', x1: area.x, y1: yScale(tick), x2: area.x + area.w, y2: yScale(tick),
    }));
  }

  for (const tick of yTicks.major) {
    const y = yScale(tick);
    root.appendChild(svg('line', {
      class: 'tick-line', x1: area.x, y1: y, x2: area.x + area.w, y2: y,
    }));
    root.appendChild(svg('text', {
      class: 'tick-text', x: area.x - 8, y: y + 3.5, 'text-anchor': 'end',
      text: formatTick(tick, config.y, yTicks.major),
    }));
  }

  root.appendChild(svg('line', {
    class: 'axis-line', x1: area.x, y1: area.y + area.h, x2: area.x + area.w, y2: area.y + area.h,
  }));
  root.appendChild(svg('line', {
    class: 'axis-line', x1: area.x, y1: area.y, x2: area.x, y2: area.y + area.h,
  }));

  if (config.x.label) {
    root.appendChild(svg('text', {
      class: 'axis-title', x: area.x + area.w / 2, y: height - 8,
      'text-anchor': 'middle', text: config.x.label,
    }));
  }

  if (config.y.label) {
    root.appendChild(svg('text', {
      class: 'axis-title', x: 12, y: area.y + area.h / 2, 'text-anchor': 'middle',
      transform: `rotate(-90 12 ${area.y + area.h / 2})`, text: config.y.label,
    }));
  }

  // --- reference lines --------------------------------------------------
  for (const line of config.hLines ?? []) {
    const y = yScale(line.y);
    if (!Number.isFinite(y)) continue;
    root.appendChild(svg('line', {
      class: 'marker-line', x1: area.x, y1: y, x2: area.x + area.w, y2: y,
      stroke: line.color ?? null,
    }));
    if (line.label) {
      root.appendChild(svg('text', {
        class: 'tick-text', x: area.x + area.w - 4, y: y - 4, 'text-anchor': 'end',
        fill: line.color ?? null, text: line.label,
      }));
    }
  }

  for (const line of config.vLines ?? []) {
    if (line.x < config.x.domain[0] || line.x > config.x.domain[1]) continue;
    const x = xScale(line.x);
    if (!Number.isFinite(x)) continue;
    root.appendChild(svg('line', {
      class: 'marker-line', x1: x, y1: area.y, x2: x, y2: area.y + area.h,
      stroke: line.color ?? null,
    }));
    if (line.label) {
      root.appendChild(svg('text', {
        class: 'tick-text', x: x + 4, y: area.y + area.h - 5,
        fill: line.color ?? null, text: line.label,
      }));
    }
  }

  // --- series -----------------------------------------------------------
  for (const series of config.series ?? []) {
    const finite = series.points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    if (finite.length === 0) continue;

    if (series.segments) {
      // Split the polyline by x-range so each regime is drawn in its colour.
      for (const segment of series.segments) {
        const pts = finite.filter(([x]) => x >= segment.from && x <= segment.to);
        if (pts.length < 2) continue;
        root.appendChild(svg('path', {
          class: 'series', d: linePath(pts, xScale, yScale),
          stroke: segment.color, 'stroke-width': series.width ?? 2,
        }));
      }
    } else {
      root.appendChild(svg('path', {
        class: 'series', d: linePath(finite, xScale, yScale),
        stroke: series.color ?? 'var(--accent)',
        'stroke-width': series.width ?? 2,
        'stroke-dasharray': series.dash ?? null,
      }));
    }

    if (series.showPoints) {
      for (const [x, y] of finite) {
        root.appendChild(svg('circle', {
          cx: xScale(x), cy: yScale(y), r: 3,
          fill: series.color ?? 'var(--accent)',
        }));
      }
    }
  }

  // --- markers ----------------------------------------------------------
  for (const marker of config.markers ?? []) {
    if (marker.x < config.x.domain[0] || marker.x > config.x.domain[1] ||
        marker.y < config.y.domain[0] || marker.y > config.y.domain[1]) continue;
    const x = xScale(marker.x);
    const y = yScale(marker.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    root.appendChild(svg('circle', {
      cx: x, cy: y, r: 5, fill: 'var(--panel)',
      stroke: marker.color ?? 'var(--text)', 'stroke-width': 2,
    }));

    if (marker.label) {
      const anchor = x > area.x + area.w * 0.7 ? 'end' : 'start';
      root.appendChild(svg('text', {
        class: 'tick-text', x: anchor === 'end' ? x - 9 : x + 9, y: y - 8,
        'text-anchor': anchor, fill: 'var(--text)', text: marker.label,
      }));
    }
  }

  return { node: root, xScale, yScale, invertX, area };
}

/**
 * Wrap a plot with a hover readout driven by the underlying model records.
 *
 * @param {ReturnType<plot>} built
 * @param {{records: any[], xOf: (r: any) => number, describe: (r: any) => string[]}} hover
 * @returns {HTMLElement}
 */
export function withHover(built, hover) {
  const container = el('div', { class: 'plot-container' }, [built.node]);
  const tooltip = el('div', { class: 'plot-tooltip', role: 'status' });
  container.appendChild(tooltip);

  const cursor = svg('line', {
    class: 'marker-line', x1: 0, y1: built.area.y, x2: 0, y2: built.area.y + built.area.h,
    opacity: 0,
  });
  built.node.appendChild(cursor);

  const overlay = svg('rect', {
    x: built.area.x, y: built.area.y, width: built.area.w, height: built.area.h,
    fill: 'transparent', style: { cursor: 'crosshair' },
  });
  built.node.appendChild(overlay);

  const move = (event) => {
    const rect = built.node.getBoundingClientRect();
    if (rect.width === 0) return;

    // Map client pixels into the viewBox coordinate system.
    const viewBoxWidth = built.node.viewBox.baseVal.width || rect.width;
    const scale = viewBoxWidth / rect.width;
    const svgX = (event.clientX - rect.left) * scale;

    const value = built.invertX(svgX);
    let nearest = null;
    let bestDistance = Infinity;

    for (const record of hover.records) {
      // Compare positions in the actual plot scale. This works for linear
      // axes (including zero MLI layers) as well as logarithmic pressure axes.
      const distance = Math.abs(built.xScale(hover.xOf(record)) - built.xScale(value));
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = record;
      }
    }

    if (!nearest) return;

    cursor.setAttribute('x1', String(built.xScale(hover.xOf(nearest))));
    cursor.setAttribute('x2', String(built.xScale(hover.xOf(nearest))));
    cursor.setAttribute('opacity', '1');

    tooltip.textContent = '';
    for (const line of hover.describe(nearest)) {
      tooltip.appendChild(el('div', { text: line }));
    }

    const left = ((built.xScale(hover.xOf(nearest)) / viewBoxWidth) * rect.width);
    tooltip.style.opacity = '1';
    tooltip.style.left = `${Math.min(Math.max(left + 12, 4), rect.width - tooltip.offsetWidth - 4)}px`;
    tooltip.style.top = '8px';
  };

  overlay.addEventListener('mousemove', move);
  overlay.addEventListener('mouseleave', () => {
    tooltip.style.opacity = '0';
    cursor.setAttribute('opacity', '0');
  });

  return container;
}

// --- scales ------------------------------------------------------------

function makeScale(axis, range) {
  const type = axis.type ?? 'linear';
  const [d0, d1] = axis.domain;

  if (type === 'log') {
    const l0 = Math.log10(d0);
    const l1 = Math.log10(d1);
    return (v) => {
      if (!(v > 0)) return NaN;
      return range[0] + ((Math.log10(v) - l0) / (l1 - l0)) * (range[1] - range[0]);
    };
  }

  return (v) => range[0] + ((v - d0) / (d1 - d0)) * (range[1] - range[0]);
}

function makeInverse(axis, range) {
  const type = axis.type ?? 'linear';
  const [d0, d1] = axis.domain;

  if (type === 'log') {
    const l0 = Math.log10(d0);
    const l1 = Math.log10(d1);
    return (pixel) => 10 ** (l0 + ((pixel - range[0]) / (range[1] - range[0])) * (l1 - l0));
  }

  return (pixel) => d0 + ((pixel - range[0]) / (range[1] - range[0])) * (d1 - d0);
}

function axisTicks(axis) {
  if (axis.ticks) return { major: axis.ticks, minor: [] };

  const [d0, d1] = axis.domain;

  if ((axis.type ?? 'linear') === 'log') {
    const major = [];
    const minor = [];
    const lo = Math.floor(Math.log10(d0));
    const hi = Math.ceil(Math.log10(d1));
    // Thin the decade labels on very wide axes so they stay readable.
    const stride = hi - lo > 10 ? 2 : 1;

    for (let e = lo; e <= hi; e++) {
      const value = 10 ** e;
      if (value >= d0 && value <= d1 && (e - lo) % stride === 0) major.push(value);
      for (let m = 2; m <= 9; m++) {
        const v = m * 10 ** e;
        if (v >= d0 && v <= d1) minor.push(v);
      }
    }
    return { major, minor };
  }

  return { major: niceLinearTicks(d0, d1, 6), minor: [] };
}

function niceLinearTicks(d0, d1, count) {
  const span = d1 - d0;
  if (!(span > 0)) return [d0];

  const rough = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const step = (normalised > 5 ? 10 : normalised > 2 ? 5 : normalised > 1 ? 2 : 1) * magnitude;

  const ticks = [];
  const first = Math.ceil(d0 / step) * step;
  // A bound also prevents a floating-point non-advancing loop at extreme scales.
  for (let i = 0; i < 100; i++) {
    const v = first + i * step;
    if (!(v <= d1 + step * 1e-9)) break;
    ticks.push(Number(v.toPrecision(14)));
  }
  return ticks;
}

function formatTick(value, axis, ticks) {
  if (axis.format) return axis.format(value);
  if ((axis.type ?? 'linear') === 'log') return exponential(value, 0);
  return ticks.length > 1 ? linearTick(value, Math.abs(ticks[1] - ticks[0])) : sig(value, 3);
}

function linePath(points, xScale, yScale) {
  return points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${xScale(x).toFixed(2)} ${yScale(y).toFixed(2)}`)
    .join(' ');
}
