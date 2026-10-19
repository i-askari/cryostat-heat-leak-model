# Physics of the Version 2 model

This is a steady-state, one-dimensional cylindrical resistance network for
illustration. Version 2 follows the supplied numerical model's equations; it is
not an experimentally validated cryostat design. Public defaults and reference
cases are synthetic. All heat rates and resistances are for the modelled length
`L`; the headline value is `Q/L`.

## Version 1 and Version 2

| Aspect | Historical Version 1 | Version 2 |
| --- | --- | --- |
| Vacuum parallel paths | Gas and radiation | Gas, radiation and MLI contact |
| MLI effect on gas | None | `N+1` in molecular and transition expressions |
| Inner-gap continuum conductivity | Main-gap air conductivity | Temperature correlation at the selected inner-gap temperature |
| Radiation, walls and network | Cylindrical resistance formulation | Same formulation |

Version 2 adds physically motivated mechanisms, but reproducing the stated
correlations and solving their equations does not establish experimental accuracy.
The previous public Version 1 release is retained as the initial Git commit.

## Network and geometry

From outside inward, the depicted assembly is ambient, outer aluminium wall,
main vacuum gap containing MLI, inner aluminium wall, inner gas gap, copper former,
and LN₂ coolant channel. Interfaces T1–T4 are, respectively, the outer and inner
radii of the outer wall and the outer and inner radii of the inner wall. Ambient
and the copper former's outer surface are the modeled network boundaries.
The coolant channel is shown separately as a schematic region; its bore radius is
not specified and no quantitative dimension is implied by the drawing.

```text
ambient ─ [convection || radiation] ─ T1 ─ outer wall ─ T2
        ─ [gas || radiation + MLI || MLI contact] ─ T3 ─ inner wall ─ T4
        ─ inner gas-gap gas conduction ─ copper former outer surface
                                          (prescribed; coolant is separate)
```

`r_in_in = r_cu + d_inner_gap`, `r_in_ow = r_in_in + t_inner_wall`,
`r_ow_in = r_in_ow + d_vacuum_gap`, and `r_ow_ow = r_ow_in + t_outer_wall`.
For a cylindrical conductive shell, `R = ln(r_outer/r_inner)/(2 pi k L)`.
Thus

```text
R_total = R_ambient + R_cond_outer + R_vacuum + R_cond_inner + R_gap
R_vacuum = 1 / (1/R_gas + 1/R_rad + 1/R_solid_MLI)
Q = (T_amb - T_copper_outer) / R_total
q_per_length = Q / L
```

All three vacuum branches span the same temperature difference `T2 - T3`.
Each branch carries `(T2 - T3)/R_branch`, so the branch conductances add.
Series elements carry the same heat rate; branch rates sum to the series rate
only approximately at finite solver tolerance. The model uses SI units:
radii and length in m, pressure in Pa, temperature in K, conductivity in
W/(m K), resistance in K/W and heat rate in W. The displayed `Q/L` is in W/m.
With all other inputs fixed, every resistance scales as `1/L`, so the network
equations give `Q` proportional to `L` and `Q/L` independent of section length.

## Copper former and coolant boundary

The public default prescribes `T_coolant = 77.00 K` and
`T_copper_outer = T_coolant + 0.01 K = 77.01 K`. In the model API the existing
`T_cold` input denotes `T_copper_outer`: it remains an adjustable numerical boundary
and supports reference cases with other cold-side temperatures. The UI adjusts the
coolant temperature and applies the fixed 0.01 K offset to this input.

Copper conduction physically occurs, but no copper-wall resistance or temperature
profile is solved. The nonzero copper-to-coolant temperature difference is prescribed,
not predicted from material properties, geometry or heat rate. Its physical validity
requires further investigation. The calculated heat rate enters the copper boundary;
the model does not independently solve a coolant heat load. No resistance is added
to the modeled series network for the schematic copper former.

## External convection and radiation

Using `A_outer = 2 pi r_ow_ow L`,

```text
G_conv = A_outer h
G_rad_ambient = A_outer sigma eps (T1^2 + T_amb^2)(T1 + T_amb)
R_ambient = 1/(G_conv + G_rad_ambient)
```

The radiation factorization is algebraically exact; the conductance is evaluated
at the current interface-temperature estimate in each iteration.

## Main-gap residual gas

The mean free path is `lambda = mfp_coefficient / P` and the gap-scale Knudsen
number is `Kn = lambda / d_vacuum_gap`. For `N` MLI layers:

| Regime | Condition | Effective conductivity |
| --- | --- | --- |
| Continuum | `Kn < 0.01` | `k_air` |
| Transition | `0.01 <= Kn <= 10` | `k_air/(1 + (N+1) C lambda/d)` |
| Free molecular | `Kn > 10` | `k_air d/((N+1) C lambda)` |

The main-gap gas resistance is

```text
R_gas = ln(r_ow_in/r_in_ow) / (2 pi k_eff L)
```

Mean free path grows as pressure falls. The implemented conductivity is
pressure-independent in the continuum branch and proportional to pressure in
the free-molecular branch. The `N+1` factor suppresses gas conduction only in
the transition and free-molecular branches; continuum conductivity remains
`k_air` regardless of layer count. The exact
boundaries belong to the transition regime as in the reference. These expressions
have jumps at both boundaries; their size depends on `N` and `C`. The inverse
lookup searches continuous branches separately over a finite pressure range,
verifies the returned heat rate, and returns the lowest-pressure match it finds.
Some targets cannot be attained because of jumps; a failed or non-converged
evaluation also prevents a reliable search result.

This is not a resolved model of individual MLI subgaps. It applies `N+1` to
transport while classifying the regime from the full vacuum-gap width, without
independently calculating each subgap's geometry, pressure, temperature or Knudsen
number. This may be a consequential approximation and has not been validated.
The main-gap mean free path has no explicit temperature dependence.
The parameter `C` is a dimensionless bridging coefficient in these expressions,
not a directly measured gas-surface accommodation coefficient. The model
does not solve buoyancy-driven convection in either gas gap.

## Vacuum radiation and MLI contact

```text
S = T2^3 + T2^2 T3 + T2 T3^2 + T3^3
R_rad = (N+1) [1/eps + (r_in_ow/r_ow_in)(1/eps - 1)]
        / (2 pi r_in_ow L sigma S)

R_solid_MLI = 2(N+1) / (Cs density^2.63 (T2+T3) A_inner)
Cs = 8.95e-8, density = 20 layers/cm, A_inner = 2 pi r_in_ow L
```

The radiation factor treats all `N+1` gaps as equal-resistance shields. The
contact equation is the notebook's empirical Lockheed-labelled correlation and
uses the inner-wall outer cylindrical area. The notebook does not identify the
coefficient's source, dimensional convention, materials or validity range. The
coefficient is unit-sensitive: with density entered numerically in layers/cm,
temperatures in K and flux in W/m², its implied dimensions are
`W m^-2 K^-2 (layers/cm)^-2.63`; it must not be reused with layers/m unchanged.

There is an important correlation mismatch to review. A [NASA technical paper's
Lockheed-parameter table](https://ntrs.nasa.gov/api/citations/20110013505/downloads/20110013505.pdf)
lists `Cs = 8.95e-8` with exponent `2.56` for its unperforated-shield case,
and exponent `2.63` with `Cs = 7.30e-8` for its perforated-shield case. The
notebook combines `8.95e-8` with `2.63`. The supplied equation is reproduced
without substitution; that combination's provenance and applicability remain
unverified. NASA's table does not validate this application or imply the notebook
intended either specific material case.

The notebook assigns a finite contact resistance even at `N=0`. This application
deliberately treats an absent blanket as an open circuit: `R_solid_MLI = Infinity`
and its heat rate is zero. This is the one explicit physical behavior difference;
positive layer counts use the notebook equation unchanged.

Typical MLI comprises reflective low-emissivity foils, such as aluminized polymer
films, with low-conductivity spacers; these are examples, not a specification for an
installed blanket. It primarily reduces radiation. This model also applies `N+1`
to rarefied-gas transport and includes an empirical contact path, without resolving
individual layers or their temperatures.

The illustrated blanket lies within the main vacuum gap near, but separated from,
the inner wall. Contacts within a blanket are distinct from its thermal coupling to
the surrounding walls. The lumped contact branch nonetheless connects the two main
gap nodes; the schematic clearance does not identify a continuous solid path to the
walls. This is a physical limitation, not evidence of an invented mechanical contact.

The fixed thermal correlation density is not computed from blanket thickness.
The separately approved 0.2 mm/layer drawing and clearance heuristic is not a blanket
specification and never enters gas, radiation, contact, resistance, or solver
calculations.

## Inner gas gap

The unlayered inner gap lies between T4 and the prescribed copper outer surface.
It has its own pressure and representative temperature, separate from the main
vacuum gap:

```text
k_air_gap = 0.0241 (T_inner_gap / 273.15)^0.81
lambda_gap = k_B T_inner_gap / (sqrt(2) pi d_molecule^2 P_inner_gap)
Kn_gap = lambda_gap / d_inner_gap
R_gap = ln(r_in_in/r_cu)/(2 pi k_eff_gap L)
```

The same gas regime conditions apply, with no MLI factor. The notebook fixes the
representative temperature at 90 K; the public application retains its approved,
independently selected 110 K default and permits it to be changed. Using 90 K
reproduces the notebook's correlation. This is an input held fixed throughout a
solve, not a temperature calculated dynamically from T4 and the copper surface.
The independently specified inner-gap pressure remains fixed while the main
vacuum pressure is swept. Thermal radiation across the inner gas gap
is neglected in the current model. This is a simplifying assumption, not a claim
that radiation cannot physically occur; natural convection there is also omitted.

## Numerical method and convergence

The fixed-point solver follows the reference method: initialize interface
temperatures, evaluate the resistances (including temperature-dependent MLI
contact), compute Q, update the four interface temperatures, and repeat. The
application uses boundary-scaled initialization and configurable model inputs, with
an illustrative default cap of 60 iterations and tolerance of 10^-6 K; the
notebook uses fixed initial estimates, 50 iterations and 10^-4 K. In both,
the convergence check precedes assignment of the next temperatures.

Convergence on absolute temperature motion does not guarantee a small relative
branch-flow error. The UI warns when a parallel-flow balance exceeds 0.1% or
the iteration does not converge. If the iteration limit is exhausted, returned
temperatures may be one iterate ahead of the reported resistances and Q; treat
those results as diagnostics. Sweep charts leave gaps and show a warning when
individual solves fail to converge; sensitivity excludes failed perturbations.
The synthetic heat-balance oracle uses a different
numerical method; see [VALIDATION.md](VALIDATION.md).

## Additional limitations

The gas and radiation models use idealized surfaces and mostly fixed input
properties. The inner-gap bulk gas correlation responds to its selected
representative temperature; the radiation and contact resistances also depend
on the iterated interface temperatures. The main-gap mean-free-path coefficient
and gas conductivity do not vary automatically with temperature.
The model does not resolve layer temperatures, contact distributions, thickness,
compression, installation quality, edge or seam leakage, or detailed gas-surface
interactions. It also omits supports, penetrations, axial/end effects, transients,
coolant dynamics, inner-gap radiation and uncertainty propagation. Real hardware
can be dominated by omitted paths. These limitations and the empirical coefficient
require independent study and experimental validation before engineering use.
The one-at-a-time sensitivity screening uses a minimum one-layer change for
the discrete layer count and clamps its lower perturbation at zero. At zero
layers the comparison is one-sided (zero versus one), so it captures the
appearance of the contact branch rather than a symmetric ±20% perturbation.
The screening is not an uncertainty analysis and does not quantify interactions.
