# Physics of the Version 1 model

A steady-state, one-dimensional, radial thermal-resistance model of a cylindrical
vacuum-insulated cryogenic enclosure. This document states every equation the model
solves, every assumption behind it, and the places where the formulation is known to be
approximate.

## Contents

- [The network](#the-network)
- [Governing equations](#governing-equations)
- [Numerical method](#numerical-method)
- [Units](#units)
- [Assumptions](#assumptions)
- [Known approximations and rough edges](#known-approximations-and-rough-edges)
- [Not modelled](#not-modelled)
- [Future work](#future-work)

## The network

Heat enters from a warm ambient boundary and flows radially inward to a cold mass held
at a fixed temperature.

```
                    ┌── convection ──┐                  ┌── residual gas ────┐
  T_amb ────────────┤                ├── T1 ─ outer ─ T2┤                    ├── T3 ─ inner ─ T4 ── inner ──── T_cold
   (fixed)          └── radiation ───┘        wall      └── radiation + MLI ─┘        wall        gas gap      (fixed)
```

Four interface temperatures are solved for:

| Symbol | Location                    |
| ------ | --------------------------- |
| `T1`   | Outer wall, outer surface   |
| `T2`   | Outer wall, inner surface   |
| `T3`   | Inner wall, outer surface   |
| `T4`   | Inner wall, inner surface   |

`T_amb` and `T_cold` are boundary conditions, not solved.

Five elements are in series. Two of them are internally parallel pairs:

```
R_total = R_ambient + R_cond_outer + R_vacuum + R_cond_inner + R_gap

R_ambient = 1 / (G_conv + G_rad)                  parallel
R_vacuum  = 1 / (1/R_gas + 1/R_radiation)         parallel

Q = (T_amb - T_cold) / R_total
```

The distinction matters for reading results. In a series element the same `Q` passes
through; in a parallel pair, `Q` divides between the branches and their rates should
sum to the flow through the pair. At finite solver tolerance these balances are only
approximate; the application reports a warning when their relative error is large.

## Governing equations

### Geometry

The radial build is defined by a cold-mass radius and a stack of positive thicknesses,
from which the five radii follow:

```
r_in_in = r_cu     + d_inner_gap
r_in_ow = r_in_in  + t_inner_wall
r_ow_in = r_in_ow  + d_vacuum_gap
r_ow_ow = r_ow_in  + t_outer_wall
```

This parameterisation cannot express a self-intersecting cryostat, so nested-radius
violations are unrepresentable rather than merely rejected.

Implemented in [`src/model/geometry.js`](../src/model/geometry.js).

### Cylindrical conduction

Heat spreading through a cylindrical shell crosses an area that grows with radius, so
resistance depends on the ratio of radii:

```
R = ln(r_outer / r_inner) / (2 pi k L)
```

Applied to both metal walls, with `k_outer_wall` and `k_inner_wall` respectively, and —
with an effective gas conductivity in place of `k` — to both gas gaps.

### External convection and radiation

The room reaches the outer wall by two routes at once, so their conductances add:

```
G_conv = 2 pi r_ow_ow h L
G_rad  = 2 pi r_ow_ow L sigma eps (T1^2 + T_amb^2)(T1 + T_amb)
R_ambient = 1 / (G_conv + G_rad)
```

The radiative conductance is a linearisation of `sigma eps (T1^4 - T_amb^4)`, factored as
`(T1^2 + T_amb^2)(T1 + T_amb)(T1 - T_amb)`. The factorisation is algebraically exact; the
approximation is that the conductance is held fixed within each solver iteration.

### Residual gas conduction

Whether the gas behaves as a continuum depends on how its mean free path compares with
the gap:

```
lambda = mfp_coefficient / P            (main vacuum gap)
Kn     = lambda / d
```

with a piecewise effective conductivity:

| Regime         | Condition    | Effective conductivity          |
| -------------- | ------------ | ------------------------------- |
| Continuum      | `Kn < 0.01`  | `k_eff = k_gas`                 |
| Transition     | `0.01 – 10`  | `k_eff = k_gas / (1 + C λ/d)`   |
| Free molecular | `Kn > 10`    | `k_eff = k_gas · d / (C λ)`     |

and the resistance in cylindrical form:

```
R_gas = ln(r_ow_in / r_in_ow) / (2 pi k_eff L)
```

The physical content: in the continuum regime, conductivity is independent of pressure,
so pumping down from atmosphere buys nothing at first. In the free-molecular regime
`λ ∝ 1/P`, so `k_eff ∝ P` and heat transfer falls in proportion to the number of
molecules present. That is the regime where vacuum quality pays.

`C` is a dimensionless constant capturing accommodation and surface effects, usually
quoted as order 1–3.

### Inner gas gap

The annulus between the cold mass and the inner wall bore is held at its own fixed
pressure, independent of the main vacuum, and uses the kinetic-theory mean free path:

```
lambda = k_B T / (sqrt(2) pi d_molecule^2 P)
Kn     = lambda / d_inner_gap
R_gap  = ln(r_in_in / r_cu) / (2 pi k_eff L)
```

Conduction only: no radiation and no natural convection are modelled across this gap.

### Radiation across the vacuum gap, with MLI

Between two concentric gray cylinders, linearised the same way as the external term:

```
S           = T2^3 + T2^2 T3 + T2 T3^2 + T3^3
numerator   = 1/eps + (r_in_ow / r_ow_in)(1/eps - 1)
denominator = 2 pi r_in_ow L sigma S
R_single    = numerator / denominator
R_radiation = R_single (N_MLI + 1)
```

The multiplier `N + 1` idealizes the shields as equal-resistance radiation gaps.
It is not an exact treatment of concentric shields with differing areas and
temperatures or of real spacer and contact conduction.

The diminishing return on MLI follows from the network rather than from the radiation
model: MLI raises the resistance of only one branch of a parallel pair. Once
`R_radiation ≫ R_gas`, the combined `R_vacuum` is set by the gas and further layers
change almost nothing.

Implemented in [`src/model/resistances.js`](../src/model/resistances.js).

## Numerical method

Two resistances depend on the temperatures being solved for: `G_rad` depends on `T1`, and
`R_radiation` depends on `T2` and `T3`. The system is therefore non-linear and is solved
by fixed-point iteration:

1. Initialize `T1` through `T4` at 5%, 10%, 70% and 85% of the temperature span
   from ambient toward the cold boundary.
2. Evaluate all resistances at the current temperatures.
3. Compute `Q = (T_amb − T_cold) / R_total`.
4. Walk the temperature drops inward: `T1 = T_amb − Q·R_ambient`, and so on.
5. Stop when every interface temperature moves by less than `tolerance` (default
   `1e-6` K), or after `max_iterations` (default 60).

Two consequences worth stating plainly:

- On convergence the check happens before temperature assignment, so the returned
  temperatures are the iterate used to evaluate the temperature-dependent resistances.
  Their differences from the updated temperature drops are bounded by the absolute
  temperature tolerance when the solve converges; the heat-flow balances are not exact.
  Relative balance errors can be more noticeable when the heat flow is very small.
- When iteration does not converge, no such tolerance bound is guaranteed. The final
  temperatures have advanced beyond the temperatures used for the stored resistances
  and heat flow; those values may be internally inconsistent. Treat the last iterate
  as a diagnostic rather than a reliable physical result.

Non-convergence is reported, never hidden: `solve()` returns `converged` and
`iterations`, and the interface raises a warning rather than presenting the last iterate
as a converged answer. A separate warning is also shown when a converged result's
parallel-branch total differs from the series heat rate by more than 0.1%. A tighter
temperature tolerance can improve that balance, but may change the iteration count
and numerical results.

Implemented in [`src/model/solver.js`](../src/model/solver.js).

## Units

SI internally, everywhere: metres, kelvin, pascal, watts, and K/W for resistance.
Conversion happens only at the interface boundary, where geometry is shown in mm and
pressure in Torr or mTorr.

**On `L` and W/m.** Every resistance carries a `1/L` factor, so `R_total ∝ 1/L` and `Q ∝ L`
exactly. Heat leak per unit length is therefore independent of the modelled length, and
quoting W/m is meaningful rather than a convention that only holds at `L = 1 m`. The
application reports `Q/L` as the headline number in W/m and states the total watts over
the modelled section beside it, so the two are never confused. A test asserts the exact
proportionality.

## Assumptions

1. Steady state.
2. One-dimensional radial heat flow; the same `Q` passes through every series element.
3. Concentric, perfectly cylindrical geometry.
4. Fixed ambient and cold-mass boundary temperatures.
5. Constant material properties: no temperature dependence in conductivity, emissivity,
   gas conductivity or convection coefficient.
6. One emissivity for every radiating metal surface, including every MLI layer.
7. Diffuse gray surfaces, view factor of one to the surroundings.
8. MLI represented solely as increased radiative resistance.
9. The inner gas gap is held at a fixed pressure and temperature.
10. The cold mass is isothermal.

## Known approximations and rough edges

Stated explicitly because they bound how far the results should be trusted.

**Hard regime switches.** The piecewise conductivity is discontinuous at its thresholds.
At `Kn = 0.01` and `Kn = 10` the step size depends on `C`.
A blending function would remove the step, at the cost of departing from the Version 1
formulation. A target inside an upward jump has no exact pressure solution; a downward
jump can yield more than one solution. The inverse lookup searches the continuous
branches separately and reports the lowest-pressure match when one is found.

**Two different mean free paths.** The main vacuum gap uses a fitted `λ = coefficient/P`
with an independently selected illustrative coefficient and no temperature dependence;
the inner gap uses the kinetic-theory expression. Both are exposed as parameters and
are not guaranteed to represent mutually consistent gas conditions.

**Slab Knudsen number in a cylindrical gap.** `Kn` uses the gap thickness as though the
gap were planar, while the resistance uses the cylindrical form. For thin gaps the
difference is small; for gaps comparable to the radius it is not.

**Constant gas conductivity.** An illustrative `k_gas` is applied unchanged throughout
the model. Real gas conductivity varies with temperature and gas composition.

**`C` is a model constant.** It behaves like a temperature-jump coefficient in these
expressions, not like a thermal accommodation coefficient, which would be at most 1. The
interface warns outside 1–3 rather than silently accepting any value as physical.

**Convection coefficient is a constant.** `h` does not respond to surface temperature,
diameter, orientation or air movement. In practice it dominates the external conductance
for some choices of parameters, so the external film resistance depends on the assumed
inputs.

**MLI layers have no thickness.** A layer count that could not physically fit inside the
vacuum gap still computes. The interface warns when the implied blanket exceeds the gap,
using an illustrative 0.2 mm per layer, but the thermal model does not act on it.
Actual blanket thickness depends on construction and compression.

## Not modelled

- Axial conduction and end effects
- Supports, spacers, ports, seals and penetrations
- Joints and ohmic heating, and any axially localised heat source
- Transient behaviour: cooldown, warm-up, thermal mass
- Coolant fluid dynamics, flow, or the ability of the cooling system to hold temperature
- MLI spacer conduction, contact conduction, edge and seam leakage, compression,
  installation quality, or layer density
- Radiation across the inner gas gap
- Temperature gradients within the cold mass
- Outgassing, gas species other than the single assumed gas, and pressure gradients
  within a gap
- Manufacturing tolerance, thermal contraction, and the effect of either on the gaps

Any of these can matter more than the effects that are modelled. A real cryostat's heat
leak is frequently dominated by supports and penetrations, which this model does not
represent at all.

## Future work

Ordered roughly by the ratio of insight gained to effort:

1. **Temperature-dependent properties.** `k(T)` for the walls and `k_gas(T)` for the gaps,
   which would remove the largest property approximation.
2. **A blended transition function** replacing the hard regime switches.
3. **Support and penetration conduction** as parallel paths to the cold mass, which is
   what would make the model useful for a real design rather than for exploring
   mechanisms.
4. **Consistent mean free path** across both gaps, with temperature dependence.
5. **MLI with physical thickness**, spacer conduction and a degradation factor.
6. **Axial discretisation**, which is the prerequisite for representing joints and any
   localised heat source.
7. **Transient solution** for cooldown behaviour.
8. **Uncertainty propagation** rather than the one-at-a-time sensitivity screening
   currently offered.
