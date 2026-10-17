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
        title: 'Vacuum gap: residual gas and radiation',
        body: [
          'The vacuum gap is where the insulation is won or lost. Two mechanisms cross it in '
          + 'parallel: whatever gas is left conducts heat, and the two surfaces exchange '
          + 'radiation. Their resistances combine reciprocally, so the smaller of the two '
          + 'dominates the pair.',
          'Which one dominates depends on pressure, and the model says that directly: at the '
          + `current ${pressure(inputs.P_vacuum).combined} the gas carries `
          + `${percent(r.gas_fraction)} of the heat crossing the gap and radiation carries `
          + `${percent(r.radiation_fraction)}.`,
        ],
        equation:
          'R_vacuum = 1 / (1/R_gas + 1/R_radiation)\n'
          + 'Q_gas + Q_radiation = (T2 - T3) / R_vacuum',
        numbers: [
          ['Gas resistance', `${sig(r.R_gas, 3)} K/W`],
          ['Radiation resistance', `${sig(r.R_rad, 3)} K/W`],
          ['Combined', `${sig(r.R_vacuum, 3)} K/W`],
          ['Heat via gas', `${sig(r.Q_gas, 3)} W`],
          ['Heat via radiation', `${sig(r.Q_rad_vacuum, 3)} W`],
          ['Temperature drop', `${sig(r.dT_vacuum, 3)} K`],
        ],
        limitations:
          'The two branches are treated as independent: the MLI raises radiative resistance '
          + 'but is invisible to the gas, even though a real blanket obstructs gas transport '
          + 'and conducts through its spacers and contact points.',
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
          + 'transition     0.01 - 10  k_eff = k_gas / (1 + C lambda/d)\n'
          + 'free molecular Kn > 10    k_eff = k_gas d / (C lambda)\n'
          + 'R_gas = ln(r_outer / r_inner) / (2 pi k_eff L)',
        numbers: [
          ['Pressure', pressure(inputs.P_vacuum).combined],
          ['Mean free path', `${sig(r.lambda_gas, 3)} m`],
          ['Gap width', `${millimetres(geom.d_vacuum_gap)} mm`],
          ['Knudsen number', sig(r.Kn, 3)],
          ['Regime', r.regime],
          ['Effective conductivity', `${sig(r.k_eff_gas, 3)} W/(m K)`],
          ['Resistance', `${sig(r.R_gas, 3)} K/W`],
        ],
        limitations:
          'The regime boundaries are hard switches, so the effective conductivity steps by a '
          + 'few percent as it crosses them rather than blending smoothly. The mean free path '
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
          'Each reflective layer is another surface that must absorb and re-radiate before '
          + 'heat can continue inward. N layers create N + 1 radiation gaps in series, so the '
          + 'model represents a blanket by multiplying the single-gap radiative resistance by '
          + 'N + 1.',
          'The return diminishes for a reason worth understanding: MLI only raises the '
          + 'resistance of one branch of a parallel pair. Once the radiative resistance is '
          + 'much larger than the gas resistance beside it, the combined resistance is set by '
          + 'the gas and further layers change almost nothing. Adding layers is worthwhile '
          + 'exactly to the extent that radiation is still carrying heat.',
          `Radiation is currently carrying ${percent(r.radiation_fraction)} of the heat across `
          + 'the gap, so that is roughly the fraction of the gap heat flow more layers could '
          + 'act on.',
        ],
        equation: 'R_radiation = R_single (N + 1)',
        numbers: [
          ['Layers', String(inputs.n_mli)],
          ['Radiative resistance', `${sig(r.R_rad, 3)} K/W`],
          ['Gas resistance beside it', `${sig(r.R_gas, 3)} K/W`],
          ['Radiation share of gap heat', percent(r.radiation_fraction)],
        ],
        limitations:
          'Layers have no thickness, mass or spacing in this model, so a blanket that could '
          + 'not physically fit in the gap still computes. There is no spacer conduction, no '
          + 'contact conduction between layers, no edge or seam leakage, and no allowance for '
          + 'compression or installation quality, all of which make real blankets perform '
          + 'worse than an ideal layer count suggests.',
      };

    case 'inner-gap':
      return {
        title: 'Inner gas gap',
        body: [
          'Between the cold mass and the bore of the inner wall is a gas-filled annulus held '
          + 'at its own fixed pressure, independent of the main vacuum. It uses the same '
          + 'Knudsen treatment as the vacuum gap, with the mean free path from kinetic theory '
          + 'at a representative gas temperature.',
          'It matters more than its size suggests. Being in series with everything else, it '
          + `currently accounts for ${percent(r.R_gap / r.R_total)} of the total resistance, `
          + `and it holds the inner wall ${sig(r.dT_inner_gap, 3)} K above the cold mass.`,
        ],
        equation:
          'lambda = k_B T / (sqrt(2) pi d_molecule^2 P)\n'
          + 'R_gap  = ln(r_bore / r_cold) / (2 pi k_eff L)',
        numbers: [
          ['Pressure', pressure(inputs.P_inner_gap).combined],
          ['Representative gas temperature', `${temperature(inputs.T_inner_gap)} K`],
          ['Mean free path', `${sig(r.lambda_gap, 3)} m`],
          ['Knudsen number', sig(r.Kn_gap, 3)],
          ['Regime', r.regime_gap],
          ['Resistance', `${sig(r.R_gap, 3)} K/W`],
          ['Share of total resistance', percent(r.R_gap / r.R_total)],
        ],
        limitations:
          'Conduction only: no radiation is modelled across this gap, and no natural '
          + 'convection. The gas conductivity is the room-temperature value even though the '
          + 'gas here is cold, and the representative temperature used for the mean free path '
          + 'is an input rather than a solved quantity.',
      };

    case 'cold-mass':
      return {
        title: 'Cold mass',
        body: [
          'The cold mass is a boundary condition, not a solved region: the whole of it is held '
          + 'at the cold temperature. That is a reasonable simplification when it is a good '
          + 'conductor cooled by a fluid, because the gradient within it is small compared '
          + 'with the drops across the gaps.',
          'It is the destination for every watt the model computes. The heat leak is what the '
          + 'cooling system has to remove to hold this temperature.',
        ],
        numbers: [
          ['Temperature', `${temperature(inputs.T_cold)} K`],
          ['Radius', `${millimetres(geom.r_cu)} mm`],
          ['Heat arriving', `${sig(r.Q, 3)} W over ${sig(geom.length, 3)} m`],
          ['Per unit length', `${sig(r.Q_per_length, 3)} W/m`],
        ],
        limitations:
          'No temperature gradient inside the cold mass, no axial conduction along it, and no '
          + 'model of the coolant: the fluid is assumed able to hold this temperature whatever '
          + 'the heat leak turns out to be.',
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
        + `${sig(inputs.T_amb - inputs.T_cold, 4)} K difference between it and the cold mass.`,
    },
    {
      id: 'ambient',
      title: 'Convection and radiation to the outer wall',
      value: `${sig(r.R_ambient, 3)} K/W`,
      detail:
        `Two parallel routes carry all ${sig(r.Q, 3)} W to the wall: convection takes `
        + `${percent(r.conv_fraction)} of it. The outer surface settles at `
        + `${temperature(r.T1)} K, only ${sig(r.dT_ambient, 3)} K below ambient, because this `
        + 'resistance is small compared with what follows.',
    },
    {
      id: 'outer-wall',
      title: 'Through the outer wall',
      value: `${sig(r.R_cond_ow, 3)} K/W`,
      detail:
        `Conduction through the metal costs only ${sig(r.dT_outer_wall, 3)} K. The whole heat `
        + 'leak passes through here in series, but aluminium is too good a conductor for this '
        + 'step to matter.',
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
        `In parallel with the gas, radiation between the ${temperature(r.T2)} K and `
        + `${temperature(r.T3)} K surfaces carries ${sig(r.Q_rad_vacuum, 3)} W through `
        + `${inputs.n_mli} MLI layers.`,
    },
    {
      id: 'vacuum-gap',
      title: 'The gap as a whole',
      value: `${sig(r.R_vacuum, 3)} K/W`,
      detail:
        `The parallel pair gives up ${sig(r.dT_vacuum, 3)} K of the total temperature `
        + `difference, which is ${percent(r.dT_vacuum / (inputs.T_amb - inputs.T_cold))} of `
        + 'it. This is normally the dominant resistance in the network.',
    },
    {
      id: 'inner-wall',
      title: 'Through the inner wall',
      value: `${sig(r.R_cond_iw, 3)} K/W`,
      detail:
        `Another small conduction step, worth ${sig(r.dT_inner_wall, 3)} K, bringing the bore `
        + `of the inner wall to ${temperature(r.T4)} K.`,
    },
    {
      id: 'inner-gap',
      title: 'Across the inner gas gap',
      value: `${sig(r.R_gap, 3)} K/W`,
      detail:
        `The last step before the cold mass, held at ${pressure(inputs.P_inner_gap).combined}. `
        + `It accounts for ${percent(r.R_gap / r.R_total)} of the total resistance and a `
        + `${sig(r.dT_inner_gap, 3)} K drop.`,
    },
    {
      id: 'cold-mass',
      title: 'Cold boundary',
      value: `${sig(r.Q_per_length, 3)} W/m`,
      detail:
        `All of it arrives here. Dividing the ${sig(inputs.T_amb - inputs.T_cold, 4)} K `
        + `difference by the total resistance of ${sig(r.R_total, 4)} K/W gives `
        + `${sig(r.Q, 3)} W over the modelled ${sig(r.geometry.length, 3)} m, which is `
        + `${sig(r.Q_per_length, 3)} W/m.`,
    },
  ];
}
