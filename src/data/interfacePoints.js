/**
 * The four solved interface temperatures, plus the two fixed boundaries.
 *
 * Single source of truth for how these points are named and coloured. The
 * results table, the temperature plot and the cross-section callouts all read
 * this list, so the same quantity carries the same colour and the same wording
 * everywhere it appears.
 *
 * The colours are series identities, not a temperature scale: T3 is not drawn
 * green because it is warm, it is drawn green because that is T3's colour on
 * every chart in the application.
 */

/**
 * @typedef {object} InterfacePoint
 * @property {string} key      Result field, or the input field for a boundary
 * @property {string} symbol   Short label, or an em dash for a boundary
 * @property {string} name     Where the temperature is
 * @property {string} where    What the surface faces
 * @property {string} color    Series colour, as a CSS custom property
 * @property {boolean} solved  False for the two fixed boundaries
 */

/** @type {InterfacePoint[]} */
export const INTERFACE_POINTS = [
  {
    key: 'T_amb',
    symbol: '—',
    name: 'Ambient',
    where: 'fixed boundary',
    color: 'var(--warm)',
    solved: false,
  },
  {
    key: 'T1',
    symbol: 'T1',
    name: 'Outer Wall, Outer Radius',
    where: 'convection and radiation',
    color: 'var(--warm)',
    solved: true,
  },
  {
    key: 'T2',
    symbol: 'T2',
    name: 'Outer Wall, Inner Radius',
    where: 'faces the vacuum gap',
    color: 'var(--convection)',
    solved: true,
  },
  {
    key: 'T3',
    symbol: 'T3',
    name: 'Inner Wall, Outer Radius',
    where: 'faces the vacuum gap',
    color: 'var(--regime-transition)',
    solved: true,
  },
  {
    key: 'T4',
    symbol: 'T4',
    name: 'Inner Wall, Inner Radius',
    where: 'faces the inner gas gap',
    color: 'var(--cold)',
    solved: true,
  },
  {
    key: 'T_cold',
    symbol: '—',
    name: 'Copper former, outer surface',
    where: 'prescribed model boundary',
    color: 'var(--cold)',
    solved: false,
  },
];

/** The four solved interfaces, in order from warm to cold. */
export const SOLVED_INTERFACES = INTERFACE_POINTS.filter((p) => p.solved);

/**
 * Temperature at an interface point, taking boundaries from the inputs and
 * solved interfaces from the result.
 * @param {InterfacePoint} point
 * @param {import('../model/solver.js').ModelResult & Record<string, any>} result
 * @returns {number} [K]
 */
export function temperatureAt(point, result) {
  return point.solved ? result[point.key] : result.inputs[point.key];
}
