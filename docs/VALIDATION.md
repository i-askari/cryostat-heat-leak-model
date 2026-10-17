# Validation and provenance

This candidate is a mathematical illustration, not an experimentally validated
cryostat design. Its default inputs and all reference cases were independently
selected for public demonstration. They are not measurements, calibration results,
or a specification for real hardware.

## Three distinct claims

1. **Mathematical consistency:** analytical tests and an independently formulated
   numerical solver check the implemented equations and balances against one another.
   This does not establish that the simplified equations accurately model hardware.
2. **Numerical regression:** generated synthetic reference values and tests detect
   unintended changes to the stated equations and selected numerical cases.
3. **Experimental validation:** comparison with measured data and uncertainty
   analysis would be necessary to establish predictive accuracy for a real device.
   No such data or comparison is included here, and no experimental-validation claim
   is made.

## Analytical tests

The dependency-free JavaScript suite checks cylindrical conduction, series and
parallel resistance, exact fourth-power radiation factorization, Knudsen regimes,
heat-flow conservation, length and geometry scaling, convergence and diagnostics,
parameter sensitivity, and discontinuity-aware inverse lookup. It also exercises
input validation, state, formatting, and plotting logic.

The hard gas-model switches are discontinuous. The inverse lookup examines each
continuous branch independently, checks targets within jump gaps, and selects the
lowest-pressure match where a downward jump permits more than one solution.

## Synthetic heat-balance oracle

`reference/generate_reference.py` creates `reference/synthetic_cases.js` using only
the Python standard library. Its case inputs are independent synthetic choices, not
real geometry, pressure, or measurements. The 17 cases cover all gas regimes, both
sides of each switch, and variations in geometry, boundaries, materials, gas
parameters, length, and MLI count.

Unlike the browser's fixed-point resistance iteration, the oracle bisects directly
on total heat flow. For each trial flow it calculates the cold-side temperatures,
bisects the hot vacuum-gap temperature from the gas-plus-fourth-power-radiation
balance, and checks that flow against external convection and exact fourth-power
radiation. The algorithm is independent, although both implementations necessarily
share the Version 1 model equations and assumptions.

The regression suite compares total heat flow, four interface temperatures, Knudsen
number and regime against the generated synthetic cases. It verifies convergence
and finiteness and uses explicit tolerances appropriate to the temperature solver.
These cases are not a substitute for an experimental reference or an exhaustive
proof across the allowed parameter space.

## Run and reproduce

```sh
node tests/run.js
python3 scripts/check_release.py
```

To deliberately regenerate the tracked fixture:

```sh
python3 reference/generate_reference.py
```

The release checker regenerates the fixture into a temporary directory and compares
bytes, without modifying the repository. It inventories hidden and extensionless
files, checks imports and local assets, flags common credential/path patterns, and
rejects deployment workflows. These checks cannot establish numerical provenance
or guarantee privacy; review every file, generated artifact, and Git history before
publication.

## Interpretation limits

Input material and gas properties are constant, MLI is an idealized radiative
resistance, and axial/end effects, supports, penetrations, transient behavior, and
inner-gap radiation are omitted. The 0.2 mm-per-layer geometric warning assumption
does not enter any thermal resistance or heat-flow calculation. Solver convergence
is based on absolute temperature motion; it does not guarantee a small relative
branch-flow error. An exhausted iteration can leave the reported temperatures and
resistances at different iterates; such a result is diagnostic only.

See [PHYSICS.md](PHYSICS.md) for the equations and detailed limitations.
