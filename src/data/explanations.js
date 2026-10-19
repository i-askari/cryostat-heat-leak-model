/**
 * Physics explanations.
 *
 * Each entry pairs the governing equation with the numbers the model is
 * currently using, so the text is never a general description floating free
 * of the state on screen. Written for someone who knows introductory physics
 * but has not read the code.
 *
 * Every entry also states what it does not model. That is the part most
 * likely to matter to somebody deciding whether to trust a number.
 */

import { millimetres, percent, pressure, sig, temperature } from '../utils/format.js';

/**
 * @typedef {object} Explanation
 * @property {string} title
 * @property {string[]} body        Paragraphs
 * @property {string} [equation]    Monospace equation block
 * @property {[string, string][]} numbers  Label / value pairs from the current solve
 * @property {string} limitations
 */

/**
 * @param {string} id
 * @param {import('../model/solver.js').ModelResult & Record<string, any>} r
 * @returns {Explanation}
 */
export function explain(id, r) {
  const inputs = r.inputs;
  const geom = r.geometry;

  switch (id) {
    case 'ambient':
      return {
        title: 'Ambient: convection and radiation',
        body: [
          'Heat reaches the cryostat from the room by two routes at once. Air moves past the '
          + 'outer wall and carries heat to it, and the room radiates at the wall. Because '
          + 'both act between the same two points, their conductances add and the pair behaves '
          + 'as one resistance smaller than either branch alone.',
          'The radiative term is linearised: the difference of fourth powers is factored so '
          + 'that radiation can be written as a conductance multiplying a temperature '
          + 'difference, like every other element in the network. The factorisation is exact; '
          + 'the approximation is only that the conductance is re-evaluated once per '
          + 'iteration rather than solved in closed form.',
        ],
        equation:
          'G_conv = 2 pi r_o h L\n'
          + 'G_rad  = 2 pi r_o L sigma eps (T_s^2 + T_amb^2)(T_s + T_amb)\n'
          + 'R_ambient = 1 / (G_conv + G_rad)',
        numbers: [
          ['Convection conductance', `${sig(r.G_conv, 3)} W/K`],
          ['Radiation conductance', `${sig(r.G_rad_ambient, 3)} W/K`],
          ['Combined resistance', `${sig(r.R_ambient, 3)} K/W`],
          ['Carried by convection', percent(r.conv_fraction)],
          ['Outer surface T1', `${temperature(r.T1)} K`],
          ['Drop from ambient', `${sig(r.dT_ambient, 3)} K`],
        ],
        limitations:
          'The convection coefficient is a constant, not a correlation: it does not respond to '
          + 'surface temperature, orientation, diameter or air movement. The surroundings are '
          + 'treated as a black enclosure at ambient temperature with a view factor of one.',
      };

    case 'outer-wall':
    case 'inner-wall': {
      const isOuter = id === 'outer-wall';
      const R = isOuter ? r.R_cond_ow : r.R_cond_iw;
      const dT = isOuter ? r.dT_outer_wall : r.dT_inner_wall;
      const k = isOuter ? inputs.k_outer_wall : inputs.k_inner_wall;
      const rOuter = isOuter ? geom.r_ow_ow : geom.r_in_ow;
      const rInner = isOuter ? geom.r_ow_in : geom.r_in_in;

      return {
        title: isOuter ? 'Outer wall conduction' : 'Inner wall conduction',
        body: [
          'Heat spreads through a cylindrical shell over an area that grows with radius, so '
          + 'the resistance depends on the ratio of the radii rather than on the thickness '
          + 'alone. That is the logarithm in the expression.',
          'The result is a very small resistance. A few millimetres of aluminium conducts so '
          + 'well compared with the gaps on either side that the temperature barely changes '
          + 'across the wall, which is why the two surface temperatures read almost the same.',
        ],
        equation: 'R = ln(r_outer / r_inner) / (2 pi k L)',
        numbers: [
          ['Thermal conductivity', `${sig(k, 3)} W/(m K)`],
          ['Outer radius', `${millimetres(rOuter)} mm`],
          ['Inner radius', `${millimetres(rInner)} mm`],
          ['Resistance', `${sig(R, 3)} K/W`],
          ['Share of total resistance', percent(R / r.R_total)],
          ['Temperature drop', `${sig(dT, 3)} K`],
        ],
        limitations:
          'Conductivity is a constant, although it varies with temperature over this range. '
          + 'Because the wall contributes almost nothing to the total resistance, that '
          + 'simplification has very little effect on the heat leak. Welds, joints and '
          + 'thickness variation are not represented.',
      };
    }

    case 'vacuum-gap':
      return {
        title: 'Vacuum gap: three parallel paths',
        body: [
          'Three mechanisms cross the vacuum gap in parallel: residual gas conduction, '
          + 'radiation between surfaces and empirical MLI solid/contact conduction. '
          + 'Their conductances add because all three experience the same temperature drop.',
          'Which one dominates depends on pressure, layer count, emissivity, interface '
          + 'temperatures and gas transport regime. At the '
          + `current ${pressure(inputs.P_vacuum).combined} the gas carries `
          + `${percent(r.gas_fraction)} of the heat crossing the gap and radiation carries `
          + `${percent(r.radiation_fraction)}; MLI contact conduction carries `
          + `${percent(r.fraction_solid_MLI)}.`,
        ],
        equation:
          'R_vacuum = 1 / (1/R_gas + 1/R_radiation + 1/R_MLI)\n'
          + 'Q_gas + Q_radiation + Q_MLI = (T2 - T3) / R_vacuum',
        numbers: [
          ['Gas resistance', `${sig(r.R_gas, 3)} K/W`],
          ['Radiation resistance', `${sig(r.R_rad, 3)} K/W`],
          ['MLI contact resistance', Number.isFinite(r.R_solid_MLI) ? `${sig(r.R_solid_MLI, 3)} K/W` : 'Absent (no layers)'],
          ['Combined', `${sig(r.R_vacuum, 3)} K/W`],
          ['Heat via gas', `${sig(r.Q_gas, 3)} W`],
          ['Heat via radiation', `${sig(r.Q_rad_vacuum, 3)} W`],
          ['Heat via MLI contact', `${sig(r.Q_solid_MLI, 3)} W`],
          ['Temperature drop', `${sig(r.dT_vacuum, 3)} K`],
        ],
        limitations:
          'The model treats the three branches as independent. It does not resolve the '
          + 'individual gas gaps, thermal contacts or temperature of each layer. Internal '
          + 'blanket contacts do not by themselves establish a continuous solid path to the '
          + 'surrounding walls; that coupling is not resolved in this lumped network.',
      };

    case 'gas':
      return {
        title: 'Residual gas conduction',
        body: [
          'How the remaining gas carries heat depends on whether molecules collide with each '
          + 'other more often than they cross the gap. The mean free path is the average '
          + 'distance a molecule travels between collisions, and the Knudsen number compares '
          + 'it with the gap width.',
          'At high pressure molecules collide constantly, the gas behaves as a continuous '
          + 'medium, and its conductivity does not depend on pressure at all: pumping down '
          + 'from atmosphere buys nothing at first. Once the mean free path is comparable '
          + 'with the gap, each molecule starts crossing without colliding, and heat transfer '
          + 'becomes proportional to how many molecules there are, which is to say to '
          + 'pressure. That is the regime where better vacuum pays.',
          `The gap is currently at Kn = ${sig(r.Kn, 3)}, in the ${r.regime} regime.`,
        ],
        equation:
          'lambda = coefficient / P          Kn = lambda / d\n'
          + 'continuum      Kn < 0.01  k_eff = k_gas\n'
          + 'transition     0.01 - 10  k_eff = k_gas / (1 + (N+1) C lambda/d)\n'
          + 'free molecular Kn > 10    k_eff = k_gas d / ((N+1) C lambda)\n'
          + 'R_gas = ln(r_outer / r_inner) / (2 pi k_eff L)',
        numbers: [
          ['Pressure', pressure(inputs.P_vacuum).combined],
          ['Mean free path', `${sig(r.lambda_gas, 3)} m`],
          ['Gap width', `${millimetres(geom.d_vacuum_gap)} mm`],
          ['Knudsen number', sig(r.Kn, 3)],
          ['Regime', r.regime],
          ['MLI layers', String(inputs.n_mli)],
          ['Effective conductivity', `${sig(r.k_eff_gas, 3)} W/(m K)`],
          ['Resistance', `${sig(r.R_gas, 3)} K/W`],
        ],
        limitations:
          'The regime boundaries are hard switches, so effective conductivity jumps rather '
          + 'than blending smoothly. This treats N + 1 layers through a correction to the '
          + 'whole-gap conductivity, not by resolving individual gap widths and Knudsen '
          + 'numbers. The mean free path '
          + 'uses a fixed coefficient with no temperature dependence, and the gap is treated '
          + 'as a slab for the Knudsen number while the resistance uses cylindrical geometry. '
          + 'C is a model parameter, not a measured accommodation coefficient.',
      };

    case 'radiation':
      return {
        title: 'Radiation across the gap',
        body: [
          'Both surfaces radiate, and each absorbs part of what the other sends. For '
          + 'concentric cylinders the net exchange depends on both emissivities and on the '
          + 'area ratio, since the inner surface sees only the outer one while the outer '
          + 'surface partly sees itself.',
          'Radiation depends on the fourth power of temperature, so it is far more sensitive '
          + 'to the warm side than the cold side. This is why the radiative resistance in the '
          + 'model changes as the solve proceeds, and why it has to be iterated rather than '
          + 'computed once.',
        ],
        equation:
          'S = T_h^3 + T_h^2 T_c + T_h T_c^2 + T_c^3\n'
          + 'numerator   = 1/eps + (r_in/r_out)(1/eps - 1)\n'
          + 'denominator = 2 pi r_in L sigma S\n'
          + 'R_single    = numerator / denominator\n'
          + 'R_radiation = R_single (N + 1)',
        numbers: [
          ['Emissivity', sig(inputs.eps_al, 3)],
          ['Warm surface T2', `${temperature(r.T2)} K`],
          ['Cold surface T3', `${temperature(r.T3)} K`],
          ['MLI layers', String(inputs.n_mli)],
          ['Resistance', `${sig(r.R_rad, 3)} K/W`],
          ['Heat via radiation', `${sig(r.Q_rad_vacuum, 3)} W`],
        ],
        limitations:
          'One emissivity is applied to every radiating surface, including each MLI layer. '
          + 'Emissivity does not vary with temperature or wavelength, and the surfaces are '
          + 'treated as diffuse and gray.',
      };

    case 'mli':
      return {
        title: 'Multi-layer insulation',
        body: [
          'MLI consists of low-emissivity reflective foils separated by low-conductivity '
          + 'spacers. Metallized polymer films such as aluminized Mylar or Kapton are typical '
          + 'examples, not a specification for this illustrative model. The layers primarily '
          + 'reduce radiative exchange across the vacuum jacket.',
          'The model approximates N reflective layers by multiplying a single-gap radiative '
          + 'resistance by N + 1. Its gas model also uses N + 1 to represent suppression by '
          + 'additional surfaces in rarefied regimes; it does not resolve individual foil gaps '
          + 'or perform detailed molecular transport.',
          'Contact between foils and spacers can conduct heat within real blankets. The '
          + 'empirical contact branch is a lumped approximation across the wall nodes: '
          + 'it does not resolve how an illustrated separated blanket couples to either wall.',
        ],
        equation:
          'S = T2³ + T2² T3 + T2 T3² + T3³\n'
          + 'R_single = [1/eps + (r_in/r_out)(1/eps − 1)] / [2 pi r_in L sigma S]\n'
          + 'R_radiation = R_single (N + 1)',
        numbers: [
          ['Layers', String(inputs.n_mli)],
          ['Radiative resistance', `${sig(r.R_rad, 3)} K/W`],
          ['Gas resistance beside it', `${sig(r.R_gas, 3)} K/W`],
          ['Contact resistance', Number.isFinite(r.R_solid_MLI) ? `${sig(r.R_solid_MLI, 3)} K/W` : 'Absent (no layers)'],
          ['Gas heat flow / fraction', `${sig(r.Q_gas, 3)} W / ${percent(r.gas_fraction)}`],
          ['Radiation heat flow / fraction', `${sig(r.Q_rad_vacuum, 3)} W / ${percent(r.radiation_fraction)}`],
          ['Contact heat flow / fraction', `${sig(r.Q_solid_MLI, 3)} W / ${percent(r.fraction_solid_MLI)}`],
        ],
        limitations:
          'The solid/contact path is empirical, not a resolved blanket. Edge or seam leakage, '
          + 'compression and installation quality are not modeled. The illustrative '
          + '0.2 mm/layer clearance warning is not used in the thermal calculation and is '
          + 'not the thermal-model layer-density assumption.',
      };

    case 'mli-contact':
      return {
        title: 'MLI solid and contact conduction',
        body: [
          'Version 2 includes a third path across the vacuum gap for conduction through '
          + 'the blanket. The notebook uses an empirical Lockheed-style expression evaluated '
          + 'at the current interface temperatures.',
          'For zero layers the application treats the blanket path as absent: its resistance '
          + 'is infinite and its heat flow is zero. This explicitly differs from evaluating '
          + 'the notebook expression at zero layers.',
        ],
        equation:
          'A = 2 pi r_inner_wall_outer L\n'
          + 'R_MLI = 2 (N + 1) / [Cs n_layer^2.63 (T2 + T3) A]\n'
          + 'Cs = 8.95 x 10^-8; n_layer = 20 layers/cm; N > 0\n'
          + 'N = 0: R_MLI = infinity, Q_MLI = 0',
        numbers: [
          ['Layers', String(inputs.n_mli)],
          ['Warm surface T2', `${temperature(r.T2)} K`],
          ['Cold surface T3', `${temperature(r.T3)} K`],
          ['Contact resistance', Number.isFinite(r.R_solid_MLI) ? `${sig(r.R_solid_MLI, 3)} K/W` : 'Absent (no layers)'],
          ['Heat via contact', `${sig(r.Q_solid_MLI, 3)} W`],
          ['Share of gap heat', percent(r.fraction_solid_MLI)],
        ],
        limitations:
          'The notebook does not cite the empirical coefficient or state its units. A NASA '
          + 'correlation table pairs this coefficient with a different density exponent; '
          + 'the notebook combination is retained but its applicability is unverified. The fixed '
          + '20 layers/cm correlation parameter is distinct from the illustrative '
          + '0.2 mm-per-layer clearance warning. No experimental validation is claimed.',
      };

    case 'inner-gap':
      return {
        title: 'Inner gas gap',
        body: [
          'Between T4 at the inner-wall bore and the prescribed outer copper surface is a '
          + 'gas-filled annulus with its own pressure, independent of the main vacuum. Its '
          + 'mean free path uses kinetic theory at a representative gas temperature. As '
          + 'pressure changes, the model transitions among continuum, transitional and '
          + 'free-molecular transport using its Knudsen number.',
          'It matters more than its size suggests. Being in series with everything else, it '
          + `currently accounts for ${percent(r.resistance_shares.R_gap)} of the total resistance, `
          + `and the inner wall is ${sig(r.dT_inner_gap, 3)} K above the copper boundary.`,
        ],
        equation:
          'lambda = k_B T / (sqrt(2) pi d_molecule^2 P)\n'
          + 'Kn = lambda / d_gap\n'
          + 'k_air_gap = 0.0241 (T_gap / 273.15)^0.81\n'
          + 'Kn < 0.01: k_eff = k_air_gap\n'
          + '0.01 ≤ Kn ≤ 10: k_eff = k_air_gap / (1 + C Kn)\n'
          + 'Kn > 10: k_eff = k_air_gap / (C Kn)\n'
          + 'R_gap  = ln(r_inner-wall / r_copper-outer) / (2 pi k_eff L)',
        numbers: [
          ['Pressure', pressure(inputs.P_inner_gap).combined],
          ['Representative gas temperature', `${temperature(inputs.T_inner_gap)} K`],
          ['Continuum gas conductivity', `${sig(r.k_air_gap, 3)} W/(m K)`],
          ['Effective conductivity', `${sig(r.k_eff_gap, 3)} W/(m K)`],
          ['Mean free path', `${sig(r.lambda_gap, 3)} m`],
          ['Knudsen number', sig(r.Kn_gap, 3)],
          ['Regime', r.regime_gap],
          ['Resistance', `${sig(r.R_gap, 3)} K/W`],
          ['Temperature drop', `${sig(r.dT_inner_gap, 3)} K`],
          ['Heat flow', `${sig(r.Q_inner_gap, 3)} W`],
          ['Copper outer surface', `${r.T_copper_outer.toFixed(2)} K (prescribed)`],
          ['Share of total resistance', percent(r.resistance_shares.R_gap)],
        ],
        limitations:
          'Thermal radiation across the inner gas gap is neglected in the current model; '
          + 'this does not mean radiation is physically impossible. No natural '
          + 'convection. The representative gas temperature is an input, not a solved '
          + 'quantity; the correlation and gas composition are approximations.',
      };

    case 'cold-mass':
    case 'copper-former':
    case 'coolant':
      return {
        title: 'Copper former and LN₂ coolant',
        body: [
          'The radial network ends at the outer surface of the copper former, which is '
          + 'prescribed 0.01 K above the separately prescribed LN₂ coolant temperature. '
          + 'The internal coolant bore is schematic: no bore radius is specified.',
          'Copper does conduct heat physically, but this solver does not calculate a copper '
          + 'resistance or resolve its temperature profile. The 0.01 K difference is an '
          + 'imposed simplifying assumption, not a predicted temperature drop.',
        ],
        numbers: [
          ['Copper outer surface', `${r.T_copper_outer.toFixed(2)} K (prescribed)`],
          ['LN₂ coolant', `${r.T_coolant.toFixed(2)} K (prescribed)`],
          ['Copper outer radius', `${millimetres(geom.r_cu)} mm`],
          ['Heat into copper boundary', `${sig(r.Q, 3)} W over ${sig(geom.length, 3)} m`],
          ['Per unit length', `${sig(r.Q_per_length, 3)} W/m`],
        ],
        limitations:
          'The validity of the imposed 0.01 K copper-to-coolant difference requires further '
          + 'investigation. Copper conduction, coolant heat transfer and fluid dynamics are '
          + 'not resolved; the model does not separately calculate a coolant heat load.',
      };

    default:
      return {
        title: 'Select a layer',
        body: ['Click a layer in the cross-section to see the physics behind it.'],
        numbers: [],
        limitations: '',
      };
  }
}

/**
 * Ordered walkthrough from the warm boundary to the cold one.
 * @param {import('../model/solver.js').ModelResult & Record<string, any>} r
 */
export function explainSteps(r) {
  const inputs = r.inputs;

  return [
    {
      id: 'ambient',
      title: 'Warm boundary',
      value: `${temperature(inputs.T_amb)} K`,
      detail:
        'The room is held at a fixed temperature. Everything downstream is driven by the '
        + `${sig(r.driving_difference, 4)} K difference between it and the copper outer surface.`,
    },
    {
      id: 'ambient',
      title: 'Convection and radiation to the outer wall',
      value: `${sig(r.R_ambient, 3)} K/W`,
      detail:
        `Two parallel routes carry all ${sig(r.Q, 3)} W to the wall: convection takes `
        + `${percent(r.conv_fraction)} of it. The outer surface settles at `
        + `${temperature(r.T1)} K, ${sig(r.dT_ambient, 3)} K below ambient.`,
    },
    {
      id: 'outer-wall',
      title: 'Through the outer wall',
      value: `${sig(r.R_cond_ow, 3)} K/W`,
      detail:
        `Conduction through the metal accounts for ${sig(r.dT_outer_wall, 3)} K of the `
        + 'temperature drop. The whole heat leak passes through here in series.',
    },
    {
      id: 'gas',
      title: 'Residual gas across the vacuum gap',
      value: `${sig(r.R_gas, 3)} K/W`,
      detail:
        `At ${pressure(inputs.P_vacuum).combined} the Knudsen number is ${sig(r.Kn, 3)}, `
        + `putting the gap in the ${r.regime} regime. Gas carries `
        + `${sig(r.Q_gas, 3)} W of the flow.`,
    },
    {
      id: 'radiation',
      title: 'Radiation across the vacuum gap',
      value: `${sig(r.R_rad, 3)} K/W`,
      detail:
        `In parallel with gas and MLI contact conduction, radiation between the ${temperature(r.T2)} K and `
        + `${temperature(r.T3)} K surfaces carries ${sig(r.Q_rad_vacuum, 3)} W through `
        + `${inputs.n_mli} MLI layers.`,
    },
    {
      id: 'mli-contact',
      title: 'MLI solid and contact conduction',
      value: Number.isFinite(r.R_solid_MLI) ? `${sig(r.R_solid_MLI, 3)} K/W` : 'Absent (no layers)',
      detail:
        `The empirical MLI contact path carries ${sig(r.Q_solid_MLI, 3)} W, or `
        + `${percent(r.fraction_solid_MLI)} of the gap heat flow.`,
    },
    {
      id: 'vacuum-gap',
      title: 'The gap as a whole',
      value: `${sig(r.R_vacuum, 3)} K/W`,
      detail:
        `The parallel paths give up ${sig(r.dT_vacuum, 3)} K of the total temperature `
        + `difference, which is ${percent(r.vacuum_drop_fraction)} of `
        + 'it. This is normally the dominant resistance in the network.',
    },
    {
      id: 'inner-wall',
      title: 'Through the inner wall',
      value: `${sig(r.R_cond_iw, 3)} K/W`,
      detail:
        `Another conduction step, worth ${sig(r.dT_inner_wall, 3)} K, bringing the bore `
        + `of the inner wall to ${temperature(r.T4)} K.`,
    },
    {
      id: 'inner-gap',
      title: 'Across the inner gas gap',
      value: `${sig(r.R_gap, 3)} K/W`,
      detail:
        `The last modeled step before the copper surface, at its own pressure of ${pressure(inputs.P_inner_gap).combined}. `
        + `It accounts for ${percent(r.resistance_shares.R_gap)} of the total resistance and a `
        + `${sig(r.dT_inner_gap, 3)} K drop.`,
    },
    {
      id: 'cold-mass',
      title: 'Prescribed copper boundary',
      value: `${sig(r.Q_per_length, 3)} W/m`,
      detail:
        `Heat arrives at the copper outer surface (${r.T_copper_outer.toFixed(2)} K); LN₂ is separately prescribed at ${r.T_coolant.toFixed(2)} K. Dividing the ${sig(r.driving_difference, 4)} K `
        + `difference by the total resistance of ${sig(r.R_total, 4)} K/W gives `
        + `${sig(r.Q, 3)} W over the modelled ${sig(r.geometry.length, 3)} m, which is `
        + `${sig(r.Q_per_length, 3)} W/m.`,
    },
  ];
}
