#!/usr/bin/env python3
"""Generate synthetic Version 2 cases with an independent heat-balance oracle.

This is not an experimental measurement or a copy of the application's
fixed-point algorithm. Nested bisection solves the heat balance directly.
"""
import argparse
import json
import math
from pathlib import Path

SIGMA = 5.670374419e-8
BOLTZMANN = 1.380649e-23

# Independently selected numerical toys, unrelated to a physical device.
BASE = {
    "r_cu": 0.011, "d_inner_gap": 0.004, "t_inner_wall": 0.0015,
    "d_vacuum_gap": 0.018, "t_outer_wall": 0.001,
    "length": 0.85, "T_amb": 315.0, "T_cold": 105.0,
    "P_vacuum": 0.4, "P_inner_gap": 7.0, "n_mli": 12,
    "k_outer_wall": 155.0, "k_inner_wall": 175.0, "eps_al": 0.14,
    "k_air": 0.031, "h_conv": 6.5, "C": 2.2,
    "d_air": 4.0e-10, "T_inner_gap": 125.0,
    "mfp_coefficient": 0.0043, "max_iterations": 80, "tolerance": 1e-8,
}


def conductivity(k, kn, coefficient, layers=0):
    if kn < 0.01:
        return k
    if kn > 10.0:
        return k / ((layers + 1) * coefficient * kn)
    return k / (1.0 + (layers + 1) * coefficient * kn)


def resistance(outer, inner, conductivity_value, length):
    return math.log(outer / inner) / (2.0 * math.pi * conductivity_value * length)


def solve_heat_balance(v):
    """Solve in Q and in T2, using exact fourth-power radiation heat flows."""
    rc = v["r_cu"]
    ri = rc + v["d_inner_gap"]
    ro = ri + v["t_inner_wall"]
    rvi = ro + v["d_vacuum_gap"]
    re = rvi + v["t_outer_wall"]
    length = v["length"]
    inner_lambda = BOLTZMANN * v["T_inner_gap"] / (
        math.sqrt(2.0) * math.pi * v["d_air"] ** 2 * v["P_inner_gap"]
    )
    inner_kn = inner_lambda / v["d_inner_gap"]
    inner_air_k = 0.0241 * (v["T_inner_gap"] / 273.15) ** 0.81
    inner_k = conductivity(inner_air_k, inner_kn, v["C"])
    gap_r = resistance(ri, rc, inner_k, length)
    inner_r = resistance(ro, ri, v["k_inner_wall"], length)
    outer_r = resistance(re, rvi, v["k_outer_wall"], length)
    kn = v["mfp_coefficient"] / (v["P_vacuum"] * v["d_vacuum_gap"])
    gas_k = conductivity(v["k_air"], kn, v["C"], v["n_mli"])
    gas_r = resistance(rvi, ro, gas_k, length)
    radiation_factor = 2.0 * math.pi * ro * length * SIGMA / (
        (v["n_mli"] + 1) *
        (1.0 / v["eps_al"] + (ro / rvi) * (1.0 / v["eps_al"] - 1.0))
    )
    # The empirical contact conductance uses the notebook's coefficient,
    # layers-per-centimetre assumption, inner-cylinder area, and N+1 factor.
    # Unlike the notebook, a nonexistent blanket has no contact conduction.
    solid_factor = (8.95e-8 * 20.0 ** 2.63 * 2.0 * math.pi * ro * length /
                    (2.0 * (v["n_mli"] + 1))) if v["n_mli"] > 0 else 0.0
    outer_area = 2.0 * math.pi * re * length

    def state(q):
        t4 = v["T_cold"] + q * gap_r
        t3 = t4 + q * inner_r
        lo, hi = t3, t3 + q * gas_r
        for _ in range(90):
            t2 = (lo + hi) / 2.0
            vacuum_q = ((t2 - t3) / gas_r + radiation_factor * (t2**4 - t3**4)
                        + solid_factor * (t2**2 - t3**2))
            if vacuum_q < q:
                lo = t2
            else:
                hi = t2
        t2 = (lo + hi) / 2.0
        t1 = t2 + q * outer_r
        external_q = outer_area * (
            v["h_conv"] * (v["T_amb"] - t1) +
            SIGMA * v["eps_al"] * (v["T_amb"]**4 - t1**4)
        )
        return q - external_q, (t1, t2, t3, t4)

    lo, hi = 0.0, (v["T_amb"] - v["T_cold"]) / (gap_r + inner_r + outer_r)
    if not (state(lo)[0] <= 0.0 and state(hi)[0] >= 0.0):
        raise ArithmeticError("heat-balance root is not bracketed")
    for _ in range(100):
        mid = (lo + hi) / 2.0
        if state(mid)[0] < 0.0:
            lo = mid
        else:
            hi = mid
    q = (lo + hi) / 2.0
    residual, temperatures = state(q)
    if abs(residual) > 1e-9 * max(1.0, abs(q)):
        raise ArithmeticError("heat-balance residual too large")
    regime = "continuum" if kn < 0.01 else ("free-molecular" if kn > 10 else "transition")
    t1, t2, t3, t4 = temperatures
    q_gas = (t2 - t3) / gas_r
    q_rad = radiation_factor * (t2**4 - t3**4)
    q_solid = solid_factor * (t2**2 - t3**2)
    return {
        "Q": q, "T1": t1, "T2": t2, "T3": t3, "T4": t4,
        "Kn": kn, "regime": regime, "k_eff_gas": gas_k,
        "k_eff_gap": inner_k, "R_gas": gas_r, "R_gap": gap_r,
        "R_solid_MLI": ((t2 - t3) / q_solid if q_solid else None),
        "Q_gas": q_gas, "Q_rad_vacuum": q_rad, "Q_solid_MLI": q_solid,
    }


def make_cases():
    cases = []

    def add(name, **changes):
        inputs = dict(BASE)
        inputs.update(changes)
        cases.append({"name": name, "inputs": inputs, "expected": solve_heat_balance(inputs)})

    for label, pressure in [
        ("deep-vacuum", 1e-5), ("low-pressure", 0.002),
        ("transition", 0.4), ("transition-high", 2.0),
        ("continuum", 200.0), ("high-pressure", 20000.0),
    ]:
        add(label, P_vacuum=pressure)
    for name, threshold in [("molecular", 10.0), ("continuum", 0.01)]:
        boundary = BASE["mfp_coefficient"] / (BASE["d_vacuum_gap"] * threshold)
        add(name + "-below", P_vacuum=boundary * (1.0 - 1e-7))
        add(name + "-above", P_vacuum=boundary * (1.0 + 1e-7))
    add("no-insulation", n_mli=0)
    add("one-layer", n_mli=1)
    add("more-insulation", n_mli=40)
    add("alternate-length", length=2.3)
    add("alternate-geometry", r_cu=0.009, d_inner_gap=0.007, d_vacuum_gap=0.025)
    add("alternate-boundaries", T_amb=330.0, T_cold=130.0)
    add("prescribed-copper-boundary", T_cold=77.01)
    add("alternate-materials", k_outer_wall=120.0, k_inner_wall=160.0,
        eps_al=0.22, k_air=0.027, h_conv=9.0)
    add("alternate-inner-gas", P_inner_gap=20.0, T_inner_gap=140.0, d_air=3.8e-10)
    add("inner-gap-90K", T_inner_gap=90.0)
    return cases


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("synthetic_cases.js"))
    args = parser.parse_args()
    cases = make_cases()
    content = "// Generated synthetic Version 2 heat-balance cases; not experimental data.\n"
    content += "export default " + json.dumps(cases, indent=2, sort_keys=True, allow_nan=False) + ";\n"
    args.output.write_text(content, encoding="utf-8")
    print("Generated {} independent synthetic cases.".format(len(cases)))


if __name__ == "__main__":
    main()
