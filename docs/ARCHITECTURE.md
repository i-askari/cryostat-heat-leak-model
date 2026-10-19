# Architecture

## Shape of the project

```
index.html                  Application shell; the only HTML file
src/
  model/                    Physics. No DOM, no UI imports.
    constants.js            Physical constants, regime thresholds, default inputs
    units.js                SI ↔ display conversions
    geometry.js             Radial build; input validation
    gas.js                  Mean free path, Knudsen number, effective conductivity
    resistances.js          Every resistance term
    solver.js               Fixed-point solve; the validated entry point
    sweeps.js               Pressure / MLI / parameter sweeps; inverse lookup
    index.js                Public surface of the model
  state/
    store.js                Inputs, UI state, memoised derived results, URL round-trip
  ui/                       Panels: parameters, results, breakdown, explain, analysis
  viz/                      Cross-section and thermal-network SVG
  plots/                    Plotting primitives and the analysis charts
  data/explanations.js      Physics copy, written against live values
  utils/                    DOM helpers, number formatting
  styles/app.css            Design tokens and layout
tests/                      Headless suite; runs under Node or JavaScriptCore
reference/                  Independent synthetic oracle and generated test cases
docs/                       This document, PHYSICS.md, VALIDATION.md
  assets/                   Captured application screenshot
scripts/check_release.py    Release checks: link integrity, Pages-safety, privacy scan
```

## Principles

**The model does not know the UI exists.** Nothing under `src/model/` imports from
`src/ui/`, `src/viz/` or the DOM. That is what lets the same code run headless in the
test suite and under a plain JavaScript shell, and it is why the regression tests are
possible at all.

**One source of truth for modeled geometry.** `resolveGeometry()` turns the input
stack into radii. The solver and cross-section both consume those radii. The coolant
bore and blanket spacing are explicitly schematic: there is no specified bore radius,
and the 0.2 mm/layer visualization/clearance heuristic is not used by the solver.

**Centralized state.** The store holds model inputs and interface state. Input
changes use `setInput` or `setInputs`; interface selections use `setUi`.
Subscribers are notified, and the views update from the store. Controls are
retained in the DOM rather than reconstructed on each update.

The historical input `T_cold` is the prescribed copper outer-surface temperature,
not the LN₂ temperature. The coolant control maps its value through the fixed 0.01 K
offset to `T_cold`; calculated outputs expose both boundary temperatures. Retaining
`T_cold` lets synthetic and notebook-reference cases continue to supply their actual
modeled cold boundary without adding a copper resistance or a coolant heat-load solve.

**Derived data is computed in the model, not reconstructed in views.** `solve()` returns
branch heat rates, temperature drops, fractions and gas state alongside the raw
resistances, so no view re-implements a piece of physics to draw something. If the
picture needs a number, the model provides it. The same applies to the regime boundaries
the charts shade: `regimeBoundaryPressures()` lives in `src/model/gas.js` and uses
the same thresholds as the solver.

**Presentation of the interface temperatures has one definition too.**
`src/data/interfacePoints.js` holds the name, description and series colour for T1–T4 and
the two boundaries. The results table, the temperature plot and the cross-section
callouts all read it, so the same quantity is the same colour everywhere.

## Data flow

```
user input ──► store.setInput / setInputs ──► notify subscribers
                                        │
                                        ▼
                         derived getters check their memo keys
                         derived.calc  (one solve)
                         derived.pressureSweep  (240 solves)
                         derived.mliSweep       (9 solves)
                         derived.sensitivity    (two solves per screened input)
                                        │
                        ┌───────────────┼────────────────┬──────────────┐
                        ▼               ▼                ▼              ▼
                  parameters      cross-section     results and     analysis
                   panel          and network       breakdown        charts
```

Renders are batched into an animation frame, so dragging a slider re-solves at most once
per frame.

**Controls are mounted once, not rebuilt.** The parameter panel, the target-lookup field
and the analysis tab strip are built on first render and afterwards only have their
values patched. This is a correctness requirement rather than an optimisation: replacing
the node under the pointer aborts a slider drag mid-gesture, and replacing the node under
the caret drops focus after a single keystroke. `update()` also skips writing to whichever
element currently has focus, because rewriting a field from state while it is being typed
into destroys a partial entry such as `1.` as soon as it parses to `1`.

The URL is rewritten on a 350 ms trailing timer rather than on every input event. A drag
emits an event per pointer move, and browsers rate-limit the History API — Safari throws
after 100 `replaceState` calls in 30 seconds. The write is also wrapped in a `try`, so a
throttled History API degrades the shareable link rather than the application.

## Memoisation

Each derived computation caches against a key built from the model inputs, with
the swept variable excluded and sweep-specific settings added as needed. Keys
are checked when a getter is read:

| Derived | Key |
| --- | --- |
| `calc` | all inputs |
| `pressureSweep` | all inputs except `P_vacuum` |
| `mliSweep` | all inputs except `n_mli` and `P_vacuum`, plus the chosen sweep pressure |
| `sensitivity` | all inputs |

The current main-gap pressure is the MLI-sweep default; the user can instead select the
synthetic reference pressure. A missed dependency can leave a chart stale, so
the store tests exercise cache invalidation for individual inputs.

## Why no framework or build step

The application is plain ES modules loaded directly by the browser. No bundler, no
transpiler, no dependencies.

The browser loads the same source files that can be inspected in the repository.
Relative asset paths also support serving the directory from a local HTTP server.
The tests use no test-framework dependency and can be run with Node or a compatible
JavaScriptCore shell. No hosting or deployment is configured by this candidate.

The trade is real: no type checking, no tree shaking, no hot reload, and DOM
construction is done by hand through small helpers rather than by a view library. For a
single-page tool of this size that is a reasonable bargain. For a larger application it
would not be, and the model layer is deliberately framework-agnostic so it could be
lifted into one unchanged.

Types are documented with JSDoc annotations throughout. They are documentation, not
enforcement: no type checker runs in this project.

## Visualisation

**Cross-section** (`src/viz/crossSection.js`). Modeled radii come from the resolved
geometry and carry a scale bar. The central coolant bore and separated MLI are schematic,
not extra engineering inputs; the latter uses the illustrative drawing/clearance
heuristic. Heat-flow indicators use the solver's branch heat rates. Each selected
layer is a focusable, clickable hit region.

**Thermal network** (`src/viz/network.js`). The resistance ladder as the solver
assembles it, with the ambient pair and vacuum triple drawn as branches and the inner
gas gap as gas conduction only. It ends at the prescribed copper surface; the coolant
temperature is shown separately without an invented copper resistance.

**Plots** (`src/plots/`). SVG charts use log axes, regime-separated pressure
series and hover readouts bound to model records. Non-converged or non-finite
sweep points are excluded from the plotted lines and identified by a warning.
Pressure axes are displayed in Torr. The pressure-sweep CSV retains diagnostic
fields including convergence, finiteness and iteration count.

**Inverse lookup** (`src/model/sweeps.js`). The analysis interface requests a
target in W/m; the model searches each continuous pressure branch in log-pressure
space and checks the returned heat rate. The target belongs to interface state,
while geometry, pressures and material properties belong to model input state.

## Testing

`tests/harness.js` is a small runner: `describe`, `it`, and assertions including a
relative-tolerance `close` and an absolute `near`, which is the distinction that matters
when comparing physical quantities. It has no dependencies and no runtime-specific code,
so `tests/run.js` runs under Node or JavaScriptCore unchanged.

The store is covered headlessly too. It guards every `window` access, so
`tests/store.test.js` can construct one under a bare JavaScript shell and assert that each
memoised sweep is invalidated by exactly the inputs it depends on. A stale cache is the
characteristic failure of an interactive model — the numbers move and a plot does not —
and it is not something a physics test would catch.

Synthetic oracle data is emitted as an ES module rather than JSON so the suite needs no
file-system access and behaves identically in both runtimes.

`tests/test_release_check.py` separately tests the release checker's narrow PNG
screenshot policy using Python's standard library. The checker validates binary
structure, not whether the screenshot's visible content is suitable for release.
