/**
 * Resistance breakdown.
 *
 * Series resistances add, so their share of the total is meaningful and the
 * bars are drawn to that scale. The vacuum gap has three parallel paths, and
 * their branch resistances emphatically do not add: showing them as slices of
 * the same pie would be wrong. They are drawn instead against the branch
 * that dominates the group, with the combined value shown separately.
 */

import { el, replace } from '../utils/dom.js';
import { percent, sig } from '../utils/format.js';

/**
 * @param {HTMLElement} host
 * @param {ReturnType<import('../state/store.js').createStore>} store
 */
export function renderBreakdown(host, store) {
  const { ok, result } = store.derived.calc;
  if (!ok) {
    replace(host, el('p', { class: 'panel-note', text: 'No result to break down.' }));
    return;
  }

  const seriesTerms = [
    { key: 'R_ambient', label: 'Ambient film', value: result.R_ambient, color: 'var(--convection)' },
    { key: 'R_cond_ow', label: 'Outer wall', value: result.R_cond_ow, color: 'var(--metal-dark)' },
    { key: 'R_vacuum', label: 'Vacuum gap', value: result.R_vacuum, color: 'var(--gas)' },
    { key: 'R_cond_iw', label: 'Inner wall', value: result.R_cond_iw, color: 'var(--metal-dark)' },
    { key: 'R_gap', label: 'Inner gas gap', value: result.R_gap, color: 'var(--cold)' },
  ];

  // Series resistances add, so each one's share of the total is meaningful and
  // the bars are drawn to that share: the bars sum to the whole. Using the
  // largest term instead would make the bar and the number beside it disagree
  // about what they are a fraction of.
  const branchMax = Math.max(result.R_gas, result.R_rad,
    Number.isFinite(result.R_solid_MLI) ? result.R_solid_MLI : 0);

  replace(
    host,

    el('div', { class: 'breakdown' }, [
      ...seriesTerms.map((term) => bar({
        label: term.label,
        value: `${sig(term.value, 3)}`,
        fraction: result.resistance_shares[term.key],
        share: result.resistance_shares[term.key],
        color: term.color,
      })),
    ]),

    el('div', { class: 'status-line', style: { marginTop: '8px' } }, [
      el('span', { text: `Series total ${sig(result.R_total, 4)} K/W` }),
    ]),

    el('h3', {
      class: 'panel-title',
      style: { marginTop: '14px' },
      text: 'Inside the vacuum gap (parallel), K/W',
    }),

    el('div', { class: 'breakdown' }, [
      bar({
        label: 'Residual gas',
        value: sig(result.R_gas, 3),
        fraction: result.R_gas / branchMax,
        share: null,
        color: 'var(--gas)',
        sub: true,
      }),
      bar({
        label: 'Radiation + MLI',
        value: sig(result.R_rad, 3),
        fraction: result.R_rad / branchMax,
        share: null,
        color: 'var(--radiation)',
        sub: true,
      }),
      bar({
        label: 'MLI solid / contact',
        value: Number.isFinite(result.R_solid_MLI) ? sig(result.R_solid_MLI, 3) : 'No blanket',
        fraction: Number.isFinite(result.R_solid_MLI) ? result.R_solid_MLI / branchMax : 0,
        share: null,
        color: 'var(--mli-contact)',
        sub: true,
      }),
    ]),

    el('p', {
      class: 'panel-note',
      text:
        `Combined in parallel: ${sig(result.R_vacuum, 3)} K/W, which is smaller than any `
        + 'active branch. Because they are parallel, these cannot be read as shares of a total; '
        + `what they do split is the heat crossing the gap, ${percent(result.gas_fraction)} `
        + `through the gas, ${percent(result.radiation_fraction)} by radiation, and `
        + `${percent(result.fraction_solid_MLI)} through MLI contact conduction.`,
    }),
  );
}

function bar({ label, value, fraction, share, color, sub = false }) {
  return el('div', { class: `breakdown-row${sub ? ' sub' : ''}` }, [
    el('span', { class: 'name', text: label }),
    el('div', { class: 'bar-track' }, [
      el('div', {
        class: 'bar',
        style: {
          width: `${fraction > 0 ? Math.max(Math.min(fraction * 100, 100), 0.5) : 0}%`,
          background: color,
          opacity: sub ? '0.55' : '0.8',
        },
      }),
    ]),
    el('span', {
      class: 'num',
      title: value === 'No blanket' ? value : `${value} K/W`,
      text: share === null ? value : percent(share),
    }),
  ]);
}
