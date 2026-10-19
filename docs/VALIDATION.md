# Validation and provenance

This candidate is a mathematical illustration, not an experimentally validated
cryostat design. Public example geometry and reference cases were independently
selected for illustration. The default 77.00 K coolant temperature and 0.01 K
prescribed offset were specified for this model. These are not measurements,
calibration results, or a specification for real hardware.

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
heat-flow conservation, length and geometry scaling, the prescribed 77.01 K copper
boundary and its separation from the 77.00 K coolant, convergence and diagnostics,
parameter sensitivity, and discontinuity-aware inverse lookup. It also exercises
input validation, state, formatting, and plotting logic.

For example, the gas tests check the implemented thresholds and equations, not
whether those thresholds are accurate for a particular gas or assembly. The
conservation tests check that the branch rates sum to the series flow within a
chosen numerical tolerance; they are not measurements of a cryostat.

The hard gas-model switches are discontinuous. The inverse lookup examines each
continuous branch independently, checks targets within jump gaps, and selects the
lowest-pressure match where a downward jump permits more than one solution.

## Synthetic heat-balance oracle

`reference/generate_reference.py` creates `reference/synthetic_cases.js` using only
the Python standard library. Its case inputs are independent synthetic choices, not
real geometry, pressure, or measurements. The 20 cases cover all gas regimes, both
sides of each switch, and variations in geometry, boundaries, materials, gas
parameters, length, and MLI count. One case explicitly exercises the 77.01 K modeled
copper boundary. Other cases retain independently selected boundary values.

Unlike the browser's fixed-point resistance iteration, the oracle bisects directly
on total heat flow. For each trial flow it calculates the cold-side temperatures,
bisects the hot vacuum-gap temperature from the gas, contact, and fourth-power radiation
balance, and checks that flow against external convection and exact fourth-power
radiation. The algorithm is independent, although both implementations necessarily
share the Version 2 model equations and assumptions. The N=0 contact path is
deliberately absent here, unlike the notebook's finite N=0 contact resistance.

The regression suite compares total heat flow, the three vacuum-branch heat rates,
four interface temperatures, gas conductivities and resistances, Knudsen number
and regime against the generated synthetic cases. It verifies convergence and
finiteness and uses explicit tolerances appropriate to the temperature solver.
For example, total heat flow is checked to a relative tolerance of `1e-8`,
interface temperatures to an absolute `2e-8 K`, and branch rates to an absolute
`1e-8 W` in these cases. These are software-test tolerances, not experimental
uncertainties.

These cases are not a substitute for an experimental reference or an exhaustive
proof across the allowed parameter space.

## Python notebook comparison

The Version 2 implementation was also compared locally with the supplied Python
notebook. That notebook and its original inputs and outputs are private and are
not included in this candidate, so that particular comparison cannot be reproduced
from this repository alone. Notebook cases may prescribe a different cold-side
temperature; `T_cold` remains the copper outer-surface boundary. The public
77.01 K default does not overwrite those reference inputs, and the displayed
coolant value does not enter the resistance network. Agreement between the two
programs checks implementation consistency, not physical accuracy.

## Run and reproduce

```sh
node tests/run.js
python3 -B -m unittest discover -s tests -p 'test_*.py'
python3 scripts/check_release.py
```

One local run of the JavaScript suite produced **225 passed, 0 failed**. The
browser interactions are manually checked separately; they are not implied by
the headless test count. A release-check failure must be resolved and the check
rerun before publication. The separate Python suite tests the release checker's
PNG policy; `-B` prevents it from creating bytecode in the candidate.

To deliberately regenerate the tracked fixture:

```sh
python3 reference/generate_reference.py
```

The release checker regenerates the fixture into a temporary directory and compares
bytes, without modifying the repository. It inventories hidden and extensionless
files, checks imports and local assets, flags common credential/path patterns, and
rejects deployment workflows. It also checks the designated screenshot's PNG
structure and rejects metadata chunks; this cannot inspect its visual content.
These checks cannot establish numerical provenance or guarantee privacy; review
every file, screenshot, generated artifact, and Git history before publication.

## Browser checks

Manual review covers parameter changes, separate main- and inner-gap pressures,
the MLI and geometry controls, the cross-section and thermal network, and the
pressure and MLI plots. This is an interaction check, not a numerical reference
or experimental validation; the automated suite also checks chart segmentation,
invalid-point handling, and diagram data.

## Interpretation limits

Most input material properties are constant, MLI mechanisms are idealized, and
axial/end effects, supports, penetrations, transient behavior, and
inner-gap radiation are omitted. Copper conduction is not solved: the 0.01 K drop
is prescribed and requires physical investigation, not experimental validation
inferred from a passing test. The 0.2 mm-per-layer drawing and clearance assumption
does not enter any thermal resistance or heat-flow calculation. Solver convergence
is based on absolute temperature motion; it does not guarantee a small relative
branch-flow error. An exhausted iteration can leave the reported temperatures and
resistances at different iterates; such a result is diagnostic only.

See [PHYSICS.md](PHYSICS.md) for the equations and detailed limitations.
