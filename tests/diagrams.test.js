import { assert, describe, it } from './harness.js';
import { DEFAULT_INPUTS } from '../src/model/constants.js';
import { resolveGeometry } from '../src/model/geometry.js';
import { solve } from '../src/model/solver.js';
import { renderCrossSection } from '../src/viz/crossSection.js';
import { renderNetwork } from '../src/viz/network.js';

// Exercise the real SVG creation and event handlers with a tiny DOM, while
// remaining dependency-free and usable in JavaScriptCore as well as Node.
function withDom(fn) {
  const previous = globalThis.document;
  try {
    const makeNode = (tag) => ({
      tag, attrs: {}, children: [], style: {}, listeners: {}, textContent: '',
      setAttribute(key, value) { this.attrs[key] = String(value); },
      appendChild(child) { this.children.push(child); return child; },
      addEventListener(event, handler) { this.listeners[event] = handler; },
    });
    globalThis.document = { createElementNS(_ns, tag) { return makeNode(tag); } };
    fn();
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}
function flatten(node) { return [node, ...node.children.flatMap(flatten)]; }
function byAttr(root, key, value) { return flatten(root).find((node) => node.attrs[key] === value); }
function texts(root) { return flatten(root).map((node) => node.textContent).filter(Boolean); }
const result = (overrides = {}) => solve({ ...DEFAULT_INPUTS, ...overrides });

describe('cross-section physical regions', () => {
  it('distinguishes a schematic coolant bore from the copper annulus with separate live temperatures', () => withDom(() => {
    const root = renderCrossSection(result(), { selectedLayer: null, onSelect() {} });
    const copper = byAttr(root, 'data-region', 'copper-former');
    const bore = byAttr(root, 'data-region', 'coolant-channel');
    assert.ok(copper && bore && copper.tag === 'path' && bore.tag === 'circle');
    assert.ok(copper.attrs.fill !== bore.attrs.fill);
    assert.ok(texts(root).includes('77.01 K') && texts(root).includes('77.00 K'));
    assert.ok(texts(root).some((text) => text.includes('schematic bore')));
    assert.ok(root.attrs['aria-label'].includes('77.01') && root.attrs['aria-label'].includes('77.00'));
  }));

  it('places MLI lines in the vacuum gap with radial clearance and responds to geometry and layer count', () => withDom(() => {
    const inputs = { ...DEFAULT_INPUTS, n_mli: 16 };
    const geom = resolveGeometry(inputs);
    const root = renderCrossSection(solve(inputs), { selectedLayer: null, onSelect() {} });
    const band = byAttr(root, 'data-region', 'mli-layers');
    const lines = band.children.map((circle) => Number(circle.attrs.r));
    const scale = 160 / (geom.r_ow_ow * 1.2);
    assert.ok(lines.length > 1);
    assert.greater(Math.min(...lines), geom.r_in_ow * scale, 'MLI must not touch inner wall');
    assert.less(Math.max(...lines), geom.r_ow_in * scale, 'MLI must remain inside vacuum');
    const smaller = renderCrossSection(result({ n_mli: 1, d_vacuum_gap: inputs.d_vacuum_gap / 2 }),
      { selectedLayer: null, onSelect() {} });
    assert.equal(byAttr(smaller, 'data-region', 'mli-layers').children.length, 1);
    assert.ok(Number(byAttr(smaller, 'data-region', 'mli-layers').children[0].attrs.r) !== lines[0]);
  }));

  it('exposes clickable MLI, inner gap, former and coolant, including a thin one-layer hit target', () => withDom(() => {
    let selected = null;
    const root = renderCrossSection(result({ n_mli: 1 }), { selectedLayer: null, onSelect: (id) => { selected = id; } });
    for (const [name, id] of [['MLI blanket details', 'mli'], ['Inner gas gap details', 'inner-gap'],
      ['Copper former details', 'copper-former'], ['LN₂ coolant channel details', 'coolant']]) {
      const hit = byAttr(root, 'aria-label', name);
      assert.ok(hit && hit.attrs.tabindex === '0' && hit.listeners.click, `${name} must be accessible`);
      hit.listeners.click();
      assert.equal(selected, id);
    }
    assert.equal(root.attrs.role, 'group');
  }));

  it('omits the blanket at zero layers and flags a compressed schematic when oversized', () => withDom(() => {
    const none = renderCrossSection(result({ n_mli: 0 }), { selectedLayer: null, onSelect() {} });
    assert.ok(!byAttr(none, 'data-region', 'mli-layers'));
    assert.ok(!byAttr(none, 'aria-label', 'MLI blanket details'));
    const oversized = renderCrossSection(result({ n_mli: 1000 }), { selectedLayer: null, onSelect() {} });
    assert.ok(texts(oversized).some((text) => text.includes('compressed to fit')));
  }));
});

describe('thermal-network diagram', () => {
  it('shows the three main-gap mechanisms and the gas-only inner gap, without invented copper resistance', () => withDom(() => {
    const root = renderNetwork(result());
    const words = texts(root).join(' | ');
    assert.ok(words.includes('Residual gas') && words.includes('Radiation / MLI') && words.includes('MLI solid / contact'));
    assert.ok(words.includes('Inner gap: residual gas only') && words.includes('copper resistance not modelled'));
    assert.ok(!words.includes('Inner-gap radiation') && !words.includes('Copper resistance ='));
    assert.ok(words.includes('77.01 K') && words.includes('77.00 K'));
    assert.ok(words.includes('T_ambient − T_copper outer'));
  }));
  it('shows the contact branch disabled at zero layers', () => withDom(() => {
    const root = renderNetwork(result({ n_mli: 0 }));
    assert.ok(texts(root).includes('No blanket'));
    assert.ok(root.attrs['aria-label'].includes('absent with zero layers'));
  }));
});
