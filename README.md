# Railrod

A small, file-friendly prototype of a dynamic railway economy. The game is being
built in milestones; the current implementation is **0.1.3 — train kinematics**.
The next milestone adds trading and profit.

## Run

Open `index.html` directly, or serve this directory with any static HTTP server.
The page has no build step and loads only local scripts and styles.

Use the seed field to restart the deterministic stream, the speed slider to set
simulation time from 0.25× to 8×, and **Pause** to freeze fixed-step updates.
Sources fill their yards, consumers drain them, and every node's prices follow
its stock — hover a node to read its yard and buy/sell quotes.

**Click any node** and the consist runs there, then shuttles between it and
where it came from; clicking the node the train stands on parks it. The wagons
slider adds wagons: mass, not the engine, sets how fast it leaves a station, so
a long consist crawls and the trip telemetry stretches. `TRIP` reads
`measured / planned` seconds — the plan is a closed form computed before
departure from the force model, the measurement is what the sim actually did.
Telemetry also shows the render rate, simulated seconds, fixed steps, and sim
time discarded after a long frame.

## Check

With Node.js installed, run:

```sh
node experiments/harness.js
node experiments/world.js
node experiments/economy.js
node experiments/train.js
node experiments/boot.js
```

`harness.js` compares identical seeded state after 30,000 fixed steps at 1× and
8×, then checks the step cap, dropped-time reporting, and seed reset.
`world.js` regenerates 100 seeds and checks the minimum node spacing, generation
determinism, world shape, seamless wrap rendering across the seam, and the node
hit test.
`economy.js` unit-checks the price curves and tick: a full yard holds the floor
price and accounts its overflow, a starved consumer stalls, a fed consumer drains
at its rate, quotes stay inside the spread band, same-node round trips lose the
spread, and stock is conserved.
`train.js` unit-checks the consist: mass model, a wagon sweep that must slow the
trip monotonically (doubling it lengthens the trip by ~37%), the closed-form
trip estimate against measured trips (worst error ~2.5%, budget 10%), the
CRUISE/DWELL state machine and shuttle, seam-crossing legs, the speed cap, and
determinism.
`boot.js` boots the page against a stub DOM and drives frames, hover, click
routing, and the wagons and speed controls headlessly.

See `0.1.0-plan.md` for the stage design and deferred milestones.
