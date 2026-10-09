# Deferred — trading planner, auto-trader, and parked trip estimate

Parked from `0.1.0-plan.md` when the movement rule was reset to a one-way trade
loop. The planner and richer trading rules in this file are not implemented. Read
it when that work is picked up again; the trade core it builds on is the loop-trade
milestone in `archive/0.1.4-plan.md`. The terrain profile now drives grade-aware
movement in 0.2.1; route planning and pathfinding remain deferred.

## 1. Parked milestone: trading and profit (original 0.1.4)

Original goal: load and unload against the price curves, cash, profit per
second, transfer-driven dwell, capex on route length, and a mass-balance check.

Scope that was planned:

- `DWELL` transfers at `UNITS_PER_S` (default 2) across the whole train. Loaded
  wagons unload and empty wagons load concurrently, with transactions applied in
  wagon-index order; dwell ends when all possible transfers are complete. Empty
  origin stock or a full destination yard does not hold the train forever; cargo
  that cannot unload stays aboard for the next stop.
- Transfers are unit-by-unit in wagon-index order. Quote the midpoint price for
  the stock interval crossed, mutate stock, then quote the next unit. A purchase
  requires at least one unit in stock; a sale requires one unit of free
  capacity. Never apply one stale bulk quote to several wagons.
- Delivery is paid per unit at the moment of unloading, at `sell(i,r,s)`.
  Sources could also buy back; their high stock usually makes that a poor sale.
- Cash and profit per second: an EMA over a 10 s window, shown in the HUD.
- Capex on route length only: `length(A,B) * track/km(g)` plus wagons and loco,
  charged on commit; downgrades do not refund sunk cost. (The loop-trade
  milestone replaces this with an amortised rate, because money is unbounded.)
- Checks that were planned: mass balance
  `initial stock + produced == current stock + train cargo + consumed + overflow`;
  same-node round trips lose the spread; a fixed source-to-consumer route earns
  steady positive profit per second, bounded by production, demand, storage,
  and transfer rate.

The mass-balance identity and the transfer rules survive into the active
milestone. The buy-back at sources and the per-trip capex charge do not.

## 2. Parked milestone: auto-trader (original 0.1.5)

The planner replaces "the other waypoint" with a scored choice. The manual
shuttle was to be the same code path with a forced destination, so there was
exactly one trader implementation. If no feasible positive-margin cargo exists,
the train waits at the current node rather than making an empty, loss-making
trip.

Original spec:

Runs at the end of `DWELL`; with at most 8 wagons, scoring is
O(NODE_N * RES * W) with a small fixed bound. Reuse scratch storage.

For each candidate destination, first score carried cargo that can be unloaded
there (its purchase cost is already sunk), then greedily fill empty wagons with
the best feasible positive-margin resource. For each hypothetical new unit,
quote the current origin buy and destination sell over their one-unit stock
intervals, then account for both stock changes before scoring another wagon.
Respect origin stock and destination capacity. Score expected proceeds over
`trip time + load and unload time`, where transfer time is
`(units_loaded + units_to_unload) / UNITS_PER_S`. This keeps score in credits per
sim second and penalizes routes that need many slow transfers. Cargo that does
not fit remains aboard; skip a destination only when it cannot receive any
carried cargo and no positive-margin load is feasible.

- Sources can be destinations and consumers can be origins; the score decides,
  no kind-based pruning (it would just hide bugs).
- Prices are read at plan time and assumed otherwise static during the trip.
  This is a deliberate, measurable naive-planner bias.
- Hysteresis: keep the current plan unless a candidate beats it by 10%; lock
  the chosen destination until arrival. This prevents near-equal nodes from
  burning dwell time in oscillation.

Original checks: auto ≥ manual profit per second on 20 seeds (the bot must not
lose to the fixed pair it was built from); zero oscillation — no destination
change within 2 s of the last one.

Risk noted at the time: bot thrash between near-equal nodes — mitigated by 10%
hysteresis and a plan locked during a trip.

## 3. Parked code: closed-form trip estimate (0.1.3)

The planner needs a trip time before departure. Integrating per call is banned,
so the acceleration ODE was integrated once per build change into three numbers
`profile{T, S, v}`, and the closed form was evaluated per candidate. Measured
error: 2.53% worst case over `W ∈ [1,8]`, `L ∈ [0.5, 30]` km; 2.27% over 6,000
arrivals in a 200-seed sweep.

This code was removed from the runtime when the movement rule became a
stop-on-trade loop with braking, which has no fixed leg to estimate. It is kept
here, verbatim from the 0.1.3 `js/train.js`, to restore if a planner returns:

```js
// the accel ODE integrated once per build change, never per planning call
Train.refreshProfile = function (train) {
	var profile = train.profile;
	var dt = C.PROFILE_DT;
	var steps = Math.ceil(C.PROFILE_MAX_S / dt);
	var v = 0;
	var t = 0;
	var s = 0;
	var i;
	var a;
	var next;

	train.mass = Train.mass(train);
	for (i = 0; i < steps && v < build.vTrack; i += 1) {
		a = Train.accel(train, v);
		if (a <= 0) break;
		next = Math.min(build.vTrack, v + a * dt);
		s += 0.5 * (v + next) * dt;
		v = next;
		t += dt;
	}
	profile.T = t;
	profile.S = s;
	profile.v = v;
};

// closed form over the profile: exact at the junction, asymptotically exact
Train.estimateTrip = function (train, km) {
	var profile = train.profile;

	if (km <= 0) return 0;
	if (profile.v <= 0) return Infinity;
	if (km <= profile.S) return profile.T * Math.sqrt(km / profile.S);
	return profile.T + (km - profile.S) / profile.v;
};
```

Note: the snippet above reads `build` as a module global, which the loop-trade
milestone removed in favour of `train.build`. Restore it per train.

Sub-step arrival capture, from the same code: solve `km = v0*t + a*t²/2` for the
sub-step hit time and add that instead of a whole `DT`. Keep it if a planner
compares measured and planned times again.

## 4. Deferred features that touch trading

These remain in `0.1.0-plan.md` under "Deferred (0.2+)": torque realism, fuel
(the train buys its own fuel through the node price model), competitor trains,
bot tactics, and pathfinding over the rendered heightmap. Single-route grade
resistance is implemented; route planning is not. Trade-related additions that
were parked here:

- sources buying back cargo (a sale at a high-stock source; needs a source-side
  sell rule and a check against same-node round trips);
- fractional wagon fill instead of one whole unit per wagon (open question 3 in
  `0.1.0-plan.md`);
- payback as a soft win line (open question 2 in `0.1.0-plan.md`).

## 5. Parked from `e8c73a0c`: more than one train on the ring

`e8c73a0c` was a partial multi-line implementation — N lines in `sim.lines`, each
with its own train, its own knob array and its own copy of the world, all stepped
live in one frame and drawn in five colours, with the camera, the telemetry and the
sliders bound to `sim.activeLine`. 0.1.8 replaced it with the headless bench, which
is the better instrument: it ends a line on a clean trade cycle instead of on a raw
distance, charges capex against the line's own seconds, runs on the sweep's frame
budget instead of multiplying the live sim by N, and cuts a consist that cannot
move instead of letting it run forever. Nothing of it was ported.

Two shapes in it belong to the competitor-trains milestone and are kept here so
they are not reinvented:

- **The render side of several trains.** `LINE_COLORS` / `LINE_COLORS_DIM`, a
  `drawTrains` that walks `sim.trains` and draws the active one last so it sits on
  top, and the camera following `sim.trains[sim.activeLine]` rather than index 0.
  With one train it is dead code, which is why it is here and not in `render.js`.
- **Per-line knob arrays with the sliders aliasing the active line.**
  `sim.trainKnobs[i]` / `sim.trainWagons[i]`, and `sim.knobs = sim.trainKnobs[active]`
  after a switch, so the footer edits whichever line is selected. The bench already
  holds the same thing as `bench.knobs[slot]`, so this is only needed once the
  second train is live rather than headless.

Independence, for reference: both designs give every line the same market and no
cross-talk. `e8c73a0c` does it with a world copy per line; the bench does it by
restoring one fixture per row. Copy per line is the right shape once the lines run
at the same time and can touch the same yards.
