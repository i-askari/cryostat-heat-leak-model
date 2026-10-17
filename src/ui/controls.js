/**
 * Parameter control widgets.
 *
 * Each control owns one model input. It renders a slider and a number field
 * that stay in sync and converts between the display unit and SI. An empty
 * or incomplete entry is marked invalid until the user finishes typing it.
 *
 * Controls are built once and then patched in place through the `update`
 * function they return. They are deliberately not rebuilt on each render:
 * replacing the node under the pointer aborts a slider drag, and replacing the
 * node under the caret drops focus after a single keystroke.
 *
 * `update` never writes to the element the user is currently interacting with.
 * Writing to a focused number field would fight the caret and would destroy a
 * partial entry such as "1." the moment it parsed to 1.
 */

import { el } from '../utils/dom.js';

const SLIDER_STEPS = 1000;

/**
 * @typedef {object} ControlSpec
 * @property {string} key    Model input key
 * @property {string} label
 * @property {string} unit   Display unit
 * @property {number} min    Minimum, in display units
 * @property {number} max    Maximum, in display units
 * @property {number} [step] Number-field step, in display units
 * @property {'linear'|'log'} [scale]
 * @property {(si: number) => number} [toDisplay]
 * @property {(display: number) => number} [fromDisplay]
 * @property {number} [decimals] Digits shown in the number field
 * @property {string} [hint]
 * @property {boolean} [integer]
 */

/**
 * @typedef {object} MountedControl
 * @property {HTMLElement} node
 * @property {(siValue: number, invalid: boolean) => void} update
 */

/**
 * @param {ControlSpec} spec
 * @param {number} siValue Initial value in SI units
 * @param {(value: number) => void} onChange Receives an SI value
 * @returns {MountedControl}
 */
export function control(spec, siValue, onChange) {
  const toDisplay = spec.toDisplay ?? ((v) => v);
  const fromDisplay = spec.fromDisplay ?? ((v) => v);
  const scale = spec.scale ?? 'linear';
  const decimals = spec.decimals ?? 3;

  const displayValue = toDisplay(siValue);
  const id = `control-${spec.key}`;

  const number = el('input', {
    type: 'number',
    id,
    value: formatNumber(displayValue, decimals, spec.integer),
    step: spec.step ?? 'any',
    min: spec.min,
    max: spec.max,
    'aria-describedby': spec.hint ? `${id}-hint` : null,
  });

  const slider = el('input', {
    type: 'range',
    min: 0,
    max: SLIDER_STEPS,
    step: 1,
    value: String(toSliderPosition(displayValue, spec, scale)),
    'aria-label': `${spec.label} slider`,
    // The number field beside it is the keyboard-accessible control for this
    // parameter, so the slider is skipped in the tab order rather than
    // doubling the number of tab stops in the panel.
    tabindex: -1,
  });

  // Slider drives the number field and the model continuously.
  slider.addEventListener('input', () => {
    const display = fromSliderPosition(Number(slider.value), spec, scale);
    const rounded = spec.integer ? Math.round(display) : display;
    number.value = formatNumber(rounded, decimals, spec.integer);
    onChange(fromDisplay(rounded));
  });

  // The number field accepts values outside the slider range: the slider is a
  // convenient span, not a hard limit on what the model can be asked.
  number.addEventListener('input', () => {
    const display = Number(number.value);
    if (number.value.trim() === '' || !Number.isFinite(display)) {
      onChange(NaN);
      return;
    }
    slider.value = String(toSliderPosition(display, spec, scale));
    // Keep fractional entries intact so model validation can reject them.
    onChange(fromDisplay(display));
  });

  const node = el('div', { class: 'control' }, [
    el('label', { for: id, text: spec.label }),
    el('span', { class: 'control-value' }, [
      number,
      el('span', { class: 'unit', text: spec.unit }),
    ]),
    slider,
    spec.hint ? el('span', { class: 'control-hint', id: `${id}-hint`, text: spec.hint }) : null,
  ]);

  const update = (value, invalid) => {
    const display = toDisplay(value);

    if (document.activeElement !== number) {
      number.value = formatNumber(display, decimals, spec.integer);
    }
    if (document.activeElement !== slider) {
      slider.value = String(toSliderPosition(display, spec, scale));
    }

    node.classList.toggle('invalid', Boolean(invalid));
  };

  return { node, update };
}

/**
 * A read-only derived quantity shown alongside the controls.
 * @param {string} label
 * @param {string} value
 * @returns {{node: HTMLElement, set: (value: string) => void}}
 */
export function derivedRow(label, value) {
  const valueNode = el('span', { class: 'mono', text: value });
  const node = el('div', { class: 'control-derived' }, [
    el('span', { text: label }),
    valueNode,
  ]);

  return {
    node,
    set(next) {
      if (valueNode.textContent !== next) valueNode.textContent = next;
    },
  };
}

/**
 * A collapsible group of controls.
 *
 * The open/closed state lives in the DOM rather than in the store: it is a
 * view preference with no effect on the model, and keeping it out of the
 * store means toggling a group cannot invalidate a memoised sweep.
 *
 * @param {string} title
 * @param {(HTMLElement|null)[]} children
 * @param {boolean} [open]
 * @returns {HTMLElement}
 */
export function group(title, children, open = true) {
  return el('details', { class: 'control-group', open }, [
    el('summary', { text: title }),
    ...children,
  ]);
}

function formatNumber(value, decimals, integer) {
  if (!Number.isFinite(value)) return '';
  if (integer) return String(value);
  if (Math.abs(value) >= 1e4 || (Math.abs(value) < 1e-3 && value !== 0)) {
    return value.toExponential(2);
  }
  return String(Number(value.toFixed(decimals)));
}

function toSliderPosition(display, spec, scale) {
  const clamped = Math.min(Math.max(display, spec.min), spec.max);
  if (scale === 'log') {
    const lo = Math.log10(spec.min);
    const hi = Math.log10(spec.max);
    return Math.round(((Math.log10(clamped) - lo) / (hi - lo)) * SLIDER_STEPS);
  }
  return Math.round(((clamped - spec.min) / (spec.max - spec.min)) * SLIDER_STEPS);
}

function fromSliderPosition(position, spec, scale) {
  const t = position / SLIDER_STEPS;
  if (scale === 'log') {
    const lo = Math.log10(spec.min);
    const hi = Math.log10(spec.max);
    return 10 ** (lo + t * (hi - lo));
  }
  return spec.min + t * (spec.max - spec.min);
}
