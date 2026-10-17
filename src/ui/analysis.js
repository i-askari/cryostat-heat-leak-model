/**
 * Analysis section: tabbed plots, each answering one question.
 */

import { MLI_SWEEP_PRESSURE } from '../model/constants.js';
import {
  heatLeakVsMli,
  heatLeakVsPressure,
  mechanismSplit,
  pressureSweepCsv,
  sensitivityChart,
  temperaturesVsPressure,
} from '../plots/charts.js';
import { el, replace } from '../utils/dom.js';
import { pressure as formatPressure } from '../utils/format.js';

const TABS = [
  {
    id: 'pressure',
    label: 'Vacuum pressure',
    question: 'How good does the vacuum need to be?',
    blurb:
      'Sweeps the vacuum gap pressure over eleven decades while holding everything else '
      + 'fixed. The steep section is where pumping buys something; the flat sections are '
      + 'where it does not.',
    render: heatLeakVsPressure,
  },
  {
    id: 'mli',
    label: 'MLI layers',
    question: 'Is there a point of diminishing returns on MLI?',
    blurb:
      'Sweeps the layer count at a fixed pressure. How much layers help depends entirely '
      + 'on how much of the heat radiation is carrying at that pressure.',
    render: heatLeakVsMli,
  },
  {
    id: 'temperatures',
    label: 'Temperatures',
    question: 'Where does the temperature difference actually get spent?',
    blurb:
      'The four interface temperatures against pressure. The gaps between the curves are '
      + 'the temperature drops across each element.',
    render: temperaturesVsPressure,
  },
  {
    id: 'mechanisms',
    label: 'Mechanisms',
    question: 'Which mechanism is limiting the design?',
    blurb:
      'The split of heat between the two parallel branches of the vacuum gap, and the '
      + 'branch resistances that produce it.',
    render: mechanismSplit,
  },
  {
    id: 'sensitivity',
    label: 'Sensitivity',
    question: 'Which parameter is the answer most sensitive to?',
    blurb:
      'A one-at-a-time screening: each parameter scaled by plus and minus 20 percent, '
      + 'everything else held fixed.',
    render: sensitivityChart,
  },
];

/**
 * The tab strip is built once. Rebuilding it would destroy the button the
 * user just activated, sending keyboard focus back to the document body.
 * @type {{host: Element, buttons: Map<string, HTMLElement>}|null}
 */
let mountedTabs = null;

/**
 * @param {HTMLElement} tabHost
 * @param {HTMLElement} contentHost
 * @param {ReturnType<import('../state/store.js').createStore>} store
 */
export function renderAnalysis(tabHost, contentHost, store) {
  const activeId = store.ui.analysisTab;

  if (!mountedTabs || mountedTabs.host !== tabHost) {
    const buttons = new Map();
    for (const tab of TABS) {
      buttons.set(tab.id, el('button', {
        class: 'tab',
        type: 'button',
        role: 'tab',
        id: `tab-${tab.id}`,
        'aria-controls': 'analysis-host',
        text: tab.label,
        onclick: () => store.setUi({ analysisTab: tab.id }),
      }));
    }
    replace(tabHost, ...buttons.values());
    mountedTabs = { host: tabHost, buttons };
  }

  for (const [id, button] of mountedTabs.buttons) {
    button.setAttribute('aria-selected', id === activeId ? 'true' : 'false');
  }

  const tab = TABS.find((t) => t.id === activeId) ?? TABS[0];

  if (!store.derived.calc.ok) {
    replace(contentHost, el('p', {
      class: 'panel-note',
      text: 'Analysis is unavailable until the parameters are valid.',
    }));
    return;
  }

  replace(contentHost, el('div', {
    class: 'plot-layout',
    role: 'tabpanel',
    'aria-labelledby': `tab-${tab.id}`,
  }, [
    el('div', { class: 'plot-frame' }, [tab.render(store)]),
    el('div', { class: 'plot-side' }, [
      el('h3', { text: tab.question }),
      el('p', { text: tab.blurb }),
      tab.id === 'mli' ? mliPressureToggle(store) : null,
      tab.id === 'pressure' ? exportRow(store) : null,
      el('p', {
        class: 'panel-note',
        text:
          'Every point on this chart is a separate solve of the same model, recomputed '
          + 'whenever a parameter changes.',
      }),
    ]),
  ]));
}

function mliPressureToggle(store) {
  const mode = store.ui.mliSweepPressure;

  return el('div', { style: { marginBottom: '12px' } }, [
    el('div', {
      class: 'panel-title',
      style: { marginBottom: '6px' },
      text: 'Evaluate the sweep at',
    }),
    el('div', { class: 'button-row' }, [
      el('button', {
        type: 'button',
        'aria-pressed': mode === 'current' ? 'true' : 'false',
        text: `Current (${formatPressure(store.inputs.P_vacuum).combined})`,
        onclick: () => store.setUi({ mliSweepPressure: 'current' }),
      }),
      el('button', {
        type: 'button',
        'aria-pressed': mode === 'reference' ? 'true' : 'false',
        text: `Illustrative (${formatPressure(MLI_SWEEP_PRESSURE).combined})`,
        onclick: () => store.setUi({ mliSweepPressure: 'reference' }),
      }),
    ]),
  ]);
}

function exportRow(store) {
  return el('div', { style: { marginBottom: '12px' } }, [
    el('button', {
      type: 'button',
      text: 'Download sweep as CSV',
      onclick: () => {
        const csv = pressureSweepCsv(store);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = el('a', { href: url, download: 'cryostat-pressure-sweep.csv' });
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      },
    }),
  ]);
}
