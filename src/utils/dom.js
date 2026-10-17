/**
 * Tiny DOM helpers.
 *
 * The application has no framework: views are plain functions that take state
 * and write into a host element. These helpers keep that readable without
 * pulling in a dependency or resorting to innerHTML string building, which
 * would make it easy to inject markup by accident.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Create an HTML element.
 * @param {string} tag
 * @param {Record<string, any>} [attrs] Attributes; `class`, `text`, `html` and
 *   `on*` handlers are treated specially.
 * @param {(Node|string|null|undefined)[]} [children]
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  applyAttrs(node, attrs);
  appendAll(node, children);
  return node;
}

/**
 * Create an SVG element.
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {(Node|string|null|undefined)[]} [children]
 * @returns {SVGElement}
 */
export function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  applyAttrs(node, attrs);
  appendAll(node, children);
  return node;
}

function applyAttrs(node, attrs) {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'text') {
      node.textContent = String(value);
    } else if (key === 'class') {
      node.setAttribute('class', value);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value);
    } else if (key === 'dataset') {
      for (const [k, v] of Object.entries(value)) node.dataset[k] = v;
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }
}

function appendAll(node, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

/**
 * Replace the contents of a host element.
 * @param {Element} host
 * @param {...(Node|string|null|undefined)} children
 */
export function replace(host, ...children) {
  host.textContent = '';
  appendAll(host, children);
}

/** @param {string} selector @returns {HTMLElement} */
export function $(selector) {
  const node = document.querySelector(selector);
  if (!node) throw new Error(`Expected an element matching "${selector}"`);
  return /** @type {HTMLElement} */ (node);
}
