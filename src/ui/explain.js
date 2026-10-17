/**
 * Guided walkthrough and the detail panel for a selected mechanism.
 *
 * The walkthrough follows a watt of heat from the room to the cold mass,
 * annotating each step with the resistance it meets and the temperature drop
 * it costs at the current parameters.
 */

import { explain, explainSteps } from '../data/explanations.js';
import { el, replace } from '../utils/dom.js';

/**
 * @param {HTMLElement} host
 * @param {ReturnType<import('../state/store.js').createStore>} store
 */
export function renderExplain(host, store) {
  const { ok, result } = store.derived.calc;
  if (!ok) {
    replace(host, el('p', {
      class: 'panel-note',
      text: 'Fix the parameter errors to walk through the calculation.',
    }));
    return;
  }

  const steps = explainSteps(result);
  const active = Math.min(store.ui.explainStep, steps.length - 1);

  replace(
    host,
    el('div', { class: 'explain-steps', role: 'list' },
      steps.map((step, index) => el('button', {
        class: 'explain-step',
        role: 'listitem',
        type: 'button',
        'aria-current': index === active ? 'true' : 'false',
        onclick: () => store.setUi({ explainStep: index, selectedLayer: step.id }),
      }, [
        el('span', { class: 'step-number', text: String(index + 1) }),
        el('span', {}, [
          el('div', { class: 'step-title', text: step.title }),
          el('div', { class: 'step-value', text: step.value }),
        ]),
      ]))),

    el('div', { class: 'explain-detail' }, [
      el('p', { text: steps[active].detail }),
      el('button', {
        class: 'link',
        type: 'button',
        text: 'Show the physics for this step',
        onclick: () => store.setUi({ selectedLayer: steps[active].id }),
      }),
    ]),
  );
}

/**
 * Detail panel for whichever layer or mechanism is selected.
 *
 * @param {HTMLElement} host
 * @param {HTMLElement} titleHost
 * @param {ReturnType<import('../state/store.js').createStore>} store
 */
export function renderDetail(host, titleHost, store) {
  const { ok, result } = store.derived.calc;

  if (!ok) {
    titleHost.textContent = 'Selected mechanism';
    replace(host, el('p', { class: 'panel-note', text: 'No result to explain.' }));
    return;
  }

  const selected = store.ui.selectedLayer ?? 'vacuum-gap';
  const info = explain(selected, result);
  titleHost.textContent = info.title;

  // The vacuum gap holds two mechanisms; offer them as siblings so the
  // parallel structure is navigable, not just describable.
  const related = {
    'vacuum-gap': [
      ['gas', 'Residual gas'],
      ['radiation', 'Radiation'],
      ['mli', 'MLI'],
    ],
    gas: [['vacuum-gap', 'The gap as a whole'], ['radiation', 'Radiation'], ['mli', 'MLI']],
    radiation: [['vacuum-gap', 'The gap as a whole'], ['gas', 'Residual gas'], ['mli', 'MLI']],
    mli: [['radiation', 'Radiation'], ['gas', 'Residual gas'], ['vacuum-gap', 'The gap as a whole']],
  }[selected] ?? [];

  replace(
    host,
    ...info.body.map((paragraph) => el('p', { text: paragraph, style: { marginTop: '0' } })),

    info.equation ? el('div', { class: 'equation', text: info.equation }) : null,

    info.numbers.length > 0
      ? el('dl', { class: 'info-numbers' }, info.numbers.flatMap(([label, value]) => [
        el('dt', { text: label }),
        el('dd', { text: value }),
      ]))
      : null,

    related.length > 0
      ? el('div', { class: 'button-row', style: { marginTop: '12px' } },
        related.map(([id, label]) => el('button', {
          type: 'button',
          text: label,
          onclick: () => store.setUi({ selectedLayer: id }),
        })))
      : null,

    info.limitations
      ? el('div', { class: 'limitations' }, [
        el('strong', { text: 'Not modelled here: ' }),
        info.limitations,
      ])
      : null,
  );
}
