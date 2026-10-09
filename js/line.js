(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});
	var C = RR.Const;
	var World = RR.World;
	var Economy = RR.Economy;
	var Tech = RR.Tech;
	var Train = RR.Train;
	var Line = RR.Line || {};

	// A line is a fixed length of track, run from a standing start at node 0 and totalled
	// instead of averaged: the trade the whole line earned, the seconds it took, and the
	// capex those seconds cost. Two builds measured over the same line on the same market
	// are then two totals of the same kind, which two windows of a rolling average are not.
	//
	// A line ends at the first moment the train leaves a stop empty past the finish, the
	// distance version of the rule a swept dot is measured by: cargo still aboard is worth
	// something at a price the line has not realised, so a line that stops mid-lap would
	// be a windfall or a loss depending on the build that happened to be running.
	//
	// The bench is N of those lines on one world: same seed, same stations, same yards at
	// the start, one train each. Slot 0 always carries the player's own build, so the row
	// they are looking at is measured headlessly within a frame of the slider moving, and
	// the line they watch run is the same computation — the experiment asserts they agree
	// to the bit.

	Line.createMeter = function () {
		return {
			targetKm: C.LINE_LAPS_DEFAULT * C.RING_KM,
			time: 0,
			// seconds under way. a line that had to run further to finish clean is slower
			// in seconds and not in speed, and the pace is the claim about the build
			move: 0,
			armed: false,     // the finish is behind the train; the next clean stop ends it
			cycle0: 0,        // trade cycles closed at the finish crossing, taken there
			done: false,
			cut: false,       // ended at a cutoff, not at a clean stop past the finish
			gross: 0,
			capex: 0,
			net: 0,
			seconds: 0,
			km: 0,
			stops: 0,
			units: 0
		};
	};

	Line.setTarget = function (meter, laps) {
		meter.targetKm = laps * C.RING_KM;
	};

	// A line starts from a zeroed ledger: Train.reset parks the train at node 0 and trades
	// there, so the load it lifts off the fixture is paid for inside the line, not before
	// it. That is what makes the total the line's own and not the previous build's.
	Line.begin = function (meter) {
		meter.time = 0;
		meter.move = 0;
		meter.armed = false;
		meter.done = false;
		meter.cut = false;
	};

	// one step of a running line; true in the step the line ends
	Line.observe = function (meter, train, dt) {
		var complete;

		meter.time += dt;
		if (train.state !== Train.DWELL) meter.move += dt;
		if (!meter.armed && train.km >= meter.targetKm) {
			// the cycle count is taken at the finish, not at the start: a stop the train
			// left empty before it would end the line with the rest of its cargo aboard
			meter.armed = true;
			meter.cycle0 = train.cycle;
		}
		complete = meter.armed && train.cycle > meter.cycle0;
		if (!complete && train.km < C.LINE_CUTOFF_KM && meter.time < C.LINE_CUTOFF_S) return false;
		latch(meter, train, !complete);
		return true;
	};

	function latch(meter, train, cut) {
		meter.gross = train.cash;
		meter.capex = train.capexRate * meter.time;
		meter.net = meter.gross - meter.capex;
		meter.seconds = meter.time;
		meter.km = train.km;
		meter.stops = train.stops;
		meter.units = train.units;
		meter.cut = cut;
		meter.done = true;
	};

	// the totals as they stand: latched once the line is over, running while it is not. one
	// read for the HUD, so a latched line never drifts with the train that runs past it
	Line.net = function (meter, train) {
		return meter.done ? meter.net : train.cash - train.capexRate * meter.time;
	};

	Line.gross = function (meter, train) {
		return meter.done ? meter.gross : train.cash;
	};

	Line.capex = function (meter, train) {
		return meter.done ? meter.capex : train.capexRate * meter.time;
	};

	Line.seconds = function (meter) {
		return meter.done ? meter.seconds : meter.time;
	};

	// km per second under way: the build's own pace, with the stops and the distance the
	// market made the line run taken back out of it
	Line.speed = function (meter, train) {
		return meter.move > 0 ? Line.km(meter, train) / meter.move : 0;
	};

	// and the seconds it stood at a stop, which is the other half of the line's clock
	Line.dwell = function (meter) {
		return meter.time - meter.move;
	};

	Line.km = function (meter, train) {
		return meter.done ? meter.km : train.km;
	};

	// ---- the bench ----

	Line.create = function () {
		var bench = {
			// the market every row starts from, and the world one row at a time runs in
			fixture: World.blank(C.NODE_N),
			world: World.blank(C.NODE_N),
			train: Train.create(Tech.derive(Tech.defaultKnobs()), C.WAGON_DEFAULT),
			meter: Line.createMeter(),
			knobs: [],
			wagons: new Int8Array(C.LINE_SLOT_MAX),
			used: new Uint8Array(C.LINE_SLOT_MAX),
			queued: new Uint8Array(C.LINE_SLOT_MAX),
			cut: new Uint8Array(C.LINE_SLOT_MAX),
			move: new Float64Array(C.LINE_SLOT_MAX),
			gross: new Float64Array(C.LINE_SLOT_MAX),
			capex: new Float64Array(C.LINE_SLOT_MAX),
			net: new Float64Array(C.LINE_SLOT_MAX),
			seconds: new Float64Array(C.LINE_SLOT_MAX),
			km: new Float64Array(C.LINE_SLOT_MAX),
			stops: new Float64Array(C.LINE_SLOT_MAX),
			units: new Float64Array(C.LINE_SLOT_MAX),
			slots: C.LINE_SLOT_DEFAULT,
			laps: C.LINE_LAPS_DEFAULT,
			scan: 0,
			cursor: -1,
			running: false,
			captured: 0,
			measured: 0,
			best: -1,
			bestCaptured: -1,
			seed: 0
		};
		var i;

		for (i = 0; i < C.LINE_SLOT_MAX; i += 1) bench.knobs.push(Tech.defaultKnobs());
		Line.setTarget(bench.meter, bench.laps);
		Line.setSlot(bench, 0, Tech.defaultKnobs(), C.WAGON_DEFAULT);
		return bench;
	};

	// rows the bench has a fresh number for, and the two worth naming: the best row, and the
	// best captured one — the live row mirrors the player's build, so the comparison the
	// footer reads is against the builds they put beside it. recomputed, never counted
	function recount(bench) {
		var measured = 0;
		var best = -1;
		var bestCaptured = -1;
		var i;

		for (i = 0; i < bench.slots; i += 1) {
			if (!bench.used[i] || bench.queued[i]) continue;
			measured += 1;
			if (best < 0 || bench.net[i] > bench.net[best]) best = i;
			if (i > 0 && (bestCaptured < 0 || bench.net[i] > bench.net[bestCaptured])) bestCaptured = i;
		}
		bench.measured = measured;
		bench.best = best;
		bench.bestCaptured = bestCaptured;
	}

	Line.setSlot = function (bench, slot, knobs, wagons) {
		var dst = bench.knobs[slot];
		var i;

		for (i = 0; i < Tech.KNOB_N; i += 1) dst[i] = Tech.clampKnob(knobs[i]);
		bench.wagons[slot] = Math.max(C.WAGON_MIN, Math.min(C.WAGON_MAX, Math.round(wagons)));
		bench.used[slot] = 1;
		bench.queued[slot] = 1;
		// a row whose build moved mid-run is no row at all: start it again
		if (bench.cursor === slot) {
			bench.cursor = -1;
			bench.running = false;
		}
		recount(bench);
	};

	Line.rowsUsed = function (bench) {
		var rows = 0;
		var i;

		for (i = 0; i < bench.slots; i += 1) if (bench.used[i]) rows += 1;
		return rows;
	};

	// the build the player is running becomes a row of its own, and the live line starts
	// over: the total on screen is the new build's, not the one before the slider moved
	Line.liveChanged = function (bench, sim) {
		Line.setSlot(bench, 0, sim.knobs, sim.trains[0].wagons);
		Line.restartLive(bench, sim);
	};

	// the fixture is the market as it stands when the bench is armed: every row and every
	// live line starts from it, so a comparison is between builds and never between two
	// weathers
	Line.arm = function (bench, sim) {
		var i;

		World.copyInto(bench.fixture, sim.world);
		bench.seed = sim.seed;
		bench.scan = 0;
		bench.cursor = -1;
		bench.running = false;
		for (i = 0; i < bench.slots; i += 1) bench.queued[i] = bench.used[i] ? 1 : 0;
		Line.liveChanged(bench, sim);
	};

	// a new length is a new line: every row is measured again. the caller restarts the live
	// run, since only the page knows whether there is one
	Line.setLaps = function (bench, laps) {
		var i;

		bench.laps = Math.max(C.LINE_LAPS_MIN, Math.min(C.LINE_LAPS_MAX, Math.round(laps)));
		Line.setTarget(bench.meter, bench.laps);
		for (i = 0; i < bench.slots; i += 1) if (bench.used[i]) bench.queued[i] = 1;
		bench.cursor = -1;
		bench.running = false;
		recount(bench);
	};

	// rows past the count keep their builds: shrinking the bench hides them, growing it
	// shows them again and measures them on the fixture it is holding
	Line.setSlots = function (bench, count) {
		var i;

		bench.slots = Math.max(C.LINE_SLOT_MIN, Math.min(C.LINE_SLOT_MAX, Math.round(count)));
		for (i = 0; i < bench.slots; i += 1) if (bench.used[i]) bench.queued[i] = 1;
		bench.cursor = -1;
		bench.running = false;
		recount(bench);
	};

	// the lowest empty row, or the captured one the bench has held longest
	function freeSlot(bench) {
		var i;

		for (i = 1; i < bench.slots; i += 1) {
			if (!bench.used[i]) return i;
		}
		bench.captured = bench.captured % (bench.slots - 1);
		bench.captured += 1;
		return bench.captured;
	}

	// a row already holding this build is reused, so the bench fills with trains and not
	// with the same train again
	function slotForBuild(bench, knobs, wagons) {
		var i;
		var k;

		for (i = 1; i < bench.slots; i += 1) {
			if (!bench.used[i] || bench.wagons[i] !== wagons) continue;
			for (k = 0; k < Tech.KNOB_N; k += 1) {
				if (bench.knobs[i][k] !== knobs[k]) break;
			}
			if (k === Tech.KNOB_N) return i;
		}
		return -1;
	}

	Line.capture = function (bench, sim) {
		var train = sim.trains[0];
		var slot = slotForBuild(bench, sim.knobs, train.wagons);

		if (slot < 0) slot = freeSlot(bench);
		Line.setSlot(bench, slot, sim.knobs, train.wagons);
		return slot;
	};

	// a row becomes the live build. the train takes it while it is empty, at the start of a
	// new line, so the row's wagon count is the one measured and not one clamped by cargo
	Line.applySlot = function (bench, sim, slot) {
		var i;

		if (slot < 1 || slot >= bench.slots || !bench.used[slot]) return false;
		for (i = 0; i < Tech.KNOB_N; i += 1) RR.Sim.setKnob(sim, i, bench.knobs[slot][i]);
		Line.restartLive(bench, sim, bench.knobs[slot], bench.wagons[slot]);
		Line.setSlot(bench, 0, sim.knobs, sim.trains[0].wagons);
		return true;
	};

	// the live line starts over from the fixture. a build given here is taken while the
	// consist is empty, so a row's wagon count survives the move
	Line.restartLive = function (bench, sim, knobs, wagons) {
		var train = sim.trains[0];

		World.copyInto(sim.world, bench.fixture);
		Train.reset(train, sim.world, knobs ? Tech.derive(knobs) : null, wagons || 0);
		// anchor re-prices the capital too, so the build a row carries is the one charged
		RR.Sim.anchor(sim);
		// the live line is the bench's length: taken here, so the two cannot drift apart
		Line.setTarget(sim.line, bench.laps);
		Line.begin(sim.line);
	};

	// LINE mode turns the world into a test track. the sweep hands its corner over to the
	// bench: both are measurements, and the bench is the one this mode asks for
	Line.enable = function (bench, sim) {
		sim.lineOn = true;
		Line.arm(bench, sim);
	};

	Line.disable = function (bench, sim) {
		sim.lineOn = false;
		RR.Sim.anchor(sim);
	};

	// round robin, so a slider being dragged cannot starve the rows behind the live one
	function nextQueued(bench) {
		var i;
		var slot;

		for (i = 1; i <= bench.slots; i += 1) {
			slot = (bench.scan + i) % bench.slots;
			if (!bench.used[slot] || !bench.queued[slot]) continue;
			bench.scan = slot;
			return slot;
		}
		return -1;
	}

	// one row: the fixture's market, the row's build, a train parked at node 0
	function startTrial(bench, slot) {
		World.copyInto(bench.world, bench.fixture);
		Train.reset(bench.train, bench.world, Tech.derive(bench.knobs[slot]), bench.wagons[slot]);
		Line.setTarget(bench.meter, bench.laps);
		Line.begin(bench.meter);
		bench.cursor = slot;
		bench.running = true;
	}

	// the trade loop without the readouts: the same one the sweep runs, over a distance
	function trialStep(bench) {
		Economy.tick(bench.world, C.DT);
		Train.step(bench.train, bench.world, C.DT);
	}

	function record(bench) {
		var slot = bench.cursor;
		var meter = bench.meter;

		bench.gross[slot] = meter.gross;
		bench.capex[slot] = meter.capex;
		bench.net[slot] = meter.net;
		bench.seconds[slot] = meter.seconds;
		bench.km[slot] = meter.km;
		bench.move[slot] = meter.move;
		bench.stops[slot] = meter.stops;
		bench.units[slot] = meter.units;
		bench.cut[slot] = meter.cut ? 1 : 0;
		bench.queued[slot] = 0;
		bench.cursor = -1;
		bench.running = false;
		recount(bench);
	}

	// run the bench on a frame budget; returns the steps used, 0 when every row is measured
	Line.step = function (bench, budgetSteps) {
		var steps = 0;
		var slot;

		while (steps < budgetSteps) {
			if (!bench.running) {
				slot = nextQueued(bench);
				if (slot < 0) break;
				startTrial(bench, slot);
			}
			trialStep(bench);
			steps += 1;
			if (!Line.observe(bench.meter, bench.train, C.DT)) continue;
			record(bench);
		}
		return steps;
	};

	// run every queued row out, for a caller with no frame budget to respect
	Line.run = function (bench) {
		return Line.step(bench, C.LINE_SLOT_MAX * (Math.round(C.LINE_CUTOFF_S / C.DT) + 8));
	};

	RR.Line = Line;

	if (typeof module !== "undefined" && module.exports) module.exports = Line;
})(globalThis);
