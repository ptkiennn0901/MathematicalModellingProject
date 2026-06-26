# Chaos Control and Schedule of Shuttle Buses

This repository reproduces the model of Takashi Nagatani, *"Chaos control and
schedule of shuttle buses"* (Physica A **371**(2), 2006, 683–691): a **two-bus
shuttle system** whose schedule transitions from regular to periodic to chaotic
as the passenger load grows, and in which a per-bus speedup can suppress that
chaos. The code here is the simulator that generates the bus dynamics together
with the notebooks that analyse it.

## Team

Supervisor: Dr. Bui Quoc Trung.


| Member | Student ID |
|---|---|
| Doi Sy Thang | 20225528 |
| Nguyen Tung Phong | 20225517 |
| Nguyen Luong Uy | 20235574 |
| Le Anh Minh | 20235530 |
| Pham Trung Kien | 20235129 |

## The model

The dimensionless arrival time of bus *i* at the origin on trip *m* follows the
nonlinear map

```
T_i(m+1) = T_i(m) + Γ·(T_i(m) − T_i'(m')) + 1 / (1 + S_i·(T_i(m) − T_i'(m')))
```

where `T_i'(m')` is the arrival of whichever bus came in just before bus *i*.
Two parameters drive the dynamics:

- **Γ (loading parameter)** — how strongly passenger demand delays a bus. Larger
  Γ destabilises the schedule.
- **S_i (speedup parameter)** — how much bus *i* speeds up to recover the loading
  delay. Larger S_i pulls the schedule back toward regularity.

Two quantities are read out from the simulated arrivals:

- **Headway `H_i(m)`** — the gap between bus *i*'s arrival and the arrival just
  before it (the buses overtake freely, so "the bus before" is decided by arrival
  order, not a fixed bus).
- **Tour time `ΔT_i(m) = T_i(m+1) − T_i(m)`** — the time bus *i* takes to complete
  one full cycle.

For the paper's main case `S1=0.5, S2=0.2`, the schedule stays regular up to
`Γ ≈ 0.167`, then turns periodic and finally chaotic, with the fluctuations
diverging as `Γ → 2`.

## Repository structure

```
MathematicalModellingProject/
├── README.md
├── src/
│   ├── simulator/                          # Core engine — shared by every notebook
│   │   ├── simulation.py                   #   the nonlinear-map iterator
│   │   └── data_export.py                  #   run the map and write results to CSV
│   └── model_analysis/                     # Jupyter notebooks — one experiment each
│       ├── shuttle_bus_headway_analysis.ipynb
│       ├── tour_time_analysis.ipynb
│       ├── return_map_analysis.ipynb
│       ├── mean_rms_analysis.ipynb
│       ├── phase_diagram.ipynb
│       └── data/                           # CSV outputs written by data_export.py
└── shuttle-bus-chaos/                      # Interactive web demo (React + Vite)
```

### `src/simulator/` — the simulation engine

- **`simulation.py`** — `simulate_bus_system(T1_initial, T2_initial, gamma, S1, S2, num_trips)`
  iterates the map for two buses and returns the arrivals as a single list of
  `[time, bus_id, trip_number, used_flag]` records, sorted in chronological order
  (so the two buses are interleaved). It is deterministic — no random noise, so a
  given set of parameters always produces the same trajectory.
- **`data_export.py`** — wraps the simulator and writes CSV into
  `model_analysis/data/`:
  - `generate_csv_data(...)` — one run, every trip record.
  - `generate_sweep_csv(...)` — sweep over Γ and write per-Γ steady-state
    statistics (mean and standard deviation of headways and tour times).

## Interactive demo

[`Demo`](shuttle-bus-chaos/README.md) is a browser demo (React +
Vite) that runs the same map live: you drag Γ, S₁, S₂ and watch the schedule
switch between regular, periodic and chaotic, with a bifurcation diagram,
paper-matched presets and an animated route.

## Model analysis

To run any of the experiments, install the requirements, `cd` into the notebook
folder, and open the notebook:

```bash
pip install numpy matplotlib jupyter
cd src/model_analysis
jupyter notebook <notebook>.ipynb
```

### Headway — `shuttle_bus_headway_analysis.ipynb`

Iterates the map for both buses and samples the steady-state headway `H₁(m)`
against the loading parameter Γ for four speedup configurations (no speedup, equal
speedup, and two unequal cases). It shows that without speedup the headway is
irregular over the whole range, equal speedup pushes the onset of fluctuation to
`Γ ≈ 0.167`, and unequal speedup produces a richer periodic-then-chaotic structure
with transitions at Γ = 0.167, 0.248 and 0.407.

### Tour time — `tour_time_analysis.ipynb`

Studies the tour time `ΔT_i(m) = T_i(m+1) − T_i(m)` of each bus for the
asymmetric case `S1=0.5, S2=0.2`, sweeping Γ over `[0, 2]`. Below the first
transition every tour collapses to a single value that grows with Γ; past it the
tour time splits into periodic branches and then a broadening chaotic band. The
notebook also examines why the two buses diverge: bus 1 (larger speedup) leaves
the regular regime first with a non-monotonic fluctuation, while bus 2 oscillates
ever more strongly as the load grows.

### Return map — `return_map_analysis.ipynb`

Builds the Poincaré return map `H₁(m+1)` vs `H₁(m)` of bus 1 over steady-state
trips for several Γ. The shape of the point cloud reveals the dynamics: a
period-11 orbit (11 isolated points) at Γ = 0.2, one-band chaos at Γ = 0.3,
two-band chaos at Γ = 0.5, and fully developed complex chaos at Γ = 0.8. It also
zooms into the period-11 orbit and its repeating headway time series.

### Mean and RMS — `mean_rms_analysis.ipynb`

Reduces each steady-state window to summary statistics — the mean and the RMS
fluctuation of the headways and tour times — across Γ for `S1=0.5, S2=0.2`. The
mean gives the average schedule, the RMS measures the wobble around it: near zero
in the regular regime, lifting off at Γ = 0.167, and growing through the periodic
and chaotic regimes marked by the transition points.

### Phase diagram — `phase_diagram.ipynb`

Maps the boundary between regular and non-regular motion in the `(Γ, S)`
parameter space. For each S it locates the critical Γ where the bus-2 headway RMS
rises sharply; the collected critical points form a monotonic, nonlinear phase
boundary showing that a larger speedup S sustains a higher passenger load before
the schedule destabilises.

