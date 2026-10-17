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
scripts/check_release.py    Release checks: link integrity, Pages-safety, privacy scan
```

## Principles

**The model does not know the UI exists.** Nothing under `src/model/` imports from
`src/ui/`, `src/viz/` or the DOM. That is what lets the same code run headless in the
test suite and under a plain JavaScript shell, and it is why the regression tests are
possible at all.

**One source of truth for geometry.** `resolveGeometry()` turns the input stack into
radii. The solver and the cross-section drawing both consume the result, so the picture
cannot drift away from the thing being solved. There is no second set of numbers for
drawing.

**One source of truth for state.** The store holds the inputs; views are pure functions
of it. No panel keeps its own copy of a parameter, so panels cannot disagree. A change
goes `setInput → notify → render everything`, and there is no second update path.

**Derived data is computed in the model, not reconstructed in views.** `solve()` returns
branch heat rates, temperature drops, fractions and gas state alongside the raw
resistances, so no view re-implements a piece of physics to draw something. If the
picture needs a number, the model provides it. The same applies to the regime boundaries
the charts shade: `regimeBoundaryPressures()` lives in `src/model/gas.js`, so a band on a
chart cannot disagree with the regime the solver reports.

**Presentation of the interface temperatures has one definition too.**
`src/data/interfacePoints.js` holds the name, description and series colour for T1–T4 and
the two boundaries. The results table, the temperature plot and the cross-section
callouts all read it, so the same quantity is the same colour everywhere.

## Data flow

```
user input ──► store.setInput ──► invalidate memo keys
                                        │
                                        ▼
                         derived.calc  (one solve)
                         derived.pressureSweep  (240 solves)
                         derived.mliSweep       (9 solves)
                         derived.sensitivity    (24 solves)
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

Each derived computation caches against a key built from the inputs it actually depends
on, with the swept variable excluded:

| Derived | Key |
| --- | --- |
| `calc` | all inputs |
| `pressureSweep` | all inputs except `P_vacuum` |
| `mliSweep` | all inputs except `n_mli` and `P_vacuum`, plus the chosen sweep pressure |
| `sensitivity` | all inputs |

Dependencies are excluded by name rather than hashed wholesale, because that is the
version that stays correct: a missed dependency shows up as a stale chart, which is
exactly the failure an interactive model must not have.

## Why no framework or build step

The application is plain ES modules loaded directly by the browser. No bundler, no
transpiler, no dependencies.

The reasons:

- **Deployment correctness.** Every path in `index.html` is relative, so the site works
  identically at a domain root and under `/<repository-name>/` on GitHub Pages. The
  usual base-path breakage has no way to occur.
- **The source that ships is the source you read.** Anybody opening the repository or
  the deployed page sees the same files, which matters more for something whose purpose
  is to be inspected than a few kilobytes of bundling would.
- **No dependency surface.** Nothing to audit, update or have break in two years.
- **The tests run anywhere.** A suite with no framework dependency runs under Node, and
  equally under a bare JavaScript shell.

The trade is real: no type checking, no tree shaking, no hot reload, and DOM
construction is done by hand through small helpers rather than by a view library. For a
single-page tool of this size that is a reasonable bargain. For a larger application it
would not be, and the model layer is deliberately framework-agnostic so it could be
lifted into one unchanged.

Types are documented with JSDoc annotations throughout. They are documentation, not
enforcement: no type checker runs in this project.

## Visualisation

**Cross-section** (`src/viz/crossSection.js`). Annuli drawn from the resolved radii,
scaled so the outermost drawn radius fits the canvas — proportions are true and a scale
bar carries absolute size. Heat flow is drawn along the left-hand radius: series
elements get one arrow, parallel pairs get two whose widths come from the solver's
branch heat rates. Arrowheads use `markerUnits="userSpaceOnUse"` so they do not scale
with stroke width. Each layer is a focusable, clickable hit region.

**Thermal network** (`src/viz/network.js`). The resistance ladder as the solver
assembles it, with the two parallel pairs drawn as genuine branches rather than as
further links in the chain, each annotated with its resistance and the share of heat it
carries.

**Plots** (`src/plots/`). Hand-rolled SVG. Written rather than imported because these
plots need log axes with decade minor ticks, a series segmented by gas regime, and hover
readout bound to model records rather than to bare coordinates. Pressure axes are drawn
in Torr so that decade ticks land on round numbers in the unit displayed.

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
