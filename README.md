# Cryostat thermal model

An interactive, dependency-free browser application for exploring a one-dimensional,
steady-state radial thermal-resistance network. The cross-section, network, plots,
sensitivity analysis, and inverse lookup respond to the same model inputs.

**All public defaults and examples are synthetic illustrations. They do not describe,
represent, or validate a real cryostat and are not a basis for engineering design.**
This is a local release candidate; no publishing or deployment is configured.

## Run locally

Serve this directory using Python, then open the local address in a modern browser:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open <http://127.0.0.1:8000/>. The application runs in the browser with no package
installation or build step. Node.js 18 or newer and Python 3.9 or newer are used
only for development and checks.

## Illustrative defaults and provenance

These values were selected independently for this public demonstration and approved
as illustrative inputs, not sourced from hardware measurements, calibrated data, or
a cryostat design. Lengths below are input dimensions; the radii follow from them.

| Input | Default |
| --- | --- |
| Cold radius; inner gap; inner wall | 8 mm; 6 mm; 2 mm |
| Vacuum gap; outer wall; length | 20 mm; 2 mm; 1.2 m |
| Derived radii | 8, 14, 16, 36, 38 mm |
| Ambient; cold boundary | 300 K; 90 K |
| Vacuum pressure; inner-gap pressure | 0.2 Pa; 10 Pa |
| MLI layers | 16 |
| Outer; inner wall conductivity | 205; 190 W/(m·K) |
| Surface emissivity | 0.10 |
| Continuum gas conductivity | 0.025 W/(m·K) |
| External convection coefficient | 8 W/(m²·K) |
| Gas bridge coefficient C | 2.5 |
| Molecular diameter | 3.6 × 10⁻¹⁰ m |
| Representative inner-gap gas temperature | 110 K |
| Main-gap mean-free-path coefficient | 0.006 m·Pa |
| Iteration cap; temperature tolerance | 60; 10⁻⁶ K |
| Illustrative inverse target | 2.2 W/m |
| Pressure chart range | 10⁻⁶ to 100,000 Pa |
| Fixed MLI-sweep pressure | 0.75 Pa |
| MLI-sweep counts | 0, 8, 16, 24, 32, 40, 48, 56, 64 |

The separate blanket-clearance warning uses an illustrative **0.2 mm per layer**
solely as a geometric screening assumption. It is not a blanket specification and
does not enter the thermal solver, resistances, or heat flow. Actual blanket
thickness depends on construction and compression.

The Stefan–Boltzmann and Boltzmann constants, Torr conversion, Knudsen regime
thresholds, and Version 1 equations are retained mathematical/model definitions;
they are not measured properties of the illustrative example.

## Validation and checks

```sh
node tests/run.js
python3 scripts/check_release.py
```

The tests include analytical identities, physical scaling and conservation,
convergence and sensitivity, and discontinuity-aware inverse lookup. Separately,
17 independently selected synthetic cases are evaluated by a Python heat-balance
oracle using nested bisection and compared with the browser's fixed-point solver.
The generated cases are regression artifacts, not measured data. Regenerate them
with `python3 reference/generate_reference.py`; the release checker instead
regenerates in a temporary directory and compares without changing the fixture.

Mathematical consistency tests whether the stated equations agree with analytical
relations and a differently formulated solver. Numerical regression detects changes
relative to synthetic expected values. Neither is experimental validation: no
hardware measurements, calibration, uncertainty study, or real-device comparison
are included. See [validation](docs/VALIDATION.md) and [physics](docs/PHYSICS.md).

The automated release checker inventories all text files, checks local imports and
assets, flags common privacy markers, checks for deployment workflows and package
dependencies, and reproduces the fixture. It cannot prove provenance, detect every
sensitive number, or review Git history; human review remains necessary.

## Limitations

The model assumes constant properties and steady radial heat flow. MLI affects only
idealized radiation; spacer/contact conduction and blanket geometry are not solved.
Supports, penetrations, axial/end effects, transient behavior, coolant dynamics,
and radiation in the inner gap are omitted. The gas regime changes are discontinuous;
an inverse target may be unreachable or have multiple roots. Absolute temperature
convergence does not ensure accurate relative branch heat balance; a warning is
shown when the balance is poor. If iteration does not converge, its outputs may be
internally inconsistent and are diagnostic only.

## Repository layout

- `src/model/` contains the equations, validation, solver, and sweeps.
- `src/ui/`, `src/viz/`, and `src/plots/` contain the interface and visualizations.
- `tests/` contains analytical and synthetic regression checks.
- `reference/` contains the independent synthetic oracle and its generated cases.
- `scripts/check_release.py` performs local release checks.

See [architecture](docs/ARCHITECTURE.md) for more detail. This candidate has no
Pages deployment workflow; publication requires a separate, explicit decision.
