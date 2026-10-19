/**
 * Application state.
 *
 * One store holds the model inputs and the small amount of interface state
 * (which layer is selected, which analysis tab is open). Views subscribe and
 * re-render; nothing else keeps a copy of a parameter, so the picture, the
 * numbers and the plots cannot disagree about what is being modelled.
 *
 * Derived model output is memoised per computation, keyed by the inputs it
 * actually depends on: a sweep over pressure is invalidated by any parameter
 * change except the pressure it sweeps.
 */

import { DEFAULT_INPUTS, MLI_SWEEP_LAYERS, MLI_SWEEP_PRESSURE } from '../model/constants.js';
import { calculateCryostat } from '../model/solver.js';
import { mliSweep, pressureSweep } from '../model/sweeps.js';

/** Keys that are part of the shareable parameter set. */
const INPUT_KEYS = Object.keys(DEFAULT_INPUTS);

/** Short names for the URL, so a shared link stays readable. */
const URL_KEYS = {
  r_cu: 'rcu', d_inner_gap: 'dig', t_inner_wall: 'tiw', d_vacuum_gap: 'dvg',
  t_outer_wall: 'tow', length: 'L', T_amb: 'Ta', T_cold: 'Tc', P_vacuum: 'Pv',
  P_inner_gap: 'Pi', n_mli: 'N', k_outer_wall: 'kow', k_inner_wall: 'kiw',
  eps_al: 'eps', k_air: 'ka', h_conv: 'h', C: 'C', d_air: 'da',
  T_inner_gap: 'Tg', mfp_coefficient: 'mfp',
};

/**
 * @typedef {object} UiState
 * @property {string|null} selectedLayer  Cross-section layer / mechanism id
 * @property {string} analysisTab
 * @property {number} explainStep
 * @property {number} targetHeatLeak      User-set target for the inverse lookup [W/m]
 * @property {'current'|'reference'} mliSweepPressure
 */

export function createStore() {
  /** @type {import('../model/constants.js').ModelInputs} */
  let inputs = { ...DEFAULT_INPUTS, ...readInputsFromUrl() };

  /** @type {UiState} */
  let ui = {
    selectedLayer: 'vacuum-gap',
    analysisTab: 'pressure',
    explainStep: 0,
    targetHeatLeak: 2.2,
    mliSweepPressure: 'current',
  };

  /** @type {Set<Function>} */
  const listeners = new Set();

  // --- memo caches -----------------------------------------------------

  const memo = {
    calc: makeMemo(),
    pressureSweep: makeMemo(),
    mliSweep: makeMemo(),
    sensitivity: makeMemo(),
  };

  function makeMemo() {
    return { key: null, value: null };
  }

  /**
   * Build a cache key from the inputs a computation depends on. Listing the
   * excluded keys explicitly, rather than hashing everything, is what makes
   * the memo both correct and useful: miss a dependency and results go stale.
   */
  function keyExcept(excluded = []) {
    return INPUT_KEYS
      .filter((k) => !excluded.includes(k))
      .map((k) => `${k}=${inputs[k]}`)
      .join('|');
  }

  function cached(slot, key, compute) {
    if (slot.key !== key) {
      slot.key = key;
      slot.value = compute();
    }
    return slot.value;
  }

  // --- derived ---------------------------------------------------------

  const derived = {
    /** Single-point solve for the current parameters. */
    get calc() {
      return cached(memo.calc, keyExcept(), () => calculateCryostat(inputs));
    },

    /**
     * One pressure sweep powers the heat-leak curve, the temperature
     * profiles, the branch fractions and the resistance curves.
     */
    get pressureSweep() {
      if (!derived.calc.ok) return [];
      return cached(memo.pressureSweep, keyExcept(['P_vacuum']), () =>
        pressureSweep(inputs, { count: 240 }));
    },

    get mliSweep() {
      if (!derived.calc.ok) return { pressure: 0, points: [] };
      const useReference = ui.mliSweepPressure === 'reference';
      const pressure = useReference ? MLI_SWEEP_PRESSURE : inputs.P_vacuum;
      const key = `${keyExcept(['n_mli', 'P_vacuum'])}|P=${pressure}`;
      return cached(memo.mliSweep, key, () => ({
        pressure,
        points: mliSweep(inputs, { layers: MLI_SWEEP_LAYERS, pressure }),
      }));
    },

    /**
     * One-at-a-time sensitivity: how much does Q move if each parameter is
   * scaled by +/- 20 percent, everything else held fixed? MLI is discrete:
   * perturb by at least one whole layer, clamped at zero on the low side.
     */
    get sensitivity() {
      if (!derived.calc.ok) return [];
      return cached(memo.sensitivity, keyExcept(), () => computeSensitivity(inputs));
    },
  };

  // --- mutations -------------------------------------------------------

  function notify() {
    for (const listener of listeners) listener();
  }

  return {
    get inputs() { return inputs; },
    get ui() { return ui; },
    derived,

    /**
     * @param {string} key
     * @param {number} value
     */
    setInput(key, value) {
      if (inputs[key] === value) return;
      inputs = { ...inputs, [key]: value };
      scheduleUrlWrite(() => inputs);
      notify();
    },

    /** @param {Partial<import('../model/constants.js').ModelInputs>} patch */
    setInputs(patch) {
      inputs = { ...inputs, ...patch };
      scheduleUrlWrite(() => inputs);
      notify();
    },

    /** @param {Partial<UiState>} patch */
    setUi(patch) {
      ui = { ...ui, ...patch };
      notify();
    },

    reset() {
      inputs = { ...DEFAULT_INPUTS };
      scheduleUrlWrite(() => inputs);
      notify();
    },

    /** @param {Function} listener @returns {Function} unsubscribe */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    shareableUrl() {
      const url = new URL(window.location.href);
      url.hash = encodeInputs(inputs);
      return url.toString();
    },
  };
}

/**
 * Parameters ranked by how much a +/- 20 percent change moves the heat leak.
 * @param {import('../model/constants.js').ModelInputs} inputs
 */
function computeSensitivity(inputs) {
  const base = calculateCryostat(inputs);
  if (!base.ok || !base.result.converged) return [];
  const Q0 = base.result.Q_per_length;

  /** @type {{key: string, label: string}[]} */
  const candidates = [
    { key: 'P_vacuum', label: 'Vacuum pressure' },
    { key: 'n_mli', label: 'MLI layers' },
    { key: 'eps_al', label: 'Emissivity' },
    { key: 'd_vacuum_gap', label: 'Vacuum gap' },
    { key: 'd_inner_gap', label: 'Inner gas gap' },
    { key: 'P_inner_gap', label: 'Inner gap pressure' },
    { key: 'T_cold', label: 'Copper boundary' },
    { key: 'T_amb', label: 'Ambient' },
    { key: 'h_conv', label: 'Convection coeff.' },
    { key: 'r_cu', label: 'Copper outer radius' },
    { key: 'C', label: 'Gas constant C' },
    { key: 'k_air', label: 'Main-gap air conductivity' },
    { key: 'mfp_coefficient', label: 'Mean free path coefficient' },
    { key: 'T_inner_gap', label: 'Inner-gap gas temperature' },
    { key: 'd_air', label: 'Molecular diameter' },
    { key: 't_inner_wall', label: 'Inner wall thickness' },
    { key: 't_outer_wall', label: 'Outer wall thickness' },
    { key: 'k_outer_wall', label: 'Outer wall conductivity' },
    { key: 'k_inner_wall', label: 'Inner wall conductivity' },
  ];

  const out = [];
  for (const { key, label } of candidates) {
    const nominal = inputs[key];
    const layerStep = key === 'n_mli' ? Math.max(1, Math.round(nominal * 0.2)) : null;
    const lowValue = layerStep === null ? nominal * 0.8 : Math.max(0, nominal - layerStep);
    const highValue = layerStep === null ? nominal * 1.2 : nominal + layerStep;
    const low = perturb(inputs, key, lowValue);
    const high = perturb(inputs, key, highValue);
    if (low === null || high === null) continue;

    out.push({
      key,
      label,
      nominal,
      lowValue,
      highValue,
      low: low - Q0,
      high: high - Q0,
      span: Math.abs(high - low),
    });
  }

  return out.sort((a, b) => b.span - a.span);
}

function perturb(inputs, key, value) {
  const patched = { ...inputs, [key]: value };
  const out = calculateCryostat(patched);
  return out.ok && out.result.converged ? out.result.Q_per_length : null;
}

// --- URL round-trip ----------------------------------------------------

/** @param {import('../model/constants.js').ModelInputs} inputs @returns {string} */
function encodeInputs(inputs) {
  const parts = [];
  for (const [key, short] of Object.entries(URL_KEYS)) {
    if (inputs[key] !== DEFAULT_INPUTS[key]) {
      parts.push(`${short}=${formatForUrl(inputs[key])}`);
    }
  }
  return parts.join('&');
}

function formatForUrl(value) {
  // JavaScript's shortest round-tripping representation preserves the value.
  return String(value);
}

/** @returns {Partial<import('../model/constants.js').ModelInputs>} */
function readInputsFromUrl() {
  if (typeof window === 'undefined' || !window.location.hash) return {};

  const byShort = Object.fromEntries(
    Object.entries(URL_KEYS).map(([long, short]) => [short, long]),
  );

  /** @type {Record<string, number>} */
  const out = {};
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  for (const [short, raw] of params) {
    const key = byShort[short];
    if (!key) continue;
    const value = Number(raw);
    // A malformed link should fall back to the default rather than poison the
    // model with NaN.
    if (Number.isFinite(value)) out[key] = value;
  }

  return out;
}

/**
 * Coalesce URL writes.
 *
 * A slider drag emits an input event per pointer move, and browsers rate-limit
 * the History API: Safari throws after 100 replaceState calls in 30 seconds,
 * which a couple of drags would reach. The URL only has to be correct once the
 * user stops moving, so writes are deferred until the parameters settle.
 *
 * @param {() => import('../model/constants.js').ModelInputs} latest
 */
let urlWriteTimer = null;

function scheduleUrlWrite(latest) {
  if (typeof window === 'undefined' || typeof setTimeout !== 'function') return;
  if (urlWriteTimer !== null) clearTimeout(urlWriteTimer);
  urlWriteTimer = setTimeout(() => {
    urlWriteTimer = null;
    writeInputsToUrl(latest());
  }, 350);
}

function writeInputsToUrl(inputs) {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  const encoded = encodeInputs(inputs);
  const url = `${window.location.pathname}${window.location.search}${encoded ? `#${encoded}` : ''}`;
  try {
    window.history.replaceState(null, '', url);
  } catch {
    // A throttled or blocked History API must not take the application down;
    // the parameters are still live, only the shareable link falls behind.
  }
}
