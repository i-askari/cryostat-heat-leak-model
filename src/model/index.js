/**
 * Public surface of the physics model.
 *
 * Nothing in this folder imports from the UI, the visualisation or the plots:
 * the model runs standalone under any ES-module runtime, which is what makes
 * the headless regression tests in tests/ possible.
 */

export {
  COPPER_COOLANT_OFFSET,
  DEFAULT_INPUTS,
  KN_CONTINUUM_MAX,
  KN_MOLECULAR_MIN,
  MLI_SWEEP_LAYERS,
  MLI_SWEEP_PRESSURE,
  SIGMA,
  SWEEP_P_MAX,
  SWEEP_P_MIN,
  TORR_TO_PA,
  K_B,
} from './constants.js';

export {
  classifyRegime,
  effectiveGasConductivity,
  innerGapConductivity,
  meanFreePathFitted,
  meanFreePathKinetic,
  regimeBoundaryPressures,
  regimeLabel,
} from './gas.js';

export { resolveGeometry, validateInputs } from './geometry.js';

export {
  ambientResistance,
  cylindricalConductionResistance,
  innerGapResistance,
  parallel,
  radiationResistance,
  series,
  solidMliResistance,
  vacuumGasResistance,
} from './resistances.js';

export { calculateCryostat, solve } from './solver.js';

export {
  findPressureForHeatLeak,
  logspace,
  mliSweep,
  parameterSweep,
  pressureSweep,
} from './sweeps.js';

export * as units from './units.js';
