# Railrod

A small, file-friendly prototype of a dynamic railway economy. The game is being
built in milestones; the current implementation is **0.1.8 — the fixed-length line
and the bench**. The next milestone is tuning the hold economy and the world's
legibility under it.

## Run

Open `index.html` directly, or serve this directory with any static HTTP server.
The page has no build step and loads only local scripts and styles.

Use the seed field to restart the deterministic stream and **Pause** to freeze
fixed-step updates. Sources fill their yards, consumers drain them, and every
node's prices follow its stock — hover a node to read its yard and buy/sell quotes.

The page runs one of two ways, chosen by the **ANIMATE** checkbox in the top strip.

- **Off, the default — MAX.** Every frame steps the sim a flat budget of fixed
  steps, whatever the machine can do, and the canvas is left alone: the world view
  and the hover label stay where they were, and the story is told by the numbers,
  which come in fast. `SIM RATE` reports the rate actually achieved in multiples
  of real time. Nothing is dropped, because nothing is being chased.
- **On — animation.** The clock is driven by the wall clock again at the **SPEED**
  slider's 2×–30×, defaulting to 8×, and the world is drawn every frame. The step
  cap still stops a lagging frame from building a backlog, and `DROPPED SIM TIME`
  says how much sim time that cap threw away.

**LINE** is the third instrument, and the testing one: a fixed length of track
totalled end to end instead of a rate averaged over a window. See below.

**SMOOTHING** sets the window, 5–600 s, that `PROFIT / S` and `NET / S` average
over. `NET / S` also carries a trend: the fast window against a window four times
longer, read as ▲ or ▼ against the slow average, with the sparkline beside it
showing the same flow over the last day of trade. `AVG / S` is the long average
over a fixed ten-minute window, the one the sweep's dots are measured in, so it
can be read straight against the panel.

One train runs one way round the 64 km loop, always in the direction of increasing
x. It stops only where it can trade: it unloads into a consumer that needs its
cargo and has room, or it loads from a source at a positive margin. Nothing else
makes it stop. Each stop brakes into place and dwells for the transfers.

The train has an unbounded money balance, so the number to watch is
**NET / S**: the trade profit per second, averaged over the window you chose, less
the build's capex, amortised over `AMORT_S`. The footer shows `PROFIT / S`,
`CAPEX / S`, `TRAIN SPEED`, and `CARGO loaded/hold` beside it, and the panel's
crosshair uses the same flow averaged over ten minutes instead, so it can be read
against a swept dot.

The panel top right re-runs the whole loop headlessly over a 9 × 9 × 3 grid of
gauge, wheel and engine — every dot is a build *measured in the sim*, net credits
per second against total train mass, the best one ringed and the crosshair your
live line. Each cell is measured over a couple of minutes of trade, so a pass
fills in over tens of seconds and sharpens as the market breathes. The footer's
last two rows read out the ring's value and the cell it marks.

The **build** is set from the footer: `WAGONS` (1–8), `GAUGE` (0.6–4.0 m),
`WHEEL` (0.4–1.6 m), `ENGINE` (20–60 t). Changing a knob takes effect at once:
it re-prices the build from that moment, and the train brakes down if the new
track speed is lower. Telemetry also shows the render rate, simulated seconds,
fixed steps, and sim time discarded after a long frame.

**The gauge carries the cargo.** A wagon holds one unit on 0.6 m track and
`HOLD_MAX` units on 4.0 m, so the consist's hold is `round(wagons · hold(g))`
units and the dwell is that hold out and in again. The hatch grows with the wagon
too, so a bigger wagon turns round in less than its size in extra time — dwell
grows fast with the wagon *count* and slowly with the wagon *size*. Cargo loaded
under a wide gauge stays aboard if the gauge is then narrowed, and simply counts
against the hold while it does.

Touch any build control and its **curve** opens above it: wagons against weight
and load time, gauge against hold and mass, wheel against friction (acceleration
and braking distance) and mass — with a second chart of acceleration against
speed at your wheel and at both extremes — and engine against force and mass,
where the power line `P / V` crosses the adhesion line at the point past which a
bigger engine buys nothing. Every curve is the model the sim runs, sampled from
`Tech` and `Train.accel` against the knob's whole range, with the marker on your
build and its value in the legend.

## The line and the bench

**LINE** turns the world into a test track. A line is a fixed length — `LENGTH`,
1–4 laps of the 64 km ring — run from a standing start at node 0 on a snapshot of
the market, and it ends at the first moment past the finish where the train leaves a
stop with nothing aboard, so no cargo in transit is ever priced as profit or as a
loss. The length is therefore a floor: a 128 km line ends at 174 km on the default
build, because that is where its next clean stop is, and the distance it ran is
reported beside the total.

What the mode shows is a **sum over the whole line**, in the footer rows that
already exist — they keep their places and change their meaning: `LINE NET` (credits
totalled, with the distance run beside it), `LINE TRADE` (the gross), `LINE CAPEX`
(the line's own seconds charged at the build's amortised rate, so a faster line pays
less for the same track), `LINE TIME`, and `BENCH BEST` with its build. The trend
arrow becomes `VS BENCH`: the live line against the best build you put beside it,
and the colour is that verdict. `SMOOTHING` is disabled, because a total has no
window to choose — two runs of one line at a 5 s window and a 600 s window total the
same to the bit.

Move a knob and the line starts over: the number on screen is the new build's within
one measurement, not a blend of the build before and after for as long as a window.
A latched line stays latched while the train runs on past the finish.

The panel in the corner is the **bench**: N lines, 2–8, on one world — same seed,
same stations, same yards at the start, one train each. Row 0 is your build,
measured headlessly, so its total appears within a frame of the slider moving; the
line you watch run is the same computation, and the two are asserted equal to the
bit. `+ ROW` puts the build you are running on the bench, where it survives the next
slider move — that is the comparison with the settings you had. Click a row to run
it: the train takes the whole build, wagon count included. A train that cannot run
the line — the heaviest consist on the smallest engine stalls once loaded — is cut at
a cutoff and priced as the dead weight it is, in red, and the footer's bars are
scaled on the rows that finished clean so it cannot flatten them.

The bench and the swept grid never run in the same frame: LINE mode hands the
headless budget from one to the other, and the corner with it.

## Check

With Node.js installed, run:

```sh
node experiments/harness.js
node experiments/world.js
node experiments/economy.js
node experiments/train.js
node experiments/trade.js
node experiments/mass-balance.js
node experiments/tech.js
node experiments/plots.js
node experiments/line.js
node experiments/boot.js
node experiments/surface.js
```

`harness.js` compares identical seeded state after 30,000 fixed steps at 1× and
8×, then checks the step cap, dropped-time reporting, and seed reset.
`world.js` regenerates 100 seeds and checks the minimum node spacing, generation
determinism, world shape, seamless wrap rendering across the seam, and the node
hit test.
`economy.js` unit-checks the price curves and the economy tick on its own: a full
yard holds the floor price and accounts its overflow, a starved consumer stalls,
a fed consumer drains at its rate, quotes stay inside the spread band, same-node
round trips lose the spread, and stock is conserved.
`train.js` checks the movement rules: the train never reverses, it stops exactly
on a wanted node and passes every other node, a clean approach brakes at the
service rate, a consumer placed inside the braking distance is still reached,
dwell is the hold out and in at the build's transfer rate, a loaded wagon cannot
be dropped,
a knob change never moves the train in a step and never leaves it above the new
track speed, the trip ledger counts forward only and a stop that moves nothing
counts as nothing, a reset takes the build and the wagon count it is given, and the
run is deterministic.
`trade.js` checks the trade rules: the margin decides loading, only consumers
that need a resource price it, unloading needs the recipe and room, cash is the
sum of sequential quotes, a same-node round trip loses the spread, a source never
buys back, the stop rule agrees with the transfer rule on 40 seeded worlds, and
the profit average tracks the measured cash rate over a long window.
`mass-balance.js` runs 20 seeds for 20,000 steps, changes knobs and wagons mid-run,
and checks per resource that `stock + carried + consumed = generated + produced −
overflow`, to 1e-6.
`tech.js` checks the build: the default build is the 0.1.3 consist, each knob
moves the build in its stated direction, knobs are clamped, capex is the
amortised build value, the slider readouts are in metres and tonnes, the gauge
sets the wagon's hold, the hatch grows with it, and dwell follows the count
before the size.
`line.js` is the 0.1.8 instrument: a line covers the length it was asked for and
totals rather than averages it, it ends clean and repeats, it ignores the smoothing
window while the rolling rate does not, a longer line runs longer; the bench holds
one world behind every row, a headless row is an exact replay of the live line field
for field, three trains are three totals and three times, dead weight is priced, a
whole bench leaves the sim bit-identical and spends only its budget, capture fills
and deduplicates and wraps, a clicked row is taken whole, and the mode is a toggle
the seed and the market survive. `--report` prints a bench for a human, `--laps=n`
and `--seeds=n` shrink a run while tuning the cutoffs.
`plots.js` checks the four build curves: they are finite and bounded, they move
in the directions the knob contract states, the engine's power line crosses its
adhesion line on every seed, the marker's value is the one `Tech` and `Train`
give for that build, and a plot is filled rather than rebuilt.
`boot.js` boots the page against a stub DOM, loading the scripts in the order
`index.html` lists them, and drives both run modes — MAX's flat step budget with
no draws against the animated clock's speed range — the smoothing slider, the
trend, LINE mode with its relabelled footer, its bench rows and their controls, a
plot for every build control, hover, the wagons and build sliders, the capex, cargo,
rate and sweep telemetry, and checks that the loop trades.
`surface.js` is the 0.1.5 instrument: it sweeps the grid per seed through
`js/sweep.js` and checks that the measured surface has one interior maximum, that
the largest engine on 4 m gauge loses on every seed, that the loop is still
earning after five simulated hours, that a dot is an exact live replay, that a
pass leaves the sim alone, and that a knob change re-prices capital but never the
market. `--map --seed=n` prints the surface for a human, `--window=s` and
`--seeds=n` shrink a run while tuning.

See `0.1.8-plan.md` for this milestone's design, `archive/0.1.7-plan.md` for the
run modes and build curves, `0.1.0-plan.md` for the stage design, and
`deferred-plan.md` for the parked trading and auto-trader work.
