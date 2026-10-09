# Railrod

A small, file-friendly prototype of a dynamic railway economy. The game is being
built in milestones; the current implementation is **0.1.1 — ring world**. The
next milestone adds the ticking economy.

## Run

Open `index.html` directly, or serve this directory with any static HTTP server.
The page has no build step and loads only local scripts and styles.

Use the seed field to restart the deterministic stream, the speed slider to set
simulation time from 0.25× to 8×, and **Pause** to freeze fixed-step updates.
The camera follows the placeholder train around the seeded ring; telemetry shows
the render rate, simulated seconds, fixed steps, and sim time discarded after a
long frame.

## Check

With Node.js installed, run:

```sh
node experiments/harness.js
node experiments/world.js
```

`harness.js` compares identical seeded state after 30,000 fixed steps at 1× and
8×, then checks the step cap, dropped-time reporting, and seed reset.
`world.js` regenerates 100 seeds and checks the minimum node spacing, generation
determinism, world shape, and seamless wrap rendering across the seam.

See `0.1.0-plan.md` for the stage design and deferred milestones.
