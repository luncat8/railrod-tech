# Railrod

A small, file-friendly prototype of a dynamic railway economy. The game is being
built in milestones; the current implementation is **0.1.4 — loop trade, profit
rate, reconfigurable build**. The next milestone, 0.1.5, is optimum emergence.

## Run

Open `index.html` directly, or serve this directory with any static HTTP server.
The page has no build step and loads only local scripts and styles.

Use the seed field to restart the deterministic stream, the speed slider to set
simulation time from 0.25× to 8×, and **Pause** to freeze fixed-step updates.
Sources fill their yards, consumers drain them, and every node's prices follow
its stock — hover a node to read its yard and buy/sell quotes.

One train runs one way round the 64 km loop, always in the direction of increasing
x. It stops only where it can trade: it unloads into a consumer that needs its
cargo and has room, or it loads from a source at a positive margin. Nothing else
makes it stop. Each stop brakes into place and dwells for the transfers.

The train has an unbounded money balance, so the number to watch is
**NET / S**: the trade profit per second (an exponential average over 60 s, about
one loop) less the build's capex, amortised over `AMORT_S`. The footer shows
`PROFIT / S`, `CAPEX / S`, `TRAIN SPEED`, and `CARGO loaded/wagons` beside it.

The **build** is set from the footer: `WAGONS` (1–8), `GAUGE` (0.6–4.0 m),
`WHEEL` (0.4–1.6 m), `ENGINE` (20–60 t). Changing a knob takes effect at once:
it re-prices the build from that moment, and the train brakes down if the new
track speed is lower. Telemetry also shows the render rate, simulated seconds,
fixed steps, and sim time discarded after a long frame.

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
node experiments/boot.js
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
dwell is the transfer count over `UNITS_PER_S`, a loaded wagon cannot be removed,
a knob change never moves the train in a step and never leaves it above the new
track speed, and the run is deterministic.
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
amortised build value, and the slider readouts are in metres and tonnes.
`boot.js` boots the page against a stub DOM and drives frames, hover, the
wagons and build sliders, the capex and cargo telemetry, and checks that
click-to-route is gone and the loop trades.

See `0.1.0-plan.md` for the stage design and `deferred-plan.md` for the parked
trading and auto-trader work.
