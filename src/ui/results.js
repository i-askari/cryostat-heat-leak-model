/**
 * Results panel.
 *
 * The heat leak comes first and largest, because it is the answer; everything
 * else is supporting detail. Validation errors replace the numbers entirely
 * rather than sitting beside stale ones.
 *
 * The readout is rebuilt on each render, which is safe because it contains no
 * focusable text field. The target-lookup block does contain one, so it is
 * built once and patched: rebuilding it would drop the caret mid-entry and
 * rewrite a partial number such as "1." the moment it parsed.
 */

import { regimeLabel } from '../model/gas.js';
import { findPressureForHeatLeak } from '../model/sweeps.js';
import { INTERFACE_POINTS, temperatureAt } from '../data/interfacePoints.js';
import { el, replace } from '../utils/dom.js';
import { percent, pressure as formatPressure, sig, temperature } from '../utils/format.js';

/** @type {{host: Element, readout: HTMLElement, target: any}|null} */
let mounted = null;

/**
 * @param {HTMLElement} host
 * @param {ReturnType<import('../state/store.js').createStore>} store
 */
export function renderResults(host, store) {
  if (!mounted || mounted.host !== host) {
    const readout = el('div');
    const target = mountTargetLookup(store);
    replace(host, readout, target.node);
    mounted = { host, readout, target };
  }

  const { ok, result, errors, warnings } = store.derived.calc;

  if (!ok) {
    replace(mounted.readout, el('div', { class: 'messages' }, [
      ...errors.map((e) => el('div', { class: 'message error', text: e.message })),
      el('p', {
        class: 'panel-note',
        text: 'The model cannot be evaluated until these are resolved.',
      }),
    ]));
    mounted.target.update();
    return;
  }

  const inputs = store.inputs;

  replace(
    mounted.readout,

    // --- headline ------------------------------------------------------
    el('div', { class: 'result-headline' }, [
      el('span', { class: 'value', text: sig(result.Q_per_length, 3) }),
      el('span', { class: 'unit', text: 'W/m' }),
      el('span', {
        class: 'secondary',
        text: `${sig(result.Q, 3)} W into the copper boundary over ${sig(inputs.length, 3)} m`,
      }),
    ]),

    warnings.length > 0
      ? el('div', { class: 'messages', style: { marginTop: '10px' } },
        warnings.map((w) => el('div', { class: 'message warning', text: w.message })))
      : null,

    // --- key numbers ---------------------------------------------------
    el('dl', { class: 'result-grid', style: { marginTop: '12px' } }, [
      row('Total resistance', `${sig(result.R_total, 4)} K/W`),
      row('Driving difference', `${sig(result.driving_difference, 4)} K`),
      row('Main vacuum pressure', formatPressure(inputs.P_vacuum).combined),
      row('Main-gap Knudsen number', sig(result.Kn, 3)),
      rowNode('Main-gap gas regime', el('span', {
        class: `badge ${result.regime}`,
        text: regimeLabel(result.regime),
      })),
      row('Inner-gap pressure', formatPressure(inputs.P_inner_gap).combined),
      row('Inner-gap gas temperature', `${temperature(inputs.T_inner_gap)} K`),
      row('Inner-gap Knudsen number', sig(result.Kn_gap, 3)),
      rowNode('Inner-gap gas regime', el('span', {
        class: `badge ${result.regime_gap}`,
        text: regimeLabel(result.regime_gap),
      })),
      row('Inner-gap gas resistance', `${sig(result.R_gap, 3)} K/W`),
      row('MLI layers', String(inputs.n_mli)),
      row('Heat via residual gas', `${sig(result.Q_gas, 3)} W  (${percent(result.gas_fraction)})`),
      row('Heat via radiation', `${sig(result.Q_rad_vacuum, 3)} W  (${percent(result.radiation_fraction)})`),
      row('Heat via MLI contact', `${sig(result.Q_solid_MLI, 3)} W  (${percent(result.fraction_solid_MLI)})`),
    ]),

    // --- temperatures --------------------------------------------------
    el('h3', {
      class: 'panel-title',
      style: { marginTop: '16px' },
      text: 'Interface temperatures',
    }),
    temperatureTable(result),
    el('p', {
      class: 'panel-note',
      text: 'The copper outer surface is the prescribed model boundary. The 0.01 K coolant-to-surface difference is imposed, not a calculated copper temperature drop or a separately calculated coolant heat load.',
    }),

    // --- solver status -------------------------------------------------
    el('div', { class: 'status-line', style: { marginTop: '12px' } }, [
      el('span', { text: result.converged ? 'converged' : 'NOT CONVERGED' }),
      el('span', { text: `${result.iterations} iterations` }),
      el('span', { text: `tol ${inputs.tolerance} K` }),
    ]),
  );

  mounted.target.update();
}

function row(label, value) {
  return rowNode(label, el('span', { text: value }));
}

function rowNode(label, valueNode) {
  return el('div', { class: 'result-row' }, [
    el('dt', { text: label }),
    el('dd', {}, [valueNode]),
  ]);
}

function temperatureTable(result) {
  return el('table', { class: 'temperature-table' }, [
    el('thead', {}, [
      el('tr', {}, [
        el('th', { text: '' }),
        el('th', { text: 'Location' }),
        el('th', { text: 'K', style: { textAlign: 'right' } }),
      ]),
    ]),
    el('tbody', {}, [...INTERFACE_POINTS.map((point) =>
      el('tr', {}, [
        el('td', { class: 'mono', text: point.symbol }),
        el('td', {}, [
          el('span', { class: 'swatch', style: { background: point.color } }),
          point.name,
          el('div', { class: 'location', text: point.where }),
        ]),
        el('td', { class: 'num', text: point.key === 'T_cold'
          ? result.T_copper_outer.toFixed(2) : temperature(temperatureAt(point, result)) }),
      ])),
    el('tr', {}, [
      el('td', { class: 'mono', text: '—' }),
      el('td', {}, ['LN₂ coolant channel', el('div', { class: 'location', text: 'prescribed separately' })]),
      el('td', { class: 'num', text: result.T_coolant.toFixed(2) }),
    ])]),
  ]);
}

/**
 * Inverse lookup: what vacuum does a chosen heat leak require?
 *
 * The target is whatever the user types. There is no built-in "correct"
 * value: an acceptable heat leak is a property of a particular system, not
 * of this model.
 */
function mountTargetLookup(store) {
  const input = el('input', {
    type: 'number',
    value: String(store.ui.targetHeatLeak),
    step: '0.1',
    min: '0',
    style: { width: '74px' },
    'aria-label': 'Target heat leak in watts per metre',
    oninput: (event) => {
      const value = Number(event.target.value);
      store.setUi({ targetHeatLeak: event.target.value.trim() === '' ? NaN : value });
    },
  });

  const output = el('div');

  const node = el('div', { style: { marginTop: '16px' } }, [
    el('h3', { class: 'panel-title', text: 'Required vacuum for a target' }),
    el('div', {
      class: 'control',
      style: { gridTemplateColumns: '1fr auto', paddingTop: '0' },
    }, [
      el('label', { text: 'Target heat leak' }),
      el('span', { class: 'control-value' }, [input, el('span', { class: 'unit', text: 'W/m' })]),
    ]),
    output,
    el('p', {
      class: 'panel-note',
      text: 'Searches each gas regime separately; if multiple matches exist, the lowest pressure is shown.',
    }),
  ]);

  const update = () => {
    if (document.activeElement !== input) {
      input.value = String(store.ui.targetHeatLeak);
    }

    if (!store.derived.calc.ok) {
      replace(output, el('p', {
        class: 'panel-note',
        text: 'Unavailable until the parameters are valid.',
      }));
      return;
    }

    const found = findPressureForHeatLeak(store.inputs, store.ui.targetHeatLeak);

    replace(
      output,
      found.found
        ? el('dl', { class: 'result-grid' }, [
          row('Required pressure', formatPressure(found.pressure).combined),
          row('Knudsen number there', sig(found.result.Kn, 3)),
          rowNode('Regime there', el('span', {
            class: `badge ${found.result.regime}`,
            text: regimeLabel(found.result.regime),
          })),
        ])
        : el('p', { class: 'panel-note', text: found.reason }),
    );
  };

  return { node, update };
}
