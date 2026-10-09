# Deferred — trading planner, auto-trader, and parked trip estimate

Parked from `0.1.0-plan.md` when the movement rule was reset to a one-way trade
loop. Nothing in this file is implemented. Read it when a planner or a
richer trading rule is picked up again; the trade core it builds on is the
loop-trade milestone in `archive/0.1.4-plan.md`.

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
bot tactics, and heightmap. Trade-related additions that were parked here:

- sources buying back cargo (a sale at a high-stock source; needs a source-side
  sell rule and a check against same-node round trips);
- fractional wagon fill instead of one whole unit per wagon (open question 3 in
  `0.1.0-plan.md`);
- payback as a soft win line (open question 2 in `0.1.0-plan.md`).
