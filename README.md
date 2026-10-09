# Railrod

A small, file-friendly prototype of a dynamic railway economy. The game is being
built in milestones; the current implementation is **0.1.2 — ticking economy**.
The next milestone adds train kinematics.

## Run

Open `index.html` directly, or serve this directory with any static HTTP server.
The page has no build step and loads only local scripts and styles.

Use the seed field to restart the deterministic stream, the speed slider to set
simulation time from 0.25× to 8×, and **Pause** to freeze fixed-step updates.
Sources fill their yards, consumers drain them, and every node's prices follow
its stock — hover a node to read its yard and buy/sell quotes. The camera
follows the placeholder train around the seeded ring; telemetry shows the
render rate, simulated seconds, fixed steps, and sim time discarded after a
long frame.

## Check

With Node.js installed, run:

```sh
node experiments/harness.js
node experiments/world.js
node experiments/economy.js
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
`boot.js` boots the page against a stub DOM and drives frames, hover, and
controls headlessly.

See `0.1.0-plan.md` for the stage design and deferred milestones.
