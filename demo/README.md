# Shuttle Bus Chaos

Interactive demo reproducing the deterministic-chaos model of shuttle buses from
**T. Nagatani, *Chaos control and schedule of shuttle buses*, Physica A 371 (2006) 683–691.**

Two buses shuttle between an origin and a destination. Each bus loads the
passengers that have accumulated since the previous bus arrived, then drives out
and back. The whole system reduces to the dimensionless nonlinear map

```
T_i(m+1) = T_i(m) + Γ · H_i(m) + 1 / (1 + S_i · H_i(m))
```

where `H_i(m)` is the time headway — the gap to whichever bus reached the origin
last. Because buses pass each other freely, that order flips from trip to trip,
and the schedule turns periodic and then chaotic as the loading parameter `Γ`
grows. Speedup `S_i` pushes the onset of chaos to higher load.

## What you can do

- Drag `Γ`, `S₁`, `S₂` and watch the regime change live (Regular / Periodic / Chaotic / Divergent).
- Click the bifurcation diagram to jump straight to a value of `Γ`.
- Use the presets (Period-11, Onset of chaos, No speedup, …) which match the cases in the paper.
- Watch the route animation: buses dwell to board, then drive out and back, and **overtake** each other.

## Run it

Requires **Node.js 18+**.

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

To build a static bundle for embedding in a report or website:

```bash
npm run build      # output goes to dist/
npm run preview    # serve the built bundle locally
```

## Project layout

```
shuttle-bus-chaos/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx              # React entry
    ├── App.jsx              # mounts the demo
    ├── index.css            # Tailwind import + base styles
    └── ShuttleBusChaos.jsx  # the whole demo (simulation + UI + canvas plots)
```

Stack: React 18, Vite 5, Tailwind CSS 4, lucide-react. All plots are drawn on
plain `<canvas>` — no charting library.
