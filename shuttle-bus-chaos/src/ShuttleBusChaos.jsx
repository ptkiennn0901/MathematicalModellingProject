import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Play, Pause, RotateCcw, ChevronRight, Bus, Info } from "lucide-react";

/*
  Nagatani shuttle-bus chaos demo.
  Nonlinear map (dimensionless):
    T_i(m+1) = T_i(m) + Gamma * H_i(m) + 1 / (1 + S_i * H_i(m))
  where H_i(m) is the headway = arrival time of bus i minus the arrival time of
  whichever bus reached the origin just before it (order changes as buses overtake).
*/

// ----- palette -----
const C = {
  bg: "#0E1116",
  panel: "#151A21",
  panel2: "#11161C",
  border: "#232B36",
  grid: "#1E2530",
  text: "#E6EDF3",
  muted: "#8B98A8",
  amber: "#F5A524",
  teal: "#2DD4BF",
  rose: "#FB7185",
};
const BUS = ["#F5A524", "#38BDF8", "#A78BFA", "#34D399"];

// ----- simulation core -----

// Lean sweep: returns last `keep` headways of bus 0 only (no object allocation).
function bus0Headways(gamma, S, nBuses, nTrips, keep) {
  const T = new Float64Array(nBuses);
  for (let i = 0; i < nBuses; i++) T[i] = i / nBuses;
  let lastT = NaN;
  const ring = new Float64Array(keep);
  let len = 0, head = 0;
  const total = nBuses * nTrips;
  let diverged = false;
  for (let e = 0; e < total; e++) {
    let i = 0;
    for (let k = 1; k < nBuses; k++) if (T[k] < T[i]) i = k;
    const t = T[i];
    if (t > 1e7 || !isFinite(t)) { diverged = true; break; }
    const H = isNaN(lastT) ? 1 / nBuses : t - lastT;
    lastT = t;
    if (i === 0) {
      ring[head] = H;
      head = (head + 1) % keep;
      if (len < keep) len++;
    }
    T[i] = t + gamma * H + 1 / (1 + S[i] * H);
  }
  // unwrap ring in order
  const out = new Array(len);
  for (let j = 0; j < len; j++) out[j] = ring[(head - len + j + keep) % keep];
  return { hs: out, diverged };
}

// Full run: per-bus list of {t, H}, used for the route animation + plots.
function simulateRun(gamma, S, nBuses, nTrips) {
  const T = new Float64Array(nBuses);
  for (let i = 0; i < nBuses; i++) T[i] = i / nBuses;
  let lastT = NaN, diverged = false;
  const perBus = Array.from({ length: nBuses }, () => []);
  const total = nBuses * nTrips;
  for (let e = 0; e < total; e++) {
    let i = 0;
    for (let k = 1; k < nBuses; k++) if (T[k] < T[i]) i = k;
    const t = T[i];
    if (t > 1e7 || !isFinite(t)) { diverged = true; break; }
    const H = isNaN(lastT) ? 1 / nBuses : t - lastT;
    lastT = t;
    perBus[i].push({ t, H });
    T[i] = t + gamma * H + 1 / (1 + S[i] * H);
  }
  return { perBus, diverged };
}

function classifyRegime(hs, diverged) {
  if (diverged) return { label: "Divergent", color: C.rose, note: "Delay grows without bound — buses bunch permanently." };
  if (hs.length === 0) return { label: "—", color: C.muted, note: "" };
  const tail = hs.slice(-120);
  const set = new Set(tail.map((h) => Math.round(h * 1000)));
  const k = set.size;
  if (k <= 1) return { label: "Regular", color: C.teal, note: "Constant headway — buses run on a fixed schedule." };
  if (k <= 16) return { label: `Periodic (period ${k})`, color: C.amber, note: "Headway cycles through a fixed set of values." };
  return { label: "Chaotic", color: C.rose, note: "Aperiodic headway — schedule is unpredictable." };
}

// crisp canvas helper
function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function binSeg(arr, t) {
  // largest m with arr[m].t <= t
  let lo = 0, hi = arr.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].t <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

// ----- presets (from the paper) -----
const PRESETS = [
  { name: "Regular", g: 0.10, s1: 0.5, s2: 0.2 },
  { name: "Period-11", g: 0.20, s1: 0.5, s2: 0.2 },
  { name: "Onset of chaos", g: 0.26, s1: 0.5, s2: 0.2 },
  { name: "Deep chaos", g: 0.50, s1: 0.5, s2: 0.2 },
  { name: "No speedup", g: 0.30, s1: 0.0, s2: 0.0 },
  { name: "Equal speedup", g: 0.30, s1: 0.2, s2: 0.2 },
];

export default function ShuttleBusChaos() {
  const [gamma, setGamma] = useState(0.2);
  const [s1, setS1] = useState(0.5);
  const [s2, setS2] = useState(0.2);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);

  const nBuses = 2; // the paper studies exactly two shuttle buses
  const S = useMemo(() => [s1, s2], [s1, s2]);

  // bifurcation depends only on the two speedup parameters
  const bifData = useMemo(() => {
    const steps = 320, gMax = 2.0;
    const pts = [];
    for (let i = 0; i < steps; i++) {
      const g = 0.002 + (gMax - 0.002) * (i / (steps - 1));
      const { hs, diverged } = bus0Headways(g, S, nBuses, 900, 160);
      if (!diverged) for (const h of hs) pts.push([g, h]);
    }
    return pts;
  }, [S]);

  // live run for animation + plots
  const live = useMemo(() => {
    const r = simulateRun(gamma, S, nBuses, 360);
    const ok = r.perBus.every((b) => b.length > 30);
    const start = ok ? r.perBus[0][Math.min(140, r.perBus[0].length - 5)].t : 0;
    const end = ok ? Math.min(...r.perBus.map((b) => b[b.length - 1].t)) - 1e-6 : 1;
    // bus0 post-transient headways for plots
    const hs0 = ok ? r.perBus[0].slice(140).map((x) => x.H) : [];
    return { ...r, start, end, hs0, ok };
  }, [gamma, S, nBuses]);

  const regime = useMemo(() => classifyRegime(live.hs0, live.diverged), [live]);
  const maxH = useMemo(() => {
    const m = live.hs0.length ? Math.max(...live.hs0) : 1;
    return Math.max(1.2, Math.min(6, m * 1.25));
  }, [live]);

  // ---------- bifurcation drawing ----------
  const bifRef = useRef(null);
  const drawBif = useCallback(() => {
    const cv = bifRef.current; if (!cv) return;
    const { ctx, w, h } = fitCanvas(cv);
    const padL = 38, padB = 24, padT = 10, padR = 8;
    const gMax = 2.0, hMax = 6;
    const X = (g) => padL + (g / gMax) * (w - padL - padR);
    const Y = (v) => h - padB - (v / hMax) * (h - padT - padB);
    ctx.clearRect(0, 0, w, h);
    // grid
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.fillStyle = C.muted;
    ctx.font = "10px ui-monospace, monospace";
    for (let gx = 0; gx <= 2; gx += 0.5) {
      ctx.beginPath(); ctx.moveTo(X(gx), padT); ctx.lineTo(X(gx), h - padB); ctx.stroke();
      ctx.fillText(gx.toFixed(1), X(gx) - 6, h - padB + 14);
    }
    for (let vy = 0; vy <= 6; vy += 2) {
      ctx.beginPath(); ctx.moveTo(padL, Y(vy)); ctx.lineTo(w - padR, Y(vy)); ctx.stroke();
      ctx.fillText(String(vy), 8, Y(vy) + 3);
    }
    // points
    ctx.fillStyle = "rgba(230,237,243,0.55)";
    for (const [g, v] of bifData) {
      if (v > hMax) continue;
      ctx.fillRect(X(g), Y(v), 1, 1);
    }
    // current gamma marker
    ctx.strokeStyle = C.amber; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(X(gamma), padT); ctx.lineTo(X(gamma), h - padB); ctx.stroke();
    ctx.fillStyle = C.amber; ctx.font = "10px ui-monospace, monospace";
    ctx.fillText("Γ=" + gamma.toFixed(2), Math.min(X(gamma) + 4, w - 46), padT + 9);
  }, [bifData, gamma]);
  useEffect(() => { drawBif(); }, [drawBif]);

  const bifClick = (e) => {
    const cv = bifRef.current; const rect = cv.getBoundingClientRect();
    const padL = 38, padR = 8, gMax = 2.0;
    const x = e.clientX - rect.left;
    const g = ((x - padL) / (rect.width - padL - padR)) * gMax;
    setGamma(Math.max(0.002, Math.min(2, g)));
  };

  // ---------- return map ----------
  const rmRef = useRef(null);
  useEffect(() => {
    const cv = rmRef.current; if (!cv) return;
    const { ctx, w, h } = fitCanvas(cv);
    const pad = 30;
    const X = (v) => pad + (v / maxH) * (w - 2 * pad);
    const Y = (v) => h - pad - (v / maxH) * (h - 2 * pad);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = C.grid;
    ctx.strokeRect(pad, pad, w - 2 * pad, h - 2 * pad);
    // diagonal
    ctx.strokeStyle = "#384150"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(maxH), Y(maxH)); ctx.stroke();
    // points
    const hs = live.hs0;
    ctx.fillStyle = C.amber;
    for (let m = 0; m < hs.length - 1; m++) {
      const a = hs[m], b = hs[m + 1];
      if (a > maxH || b > maxH) continue;
      ctx.beginPath(); ctx.arc(X(a), Y(b), 2, 0, 7); ctx.fill();
    }
    ctx.fillStyle = C.muted; ctx.font = "10px ui-monospace, monospace";
    ctx.fillText("H(m)", w - pad - 28, h - 10);
    ctx.save(); ctx.translate(12, pad + 28); ctx.rotate(-Math.PI / 2);
    ctx.fillText("H(m+1)", 0, 0); ctx.restore();
  }, [live, maxH]);

  // ---------- time series ----------
  const tsRef = useRef(null);
  useEffect(() => {
    const cv = tsRef.current; if (!cv) return;
    const { ctx, w, h } = fitCanvas(cv);
    const pad = 22;
    const hs = live.hs0.slice(-90);
    const hi = maxH;
    const X = (i) => pad + (i / Math.max(1, hs.length - 1)) * (w - 2 * pad);
    const Y = (v) => h - pad - (v / hi) * (h - 2 * pad);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = C.grid; ctx.strokeRect(pad, pad, w - 2 * pad, h - 2 * pad);
    ctx.strokeStyle = regime.color; ctx.lineWidth = 1.5; ctx.beginPath();
    hs.forEach((v, i) => { const x = X(i), y = Y(Math.min(v, hi)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    ctx.fillStyle = regime.color;
    hs.forEach((v, i) => { ctx.beginPath(); ctx.arc(X(i), Y(Math.min(v, hi)), 1.6, 0, 7); ctx.fill(); });
    ctx.fillStyle = C.muted; ctx.font = "10px ui-monospace, monospace";
    ctx.fillText("trip m →", w - pad - 44, h - 7);
    ctx.fillText("H", 7, pad + 8);
  }, [live, maxH, regime]);

  // ---------- route animation ----------
  const routeRef = useRef(null);
  const boardRef = useRef(null);
  const simT = useRef(0);
  const rafRef = useRef(0);
  const lastFrame = useRef(0);

  useEffect(() => { simT.current = live.start; }, [live]);

  useEffect(() => {
    const cv = routeRef.current; if (!cv) return;
    let mounted = true;

    const frame = (ts) => {
      if (!mounted) return;
      const dt = lastFrame.current ? (ts - lastFrame.current) / 1000 : 0;
      lastFrame.current = ts;
      if (running && live.ok) {
        simT.current += dt * speed * 0.9;
        if (simT.current > live.end) simT.current = live.start;
      }
      drawRoute();
      rafRef.current = requestAnimationFrame(frame);
    };

    const drawRoute = () => {
      const { ctx, w, h } = fitCanvas(cv);
      ctx.clearRect(0, 0, w, h);
      const padX = 70;
      const oy = h * 0.5;
      const x0 = padX, x1 = w - padX;
      // terminals
      ctx.strokeStyle = C.border; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0, oy); ctx.lineTo(x1, oy); ctx.stroke();
      // dashes
      ctx.strokeStyle = "#2A323D"; ctx.setLineDash([6, 8]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, oy); ctx.lineTo(x1, oy); ctx.stroke(); ctx.setLineDash([]);
      const term = (x, label) => {
        ctx.fillStyle = C.panel2; ctx.strokeStyle = C.border; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, oy, 9, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = C.muted; ctx.font = "11px ui-sans-serif, system-ui";
        ctx.textAlign = "center"; ctx.fillText(label, x, oy - 22); ctx.textAlign = "left";
      };
      term(x0, "ORIGIN"); term(x1, "DESTINATION");

      if (!live.ok) {
        ctx.fillStyle = C.rose; ctx.font = "13px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText("Schedule diverged — lower Γ or raise speedup", w / 2, oy + 40);
        ctx.textAlign = "left";
        return;
      }

      const t = simT.current;
      const board = [];
      for (let b = 0; b < live.perBus.length; b++) {
        const arr = live.perBus[b];
        const m = binSeg(arr, t);
        const seg = arr[m];
        const H = seg.H;
        const load = gamma * H;
        const travel = 1 / (1 + S[b] * H);
        const local = t - seg.t;
        let xf, state, dir = "";
        if (local < load) { xf = 0; state = "Boarding"; }
        else {
          const f = Math.min(1, (local - load) / travel);
          xf = f <= 0.5 ? f * 2 : (1 - f) * 2;
          state = "En route"; dir = f <= 0.5 ? "→" : "←";
        }
        const px = x0 + xf * (x1 - x0);
        // lane offset so buses don't fully overlap
        const lane = oy + (b - (live.perBus.length - 1) / 2) * 16;
        // boarding queue at origin
        if (state === "Boarding") {
          const q = Math.min(10, Math.round(H * 6));
          ctx.fillStyle = "rgba(139,152,168,0.7)";
          for (let k = 0; k < q; k++) ctx.fillRect(x0 - 16 - (k % 5) * 4, lane - 8 + Math.floor(k / 5) * 5, 3, 3);
        }
        // bus glyph
        ctx.fillStyle = BUS[b % BUS.length];
        roundRect(ctx, px - 11, lane - 7, 22, 14, 4); ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(px - 7, lane - 4, 5, 4); ctx.fillRect(px + 1, lane - 4, 5, 4);
        if (state === "Boarding") {
          ctx.strokeStyle = BUS[b % BUS.length]; ctx.lineWidth = 2; ctx.globalAlpha = 0.5;
          ctx.beginPath(); ctx.arc(px, lane, 14, 0, 7 * Math.min(1, local / Math.max(load, 1e-6)));
          ctx.stroke(); ctx.globalAlpha = 1;
        }
        board.push({ b, state, dir, H });
      }
      // update board text via refs (no React re-render)
      if (boardRef.current) {
        const rows = boardRef.current.querySelectorAll("[data-row]");
        board.forEach((r) => {
          const el = rows[r.b]; if (!el) return;
          el.querySelector("[data-state]").textContent = r.state + (r.dir ? " " + r.dir : "");
          el.querySelector("[data-hw]").textContent = r.H.toFixed(3);
        });
      }
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => { mounted = false; cancelAnimationFrame(rafRef.current); lastFrame.current = 0; };
  }, [live, running, speed, gamma, S]);

  // redraw plots on resize
  useEffect(() => {
    const onR = () => { drawBif(); };
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, [drawBif]);

  const applyPreset = (p) => { setGamma(p.g); setS1(p.s1); setS2(p.s2); };

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100%", fontFamily: "ui-sans-serif, system-ui" }}
         className="p-4 sm:p-6">
      {/* header */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <Bus size={20} color={C.amber} />
            <h1 className="text-xl font-bold tracking-tight">Shuttle Bus Chaos</h1>
          </div>
          <p className="text-sm mt-1" style={{ color: C.muted }}>
            Two buses, one route. Loading delay and speedup compete — and the schedule turns chaotic. After Nagatani (2006).
          </p>
        </div>
        <div className="px-3 py-2 rounded-lg flex items-center gap-2"
             style={{ background: C.panel, border: `1px solid ${C.border}` }}>
          <span className="w-2 h-2 rounded-full" style={{ background: regime.color }} />
          <span className="text-sm font-semibold" style={{ color: regime.color }}>{regime.label}</span>
        </div>
      </div>

      {/* presets */}
      <div className="flex gap-2 flex-wrap mb-4">
        {PRESETS.map((p) => {
          const active = Math.abs(p.g - gamma) < 1e-3 && Math.abs(p.s1 - s1) < 1e-3 && Math.abs(p.s2 - s2) < 1e-3;
          return (
            <button key={p.name} onClick={() => applyPreset(p)}
              className="text-xs px-3 py-1.5 rounded-md transition-colors"
              style={{
                background: active ? C.amber : C.panel,
                color: active ? "#0E1116" : C.text,
                border: `1px solid ${active ? C.amber : C.border}`,
                fontWeight: active ? 700 : 500,
              }}>
              {p.name}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* left: controls + board */}
        <div className="lg:col-span-1 space-y-4">
          <Panel title="Configuration">
            <Slider label="Loading parameter  Γ" value={gamma} min={0.002} max={2} step={0.002}
              onChange={setGamma} fmt={(v) => v.toFixed(3)} hint="Passenger demand. Higher = longer stops." />
            <Slider label="Speedup  S₁  (bus 1)" value={s1} min={0} max={0.8} step={0.01}
              onChange={setS1} fmt={(v) => v.toFixed(2)} hint="How hard bus 1 accelerates to recover delay." />
            <Slider label="Speedup  S₂  (bus 2)" value={s2} min={0} max={0.8} step={0.01}
              onChange={setS2} fmt={(v) => v.toFixed(2)} hint="How hard bus 2 accelerates. Asymmetry with S₁ drives the complex motion." />
          </Panel>

          <Panel title="Playback">
            <div className="flex items-center gap-2 mb-3">
              <button onClick={() => setRunning((r) => !r)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold"
                style={{ background: C.amber, color: "#0E1116" }}>
                {running ? <Pause size={15} /> : <Play size={15} />}
                {running ? "Pause" : "Play"}
              </button>
              <button onClick={() => { simT.current = live.start; }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm"
                style={{ background: C.panel2, color: C.text, border: `1px solid ${C.border}` }}>
                <RotateCcw size={14} /> Restart
              </button>
            </div>
            <Slider label="Animation speed" value={speed} min={0.2} max={4} step={0.1}
              onChange={setSpeed} fmt={(v) => v.toFixed(1) + "×"} />
          </Panel>

          <Panel title="Live status">
            <div ref={boardRef} className="space-y-2">
              {Array.from({ length: nBuses }).map((_, b) => (
                <div key={b} data-row className="flex items-center justify-between text-sm"
                     style={{ fontFamily: "ui-monospace, monospace" }}>
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: BUS[b % BUS.length] }} />
                    Bus {b + 1}
                  </span>
                  <span className="flex items-center gap-3">
                    <span data-state style={{ color: C.muted, minWidth: 78, textAlign: "right", display: "inline-block" }}>—</span>
                    <span><span style={{ color: C.muted }}>H </span><span data-hw>—</span></span>
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs mt-3 flex gap-1.5" style={{ color: C.muted }}>
              <Info size={13} className="mt-0.5 shrink-0" />
              {regime.note}
            </p>
          </Panel>
        </div>

        {/* right: route + plots */}
        <div className="lg:col-span-2 space-y-4">
          <Panel title="Route — buses board, drive, and overtake">
            <canvas ref={routeRef} style={{ width: "100%", height: 200, display: "block" }} />
          </Panel>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Panel title="Time headway of bus 1" sub="recent trips">
              <canvas ref={tsRef} style={{ width: "100%", height: 170, display: "block" }} />
            </Panel>
            <Panel title="Return map" sub="H(m+1) vs H(m)">
              <canvas ref={rmRef} style={{ width: "100%", height: 170, display: "block" }} />
            </Panel>
          </div>

          <Panel title="Bifurcation diagram" sub="click to set Γ — headway of bus 1 vs loading parameter">
            <canvas ref={bifRef} onClick={bifClick}
              style={{ width: "100%", height: 220, display: "block", cursor: "crosshair" }} />
          </Panel>
        </div>
      </div>

      <p className="text-xs mt-5" style={{ color: C.muted }}>
        Map: <span style={{ fontFamily: "ui-monospace, monospace", color: C.text }}>
          T(m+1) = T(m) + Γ·H(m) + 1 / (1 + S·H(m))
        </span>. The headway H is the gap to whichever bus reached the origin last — and that order flips whenever a bus overtakes another, which is where the chaos comes from.
      </p>
    </div>
  );
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function Panel({ title, sub, children }) {
  return (
    <div className="rounded-xl p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {sub && <span className="text-xs" style={{ color: C.muted }}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, fmt, hint }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs" style={{ color: C.muted }}>{label}</label>
        <span className="text-xs font-semibold" style={{ fontFamily: "ui-monospace, monospace", color: C.amber }}>
          {fmt(value)}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
        style={{ accentColor: C.amber }} />
      {hint && <p className="text-[11px] mt-1" style={{ color: "#5C6775" }}>{hint}</p>}
    </div>
  );
}
