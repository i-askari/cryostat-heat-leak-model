/**
 * Physical constants, Knudsen-regime thresholds and the default parameter set.
 *
 * Values are SI. Adjustable defaults are synthetic illustrations, not a
 * measured device or an engineering recommendation.
 */

/** Stefan-Boltzmann constant [W/(m^2 K^4)] */
export const SIGMA = 5.670374419e-8;

/** Boltzmann constant [J/K] */
export const K_B = 1.380649e-23;

/** 1 Torr expressed in Pa. */
export const TORR_TO_PA = 133.322;

/**
 * Knudsen-number thresholds separating the three gas-transport regimes.
 * Kn < 0.01 continuum, Kn > 10 free molecular, otherwise transition.
 */
export const KN_CONTINUUM_MAX = 0.01;
export const KN_MOLECULAR_MIN = 10.0;

/** @typedef {'continuum'|'transition'|'free-molecular'} Regime */

/**
 * Illustrative inputs, SI units.
 *
 * The geometry is expressed as a copper radius plus a stack of positive
 * thicknesses rather than five independent radii: that representation cannot
 * describe a self-intersecting cryostat, so an entire class of invalid input
 * is unrepresentable rather than merely rejected.
 *
 * @typedef {object} ModelInputs
 * @property {number} r_cu           Copper cold-mass outer radius [m]
 * @property {number} d_inner_gap    Copper to inner-wall gas gap thickness [m]
 * @property {number} t_inner_wall   Inner aluminium wall thickness [m]
 * @property {number} d_vacuum_gap   Main vacuum gap thickness [m]
 * @property {number} t_outer_wall   Outer aluminium wall thickness [m]
 * @property {number} length         Modelled axial length [m]
 * @property {number} T_amb          Ambient boundary temperature [K]
 * @property {number} T_cold         Cold boundary (copper) temperature [K]
 * @property {number} P_vacuum       Main vacuum gap pressure [Pa]
 * @property {number} P_inner_gap    Inner gas gap pressure, held fixed [Pa]
 * @property {number} n_mli          Number of MLI layers in the vacuum gap [-]
 * @property {number} k_outer_wall   Outer wall thermal conductivity [W/(m K)]
 * @property {number} k_inner_wall   Inner wall thermal conductivity [W/(m K)]
 * @property {number} eps_al         Emissivity of all radiating metal surfaces [-]
 * @property {number} k_air          Continuum air conductivity [W/(m K)]
 * @property {number} h_conv         External natural convection coefficient [W/(m^2 K)]
 * @property {number} C              Gas-model accommodation / bridging constant [-]
 * @property {number} d_air          Effective air molecule diameter [m]
 * @property {number} T_inner_gap    Representative inner-gap gas temperature [K]
 * @property {number} mfp_coefficient Main-gap mean free path coefficient [m Pa]
 * @property {number} max_iterations Solver iteration cap [-]
 * @property {number} tolerance      Interface temperature convergence tolerance [K]
 */

/** @type {ModelInputs} */
export const DEFAULT_INPUTS = Object.freeze({
  // Geometry [m]
  r_cu: 0.008,
  d_inner_gap: 0.006,
  t_inner_wall: 0.002,
  d_vacuum_gap: 0.020,
  t_outer_wall: 0.002,
  length: 1.2,

  // Boundary temperatures [K]
  T_amb: 300.0,
  T_cold: 90.0,

  // Vacuum [Pa]
  P_vacuum: 0.2,
  P_inner_gap: 10.0,

  // MLI
  n_mli: 16,

  // Materials and surfaces
  k_outer_wall: 205.0,
  k_inner_wall: 190.0,
  eps_al: 0.10,
  k_air: 0.025,
  h_conv: 8.0,

  // Advanced gas-model parameters
  C: 2.5,
  d_air: 3.6e-10,
  T_inner_gap: 110.0,
  mfp_coefficient: 0.006,

  // Solver
  max_iterations: 60,
  tolerance: 1e-6,
});

/** Illustrative fixed pressure used for the MLI sweep [Pa]. */
export const MLI_SWEEP_PRESSURE = 0.75;

/** MLI layer counts used by the MLI sweep. */
export const MLI_SWEEP_LAYERS = [0, 8, 16, 24, 32, 40, 48, 56, 64];

/** Pressure sweep bounds [Pa]. */
export const SWEEP_P_MIN = 1e-6;
export const SWEEP_P_MAX = 100000;
