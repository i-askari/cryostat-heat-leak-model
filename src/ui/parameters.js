/**
 * Parameter panel.
 *
 * Controls are grouped by what the engineer is thinking about rather than by
 * where the symbol appears in the equations, and the groups that hold
 * advanced model assumptions start collapsed.
 *
 * Geometry is entered as a cold-mass radius plus a stack of thicknesses. The
 * radii that the equations and the drawing use are derived from that stack and
 * shown read-only underneath, so the panel cannot express a cryostat whose
 * walls pass through each other.
 *
 * The panel is built once and then patched. Rebuilding it on every render
 * would destroy the input the user is typing into or dragging.
 */

import { resolveGeometry } from '../model/geometry.js';
import { COPPER_COOLANT_OFFSET } from '../model/constants.js';
import { milliTorrToPa, mmToM, mToMm, paToMilliTorr } from '../model/units.js';
import { el, replace } from '../utils/dom.js';
import { millimetres, sig } from '../utils/format.js';
import { control, derivedRow, group } from './controls.js';

const mm = { toDisplay: mToMm, fromDisplay: mmToM, unit: 'mm', decimals: 2 };
const mtorr = {
  toDisplay: paToMilliTorr, fromDisplay: milliTorrToPa, unit: 'mTorr', scale: 'log', decimals: 4,
};

/** @type {import('./controls.js').ControlSpec[]} */
const GEOMETRY = [
  { key: 'r_cu', label: 'Copper former outer radius', min: 1, max: 60, step: 0.5, ...mm },
  { key: 'd_inner_gap', label: 'Inner gas gap', min: 0.5, max: 40, step: 0.5, ...mm },
  { key: 't_inner_wall', label: 'Inner wall thickness', min: 0.2, max: 20, step: 0.1, ...mm },
  { key: 'd_vacuum_gap', label: 'Vacuum gap', min: 1, max: 100, step: 0.5, ...mm },
  { key: 't_outer_wall', label: 'Outer wall thickness', min: 0.2, max: 20, step: 0.1, ...mm },
  {
    key: 'length', label: 'Modelled length', unit: 'm', min: 0.1, max: 20, step: 0.1, decimals: 2,
    hint: 'Every resistance scales as 1/L, so W/m does not depend on this.',
  },
];

/** @type {import('./controls.js').ControlSpec[]} */
const THERMAL = [
  { key: 'T_amb', label: 'Ambient temperature', unit: 'K', min: 200, max: 400, step: 1, decimals: 1 },
  {
    key: 'T_cold', label: 'LN₂ coolant temperature', unit: 'K', min: 4, max: 290, step: 0.1, decimals: 2,
    toDisplay: (v) => v - COPPER_COOLANT_OFFSET,
    fromDisplay: (v) => v + COPPER_COOLANT_OFFSET,
    hint: 'The modeled boundary is the copper outer surface, prescribed 0.01 K above this coolant temperature. The copper temperature profile is not solved.',
  },
];

/** @type {import('./controls.js').ControlSpec[]} */
const VACUUM = [
  { key: 'P_vacuum', label: 'Main vacuum-gap pressure', min: 1e-6, max: 7.6e5, ...mtorr },
  {
    key: 'P_inner_gap', label: 'Inner gap pressure', min: 1e-3, max: 7.6e5, ...mtorr,
    hint: 'Held fixed: this volume is not swept with the main vacuum.',
  },
  {
    key: 'T_inner_gap', label: 'Inner gap gas temp.', unit: 'K', min: 20, max: 300, step: 1,
    decimals: 1, hint: 'Representative temperature for inner-gap mean free path and gas conductivity.',
  },
];

/** @type {import('./controls.js').ControlSpec[]} */
const INSULATION = [
  {
    key: 'n_mli', label: 'MLI layers', unit: 'layers', min: 0, max: 120, step: 1,
    integer: true, decimals: 0,
  },
  {
    key: 'eps_al', label: 'Surface emissivity', unit: '—', min: 0.01, max: 1, step: 0.01,
    decimals: 3, hint: 'Applied to every radiating metal surface, including each MLI layer.',
  },
];

/** @type {import('./controls.js').ControlSpec[]} */
const MATERIALS = [
  { key: 'k_outer_wall', label: 'Outer wall k', unit: 'W/mK', min: 1, max: 400, step: 1, decimals: 1 },
  { key: 'k_inner_wall', label: 'Inner wall k', unit: 'W/mK', min: 1, max: 400, step: 1, decimals: 1 },
  {
    key: 'k_air', label: 'Main-gap gas conductivity', unit: 'W/mK',
    min: 0.005, max: 0.2, step: 0.001, decimals: 4,
    hint: 'The inner gap uses its own temperature-dependent gas conductivity.',
  },
  { key: 'h_conv', label: 'External h', unit: 'W/m²K', min: 1, max: 50, step: 0.5, decimals: 1 },
];

/** @type {import('./controls.js').ControlSpec[]} */
const ADVANCED = [
  {
    key: 'C', label: 'Gas constant C', unit: '—', min: 0.5, max: 10, step: 0.1, decimals: 2,
    hint: 'Accommodation / bridging constant; usually quoted as order 1 to 3.',
  },
  {
    key: 'mfp_coefficient', label: 'Mean free path coeff.', unit: 'm·Pa',
    min: 0.001, max: 0.02, step: 0.0001, decimals: 4,
    hint: 'Vacuum gap uses lambda = coefficient / P.',
  },
  {
    key: 'd_air', label: 'Molecular diameter', unit: 'nm',
    toDisplay: (v) => v * 1e9, fromDisplay: (v) => v * 1e-9,
    min: 0.2, max: 1.0, step: 0.01, decimals: 3,
    hint: 'Used by the kinetic-theory mean free path in the inner gap.',
  },
];

/** Radii shown read-only beneath the geometry controls. */
const DERIVED_RADII = [
  ['Copper former outer radius', 'r_cu'],
  ['Inner wall bore', 'r_in_in'],
  ['Inner wall outside', 'r_in_ow'],
  ['Outer wall bore', 'r_ow_in'],
  ['Outer wall outside', 'r_ow_ow'],
];

/** @type {{host: Element, update: Function}|null} */
let mounted = null;

/**
 * @param {HTMLElement} host
 * @param {ReturnType<import('../state/store.js').createStore>} store
 */
export function renderParameters(host, store) {
  if (!mounted || mounted.host !== host) {
    mounted = mount(host, store);
  }
  mounted.update();
}

function mount(host, store) {
  /** @type {Map<string, import('./controls.js').MountedControl>} */
  const controls = new Map();

  const build = (spec) => {
    const mountedControl = control(
      spec,
      store.inputs[spec.key],
      (value) => store.setInput(spec.key, value),
    );
    controls.set(spec.key, mountedControl);
    return mountedControl.node;
  };

  const radiiRows = DERIVED_RADII.map(([label]) => derivedRow(label, ''));
  const pressureRows = [
    derivedRow('Vacuum gap, in Pa', ''),
    derivedRow('Inner gap, in Pa', ''),
  ];
  const copperTemperatureRow = derivedRow('Copper outer surface (prescribed)', '');

  replace(
    host,
    group('Geometry', [
      ...GEOMETRY.map(build),
      el('div', { style: { marginTop: '8px' } }, radiiRows.map((r) => r.node)),
    ]),

    group('Boundary conditions', [...THERMAL.map(build), copperTemperatureRow.node]),

    group('Vacuum', [
      ...VACUUM.map(build),
      // The controls above are in mTorr; the model works in Pa, and the
      // equations are quoted in Pa, so both are shown.
      el('div', { style: { marginTop: '8px' } }, pressureRows.map((r) => r.node)),
    ]),

    group('Insulation', INSULATION.map(build)),

    group('Materials and surfaces', MATERIALS.map(build), false),

    group('Advanced model parameters', [
      el('p', {
        class: 'panel-note',
        style: { marginTop: '0' },
        text:
          'Illustrative gas-model assumptions, not calibrated measurements. '
          + 'They change the answer, so they are exposed rather than hidden.',
      }),
      ...ADVANCED.map(build),
    ], false),
  );

  const update = () => {
    const { inputs } = store;
    const errorKeys = new Set(store.derived.calc.errors.map((e) => e.key));

    for (const [key, mountedControl] of controls) {
      mountedControl.update(inputs[key], errorKeys.has(key));
    }

    const geom = resolveGeometry(inputs);
    DERIVED_RADII.forEach(([, radiusKey], i) => {
      radiiRows[i].set(`${millimetres(geom[radiusKey])} mm`);
    });

    pressureRows[0].set(`${sig(inputs.P_vacuum, 3)} Pa`);
    pressureRows[1].set(`${sig(inputs.P_inner_gap, 3)} Pa`);
    copperTemperatureRow.set(Number.isFinite(inputs.T_cold) ? `${inputs.T_cold.toFixed(2)} K` : '—');
  };

  return { host, update };
}
