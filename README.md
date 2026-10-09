# Railrod

A small, file-friendly prototype of a dynamic railway economy. The game is being
built in milestones; the current implementation is **0.1.0 — simulation
harness**. The next milestone adds the seeded ring world.

## Run

Open `index.html` directly, or serve this directory with any static HTTP server.
The page has no build step and loads only local scripts and styles.

Use the seed field to restart the deterministic stream, the speed slider to set
simulation time from 0.25× to 8×, and **Pause** to freeze fixed-step updates.
Telemetry shows the render rate, simulated seconds, fixed steps, and sim time
discarded after a long frame.

## Check

With Node.js installed, run:

```sh
node experiments/harness.js
```

The experiment compares identical seeded state after 30,000 fixed steps at 1×
and 8×, then checks the step cap, dropped-time reporting, and seed reset.

See `0.1.0-plan.md` for the stage design and deferred milestones.
