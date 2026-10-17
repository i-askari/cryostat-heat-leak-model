/**
 * Application entry point.
 *
 * Wires the store to the views. Every view is a pure function of state, so a
 * single subscription that re-renders is enough: there is no separate update
 * path that could let one panel disagree with another.
 *
 * Re-rendering is batched into an animation frame, which keeps dragging a
 * slider smooth even though each frame re-solves the model and its sweeps.
 */

import { renderAnalysis } from './ui/analysis.js';
import { renderBreakdown } from './ui/breakdown.js';
import { renderDetail, renderExplain } from './ui/explain.js';
import { renderParameters } from './ui/parameters.js';
import { renderResults } from './ui/results.js';
import { createStore } from './state/store.js';
import { crossSectionLegend, renderCrossSection } from './viz/crossSection.js';
import { renderNetwork } from './viz/network.js';
import { $, el, replace } from './utils/dom.js';

const store = createStore();

const hosts = {
  parameters: $('#parameter-panel'),
  crossSection: $('#cross-section-host'),
  legend: $('#cross-section-legend'),
  network: $('#network-host'),
  detail: $('#detail-host'),
  detailTitle: $('#detail-title-text'),
  results: $('#results-panel'),
  breakdown: $('#breakdown-panel'),
  explain: $('#explain-panel'),
  analysisTabs: $('#analysis-tabs'),
  analysis: $('#analysis-host'),
};

/**
 * Re-render everything. Views are cheap compared with the solves behind them,
 * and rebuilding them all keeps the data flow in one direction.
 */
function render() {
  renderParameters(hosts.parameters, store);
  renderResults(hosts.results, store);
  renderBreakdown(hosts.breakdown, store);
  renderExplain(hosts.explain, store);
  renderDetail(hosts.detail, hosts.detailTitle, store);
  renderAnalysis(hosts.analysisTabs, hosts.analysis, store);

  const { ok, result } = store.derived.calc;

  if (ok) {
    replace(hosts.crossSection, renderCrossSection(result, {
      selectedLayer: store.ui.selectedLayer,
      onSelect: (id) => store.setUi({ selectedLayer: id }),
    }));

    replace(hosts.legend, ...crossSectionLegend().map((key) =>
      el('span', { class: 'key' }, [
        el('span', {
          class: `mark${key.shape === 'dot' ? ' dot' : ''}`,
          style: { background: key.color },
        }),
        key.label,
      ])));

    replace(hosts.network, renderNetwork(result));
  } else {
    const message = 'The geometry or parameters are not physically valid, so there is '
      + 'nothing to draw. The Results panel lists what needs fixing.';
    replace(hosts.crossSection, el('p', { class: 'panel-note', text: message }));
    replace(hosts.legend);
    replace(hosts.network);
  }
}

// Batch renders: a slider drag fires many input events per frame.
let frameRequested = false;
store.subscribe(() => {
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(() => {
    frameRequested = false;
    render();
  });
});

// --- header actions ------------------------------------------------------

$('#btn-reset').addEventListener('click', () => {
  store.reset();
  render();
});

$('#btn-copy-link').addEventListener('click', async (event) => {
  const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
  const url = store.shareableUrl();
  const original = 'Copy link';

  try {
    await navigator.clipboard.writeText(url);
    button.textContent = 'Copied';
  } catch {
    // Clipboard access can be refused; the URL bar already holds the state.
    button.textContent = 'URL updated';
  }

  setTimeout(() => { button.textContent = original; }, 1600);
});

render();
